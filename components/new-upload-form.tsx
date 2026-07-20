"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle, Check, CheckCircle2, ChevronDown, FileVideo, FolderOpen,
  Globe2, ListVideo, LoaderCircle, Lock, Play, UploadCloud, WandSparkles, Youtube,
} from "lucide-react";
import { formatBytes } from "@/lib/utils";

type Account = { id: string; name: string; email: string };
type Channel = { id: string; name: string; email: string; avatarUrl: string | null };
type ExistingPlaylist = { id: string; name: string; privacyStatus: string; itemCount: number };
type Video = {
  id: string;
  sourceType?: "drive" | "local";
  localPath?: string | null;
  driveResourceKey?: string | null;
  name: string;
  title: string;
  mimeType: string;
  size: string | null;
  moduleName: string | null;
  modulePath: string;
};

export function NewUploadForm({
  accounts,
  channels,
  initialAccountId,
  initialFolderId,
  defaultPrivacy,
}: {
  accounts: Account[];
  channels: Channel[];
  initialAccountId?: string;
  initialFolderId?: string;
  defaultPrivacy: "unlisted" | "private" | "public";
}) {
  const router = useRouter();
  const [accountId, setAccountId] = useState(initialAccountId || "");
  const [folderId, setFolderId] = useState(initialFolderId || "");
  const [course, setCourse] = useState<{ folder: { id: string; name: string }; videos: Video[] } | null>(null);
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<string[]>([]);
  const [channelId, setChannelId] = useState(channels[0]?.id || "");
  const [playlistName, setPlaylistName] = useState("");
  const [existingPlaylistId, setExistingPlaylistId] = useState("");
  const [playlists, setPlaylists] = useState<ExistingPlaylist[]>([]);
  const [playlistsLoading, setPlaylistsLoading] = useState(false);
  const [privacyStatus, setPrivacyStatus] = useState<"unlisted" | "private" | "public">(defaultPrivacy);
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const [titlePrefix, setTitlePrefix] = useState("Aula");

  useEffect(() => {
    if (accountId && folderId) {
      void loadCourse(accountId, folderId);
      return;
    }
    const saved = localStorage.getItem("aulasync_selected_course");
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved);
      if (parsed.folder?.id?.startsWith?.("local:") && Array.isArray(parsed.videos)) {
        setAccountId("");
        setFolderId(parsed.folder.id);
        setCourse({ folder: parsed.folder, videos: parsed.videos });
        setPlaylistName(parsed.folder.name);
        setTitles(Object.fromEntries(parsed.videos.map((video: Video) => [video.id, video.title])));
        setSelected(parsed.videos.map((video: Video) => video.id));
        return;
      }
      if (parsed.accountId && parsed.folder?.id) {
        setAccountId(parsed.accountId);
        setFolderId(parsed.folder.id);
      }
    } catch {
      localStorage.removeItem("aulasync_selected_course");
    }
  }, [accountId, folderId]);

  useEffect(() => {
    if (!channelId) {
      setPlaylists([]);
      return;
    }
    let cancelled = false;
    setExistingPlaylistId("");
    setPlaylistsLoading(true);
    void fetch(`/api/youtube/playlists?channelId=${encodeURIComponent(channelId)}`, {
      cache: "no-store",
    }).then(async (response) => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Não foi possível carregar as playlists.");
      if (!cancelled) setPlaylists(data.playlists || []);
    }).catch((reason) => {
      if (!cancelled) {
        setPlaylists([]);
        setError(reason instanceof Error ? reason.message : "Falha ao carregar playlists.");
      }
    }).finally(() => {
      if (!cancelled) setPlaylistsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [channelId]);

  async function loadCourse(account: string, folder: string) {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/drive/courses?accountId=${encodeURIComponent(account)}&folderId=${encodeURIComponent(folder)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível carregar o curso.");
      setCourse(data);
      setPlaylistName(data.folder.name);
      setTitles(Object.fromEntries(data.videos.map((video: Video) => [video.id, video.title])));
      setSelected(data.videos.map((video: Video) => video.id));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Falha ao carregar o curso.");
    } finally {
      setLoading(false);
    }
  }

  function toggleVideo(id: string) {
    setSelected((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      setError("");
      return [...current, id];
    });
  }

  function applyTitlePrefix() {
    if (!course) return;
    const selectedSet = new Set(selected);
    let position = 0;
    setTitles((current) => {
      const next = { ...current };
      for (const video of course.videos) {
        if (!selectedSet.has(video.id)) continue;
        position += 1;
        const base = (current[video.id] || video.title)
          .replace(/^Aula\s+\d+\s*[-–—:]?\s*/i, "")
          .trim();
        next[video.id] = `${titlePrefix.trim() || "Aula"} ${String(position).padStart(2, "0")} - ${base}`;
      }
      return next;
    });
  }

  function resetTitles() {
    if (!course) return;
    setTitles(Object.fromEntries(course.videos.map((video) => [video.id, video.title])));
  }

  const selectedVideos = useMemo(
    () => course?.videos.filter((video) => selected.includes(video.id)) || [],
    [course, selected],
  );
  const isLocalCourse = course?.folder.id.startsWith("local:") ?? false;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!course || !selectedVideos.length) return;
    setStarting(true);
    setError("");
    try {
      const response = await fetch("/api/uploads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          driveAccountId: isLocalCourse ? null : accountId,
          sourceType: isLocalCourse ? "local" : "drive",
          channelId,
          folderId: course.folder.id,
          courseName: course.folder.name,
          playlistName,
          existingPlaylistId: existingPlaylistId || null,
          privacyStatus,
          videos: makeUniqueVideoTitles(selectedVideos, titles),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || "Não foi possível iniciar o upload.");
        return;
      }
      router.push("/uploads");
      router.refresh();
    } catch {
      setError("Não foi possível conectar ao servidor.");
    } finally {
      setStarting(false);
    }
  }

  if (!channels.length) {
    return (
      <div className="panel p-8 text-center">
        <div className="mx-auto mb-5 grid size-16 place-items-center rounded-2xl bg-amber-50 text-amber-600"><AlertCircle className="size-7" /></div>
        <h2 className="text-lg font-extrabold text-slate-800">Falta uma conexão</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
          Para criar um upload, conecte pelo menos um canal YouTube. A origem pode ser Google Drive ou vídeos do computador.
        </p>
        <div className="mt-5 flex justify-center gap-3">
          {!channels.length && <Link href="/accounts/youtube" className="btn-primary">Conectar YouTube</Link>}
        </div>
      </div>
    );
  }

  if (!isLocalCourse && (!accountId || !folderId)) {
    return (
      <div className="panel flex min-h-[420px] flex-col items-center justify-center px-6 text-center">
        <div className="mb-5 grid size-16 place-items-center rounded-2xl bg-brand-50 text-brand-600"><FolderOpen className="size-7" /></div>
        <h2 className="text-lg font-extrabold text-slate-800">Escolha a pasta do curso</h2>
        <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">Comece navegando pelo Google Drive e selecione a pasta que contém os módulos e as aulas.</p>
        <Link href="/courses" className="btn-primary mt-5">Escolher curso</Link>
      </div>
    );
  }

  if (loading || !course) {
    return (
      <div className="panel flex min-h-[420px] items-center justify-center gap-3 text-sm font-bold text-slate-500">
        <LoaderCircle className="size-5 animate-spin text-brand-600" /> Preparando as aulas...
      </div>
    );
  }

  return (
    <form onSubmit={submit}>
      <div className="mb-6 grid grid-cols-3 overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {[
          { number: 1, label: "Curso", done: true },
          { number: 2, label: "Destino", done: true },
          { number: 3, label: "Revisão", done: false },
        ].map((step, index) => (
          <div key={step.label} className={`flex items-center justify-center gap-2 border-r border-slate-100 px-3 py-4 last:border-r-0 ${index === 2 ? "bg-brand-50/50" : ""}`}>
            <div className={`grid size-6 place-items-center rounded-full text-[10px] font-extrabold ${step.done ? "bg-emerald-100 text-emerald-700" : "bg-brand-600 text-white"}`}>
              {step.done ? <Check className="size-3.5" /> : step.number}
            </div>
            <span className={`text-xs font-extrabold ${index === 2 ? "text-brand-700" : "text-slate-500"}`}>{step.label}</span>
          </div>
        ))}
      </div>

      {error && <div className="mb-5 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700"><AlertCircle className="size-4" />{error}</div>}

      <div className="grid gap-6 xl:grid-cols-[1.15fr_.85fr]">
        <section className="panel overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-5">
            <div>
              <h2 className="text-base font-extrabold text-slate-900">Revisar aulas</h2>
              <p className="mt-1 text-xs text-slate-400">Edite os títulos antes do envio</p>
            </div>
            <span className="rounded-full bg-brand-50 px-3 py-1.5 text-xs font-extrabold text-brand-700">{selected.length} selecionadas</span>
          </div>
          <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50/60 px-5 py-4">
            <div className="grid size-10 place-items-center rounded-xl bg-amber-50 text-amber-500"><FolderOpen className="size-5" /></div>
            <div className="min-w-0 flex-1"><div className="truncate text-sm font-extrabold text-slate-800">{course.folder.name}</div><div className="mt-0.5 text-[11px] text-slate-400">{course.videos.length} vídeos encontrados</div></div>
            <Link href="/courses" className="text-xs font-bold text-brand-600">Trocar</Link>
          </div>
          <div className="flex flex-col gap-3 border-b border-slate-100 bg-white px-5 py-4 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className="label" htmlFor="title-prefix">Prefixo automático</label>
              <input id="title-prefix" className="field" value={titlePrefix} onChange={(event) => setTitlePrefix(event.target.value)} maxLength={30} />
            </div>
            <button type="button" className="btn-secondary" onClick={applyTitlePrefix}><WandSparkles className="size-4" /> Aplicar Aula 01</button>
            <button type="button" className="btn-secondary" onClick={resetTitles}>Restaurar títulos</button>
          </div>
          <div className="max-h-[570px] divide-y divide-slate-100 overflow-y-auto">
            {course.videos.map((video, index) => {
              const checked = selected.includes(video.id);
              return (
                <div key={video.id} className={`p-4 transition ${checked ? "bg-white" : "bg-slate-50/70 opacity-60"}`}>
                  <div className="flex items-start gap-3">
                    <button type="button" onClick={() => toggleVideo(video.id)} className={`mt-1 grid size-5 shrink-0 place-items-center rounded-md border ${checked ? "border-brand-600 bg-brand-600 text-white" : "border-slate-300 bg-white"}`}>
                      {checked && <Check className="size-3.5" />}
                    </button>
                    <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-600"><FileVideo className="size-4" /></div>
                    <div className="min-w-0 flex-1">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Aula {String(index + 1).padStart(2, "0")}</span>
                        <span className="text-[10px] text-slate-400">{formatBytes(video.size)}</span>
                      </div>
                      <input
                        value={titles[video.id] || ""}
                        onChange={(event) => setTitles((current) => ({ ...current, [video.id]: event.target.value }))}
                        disabled={!checked}
                        className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 outline-none focus:border-brand-500 focus:ring-3 focus:ring-brand-500/10"
                        maxLength={100}
                      />
                      <div className="mt-1.5 truncate text-[10px] text-slate-400">{video.modulePath || "Pasta principal"}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <aside className="space-y-6">
          <section className="panel p-5">
            <div className="mb-5 flex items-center gap-3">
              <div className="grid size-10 place-items-center rounded-xl bg-rose-50 text-rose-600"><Youtube className="size-5" /></div>
              <div><h2 className="text-sm font-extrabold text-slate-900">Destino no YouTube</h2><p className="mt-0.5 text-[11px] text-slate-400">Canal, playlist e privacidade</p></div>
            </div>
            <div className="space-y-4">
              <div>
                <label className="label">Canal</label>
                <div className="relative">
                  <select className="field appearance-none pr-10" value={channelId} onChange={(event) => { setChannelId(event.target.value); setExistingPlaylistId(""); setPlaylistName(course.folder.name); }} required>
                    {channels.map((channel) => <option key={channel.id} value={channel.id}>{channel.name} · {channel.email}</option>)}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                </div>
              </div>
              <div>
                <label className="label">Playlist</label>
                <div className="relative">
                  <ListVideo className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                  <select
                    className="field appearance-none pl-10 pr-10"
                    value={existingPlaylistId}
                    onChange={(event) => {
                      const id = event.target.value;
                      setExistingPlaylistId(id);
                      const selectedPlaylist = playlists.find((playlist) => playlist.id === id);
                      setPlaylistName(selectedPlaylist?.name || course.folder.name);
                    }}
                  >
                    <option value="">Criar uma nova playlist</option>
                    {playlists.map((playlist) => (
                      <option key={playlist.id} value={playlist.id}>
                        {playlist.name} · {playlist.itemCount} vídeo(s)
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                </div>
                {playlistsLoading && (
                  <div className="mt-2 flex items-center gap-2 text-[10px] font-semibold text-slate-400">
                    <LoaderCircle className="size-3 animate-spin" /> Carregando playlists do canal...
                  </div>
                )}
              </div>
              {!existingPlaylistId && (
                <div>
                  <label className="label" htmlFor="playlist">Nome da nova playlist</label>
                  <div className="relative">
                    <ListVideo className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                    <input id="playlist" className="field pl-10" value={playlistName} onChange={(event) => setPlaylistName(event.target.value)} maxLength={150} required />
                  </div>
                </div>
              )}
              <div>
                <label className="label">Privacidade</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { value: "unlisted", label: "Não listado", icon: Play },
                    { value: "private", label: "Privado", icon: Lock },
                    { value: "public", label: "Público", icon: Globe2 },
                  ].map(({ value, label, icon: Icon }) => (
                    <button key={value} type="button" onClick={() => setPrivacyStatus(value as typeof privacyStatus)} className={`flex flex-col items-center gap-2 rounded-xl border px-2 py-3 text-[10px] font-extrabold transition ${privacyStatus === value ? "border-brand-500 bg-brand-50 text-brand-700 ring-2 ring-brand-500/10" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
                      <Icon className="size-4" />{label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="panel p-5">
            <h2 className="text-sm font-extrabold text-slate-900">Resumo da tarefa</h2>
            <div className="mt-4 space-y-3 rounded-xl bg-slate-50 p-4">
              <div className="flex justify-between text-xs"><span className="text-slate-400">Aulas</span><span className="font-extrabold text-slate-700">{selected.length}</span></div>
              <div className="flex justify-between text-xs"><span className="text-slate-400">Playlist</span><span className="max-w-52 truncate font-extrabold text-slate-700">{playlistName}</span></div>
              <div className="flex justify-between text-xs"><span className="text-slate-400">Modo</span><span className="font-extrabold text-slate-700">{privacyStatus === "unlisted" ? "Não listado" : privacyStatus === "private" ? "Privado" : "Público"}</span></div>
            </div>
            <button type="submit" className="btn-primary mt-4 !h-12 w-full" disabled={starting || !selected.length || !channelId}>
              {starting ? <><LoaderCircle className="size-4 animate-spin" /> Criando tarefa...</> : <><UploadCloud className="size-4" /> Iniciar upload</>}
            </button>
            <div className="mt-3 flex items-center justify-center gap-1.5 text-[10px] font-semibold text-slate-400"><CheckCircle2 className="size-3 text-emerald-500" /> Upload resumível para arquivos grandes</div>
          </section>
        </aside>
      </div>
    </form>
  );
}


function makeUniqueVideoTitles(videos: Video[], titles: Record<string, string>) {
  const used = new Map<string, number>();
  return videos.map((video) => {
    const base = (titles[video.id] || video.title).trim();
    const key = base.toLocaleLowerCase("pt-BR");
    const count = (used.get(key) || 0) + 1;
    used.set(key, count);
    return {
      ...video,
      title: count === 1 ? base : `${base} (${count})`,
    };
  });
}
