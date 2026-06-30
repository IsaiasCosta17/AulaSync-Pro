import { Play } from "lucide-react";
import { cn } from "@/lib/utils";

export function Logo({ compact = false, dark = false }: { compact?: boolean; dark?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="relative grid size-10 shrink-0 place-items-center rounded-xl bg-brand-500 text-white shadow-lg shadow-brand-500/20">
        <div className="absolute inset-1 rounded-[9px] border border-white/25" />
        <Play className="ml-0.5 size-4 fill-current" />
      </div>
      {!compact && (
        <div className="leading-tight">
          <div className={cn("text-[17px] font-extrabold tracking-[-0.03em]", dark ? "text-white" : "text-slate-900")}>
            AulaSync
          </div>
          <div className="text-[10px] font-extrabold uppercase tracking-[0.24em] text-brand-500">Pro</div>
        </div>
      )}
    </div>
  );
}
