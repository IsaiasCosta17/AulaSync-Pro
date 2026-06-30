"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, RotateCcw } from "lucide-react";

export function RetryButton({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  async function retry() {
    setLoading(true);
    try {
      const response = await fetch(`/api/uploads/${jobId}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "retry" }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        window.alert(data.error || "Não foi possível reenviar.");
        return;
      }
      router.push("/uploads");
      router.refresh();
    } catch {
      window.alert("Não foi possível conectar ao servidor.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button onClick={retry} disabled={loading} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-[10px] font-extrabold text-slate-600 hover:border-brand-200 hover:text-brand-600">
      {loading ? <LoaderCircle className="size-3 animate-spin" /> : <RotateCcw className="size-3" />} Reenviar
    </button>
  );
}
