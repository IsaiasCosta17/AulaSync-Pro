import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  ItemStatus,
  JobStatus,
  type GoogleDriveAccount,
  type Playlist,
  type UploadItem,
  type UploadJob,
  type YoutubeChannel,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import { decryptJson, encryptJson } from "@/lib/crypto";
import { driveClient, youtubeAuth, youtubeClient } from "@/lib/google";
import {
  friendlyGoogleError,
  isRetryableGoogleError,
  uploadVideoResumable,
} from "@/lib/resumable-upload";
import { getAppSettings } from "@/lib/settings";

const workers = new Set<string>();
const sourceLocks = new Map<string, Promise<void>>();
const retryTimers = new Map<string, ReturnType<typeof setTimeout>>();
const activeUploadItemsByChannel = new Map<string, Set<string>>();
const activeUploadItemsByDriveAccount = new Map<string, Set<string>>();
const activeUploadItemsGlobal = new Set<string>();
const uploadSlotWaiters: Array<() => void> = [];
const googleOperationBlockedUntil = new Map<string, number>();
let googleOperationQueue = Promise.resolve();
let nextGoogleOperationAt = 0;
const concurrencyStateByChannel = new Map<string, {
  penalty: number;
  recentTemporaryFailures: number[];
  restoreTimer: ReturnType<typeof setTimeout> | null;
  lastSuccessfulUploadAt: number;
  hydrated: boolean;
}>();
let lastRecoveryScan = 0;
const workerOwnerId = randomUUID();
const CHANNEL_DAILY_COOLDOWN_MS = 24 * 60 * 60 * 1000;

type JobContext = UploadJob & {
  driveAccount: GoogleDriveAccount;
  channel: YoutubeChannel;
};

async function ensureLeaseSchema() {
  // O schema e criado pelo Prisma durante a implantacao.
}

async function backgroundWorkerIsHealthy() {
  if (process.env.AULASYNC_WORKER_PROCESS === "1") return false;
  try {
    const heartbeatPath = path.join(process.cwd(), ".runtime", "worker-heartbeat");
    const value = Number((await readFile(heartbeatPath, "utf8")).trim());
    return Number.isFinite(value) && Date.now() - value < 30_000;
  } catch {
    return false;
  }
}

async function acquireJobLease(jobId: string) {
  await ensureLeaseSchema();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 120_000);

  await prisma.uploadJobLease.deleteMany({
    where: { expiresAt: { lte: now } },
  });

  try {
    await prisma.uploadJobLease.create({
      data: { jobId, ownerId: workerOwnerId, expiresAt },
    });
  } catch {
    // Outra instancia pode ter adquirido a tarefa no mesmo instante.
  }

  const renewed = await prisma.uploadJobLease.updateMany({
    where: { jobId, ownerId: workerOwnerId },
    data: { expiresAt },
  });
  if (renewed.count > 0) return true;

  const lease = await prisma.uploadJobLease.findUnique({
    where: { jobId },
    select: { ownerId: true },
  });
  return lease?.ownerId === workerOwnerId;
}

async function renewJobLease(jobId: string) {
  await prisma.uploadJobLease.updateMany({
    where: { jobId, ownerId: workerOwnerId },
    data: { expiresAt: new Date(Date.now() + 120_000) },
  });
}

async function releaseJobLease(jobId: string) {
  await prisma.uploadJobLease.deleteMany({
    where: { jobId, ownerId: workerOwnerId },
  });
}

function scheduleUploadJob(jobId: string, delayMs: number) {
  const previous = retryTimers.get(jobId);
  if (previous) clearTimeout(previous);
  const timer = setTimeout(() => {
    retryTimers.delete(jobId);
    if (workers.has(jobId)) {
      scheduleUploadJob(jobId, 1000);
      return;
    }
    void runUploadJob(jobId);
  }, Math.max(1000, Math.min(delayMs, 24 * 60 * 60 * 1000)));
  retryTimers.set(jobId, timer);
}

async function settingsForJob(jobId: string, fresh = false) {
  const job = await prisma.uploadJob.findUnique({ where: { id: jobId } });
  return getAppSettings((job as { userId?: string } | null)?.userId || "global", { fresh });
}

async function automaticRetryDelay(jobId: string, dailyQuota = false) {
  const settings = await settingsForJob(jobId);
  if (dailyQuota) return CHANNEL_DAILY_COOLDOWN_MS;
  const attempts = await prisma.log.count({
    where: {
      jobId,
      level: "retry",
      createdAt: { gte: new Date(Date.now() - 60 * 60_000) },
    },
  });
  const baseDelay = Math.min(
    15 * 60_000,
    settings.temporaryRetrySeconds * 1000 * 2 ** Math.min(attempts, 6),
  );
  const jitter = Math.floor(Math.random() * Math.min(60_000, Math.max(1000, baseDelay / 5)));
  return baseDelay + jitter;
}

function formatRetryDelay(delayMs: number) {
  if (delayMs >= 60_000) return `${Math.ceil(delayMs / 60_000)} minuto(s)`;
  return `${Math.ceil(delayMs / 1000)} segundo(s)`;
}

async function armAutomaticRetry(
  jobId: string,
  itemTitle: string,
  message: string,
  delayMs: number,
) {
  const nextRetryAt = new Date(Date.now() + delayMs);
  await prisma.uploadJob.update({
    where: { id: jobId },
    data: { nextRetryAt },
  }).catch(() => undefined);
  await log(
    jobId,
    "retry",
    `${itemTitle}: retomada automática em ${formatRetryDelay(delayMs)}.`,
    { delayMs, message, nextRetryAt: nextRetryAt.toISOString() },
  ).catch(() => undefined);
  scheduleUploadJob(jobId, delayMs);
}

