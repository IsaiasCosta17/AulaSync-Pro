import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { runUploadJob } from "@/lib/upload-worker";
import { youtubeClient } from "@/lib/google";
import { getHiddenJobIds } from "@/lib/settings";
import { cleanErrorMessage } from "@/lib/utils";
import { requireUserSession } from "@/lib/tenant";
import { isSupportedVideoName, localVideoStats } from "@/lib/local-videos";

const itemSchema = z.object({
  id: z.string().min(1),
  sourceType: z.enum(["drive", "local"]).optional(),
  localPath: z.string().min(1).max(800).nullable().optional(),
  driveResourceKey: z.string().max(200).nullable().optional(),
  name: z.string().min(1),
  title: z.string().trim().min(1).max(100),
  mimeType: z.string().min(1),
  size: z.string().regex(/^\d+$/).nullable().optional(),
  moduleName: z.string().nullable().optional(),
});

const createSchema = z.object({
  sourceType: z.enum(["drive", "local"]).optional(),
  driveAccountId: z.string().min(1).nullable().optional(),
  channelId: z.string().min(1),
  folderId: z.string().min(1),
  courseName: z.string().trim().min(1).max(150),
  playlistName: z.string().trim().min(1).max(150),
  existingPlaylistId: z.string().min(1).nullable().optional(),
  privacyStatus: z.enum(["unlisted", "private", "public"]),
  videos: z.array(itemSchema).min(1),
});

function serializeJob<T>(job: T): T {
  return JSON.parse(JSON.stringify(job, (_, value) => typeof value === "bigint" ? value.toString() : value));
}

