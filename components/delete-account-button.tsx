"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Trash2 } from "lucide-react";

export function DeleteAccountButton({ type, id, name }: { type: "drive" | "youtube"; id: string; name: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function remove() {
    if (!window.confirm(`Remover “${name}” das contas conectadas?`)) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/accounts/${type}/${id}`, { method: "DELETE" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        window.alert(data.error || "Não foi possível remover.");
        return;
      }
      router.refresh();
    } catch {
      window.alert("Não foi possível conectar ao servidor.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button onClick={remove} disabled={loading} className="grid size-9 place-items-center rounded-xl border border-slate-200 text-slate-400 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600" aria-label="Remover conta">
      {loading ? <LoaderCircle className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
    </button>
  );
}
