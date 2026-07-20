import Link from "next/link";
import { CheckCircle2, Cloud, Play, ShieldCheck, Sparkles, UploadCloud, Youtube } from "lucide-react";
import { Logo } from "@/components/logo";
import { LoginForm } from "@/components/login-form";

export const metadata = { title: "Entrar" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ expired?: string }>;
}) {
  const params = await searchParams;
  return (
    <main className="grid min-h-screen bg-white lg:grid-cols-[1.08fr_.92fr]">
      <section className="relative hidden overflow-hidden bg-[#101827] p-12 text-white lg:flex lg:flex-col xl:p-16">
        <div className="absolute -right-40 -top-40 size-[460px] rounded-full bg-brand-500/20 blur-3xl" />
        <div className="absolute -bottom-40 -left-20 size-[380px] rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="relative z-10"><Logo dark /></div>

        <div className="relative z-10 my-auto max-w-xl py-16">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-xs font-bold text-blue-200">
            <Sparkles className="size-3.5 text-cyan-300" /> Automação para infoprodutores
          </div>
          <h1 className="text-5xl font-extrabold leading-[1.08] tracking-[-0.055em] xl:text-6xl">
            Seus cursos no YouTube, <span className="text-blue-400">sem trabalho manual.</span>
          </h1>
          <p className="mt-6 max-w-lg text-base leading-7 text-slate-400">
            Selecione uma pasta no Google Drive. O AulaSync organiza as aulas, cria a playlist e acompanha cada envio.
          </p>

          <div className="relative mt-12 h-52 max-w-lg">
            <div className="absolute left-0 top-14 w-40 rounded-2xl border border-white/10 bg-white/[0.07] p-4 backdrop-blur">
              <div className="mb-3 flex items-center gap-2 text-xs font-bold"><Cloud className="size-4 text-amber-300" /> Google Drive</div>
              <div className="space-y-2">
                {[70, 88, 55].map((width) => <div key={width} className="h-2 rounded-full bg-white/10" style={{ width: `${width}%` }} />)}
              </div>
            </div>
            <div className="absolute left-[43%] top-[88px] flex items-center gap-2 text-blue-300">
              <span className="h-px w-10 bg-blue-400/40" /><UploadCloud className="size-5" /><span className="h-px w-10 bg-blue-400/40" />
            </div>
            <div className="absolute right-0 top-7 w-44 rounded-2xl border border-white/10 bg-white/[0.07] p-4 backdrop-blur">
              <div className="mb-3 flex items-center gap-2 text-xs font-bold"><Youtube className="size-4 text-rose-400" /> YouTube</div>
              <div className="mb-3 aspect-video rounded-lg bg-gradient-to-br from-slate-700 to-slate-800 grid place-items-center"><Play className="size-5 fill-white" /></div>
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-300"><CheckCircle2 className="size-3" /> Enviado com sucesso</div>
            </div>
          </div>
        </div>

        <div className="relative z-10 flex items-center gap-2 text-xs text-slate-500">
          <ShieldCheck className="size-4 text-emerald-400" /> OAuth 2.0 · Tokens criptografados · Acesso controlado
        </div>
      </section>

      <section className="flex min-h-screen items-center justify-center px-6 py-12">
        <div className="w-full max-w-[420px]">
          <div className="mb-10 lg:hidden"><Logo /></div>
          <div className="text-xs font-extrabold uppercase tracking-[0.18em] text-brand-600">Bem-vindo de volta</div>
          <h2 className="mt-3 text-4xl font-extrabold tracking-[-0.045em] text-slate-900">Entre na sua conta</h2>
          <p className="mt-3 text-sm leading-6 text-slate-500">Use as credenciais fornecidas pelo administrador para acessar o painel.</p>
          {params.expired === "1" && (
            <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700">
              Sua sessão expirou. Entre novamente para continuar com segurança.
            </div>
          )}
          <LoginForm />
          <div className="mt-10 text-center text-xs text-slate-400">
            <p>AulaSync Pro · Automação de cursos em vídeo</p>
            <div className="mt-3 flex items-center justify-center gap-3">
              <Link href="/politica-de-privacidade" className="font-bold text-slate-500 transition hover:text-brand-600">Política de Privacidade</Link>
              <span aria-hidden="true">·</span>
              <Link href="/termos-de-uso" className="font-bold text-slate-500 transition hover:text-brand-600">Termos de Uso</Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
