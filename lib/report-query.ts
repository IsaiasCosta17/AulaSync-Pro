import { ItemStatus, JobStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getHiddenJobIds } from "@/lib/settings";

export type ReportFilters = {
  channelId?: string;
  course?: string;
  lesson?: string;
  status?: string;
  onlyErrors?: boolean;
};

const itemStatuses: Record<string, ItemStatus> = {
  sent: ItemStatus.UPLOADED,
  uploaded: ItemStatus.UPLOADED,
  pending: ItemStatus.PENDING,
  uploading: ItemStatus.UPLOADING,
  error: ItemStatus.ERROR,
};

export async function listReportItems(userId: string, filters: ReportFilters, take?: number) {
  const hiddenJobIds = await getHiddenJobIds(userId);
  const normalizedStatus = filters.status?.toLowerCase();
  const itemStatus = filters.onlyErrors
    ? ItemStatus.ERROR
    : normalizedStatus
      ? itemStatuses[normalizedStatus]
      : undefined;
  const jobStatus = normalizedStatus === "quota"
    ? JobStatus.QUOTA_REACHED
    : normalizedStatus === "authorization"
      ? JobStatus.PAUSED
      : undefined;

  const where: Prisma.UploadItemWhereInput = {
    title: filters.lesson ? { contains: filters.lesson } : undefined,
    status: itemStatus,
    job: {
      userId,
      id: hiddenJobIds.length ? { notIn: hiddenJobIds } : undefined,
      channelId: filters.channelId,
      courseName: filters.course ? { contains: filters.course } : undefined,
      status: jobStatus,
    },
  } as Prisma.UploadItemWhereInput;

  return prisma.uploadItem.findMany({
    where,
    include: {
      job: {
        include: {
          driveAccount: true,
          channel: true,
          playlist: true,
        },
      },
    },
    orderBy: { updatedAt: "desc" },
    take,
  });
}
