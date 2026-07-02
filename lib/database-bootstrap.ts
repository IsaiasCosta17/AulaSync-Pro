import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";

const schemaStatements = [
  "CREATE TABLE IF NOT EXISTS \"AppSettings\" (\n    \"id\" TEXT NOT NULL PRIMARY KEY,\n    \"maxConcurrentUploads\" INTEGER NOT NULL DEFAULT 3,\n    \"temporaryRetrySeconds\" INTEGER NOT NULL DEFAULT 15,\n    \"quotaRetryMinutes\" INTEGER NOT NULL DEFAULT 60,\n    \"defaultPrivacy\" TEXT NOT NULL DEFAULT 'unlisted',\n    \"defaultDescription\" TEXT NOT NULL DEFAULT 'Enviado com AulaSync Pro.',\n    \"defaultTags\" TEXT NOT NULL DEFAULT '',\n    \"defaultThumbnailDriveFileId\" TEXT,\n    \"duplicateCheckEnabled\" BOOLEAN NOT NULL DEFAULT true,\n    \"adaptiveConcurrencyEnabled\" BOOLEAN NOT NULL DEFAULT true,\n    \"updatedAt\" DATETIME NOT NULL\n)",
  "CREATE TABLE IF NOT EXISTS \"DriveFolder\" (\n    \"id\" TEXT NOT NULL PRIMARY KEY,\n    \"driveFolderId\" TEXT NOT NULL,\n    \"name\" TEXT NOT NULL,\n    \"parentId\" TEXT,\n    \"path\" TEXT,\n    \"driveAccountId\" TEXT NOT NULL,\n    \"createdAt\" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,\n    CONSTRAINT \"DriveFolder_driveAccountId_fkey\" FOREIGN KEY (\"driveAccountId\") REFERENCES \"GoogleDriveAccount\" (\"id\") ON DELETE CASCADE ON UPDATE CASCADE\n)",
  "CREATE TABLE IF NOT EXISTS \"GoogleDriveAccount\" (\n    \"id\" TEXT NOT NULL PRIMARY KEY,\n    \"googleAccountId\" TEXT NOT NULL,\n    \"name\" TEXT NOT NULL,\n    \"email\" TEXT NOT NULL,\n    \"avatarUrl\" TEXT,\n    \"encryptedTokens\" TEXT NOT NULL,\n    \"scopes\" TEXT NOT NULL,\n    \"isActive\" BOOLEAN NOT NULL DEFAULT true,\n    \"connectedAt\" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,\n    \"updatedAt\" DATETIME NOT NULL\n, \"userId\" TEXT)",
  "CREATE TABLE IF NOT EXISTS \"HiddenUploadJob\" (\"jobId\" TEXT NOT NULL PRIMARY KEY,\"hiddenAt\" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)",
  "CREATE TABLE IF NOT EXISTS \"Log\" (\n    \"id\" TEXT NOT NULL PRIMARY KEY,\n    \"level\" TEXT NOT NULL,\n    \"message\" TEXT NOT NULL,\n    \"metadata\" TEXT,\n    \"jobId\" TEXT,\n    \"createdAt\" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,\n    CONSTRAINT \"Log_jobId_fkey\" FOREIGN KEY (\"jobId\") REFERENCES \"UploadJob\" (\"id\") ON DELETE CASCADE ON UPDATE CASCADE\n)",
  "CREATE TABLE IF NOT EXISTS \"NotificationState\" (\n    \"id\" TEXT NOT NULL PRIMARY KEY,\n    \"lastReadAt\" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP\n)",
  "CREATE TABLE IF NOT EXISTS \"Playlist\" (\n    \"id\" TEXT NOT NULL PRIMARY KEY,\n    \"youtubePlaylistId\" TEXT NOT NULL,\n    \"name\" TEXT NOT NULL,\n    \"privacyStatus\" TEXT NOT NULL DEFAULT 'unlisted',\n    \"channelId\" TEXT NOT NULL,\n    \"createdAt\" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,\n    CONSTRAINT \"Playlist_channelId_fkey\" FOREIGN KEY (\"channelId\") REFERENCES \"YoutubeChannel\" (\"id\") ON DELETE CASCADE ON UPDATE CASCADE\n)",
  "CREATE TABLE IF NOT EXISTS \"UploadItem\" (\n    \"id\" TEXT NOT NULL PRIMARY KEY,\n    \"jobId\" TEXT NOT NULL,\n    \"driveFileId\" TEXT NOT NULL,\n    \"originalName\" TEXT NOT NULL,\n    \"title\" TEXT NOT NULL,\n    \"moduleName\" TEXT,\n    \"sortOrder\" INTEGER NOT NULL,\n    \"mimeType\" TEXT NOT NULL,\n    \"sizeBytes\" BIGINT,\n    \"status\" TEXT NOT NULL DEFAULT 'PENDING',\n    \"progress\" INTEGER NOT NULL DEFAULT 0,\n    \"youtubeVideoId\" TEXT,\n    \"youtubeUrl\" TEXT,\n    \"errorMessage\" TEXT,\n    \"encryptedResumableUri\" TEXT,\n    \"uploadedAt\" DATETIME,\n    \"createdAt\" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,\n    \"updatedAt\" DATETIME NOT NULL,\n    CONSTRAINT \"UploadItem_jobId_fkey\" FOREIGN KEY (\"jobId\") REFERENCES \"UploadJob\" (\"id\") ON DELETE CASCADE ON UPDATE CASCADE\n)",
  "CREATE TABLE IF NOT EXISTS \"UploadJob\" (\n    \"id\" TEXT NOT NULL PRIMARY KEY,\n    \"courseName\" TEXT NOT NULL,\n    \"status\" TEXT NOT NULL DEFAULT 'PENDING',\n    \"progress\" INTEGER NOT NULL DEFAULT 0,\n    \"privacyStatus\" TEXT NOT NULL DEFAULT 'unlisted',\n    \"errorMessage\" TEXT,\n    \"startedAt\" DATETIME,\n    \"completedAt\" DATETIME,\n    \"createdAt\" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,\n    \"updatedAt\" DATETIME NOT NULL,\n    \"driveAccountId\" TEXT NOT NULL,\n    \"channelId\" TEXT NOT NULL,\n    \"driveFolderId\" TEXT NOT NULL,\n    \"playlistId\" TEXT, \"userId\" TEXT,\n    CONSTRAINT \"UploadJob_driveAccountId_fkey\" FOREIGN KEY (\"driveAccountId\") REFERENCES \"GoogleDriveAccount\" (\"id\") ON DELETE RESTRICT ON UPDATE CASCADE,\n    CONSTRAINT \"UploadJob_channelId_fkey\" FOREIGN KEY (\"channelId\") REFERENCES \"YoutubeChannel\" (\"id\") ON DELETE RESTRICT ON UPDATE CASCADE,\n    CONSTRAINT \"UploadJob_driveFolderId_fkey\" FOREIGN KEY (\"driveFolderId\") REFERENCES \"DriveFolder\" (\"id\") ON DELETE RESTRICT ON UPDATE CASCADE,\n    CONSTRAINT \"UploadJob_playlistId_fkey\" FOREIGN KEY (\"playlistId\") REFERENCES \"Playlist\" (\"id\") ON DELETE SET NULL ON UPDATE CASCADE\n)",
  "CREATE TABLE IF NOT EXISTS \"UploadJobLease\" (\"jobId\" TEXT NOT NULL PRIMARY KEY,\"ownerId\" TEXT NOT NULL,\"expiresAt\" DATETIME NOT NULL)",
  "CREATE TABLE IF NOT EXISTS \"User\" (\n    \"id\" TEXT NOT NULL PRIMARY KEY,\n    \"name\" TEXT NOT NULL,\n    \"email\" TEXT NOT NULL,\n    \"passwordHash\" TEXT NOT NULL,\n    \"createdAt\" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,\n    \"updatedAt\" DATETIME NOT NULL\n)",
  "CREATE TABLE IF NOT EXISTS \"UserAccess\" (\n    \"userId\" TEXT NOT NULL PRIMARY KEY,\n    \"role\" TEXT NOT NULL DEFAULT 'OPERATOR',\n    \"isActive\" BOOLEAN NOT NULL DEFAULT true,\n    \"mustChangePassword\" BOOLEAN NOT NULL DEFAULT true,\n    \"sessionVersion\" INTEGER NOT NULL DEFAULT 1,\n    \"lastLoginAt\" DATETIME,\n    \"createdById\" TEXT,\n    \"updatedAt\" DATETIME NOT NULL\n)",
  "CREATE TABLE IF NOT EXISTS \"YoutubeChannel\" (\n    \"id\" TEXT NOT NULL PRIMARY KEY,\n    \"youtubeChannelId\" TEXT NOT NULL,\n    \"name\" TEXT NOT NULL,\n    \"email\" TEXT NOT NULL,\n    \"avatarUrl\" TEXT,\n    \"encryptedTokens\" TEXT NOT NULL,\n    \"scopes\" TEXT NOT NULL,\n    \"isActive\" BOOLEAN NOT NULL DEFAULT true,\n    \"dailyUploadCount\" INTEGER NOT NULL DEFAULT 0,\n    \"dailyCounterDate\" TEXT,\n    \"connectedAt\" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,\n    \"updatedAt\" DATETIME NOT NULL\n, \"userId\" TEXT)",
  "CREATE UNIQUE INDEX IF NOT EXISTS \"DriveFolder_driveAccountId_driveFolderId_key\" ON \"DriveFolder\"(\"driveAccountId\", \"driveFolderId\")",
  "CREATE UNIQUE INDEX IF NOT EXISTS \"GoogleDriveAccount_userId_googleAccountId_key\" ON \"GoogleDriveAccount\"(\"userId\", \"googleAccountId\")",
  "CREATE INDEX IF NOT EXISTS \"GoogleDriveAccount_userId_isActive_idx\" ON \"GoogleDriveAccount\"(\"userId\", \"isActive\")",
  "CREATE UNIQUE INDEX IF NOT EXISTS \"Playlist_channelId_youtubePlaylistId_key\" ON \"Playlist\"(\"channelId\", \"youtubePlaylistId\")",
  "CREATE UNIQUE INDEX IF NOT EXISTS \"UploadItem_jobId_driveFileId_key\" ON \"UploadItem\"(\"jobId\", \"driveFileId\")",
  "CREATE INDEX IF NOT EXISTS \"UploadJob_userId_status_idx\" ON \"UploadJob\"(\"userId\", \"status\")",
  "CREATE UNIQUE INDEX IF NOT EXISTS \"User_email_key\" ON \"User\"(\"email\")",
  "CREATE INDEX IF NOT EXISTS \"YoutubeChannel_userId_isActive_idx\" ON \"YoutubeChannel\"(\"userId\", \"isActive\")",
  "CREATE UNIQUE INDEX IF NOT EXISTS \"YoutubeChannel_userId_youtubeChannelId_key\" ON \"YoutubeChannel\"(\"userId\", \"youtubeChannelId\")"
] as const;