function concurrencyState(channelId: string) {
  const existing = concurrencyStateByChannel.get(channelId);
  if (existing) return existing;
  const created = {
    penalty: 0,
    recentTemporaryFailures: [] as number[],
    restoreTimer: null as ReturnType<typeof setTimeout> | null,
    lastSuccessfulUploadAt: 0,
    hydrated: false,
  };
  concurrencyStateByChannel.set(channelId, created);
  return created;
}

function activeItemsForChannel(channelId: string) {
  const existing = activeUploadItemsByChannel.get(channelId);
  if (existing) return existing;
  const created = new Set<string>();
  activeUploadItemsByChannel.set(channelId, created);
  return created;
}

function activeItemsForDriveAccount(driveAccountId: string) {
  const existing = activeUploadItemsByDriveAccount.get(driveAccountId);
  if (existing) return existing;
  const created = new Set<string>();
  activeUploadItemsByDriveAccount.set(driveAccountId, created);
  return created;
}

function wakeUploadWaiters() {
  for (const wake of uploadSlotWaiters.splice(0)) wake();
}

async function persistConcurrencyLimit(channelId: string, limit: number | null) {
  await prisma.youtubeChannel.updateMany({
    where: { id: channelId },
    data: { adaptiveConcurrencyLimit: limit },
  }).catch(() => undefined);
}

async function effectiveConcurrency(jobId: string, channelId: string) {
  const settings = await settingsForJob(jobId);
  const state = concurrencyState(channelId);

  if (!settings.adaptiveConcurrencyEnabled) {
    state.penalty = 0;
    state.hydrated = true;
    await persistConcurrencyLimit(channelId, null);
    return { settings, limit: settings.maxConcurrentUploads };
  }

  if (!state.hydrated) {
    const [channel, recentRetries] = await Promise.all([
      prisma.youtubeChannel.findUnique({
        where: { id: channelId },
        select: { adaptiveConcurrencyLimit: true },
      }),
      prisma.log.count({
        where: {
          jobId,
          level: "retry",
          createdAt: { gte: new Date(Date.now() - 60 * 60_000) },
        },
      }),
    ]);
    const safeLimit = channel?.adaptiveConcurrencyLimit
      ?? (recentRetries > 0 ? 1 : settings.maxConcurrentUploads);
    state.penalty = Math.max(0, settings.maxConcurrentUploads - Math.max(1, Math.min(settings.maxConcurrentUploads, safeLimit)));
    state.hydrated = true;
    if (channel?.adaptiveConcurrencyLimit == null && recentRetries > 0) {
      await persistConcurrencyLimit(channelId, 1);
    }
  }

  return {
    settings,
    limit: Math.max(1, settings.maxConcurrentUploads - state.penalty),
  };
}

function driveConcurrencyLimit() {
  return positiveInt("MAX_CONCURRENT_DRIVE_STREAMS_PER_ACCOUNT", 2, 2);
}

function globalUploadConcurrencyLimit() {
  return positiveInt("MAX_CONCURRENT_UPLOADS_GLOBAL", 4, 20);
}

async function acquireUploadSlot(
  itemId: string,
  jobId: string,
  channelId: string,
  driveAccountId: string,
) {
  while (true) {
    const { limit } = await effectiveConcurrency(jobId, channelId);
    const activeChannelItems = activeItemsForChannel(channelId);
    const activeDriveItems = activeItemsForDriveAccount(driveAccountId);
    if (
      activeChannelItems.size < limit &&
      activeDriveItems.size < driveConcurrencyLimit() &&
      activeUploadItemsGlobal.size < globalUploadConcurrencyLimit()
    ) {
      activeChannelItems.add(itemId);
      activeDriveItems.add(itemId);
      activeUploadItemsGlobal.add(itemId);
      return;
    }
    await new Promise<void>((resolve) => uploadSlotWaiters.push(resolve));
  }
}

function releaseUploadConcurrencySlot(itemId: string, channelId: string, driveAccountId: string) {
  const activeChannelItems = activeUploadItemsByChannel.get(channelId);
  activeChannelItems?.delete(itemId);
  if (activeChannelItems?.size === 0) activeUploadItemsByChannel.delete(channelId);

  const activeDriveItems = activeUploadItemsByDriveAccount.get(driveAccountId);
  activeDriveItems?.delete(itemId);
  if (activeDriveItems?.size === 0) activeUploadItemsByDriveAccount.delete(driveAccountId);
  activeUploadItemsGlobal.delete(itemId);
  wakeUploadWaiters();
}

function scheduleConcurrencyRestore(jobId: string, channelId: string) {
  const state = concurrencyState(channelId);
  if (state.restoreTimer || state.penalty <= 0 || !state.lastSuccessfulUploadAt) return;
  state.restoreTimer = setTimeout(() => {
    void (async () => {
      const settings = await settingsForJob(jobId, true);
      const current = concurrencyState(channelId);
      current.restoreTimer = null;
      const successIsRecent = Date.now() - current.lastSuccessfulUploadAt < 10 * 60_000;
      if (!settings.adaptiveConcurrencyEnabled || current.penalty <= 0 || !successIsRecent) return;

      const previous = Math.max(1, settings.maxConcurrentUploads - current.penalty);
      current.penalty -= 1;
      const restored = Math.max(1, settings.maxConcurrentUploads - current.penalty);
      await persistConcurrencyLimit(channelId, current.penalty > 0 ? restored : null);
      await log(jobId, "info", `Concorrência do canal restaurada gradualmente de ${previous} para ${restored} após uploads estáveis.`).catch(() => undefined);
      wakeUploadWaiters();
      if (current.penalty > 0) scheduleConcurrencyRestore(jobId, channelId);
    })();
  }, 3 * 60_000);
}

