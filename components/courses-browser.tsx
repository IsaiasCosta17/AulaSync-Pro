"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, ArrowRight, CheckCircle2, ChevronRight, Cloud, FileVideo,
  Folder, FolderCheck, LoaderCircle, Search,
} from "lucide-react";
import { formatBytes } from "@/lib/utils";

type Account = { id: string; name: string; email: string };
type FolderItem = { id: string; name: string; modifiedTime: string | null };
type Video = {
  id: string;
  name: string;
  title: string;
  mimeType: string;
  size: string | null;
  moduleName: string | null;
  modulePath: string;
};

export function CoursesBrowser({ accounts }: { accounts: Account[] }) {
  const [accountId, setAccountId] = useState(accounts[0]?.id || "");
  const [breadcrumbs, setBreadcrumbs] = useState([{ id: "root", name: "Meu Drive" }]);
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [directVideos, setDirectVideos] = useState<Video[]>([]);
  const [course, setCourse] = useState<{ folder: { id: string; name: string }; videos: Video[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const current = breadcrumbs[breadcrumbs.length - 1];
  const filteredFolders = useMemo(
    () => folders.filter((folder) => folder.name.toLowerCase().includes(search.toLowerCase())),
    [folders, search],
  );

  useEffect(() => {
    if (!accountId) return;
    setBreadcrumbs([{ id: "root", name: "Meu Drive" }]);
    setCourse(null);
    void loadFolder("root");
  }, [accountId]);

  async function loadFolder(parentId: string) {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/drive/folders?accountId=${accountId}&parentId=${encodeURIComponent(parentId)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Falha ao abrir a pasta.");
      setFolders(data.folders);
      setDirectVideos(data.videos);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Falha ao abrir o Drive.");
    } finally {
      setLoading(false);
    }
  }

  function openFolder(folder: FolderItem) {
    setCourse(null);
    setSearch("");
    setBreadcrumbs((items) => [...items, { id: folder.id, name: folder.name }]);
    void loadFolder(folder.id);
  }

  function goToCrumb(index: number) {
    const crumb = breadcrumbs[index];
    setCourse(null);
    setBreadcrumbs((items) => items.slice(0, index + 1));
    void loadFolder(crumb.id);
  }

  async function selectCourse() {
    setScanning(true);
    setError("");
    try {
      const response = await fetch(`/api/drive/courses?accountId=${accountId}&folderId=${encodeURIComponent(current.id)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Falha ao analisar o curso.");
      setCourse(data);
      localStorage.setItem("aulasync_selected_course", JSON.stringify({ accountId, ...data }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Falha ao analisar a pasta.");
    } finally {
      setScanning(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[.92fr_1.08fr]">
      <section className="panel overflow-hidden">
        <div className="border-b border-slate-100 p-5">
          <label className="label">Conta do Google Drive</label>
          <select className="field" value={accountId} onChange={(event) => setAccountId(event.target.value)}>
            {accounts.map((account) => <option key={account.id} value={account.id}>{account.name} · {account.email}</option>)}
          </select>
        </div>

        <div className="flex min-h-14 flex-wrap items-center gap-1 border-b border-slate-100 px-5 py-3">
          {breadcrumbs.map((crumb, index) => (
            <div key={crumb.id} className="flex items-center">
              <button onClick={() => goToCrumb(index)} className={`max-w-40 truncate text-xs font-bold ${index === breadcrumbs.length - 1 ? "text-slate-800" : "text-slate-400 hover:text-brand-600"}`}>
                {crumb.name}
              </button>
              {index < breadcrumbs.length - 1 && <ChevronRight className="mx-1 size-3.5 text-slate-300" />}
            </div>
          ))}
        </div>

        <div className="p-5">
          <div className="relative mb-4">
            <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input className="field pl-10" placeholder="Buscar pasta..." value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>

          {error && <div className="mb-4 rounded-xl bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700">{error}</div>}

          {loading ? (
            <div className="flex min-h-64 items-center justify-center gap-2 text-sm font-semibold text-slate-400"><LoaderCircle className="size-5 animate-spin text-brand-600" /> Abrindo o Drive...</div>
          ) : (
            <div className="min-h-64 space-y-1">
              {breadcrumbs.length > 1 && (
                <button onClick={() => goToCrumb(breadcrumbs.length - 2)} className="mb-1 flex w-full items-center gap-3 rounded-xl p-3 text-left text-sm font-bold text-slate-500 hover:bg-slate-50">
                  <div className="grid size-9 place-items-center rounded-xl bg-slate-100"><ArrowLeft className="size-4" /></div>
                  Voltar
                </button>
              )}
              {filteredFolders.map((folder) => (
                <button key={folder.id} onClick={() => openFolder(folder)} className="group flex w-full items-center gap-3 rounded-xl p-3 text-left transition hover:bg-brand-50/60">
                  <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-500"><Folder className="size-[18px] fill-current" /></div>
                  <span className="min-w-0 flex-1 truncate text-sm font-bold text-slate-700">{folder.name}</span>
                  <ChevronRight className="size-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-brand-500" />
                </button>
              ))}
              {!filteredFolders.length && (
                <div className="flex min-h-40 flex-col items-center justify-center text-center">
                  <Folder className="mb-3 size-8 text-slate-200" />
                  <p className="text-xs font-bold text-slate-400">Nenhuma subpasta aqui</p>
                  {directVideos.length > 0 && <p className="mt-1 text-[11px] text-slate-400">{directVideos.length} vídeo(s) nesta pasta</p>}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="border-t border-slate-100 bg-slate-50/60 p-5">
          <button onClick={selectCourse} disabled={loading || scanning} className="btn-primary w-full">
            {scanning ? <><LoaderCircle className="size-4 animate-spin" /> Analisando subpastas...</> : <><FolderCheck className="size-4" /> Selecionar “{current.name}” como curso</>}
          </button>
        </div>
      </section>

      <section className="panel overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-5">
          <div>
            <h2 className="text-base font-extrabold text-slate-900">Aulas encontradas</h2>
            <p className="mt-1 text-xs text-slate-400">MP4, MOV, AVI, MKV e WEBM</p>
          </div>
          {course && <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-extrabold text-emerald-700">{course.videos.length} aulas</span>}
        </div>

        {course ? (
          <>
            <div className="flex items-center gap-3 border-b border-slate-100 bg-brand-50/50 px-5 py-4">
              <div className="grid size-10 place-items-center rounded-xl bg-brand-100 text-brand-600"><Cloud className="size-5" /></div>
              <div className="min-w-0">
                <div className="truncate text-sm font-extrabold text-slate-800">{course.folder.name}</div>
                <div className="mt-0.5 text-[11px] text-slate-400">{new Set(course.videos.map((video) => video.modulePath).filter(Boolean)).size} módulos identificados</div>
              </div>
              <CheckCircle2 className="ml-auto size-5 text-emerald-500" />
            </div>
            <div className="max-h-[520px] divide-y divide-slate-100 overflow-y-auto">
              {course.videos.slice(0, 100).map((video, index) => (
                <div key={video.id} className="flex items-center gap-3 px-5 py-3.5">
                  <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-600"><FileVideo className="size-[17px]" /></div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-extrabold text-slate-700">{String(index + 1).padStart(2, "0")}. {video.title}</div>
                    <div className="mt-1 truncate text-[10px] text-slate-400">{video.modulePath || "Pasta principal"} · {formatBytes(video.size)}</div>
                  </div>
                </div>
              ))}
              {!course.videos.length && <div className="p-12 text-center text-sm text-slate-400">Nenhum vídeo compatível foi encontrado.</div>}
            </div>
            <div className="border-t border-slate-100 p-5">
              <Link
                href={`/uploads/new?accountId=${accountId}&folderId=${course.folder.id}`}
                className={`btn-primary w-full ${!course.videos.length ? "pointer-events-none opacity-50" : ""}`}
              >
                Continuar para o upload <ArrowRight className="size-4" />
              </Link>
            </div>
          </>
        ) : (
          <div className="flex min-h-[520px] flex-col items-center justify-center px-8 text-center">
            <div className="mb-5 grid size-16 place-items-center rounded-2xl bg-slate-100 text-slate-400"><FileVideo className="size-7" /></div>
            <h3 className="text-base font-extrabold text-slate-800">Selecione uma pasta de curso</h3>
            <p className="mt-2 max-w-sm text-sm leading-6 text-slate-400">As subpastas serão tratadas como módulos e os vídeos serão ordenados pelo número no nome.</p>
          </div>
        )}
      </section>
    </div>
  );
}
