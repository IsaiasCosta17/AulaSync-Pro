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
import {
  DEFAULT_PARALLEL_UPLOAD_JOBS,
} from "@/lib/upload-config";
import { getAppSettings } from "@/lib/settings";

const workers = new Set<string>();
const sourceLocks = new Map<string, Promise<void>>();
const retryTimers = new Map<string, ReturnType<typeof setTimeout>>();
const activeUploadItems = new Set<string>();
const uploadSlotWaiters: Array<() => void> = [];
let concurrencyPenalty = 0;
let recentTemporaryFailures: number[] = [];
let concurrencyRestoreTimer: ReturnType<typeof setTimeout> | null = null;
let lastRecoveryScan = 0;
const workerOwnerId = randomUUID();
let leaseSchemaReady: Promise<void> | null = null;

type JobContext = UploadJob & {
  driveAccount: GoogleDriveAccount;
  channel: YoutubeChannel;
};

function ensureLeaseSchema() {
  if (!leaseSchemaReady) {
    leaseSchemaReady = prisma.$executeRawUnsafe(
      'CREATE TABLE IF NOT EXISTS "UploadJobLease" (' +
      '"jobId" TEXT NOT NULL PRIMARY KEY,' +
      '"ownerId" TEXT NOT NULL,' +
      '"expiresAt" DATETIME NOT NULL' +
      ')',
    ).then(() => undefined).catch((error) => {
      leaseSchemaReady = null;
      throw error;
    });
  }
  return leaseSchemaReady;
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
  await prisma.$executeRawUnsafe(
    'DELETE FROM "UploadJobLease" WHERE "expiresAt" <= ?',
    now,
  );
  await prisma.$executeRawUnsafe(
    'INSERT OR IGNORE INTO "UploadJobLease" ("jobId", "ownerId", "expiresAt") VALUES (?, ?, ?)',
    jobId,
    workerOwnerId,
    expiresAt,
  );
  await prisma.$executeRawUnsafe(
    'UPDATE "UploadJobLease" SET "expiresAt" = ? WHERE "jobId" = ? AND "ownerId" = ?',
    expiresAt,
    jobId,
    workerOwnerId,
  );
  const rows = await prisma.$queryRawUnsafe<Array<{ ownerId: string }>>(
    'SELECT "ownerId" FROM "UploadJobLease" WHERE "jobId" = ? LIMIT 1',
    jobId,
  );
  return rows[0]?.ownerId === workerOwnerId;
}

async function renewJobLease(jobId: string) {
  await prisma.$executeRawUnsafe(
    'UPDATE "UploadJobLease" SET "expiresAt" = ? WHERE "jobId" = ? AND "ownerId" = ?',
    new Date(Date.now() + 120_000),
    jobId,
    workerOwnerId,
  );
}