async function recordSuccessfulUpload(jobId: string, channelId: string) {
  const state = concurrencyState(channelId);
  state.lastSuccessfulUploadAt = Date.now();
  state.recentTemporaryFailures = [];
  scheduleConcurrencyRestore(jobId, channelId);
}

async function recordTemporaryFailure(jobId: string, knownChannelId?: string) {
  const settings = await settingsForJob(jobId);
  if (!settings.adaptiveConcurrencyEnabled) return;
  const channelId = knownChannelId ?? (await prisma.uploadJob.findUnique({
    where: { id: jobId },
    select: { channelId: true },
  }))?.channelId;
  if (!channelId) return;

  const state = concurrencyState(channelId);
  state.hydrated = true;
  state.lastSuccessfulUploadAt = 0;
  if (state.restoreTimer) {
    clearTimeout(state.restoreTimer);
    state.restoreTimer = null;
  }
  const now = Date.now();
  state.recentTemporaryFailures = state.recentTemporaryFailures.filter((time) => now - time < 2 * 60_000);
  state.recentTemporaryFailures.push(now);
  if (state.recentTemporaryFailures.length < 3) return;

  const previous = Math.max(1, settings.maxConcurrentUploads - state.penalty);
  state.recentTemporaryFailures = [];
  if (previous <= 1) {
    await persistConcurrencyLimit(channelId, 1);
    return;
  }
  state.penalty = Math.min(settings.maxConcurrentUploads - 1, state.penalty + 1);
  const reduced = Math.max(1, settings.maxConcurrentUploads - state.penalty);
  await persistConcurrencyLimit(channelId, reduced);
  await log(jobId, "warn", `Concorrência deste canal reduzida automaticamente de ${previous} para ${reduced} após erros temporários. Os outros canais não foram afetados.`).catch(() => undefined);
  wakeUploadWaiters();
}

async function withSourceLock<T>(key: string, operation: () => Promise<T>) {
  const previous = sourceLocks.get(key) ?? Promise.resolve();
  let release: () => void = () => undefined;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  sourceLocks.set(key, current);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (sourceLocks.get(key) === current) sourceLocks.delete(key);
  }
}

function googleErrorText(error: unknown) {
  const candidate = error as {
    code?: number | string;
    message?: string;
    response?: { status?: number; data?: unknown };
  };
  let details = "";
  try {
    details = JSON.stringify(candidate?.response?.data ?? "");
  } catch {
    details = "";
  }
  return `${candidate?.message ?? ""} ${details}`;
}

function isChannelDailyLimitError(error: unknown) {
  return /uploadLimitExceeded/i.test(googleErrorText(error));
}

function isProjectDailyQuotaError(error: unknown) {
  return /quotaExceeded|dailyLimitExceeded|dailyLimitExceededUnreg|variableTermExpiredDailyExceeded/i.test(googleErrorText(error));
}

function isDailyQuotaError(error: unknown) {
  return isChannelDailyLimitError(error) || isProjectDailyQuotaError(error);
}

function isAuthorizationError(error: unknown) {
  const candidate = error as {
    code?: number | string;
    message?: string;
    response?: { status?: number; data?: unknown };
  };
  const status = candidate?.response?.status ?? candidate?.code;
  let details = "";
  try {
    details = JSON.stringify(candidate?.response?.data ?? "");
  } catch {
    details = "";
  }
  const text = String(candidate?.message ?? "") + " " + details;
  return status === 401 ||
    /invalid_grant|invalid_token|authError|unauthorized|login required|insufficient authentication scopes|autoriza(?:ção|cao).*expirou|não corresponde ao canal conectado/i.test(text);
}
function positiveInt(name: string, fallback: number, maximum = Number.MAX_SAFE_INTEGER) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? Math.min(value, maximum) : fallback;
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

async function log(jobId: string, level: string, message: string, metadata?: unknown) {
  await prisma.log.create({
    data: {
      jobId,
      level,
      message,
      metadata: metadata ? JSON.stringify(metadata) : undefined,
    },
  });
}

async function pauseChannelForDailyLimit(channelId: string, triggerJobId: string, reason: string) {
  const now = new Date();
  const channel = await prisma.youtubeChannel.findUnique({
    where: { id: channelId },
    select: { quotaBlockedUntil: true },
  });
  const blockedUntil = channel?.quotaBlockedUntil && channel.quotaBlockedUntil > now
    ? channel.quotaBlockedUntil
    : new Date(now.getTime() + CHANNEL_DAILY_COOLDOWN_MS);
  const message = `Limite diário de uploads deste canal atingido. Retomada automática em ${blockedUntil.toLocaleString("pt-BR")}.`;

  await prisma.youtubeChannel.update({
    where: { id: channelId },
    data: { quotaBlockedUntil: blockedUntil, quotaBlockReason: reason.slice(0, 500) },
  });
  const affectedJobs = await prisma.uploadJob.findMany({
    where: {
      channelId,
      status: { in: [JobStatus.RUNNING, JobStatus.PENDING, JobStatus.QUOTA_REACHED] },
    },
    select: { id: true },
  });
  const jobIds = affectedJobs.map((job) => job.id);
  if (jobIds.length) {
    await prisma.$transaction([
      prisma.uploadJob.updateMany({
        where: { id: { in: jobIds } },
        data: { status: JobStatus.QUOTA_REACHED, errorMessage: message, completedAt: null, nextRetryAt: blockedUntil },
      }),
      prisma.uploadItem.updateMany({
        where: { jobId: { in: jobIds }, status: ItemStatus.UPLOADING },
        data: { status: ItemStatus.PENDING, errorMessage: null },
      }),
    ]);
  }
  const delay = Math.max(1000, blockedUntil.getTime() - Date.now());
  for (const jobId of jobIds) scheduleUploadJob(jobId, delay);
  await log(triggerJobId, "quota", `${message} Outros canais continuam normalmente.`, {
    channelId,
    blockedUntil: blockedUntil.toISOString(),
  }).catch(() => undefined);
  return { blockedUntil, delay, message };
}