export async function GET(request: Request) {
  const session = await requireUserSession();
  if (!session) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  const jobs = await prisma.uploadJob.findMany({
    where: { userId: session.userId } as never,
    include: {
      driveAccount: { select: { name: true, email: true } },
      channel: { select: { name: true, avatarUrl: true } },
      playlist: { select: { name: true, youtubePlaylistId: true } },
      items: {
        select: {
          id: true,
          title: true,
          moduleName: true,
          sizeBytes: true,
          status: true,
          progress: true,
          youtubeUrl: true,
          errorMessage: true,
          uploadedAt: true,
          sortOrder: true,
        },
        orderBy: { sortOrder: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  const hiddenJobIds = await getHiddenJobIds(session.userId);
  const hiddenSet = new Set(hiddenJobIds);
  const showRemoved = new URL(request.url).searchParams.get("removed") === "1";
  const resultJobs = jobs.filter((job) => showRemoved ? hiddenSet.has(job.id) : !hiddenSet.has(job.id));

  jobs
    .filter((job) => ["RUNNING", "PENDING", "QUOTA_REACHED"].includes(job.status))
    .forEach((job) => queueMicrotask(() => void runUploadJob(job.id)));

  return NextResponse.json(serializeJob(resultJobs));
}

export async function POST(request: Request) {
  try {
    const session = await requireUserSession();
    if (!session) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
    const body = createSchema.parse(await request.json());
    if (new Set(body.videos.map((video) => video.id)).size !== body.videos.length) {
      return NextResponse.json({ error: "A lista contém aulas duplicadas." }, { status: 400 });
    }
    const sourceType = body.sourceType || (body.videos.every((video) => video.sourceType === "local") ? "local" : "drive");
    const usesDrive = sourceType === "drive" || body.videos.some((video) => (video.sourceType || sourceType) === "drive");
    if (usesDrive && !body.driveAccountId) {
      return NextResponse.json({ error: "Selecione a conta Google Drive para aulas do Drive." }, { status: 400 });
    }
    const localVideos = body.videos.filter((video) => (video.sourceType || sourceType) === "local");
    if (localVideos.length) {
      for (const video of localVideos) {
        if (!video.localPath) return NextResponse.json({ error: `Arquivo local ausente em ${video.name}.` }, { status: 400 });
        if (!isSupportedVideoName(video.name)) return NextResponse.json({ error: `Formato não suportado em ${video.name}.` }, { status: 400 });
        const stats = await localVideoStats(session.userId, video.localPath).catch(() => null);
        if (!stats?.isFile() || stats.size <= 0) {
          return NextResponse.json({ error: `O arquivo local ${video.name} não foi importado corretamente.` }, { status: 400 });
        }
        if (video.size && BigInt(video.size) !== BigInt(stats.size)) {
          return NextResponse.json({ error: `O arquivo local ${video.name} está incompleto. Importe novamente.` }, { status: 400 });
        }
      }
    }
    const [driveAccount, channel] = await Promise.all([
      body.driveAccountId
        ? prisma.googleDriveAccount.findFirst({ where: { id: body.driveAccountId, userId: session.userId, isActive: true } as never })
        : Promise.resolve(null),
      prisma.youtubeChannel.findFirst({ where: { id: body.channelId, userId: session.userId, isActive: true } as never }),
    ]);
    if ((usesDrive && !driveAccount) || !channel) {
      return NextResponse.json({ error: "Conta Drive ou canal YouTube não encontrado." }, { status: 404 });
    }

    let resolvedPlaylistName = body.playlistName;
    let selectedPlaylistDbId: string | null = null;

    if (body.existingPlaylistId) {
      const youtube = youtubeClient(channel);
      const response = await youtube.playlists.list({
        part: ["snippet", "status"],
        id: [body.existingPlaylistId],
        maxResults: 1,
      });
      const existingPlaylist = response.data.items?.[0];
      if (!existingPlaylist?.id || existingPlaylist.snippet?.channelId !== channel.youtubeChannelId) {
        return NextResponse.json(
          { error: "A playlist selecionada não pertence ao canal escolhido." },
          { status: 400 },
        );
      }
      resolvedPlaylistName = existingPlaylist.snippet.title || body.playlistName;
      const savedPlaylistRecord = await prisma.playlist.findFirst({
        where: { youtubePlaylistId: existingPlaylist.id, channelId: channel.id },
      });
      const playlistData = {
        name: resolvedPlaylistName,
        privacyStatus: existingPlaylist.status?.privacyStatus || "private",
        channelId: channel.id,
        youtubePlaylistId: existingPlaylist.id,
      };
      const savedPlaylist = savedPlaylistRecord
        ? await prisma.playlist.update({
            where: { id: savedPlaylistRecord.id },
            data: playlistData,
          })
        : await prisma.playlist.create({ data: playlistData });
      selectedPlaylistDbId = savedPlaylist.id;
    }

    const driveFolder = usesDrive && body.driveAccountId
      ? await prisma.driveFolder.upsert({
          where: {
            driveAccountId_driveFolderId: {
              driveAccountId: body.driveAccountId,
              driveFolderId: body.folderId,
            },
          },
          update: { name: body.courseName },
          create: {
            driveAccountId: body.driveAccountId,
            driveFolderId: body.folderId,
            name: body.courseName,
          },
        })
      : null;

    const job = await prisma.uploadJob.create({
      data: ({
        userId: session.userId,
        courseName: resolvedPlaylistName,
        privacyStatus: body.privacyStatus,
        driveAccountId: body.driveAccountId || null,
        channelId: body.channelId,
        driveFolderId: driveFolder?.id || null,
        playlistId: selectedPlaylistDbId,
        items: {
          create: body.videos.map((video, index) => ({
            driveFileId: video.id,
            sourceType: video.sourceType || sourceType,
            localPath: video.localPath || null,
            driveResourceKey: video.driveResourceKey || null,
            originalName: video.name,
            title: video.title,
            moduleName: video.moduleName || null,
            sortOrder: index,
            mimeType: video.mimeType,
            sizeBytes: video.size ? BigInt(video.size) : null,
          })),
        },
      } as never),
    });

    queueMicrotask(() => void runUploadJob(job.id));
    return NextResponse.json({ id: job.id }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message || "Dados inválidos." }, { status: 400 });
    }
    const message = error instanceof Error ? cleanErrorMessage(error.message) : "Não foi possível criar o upload.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
