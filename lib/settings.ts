import { prisma } from "@/lib/db";

export type AppSettings = {
  maxConcurrentUploads: number;
  temporaryRetrySeconds: number;
  quotaRetryMinutes: number;
  defaultPrivacy: "unlisted" | "private" | "public";
  defaultDescription: string;
  defaultTags: string;
  defaultThumbnailDriveFileId: string | null;
  duplicateCheckEnabled: boolean;
  adaptiveConcurrencyEnabled: boolean;
};

export const DEFAULT_SETTINGS: AppSettings = {
  maxConcurrentUploads: 3,
  temporaryRetrySeconds: 15,
  quotaRetryMinutes: 60,
  defaultPrivacy: "unlisted",
  defaultDescription: "Enviado com AulaSync Pro.",
  defaultTags: "",
  defaultThumbnailDriveFileId: null,
  duplicateCheckEnabled: true,
  adaptiveConcurrencyEnabled: true,
};

const settingsCache = new Map<string, { value: AppSettings; expiresAt: number }>();

export async function ensureRuntimeSchema() {
  // O schema e criado pelo Prisma durante a implantacao.
}

async function ensureUserRows(userId: string) {
  await Promise.all([
    prisma.appSettings.upsert({
      where: { id: userId },
      update: {},
      create: { id: userId },
    }),
    prisma.notificationState.upsert({
      where: { id: userId },
      update: {},
      create: { id: userId, lastReadAt: new Date(0) },
    }),
  ]);
}

function normalizePrivacy(value: string): AppSettings["defaultPrivacy"] {
  return value === "private" || value === "public" ? value : "unlisted";
}

export async function getAppSettings(userId = "global", options?: { fresh?: boolean }) {
  const cached = settingsCache.get(userId);
  if (!options?.fresh && cached && cached.expiresAt > Date.now()) return cached.value;

  await ensureUserRows(userId);
  const row = await prisma.appSettings.findUnique({ where: { id: userId } });
  const value: AppSettings = row
    ? {
        maxConcurrentUploads: row.maxConcurrentUploads,
        temporaryRetrySeconds: row.temporaryRetrySeconds,
        quotaRetryMinutes: row.quotaRetryMinutes,
        defaultPrivacy: normalizePrivacy(row.defaultPrivacy),
        defaultDescription: row.defaultDescription,
        defaultTags: row.defaultTags,
        defaultThumbnailDriveFileId: row.defaultThumbnailDriveFileId,
        duplicateCheckEnabled: row.duplicateCheckEnabled,
        adaptiveConcurrencyEnabled: row.adaptiveConcurrencyEnabled,
      }
    : DEFAULT_SETTINGS;

  settingsCache.set(userId, { value, expiresAt: Date.now() + 5000 });
  return value;
}

export async function saveAppSettings(userId: string, settings: AppSettings) {
  const data = {
    maxConcurrentUploads: settings.maxConcurrentUploads,
    temporaryRetrySeconds: settings.temporaryRetrySeconds,
    quotaRetryMinutes: settings.quotaRetryMinutes,
    defaultPrivacy: settings.defaultPrivacy,
    defaultDescription: settings.defaultDescription,
    defaultTags: settings.defaultTags,
    defaultThumbnailDriveFileId: settings.defaultThumbnailDriveFileId,
    duplicateCheckEnabled: settings.duplicateCheckEnabled,
    adaptiveConcurrencyEnabled: settings.adaptiveConcurrencyEnabled,
  };

  await prisma.appSettings.upsert({
    where: { id: userId },
    update: data,
    create: { id: userId, ...data },
  });
  settingsCache.delete(userId);
  return getAppSettings(userId, { fresh: true });
}

export async function getHiddenJobIds(userId: string) {
  const jobs = await prisma.uploadJob.findMany({
    where: { userId },
    select: { id: true },
  });
  if (!jobs.length) return [];

  const rows = await prisma.hiddenUploadJob.findMany({
    where: { jobId: { in: jobs.map((job) => job.id) } },
    select: { jobId: true },
  });
  return rows.map((row) => row.jobId);
}

export async function setJobHidden(userId: string, jobId: string, hidden: boolean) {
  const owned = await prisma.uploadJob.findFirst({
    where: { id: jobId, userId },
    select: { id: true },
  });
  if (!owned) throw new Error("Tarefa não encontrada.");

  if (hidden) {
    await prisma.hiddenUploadJob.upsert({
      where: { jobId },
      update: { hiddenAt: new Date() },
      create: { jobId },
    });
  } else {
    await prisma.hiddenUploadJob.deleteMany({ where: { jobId } });
  }
}

export async function getNotificationsLastReadAt(userId: string) {
  await ensureUserRows(userId);
  const row = await prisma.notificationState.findUnique({ where: { id: userId } });
  return row?.lastReadAt ?? new Date(0);
}

export async function markNotificationsRead(userId: string) {
  const readAt = new Date();
  await prisma.notificationState.upsert({
    where: { id: userId },
    update: { lastReadAt: readAt },
    create: { id: userId, lastReadAt: readAt },
  });
  return readAt;
}
