import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { listDriveFolder } from "@/lib/google";
import { cleanErrorMessage } from "@/lib/utils";
import { requireUserSession } from "@/lib/tenant";

export async function GET(request: Request) {
  const session = await requireUserSession();
  if (!session) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  const url = new URL(request.url);
  const accountId = url.searchParams.get("accountId");
  const parentId = url.searchParams.get("parentId") || "root";
  if (!accountId) return NextResponse.json({ error: "Selecione uma conta Drive." }, { status: 400 });

  try {
    const account = await prisma.googleDriveAccount.findFirstOrThrow({ where: { id: accountId, userId: session.userId, isActive: true } as never });
    const result = await listDriveFolder(account, parentId);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? cleanErrorMessage(error.message) : "Falha ao listar o Drive.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
