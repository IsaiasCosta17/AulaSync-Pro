"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, ArrowRight, CheckCircle2, ChevronRight, Cloud, FileVideo,
  Folder, FolderCheck, Link2, LoaderCircle, Search, UploadCloud,
} from "lucide-react";
import { formatBytes } from "@/lib/utils";

type Account = { id: string; name: string; email: string };
type FolderItem = { id: string; name: string; modifiedTime: string | null };
type Video = {
  id: string;
  sourceType?: "drive" | "local";
  localPath?: string | null;
  driveResourceKey?: string | null;
  clientId?: string;
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
  const [sharedLink, setSharedLink] = useState("");
  const [localCourseName, setLocalCourseName] = useState("");
  const [localFiles, setLocalFiles] = useState<File[]>([]);
  const [localImporting, setLocalImporting] = useState(false);
  const [localProgress, setLocalProgress] = useState(0);

  const current = breadcrumbs[breadcrumbs.length - 1];
  const filteredFolders = useMemo(
    () => folders.filter((folder) => folder.name.toLowerCase().includes(search.toLowerCase())),
    [folders, search],
  );

  useEffect(() => {
    if (!accountId) {
      setFolders([]);
      setDirectVideos([]);
      return;
    }
    setBreadcrumbs([{ id: "root", name: "Meu Drive" }]);
    setCourse(null);
    void loadFolder("root");
  }, [accountId]);

  async function loadFolder(parentId: string) {
    if (!accountId) return;
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
    if (!accountId) {
      setError("Conecte ou selecione uma conta Drive para usar esta pasta.");
      return;
    }
    if (current.id === "sharedWithMe") {
      setError("Abra uma pasta compartilhada ou cole o link direto do curso antes de continuar.");
      return;
    }
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

  async function selectSharedLink() {
    if (!accountId) {
      setError("Selecione uma conta Drive para abrir um link compartilhado.");
      return;
    }
    if (!sharedLink.trim()) {
      setError("Cole o link compartilhado do Google Drive.");
      return;
    }
    setScanning(true);
    setError("");
    try {
      const response = await fetch(`/api/drive/courses?accountId=${accountId}&link=${encodeURIComponent(sharedLink.trim())}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Falha ao abrir o link compartilhado.");
      setCourse(data);
      localStorage.setItem("aulasync_selected_course", JSON.stringify({ accountId, ...data }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Falha ao abrir o link compartilhado.");
    } finally {
      setScanning(false);
    }
  }

  function chooseLocalFiles(files: FileList | null) {
    const selectedFiles = Array.from(files || []).filter((file) => /\.(mp4|mov|avi|mkv|webm)$/i.test(file.name) || file.type.startsWith("video/"));
    setLocalFiles(selectedFiles);
    setLocalProgress(0);
    setError(selectedFiles.length ? "" : "Selecione vídeos em mp4, mov, avi, mkv ou webm.");
    if (!localCourseName && selectedFiles[0]) {
      const relativePath = (selectedFiles[0] as File & { webkitRelativePath?: string }).webkitRelativePath || "";
      const firstFolder = relativePath.split("/").filter(Boolean)[0];
      setLocalCourseName(firstFolder || "Curso local");
    }
  }

  async function importLocalCourse() {
    if (!localFiles.length) {
      setError("Selecione pelo menos um vídeo do computador.");
      return;
    }
    const courseName = localCourseName.trim() || "Curso local";
    setLocalImporting(true);
    setLocalProgress(0);
    setError("");
    try {
      const files = localFiles.map((file) => {
        const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
        return {
          clientId: typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          name: file.name,
          size: file.size,
          type: file.type || null,
          relativePath,
        };
      });
      const response = await fetch("/api/local/courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseName, files }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível preparar os vídeos locais.");

      const byClientId = new Map(files.map((file, index) => [file.clientId, localFiles[index]]));
      const totalBytes = localFiles.reduce((sum, file) => sum + file.size, 0);
      let sentBytes = 0;
      const chunkSize = 8 * 1024 * 1024;
      for (const video of data.videos as Video[]) {
        const file = video.clientId ? byClientId.get(video.clientId) : undefined;
        if (!file || !video.localPath) throw new Error(`Não foi possível localizar ${video.name}.`);
        for (let offset = 0; offset < file.size; offset += chunkSize) {
          const end = Math.min(file.size, offset + chunkSize);
          const chunk = file.slice(offset, end);
          const chunkResponse = await fetch(`/api/local/courses/chunk?localPath=${encodeURIComponent(video.localPath)}&offset=${offset}&size=${file.size}`, {
            method: "PUT",
            headers: { "Content-Type": "application/octet-stream" },
            body: chunk,
          });
          const chunkData = await chunkResponse.json().catch(() => ({}));
          if (!chunkResponse.ok) throw new Error(chunkData.error || `Falha ao importar ${video.name}.`);
          sentBytes += chunk.size;
          setLocalProgress(Math.min(100, Math.round((sentBytes / Math.max(1, totalBytes)) * 100)));
        }
      }
      setCourse(data);
      localStorage.setItem("aulasync_selected_course", JSON.stringify({ accountId: null, ...data }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Falha ao importar vídeos do computador.");
    } finally {
      setLocalImporting(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="panel p-5">
          <div className="mb-4 flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl bg-cyan-50 text-cyan-600"><UploadCloud className="size-5" /></div>
            <div>
              <h2 className="text-sm font-extrabold text-slate-900">Importar do computador</h2>
              <p className="mt-0.5 text-[11px] text-slate-400">Selecione vídeos desta máquina ou dispositivo.</p>
            </div>
          </div>
          <div className="space-y-3">
            <input className="field" placeholder="Nome do curso" value={localCourseName} onChange={(event) => setLocalCourseName(event.target.value)} maxLength={150} />
            <input className="block w-full rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-xs font-semibold text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-600 file:px-3 file:py-2 file:text-xs file:font-bold file:text-white" type="file" multiple accept=".mp4,.mov,.avi,.mkv,.webm,video/*" onChange={(event) => chooseLocalFiles(event.target.files)} />
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span>{localFiles.length ? `${localFiles.length} vídeo(s) selecionado(s)` : "Formatos: mp4, mov, avi, mkv e webm"}</span>
              {localImporting && <span className="font-extrabold text-brand-600">{localProgress}%</span>}
            </div>
            {localImporting && <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${localProgress}%` }} /></div>}
            <button type="button" onClick={importLocalCourse} disabled={localImporting || !localFiles.length} className="btn-primary w-full">
              {localImporting ? <><LoaderCircle className="size-4 animate-spin" /> Importando...</> : <><UploadCloud className="size-4" /> Usar vídeos do computador</>}
            </button>
          </div>
        </div>

        <div className="panel p-5">
          <div className="mb-4 flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl bg-amber-50 text-amber-600"><Link2 className="size-5" /></div>
            <div>
              <h2 className="text-sm font-extrabold text-slate-900">Importar link do Drive</h2>
              <p className="mt-0.5 text-[11px] text-slate-400">Cole link de pasta ou vídeo compartilhado com acesso liberado.</p>
            </div>
          </div>
          <div className="space-y-3">
            <select className="field" value={accountId} onChange={(event) => setAccountId(event.target.value)} disabled={!accounts.length}>
              {accounts.length ? accounts.map((account) => <option key={account.id} value={account.id}>{account.name} · {account.email}</option>) : <option value="">Conecte o Drive para usar links</option>}
            </select>
            <input className="field" placeholder="https://drive.google.com/..." value={sharedLink} onChange={(event) => setSharedLink(event.target.value)} />
            <button type="button" onClick={selectSharedLink} disabled={scanning || !accounts.length || !sharedLink.trim()} className="btn-secondary w-full">
              {scanning ? <><LoaderCircle className="size-4 animate-spin" /> Abrindo link...</> : <><Link2 className="size-4" /> Abrir link compartilhado</>}
            </button>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[.92fr_1.08fr]">
      <section className="panel overflow-hidden">
        <div className="border-b border-slate-100 p-5">
          <label className="label">Conta do Google Drive</label>
          <select className="field" value={accountId} onChange={(event) => setAccountId(event.target.value)} disabled={!accounts.length}>
            {!accounts.length && <option value="">Nenhuma conta Drive conectada</option>}
            {accounts.map((account) => <option key={account.id} value={account.id}>{account.name} · {account.email}</option>)}
          </select>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <button type="button" disabled={!accounts.length} onClick={() => { setBreadcrumbs([{ id: "root", name: "Meu Drive" }]); setCourse(null); void loadFolder("root"); }} className="btn-secondary !h-9 !px-3 text-xs">Meu Drive</button>
            <button type="button" disabled={!accounts.length} onClick={() => { setBreadcrumbs([{ id: "sharedWithMe", name: "Compartilhados comigo" }]); setCourse(null); void loadFolder("sharedWithMe"); }} className="btn-secondary !h-9 !px-3 text-xs">Compartilhados comigo</button>
          </div>
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
                href={course.folder.id.startsWith("local:") ? "/uploads/new" : `/uploads/new?accountId=${accountId}&folderId=${course.folder.id}`}
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
    </div>
  );
}
