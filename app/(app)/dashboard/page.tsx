import Link from "next/link";
import {
  AlertTriangle, ArrowRight, CheckCircle2, Cloud, FileVideo,
  PlayCircle, Plus, UploadCloud, Youtube,
} from "lucide-react";
import { prisma } from "@/lib/db";
import { PageHeader, StatCard, StatusBadge } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { getHiddenJobIds, getAppSettings } from "@/lib/settings";
import { requireUserSession } from "@/lib/tenant";

export const metadata = { title: "Visão geral" };

export default async function DashboardPage() {
  const session = await requireUserSession();
  if (!session) return null;
  const [hiddenJobIds, settings] = await Promise.all([getHiddenJobIds(session.userId), getAppSettings(session.userId)]);
  const visibleItemWhere = { job: { userId: session.userId }, ...(hiddenJobIds.length ? { jobId: { notIn: hiddenJobIds } } : {}) };
  const visibleJobWhere = { userId: session.userId, ...(hiddenJobIds.length ? { id: { notIn: hiddenJobIds } } : {}) };
  const [
    driveAccounts,
    youtubeChannels,
    uploadedLessons,
    errors,
    activeUploads,
    recentJobs,
  ] = await Promise.all([
    prisma.googleDriveAccount.count({ where: { userId: session.userId, isActive: true } as never }),
    prisma.youtubeChannel.count({ where: { userId: session.userId, isActive: true } as never }),
    prisma.uploadItem.count({ where: { status: "UPLOADED", ...visibleItemWhere } as never }),
    prisma.uploadItem.count({ where: { status: "ERROR", ...visibleItemWhere } as never }),
    prisma.uploadJob.count({ where: { status: "RUNNING", ...visibleJobWhere } as never }),
    prisma.uploadJob.findMany({
      where: visibleJobWhere as never,
      take: 5,
      include: {
        channel: { select: { name: true, avatarUrl: true } },
        items: { select: { status: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const connected = driveAccounts > 0 && youtubeChannels > 0;

  return (
    <>
      <PageHeader
        eyebrow="Central de operações"
        title="Visão geral"
        description="Acompanhe suas conexões e todos os envios de aulas em um só lugar."
        action={
          <Link href="/uploads/new" className="btn-primary">
            <Plus className="size-4" /> Novo upload
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Contas Drive" value={driveAccounts} note="fontes conectadas" icon={Cloud} tone="blue" />
        <StatCard label="Canais YouTube" value={youtubeChannels} note="destinos ativos" icon={Youtube} tone="red" />
        <StatCard label="Aulas enviadas" value={uploadedLessons} note="total processado" icon={CheckCircle2} tone="green" />
        <StatCard label="Erros" value={errors} note="precisam de atenção" icon={AlertTriangle} tone="orange" />
        <StatCard label="Em andamento" value={activeUploads} note="tarefas agora" icon={UploadCloud} tone="violet" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.45fr_.75fr]">
        <section className="panel overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-5 md:px-6">
            <div>
              <h2 className="text-base font-extrabold text-slate-900">Uploads recentes</h2>
              <p className="mt-1 text-xs text-slate-400">Progresso das últimas tarefas</p>
            </div>
            <Link href="/uploads" className="flex items-center gap-1 text-xs font-bold text-brand-600 hover:text-brand-700">
              Ver todos <ArrowRight className="size-3.5" />
            </Link>
          </div>
          {recentJobs.length ? (
            <div className="divide-y divide-slate-100">
              {recentJobs.map((job) => (
                <div key={job.id} className="flex flex-col gap-4 px-5 py-4 md:flex-row md:items-center md:px-6">
                  <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600">
                    <FileVideo className="size-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-extrabold text-slate-800">{job.courseName}</div>
                    <div className="mt-1 text-xs text-slate-400">{job.channel.name} · {formatDate(job.createdAt)}</div>
                  </div>
                  <div className="w-full md:w-40">
                    <div className="mb-1.5 flex justify-between text-[10px] font-bold text-slate-400">
                      <span>{job.items.filter((item) => item.status === "UPLOADED").length}/{job.items.length} aulas</span>
                      <span>{job.progress}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${job.progress}%` }} />
                    </div>
                  </div>
                  <StatusBadge status={job.status} />
                </div>
              ))}
            </div>
          ) : (
            <div className="flex min-h-56 flex-col items-center justify-center px-6 text-center">
              <div className="mb-4 grid size-12 place-items-center rounded-2xl bg-slate-100 text-slate-400"><UploadCloud className="size-5" /></div>
              <p className="text-sm font-bold text-slate-700">Nenhum upload por enquanto</p>
              <p className="mt-1 text-xs text-slate-400">Sua primeira sincronização aparecerá aqui.</p>
            </div>
          )}
        </section>

        <section className="panel p-5 md:p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-extrabold text-slate-900">Primeiros passos</h2>
              <p className="mt-1 text-xs text-slate-400">{connected ? "Tudo pronto para começar" : "Configure o seu espaço"}</p>
            </div>
            <div className="grid size-10 place-items-center rounded-xl bg-emerald-50 text-emerald-600">
              <PlayCircle className="size-5" />
            </div>
          </div>

          <div className="mt-6 space-y-3">
            {[
              { done: driveAccounts > 0, title: "Conecte o Google Drive", href: "/accounts/drive", detail: "Origem das suas aulas" },
              { done: youtubeChannels > 0, title: "Conecte um canal YouTube", href: "/accounts/youtube", detail: "Destino dos vídeos" },
              { done: uploadedLessons > 0, title: "Envie o primeiro curso", href: "/courses", detail: "Selecione uma pasta" },
            ].map((step, index) => (
              <Link key={step.title} href={step.href} className="group flex items-center gap-3 rounded-xl border border-slate-100 p-3 transition hover:border-brand-100 hover:bg-brand-50/40">
                <div className={`grid size-8 shrink-0 place-items-center rounded-full text-xs font-extrabold ${step.done ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                  {step.done ? <CheckCircle2 className="size-4" /> : index + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-extrabold text-slate-700">{step.title}</div>
                  <div className="mt-0.5 text-[11px] text-slate-400">{step.detail}</div>
                </div>
                <ArrowRight className="size-3.5 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-brand-500" />
              </Link>
            ))}
          </div>

          <div className="mt-6 rounded-2xl bg-[#111827] p-4 text-white">
            <div className="flex items-center justify-between text-xs font-bold">
              <span>Envios simultâneos</span><span>{settings.maxConcurrentUploads} aulas</span>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-cyan-400" style={{ width: "100%" }} />
            </div>
            <p className="mt-3 text-[10px] leading-4 text-slate-400">Sem limite interno de aulas por tarefa, com envio paralelo seguro e retomada automática.</p>
          </div>
        </section>
      </div>
    </>
  );
}
