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
  const account = await prisma.googleDriveAccount.findFirst({ where: { id, userId: session.userId } as never });
  if (!account) return NextResponse.json({ error: "Conta não encontrada." }, { status: 404 });

  const runningJobs = await prisma.uploadJob.count({
    where: { driveAccountId: id, status: { in: ["PENDING", "RUNNING"] } },
  });
  if (runningJobs) {
    return NextResponse.json(
      { error: "Cancele a tarefa pendente ou pause/cancele o upload em andamento antes de desconectar esta conta." },
      { status: 409 },
    );
  }

  if (account.encryptedTokens) {
    const credentials = decryptJson<Credentials>(account.encryptedTokens);
    const token = credentials.refresh_token || credentials.access_token;
    if (token) {
      const auth = createOAuthClient("drive");
      await auth.revokeToken(token).catch(() => undefined);
    }
  }

  await prisma.googleDriveAccount.update({
    where: { id },
    data: { isActive: false, encryptedTokens: "" },
  });
  return NextResponse.json({ ok: true });
}
