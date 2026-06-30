"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, CirclePause, CirclePlay, LoaderCircle, RefreshCw } from "lucide-react";

export function TaskActions({ jobId, status }: { jobId: string; status: string }) {
  const router = useRouter();
  const [acting, setActing] = useState(false);
  const [error, setError] = useState("");

  async function act(action: "pause" | "resume" | "cancel" | "retry") {
    if (action === "cancel" && !window.confirm("Cancelar esta tarefa? Vídeos já enviados continuarão no YouTube.")) return;
    setActing(true);
    setError("");
    try {
      const response = await fetch(`/api/uploads/${jobId}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Ação não concluída.");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Falha na ação.");
    } finally {
      setActing(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {status === "RUNNING" && <button className="btn-secondary" disabled={acting} onClick={() => act("pause")}><CirclePause className="size-4" /> Pausar tarefa</button>}
        {["PAUSED", "PENDING", "QUOTA_REACHED"].includes(status) && <button className="btn-secondary" disabled={acting} onClick={() => act("resume")}><CirclePlay className="size-4" /> Continuar tarefa</button>}
        {status === "FAILED" && <button className="btn-secondary" disabled={acting} onClick={() => act("retry")}><RefreshCw className="size-4" /> Reenviar apenas erros</button>}
        {!["COMPLETED", "CANCELLED"].includes(status) && <button className="btn-secondary text-rose-600" disabled={acting} onClick={() => act("cancel")}><Ban className="size-4" /> Cancelar tarefa</button>}
        {acting && <LoaderCircle className="size-5 animate-spin text-brand-600" />}
      </div>
      {error && <div className="mt-2 text-xs font-semibold text-rose-600">{error}</div>}
    </div>
  );
}
