import { prisma } from "@/lib/db";
import { getValidatedSession } from "@/lib/user-access";
import type { SessionPayload } from "@/lib/auth";

let tenantSchemaPromise: Promise<void> | null = null;

async function hasColumn(table: string, column: string) {
  const rows = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
    `PRAGMA table_info("${table.replaceAll('"', '')}")`,
  );
  return rows.some((row) => row.name === column);
}

export async function ensureTenantSchema() {
  if (!tenantSchemaPromise) {
    tenantSchemaPromise = (async () => {
      for (const table of ["GoogleDriveAccount", "YoutubeChannel", "UploadJob"]) {
        if (!(await hasColumn(table, "userId"))) {
          await prisma.$executeRawUnsafe(
            `ALTER TABLE "${table}" ADD COLUMN "userId" TEXT`,
          );
        }
      }

      const admins = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
        'SELECT u."id" FROM "User" u JOIN "UserAccess" a ON a."userId" = u."id" ' +
        'WHERE a."role" = \'ADMIN\' AND a."isActive" = 1 ORDER BY u."createdAt" ASC LIMIT 1',
      );
      const fallbackUsers = await prisma.user.findMany({
        select: { id: true },
        orderBy: { createdAt: "asc" },
        take: 1,
      });
      const ownerId = admins[0]?.id || fallbackUsers[0]?.id;
      if (!ownerId) return;

      await prisma.$executeRawUnsafe(
        'UPDATE "GoogleDriveAccount" SET "userId" = ? WHERE "userId" IS NULL OR "userId" = \'\'',
        ownerId,
      );
      await prisma.$executeRawUnsafe(
        'UPDATE "YoutubeChannel" SET "userId" = ? WHERE "userId" IS NULL OR "userId" = \'\'',
        ownerId,
      );
      await prisma.$executeRawUnsafe(
        'UPDATE "UploadJob" SET "userId" = ? WHERE "userId" IS NULL OR "userId" = \'\'',
        ownerId,
      );

      await prisma.$executeRawUnsafe(
        'INSERT OR IGNORE INTO "AppSettings" SELECT ?, "maxConcurrentUploads", "temporaryRetrySeconds", ' +
        '"quotaRetryMinutes", "defaultPrivacy", "defaultDescription", "defaultTags", ' +
        '"defaultThumbnailDriveFileId", "duplicateCheckEnabled", "adaptiveConcurrencyEnabled", CURRENT_TIMESTAMP ' +
        'FROM "AppSettings" WHERE "id" = \'global\'',
        ownerId,
      ).catch(() => undefined);
      await prisma.$executeRawUnsafe(
        'INSERT OR IGNORE INTO "NotificationState" ("id", "lastReadAt") ' +
        'SELECT ?, "lastReadAt" FROM "NotificationState" WHERE "id" = \'global\'',
        ownerId,
      ).catch(() => undefined);
    })().catch((error) => {
      tenantSchemaPromise = null;
      throw error;
    });
  }
  return tenantSchemaPromise;
}

export async function requireUserSession(): Promise<SessionPayload | null> {
  const session = await getValidatedSession();
  if (!session) return null;
  await ensureTenantSchema();
  return session;
}

export function tenantWhere(userId: string) {
  return { userId } as Record<string, unknown>;
}

export async function ownsDriveAccount(userId: string, accountId: string) {
  await ensureTenantSchema();
  return prisma.googleDriveAccount.findFirst({
    where: { id: accountId, userId } as never,
  });
}

export async function ownsYoutubeChannel(userId: string, channelId: string) {
  await ensureTenantSchema();
  return prisma.youtubeChannel.findFirst({
    where: { id: channelId, userId } as never,
  });
}

export async function ownsUploadJob(userId: string, jobId: string) {
  await ensureTenantSchema();
  return prisma.uploadJob.findFirst({
    where: { id: jobId, userId } as never,
  });
}