async function clearExpiredChannelQuota(channelId: string) {
  await prisma.youtubeChannel.updateMany({
    where: { id: channelId, quotaBlockedUntil: { lte: new Date() } },
    data: { quotaBlockedUntil: null, quotaBlockReason: null },
  });
}

function googleStatus(error: unknown) {
  const candidate = error as { code?: number | string; response?: { status?: number } };
  const status = candidate?.response?.status ?? candidate?.code;
  return typeof status === "number" ? status : Number(status) || undefined;
}

function googleRetryAfter(error: unknown) {
  const headers = (error as { response?: { headers?: { get?: (name: string) => string | null; [key: string]: unknown } } })
    ?.response?.headers;
  const raw = typeof headers?.get === "function"
    ? headers.get("retry-after")
    : headers?.["retry-after"];
  if (raw == null) return null;
  const seconds = Number(Array.isArray(raw) ? raw[0] : raw);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(String(raw));
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : null;
}

async function waitForGoogleOperationWindow(key: string) {
  const keyDelay = Math.max(0, (googleOperationBlockedUntil.get(key) ?? 0) - Date.now());
  if (keyDelay) await new Promise((resolve) => setTimeout(resolve, keyDelay));

  let release: () => void = () => undefined;
  const previous = googleOperationQueue;
  googleOperationQueue = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    const delay = Math.max(0, nextGoogleOperationAt - Date.now());
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    nextGoogleOperationAt = Date.now() + positiveInt("GOOGLE_API_REQUEST_SPACING_MS", 250, 2000);
  } finally {
    release();
  }
}

async function retryGoogleOperation<T>(operation: () => Promise<T>, key = "google") {
  let attempt = 0;
  while (true) {
    try {
      await waitForGoogleOperationWindow(key);
      return await operation();
    } catch (error) {
      if (!isRetryableGoogleError(error) || attempt >= 8) throw error;
      const status = googleStatus(error);
      const requested = googleRetryAfter(error);
      const baseDelay = status === 429
        ? Math.min(120_000, 5000 * 2 ** attempt)
        : Math.min(30_000, 1000 * 2 ** attempt);
      const delay = Math.min(
        status === 429 ? 5 * 60_000 : 60_000,
        requested ?? baseDelay,
      ) + Math.floor(Math.random() * (status === 429 ? 5000 : 500));
      googleOperationBlockedUntil.set(
        key,
        Math.max(googleOperationBlockedUntil.get(key) ?? 0, Date.now() + delay),
      );
      attempt += 1;
    }
  }
}

async function normalizeDailyCounter(channelId: string) {
  const today = todayKey();
  await prisma.youtubeChannel.updateMany({
    where: {
      id: channelId,
      OR: [
        { dailyCounterDate: null },
        { dailyCounterDate: { not: today } },
      ],
    },
    data: { dailyCounterDate: today, dailyUploadCount: 0 },
  });
  return today;
}

async function reserveUploadSlot(channelId: string) {
  const today = await normalizeDailyCounter(channelId);
  await prisma.youtubeChannel.update({
    where: { id: channelId },
    data: { dailyCounterDate: today, dailyUploadCount: { increment: 1 } },
  });
  return true;
}

async function releaseUploadSlot(channelId: string) {
  await prisma.youtubeChannel.updateMany({
    where: {
      id: channelId,
      dailyCounterDate: todayKey(),
      dailyUploadCount: { gt: 0 },
    },
    data: { dailyUploadCount: { decrement: 1 } },
  });
}

async function ensurePlaylist(jobId: string) {
  const job = await prisma.uploadJob.findUniqueOrThrow({
    where: { id: jobId },
    include: { channel: true, playlist: true },
  });
  const youtube = youtubeClient(job.channel);
  if (job.playlist) {
    const check = await retryGoogleOperation(() => youtube.playlists.list({
      part: ["id"],
      id: [job.playlist!.youtubePlaylistId],
      maxResults: 1,
    }), "youtube:" + job.channelId);
    if (check.data.items?.length) return job.playlist;
    await log(jobId, "warn", "A playlist anterior não existe mais; uma nova será criada automaticamente.");
    await prisma.uploadJob.update({ where: { id: jobId }, data: { playlistId: null } });
  }

  const playlistName = job.playlist?.name || job.courseName;
  const result = await retryGoogleOperation(() => youtube.playlists.insert({
    part: ["snippet", "status"],
    requestBody: {
      snippet: { title: playlistName },
      status: { privacyStatus: job.privacyStatus },
    },
  }), "youtube:" + job.channelId);
  const youtubePlaylistId = result.data.id;
  if (!youtubePlaylistId) throw new Error("O YouTube não devolveu o ID da playlist.");

  return prisma.playlist.create({
    data: {
      youtubePlaylistId,
      name: playlistName,
      privacyStatus: job.privacyStatus,
      channelId: job.channelId,
      uploadJobs: { connect: { id: job.id } },
    },
  });
}

