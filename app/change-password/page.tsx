import { redirect } from "next/navigation";
import { KeyRound, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/logo";
import { ChangePasswordForm } from "@/components/change-password-form";
import { getValidatedSession } from "@/lib/user-access";

export const metadata = { title: "Definir nova senha" };

export default async function ChangePasswordPage() {
  const session = await getValidatedSession();
  if (!session) redirect("/login");
  if (!session.mustChangePassword) redirect("/dashboard");

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-5 py-12">
      <div className="w-full max-w-[460px]">
        <div className="mb-8 flex justify-center"><Logo /></div>
        <section className="panel p-7 sm:p-9">
          <div className="grid size-12 place-items-center rounded-2xl bg-brand-100 text-brand-700">
            <KeyRound className="size-5" />
          </div>
          <h1 className="mt-5 text-3xl font-extrabold tracking-tight text-slate-900">Crie sua senha</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            O administrador criou seu acesso com uma senha temporária. Defina uma senha pessoal antes de continuar.
          </p>
          <ChangePasswordForm />
          <div className="mt-6 flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2.5 text-[11px] font-semibold text-emerald-700">
            <ShieldCheck className="size-4" /> Sua nova senha é armazenada de forma protegida.
          </div>
        </section>
      </div>
    </main>
  );
}
