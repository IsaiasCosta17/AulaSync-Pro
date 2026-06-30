import type { Credentials } from "google-auth-library";
import { NextResponse } from "next/server";
import { decryptJson } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { createOAuthClient } from "@/lib/google";
import { requireUserSession } from "@/lib/tenant";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const session = await requireUserSession();
  if (!session) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  const channel = await prisma.youtubeChannel.findFirst({ where: { id, userId: session.userId } as never });
  if (!channel) return NextResponse.json({ error: "Canal não encontrado." }, { status: 404 });

  const runningJobs = await prisma.uploadJob.count({
    where: { channelId: id, status: { in: ["PENDING", "RUNNING"] } },
  });
  if (runningJobs) {
    return NextResponse.json(
      { error: "Cancele a tarefa pendente ou pause/cancele o upload em andamento antes de desconectar este canal." },
      { status: 409 },
    );
  }

  if (channel.encryptedTokens) {
    const credentials = decryptJson<Credentials>(channel.encryptedTokens);
    const token = credentials.refresh_token || credentials.access_token;
    if (token) {
      const auth = createOAuthClient("youtube");
      await auth.revokeToken(token).catch(() => undefined);
    }
  }

  await prisma.youtubeChannel.update({
    where: { id },
    data: { isActive: false, encryptedTokens: "" },
  });
  return NextResponse.json({ ok: true });
}