async function validateGoogleConnections(job: JobContext) {
  const drive = driveClient(job.driveAccount);
  const youtube = youtubeClient(job.channel);
  await retryGoogleOperation(() => drive.files.get({
    fileId: "root",
    fields: "id",
    supportsAllDrives: true,
  }), "drive:" + job.driveAccountId);
  const channels = await retryGoogleOperation(() => youtube.channels.list({
    part: ["id"],
    mine: true,
    maxResults: 50,
  }), "youtube:" + job.channelId);
  const authorized = channels.data.items?.some(
    (channel) => channel.id === job.channel.youtubeChannelId,
  );
  if (!authorized) {
    throw new Error("A autorização do canal YouTube expirou ou não corresponde ao canal conectado.");
  }
}

async function updateJobProgress(jobId: string) {
  const aggregate = await prisma.uploadItem.aggregate({
    where: { jobId },
    _avg: { progress: true },
  });
  const progress = Math.round(aggregate._avg.progress ?? 0);
  await prisma.uploadJob.update({ where: { id: jobId }, data: { progress } });
}

async function currentJobStatus(jobId: string) {
  const state = await prisma.uploadJob.findUnique({
    where: { id: jobId },
    select: { status: true },
  });
  return state?.status;
}

async function findReusableVideo(job: JobContext, item: UploadItem) {
  const previous = await prisma.uploadItem.findFirst({
    where: {
      id: { not: item.id },
      driveFileId: item.driveFileId,
      youtubeVideoId: { not: null },
      ...(item.sizeBytes ? { sizeBytes: item.sizeBytes } : {}),
      job: {
        driveAccountId: job.driveAccountId,
        channelId: job.channelId,
      },
    },
    select: { youtubeVideoId: true },
    orderBy: { updatedAt: "desc" },
  });
  return previous?.youtubeVideoId ?? null;
}

async function applyDefaultThumbnail(
  job: JobContext,
  item: UploadItem,
  videoId: string,
  settings: Awaited<ReturnType<typeof getAppSettings>>,
) {
  const fileId = settings.defaultThumbnailDriveFileId;
  if (!fileId) return;
  try {
    const drive = driveClient(job.driveAccount);
    const metadata = await drive.files.get({
      fileId,
      fields: "id,size,mimeType,trashed",
      supportsAllDrives: true,
    });
    const mimeType = metadata.data.mimeType || "";
    const size = Number(metadata.data.size || 0);
    if (!metadata.data.id || metadata.data.trashed) {
      throw new Error("A miniatura padrão não existe mais no Drive.");
    }
    if (!["image/jpeg", "image/png"].includes(mimeType)) {
      throw new Error("A miniatura padrão deve ser JPG ou PNG.");
    }
    if (!size || size > 2 * 1024 * 1024) {
      throw new Error("A miniatura padrão deve ter no máximo 2 MB.");
    }
    const media = await drive.files.get(
      { fileId, alt: "media", supportsAllDrives: true },
      { responseType: "stream" },
    );
    const youtube = youtubeClient(job.channel);
    await retryGoogleOperation(() => youtube.thumbnails.set({
      videoId,
      media: { mimeType, body: media.data },
    }), "youtube:" + job.channelId);
    await log(job.id, "success", `Miniatura padrão aplicada em ${item.title}.`);
  } catch (error) {
    await log(
      job.id,
      "warn",
      `Miniatura não aplicada em ${item.title}: ${friendlyGoogleError(error)}`,
    ).catch(() => undefined);
  }
}

