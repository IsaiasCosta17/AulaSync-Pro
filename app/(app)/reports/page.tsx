import { Download, ExternalLink, FileBarChart, Filter, Search } from "lucide-react";
import { prisma } from "@/lib/db";
import { PageHeader, EmptyState, StatusBadge } from "@/components/ui";
import { RetryButton } from "@/components/retry-button";
import { cleanErrorMessage, formatDate } from "@/lib/utils";
import { listReportItems } from "@/lib/report-query";
import { requireUserSession } from "@/lib/tenant";

export const metadata = { title: "Relatórios" };

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{
    channelId?: string;
    course?: string;
    lesson?: string;
    status?: string;
    errors?: string;
  }>;
}) {
  const params = await searchParams;
  const session = await requireUserSession();
  if (!session) return null;
  const onlyErrors = params.errors === "1";
  const filters = {
    channelId: params.channelId || undefined,
    course: params.course || undefined,
    lesson: params.lesson || undefined,
    status: params.status || undefined,
    onlyErrors,
  };
  const [channels, items, allItems] = await Promise.all([
    prisma.youtubeChannel.findMany({
      where: { userId: session.userId } as never,
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    listReportItems(session.userId, filters, 500),
    listReportItems(session.userId, {}),
  ]);
  const total = allItems.length;
  const uploaded = allItems.filter((item) => item.status === "UPLOADED").length;
  const errors = allItems.filter((item) => item.status === "ERROR").length;

  const query = new URLSearchParams();
  if (params.channelId) query.set("channelId", params.channelId);
  if (params.course) query.set("course", params.course);
  if (params.lesson) query.set("lesson", params.lesson);
  if (params.status) query.set("status", params.status);
  if (onlyErrors) query.set("errors", "1");
  const queryString = query.toString();

  return (
    <>
      <PageHeader
        eyebrow="Histórico detalhado"
        title="Relatórios"
        description="Filtre aulas, acompanhe resultados e exporte em CSV ou Excel."
        action={
          <div className="flex flex-wrap gap-2">
            <a href={`/api/reports/csv?${queryString}`} className="btn-secondary">
              <Download className="size-4" /> CSV
            </a>
            <a href={`/api/reports/xlsx?${queryString}`} className="btn-primary">
              <Download className="size-4" /> Excel
            </a>
          </div>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="panel p-5"><div className="text-2xl font-extrabold tracking-tight text-slate-900">{total}</div><div className="mt-1 text-xs font-bold text-slate-500">aulas processadas</div></div>
        <div className="panel p-5"><div className="text-2xl font-extrabold tracking-tight text-emerald-600">{uploaded}</div><div className="mt-1 text-xs font-bold text-slate-500">enviadas com sucesso</div></div>
        <div className="panel p-5"><div className="text-2xl font-extrabold tracking-tight text-rose-600">{errors}</div><div className="mt-1 text-xs font-bold text-slate-500">com erro permanente</div></div>
      </div>

      <form className="panel mb-6 grid gap-3 p-4 lg:grid-cols-6">
        <div className="relative lg:col-span-2">
          <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input name="course" defaultValue={params.course} className="field pl-10" placeholder="Buscar curso..." />
        </div>
        <input name="lesson" defaultValue={params.lesson} className="field" placeholder="Nome da aula..." />
        <select name="channelId" defaultValue={params.channelId || ""} className="field">
          <option value="">Todos os canais</option>
          {channels.map((channel) => <option key={channel.id} value={channel.id}>{channel.name}</option>)}
        </select>
        <select name="status" defaultValue={params.status || ""} className="field">
          <option value="">Todos os status</option>
          <option value="sent">Enviado</option>
          <option value="pending">Pendente</option>
          <option value="uploading">Enviando</option>
          <option value="error">Erro</option>
          <option value="quota">Quota</option>
          <option value="authorization">Autorização</option>
        </select>
        <button className="btn-secondary"><Filter className="size-4" /> Filtrar</button>
      </form>

      {items.length ? (
        <div className="table-shell overflow-x-auto">
          <table className="w-full min-w-[1180px] border-collapse">
            <thead className="table-head">
              <tr>
                <th className="px-5 py-3.5">Curso / aula</th>
                <th className="px-4 py-3.5">Conta Drive</th>
                <th className="px-4 py-3.5">Canal</th>
                <th className="px-4 py-3.5">Playlist</th>
                <th className="px-4 py-3.5">Status</th>
                <th className="px-4 py-3.5">Progresso</th>
                <th className="px-4 py-3.5">Data e hora</th>
                <th className="px-4 py-3.5">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((item) => (
                <tr key={item.id} className="text-xs transition hover:bg-slate-50/70">
                  <td className="max-w-[300px] px-5 py-4">
                    <div className="truncate font-extrabold text-slate-700">{item.title}</div>
                    <div className="mt-1 truncate text-[10px] text-slate-400">{item.job.courseName}{item.moduleName ? ` · ${item.moduleName}` : ""}</div>
                    {item.errorMessage && <div className="mt-1.5 line-clamp-2 text-[10px] font-semibold text-rose-600">{cleanErrorMessage(item.errorMessage)}</div>}
                  </td>
                  <td className="px-4 py-4 text-slate-500">{item.job.driveAccount?.email || "Computador/local"}</td>
                  <td className="px-4 py-4 font-bold text-slate-600">{item.job.channel.name}</td>
                  <td className="px-4 py-4 text-slate-500">{item.job.playlist?.name || "—"}</td>
                  <td className="px-4 py-4"><StatusBadge status={item.status} /></td>
                  <td className="px-4 py-4 font-bold text-slate-500">{item.progress}%</td>
                  <td className="whitespace-nowrap px-4 py-4 text-slate-400">{formatDate(item.updatedAt)}</td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2">
                      {item.status === "ERROR" && <RetryButton jobId={item.jobId} />}
                      {item.youtubeUrl && <a href={item.youtubeUrl} target="_blank" rel="noreferrer" className="grid size-8 place-items-center rounded-lg border border-slate-200 text-slate-400 hover:text-brand-600"><ExternalLink className="size-3.5" /></a>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState icon={FileBarChart} title="Nenhum resultado encontrado" description="Ajuste os filtros ou aguarde o processamento das aulas." />
      )}
    </>
  );
}
