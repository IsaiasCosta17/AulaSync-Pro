"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, LoaderCircle, LockKeyhole, Mail } from "lucide-react";

export function LoginForm() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const form = new FormData(event.currentTarget);
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 20_000);
      let response: Response;
      try {
        response = await fetch("/api/auth/login", {
          method: "POST",
          cache: "no-store",
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
          },
          body: JSON.stringify({
            email: form.get("email"),
            password: form.get("password"),
          }),
        });
      } finally {
        window.clearTimeout(timeout);
      }

      const rawBody = await response.text();
      let data: { error?: string; redirect?: string } = {};
      try {
        data = rawBody ? JSON.parse(rawBody) : {};
      } catch {
        data = {};
      }

      if (!response.ok) {
        const fallback =
          response.status === 503
            ? "Servidor temporariamente indisponível (HTTP 503)."
            : response.status === 504
              ? "O servidor demorou demais para responder (HTTP 504)."
              : `Falha do servidor (HTTP ${response.status}).`;
        setError(data.error || fallback);
        return;
      }
      router.push(data.redirect || "/dashboard");
      router.refresh();
    } catch (error) {
      setError(
        error instanceof DOMException && error.name === "AbortError"
          ? "O servidor não respondeu em 20 segundos."
          : "Não foi possível conectar ao servidor.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 space-y-5">
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700" role="alert">
          {error}
        </div>
      )}
      <div>
        <label className="label" htmlFor="email">E-mail</label>
        <div className="relative">
          <Mail className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input id="email" name="email" type="email" className="field pl-10" placeholder="admin@aulasync.pro" required autoComplete="email" />
        </div>
      </div>
      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="text-sm font-semibold text-slate-700" htmlFor="password">Senha</label>
          <Link href="/recuperar-senha" className="text-xs font-bold text-brand-600 transition hover:text-brand-700 hover:underline">Redefinir senha</Link>
        </div>
        <div className="relative">
          <LockKeyhole className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input id="password" name="password" type={showPassword ? "text" : "password"} className="field px-10" placeholder="••••••••" required minLength={6} autoComplete="current-password" />
          <button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700" aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}>
            {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </div>
      <button type="submit" className="btn-primary !h-12 w-full" disabled={loading}>
        {loading ? <><LoaderCircle className="size-4 animate-spin" /> Entrando...</> : "Entrar no painel"}
      </button>
      <div className="flex items-center justify-center gap-2 text-[11px] font-semibold text-slate-400">
        <LockKeyhole className="size-3" /> Seus tokens Google nunca são enviados ao navegador
      </div>
    </form>
  );
}