async function processUploadItemUnlocked(job: JobContext, playlist: Playlist, item: UploadItem) {
  const initialStatus = await currentJobStatus(job.id);
  if (initialStatus !== JobStatus.RUNNING) return;

  const settings = await getAppSettings((job as { userId?: string }).userId || "global");
  const drive = driveClient(job.driveAccount);
  const metadata = await retryGoogleOperation(() => drive.files.get({
    fileId: item.driveFileId,
    fields: "id,name,size,mimeType,trashed",
    supportsAllDrives: true,
  }), "drive:" + job.driveAccountId);
  if (!metadata.data.id || metadata.data.trashed) {
    throw new Error("O arquivo da aula não existe mais no Google Drive.");
  }
  const sourceName = metadata.data.name || item.originalName;
  const sourceMimeType = metadata.data.mimeType || item.mimeType;
  if (!/\.(mp4|mov|avi|mkv|webm)$/i.test(sourceName) || (!sourceMimeType.startsWith("video/") && sourceMimeType !== "application/octet-stream")) {
    throw new Error("Formato de vídeo não suportado. Use mp4, mov, avi, mkv ou webm.");
  }
  const totalSize = metadata.data.size ? BigInt(metadata.data.size) : item.sizeBytes;
  if (!totalSize || totalSize <= 0n) {
    throw new Error("O tamanho do vídeo é inválido ou não foi informado pelo Drive.");
  }
  if (totalSize > 256n * 1024n * 1024n * 1024n) {
    throw new Error("O vídeo é maior que o limite aceito pelo YouTube.");
  }
  if (item.sizeBytes !== totalSize) {
    await prisma.uploadItem.update({
      where: { id: item.id },
      data: { sizeBytes: totalSize },
    });
  }

  let videoId = item.youtubeVideoId;
  const reusableVideoId = videoId || !settings.duplicateCheckEnabled
    ? null
    : await findReusableVideo(job, { ...item, sizeBytes: totalSize });
  if (!videoId && reusableVideoId) videoId = reusableVideoId;
  const reusedFromHistory = Boolean(reusableVideoId);
  let slotReserved = false;

  if (!videoId) {
    slotReserved = await reserveUploadSlot(job.channelId);
    if (!slotReserved) {
      await prisma.uploadJob.update({
        where: { id: job.id },
        data: {
          status: JobStatus.QUOTA_REACHED,
          errorMessage: "Limite operacional diário do canal atingido. Retome no próximo dia.",
        },
      });
      await log(job.id, "warn", "Limite operacional diário de uploads atingido.");
      return;
    }
  }

  await prisma.uploadItem.update({
    where: { id: item.id },
    data: { status: ItemStatus.UPLOADING, progress: videoId ? 99 : Math.max(1, item.progress), errorMessage: null },
  });

  try {
    const youtube = youtubeClient(job.channel);

    if (!videoId) {

      const auth = youtubeAuth(job.channel);
      let lastProgress = item.progress;
      const sessionUri = item.encryptedResumableUri
        ? decryptJson<string>(item.encryptedResumableUri)
        : null;

      const uploadController = new AbortController();
      let statusCheckInFlight = false;
      const statusMonitor = setInterval(() => {
        if (statusCheckInFlight) return;
        statusCheckInFlight = true;
        void currentJobStatus(job.id).then((status) => {
          if (status !== JobStatus.RUNNING) uploadController.abort();
        }).catch(() => undefined).finally(() => {
          statusCheckInFlight = false;
        });
      }, 1000);

      try {
        videoId = await uploadVideoResumable({
          signal: uploadController.signal,
          auth,
          title: item.title,
          description: item.moduleName
            ? `Módulo: ${item.moduleName}\n\n${settings.defaultDescription.trim() || "Enviado com AulaSync Pro."}`
            : settings.defaultDescription.trim() || "Enviado com AulaSync Pro.",
          tags: settings.defaultTags
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean)
            .slice(0, 30),
          privacyStatus: job.privacyStatus,
          rateLimitKey: job.channelId,
          mimeType: item.mimeType,
          totalSize,
          sessionUri,
          getMediaStream: async (start, end) => {
            const response = await drive.files.get(
              {
                fileId: item.driveFileId,
                alt: "media",
                supportsAllDrives: true,
              },
              {
                responseType: "stream",
                signal: uploadController.signal,
                timeout: positiveInt("UPLOAD_REQUEST_TIMEOUT_MS", 120_000, 600_000),
                headers: { Range: `bytes=${start}-${end}` },
              },
            );
            return response.data;
          },
          onSession: async (uri) => {
            await prisma.uploadItem.update({
              where: { id: item.id },
              data: { encryptedResumableUri: uri ? encryptJson(uri) : null },
            });
          },
          onProgress: (progress) => {
            if (progress === 100 || progress - lastProgress >= 2) {
              lastProgress = progress;
              void prisma.uploadItem.update({
                where: { id: item.id },
                data: { progress },
              }).then(() => updateJobProgress(job.id)).catch(() => undefined);
            }
          },
          onRetry: (attempt, delayMs, reason) => {
            void recordTemporaryFailure(job.id, job.channelId).catch(() => undefined);
            void log(
              job.id,
              "warn",
              `${item.title}: tentativa automática ${attempt} em ${Math.ceil(delayMs / 1000)}s por ${reason}.`,
            ).catch(() => undefined);
          },
        });
      } finally {
        clearInterval(statusMonitor);
      }

      await prisma.uploadItem.update({
        where: { id: item.id },
        data: {
          progress: 99,
          youtubeVideoId: videoId,
          youtubeUrl: `https://youtu.be/${videoId}`,
          encryptedResumableUri: null,
        },
      });
      slotReserved = false;
    }

    if (!videoId) throw new Error("O YouTube não devolveu o ID do vídeo.");
    const confirmedVideoId = videoId;

    const existingPlaylistItem = await retryGoogleOperation(() => youtube.playlistItems.list({
      part: ["id"],
      playlistId: playlist.youtubePlaylistId,
      videoId: confirmedVideoId,
      maxResults: 1,
    }), "youtube:" + job.channelId);
    if (!existingPlaylistItem.data.items?.length) {
      await retryGoogleOperation(() => youtube.playlistItems.insert({
        part: ["snippet"],
        requestBody: {
          snippet: {
            playlistId: playlist.youtubePlaylistId,
            resourceId: { kind: "youtube#video", videoId: confirmedVideoId },
          },
        },
      }), "youtube:" + job.channelId);
    }

    await applyDefaultThumbnail(job, item, confirmedVideoId, settings);

    await prisma.uploadItem.update({
      where: { id: item.id },
      data: {
        status: ItemStatus.UPLOADED,
        progress: 100,
        youtubeVideoId: videoId,
        youtubeUrl: `https://youtu.be/${videoId}`,
        uploadedAt: new Date(),
        errorMessage: null,
      },
    });
    await recordSuccessfulUpload(job.id, job.channelId);
    await log(
      job.id,
      "success",
      reusedFromHistory
        ? `${item.title} já havia sido enviada; o vídeo existente foi reutilizado.`
        : `${item.title} enviado com sucesso.`,
      { videoId, reused: reusedFromHistory },
    );
  } catch (error) {
    if (slotReserved) await releaseUploadSlot(job.channelId).catch(() => undefined);
    if (isChannelDailyLimitError(error)) {
      const message = friendlyGoogleError(error);
      await prisma.uploadItem.update({
        where: { id: item.id },
        data: { status: ItemStatus.PENDING, errorMessage: null },
      }).catch(() => undefined);
      await pauseChannelForDailyLimit(job.channelId, job.id, message);
      return;
    }
    const status = await currentJobStatus(job.id);

    if (status === JobStatus.PAUSED) {
      await prisma.uploadItem.update({
        where: { id: item.id },
        data: { status: ItemStatus.PENDING, errorMessage: null },
      });
      await log(job.id, "info", `Upload de ${item.title} pausado com a sessão preservada.`);
    } else if (status === JobStatus.PENDING || status === JobStatus.QUOTA_REACHED) {
      await prisma.uploadItem.update({
        where: { id: item.id },
        data: { status: ItemStatus.PENDING, errorMessage: null },
      });
      await log(job.id, "info", `Upload de ${item.title} aguardando a retomada automática já agendada.`);
    } else if (status === JobStatus.CANCELLED) {
      await prisma.uploadItem.update({
        where: { id: item.id },
        data: {
          status: ItemStatus.CANCELLED,
          progress: 0,
          encryptedResumableUri: null,
          errorMessage: null,
        },
      });
      await log(job.id, "info", `Upload de ${item.title} cancelado.`);
    } else {
      const message = friendlyGoogleError(error);
      const dailyQuota = isDailyQuotaError(error);
      const needsReconnect = !dailyQuota && isAuthorizationError(error);
      const permanent = /arquivo .*não existe|formato de vídeo não suportado|tamanho do vídeo é inválido|vídeo é maior|playlist selecionada não existe/i.test(message);

      if (permanent) {
        await prisma.uploadItem.update({
          where: { id: item.id },
          data: { status: ItemStatus.ERROR, errorMessage: message },
        });
        await log(job.id, "error", `${item.title}: ${message}`);
      } else if (needsReconnect) {
        await prisma.$transaction([
          prisma.uploadItem.update({
            where: { id: item.id },
            data: { status: ItemStatus.PENDING, errorMessage: null },
          }),
          prisma.uploadJob.update({
            where: { id: job.id },
            data: {
              status: JobStatus.PAUSED,
              errorMessage: `${message} Reconecte a conta para o AulaSync continuar.`,
            },
          }),
        ]);
        await log(job.id, "warn", `${item.title}: ${message}`);
      } else {
        if (!dailyQuota) await recordTemporaryFailure(job.id, job.channelId);
        const delay = googleStatus(error) === 429
          ? 60 * 60_000
          : await automaticRetryDelay(job.id, dailyQuota);
        const retryMessage = dailyQuota
          ? "Quota diária do projeto YouTube atingida. Nova tentativa automática em 24 horas."
          : `${message} Nova tentativa automática em ${formatRetryDelay(delay)}.`;
        await prisma.$transaction([
          prisma.uploadItem.update({
            where: { id: item.id },
            data: { status: ItemStatus.PENDING, errorMessage: null },
          }),
          prisma.uploadJob.update({
            where: { id: job.id },
            data: {
              status: dailyQuota ? JobStatus.QUOTA_REACHED : JobStatus.RUNNING,
              errorMessage: retryMessage,
              completedAt: null,
            },
          }),
        ]);
        await armAutomaticRetry(job.id, item.title, message, delay);
      }
    }
  } finally {
    await updateJobProgress(job.id).catch(() => undefined);
  }
}

