import { Gauge, Plus, ShieldCheck, Youtube } from "lucide-react";
import { prisma } from "@/lib/db";
import { PageHeader, EmptyState } from "@/components/ui";
import { DeleteAccountButton } from "@/components/delete-account-button";
import { Notice } from "@/components/notice";
import { formatDate } from "@/lib/utils";
import { requireUserSession } from "@/lib/tenant";

export const metadata = { title: "Canais YouTube" };

export default async function YoutubeAccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const params = await searchParams;
  const session = await requireUserSession();
  if (!session) return null;
  const channels = await prisma.youtubeChannel.findMany({
    where: { userId: session.userId, isActive: true } as never,
    include: { _count: { select: { uploadJobs: true, playlists: true } } },
    orderBy: { connectedAt: "desc" },
  });
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <PageHeader
        eyebrow="Contas"
        title="Canais YouTube"
        description="Conecte os canais que receberão as playlists e aulas dos seus cursos."
        action={
          <a href="/api/oauth/google/youtube" className="btn-primary">
            <Plus className="size-4" /> Conectar canal
          </a>
        }
      />
      <Notice success={params.connected === "1"} error={params.error} />

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <div className="panel flex items-center gap-4 p-4">
          <div className="grid size-11 place-items-center rounded-xl bg-rose-50 text-rose-600"><Youtube className="size-5" /></div>
          <div><div className="text-xl font-extrabold text-slate-900">{channels.length}</div><div className="text-xs text-slate-400">canais conectados</div></div>
        </div>
        <div className="panel flex items-center gap-4 p-4">
          <div className="grid size-11 place-items-center rounded-xl bg-emerald-50 text-emerald-600"><ShieldCheck className="size-5" /></div>
          <div><div className="text-sm font-extrabold text-slate-800">Escopos validados</div><div className="text-xs text-slate-400">upload e playlists</div></div>
        </div>
        <div className="panel flex items-center gap-4 p-4">
          <div className="grid size-11 place-items-center rounded-xl bg-orange-50 text-orange-600"><Gauge className="size-5" /></div>
          <div><div className="text-sm font-extrabold text-slate-800">Sem limite interno</div><div className="text-xs text-slate-400">respeita somente a quota do YouTube</div></div>
        </div>
      </div>

      {channels.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {channels.map((channel) => (
            <div key={channel.id} className="panel p-5">
              <div className="flex items-center gap-4">
                {channel.avatarUrl ? (
                  <img src={channel.avatarUrl} alt="" className="size-12 rounded-2xl object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <div className="grid size-12 place-items-center rounded-2xl bg-rose-50 text-rose-600"><Youtube className="size-5" /></div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-extrabold text-slate-800">{channel.name}</div>
                  <div className="mt-1 truncate text-xs text-slate-400">{channel.email}</div>
                  <div className="mt-2 text-[10px] font-semibold text-slate-400">Conectado em {formatDate(channel.connectedAt)}</div>
                </div>
                <DeleteAccountButton type="youtube" id={channel.id} name={channel.name} />
              </div>
              <div className="mt-5 grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-3 text-center">
                <div><div className="text-sm font-extrabold text-slate-800">{channel._count.uploadJobs}</div><div className="text-[10px] text-slate-400">tarefas</div></div>
                <div className="border-x border-slate-200"><div className="text-sm font-extrabold text-slate-800">{channel._count.playlists}</div><div className="text-[10px] text-slate-400">playlists</div></div>
                <div><div className="text-sm font-extrabold text-slate-800">{channel.dailyCounterDate === today ? channel.dailyUploadCount : 0}</div><div className="text-[10px] text-slate-400">enviados hoje</div></div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Youtube}
          title="Nenhum canal YouTube conectado"
          description="Conecte um canal com permissão para criar playlists e fazer upload dos vídeos."
          action={<a href="/api/oauth/google/youtube" className="btn-primary"><Plus className="size-4" /> Conectar primeiro canal</a>}
        />
      )}
    </>
  );
}
