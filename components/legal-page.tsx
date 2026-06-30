import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/logo";

export function LegalPage({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
          <Logo />
          <Link href="/login" className="btn-secondary">
            <ArrowLeft className="size-4" /> Voltar ao login
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-6 py-12 md:py-16">
        <div className="mb-8 rounded-3xl bg-[#101827] px-7 py-10 text-white shadow-xl shadow-slate-900/10 md:px-10">
          <div className="mb-4 flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.18em] text-blue-300">
            <ShieldCheck className="size-4" /> {eyebrow}
          </div>
          <h1 className="text-3xl font-extrabold tracking-[-0.04em] md:text-5xl">{title}</h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300">{description}</p>
          <p className="mt-5 text-xs font-semibold text-slate-500">Última atualização: 30 de junho de 2026</p>
        </div>

        <article className="panel space-y-8 p-6 text-sm leading-7 text-slate-600 md:p-10
          [&_h2]:text-lg [&_h2]:font-extrabold [&_h2]:text-slate-900
          [&_h3]:font-extrabold [&_h3]:text-slate-800
          [&_a]:font-bold [&_a]:text-brand-600 [&_a]:underline
          [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5">
          {children}
        </article>

        <footer className="flex flex-col items-center justify-between gap-3 py-8 text-xs text-slate-400 sm:flex-row">
          <span>AulaSync Pro · F5 Soluções</span>
          <div className="flex gap-5">
            <Link href="/politica-de-privacidade" className="hover:text-brand-600">Política de Privacidade</Link>
            <Link href="/termos-de-uso" className="hover:text-brand-600">Termos de Uso</Link>
          </div>
        </footer>
      </div>
    </main>
  );
}
