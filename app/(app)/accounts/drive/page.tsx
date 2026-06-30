import { Cloud, ExternalLink, HardDrive, Plus, ShieldCheck } from "lucide-react";
import { prisma } from "@/lib/db";
import { PageHeader, EmptyState } from "@/components/ui";
import { DeleteAccountButton } from "@/components/delete-account-button";
import { Notice } from "@/components/notice";
import { formatDate } from "@/lib/utils";
import { requireUserSession } from "@/lib/tenant";

export const metadata = { title: "Google Drive" };

export default async function DriveAccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const params = await searchParams;
  const session = await requireUserSession();
  if (!session) return null;
  const accounts = await prisma.googleDriveAccount.findMany({
    where: { userId: session.userId, isActive: true } as never,
    include: { _count: { select: { uploadJobs: true } } },
    orderBy: { connectedAt: "desc" },
  });

  return (
    <>
      <PageHeader
        eyebrow="Contas"
        title="Google Drive"
        description="Conecte a conta que contém as pastas e os vídeos dos seus cursos."
        action={
          <a href="/api/oauth/google/drive" className="btn-primary">
            <Plus className="size-4" /> Conectar Google Drive
          </a>
        }
      />
      <Notice success={params.connected === "1"} error={params.error} />

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <div className="panel flex items-center gap-4 p-4">
          <div className="grid size-11 place-items-center rounded-xl bg-blue-50 text-blue-600"><Cloud className="size-5" /></div>
          <div><div className="text-xl font-extrabold text-slate-900">{accounts.length}</div><div className="text-xs text-slate-400">contas conectadas</div></div>
        </div>
        <div className="panel flex items-center gap-4 p-4">
          <div className="grid size-11 place-items-center rounded-xl bg-emerald-50 text-emerald-600"><ShieldCheck className="size-5" /></div>
          <div><div className="text-sm font-extrabold text-slate-800">OAuth 2.0</div><div className="text-xs text-slate-400">acesso somente leitura</div></div>
        </div>
        <div className="panel flex items-center gap-4 p-4">
          <div className="grid size-11 place-items-center rounded-xl bg-violet-50 text-violet-600"><HardDrive className="size-5" /></div>
          <div><div className="text-sm font-extrabold text-slate-800">Tokens seguros</div><div className="text-xs text-slate-400">criptografia AES-256-GCM</div></div>
        </div>
      </div>

      {accounts.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {accounts.map((account) => (
            <div key={account.id} className="panel flex items-center gap-4 p-5">
              {account.avatarUrl ? (
                <img src={account.avatarUrl} alt="" className="size-12 rounded-2xl object-cover" referrerPolicy="no-referrer" />
              ) : (
                <div className="grid size-12 place-items-center rounded-2xl bg-blue-50 text-blue-600"><Cloud className="size-5" /></div>
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-extrabold text-slate-800">{account.name}</div>
                <div className="mt-1 truncate text-xs text-slate-400">{account.email}</div>
                <div className="mt-2 flex items-center gap-2 text-[10px] font-semibold text-slate-400">
                  <span className="size-1.5 rounded-full bg-emerald-500" /> Ativa
                  <span>·</span><span>{account._count.uploadJobs} tarefas</span>
                  <span>·</span><span>{formatDate(account.connectedAt)}</span>
                </div>
              </div>
              <a href="/courses" className="grid size-9 place-items-center rounded-xl border border-slate-200 text-slate-400 hover:bg-slate-50" aria-label="Abrir cursos"><ExternalLink className="size-4" /></a>
              <DeleteAccountButton type="drive" id={account.id} name={account.name} />
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Cloud}
          title="Nenhuma conta Drive conectada"
          description="Conecte sua conta Google para navegar pelas pastas e encontrar automaticamente as aulas em vídeo."
          action={<a href="/api/oauth/google/drive" className="btn-primary"><Plus className="size-4" /> Conectar primeira conta</a>}
        />
      )}
    </>
  );
}