async function releaseJobLease(jobId: string) {
  await prisma.$executeRawUnsafe(
    'DELETE FROM "UploadJobLease" WHERE "jobId" = ? AND "ownerId" = ?',
    jobId,
    workerOwnerId,
  );
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

async function automaticRetryDelay(jobId: string, quota = false) {
  const settings = await settingsForJob(jobId);
  if (quota) return settings.quotaRetryMinutes * 60_000;
  const attempts = await prisma.log.count({ where: { jobId, level: "retry" } });
  return Math.min(
    15 * 60_000,
    settings.temporaryRetrySeconds * 1000 * 2 ** Math.min(attempts, 6),
  );
}

async function armAutomaticRetry(
  jobId: string,
  itemTitle: string,
  message: string,
  delayMs: number,
) {
  await log(
    jobId,
    "retry",
    `${itemTitle}: retomada automática em ${Math.ceil(delayMs / 1000)} segundos.`,
    { delayMs, message },
  ).catch(() => undefined);
  scheduleUploadJob(jobId, delayMs);
}

async function effectiveConcurrency(jobId: string) {
  const settings = await settingsForJob(jobId);
  if (!settings.adaptiveConcurrencyEnabled) concurrencyPenalty = 0;
  return {
    settings,
    limit: Math.max(1, settings.maxConcurrentUploads - concurrencyPenalty),
  };
}

function wakeUploadWaiters() {
  for (const wake of uploadSlotWaiters.splice(0)) wake();
}

async function acquireUploadSlot(itemId: string, jobId: string) {
  while (true) {
    const { limit } = await effectiveConcurrency(jobId);
    if (activeUploadItems.size < limit) {
      activeUploadItems.add(itemId);
      return;
    }
    await new Promise<void>((resolve) => uploadSlotWaiters.push(resolve));
  }
}

function releaseUploadConcurrencySlot(itemId: string) {
  activeUploadItems.delete(itemId);
  wakeUploadWaiters();
}

function scheduleConcurrencyRestore(jobId: string) {
  if (concurrencyRestoreTimer) clearTimeout(concurrencyRestoreTimer);
  concurrencyRestoreTimer = setTimeout(() => {
    void (async () => {
      const settings = await settingsForJob(jobId, true);
      if (!settings.adaptiveConcurrencyEnabled || concurrencyPenalty <= 0) {
        concurrencyPenalty = 0;
        wakeUploadWaiters();
        return;
      }
      const previous = Math.max(1, settings.maxConcurrentUploads - concurrencyPenalty);
      concurrencyPenalty -= 1;
      const restored = Math.max(1, settings.maxConcurrentUploads - concurrencyPenalty);
      await log(jobId, "info", `Concorrência restaurada gradualmente de ${previous} para ${restored}.`).catch(() => undefined);
      wakeUploadWaiters();
      if (concurrencyPenalty > 0) scheduleConcurrencyRestore(jobId);
    })();
  }, 3 * 60_000);
}

async function recordTemporaryFailure(jobId: string) {
  const settings = await settingsForJob(jobId);
  if (!settings.adaptiveConcurrencyEnabled) return;
  const now = Date.now();
  recentTemporaryFailures = recentTemporaryFailures.filter((time) => now - time < 2 * 60_000);
  recentTemporaryFailures.push(now);
  if (recentTemporaryFailures.length < 3) return;

  const previous = Math.max(1, settings.maxConcurrentUploads - concurrencyPenalty);
  if (previous <= 1) {
    recentTemporaryFailures = [];
    scheduleConcurrencyRestore(jobId);
    return;
  }
  concurrencyPenalty = Math.min(settings.maxConcurrentUploads - 1, concurrencyPenalty + 1);
  const reduced = Math.max(1, settings.maxConcurrentUploads - concurrencyPenalty);
  recentTemporaryFailures = [];
  await log(jobId, "warn", `Concorrência reduzida automaticamente de ${previous} para ${reduced} após erros temporários.`).catch(() => undefined);
  scheduleConcurrencyRestore(jobId);
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

function isQuotaError(error: unknown) {
  const candidate = error as {
    code?: number;
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
  const text = `${candidate?.message ?? ""} ${details}`;
  return status === 429 || /quotaExceeded|dailyLimitExceeded|uploadLimitExceeded|rateLimitExceeded/i.test(text);
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

async function retryGoogleOperation<T>(operation: () => Promise<T>) {
  let attempt = 0;
  while (true) {
    try {
      return await operation();
    } catch (error) {
      if (!isRetryableGoogleError(error) || attempt >= 5) throw error;
      const delay = Math.min(15_000, 1000 * 2 ** attempt) + Math.floor(Math.random() * 300);
      attempt += 1;
      await new Promise((resolve) => setTimeout(resolve, delay));
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
    }));
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
  }));
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
  const [, channels] = await Promise.all([
    drive.files.get({
      fileId: "root",
      fields: "id",
      supportsAllDrives: true,
    }),
    youtube.channels.list({
      part: ["id"],
      mine: true,
      maxResults: 50,
    }),
  ]);
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
    }));
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
  }));
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
            void recordTemporaryFailure(job.id).catch(() => undefined);
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
    }));
    if (!existingPlaylistItem.data.items?.length) {
      await retryGoogleOperation(() => youtube.playlistItems.insert({
        part: ["snippet"],
        requestBody: {
          snippet: {
            playlistId: playlist.youtubePlaylistId,
            resourceId: { kind: "youtube#video", videoId: confirmedVideoId },
          },
        },
      }));
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
      const quota = isQuotaError(error);
      const needsReconnect = !quota && isAuthorizationError(error);
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
        if (!quota) await recordTemporaryFailure(job.id);
        const delay = await automaticRetryDelay(job.id, quota);
        const retryMessage = quota
          ? `Quota do YouTube temporariamente indisponível. Nova tentativa automática em ${Math.ceil(delay / 60_000)} minuto(s).`
          : `${message} Nova tentativa automática em ${Math.ceil(delay / 1000)} segundo(s).`;
        await prisma.$transaction([
          prisma.uploadItem.update({
            where: { id: item.id },
            data: { status: ItemStatus.PENDING, errorMessage: null },
          }),
          prisma.uploadJob.update({
            where: { id: job.id },
            data: {
              status: JobStatus.PENDING,
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
  await acquireUploadSlot(item.id, job.id);
  try {
    return await withSourceLock(key, () => processUploadItemUnlocked(job, playlist, item));
  } finally {
    releaseUploadConcurrencySlot(item.id);
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
  const limit = positiveInt("MAX_PARALLEL_UPLOAD_JOBS", DEFAULT_PARALLEL_UPLOAD_JOBS, 10);
  const jobs = await prisma.uploadJob.findMany({
    where: { status: { in: [JobStatus.RUNNING, JobStatus.PENDING, JobStatus.QUOTA_REACHED] } },
    orderBy: { updatedAt: "asc" },
    take: limit,
    select: { id: true },
  });
  for (const job of jobs) {
    if (!retryTimers.has(job.id)) queueMicrotask(() => void runUploadJob(job.id));
  }
}

export async function runUploadJob(jobId: string) {
  if (await backgroundWorkerIsHealthy()) return;
  if (workers.has(jobId)) return;
  const processLimit = positiveInt("MAX_PARALLEL_UPLOAD_JOBS", DEFAULT_PARALLEL_UPLOAD_JOBS, 10);
  if (workers.size >= processLimit) {
    await log(jobId, "info", "Tarefa aguardando uma vaga segura de processamento.").catch(() => undefined);
    return;
  }
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
      ? JobStatus.PAUSED
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
        errorMessage: errors ? `${errors} aula(s) com erro permanente. É possível reenviá-las.` : null,
      },
    });
    if (finalStatus === JobStatus.COMPLETED) {
      await log(jobId, "success", "Tarefa concluída: todas as aulas foram processadas.");
    } else if (finalStatus === JobStatus.FAILED) {
      await log(jobId, "error", `Tarefa concluída com ${errors} aula(s) em erro.`);
    }
  } catch (error) {
    const message = friendlyGoogleError(error);
    const quota = isQuotaError(error);
    const needsReconnect = !quota && isAuthorizationError(error);

    if (needsReconnect) {
      await prisma.uploadJob.update({
        where: { id: jobId },
        data: { status: JobStatus.PAUSED, errorMessage: message },
      }).catch(() => undefined);
      await log(jobId, "warn", message).catch(() => undefined);
    } else {
      if (!quota) await recordTemporaryFailure(jobId);
      const delay = await automaticRetryDelay(jobId, quota).catch(() => 60_000);
      await prisma.uploadJob.update({
        where: { id: jobId },
        data: {
          status: JobStatus.PENDING,
          errorMessage: `${message} Retomada automática agendada.`,
          completedAt: null,
        },
      }).catch(() => undefined);
      await armAutomaticRetry(jobId, "Tarefa", message, delay);
    }
  } finally {
    clearInterval(leaseHeartbeat);
    workers.delete(jobId);
    await releaseJobLease(jobId).catch(() => undefined);
    const limit = positiveInt("MAX_PARALLEL_UPLOAD_JOBS", DEFAULT_PARALLEL_UPLOAD_JOBS, 10);
    if (workers.size < limit) {
      const next = await prisma.uploadJob.findFirst({
        where: { status: JobStatus.PENDING, id: { not: jobId } },
        orderBy: { createdAt: "asc" },
      }).catch(() => null);
      if (next) queueMicrotask(() => void runUploadJob(next.id));
    }
  }
}
