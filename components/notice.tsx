import { AlertCircle, CheckCircle2 } from "lucide-react";

export function Notice({ success, error }: { success?: boolean; error?: string }) {
  if (!success && !error) return null;
  return (
    <div className={`mb-6 flex items-start gap-3 rounded-2xl border px-4 py-3.5 text-sm font-semibold ${error ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
      {error ? <AlertCircle className="mt-0.5 size-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 size-4 shrink-0" />}
      {error || "Conta conectada com sucesso."}
    </div>
  );
}
