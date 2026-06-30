import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { youtubeClient } from "@/lib/google";
import { friendlyGoogleError } from "@/lib/resumable-upload";
import { requireUserSession } from "@/lib/tenant";

export async function GET(request: Request) {
  const session = await requireUserSession();
  if (!session) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  const url = new URL(request.url);
  const channelId = url.searchParams.get("channelId");
  if (!channelId) {
    return NextResponse.json({ error: "Selecione um canal YouTube." }, { status: 400 });
  }

  try {
    const channel = await prisma.youtubeChannel.findFirst({
      where: { id: channelId, userId: session.userId, isActive: true } as never,
    });
    if (!channel) {
      return NextResponse.json({ error: "Canal YouTube não encontrado." }, { status: 404 });
    }

    const youtube = youtubeClient(channel);
    const playlists: Array<{
      id: string;
      name: string;
      privacyStatus: string;
      itemCount: number;
    }> = [];
    let pageToken: string | undefined;

    do {
      const response = await youtube.playlists.list({
        part: ["snippet", "status", "contentDetails"],
        mine: true,
        maxResults: 50,
        pageToken,
      });
      for (const playlist of response.data.items ?? []) {
        if (!playlist.id) continue;
        playlists.push({
          id: playlist.id,
          name: playlist.snippet?.title || "Playlist sem nome",
          privacyStatus: playlist.status?.privacyStatus || "private",
          itemCount: playlist.contentDetails?.itemCount || 0,
        });
      }
      pageToken = response.data.nextPageToken || undefined;
    } while (pageToken);

    playlists.sort((a, b) => a.name.localeCompare(b.name, "pt-BR", {
      numeric: true,
      sensitivity: "base",
    }));
    return NextResponse.json({ playlists });
  } catch (error) {
    return NextResponse.json({ error: friendlyGoogleError(error) }, { status: 500 });
  }
}
