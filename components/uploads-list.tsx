"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle, Archive, ArchiveRestore, Ban, ChevronDown, ChevronUp, CirclePause, CirclePlay,
  ExternalLink, FileVideo, LoaderCircle, Plus, RefreshCw, Search, UploadCloud,
} from "lucide-react";
import { EmptyState, StatusBadge } from "@/components/ui";
import { cleanErrorMessage, formatBytes, formatDate } from "@/lib/utils";

type UploadItem = {
  id: string;
  title: string;
  moduleName: string | null;
  sizeBytes: string | null;
  status: string;
  progress: number;
  youtubeUrl: string | null;
  errorMessage: string | null;
};

type Job = {
  id: string;
  courseName: string;
  status: string;
  progress: number;
  privacyStatus: string;
  errorMessage: string | null;
  createdAt: string;
  startedAt: string | null;
  driveAccount: { name: string; email: string };
  channel: { name: string; avatarUrl: string | null };
  playlist: { name: string; youtubePlaylistId: string } | null;
  items: UploadItem[];
};

export function UploadsList({ showRemoved = false }: { showRemoved?: boolean }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [notification, setNotification] = useState("");
  const previousStatuses = useRef<Map<string, string>>(new Map());

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const response = await fetch(showRemoved ? "/api/uploads?removed=1" : "/api/uploads", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Falha ao carregar tarefas.");
      setJobs(data);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Falha ao carregar tarefas.");
    } finally {
      setLoading(false);
    }
  }, [showRemoved]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!jobs.some((job) => ["PENDING", "RUNNING", "QUOTA_REACHED"].includes(job.status))) return;
    const timer = window.setInterval(() => void load(true), 2200);
    return () => window.clearInterval(timer);
  }, [jobs, load]);

  useEffect(() => {
    if (!jobs.length) return;
    if (!previousStatuses.current.size) {
      previousStatuses.current = new Map(jobs.map((job) => [job.id, job.status]));
      return;
    }
    const completed = jobs.find((job) =>
      job.status === "COMPLETED" && previousStatuses.current.get(job.id) !== "COMPLETED"
    );
    previousStatuses.current = new Map(jobs.map((job) => [job.id, job.status]));
    if (!completed) return;
    setNotification(`Tarefa "${completed.courseName}" concluída com sucesso.`);
    const timer = window.setTimeout(() => setNotification(""), 6000);
    return () => window.clearTimeout(timer);
  }, [jobs]);

  const filteredJobs = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    return jobs.filter((job) => {
      const authorization = job.status === "PAUSED"
        && /reconect|autoriza|permiss/i.test(job.errorMessage || "");
      const statusMatches = statusFilter === "ALL"
        || (statusFilter === "UPLOADED" && job.status === "COMPLETED")
        || (statusFilter === "PENDING" && ["PENDING", "PAUSED"].includes(job.status) && !authorization)
        || (statusFilter === "UPLOADING" && job.status === "RUNNING")
        || (statusFilter === "ERROR" && (job.status === "FAILED" || job.items.some((item) => item.status === "ERROR")))
        || (statusFilter === "QUOTA" && job.status === "QUOTA_REACHED")
        || (statusFilter === "AUTHORIZATION" && authorization);
      if (!statusMatches) return false;
      if (!query) return true;
      return job.courseName.toLocaleLowerCase("pt-BR").includes(query)
        || job.items.some((item) => item.title.toLocaleLowerCase("pt-BR").includes(query));
    });
  }, [jobs, search, statusFilter]);

  async function historyAction(jobId: string, hidden: boolean) {
    if (hidden && !window.confirm("Remover esta tarefa do histórico visual? Os vídeos no YouTube e os arquivos no Drive não serão apagados.")) return;
    setActing(jobId);
    setError("");
    try {
      const response = await fetch(`/api/uploads/${jobId}/history`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hidden }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Não foi possível alterar o histórico.");
      await load(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Falha ao alterar o histórico.");
    } finally {
      setActing(null);
    }
  }

  async function action(jobId: string, value: "pause" | "resume" | "cancel" | "retry") {
    if (value === "cancel" && !window.confirm("Cancelar esta tarefa? Os vídeos já enviados permanecerão no YouTube.")) return;
    setActing(jobId);
    setError("");
    try {
      const response = await fetch(`/api/uploads/${jobId}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: value }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) setError(data.error || "Não foi possível executar a ação.");
      await load(true);
    } catch {
      setError("Não foi possível conectar ao servidor.");
    } finally {
      setActing(null);
    }
  }

  if (loading) {
    return <div className="panel flex min-h-72 items-center justify-center gap-3 text-sm font-bold text-slate-500"><LoaderCircle className="size-5 animate-spin text-brand-600" /> Carregando tarefas...</div>;
  }

  if (!jobs.length) {
    return (
      <EmptyState
        icon={UploadCloud}
        title={showRemoved ? "Nenhum histórico removido" : "Nenhuma tarefa de upload"}
        description={showRemoved ? "As tarefas removidas do histórico aparecerão aqui para restauração." : "Escolha um curso no Drive e prepare a primeira sincronização com o YouTube."}
        action={showRemoved ? undefined : <Link href="/courses" className="btn-primary"><Plus className="size-4" /> Criar primeiro upload</Link>}
      />
    );
  }

  return (
    <div className="space-y-4">
      {notification && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
          <UploadCloud className="size-4" />{notification}
        </div>
      )}
      {error && <div className="flex items-center gap-2 rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700"><AlertCircle className="size-4" />{error}</div>}
      <div className="panel grid gap-3 p-4 md:grid-cols-[1fr_230px]">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input
            className="field pl-10"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por curso ou nome da aula..."
          />
        </div>
        <select className="field" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="ALL">Todos os status</option>
          <option value="UPLOADED">Enviado</option>
          <option value="PENDING">Pendente</option>
          <option value="UPLOADING">Enviando</option>
          <option value="ERROR">Erro</option>
          <option value="QUOTA">Quota</option>
          <option value="AUTHORIZATION">Autorização</option>
        </select>
      </div>
      {!filteredJobs.length && (
        <div className="panel p-10 text-center text-sm font-semibold text-slate-400">
          Nenhuma tarefa corresponde aos filtros selecionados.
        </div>
      )}
      {filteredJobs.map((job) => {
        const uploaded = job.items.filter((item) => item.status === "UPLOADED").length;
        const isExpanded = expanded === job.id;
        const busy = acting === job.id;
        const totalBytes = job.items.reduce((sum, item) => sum + Number(item.sizeBytes || 0), 0);
        const sentBytes = job.items.reduce((sum, item) => sum + (Number(item.sizeBytes || 0) * item.progress) / 100, 0);
        const elapsedSeconds = job.startedAt ? Math.max(1, (Date.now() - new Date(job.startedAt).getTime()) / 1000) : 0;
        const averageSpeed = elapsedSeconds ? sentBytes / elapsedSeconds : 0;
        const etaSeconds = averageSpeed > 0 ? Math.max(0, (totalBytes - sentBytes) / averageSpeed) : 0;
        return (
          <article key={job.id} className="panel overflow-hidden">
            <div className="flex flex-col gap-5 p-5 md:p-6">
              <div className="flex flex-col gap-4 md:flex-row md:items-center">
                <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-600"><FileVideo className="size-5" /></div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate text-base font-extrabold text-slate-900">{job.courseName}</h2>
                    <StatusBadge status={job.status} />
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-400">
                    <span>{job.driveAccount.email}</span><span>→</span><span className="font-bold text-slate-500">{job.channel.name}</span><span>·</span><span>{formatDate(job.createdAt)}</span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {job.status === "RUNNING" && <button onClick={() => action(job.id, "pause")} disabled={busy} className="btn-secondary !h-9 !px-3"><CirclePause className="size-4" /> Pausar</button>}
                  {["PAUSED", "QUOTA_REACHED", "PENDING"].includes(job.status) && <button onClick={() => action(job.id, "resume")} disabled={busy} className="btn-secondary !h-9 !px-3"><CirclePlay className="size-4" /> Continuar</button>}
                  {job.status === "FAILED" && <button onClick={() => action(job.id, "retry")} disabled={busy} className="btn-secondary !h-9 !px-3"><RefreshCw className="size-4" /> Reenviar erros</button>}
                  {!["COMPLETED", "CANCELLED"].includes(job.status) && <button onClick={() => action(job.id, "cancel")} disabled={busy} className="grid size-9 place-items-center rounded-xl border border-slate-200 text-slate-400 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600" aria-label="Cancelar"><Ban className="size-4" /></button>}
                  <Link href={`/uploads/${job.id}`} className="btn-secondary !h-9 !px-3">Detalhes</Link>
                  <button
                    type="button"
                    onClick={() => historyAction(job.id, !showRemoved)}
                    disabled={busy}
                    className="btn-secondary !h-9 !px-3"
                  >
                    {showRemoved ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
                    {showRemoved ? "Restaurar histórico" : "Remover do histórico"}
                  </button>
                  {busy && <LoaderCircle className="size-4 animate-spin text-brand-600" />}
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-500">{uploaded} de {job.items.length} aulas enviadas</span>
                  <span className="font-extrabold text-slate-700">{job.progress}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className={`h-full rounded-full transition-all duration-500 ${job.status === "FAILED" ? "bg-rose-500" : "bg-gradient-to-r from-brand-500 to-cyan-400"}`} style={{ width: `${job.progress}%` }} />
                </div>
                <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[10px] font-semibold text-slate-400">
                  <span>Velocidade média: <b className="text-slate-600">{averageSpeed > 0 ? `${formatBytes(Math.round(averageSpeed))}/s` : "calculando..."}</b></span>
                  <span>Tempo estimado: <b className="text-slate-600">{etaSeconds > 0 ? formatDuration(etaSeconds) : job.status === "COMPLETED" ? "concluído" : "calculando..."}</b></span>
                </div>
                {job.errorMessage && <div className="mt-3 flex items-start gap-2 rounded-xl bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-700"><AlertCircle className="mt-0.5 size-3.5 shrink-0" />{cleanErrorMessage(job.errorMessage)}</div>}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
                <div className="flex flex-wrap gap-4 text-[11px] text-slate-400">
                  <span>Playlist: <b className="text-slate-600">{job.playlist?.name || "Criando..."}</b></span>
                  <span>Privacidade: <b className="text-slate-600">{job.privacyStatus === "unlisted" ? "Não listado" : job.privacyStatus === "private" ? "Privado" : "Público"}</b></span>
                </div>
                <button type="button" onClick={() => setExpanded(isExpanded ? null : job.id)} className="flex items-center gap-1.5 text-xs font-bold text-brand-600">
                  {isExpanded ? "Ocultar aulas" : "Ver aulas"} {isExpanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                </button>
              </div>
            </div>

            {isExpanded && (
              <div className="border-t border-slate-100 bg-slate-50/60 px-5 py-3 md:px-6">
                <div className="divide-y divide-slate-200/70">
                  {job.items.map((item, index) => (
                    <div key={item.id} className="flex flex-col gap-2 py-3.5 md:flex-row md:items-center">
                      <span className="w-7 text-[10px] font-extrabold text-slate-400">{String(index + 1).padStart(2, "0")}</span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-extrabold text-slate-700">{item.title}</div>
                        <div className="mt-1 text-[10px] text-slate-400">{item.moduleName || "Pasta principal"} · {formatBytes(item.sizeBytes)}</div>
                        {item.errorMessage && <div className="mt-1 text-[10px] font-semibold text-rose-600">{cleanErrorMessage(item.errorMessage)}</div>}
                      </div>
                      {item.status === "UPLOADING" && <div className="w-28"><div className="mb-1 text-right text-[9px] font-bold text-brand-600">{item.progress}%</div><div className="h-1 rounded-full bg-slate-200"><div className="h-full rounded-full bg-brand-500" style={{ width: `${item.progress}%` }} /></div></div>}
                      <StatusBadge status={item.status} />
                      {item.youtubeUrl && <a href={item.youtubeUrl} target="_blank" rel="noreferrer" className="grid size-8 place-items-center rounded-lg border border-slate-200 bg-white text-slate-400 hover:text-brand-600" aria-label="Abrir no YouTube"><ExternalLink className="size-3.5" /></a>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}


function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "calculando...";
  const rounded = Math.ceil(seconds);
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  if (hours) return `${hours}h ${minutes}min`;
  if (minutes) return `${minutes}min`;
  return `${rounded}s`;
}
