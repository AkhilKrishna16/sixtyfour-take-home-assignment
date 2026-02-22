"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { PipelineBlock, BlockStatus } from "./types";
import { BLOCK_META } from "./constants";
import {
  IcGrip,
  IcSettings,
  IcX,
  IcCheck,
  IcLoader,
  IcArrowRight,
  IcDownloadCloud,
} from "./icons";

export function SortablePipelineBlock({
  block,
  status,
  isLast,
  onConfig,
  onDelete,
  onDownload,
  interactive = true,
}: {
  block: PipelineBlock;
  status: BlockStatus;
  isLast: boolean;
  onConfig: () => void;
  onDelete: () => void;
  onDownload?: () => void;
  interactive?: boolean;
}) {
  const meta = BLOCK_META[block.type];
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: block.id,
    data: { source: "pipeline", type: block.type },
    disabled: !interactive,
  });

  const borderClass =
    status === "active"  ? "border-white/20 shadow-lg"     :
    status === "done"    ? "border-emerald-500/30"          :
    status === "failed"  ? "border-rose-500/40"             :
    "border-white/[0.08] hover:border-white/15";

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className="flex items-center flex-shrink-0"
    >
      <div
        className={`relative flex flex-col w-[260px] rounded-2xl border bg-[#0f0f1a] transition-all duration-200 ${borderClass}`}
        style={{
          opacity: isDragging ? 0.35 : 1,
          boxShadow:
            status === "active" ? `0 0 0 1px ${meta.color}50, 0 0 20px ${meta.glow}` :
            status === "done"   ? `0 0 0 1px rgba(34,197,94,0.2)` : undefined,
        }}
      >
        {/* Active pulse ring */}
        {status === "active" && (
          <div
            className="animate-pulse-ring absolute inset-0 rounded-2xl border-2 pointer-events-none"
            style={{ borderColor: `${meta.color}60` }}
          />
        )}

        {/* Drag handle */}
        {interactive && (
          <div
            {...attributes}
            {...listeners}
            className="flex justify-center pt-2 pb-0.5 cursor-grab active:cursor-grabbing text-slate-700 hover:text-slate-500 transition-colors"
          >
            <IcGrip />
          </div>
        )}

        <div className={`flex flex-col gap-4 px-5 ${interactive ? "pb-5 pt-2" : "py-5"}`}>
          {/* Icon + status */}
          <div className="flex items-center justify-between gap-1">
            <div
              className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl"
              style={{ backgroundColor: `${meta.color}18`, color: meta.color }}
            >
              {meta.icon}
            </div>
            <div className="flex items-center gap-1.5">
              {/* Compact download button in snapshot view — no extra height added */}
              {!interactive && block.type === "save_csv" && onDownload && (
                <button
                  type="button"
                  title="Download this CSV output"
                  onClick={(e) => { e.stopPropagation(); onDownload(); }}
                  className="rounded-lg border border-white/[0.07] bg-white/[0.04] p-1.5 text-slate-600 transition-all hover:border-emerald-500/30 hover:text-emerald-400"
                >
                  <IcDownloadCloud />
                </button>
              )}
              {status === "active" && <span className="text-sky-400"><IcLoader /></span>}
              {status === "done" && (
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 shadow shadow-emerald-500/40">
                  <IcCheck />
                </div>
              )}
              {status === "failed" && (
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-500">
                  <IcX />
                </div>
              )}
            </div>
          </div>

          {/* Label */}
          <div className="min-w-0">
            <p className="text-[15px] font-semibold leading-tight text-slate-200 truncate">{meta.label}</p>
            <p className="mt-0.5 text-[12px] text-slate-500 truncate">{meta.sub}</p>
          </div>

          {/* Action buttons — editor mode */}
          {interactive && (
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onConfig(); }}
                className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-white/[0.07] bg-white/[0.04] py-2 text-[12px] text-slate-500 transition-all hover:border-white/15 hover:text-slate-300"
              >
                <IcSettings /><span>Config</span>
              </button>
              {block.type === "save_csv" && onDownload && (
                <button
                  type="button"
                  title="Download this CSV output"
                  onClick={(e) => { e.stopPropagation(); onDownload(); }}
                  className="rounded-lg border border-white/[0.07] bg-white/[0.04] p-2 text-slate-600 transition-all hover:border-emerald-500/30 hover:text-emerald-400"
                >
                  <IcDownloadCloud />
                </button>
              )}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
                className="rounded-lg border border-white/[0.07] bg-white/[0.04] p-2 text-slate-600 transition-all hover:border-rose-500/30 hover:text-rose-400"
              >
                <IcX />
              </button>
            </div>
          )}
        </div>

        {/* Left accent bar */}
        <div
          className="absolute left-0 top-3 bottom-3 w-0.5 rounded-r-full"
          style={{ backgroundColor: meta.color, opacity: status === "pending" ? 0.3 : 1 }}
        />
      </div>

      {/* Arrow connector */}
      {!isLast && (
        <div className="flex items-center px-2 text-slate-700 flex-shrink-0">
          <IcArrowRight />
        </div>
      )}
    </div>
  );
}
