"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3, ChevronRight, Cloud, FileVideo, FolderOpen, LayoutDashboard,
  LogOut, PlusCircle, Radio, Settings, UploadCloud, UsersRound, Youtube,
} from "lucide-react";
import { Logo } from "@/components/logo";
import { cn } from "@/lib/utils";

const sections = [
  {
    label: "Principal",
    links: [{ href: "/dashboard", label: "Visão geral", icon: LayoutDashboard }],
  },
  {
    label: "Contas",
    links: [
      { href: "/accounts/drive", label: "Google Drive", icon: Cloud },
      { href: "/accounts/youtube", label: "Canais YouTube", icon: Youtube },
    ],
  },
  {
    label: "Gestão",
    links: [
      { href: "/courses", label: "Cursos", icon: FolderOpen },
      { href: "/uploads/new", label: "Novo upload", icon: PlusCircle },
      { href: "/uploads", label: "Uploads", icon: UploadCloud },
      { href: "/reports", label: "Relatórios", icon: BarChart3 },
      { href: "/settings", label: "Configurações", icon: Settings },
      { href: "/admin/users", label: "Usuários", icon: UsersRound, staffOnly: true },
    ],
  },
];

export function Sidebar({
  health,
  role,
}: {
  health: {
    driveConnected: boolean;
    youtubeConnected: boolean;
    activeUploads: number;
    errors: number;
  };
  role: "ADMIN" | "OPERATOR" | "CLIENT";
}) {
  const pathname = usePathname();
  const visibleSections = sections.map((section) => ({
    ...section,
    links: section.links.filter((item) => {
      if (role === "OPERATOR") return item.href === "/admin/users";
      if (item.href === "/admin/users") return role === "ADMIN";
      return true;
    }),
  })).filter((section) => section.links.length > 0);
  const operational = health.driveConnected && health.youtubeConnected && health.errors === 0;
  const healthProgress = (health.driveConnected ? 35 : 0) + (health.youtubeConnected ? 35 : 0) + (health.errors === 0 ? 30 : 10);
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[248px] flex-col bg-[#111827] lg:flex">
      <div className="flex h-[84px] items-center border-b border-white/[0.07] px-6">
        <Logo dark />
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-5">
        {visibleSections.map((section) => (
          <div key={section.label} className="mb-6">
            <div className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
              {section.label}
            </div>
            <div className="space-y-1">
              {section.links.map((item) => {
                const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href + "/"));
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "group flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition",
                      active
                        ? "bg-white/[0.09] text-white"
                        : "text-slate-400 hover:bg-white/[0.05] hover:text-slate-200",
                    )}
                  >
                    <Icon className={cn("size-[18px]", active && "text-brand-500")} />
                    <span className="flex-1">{item.label}</span>
                    {active && <ChevronRight className="size-3.5 text-slate-500" />}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {role !== "OPERATOR" && <Link href="/uploads" className="m-3 block rounded-2xl border border-white/[0.08] bg-white/[0.04] p-4 transition hover:bg-white/[0.07]">
        <div className="mb-3 flex items-center gap-2 text-xs font-bold text-slate-300">
          <Radio className={cn("size-3.5", operational ? "text-emerald-400" : "text-amber-400")} />
          {operational ? "Sistema operacional" : "Atenção necessária"}
        </div>
        <p className="mb-3 text-[11px] leading-5 text-slate-500">
          {!health.driveConnected
            ? "Conecte uma conta do Google Drive."
            : !health.youtubeConnected
              ? "Conecte um canal do YouTube."
              : health.errors > 0
                ? health.errors + " aula(s) precisam de atenção."
                : health.activeUploads > 0
                  ? health.activeUploads + " tarefa(s) em andamento."
                  : "Drive e YouTube prontos para sincronizar."}
        </p>
        <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
          <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-cyan-400 transition-all" style={{ width: String(healthProgress) + "%" }} />
        </div>
      </Link>}
    </aside>
  );
}

export function MobileNav({ role }: { role: "ADMIN" | "OPERATOR" | "CLIENT" }) {
  const pathname = usePathname();
  const links = role === "OPERATOR"
    ? [{ href: "/admin/users", icon: UsersRound, label: "Usuários" }]
    : [
        { href: "/dashboard", icon: LayoutDashboard, label: "Início" },
        { href: "/courses", icon: FileVideo, label: "Cursos" },
        { href: "/uploads/new", icon: PlusCircle, label: "Enviar" },
        { href: "/uploads", icon: UploadCloud, label: "Uploads" },
        { href: "/reports", icon: BarChart3, label: "Relatórios" },
      ];
  return (
    <nav className="fixed inset-x-3 bottom-3 z-50 flex h-16 items-center justify-around rounded-2xl border border-slate-200 bg-white/95 px-2 shadow-2xl backdrop-blur lg:hidden">
      {links.map(({ href, icon: Icon, label }) => {
        const active = pathname === href;
        return (
          <Link key={href} href={href} className={cn("flex min-w-12 flex-col items-center gap-1 text-[10px] font-bold", active ? "text-brand-600" : "text-slate-400")}>
            <Icon className="size-5" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function LogoutButton() {
  return (
    <form action="/api/auth/logout" method="post">
      <button className="grid size-10 place-items-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-800" aria-label="Sair">
        <LogOut className="size-4" />
      </button>
    </form>
  );
}
