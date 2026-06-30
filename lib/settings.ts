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

let schemaReady: Promise<void> | null = null;
const settingsCache = new Map<string, { value: AppSettings; expiresAt: number }>();

export function ensureRuntimeSchema() {
  if (!schemaReady) {
    schemaReady = (async () => {
      await prisma.$executeRawUnsafe(
        'CREATE TABLE IF NOT EXISTS "AppSettings" (' +
        '"id" TEXT NOT NULL PRIMARY KEY,' +
        '"maxConcurrentUploads" INTEGER NOT NULL DEFAULT 3,' +
        '"temporaryRetrySeconds" INTEGER NOT NULL DEFAULT 15,' +
        '"quotaRetryMinutes" INTEGER NOT NULL DEFAULT 60,' +
        '"defaultPrivacy" TEXT NOT NULL DEFAULT \'unlisted\',' +
        '"defaultDescription" TEXT NOT NULL DEFAULT \'Enviado com AulaSync Pro.\',' +
        '"defaultTags" TEXT NOT NULL DEFAULT \'\',' +
        '"defaultThumbnailDriveFileId" TEXT,' +
        '"duplicateCheckEnabled" INTEGER NOT NULL DEFAULT 1,' +
        '"adaptiveConcurrencyEnabled" INTEGER NOT NULL DEFAULT 1,' +
        '"updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP' +
        ')',
      );
      await prisma.$executeRawUnsafe(
        'CREATE TABLE IF NOT EXISTS "NotificationState" (' +
        '"id" TEXT NOT NULL PRIMARY KEY,' +
        '"lastReadAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP' +
        ')',
      );
      await prisma.$executeRawUnsafe(
        'CREATE TABLE IF NOT EXISTS "HiddenUploadJob" (' +
        '"jobId" TEXT NOT NULL PRIMARY KEY,' +
        '"hiddenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP' +
        ')',
      );
    })().catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  return schemaReady;
}

async function ensureUserRows(userId: string) {
  await ensureRuntimeSchema();
  await prisma.$executeRawUnsafe(
    'INSERT OR IGNORE INTO "AppSettings" (' +
    '"id", "maxConcurrentUploads", "temporaryRetrySeconds", "quotaRetryMinutes", ' +
    '"defaultPrivacy", "defaultDescription", "defaultTags", ' +
    '"duplicateCheckEnabled", "adaptiveConcurrencyEnabled", "updatedAt"' +
    ') VALUES (?, 3, 15, 60, \'unlisted\', \'Enviado com AulaSync Pro.\', \'\', 1, 1, CURRENT_TIMESTAMP)',
    userId,
  );
  await prisma.$executeRawUnsafe(
    'INSERT OR IGNORE INTO "NotificationState" ("id", "lastReadAt") VALUES (?, \'1970-01-01 00:00:00\')',
    userId,
  );
}

type RawSettings = Omit<AppSettings, "duplicateCheckEnabled" | "adaptiveConcurrencyEnabled"> & {
  duplicateCheckEnabled: number | boolean;
  adaptiveConcurrencyEnabled: number | boolean;
};

export async function getAppSettings(userId = "global", options?: { fresh?: boolean }) {
  const cached = settingsCache.get(userId);
  if (!options?.fresh && cached && cached.expiresAt > Date.now()) return cached.value;
  await ensureUserRows(userId);
  const rows = await prisma.$queryRawUnsafe<RawSettings[]>(
    'SELECT "maxConcurrentUploads", "temporaryRetrySeconds", "quotaRetryMinutes", ' +
    '"defaultPrivacy", "defaultDescription", "defaultTags", "defaultThumbnailDriveFileId", ' +
    '"duplicateCheckEnabled", "adaptiveConcurrencyEnabled" FROM "AppSettings" WHERE "id" = ? LIMIT 1',
    userId,
  );
  const row = rows[0];
  const value: AppSettings = row ? {
    ...row,
    defaultPrivacy: ["unlisted", "private", "public"].includes(row.defaultPrivacy)
      ? row.defaultPrivacy
      : DEFAULT_SETTINGS.defaultPrivacy,
    duplicateCheckEnabled: Boolean(row.duplicateCheckEnabled),
    adaptiveConcurrencyEnabled: Boolean(row.adaptiveConcurrencyEnabled),
  } : DEFAULT_SETTINGS;
  settingsCache.set(userId, { value, expiresAt: Date.now() + 5000 });
  return value;
}

export async function saveAppSettings(userId: string, settings: AppSettings) {
  await ensureUserRows(userId);
  await prisma.$executeRawUnsafe(
    'UPDATE "AppSettings" SET ' +
    '"maxConcurrentUploads" = ?, "temporaryRetrySeconds" = ?, "quotaRetryMinutes" = ?, ' +
    '"defaultPrivacy" = ?, "defaultDescription" = ?, "defaultTags" = ?, ' +
    '"defaultThumbnailDriveFileId" = ?, "duplicateCheckEnabled" = ?, ' +
    '"adaptiveConcurrencyEnabled" = ?, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = ?',
    settings.maxConcurrentUploads,
    settings.temporaryRetrySeconds,
    settings.quotaRetryMinutes,
    settings.defaultPrivacy,
    settings.defaultDescription,
    settings.defaultTags,
    settings.defaultThumbnailDriveFileId,
    settings.duplicateCheckEnabled ? 1 : 0,
    settings.adaptiveConcurrencyEnabled ? 1 : 0,
    userId,
  );
  settingsCache.delete(userId);
  return getAppSettings(userId, { fresh: true });
}

export async function getHiddenJobIds(userId: string) {
  await ensureRuntimeSchema();
  const rows = await prisma.$queryRawUnsafe<Array<{ jobId: string }>>(
    'SELECT h."jobId" FROM "HiddenUploadJob" h ' +
    'JOIN "UploadJob" j ON j."id" = h."jobId" WHERE j."userId" = ?',
    userId,
  );
  return rows.map((row) => row.jobId);
}

export async function setJobHidden(userId: string, jobId: string, hidden: boolean) {
  await ensureRuntimeSchema();
  const owned = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    'SELECT "id" FROM "UploadJob" WHERE "id" = ? AND "userId" = ? LIMIT 1',
    jobId,
    userId,
  );
  if (!owned[0]) throw new Error("Tarefa não encontrada.");
  if (hidden) {
    await prisma.$executeRawUnsafe(
      'INSERT INTO "HiddenUploadJob" ("jobId", "hiddenAt") VALUES (?, CURRENT_TIMESTAMP) ' +
      'ON CONFLICT("jobId") DO UPDATE SET "hiddenAt" = CURRENT_TIMESTAMP',
      jobId,
    );
  } else {
    await prisma.$executeRawUnsafe('DELETE FROM "HiddenUploadJob" WHERE "jobId" = ?', jobId);
  }
}

export async function getNotificationsLastReadAt(userId: string) {
  await ensureUserRows(userId);
  const rows = await prisma.$queryRawUnsafe<Array<{ lastReadAt: Date | string }>>(
    'SELECT "lastReadAt" FROM "NotificationState" WHERE "id" = ? LIMIT 1',
    userId,
  );
  return rows[0]?.lastReadAt ? new Date(rows[0].lastReadAt) : new Date(0);
}

export async function markNotificationsRead(userId: string) {
  await ensureUserRows(userId);
  const readAt = new Date();
  await prisma.$executeRawUnsafe(
    'UPDATE "NotificationState" SET "lastReadAt" = ? WHERE "id" = ?',
    readAt,
    userId,
  );
  return readAt;
}
