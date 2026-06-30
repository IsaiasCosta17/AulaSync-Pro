import Link from "next/link";
import {
  ArrowRight, CheckCircle2, Cloud, ListVideo, ShieldCheck,
  UploadCloud, Youtube,
} from "lucide-react";
import { Logo } from "@/components/logo";

export const metadata = {
  title: "Sobre",
  description: "Conheça o AulaSync Pro e sua automação segura entre Google Drive e YouTube.",
};

export default function AboutPage() {
  const features = [
    {
      icon: Cloud,
      title: "Google Drive organizado",
      text: "Localiza cursos, módulos e aulas em vídeo nas pastas autorizadas pelo usuário.",
    },
    {
      icon: Youtube,
      title: "Envio para o YouTube",
      text: "Cria ou reutiliza playlists e envia as aulas com privacidade configurável.",
    },
    {
      icon: UploadCloud,
      title: "Upload retomável",
      text: "Preserva o progresso e retoma arquivos grandes depois de falhas temporárias.",
    },
    {
      icon: ListVideo,
      title: "Relatórios e controle",
      text: "Acompanha cada aula, erros, velocidade, histórico e links dos vídeos.",
    },
  ];

  return (
    <main className="min-h-screen bg-white">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <Logo />
          <Link href="/login" className="btn-primary">
            Entrar <ArrowRight className="size-4" />
          </Link>
        </div>
      </header>

      <section className="overflow-hidden bg-[#101827] text-white">
        <div className="mx-auto grid max-w-6xl gap-12 px-6 py-20 lg:grid-cols-[1.08fr_.92fr] lg:items-center lg:py-28">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-xs font-bold text-blue-200">
              <ShieldCheck className="size-3.5 text-emerald-300" /> Automação segura para cursos em vídeo
            </div>
            <h1 className="mt-6 text-4xl font-extrabold leading-tight tracking-[-0.055em] md:text-6xl">
              Do Google Drive ao YouTube, com controle em cada aula.
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-8 text-slate-300">
              O AulaSync Pro conecta contas autorizadas, organiza cursos por módulos, envia vídeos e apresenta o resultado de cada tarefa em uma única interface.
            </p>
            <Link href="/login" className="btn-primary mt-8">
              Acessar o AulaSync <ArrowRight className="size-4" />
            </Link>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-6">
            <div className="space-y-4">
              {["Seleção de todas as aulas", "Playlists novas ou existentes", "Retomada automática", "Proteção contra duplicados"].map((item) => (
                <div key={item} className="flex items-center gap-3 rounded-2xl bg-white/[0.05] px-4 py-4">
                  <CheckCircle2 className="size-5 text-emerald-400" />
                  <span className="text-sm font-bold text-slate-200">{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16 md:py-20">
        <div className="max-w-2xl">
          <div className="text-xs font-extrabold uppercase tracking-[0.18em] text-brand-600">Como funciona</div>
          <h2 className="mt-3 text-3xl font-extrabold tracking-[-0.04em] text-slate-900">Automação transparente e controlada</h2>
        </div>
        <div className="mt-10 grid gap-5 md:grid-cols-2">
          {features.map(({ icon: Icon, title, text }) => (
            <article key={title} className="panel p-6">
              <div className="grid size-11 place-items-center rounded-xl bg-brand-50 text-brand-600">
                <Icon className="size-5" />
              </div>
              <h3 className="mt-5 text-base font-extrabold text-slate-900">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-500">{text}</p>
            </article>
          ))}
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-slate-50">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 text-xs text-slate-500 sm:flex-row">
          <span>AulaSync Pro · F5 Soluções</span>
          <div className="flex gap-5">
            <Link href="/politica-de-privacidade" className="font-bold hover:text-brand-600">Política de Privacidade</Link>
            <Link href="/termos-de-uso" className="font-bold hover:text-brand-600">Termos de Uso</Link>
            <a href="mailto:f5solucoes567@gmail.com" className="font-bold hover:text-brand-600">Contato</a>
          </div>
        </div>
      </footer>
    </main>
  );
}
