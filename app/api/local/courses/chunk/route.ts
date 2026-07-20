import { NextResponse } from "next/server";
import { requireUserSession } from "@/lib/tenant";
import { cleanErrorMessage } from "@/lib/utils";
import { localVideoStats, writeLocalVideoChunk } from "@/lib/local-videos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_CHUNK_BYTES = 12 * 1024 * 1024;

export async function PUT(request: Request) {
  try {
    const session = await requireUserSession();
    if (!session) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
    const url = new URL(request.url);
    const localPath = url.searchParams.get("localPath") || "";
    const offset = Number(url.searchParams.get("offset") || "0");
    const expectedSize = Number(url.searchParams.get("size") || "0");
    if (!localPath) return NextResponse.json({ error: "Arquivo local não informado." }, { status: 400 });
    if (!Number.isInteger(offset) || offset < 0) return NextResponse.json({ error: "Posição do bloco inválida." }, { status: 400 });
    if (!Number.isInteger(expectedSize) || expectedSize <= 0) return NextResponse.json({ error: "Tamanho do arquivo inválido." }, { status: 400 });

    const arrayBuffer = await request.arrayBuffer();
    if (arrayBuffer.byteLength <= 0) return NextResponse.json({ error: "Bloco vazio." }, { status: 400 });
    if (arrayBuffer.byteLength > MAX_CHUNK_BYTES) {
      return NextResponse.json({ error: "Bloco muito grande. Atualize a página e tente novamente." }, { status: 413 });
    }
    if (offset + arrayBuffer.byteLength > expectedSize) {
      return NextResponse.json({ error: "Bloco maior que o arquivo original." }, { status: 400 });
    }

    await writeLocalVideoChunk(session.userId, localPath, offset, Buffer.from(arrayBuffer));
    const stats = await localVideoStats(session.userId, localPath);
    return NextResponse.json({
      ok: true,
      receivedBytes: stats.size,
      complete: stats.size >= expectedSize,
    });
  } catch (error) {
    const message = error instanceof Error ? cleanErrorMessage(error.message) : "Não foi possível salvar o bloco do vídeo.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
