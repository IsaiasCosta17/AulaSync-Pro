"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle, Bell, CheckCircle2, ChevronDown, Cloud, FileVideo,
  FolderSearch, LoaderCircle, RefreshCw, Search as SearchIcon,
  Settings, ShieldCheck, UploadCloud, UserRound, UsersRound, Youtube,
} from "lucide-react";
import {
  KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/utils";

type SearchResult = {
  id: string;
  type: "upload" | "lesson" | "channel" | "drive";
  title: string;
  subtitle: string;
  href: string;
  status: string;
};

type NotificationItem = {
  id: string;
  level: string;
  message: string;
  createdAt: string;
  unread: boolean;
  href: string | null;
  courseName: string | null;
  jobStatus: string | null;
};

export function Topbar({
  user,
}: {
  user: { name: string; email: string; initials: string; role: "ADMIN" | "OPERATOR" | "CLIENT" };
}) {
  return (
    <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-2.5">
      <GlobalSearch />
      <NotificationCenter />
      <ProfileMenu user={user} />
      <form action="/api/auth/logout" method="post">
        <button
          className="hidden size-10 place-items-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-800 sm:grid"
          aria-label="Sair"
          title="Sair"
        >
          <span className="text-[11px] font-extrabold">Sair</span>
        </button>
      </form>
    </div>
  );
}

function GlobalSearch() {
  const router = useRouter();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const mobileInputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setMobileOpen(false);
      }
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    window.setTimeout(() => mobileInputRef.current?.focus(), 50);
  }, [mobileOpen]);

  useEffect(() => {
    const normalized = query.trim();
    if (normalized.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch("/api/search?q=" + encodeURIComponent(normalized), {
          cache: "no-store",
          signal: controller.signal,
        });
        const data = await response.json();
        if (response.ok) {
          setResults(data.results || []);
          setOpen(true);
        }
      } catch (error) {
        if ((error as Error).name !== "AbortError") setResults([]);
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  function openResult(result: SearchResult) {
    setOpen(false);
    setMobileOpen(false);
    setQuery("");
    router.push(result.href);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      setMobileOpen(false);
    }
    if (event.key === "Enter" && results[0]) {
      event.preventDefault();
      openResult(results[0]);
    }
  }

  const searchInput = (mobile = false) => (
    <div className="relative">
      <SearchIcon className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
      <input
        ref={mobile ? mobileInputRef : undefined}
        className="field !h-10 !bg-slate-50 pl-10 pr-10"
        placeholder="Pesquisar cursos, aulas, contas..."
        aria-label="Pesquisa global"
        value={query}
        onFocus={() => query.trim().length >= 2 && setOpen(true)}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={onKeyDown}
      />
      {loading && <LoaderCircle className="absolute right-3.5 top-1/2 size-4 -translate-y-1/2 animate-spin text-brand-600" />}
    </div>
  );

  return (
    <div ref={wrapperRef} className="relative mr-auto min-w-0 md:w-full md:max-w-md">
      <div className="hidden md:block">{searchInput()}</div>
      <button
        type="button"
        className="grid size-10 place-items-center rounded-xl border border-slate-200 text-slate-500 md:hidden"
        onClick={() => {
          setMobileOpen((value) => !value);
          setOpen(true);
        }}
        aria-label="Abrir pesquisa"
      >
        <SearchIcon className="size-[18px]" />
      </button>

      {mobileOpen && (
        <div className="fixed inset-x-3 top-[92px] z-50 rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl md:hidden">
          {searchInput(true)}
        </div>
      )}

      {open && query.trim().length >= 2 && (
        <div className={cn(
          "z-[60] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/15",
          mobileOpen
            ? "fixed inset-x-3 top-[148px]"
            : "absolute left-0 right-0 top-12",
        )}>
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Resultados</span>
            <span className="text-[10px] text-slate-400">Enter abre o primeiro</span>
          </div>
          <div className="max-h-96 overflow-y-auto p-2">
            {!loading && !results.length && (
              <div className="px-4 py-8 text-center">
                <FolderSearch className="mx-auto size-7 text-slate-300" />
                <p className="mt-2 text-xs font-semibold text-slate-400">Nenhum resultado encontrado.</p>
              </div>
            )}
            {results.map((result) => {
              const Icon = result.type === "lesson"
                ? FileVideo
                : result.type === "channel"
                  ? Youtube
                  : result.type === "drive"
                    ? Cloud
                    : UploadCloud;
              return (
                <button
                  key={result.id}
                  type="button"
                  onClick={() => openResult(result)}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-brand-50"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-500">
                    <Icon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-extrabold text-slate-800">{result.title}</span>
                    <span className="mt-1 block truncate text-[10px] text-slate-400">{result.subtitle}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function NotificationCenter() {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const response = await fetch("/api/notifications", { cache: "no-store" });
      const data = await response.json();
      if (response.ok) {
        setItems(data.items || []);
        setUnreadCount(data.unreadCount || 0);
      }
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(true), 30000);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (!next) return;
    await load();
    await fetch("/api/notifications", { method: "POST" }).catch(() => undefined);
    setUnreadCount(0);
    setItems((current) => current.map((item) => ({ ...item, unread: false })));
  }

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={toggle}
        className="relative grid size-10 place-items-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-50"
        aria-label="Notificações"
      >
        <Bell className="size-[18px]" />
        {unreadCount > 0 && (
          <span className="absolute -right-1.5 -top-1.5 min-w-5 rounded-full bg-rose-500 px-1.5 py-0.5 text-center text-[9px] font-extrabold text-white ring-2 ring-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-x-3 top-[92px] z-[70] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/15 sm:absolute sm:left-auto sm:right-0 sm:top-12 sm:w-[390px]">
          <div className="flex items-center border-b border-slate-100 px-4 py-4">
            <div>
              <div className="text-sm font-extrabold text-slate-900">Notificações</div>
              <div className="mt-0.5 text-[10px] text-slate-400">Eventos recentes das tarefas</div>
            </div>
            <button
              type="button"
              onClick={() => void load()}
              className="ml-auto grid size-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-brand-600"
              aria-label="Atualizar notificações"
            >
              <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
            </button>
          </div>
          <div className="max-h-[480px] overflow-y-auto p-2">
            {!items.length && !loading && (
              <div className="px-5 py-10 text-center">
                <Bell className="mx-auto size-7 text-slate-300" />
                <p className="mt-2 text-xs font-semibold text-slate-400">Nenhum evento registrado.</p>
              </div>
            )}
            {items.map((item) => {
              const Icon = item.level === "success" ? CheckCircle2 : AlertCircle;
              const color = item.level === "success"
                ? "bg-emerald-50 text-emerald-600"
                : item.level === "error"
                  ? "bg-rose-50 text-rose-600"
                  : "bg-amber-50 text-amber-600";
              const content = (
                <>
                  <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl", color)}>
                    <Icon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    {item.courseName && <span className="block truncate text-[10px] font-extrabold uppercase tracking-wide text-slate-400">{item.courseName}</span>}
                    <span className="mt-0.5 block text-xs font-semibold leading-5 text-slate-700">{item.message}</span>
                    <span className="mt-1 block text-[10px] text-slate-400">{relativeTime(item.createdAt)}</span>
                  </span>
                </>
              );
              return item.href ? (
                <Link
                  key={item.id}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="flex gap-3 rounded-xl px-3 py-3 transition hover:bg-slate-50"
                >
                  {content}
                </Link>
              ) : (
                <div key={item.id} className="flex gap-3 rounded-xl px-3 py-3">{content}</div>
              );
            })}
          </div>
          <Link href="/uploads" onClick={() => setOpen(false)} className="block border-t border-slate-100 px-4 py-3 text-center text-xs font-extrabold text-brand-600 hover:bg-brand-50">
            Ver todas as tarefas
          </Link>
        </div>
      )}
    </div>
  );
}

function ProfileMenu({
  user,
}: {
  user: { name: string; email: string; initials: string; role: "ADMIN" | "OPERATOR" | "CLIENT" };
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-3 border-l border-slate-200 pl-3 sm:pl-4"
        aria-label="Menu do usuário"
      >
        <span className="grid size-10 place-items-center rounded-xl bg-brand-100 text-xs font-extrabold text-brand-700">
          {user.initials}
        </span>
        <span className="hidden max-w-32 text-left leading-tight sm:block">
          <span className="block truncate text-sm font-bold text-slate-800">{user.name}</span>
          <span className="mt-1 block text-[11px] text-slate-400">{user.role === "ADMIN" ? "Administrador" : user.role === "OPERATOR" ? "Operador" : "Cliente"}</span>
        </span>
        <ChevronDown className={cn("hidden size-4 text-slate-400 transition sm:block", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-[70] w-64 overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl shadow-slate-900/15">
          <div className="mb-2 rounded-xl bg-slate-50 px-3 py-3">
            <div className="truncate text-xs font-extrabold text-slate-800">{user.name}</div>
            <div className="mt-1 truncate text-[10px] text-slate-400">{user.email}</div>
          </div>
          {(user.role === "ADMIN" || user.role === "OPERATOR") && <ProfileLink href="/admin/users" icon={UsersRound} label="Gestão de usuários" onClick={() => setOpen(false)} />}
          <ProfileLink href="/settings" icon={Settings} label="Configurações" onClick={() => setOpen(false)} />
          <ProfileLink href="/politica-de-privacidade" icon={ShieldCheck} label="Política de Privacidade" onClick={() => setOpen(false)} />
          <ProfileLink href="/termos-de-uso" icon={UserRound} label="Termos de Uso" onClick={() => setOpen(false)} />
          <form action="/api/auth/logout" method="post" className="mt-2 border-t border-slate-100 pt-2 sm:hidden">
            <button className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-bold text-rose-600 hover:bg-rose-50">
              Sair da conta
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function ProfileLink({
  href,
  icon: Icon,
  label,
  onClick,
}: {
  href: string;
  icon: typeof Settings;
  label: string;
  onClick: () => void;
}) {
  return (
    <Link href={href} onClick={onClick} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50 hover:text-brand-600">
      <Icon className="size-4" /> {label}
    </Link>
  );
}

function relativeTime(value: string) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return "agora";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return "há " + minutes + " min";
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return "há " + hours + " h";
  const days = Math.floor(hours / 24);
  return "há " + days + " dia" + (days === 1 ? "" : "s");
}
