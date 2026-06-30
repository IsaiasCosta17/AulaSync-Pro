import { ItemStatus, JobStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { runUploadJob } from "@/lib/upload-worker";
import { cleanErrorMessage } from "@/lib/utils";
import { requireUserSession } from "@/lib/tenant";

const schema = z.object({
  action: z.enum(["pause", "resume", "cancel", "retry"]),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  try {
    const session = await requireUserSession();
    if (!session) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
    const { action } = schema.parse(await request.json());
    const job = await prisma.uploadJob.findFirst({
      where: { id, userId: session.userId } as never,
      include: { driveAccount: true, channel: true },
    });
    if (!job) return NextResponse.json({ error: "Tarefa não encontrada." }, { status: 404 });

    if (action === "pause" && job.status !== JobStatus.RUNNING) {
      return NextResponse.json({ error: "Somente tarefas em andamento podem ser pausadas." }, { status: 409 });
    }
    if (action === "cancel" && (job.status === JobStatus.COMPLETED || job.status === JobStatus.CANCELLED)) {
      return NextResponse.json({ error: "Esta tarefa já foi encerrada." }, { status: 409 });
    }
    if (action === "retry" && job.status !== JobStatus.FAILED) {
      return NextResponse.json({ error: "Somente tarefas com erro podem ser reenviadas." }, { status: 409 });
    }
    if (action === "resume" && job.status !== JobStatus.PAUSED && job.status !== JobStatus.QUOTA_REACHED && job.status !== JobStatus.PENDING) {
      return NextResponse.json({ error: "Esta tarefa não pode ser retomada no estado atual." }, { status: 409 });
    }
    if (["resume", "retry"].includes(action) && (!job.driveAccount.isActive || !job.channel.isActive)) {
      return NextResponse.json({ error: "Reconecte a conta Drive e o canal YouTube antes de continuar." }, { status: 409 });
    }

    if (action === "pause") {
      await prisma.uploadJob.update({ where: { id }, data: { status: JobStatus.PAUSED } });
    } else if (action === "cancel") {
      await prisma.$transaction([
        prisma.uploadJob.update({ where: { id }, data: { status: JobStatus.CANCELLED } }),
        prisma.uploadItem.updateMany({
          where: { jobId: id, status: { in: [ItemStatus.PENDING, ItemStatus.ERROR] } },
          data: { status: ItemStatus.CANCELLED, encryptedResumableUri: null },
        }),
      ]);
    } else {
      if (action === "retry") {
        await prisma.uploadItem.updateMany({
          where: { jobId: id, status: ItemStatus.ERROR },
          data: { status: ItemStatus.PENDING, progress: 0, errorMessage: null },
        });
      }
      await prisma.uploadJob.update({
        where: { id },
        data: { status: JobStatus.PENDING, errorMessage: null, completedAt: null },
      });
      queueMicrotask(() => void runUploadJob(id));
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? cleanErrorMessage(error.message) : "Ação inválida.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