async function processUploadItem(job: JobContext, playlist: Playlist, item: UploadItem) {
  const key = `${job.driveAccountId}:${job.channelId}:${item.driveFileId}`;
  await acquireUploadSlot(item.id, job.id, job.channelId, job.driveAccountId);
  try {
    return await withSourceLock(key, () => processUploadItemUnlocked(job, playlist, item));
  } finally {
    releaseUploadConcurrencySlot(item.id, job.channelId, job.driveAccountId);
  }
}

async function processItemsInParallel(job: JobContext, playlist: Playlist, items: UploadItem[]) {
  const settings = await getAppSettings((job as { userId?: string }).userId || "global");
  const concurrency = Math.min(settings.maxConcurrentUploads, items.length);
  let nextIndex = 0;

  const runner = async () => {
    while (true) {
      const status = await currentJobStatus(job.id);
      if (status !== JobStatus.RUNNING) return;
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      await processUploadItem(job, playlist, items[index]);
    }
  };

  await Promise.all(Array.from({ length: concurrency }, () => runner()));
}

export async function recoverPendingUploadJobs() {
  if (await backgroundWorkerIsHealthy()) return;
  const now = Date.now();
  if (now - lastRecoveryScan < 5000) return;
  lastRecoveryScan = now;
  const jobs = await prisma.uploadJob.findMany({
    where: { status: { in: [JobStatus.RUNNING, JobStatus.PENDING, JobStatus.QUOTA_REACHED] } },
    orderBy: { updatedAt: "asc" },
    select: { id: true },
  });
  for (const job of jobs) {
    if (!retryTimers.has(job.id)) queueMicrotask(() => void runUploadJob(job.id));
  }
}

