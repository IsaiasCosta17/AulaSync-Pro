import type { LucideIcon } from "lucide-react";
import { Inbox, LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-7 flex flex-col justify-between gap-4 md:flex-row md:items-end">
      <div>
        {eyebrow && <div className="mb-2 text-xs font-extrabold uppercase tracking-[0.16em] text-brand-600">{eyebrow}</div>}
        <h1 className="text-[28px] font-extrabold tracking-[-0.04em] text-slate-900 md:text-[32px]">{title}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">{description}</p>
      </div>
      {action}
    </div>
  );
}

export function StatCard({
  label,
  value,
  note,
  icon: Icon,
  tone = "blue",
}: {
  label: string;
  value: string | number;
  note: string;
  icon: LucideIcon;
  tone?: "blue" | "green" | "violet" | "red" | "orange";
}) {
  const tones = {
    blue: "bg-blue-50 text-blue-600",
    green: "bg-emerald-50 text-emerald-600",
    violet: "bg-violet-50 text-violet-600",
    red: "bg-rose-50 text-rose-600",
    orange: "bg-orange-50 text-orange-600",
  };
  return (
    <div className="panel p-5">
      <div className="mb-5 flex items-start justify-between">
        <div className={cn("grid size-11 place-items-center rounded-xl", tones[tone])}><Icon className="size-5" /></div>
        <span className="rounded-lg bg-slate-50 px-2 py-1 text-[10px] font-bold text-slate-400">AGORA</span>
      </div>
      <div className="text-3xl font-extrabold tracking-[-0.04em] text-slate-900">{value}</div>
      <div className="mt-1 text-sm font-bold text-slate-700">{label}</div>
      <div className="mt-2 text-xs text-slate-400">{note}</div>
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string; dot: string }> = {
    PENDING: { label: "Pendente", className: "bg-amber-50 text-amber-700", dot: "bg-amber-500" },
    RUNNING: { label: "Enviando", className: "bg-blue-50 text-blue-700", dot: "bg-blue-500 pulse-soft" },
    UPLOADING: { label: "Enviando", className: "bg-blue-50 text-blue-700", dot: "bg-blue-500 pulse-soft" },
    UPLOADED: { label: "Enviado", className: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-500" },
    COMPLETED: { label: "Concluído", className: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-500" },
    PAUSED: { label: "Pausado", className: "bg-slate-100 text-slate-600", dot: "bg-slate-400" },
    ERROR: { label: "Erro", className: "bg-rose-50 text-rose-700", dot: "bg-rose-500" },
    FAILED: { label: "Com erros", className: "bg-rose-50 text-rose-700", dot: "bg-rose-500" },
    CANCELLED: { label: "Cancelado", className: "bg-slate-100 text-slate-600", dot: "bg-slate-400" },
    QUOTA_REACHED: { label: "Limite diário", className: "bg-orange-50 text-orange-700", dot: "bg-orange-500" },
  };
  const item = config[status] || config.PENDING;
  return (
    <span className={cn("inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-[11px] font-bold", item.className)}>
      <span className={cn("size-1.5 rounded-full", item.dot)} />
      {item.label}
    </span>
  );
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="panel flex min-h-72 flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-slate-100 text-slate-500"><Icon className="size-6" /></div>
      <h3 className="text-base font-extrabold text-slate-800">{title}</h3>
      <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function LoadingBlock({ label = "Carregando..." }: { label?: string }) {
  return (
    <div className="flex min-h-48 items-center justify-center gap-3 text-sm font-semibold text-slate-500">
      <LoaderCircle className="size-5 animate-spin text-brand-600" /> {label}
    </div>
  );
}
