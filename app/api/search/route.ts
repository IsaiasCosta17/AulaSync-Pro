import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getHiddenJobIds } from "@/lib/settings";
import { requireUserSession } from "@/lib/tenant";

export async function GET(request: Request) {
  const session = await requireUserSession();
  if (!session) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  const query = new URL(request.url).searchParams.get("q")?.trim() || "";
  if (query.length < 2) return NextResponse.json({ results: [] });

  const hiddenJobIds = await getHiddenJobIds(session.userId);
  const visibleJob = { userId: session.userId, ...(hiddenJobIds.length ? { id: { notIn: hiddenJobIds } } : {}) };

  const [jobs, lessons, channels, accounts] = await Promise.all([
    prisma.uploadJob.findMany({
      where: {
        ...visibleJob,
        courseName: { contains: query },
      } as never,
      select: {
        id: true,
        courseName: true,
        status: true,
        updatedAt: true,
        channel: { select: { name: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 6,
    }),
    prisma.uploadItem.findMany({
      where: {
        title: { contains: query },
        job: visibleJob,
      } as never,
      select: {
        id: true,
        title: true,
        moduleName: true,
        status: true,
        updatedAt: true,
        job: {
          select: {
            id: true,
            courseName: true,
            channel: { select: { name: true } },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 6,
    }),
    prisma.youtubeChannel.findMany({
      where: {
        userId: session.userId,
        isActive: true,
        OR: [
          { name: { contains: query } },
          { email: { contains: query } },
        ],
      } as never,
      select: { id: true, name: true, email: true },
      orderBy: { updatedAt: "desc" },
      take: 4,
    }),
    prisma.googleDriveAccount.findMany({
      where: {
        userId: session.userId,
        isActive: true,
        OR: [
          { name: { contains: query } },
          { email: { contains: query } },
        ],
      } as never,
      select: { id: true, name: true, email: true },
      orderBy: { updatedAt: "desc" },
      take: 4,
    }),
  ]);

  const results = [
    ...jobs.map((job) => ({
      id: "job-" + job.id,
      type: "upload",
      title: job.courseName,
      subtitle: job.channel.name + " · " + job.status,
      href: "/uploads/" + job.id,
      status: job.status,
    })),
    ...lessons.map((lesson) => ({
      id: "lesson-" + lesson.id,
      type: "lesson",
      title: lesson.title,
      subtitle: lesson.job.courseName + " · " + lesson.job.channel.name,
      href: "/uploads/" + lesson.job.id,
      status: lesson.status,
    })),
    ...channels.map((channel) => ({
      id: "channel-" + channel.id,
      type: "channel",
      title: channel.name,
      subtitle: channel.email,
      href: "/accounts/youtube",
      status: "CONNECTED",
    })),
    ...accounts.map((account) => ({
      id: "drive-" + account.id,
      type: "drive",
      title: account.name,
      subtitle: account.email,
      href: "/accounts/drive",
      status: "CONNECTED",
    })),
  ].slice(0, 16);

  return NextResponse.json({ results });
}