export async function runUploadJob(jobId: string) {
  if (await backgroundWorkerIsHealthy()) return;
  if (workers.has(jobId)) return;
  const leaseAcquired = await acquireJobLease(jobId).catch(() => false);
  if (!leaseAcquired) return;

  workers.add(jobId);
  const leaseHeartbeat = setInterval(() => {
    void renewJobLease(jobId).catch(() => undefined);
  }, 30_000);

  try {
    const availability = await prisma.uploadJob.findUniqueOrThrow({
      where: { id: jobId },
      include: { driveAccount: true, channel: true },
    });
    if (availability.nextRetryAt && availability.nextRetryAt > new Date()) {
      scheduleUploadJob(jobId, Math.max(1000, availability.nextRetryAt.getTime() - Date.now()));
      return;
    }
    if (availability.channel.quotaBlockedUntil && availability.channel.quotaBlockedUntil > new Date()) {
      const delay = Math.max(1000, availability.channel.quotaBlockedUntil.getTime() - Date.now());
      await prisma.uploadJob.update({
        where: { id: jobId },
        data: {
          status: JobStatus.QUOTA_REACHED,
          errorMessage: `Este canal está aguardando o limite diário. Retomada automática em ${availability.channel.quotaBlockedUntil.toLocaleString("pt-BR")}.`,
          completedAt: null,
        },
      });
      scheduleUploadJob(jobId, delay);
      return;
    }
    await clearExpiredChannelQuota(availability.channelId);

    if (!availability.driveAccount.isActive || !availability.channel.isActive) {
      await prisma.uploadJob.update({
        where: { id: jobId },
        data: {
          status: JobStatus.PAUSED,
          errorMessage: "Reconecte a conta Drive e o canal YouTube para continuar.",
        },
      });
      await log(jobId, "warn", "Tarefa pausada por conexão removida.");
      return;
    }

    await validateGoogleConnections(availability);

    const job = await prisma.uploadJob.update({
      where: { id: jobId },
      data: {
        status: JobStatus.RUNNING,
        startedAt: availability.startedAt ?? new Date(),
        completedAt: null,
        nextRetryAt: null,
        errorMessage: null,
      },
      include: { driveAccount: true, channel: true },
    });

    await prisma.uploadItem.updateMany({
      where: { jobId, status: ItemStatus.UPLOADING },
      data: { status: ItemStatus.PENDING },
    });

    const playlist = await ensurePlaylist(jobId);
    await log(jobId, "info", `Playlist criada/selecionada: ${playlist.name}`);

    const items = await prisma.uploadItem.findMany({
      where: { jobId, status: ItemStatus.PENDING },
      orderBy: { sortOrder: "asc" },
    });

    await processItemsInParallel(job, playlist, items);

    const [pending, errors] = await Promise.all([
      prisma.uploadItem.count({
        where: { jobId, status: { in: [ItemStatus.PENDING, ItemStatus.UPLOADING] } },
      }),
      prisma.uploadItem.count({ where: { jobId, status: ItemStatus.ERROR } }),
    ]);
    const current = await prisma.uploadJob.findUniqueOrThrow({ where: { id: jobId } });
    if (current.status !== JobStatus.RUNNING) return;

    const finalStatus = pending
      ? JobStatus.PENDING
      : errors
        ? JobStatus.FAILED
        : JobStatus.COMPLETED;
    await updateJobProgress(jobId);
    await prisma.uploadJob.update({
      where: { id: jobId },
      data: {
        status: finalStatus,
        progress: pending || errors ? undefined : 100,
        completedAt: pending ? null : new Date(),
        nextRetryAt: pending ? current.nextRetryAt : null,
        errorMessage: pending
          ? current.errorMessage
          : errors
            ? errors + " aula(s) com erro permanente. É possível reenviá-las."
            : null,
      },
    });
    if (finalStatus === JobStatus.COMPLETED) {
      await log(jobId, "success", "Tarefa concluída: todas as aulas foram processadas.");
    } else if (finalStatus === JobStatus.FAILED) {
      await log(jobId, "error", `Tarefa concluída com ${errors} aula(s) em erro.`);
    }
  } catch (error) {
    const message = friendlyGoogleError(error);
    if (isChannelDailyLimitError(error)) {
      const failedJob = await prisma.uploadJob.findUnique({
        where: { id: jobId },
        select: { channelId: true },
      }).catch(() => null);
      if (failedJob) await pauseChannelForDailyLimit(failedJob.channelId, jobId, message);
      return;
    }
    const dailyQuota = isProjectDailyQuotaError(error);
    const needsReconnect = !dailyQuota && isAuthorizationError(error);

    if (needsReconnect) {
      await prisma.uploadJob.update({
        where: { id: jobId },
        data: { status: JobStatus.PAUSED, errorMessage: message },
      }).catch(() => undefined);
      await log(jobId, "warn", message).catch(() => undefined);
    } else {
      if (!dailyQuota) await recordTemporaryFailure(jobId);
      const delay = googleStatus(error) === 429
        ? 60 * 60_000
        : await automaticRetryDelay(jobId, dailyQuota).catch(() => dailyQuota ? CHANNEL_DAILY_COOLDOWN_MS : 60_000);
      await prisma.uploadJob.update({
        where: { id: jobId },
        data: {
          status: dailyQuota ? JobStatus.QUOTA_REACHED : JobStatus.PENDING,
          errorMessage: dailyQuota
            ? "Quota diária do projeto YouTube atingida. Nova tentativa automática em 24 horas. Este limite oficial pode afetar todos os canais deste projeto Google Cloud."
            : `${message} Retomada automática agendada.`,
          completedAt: null,
        },
      }).catch(() => undefined);
      await armAutomaticRetry(jobId, "Tarefa", message, delay);
    }
  } finally {
    clearInterval(leaseHeartbeat);
    workers.delete(jobId);
    await releaseJobLease(jobId).catch(() => undefined);
    queueMicrotask(() => void recoverPendingUploadJobs());
  }
}
