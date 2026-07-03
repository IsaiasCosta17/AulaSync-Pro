import Link from "next/link";
import { ArrowLeft, KeyRound, ShieldCheck, UserCog } from "lucide-react";
import { Logo } from "@/components/logo";

export const metadata = { title: "Redefinir senha" };

export default function RecoverPasswordPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10">
      <div className="mx-auto w-full max-w-2xl">
        <Link href="/login" className="mb-8 inline-flex items-center gap-2 text-sm font-bold text-slate-500 transition hover:text-brand-600">
          <ArrowLeft className="size-4" />
          Voltar ao login
        </Link>

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl shadow-slate-200/50">
          <div className="border-b border-slate-100 bg-gradient-to-br from-brand-50 to-cyan-50 px-7 py-8 sm:px-10">
            <Logo />
            <div className="mt-8 flex size-12 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-lg shadow-brand-200">
              <KeyRound className="size-6" />
            </div>
            <h1 className="mt-5 text-3xl font-extrabold tracking-[-0.04em] text-slate-900">
              Redefinir senha
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600">
              Por segurança, nenhuma senha é enviada por e-mail ou exibida pelo sistema.
              Use o procedimento correspondente ao seu perfil.
            </p>
          </div>

          <div className="space-y-4 p-7 sm:p-10">
            <div className="rounded-2xl border border-slate-200 p-5">
              <div className="flex items-start gap-4">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                  <UserCog className="size-5" />
                </div>
                <div>
                  <h2 className="font-extrabold text-slate-900">Cliente ou operador</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Solicite ao administrador uma senha temporária. Ele fará a redefinição em
                    <strong> Administração → Usuários</strong>. No próximo acesso, você criará uma nova senha.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-5">
              <div className="flex items-start gap-4">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                  <ShieldCheck className="size-5" />
                </div>
                <div>
                  <h2 className="font-extrabold text-slate-900">Administrador principal</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-700">
                    Altere a variável <strong>ADMIN_PASSWORD</strong> na Hostinger e execute uma nova
                    implantação. A senha será sincronizada automaticamente durante a construção.
                  </p>
                </div>
              </div>
            </div>

            <Link href="/login" className="btn-primary mt-2 w-full">
              Voltar e entrar
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
