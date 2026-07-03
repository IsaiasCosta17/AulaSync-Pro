"use client";

import { FormEvent, useState } from "react";
import {
  CheckCircle2, Image, LoaderCircle, RefreshCw, Save, ShieldCheck,
  SlidersHorizontal, Tags, UploadCloud,
} from "lucide-react";
import type { AppSettings } from "@/lib/settings";

export function SettingsForm({ initialSettings }: { initialSettings: AppSettings }) {
  const [settings, setSettings] = useState(initialSettings);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function update<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Não foi possível salvar.");
      setSettings(data);
      setMessage("Configurações salvas e aplicadas às próximas operações.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Falha ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      {(message || error) && (
        <div className={`rounded-xl border px-4 py-3 text-sm font-semibold ${
          error
            ? "border-rose-200 bg-rose-50 text-rose-700"
            : "border-emerald-200 bg-emerald-50 text-emerald-700"
        }`}>
          {error || message}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="panel p-6">
          <div className="mb-6 flex items-center gap-3">
            <div className="grid size-11 place-items-center rounded-xl bg-brand-50 text-brand-600">
              <SlidersHorizontal className="size-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-slate-900">Concorrência e retomadas</h2>
              <p className="mt-1 text-xs text-slate-400">Velocidade com proteção contra timeouts</p>
            </div>
          </div>
          <div className="space-y-5">
            <div>
              <label className="label" htmlFor="concurrency">Uploads simultâneos</label>
              <input
                id="concurrency"
                className="field"
                type="number"
                min={1}
                max={10}
                value={settings.maxConcurrentUploads}
                onChange={(event) => update("maxConcurrentUploads", Number(event.target.value))}
              />
              <p className="mt-1.5 text-[10px] leading-4 text-slate-400">Escolha entre 1 e 10. O padrão recomendado é 3.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="retry">Nova tentativa temporária</label>
                <div className="relative">
                  <RefreshCw className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                  <input
                    id="retry"
                    className="field pl-10"
                    type="number"
                    min={5}
                    max={300}
                    value={settings.temporaryRetrySeconds}
                    onChange={(event) => update("temporaryRetrySeconds", Number(event.target.value))}
                  />
                </div>
                <p className="mt-1 text-[10px] text-slate-400">segundos</p>
              </div>
              <div>
                <label className="label">Limite diário do YouTube</label>
                <div className="field relative flex items-center pl-10 text-sm font-semibold text-slate-700">
                  <RefreshCw className="absolute left-3.5 size-4 text-slate-400" />
                  Retomada automática após 24 horas
                </div>
                <p className="mt-1 text-[10px] text-slate-400">A pausa afeta somente o canal limitado.</p>
              </div>
            </div>
            <Toggle
              title="Redução automática de concorrência"
              description="Diminui temporariamente o número de envios quando houver vários erros de rede."
              checked={settings.adaptiveConcurrencyEnabled}
              onChange={(value) => update("adaptiveConcurrencyEnabled", value)}
            />
            <Toggle
              title="Verificação de duplicados"
              description="Reutiliza vídeos já enviados para o mesmo canal."
              checked={settings.duplicateCheckEnabled}
              onChange={(value) => update("duplicateCheckEnabled", value)}
            />
          </div>
        </section>

        <section className="panel p-6">
          <div className="mb-6 flex items-center gap-3">
            <div className="grid size-11 place-items-center rounded-xl bg-violet-50 text-violet-600">
              <UploadCloud className="size-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-slate-900">Padrões dos vídeos</h2>
              <p className="mt-1 text-xs text-slate-400">Aplicados automaticamente aos novos uploads</p>
            </div>
          </div>
          <div className="space-y-5">
            <div>
              <label className="label">Privacidade padrão</label>
              <select
                className="field"
                value={settings.defaultPrivacy}
                onChange={(event) => update("defaultPrivacy", event.target.value as AppSettings["defaultPrivacy"])}
              >
                <option value="unlisted">Não listado</option>
                <option value="private">Privado</option>
                <option value="public">Público</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="description">Descrição padrão</label>
              <textarea
                id="description"
                className="field min-h-28 resize-y py-3"
                maxLength={5000}
                value={settings.defaultDescription}
                onChange={(event) => update("defaultDescription", event.target.value)}
              />
            </div>
            <div>
              <label className="label" htmlFor="tags">Tags padrão</label>
              <div className="relative">
                <Tags className="absolute left-3.5 top-3.5 size-4 text-slate-400" />
                <input
                  id="tags"
                  className="field pl-10"
                  value={settings.defaultTags}
                  onChange={(event) => update("defaultTags", event.target.value)}
                  placeholder="curso, aula, treinamento"
                  maxLength={500}
                />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="thumbnail">Miniatura padrão do Drive</label>
              <div className="relative">
                <Image className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="thumbnail"
                  className="field pl-10"
                  value={settings.defaultThumbnailDriveFileId || ""}
                  onChange={(event) => update("defaultThumbnailDriveFileId", event.target.value.trim() || null)}
                  placeholder="ID opcional de uma imagem no Google Drive"
                  maxLength={200}
                />
              </div>
              <p className="mt-1.5 text-[10px] leading-4 text-slate-400">Usada somente quando o canal permite miniaturas personalizadas.</p>
            </div>
          </div>
        </section>
      </div>

      <div className="panel flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
        <div className="flex flex-1 items-center gap-3">
          <ShieldCheck className="size-5 text-emerald-500" />
          <p className="text-xs leading-5 text-slate-500">Tokens e chaves continuam armazenados somente no servidor e nunca aparecem nesta tela.</p>
        </div>
        <button type="submit" className="btn-primary sm:min-w-48" disabled={saving}>
          {saving ? <LoaderCircle className="size-4 animate-spin" /> : message ? <CheckCircle2 className="size-4" /> : <Save className="size-4" />}
          {saving ? "Salvando..." : "Salvar configurações"}
        </button>
      </div>
    </form>
  );
}

function Toggle({
  title,
  description,
  checked,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-4">
      <input
        type="checkbox"
        className="mt-0.5 size-4 accent-brand-600"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>
        <span className="block text-xs font-extrabold text-slate-700">{title}</span>
        <span className="mt-1 block text-[10px] leading-4 text-slate-400">{description}</span>
      </span>
    </label>
  );
}
