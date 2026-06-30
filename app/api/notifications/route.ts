import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  getNotificationsLastReadAt,
  markNotificationsRead,
} from "@/lib/settings";
import { cleanErrorMessage } from "@/lib/utils";
import { requireUserSession } from "@/lib/tenant";

const notificationLevels = ["success", "warn", "error", "retry"];

export async function GET() {
  const session = await requireUserSession();
  if (!session) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  const lastReadAt = await getNotificationsLastReadAt(session.userId);
  const [logs, unreadCount] = await Promise.all([
    prisma.log.findMany({
      where: { level: { in: notificationLevels }, job: { userId: session.userId } } as never,
      include: {
        job: {
          select: {
            id: true,
            courseName: true,
            status: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    prisma.log.count({
      where: {
        level: { in: notificationLevels },
        createdAt: { gt: lastReadAt },
        job: { userId: session.userId },
      } as never,
    }),
  ]);

  return NextResponse.json({
    unreadCount: Math.min(unreadCount, 99),
    items: logs.map((entry) => ({
      id: entry.id,
      level: entry.level,
      message: cleanErrorMessage(entry.message),
      createdAt: entry.createdAt,
      unread: entry.createdAt > lastReadAt,
      href: entry.jobId ? "/uploads/" + entry.jobId : null,
      courseName: entry.job?.courseName || null,
      jobStatus: entry.job?.status || null,
    })),
  });
}

export async function POST() {
  const session = await requireUserSession();
  if (!session) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  const readAt = await markNotificationsRead(session.userId);
  return NextResponse.json({ ok: true, readAt });
}
