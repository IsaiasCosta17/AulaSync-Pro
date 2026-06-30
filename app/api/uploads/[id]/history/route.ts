import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { setJobHidden } from "@/lib/settings";
import { cleanErrorMessage } from "@/lib/utils";
import { requireUserSession } from "@/lib/tenant";

const schema = z.object({ hidden: z.boolean() });

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireUserSession();
    if (!session) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
    const { id } = await context.params;
    const { hidden } = schema.parse(await request.json());
    const job = await prisma.uploadJob.findFirst({
      where: { id, userId: session.userId } as never,
      select: { id: true },
    });
    if (!job) {
      return NextResponse.json({ error: "Tarefa não encontrada." }, { status: 404 });
    }
    await setJobHidden(session.userId, id, hidden);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? cleanErrorMessage(error.message) : "Ação inválida.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
