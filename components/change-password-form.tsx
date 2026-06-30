"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, KeyRound, LoaderCircle, LockKeyhole } from "lucide-react";

export function ChangePasswordForm() {
  const router = useRouter();
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const newPassword = String(form.get("newPassword") || "");
    if (newPassword !== form.get("confirmation")) {
      setError("A confirmação da nova senha não confere.");
      setLoading(false);
      return;
    }
    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: form.get("currentPassword"),
          newPassword,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || "Não foi possível atualizar a senha.");
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Não foi possível conectar ao servidor.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-7 space-y-5">
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          {error}
        </div>
      )}
      <PasswordField name="currentPassword" label="Senha temporária ou atual" show={show} />
      <PasswordField name="newPassword" label="Nova senha" show={show} minLength={8} />
      <PasswordField name="confirmation" label="Confirmar nova senha" show={show} minLength={8} />
      <button
        type="button"
        onClick={() => setShow((value) => !value)}
        className="flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-brand-600"
      >
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        {show ? "Ocultar senhas" : "Mostrar senhas"}
      </button>
      <button type="submit" className="btn-primary !h-12 w-full" disabled={loading}>
        {loading ? <><LoaderCircle className="size-4 animate-spin" /> Salvando...</> : <><KeyRound className="size-4" /> Definir nova senha</>}
      </button>
    </form>
  );
}

function PasswordField({
  name,
  label,
  show,
  minLength = 6,
}: {
  name: string;
  label: string;
  show: boolean;
  minLength?: number;
}) {
  return (
    <div>
      <label htmlFor={name} className="label">{label}</label>
      <div className="relative">
        <LockKeyhole className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
        <input
          id={name}
          name={name}
          type={show ? "text" : "password"}
          className="field pl-10"
          required
          minLength={minLength}
          autoComplete={name === "currentPassword" ? "current-password" : "new-password"}
        />
      </div>
    </div>
  );
}