let initialization: Promise<void> | undefined;

async function initializeDatabase() {
  // Algumas hospedagens gerenciadas limitam PRAGMAs. Essas otimizações são
  // opcionais e nunca podem impedir a criação do banco ou o login.
  for (const pragma of [
    "PRAGMA busy_timeout = 15000",
    "PRAGMA journal_mode = WAL",
    "PRAGMA synchronous = NORMAL",
  ]) {
    await prisma.$queryRawUnsafe(pragma).catch(() => undefined);
  }

  for (const statement of schemaStatements) {
    await prisma.$executeRawUnsafe(statement);
  }

  const email = (process.env.ADMIN_EMAIL || "admin@aulasync.pro").trim().toLowerCase();
  const name = (process.env.ADMIN_NAME || "Administrador").trim();
  const password = process.env.ADMIN_PASSWORD || "troque-esta-senha";
  const passwordHash = await bcrypt.hash(password, 12);
  const forcePasswordReset = process.env.ADMIN_FORCE_PASSWORD_RESET === "true";

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      name,
      ...(forcePasswordReset ? { passwordHash } : {}),
    },
    create: { email, name, passwordHash },
  });

  await prisma.userAccess.upsert({
    where: { userId: user.id },
    update: { role: "ADMIN", isActive: true, mustChangePassword: false },
    create: {
      userId: user.id,
      role: "ADMIN",
      isActive: true,
      mustChangePassword: false,
      sessionVersion: 1,
    },
  });

  await prisma.appSettings.upsert({
    where: { id: user.id },
    update: {},
    create: { id: user.id },
  });

  await prisma.notificationState.upsert({
    where: { id: user.id },
    update: {},
    create: { id: user.id },
  });
}

export function ensureDatabaseReady() {
  initialization ??= initializeDatabase().catch((error) => {
    initialization = undefined;
    throw error;
  });
  return initialization;
}
