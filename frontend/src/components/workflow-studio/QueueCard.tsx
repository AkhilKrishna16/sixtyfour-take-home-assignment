import type { QueueItem } from "./types";
import { BLOCK_META } from "./constants";
import { StatusBadge } from "./StatusBadge";
import { IcFile, IcX, IcLoader, IcDownloadCloud } from "./icons";

export function QueueCard({
  item,
  isSelected,
  onOpen,
  onDelete,
}: {
  item: QueueItem;
  isSelected: boolean;
  onOpen: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className={`group w-full cursor-pointer rounded-2xl border p-4 text-left transition-all hover:border-white/15 ${
        isSelected
          ? "border-violet-500/40 bg-violet-500/[0.06] shadow-lg shadow-violet-500/10"
          : "border-white/[0.07] bg-white/[0.03] hover:bg-white/[0.05]"
      }`}
    >
      {/* Header row */}
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-slate-500 flex-shrink-0"><IcFile /></span>
          <span className="truncate text-xs font-medium text-slate-300">{item.csv_file_name}</span>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <StatusBadge status={item.status} />
          {item.status !== "running" && item.status !== "pending" && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              title="Delete"
              className="rounded-md p-0.5 text-slate-700 transition-colors hover:text-rose-400"
            >
              <IcX />
            </button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1 w-full overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className="h-1 rounded-full transition-all duration-700"
          style={{
            width: item.status === "not_started" ? "0%" : `${item.progress_percentage}%`,
            background:
              item.status === "failed"      ? "#f43f5e" :
              item.status === "completed"   ? "#22c55e" :
              item.status === "not_started" ? "transparent" :
              "linear-gradient(90deg,#6366f1,#a78bfa)",
          }}
        />
      </div>

      {/* Status line */}
      <div className="mt-2.5 flex items-center justify-between text-[10px] text-slate-600">
        <span className="font-mono truncate max-w-[110px]">
          {item.workflow_id.startsWith("draft-")
            ? "draft"
            : `${item.workflow_id.split("-")[0]}…`}
        </span>
        <span className="flex items-center gap-1">
          {item.status === "running" && item.current_block && (
            <><span className="text-sky-500"><IcLoader /></span>{item.current_block}</>
          )}
          {item.status === "not_started" && "not run yet"}
          {item.status === "completed"   && `${item.rows_processed} rows`}
          {item.status === "failed"      && (
            <span className="text-rose-400">{item.error_message?.slice(0, 30)}</span>
          )}
        </span>
      </div>

      {/* Block pills from snapshot */}
      <div className="mt-2.5 flex flex-wrap gap-1">
        {item.pipeline_snapshot.slice(0, 5).map((b) => (
          <span
            key={b.id}
            className="rounded-full border px-2 py-0.5 text-[10px]"
            style={{
              borderColor: `${BLOCK_META[b.type].color}30`,
              color: BLOCK_META[b.type].color,
            }}
          >
            {BLOCK_META[b.type].label}
          </span>
        ))}
      </div>

      {/* Download indicator for completed runs */}
      {item.status === "completed" && item.output_path && (
        <div className="mt-2.5 flex items-center gap-1.5 text-[10px] text-emerald-500">
          <IcDownloadCloud />
          <span className="truncate font-mono">{item.output_path}</span>
        </div>
      )}
    </div>
  );
}
