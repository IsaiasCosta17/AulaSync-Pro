import { prisma } from "@/lib/db";
import { getValidatedSession } from "@/lib/user-access";
import type { SessionPayload } from "@/lib/auth";

let tenantSchemaPromise: Promise<void> | null = null;

export async function ensureTenantSchema() {
  if (!tenantSchemaPromise) {
    tenantSchemaPromise = (async () => {
      const adminAccess = await prisma.userAccess.findFirst({
        where: { role: "ADMIN", isActive: true },
        orderBy: { updatedAt: "asc" },
        select: { userId: true },
      });
      const fallbackUser = await prisma.user.findFirst({
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });
      const ownerId = adminAccess?.userId || fallbackUser?.id;
      if (!ownerId) return;

      await Promise.all([
        prisma.googleDriveAccount.updateMany({
          where: { OR: [{ userId: null }, { userId: "" }] },
          data: { userId: ownerId },
        }),
        prisma.youtubeChannel.updateMany({
          where: { OR: [{ userId: null }, { userId: "" }] },
          data: { userId: ownerId },
        }),
        prisma.uploadJob.updateMany({
          where: { OR: [{ userId: null }, { userId: "" }] },
          data: { userId: ownerId },
        }),
      ]);

      const globalSettings = await prisma.appSettings.findUnique({ where: { id: "global" } });
      if (globalSettings) {
        await prisma.appSettings.upsert({
          where: { id: ownerId },
          update: {},
          create: {
            id: ownerId,
            maxConcurrentUploads: globalSettings.maxConcurrentUploads,
            temporaryRetrySeconds: globalSettings.temporaryRetrySeconds,
            quotaRetryMinutes: globalSettings.quotaRetryMinutes,
            defaultPrivacy: globalSettings.defaultPrivacy,
            defaultDescription: globalSettings.defaultDescription,
            defaultTags: globalSettings.defaultTags,
            defaultThumbnailDriveFileId: globalSettings.defaultThumbnailDriveFileId,
            duplicateCheckEnabled: globalSettings.duplicateCheckEnabled,
            adaptiveConcurrencyEnabled: globalSettings.adaptiveConcurrencyEnabled,
          },
        });
      }

      const globalNotifications = await prisma.notificationState.findUnique({
        where: { id: "global" },
      });
      if (globalNotifications) {
        await prisma.notificationState.upsert({
          where: { id: ownerId },
          update: {},
          create: { id: ownerId, lastReadAt: globalNotifications.lastReadAt },
        });
      }
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
    where: { id: accountId, userId },
  });
}

export async function ownsYoutubeChannel(userId: string, channelId: string) {
  await ensureTenantSchema();
  return prisma.youtubeChannel.findFirst({
    where: { id: channelId, userId },
  });
}

export async function ownsUploadJob(userId: string, jobId: string) {
  await ensureTenantSchema();
  return prisma.uploadJob.findFirst({
    where: { id: jobId, userId },
  });
}
