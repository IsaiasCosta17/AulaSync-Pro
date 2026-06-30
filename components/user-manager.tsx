"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  Ban, CheckCircle2, Copy, KeyRound, LoaderCircle, Pencil, Plus,
  RefreshCw, Search, ShieldCheck, Trash2, UserRoundCheck, UsersRound, X,
} from "lucide-react";
import { cn } from "@/lib/utils";

type UserRole = "ADMIN" | "OPERATOR" | "CLIENT";
type ManagedUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  isCurrentUser: boolean;
};
type Stats = { total: number; active: number; blocked: number; admins: number; operators: number; clients: number };
type EditorState = {
  mode: "create" | "edit";
  user?: ManagedUser;
  name: string;
  email: string;
  password: string;
  role: UserRole;
  isActive: boolean;
};

const emptyStats: Stats = { total: 0, active: 0, blocked: 0, admins: 0, operators: 0, clients: 0 };

export function UserManager() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [stats, setStats] = useState<Stats>(emptyStats);
  const [currentRole, setCurrentRole] = useState<UserRole>("OPERATOR");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<"ALL" | UserRole>("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "BLOCKED">("ALL");
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [resetUser, setResetUser] = useState<ManagedUser | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function load() {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/users", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Não foi possível carregar os usuários.");
      setUsers(data.users || []);
      setStats(data.stats || emptyStats);
      setCurrentRole(data.currentRole || "OPERATOR");
    } catch (error) {
      show("error", error instanceof Error ? error.message : "Falha ao carregar usuários.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("pt");
    return users.filter((user) => {
      if (roleFilter !== "ALL" && user.role !== roleFilter) return false;
      if (statusFilter === "ACTIVE" && !user.isActive) return false;
      if (statusFilter === "BLOCKED" && user.isActive) return false;
      return !term || user.name.toLocaleLowerCase("pt").includes(term) || user.email.toLowerCase().includes(term);
    });
  }, [users, query, roleFilter, statusFilter]);

  function show(type: "success" | "error", text: string) {
    setNotice({ type, text });
    window.setTimeout(() => setNotice(null), 5000);
  }

  function openCreate() {
    setEditor({
      mode: "create",
      name: "",
      email: "",
      password: generatePassword(),
      role: "CLIENT",
      isActive: true,
    });
  }

  function openEdit(user: ManagedUser) {
    setEditor({
      mode: "edit",
      user,
      name: user.name,
      email: user.email,
      password: "",
      role: user.role,
      isActive: user.isActive,
    });
  }

  async function saveUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor) return;
    setSaving(true);
    try {
      const creating = editor.mode === "create";
      const response = await fetch(
        creating ? "/api/admin/users" : "/api/admin/users/" + editor.user?.id,
        {
          method: creating ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(creating ? {
            name: editor.name,
            email: editor.email,
            password: editor.password,
            role: editor.role,
            isActive: editor.isActive,
          } : {
            action: "update",
            name: editor.name,
            email: editor.email,
            role: editor.role,
            isActive: editor.isActive,
          }),
        },
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Não foi possível salvar.");
      setEditor(null);
      show("success", creating ? "Usuário criado. Envie a senha temporária com segurança." : "Usuário atualizado.");
      await load();
    } catch (error) {
      show("error", error instanceof Error ? error.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function resetUserPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!resetUser) return;
    setSaving(true);
    try {
      const response = await fetch("/api/admin/users/" + resetUser.id, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset-password", password: resetPassword }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Não foi possível redefinir a senha.");
      setResetUser(null);
      setResetPassword("");
      show("success", "Senha temporária definida. As sessões anteriores foram encerradas.");
      await load();
    } catch (error) {
      show("error", error instanceof Error ? error.message : "Não foi possível redefinir a senha.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleUser(user: ManagedUser) {
    const action = user.isActive ? "bloquear" : "reativar";
    if (!window.confirm(`Deseja realmente ${action} ${user.name}?`)) return;
    setSaving(true);
    try {
      const response = await fetch("/api/admin/users/" + user.id, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update",
          name: user.name,
          email: user.email,
          role: user.role,
          isActive: !user.isActive,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Não foi possível alterar o acesso.");
      show("success", user.isActive ? "Usuário bloqueado e sessões invalidadas." : "Usuário reativado.");
      await load();
    } catch (error) {
      show("error", error instanceof Error ? error.message : "Não foi possível alterar o acesso.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteUser(user: ManagedUser) {
    if (!window.confirm(`Excluir permanentemente o acesso de ${user.name}? Esta ação não pode ser desfeita.`)) return;
    setSaving(true);
    try {
      const response = await fetch("/api/admin/users/" + user.id, { method: "DELETE" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Não foi possível excluir.");
      show("success", "Usuário excluído.");
      await load();
    } catch (error) {
      show("error", error instanceof Error ? error.message : "Não foi possível excluir.");
    } finally {
      setSaving(false);
    }
  }

  function beginReset(user: ManagedUser) {
    setResetUser(user);
    setResetPassword(generatePassword());
  }

  return (
    <div className="space-y-5">
      {notice && (
        <div className={cn(
          "fixed right-5 top-24 z-[100] flex max-w-md items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-bold shadow-2xl",
          notice.type === "success"
            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
            : "border-rose-200 bg-rose-50 text-rose-800",
        )}>
          {notice.type === "success" ? <CheckCircle2 className="size-5" /> : <Ban className="size-5" />}
          {notice.text}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <Stat icon={UsersRound} label="Total de usuários" value={stats.total} color="brand" />
        <Stat icon={UserRoundCheck} label="Ativos" value={stats.active} color="emerald" />
        <Stat icon={UsersRound} label="Clientes" value={stats.clients} color="brand" />
        <Stat icon={UserRoundCheck} label="Operadores" value={stats.operators} color="emerald" />
        <Stat icon={ShieldCheck} label="Administradores" value={stats.admins} color="violet" />
        <Stat icon={Ban} label="Bloqueados" value={stats.blocked} color="rose" />
      </div>

      <section className="panel">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input
              className="field pl-10"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Pesquisar por nome ou e-mail..."
            />
          </div>
          <select className="field md:w-44" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as typeof roleFilter)}>
            <option value="ALL">Todas as funções</option>
            <option value="ADMIN">Administradores</option>
            <option value="OPERATOR">Operadores</option>
            <option value="CLIENT">Clientes</option>
          </select>
          <select className="field md:w-40" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}>
            <option value="ALL">Todos os estados</option>
            <option value="ACTIVE">Ativos</option>
            <option value="BLOCKED">Bloqueados</option>
          </select>
          <button className="btn-primary shrink-0" onClick={openCreate}>
            <Plus className="size-4" /> Adicionar usuário
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px]">
            <thead className="table-head">
              <tr>
                <th className="px-5 py-3.5">Usuário</th>
                <th className="px-5 py-3.5">Função</th>
                <th className="px-5 py-3.5">Estado</th>
                <th className="px-5 py-3.5">Último acesso</th>
                <th className="px-5 py-3.5">Criado em</th>
                <th className="px-5 py-3.5 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && (
                <tr><td colSpan={6} className="py-14 text-center text-sm font-semibold text-slate-400"><LoaderCircle className="mx-auto mb-2 size-5 animate-spin" /> Carregando usuários...</td></tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={6} className="py-14 text-center text-sm font-semibold text-slate-400">Nenhum usuário encontrado.</td></tr>
              )}
              {!loading && filtered.map((user) => (
                <tr key={user.id} className="transition hover:bg-slate-50/70">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-100 text-xs font-extrabold text-brand-700">{initials(user.name)}</span>
                      <div>
                        <div className="flex items-center gap-2 text-sm font-extrabold text-slate-800">
                          {user.name}
                          {user.isCurrentUser && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] uppercase tracking-wide text-slate-500">Você</span>}
                        </div>
                        <div className="mt-1 text-xs text-slate-400">{user.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <RoleBadge role={user.role} />
                  </td>
                  <td className="px-5 py-4">
                    <div className="space-y-1.5">
                      <StatusBadge active={user.isActive} />
                      {user.mustChangePassword && user.isActive && <div className="text-[10px] font-semibold text-amber-600">Troca de senha pendente</div>}
                    </div>
                  </td>
                  <td className="px-5 py-4 text-xs font-semibold text-slate-500">{formatDate(user.lastLoginAt)}</td>
                  <td className="px-5 py-4 text-xs font-semibold text-slate-500">{formatDate(user.createdAt)}</td>
                  <td className="px-5 py-4">
                    <div className="flex justify-end gap-1">
                      <Action title="Editar" onClick={() => openEdit(user)} icon={Pencil} disabled={currentRole === "OPERATOR" && user.role === "ADMIN"} />
                      <Action title="Redefinir senha" onClick={() => beginReset(user)} icon={KeyRound} disabled={currentRole === "OPERATOR" && user.role === "ADMIN"} />
                      <Action
                        title={user.isActive ? "Bloquear" : "Reativar"}
                        onClick={() => void toggleUser(user)}
                        icon={user.isActive ? Ban : UserRoundCheck}
                        disabled={user.isCurrentUser || (currentRole === "OPERATOR" && user.role === "ADMIN")}
                      />
                      <Action title="Excluir" onClick={() => void deleteUser(user)} icon={Trash2} danger disabled={user.isCurrentUser || (currentRole === "OPERATOR" && user.role === "ADMIN")} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-[11px] font-semibold text-slate-400">
          <span>{filtered.length} de {users.length} usuário(s)</span>
          <button onClick={() => void load()} className="flex items-center gap-1.5 hover:text-brand-600"><RefreshCw className="size-3.5" /> Atualizar</button>
        </div>
      </section>

      {editor && (
        <Modal title={editor.mode === "create" ? "Adicionar usuário" : "Editar usuário"} onClose={() => setEditor(null)}>
          <form onSubmit={saveUser} className="space-y-4">
            <Field label="Nome completo">
              <input className="field" value={editor.name} onChange={(event) => setEditor({ ...editor, name: event.target.value })} required minLength={2} />
            </Field>
            <Field label="E-mail de acesso">
              <input className="field" type="email" value={editor.email} onChange={(event) => setEditor({ ...editor, email: event.target.value })} required />
            </Field>
            {editor.mode === "create" && (
              <Field label="Senha temporária">
                <div className="flex gap-2">
                  <input className="field" value={editor.password} onChange={(event) => setEditor({ ...editor, password: event.target.value })} required minLength={8} />
                  <button type="button" className="btn-secondary px-3" title="Copiar senha" onClick={() => void navigator.clipboard.writeText(editor.password)}><Copy className="size-4" /></button>
                  <button type="button" className="btn-secondary px-3" title="Gerar outra senha" onClick={() => setEditor({ ...editor, password: generatePassword() })}><RefreshCw className="size-4" /></button>
                </div>
                <p className="mt-2 text-[11px] leading-5 text-amber-700">O usuário deverá criar uma nova senha no primeiro acesso.</p>
              </Field>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Função">
                <select className="field" value={editor.role} onChange={(event) => setEditor({ ...editor, role: event.target.value as UserRole })}>
                  <option value="CLIENT">Cliente</option>
                  <option value="OPERATOR">Operador</option>
                  {currentRole === "ADMIN" && <option value="ADMIN">Administrador</option>}
                </select>
              </Field>
              <Field label="Estado do acesso">
                <select className="field" value={editor.isActive ? "active" : "blocked"} onChange={(event) => setEditor({ ...editor, isActive: event.target.value === "active" })}>
                  <option value="active">Ativo</option>
                  <option value="blocked">Bloqueado</option>
                </select>
              </Field>
            </div>
            <RoleHelp role={editor.role} />
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button type="button" className="btn-secondary" onClick={() => setEditor(null)}>Cancelar</button>
              <button type="submit" className="btn-primary" disabled={saving}>{saving && <LoaderCircle className="size-4 animate-spin" />} Salvar usuário</button>
            </div>
          </form>
        </Modal>
      )}

      {resetUser && (
        <Modal title={"Redefinir senha de " + resetUser.name} onClose={() => setResetUser(null)}>
          <form onSubmit={resetUserPassword} className="space-y-4">
            <p className="text-sm leading-6 text-slate-500">As sessões atuais serão encerradas e o usuário deverá trocar esta senha temporária ao entrar novamente.</p>
            <Field label="Nova senha temporária">
              <div className="flex gap-2">
                <input className="field" value={resetPassword} onChange={(event) => setResetPassword(event.target.value)} required minLength={8} />
                <button type="button" className="btn-secondary px-3" title="Copiar senha" onClick={() => void navigator.clipboard.writeText(resetPassword)}><Copy className="size-4" /></button>
                <button type="button" className="btn-secondary px-3" title="Gerar outra senha" onClick={() => setResetPassword(generatePassword())}><RefreshCw className="size-4" /></button>
              </div>
            </Field>
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button type="button" className="btn-secondary" onClick={() => setResetUser(null)}>Cancelar</button>
              <button type="submit" className="btn-primary" disabled={saving}>{saving && <LoaderCircle className="size-4 animate-spin" />} Redefinir senha</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function Stat({ icon: Icon, label, value, color }: { icon: typeof UsersRound; label: string; value: number; color: "brand" | "emerald" | "violet" | "rose" }) {
  const colors = {
    brand: "bg-brand-100 text-brand-700",
    emerald: "bg-emerald-100 text-emerald-700",
    violet: "bg-violet-100 text-violet-700",
    rose: "bg-rose-100 text-rose-700",
  };
  return <div className="panel flex items-center gap-4 p-5"><span className={cn("grid size-11 place-items-center rounded-2xl", colors[color])}><Icon className="size-5" /></span><div><div className="text-2xl font-extrabold text-slate-900">{value}</div><div className="mt-0.5 text-xs font-semibold text-slate-400">{label}</div></div></div>;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center border-b border-slate-100 bg-white px-6 py-5">
          <h2 className="text-lg font-extrabold text-slate-900">{title}</h2>
          <button type="button" onClick={onClose} className="ml-auto grid size-9 place-items-center rounded-xl text-slate-400 hover:bg-slate-100"><X className="size-4" /></button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="label">{label}</span>{children}</label>;
}
function RoleBadge({ role }: { role: UserRole }) {
  const style = role === "ADMIN" ? "bg-violet-100 text-violet-700" : role === "OPERATOR" ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700";
  const label = role === "ADMIN" ? "Administrador" : role === "OPERATOR" ? "Operador" : "Cliente";
  return <span className={cn("inline-flex rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide", style)}>{label}</span>;
}
function StatusBadge({ active }: { active: boolean }) {
  return <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide", active ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700")}><span className={cn("size-1.5 rounded-full", active ? "bg-emerald-500" : "bg-rose-500")} />{active ? "Ativo" : "Bloqueado"}</span>;
}
function RoleHelp({ role }: { role: UserRole }) {
  const text = role === "ADMIN"
    ? "Administradores têm acesso total ao sistema e podem gerir todos os perfis."
    : role === "OPERATOR"
      ? "Operadores gerem clientes e outros operadores, mas não podem alterar administradores."
      : "Clientes possuem seu próprio espaço privado de Drive, YouTube, cursos, uploads e relatórios.";
  return <div className="rounded-xl bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-500">{text}</div>;
}
function Action({ title, onClick, icon: Icon, danger, disabled }: { title: string; onClick: () => void; icon: typeof Pencil; danger?: boolean; disabled?: boolean }) {
  return <button type="button" title={title} aria-label={title} onClick={onClick} disabled={disabled} className={cn("grid size-9 place-items-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-brand-600 disabled:cursor-not-allowed disabled:opacity-25", danger && "hover:bg-rose-50 hover:text-rose-600")}><Icon className="size-4" /></button>;
}
function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "US";
}
function formatDate(value: string | null) {
  if (!value) return "Nunca entrou";
  return new Intl.DateTimeFormat("pt-AO", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}
function generatePassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  const bytes = new Uint32Array(14);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => chars[value % chars.length]).join("");
}
