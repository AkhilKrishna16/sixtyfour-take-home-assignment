import { IcPlus } from "./icons";

export function PipelineDropZone({ isOver }: { isOver: boolean }) {
  return (
    <div className={`flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-10 text-center transition-all ${
      isOver ? "border-violet-400/60 bg-violet-500/[0.06]" : "border-white/[0.07] bg-white/[0.02]"
    }`}>
      <div className={`flex h-10 w-10 items-center justify-center rounded-xl border transition-all ${
        isOver ? "border-violet-500/40 bg-violet-500/10 text-violet-400" : "border-white/[0.07] bg-white/[0.04] text-slate-600"
      }`}>
        <IcPlus />
      </div>
      <div>
        <p className={`text-sm font-medium transition-colors ${isOver ? "text-violet-300" : "text-slate-600"}`}>
          Drop a block here
        </p>
        <p className="mt-0.5 text-[11px] text-slate-700">Drag from the library to start building</p>
      </div>
    </div>
  );
}
