import type { BlockType } from "./types";
import { BLOCK_META } from "./constants";

export function DragOverlayCard({ type }: { type: BlockType }) {
  const meta = BLOCK_META[type];
  return (
    <div
      className="flex items-center gap-2.5 rounded-xl border border-white/20 bg-[#0f0f1a] px-3 py-2.5 shadow-2xl shadow-black/60"
      style={{ rotate: "2deg", scale: "1.04" }}
    >
      <div
        className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg"
        style={{ backgroundColor: `${meta.color}20`, color: meta.color }}
      >
        {meta.icon}
      </div>
      <div>
        <p className="text-xs font-medium text-slate-200">{meta.label}</p>
        <p className="text-[10px] text-slate-600">{meta.sub}</p>
      </div>
    </div>
  );
}
