import Link from "next/link";
import { ArrowLeft, Download, ExternalLink, FileVideo, ScrollText } from "lucide-react";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { PageHeader, StatusBadge } from "@/components/ui";
import { TaskActions } from "@/components/task-actions";
import { TaskAutoRefresh } from "@/components/task-auto-refresh";
import { cleanErrorMessage, formatBytes, formatDate } from "@/lib/utils";
import { requireUserSession } from "@/lib/tenant";

export default async function UploadDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireUserSession();
  if (!session) notFound();
  const job = await prisma.uploadJob.findFirst({
    where: { id, userId: session.userId } as never,
    include: {
      driveAccount: { select: { email: true, name: true } },
      channel: { select: { name: true } },
      playlist: { select: { name: true, youtubePlaylistId: true } },
      items: { orderBy: { sortOrder: "asc" } },
      logs: { orderBy: { createdAt: "desc" }, take: 300 },
    },
  });
  if (!job) notFound();

  const totalBytes = job.items.reduce((sum, item) => sum + Number(item.sizeBytes || 0), 0);
  const sentBytes = job.items.reduce((sum, item) => sum + (Number(item.sizeBytes || 0) * item.progress) / 100, 0);
  const elapsedSeconds = job.startedAt ? Math.max(1, (Date.now() - job.startedAt.getTime()) / 1000) : 0;
  const averageSpeed = elapsedSeconds ? sentBytes / elapsedSeconds : 0;
  const remainingSeconds = averageSpeed > 0 ? Math.max(0, (totalBytes - sentBytes) / averageSpeed) : 0;
  const originLabel = job.driveAccount?.email || "Computador/local";

  return (
    <>
      <TaskAutoRefresh active={["RUNNING", "PENDING", "QUOTA_REACHED"].includes(job.status)} />
      <PageHeader
        eyebrow="Detalhes da tarefa"
        title={job.courseName}
        description={`${originLabel} â†’ ${job.channel.name}`}
        action={<Link href="/uploads" className="btn-secondary"><ArrowLeft className="size-4" /> Voltar</Link>}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Summary label="Status" value={<StatusBadge status={job.status} />} />
        <Summary label="Progresso geral" value={`${job.progress}%`} />
        <Summary label="Velocidade mÃ©dia" value={averageSpeed ? `${formatBytes(Math.round(averageSpeed))}/s` : "calculando"} />
        <Summary label="Tempo restante" value={remainingSeconds ? formatDuration(remainingSeconds) : job.status === "COMPLETED" ? "concluÃ­do" : "calculando"} />
      </div>

      <div className="panel mb-6 p-5">
        <div className="mb-4 h-3 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-gradient-to-r from-brand-600 to-cyan-400" style={{ width: `${job.progress}%` }} />
        </div>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <TaskActions jobId={job.id} status={job.status} />
          <div className="flex flex-wrap gap-2">
            <a href={`/api/reports/csv?course=${encodeURIComponent(job.courseName)}`} className="btn-secondary"><Download className="size-4" /> CSV</a>
            <a href={`/api/reports/xlsx?course=${encodeURIComponent(job.courseName)}`} className="btn-secondary"><Download className="size-4" /> Excel</a>
          </div>
        </div>
        {job.errorMessage && <div className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700">{cleanErrorMessage(job.errorMessage)}</div>}
      </div>

      <section className="panel mb-6 overflow-hidden">
        <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
          <FileVideo className="size-5 text-brand-600" />
          <h2 className="text-sm font-extrabold text-slate-900">Aulas</h2>
          <span className="ml-auto text-xs font-bold text-slate-400">{job.items.length}</span>
        </div>
        <div className="divide-y divide-slate-100">
          {job.items.map((item, index) => (
            <div key={item.id} className="grid gap-3 px-5 py-4 md:grid-cols-[36px_1fr_180px_110px_40px] md:items-center">
              <div className="text-xs font-extrabold text-slate-400">{String(index + 1).padStart(2, "0")}</div>
              <div className="min-w-0">
                <div className="truncate text-xs font-extrabold text-slate-700">{item.title}</div>
                <div className="mt-1 text-[10px] text-slate-400">{item.moduleName || "Pasta principal"} Â· {formatBytes(item.sizeBytes)}</div>
                {item.errorMessage && <div className="mt-1 text-[10px] font-semibold text-rose-600">{cleanErrorMessage(item.errorMessage)}</div>}
              </div>
              <div>
                <div className="mb-1 text-right text-[9px] font-bold text-brand-600">{item.progress}%</div>
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-brand-500" style={{ width: `${item.progress}%` }} /></div>
              </div>
              <StatusBadge status={item.status} />
              {item.youtubeUrl ? <a href={item.youtubeUrl} target="_blank" rel="noreferrer" className="grid size-8 place-items-center rounded-lg border border-slate-200 text-slate-400 hover:text-brand-600"><ExternalLink className="size-3.5" /></a> : <span />}
            </div>
          ))}
        </div>
      </section>

      <section className="panel overflow-hidden">
        <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
          <ScrollText className="size-5 text-violet-600" />
          <h2 className="text-sm font-extrabold text-slate-900">Logs detalhados</h2>
        </div>
        <div className="max-h-[520px] divide-y divide-slate-100 overflow-y-auto">
          {job.logs.map((entry) => (
            <div key={entry.id} className="flex gap-4 px-5 py-3 text-xs">
              <span className="w-32 shrink-0 text-[10px] text-slate-400">{formatDate(entry.createdAt)}</span>
              <span className={entry.level === "error" ? "font-semibold text-rose-600" : entry.level === "warn" || entry.level === "retry" ? "font-semibold text-amber-600" : "text-slate-600"}>{cleanErrorMessage(entry.message)}</span>
            </div>
          ))}
          {!job.logs.length && <div className="p-8 text-center text-xs text-slate-400">Nenhum log registrado.</div>}
        </div>
      </section>
    </>
  );
}

function Summary({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="panel p-5"><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</div><div className="mt-2 text-lg font-extrabold text-slate-800">{value}</div></div>;
}

function formatDuration(seconds: number) {
  const rounded = Math.ceil(seconds);
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  if (hours) return `${hours}h ${minutes}min`;
  if (minutes) return `${minutes}min`;
  return `${rounded}s`;
}

