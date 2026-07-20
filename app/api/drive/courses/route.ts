import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { scanCourseFolder, scanCourseFromDriveLink } from "@/lib/google";
import { cleanErrorMessage } from "@/lib/utils";
import { requireUserSession } from "@/lib/tenant";

export async function GET(request: Request) {
  const session = await requireUserSession();
  if (!session) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  const url = new URL(request.url);
  const accountId = url.searchParams.get("accountId");
  const folderId = url.searchParams.get("folderId");
  const link = url.searchParams.get("link");
  if (!accountId || (!folderId && !link)) {
    return NextResponse.json({ error: "Conta e pasta são obrigatórias." }, { status: 400 });
  }

  try {
    const account = await prisma.googleDriveAccount.findFirstOrThrow({ where: { id: accountId, userId: session.userId, isActive: true } as never });
    const course = link
      ? await scanCourseFromDriveLink(account, link)
      : await scanCourseFolder(account, folderId!);
    return NextResponse.json(course);
  } catch (error) {
    const message = error instanceof Error ? cleanErrorMessage(error.message) : "Falha ao ler a pasta do curso.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
