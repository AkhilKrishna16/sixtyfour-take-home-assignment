"use client";

import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useEffect, useMemo, useRef, useState } from "react";

/* ══════════════════════════════════════════════════════════════════════════════
   Types
══════════════════════════════════════════════════════════════════════════════ */
type BlockType =
  | "read_csv"
  | "filter"
  | "enrich_lead"
  | "find_email"
  | "save_csv"
  | "compute_column";
type BlockStatus = "pending" | "active" | "done" | "failed";

type PipelineBlock = {
  id: string;
  type: BlockType;
  params: Record<string, unknown>;
};

type WorkflowStatusPayload = {
  workflow_id: string;
  status: string;
  current_block: string | null;
  progress_percentage: number;
  rows_processed: number;
  total_rows: number;
  error_message: string | null;
  output_path: string | null;
};

type QueueItem = {
  local_id: string;
  workflow_id: string;
  csv_file_name: string;
  pipeline_snapshot: PipelineBlock[];
  status: string;
  current_block: string | null;
  progress_percentage: number;
  rows_processed: number;
  total_rows: number;
  error_message: string | null;
  output_path: string | null;
};

type PreviewData = {
  columns: string[];
  rows: Record<string, unknown>[];
};

/* ══════════════════════════════════════════════════════════════════════════════
   Constants
══════════════════════════════════════════════════════════════════════════════ */
const API_BASE = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000"
).replace(/\/$/, "");
const DEFAULT_CSV_PATH = "backend/_smoke_input.csv";
const DEFAULT_SAVE_PATH = "backend/workflow_output.csv";
const makeId = () => crypto.randomUUID();

const DEFAULT_PARAMS: Record<BlockType, Record<string, unknown>> = {
  read_csv: { path: DEFAULT_CSV_PATH },
  filter: { column: "", operator: "contains", value: "" },
  enrich_lead: { research_plan: "" },
  find_email: { mode: "PROFESSIONAL" },
  save_csv: { path: DEFAULT_SAVE_PATH },
  compute_column: {
    column: "",
    source_column: "",
    operator: "contains",
    value: "",
  },
};

const DEFAULT_PIPELINE: PipelineBlock[] = [
  { id: "dp-1", type: "read_csv", params: { path: DEFAULT_CSV_PATH } },
  {
    id: "dp-2",
    type: "filter",
    params: { column: "company", operator: "contains", value: "" },
  },
  { id: "dp-3", type: "enrich_lead", params: { research_plan: "" } },
  { id: "dp-4", type: "find_email", params: { mode: "PROFESSIONAL" } },
  { id: "dp-5", type: "save_csv", params: { path: DEFAULT_SAVE_PATH } },
];

const LIBRARY_BLOCKS: BlockType[] = [
  "read_csv",
  "filter",
  "enrich_lead",
  "find_email",
  "save_csv",
  "compute_column",
];

type BlockMeta = {
  label: string;
  sub: string;
  color: string;
  glow: string;
  icon: React.ReactNode;
};

/* ══════════════════════════════════════════════════════════════════════════════
   Icons
══════════════════════════════════════════════════════════════════════════════ */
function IcTable() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="3" y1="9" x2="21" y2="9" />
      <line x1="3" y1="15" x2="21" y2="15" />
      <line x1="9" y1="3" x2="9" y2="21" />
    </svg>
  );
}
function IcSparkles() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
    </svg>
  );
}
function IcFunnel() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  );
}
function IcMail() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94" />
    </svg>
  );
}
function IcDownload() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}
function IcUpload() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}
function IcPlay() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  );
}
function IcCheck() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
function IcX() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
    >
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}
function IcSettings() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
function IcFile() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}
function IcLoader() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      style={{ animation: "spin 0.9s linear infinite" }}
    >
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}
function IcChevronRight() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}
function IcGrip() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="9" cy="5" r="1.5" />
      <circle cx="15" cy="5" r="1.5" />
      <circle cx="9" cy="12" r="1.5" />
      <circle cx="15" cy="12" r="1.5" />
      <circle cx="9" cy="19" r="1.5" />
      <circle cx="15" cy="19" r="1.5" />
    </svg>
  );
}
function IcArrowRight() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="13 6 19 12 13 18" />
    </svg>
  );
}
function IcPlus() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
function IcFormula() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5a2 2 0 0 0 2 2h1" />
      <path d="M16 3h1a2 2 0 0 1 2 2v5a2 2 0 0 0 2 2 2 2 0 0 0-2 2v5a2 2 0 0 1-2 2h-1" />
      <path d="M10 12h4" />
    </svg>
  );
}
function IcDownloadCloud() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="8 17 12 21 16 17" />
      <line x1="12" y1="12" x2="12" y2="21" />
      <path d="M20.88 18.09A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.29" />
    </svg>
  );
}
function IcCode() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  );
}
function IcTable2() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="3" y1="9" x2="21" y2="9" />
      <line x1="3" y1="15" x2="21" y2="15" />
      <line x1="9" y1="3" x2="9" y2="21" />
    </svg>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   Block metadata
══════════════════════════════════════════════════════════════════════════════ */
const BLOCK_META: Record<BlockType, BlockMeta> = {
  read_csv: {
    label: "Read CSV",
    sub: "Load data source",
    color: "#10b981",
    glow: "rgba(16,185,129,0.35)",
    icon: <IcTable />,
  },
  enrich_lead: {
    label: "Enrich Lead",
    sub: "AI data enrichment",
    color: "#a78bfa",
    glow: "rgba(167,139,250,0.35)",
    icon: <IcSparkles />,
  },
  filter: {
    label: "Filter",
    sub: "Apply conditions",
    color: "#f59e0b",
    glow: "rgba(245,158,11,0.35)",
    icon: <IcFunnel />,
  },
  find_email: {
    label: "Find Email",
    sub: "Email discovery",
    color: "#38bdf8",
    glow: "rgba(56,189,248,0.35)",
    icon: <IcMail />,
  },
  save_csv: {
    label: "Save CSV",
    sub: "Export results",
    color: "#fb7185",
    glow: "rgba(251,113,133,0.35)",
    icon: <IcDownload />,
  },
  compute_column: {
    label: "Compute Column",
    sub: "Add derived column",
    color: "#f97316",
    glow: "rgba(249,115,22,0.35)",
    icon: <IcFormula />,
  },
};

/* ══════════════════════════════════════════════════════════════════════════════
   CSV parser
══════════════════════════════════════════════════════════════════════════════ */
function parseCsv(raw: string): {
  headers: string[];
  rows: Record<string, string>[];
} {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return { headers: [], rows: [] };
  const splitLine = (line: string) => {
    const out: string[] = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQ && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQ = !inQ;
      } else if (c === "," && !inQ) {
        out.push(cur);
        cur = "";
      } else cur += c;
    }
    out.push(cur);
    return out.map((v) => v.trim());
  };
  const headers = splitLine(lines[0]);
  const rows = lines.slice(1).map((l) => {
    const p = splitLine(l);
    return Object.fromEntries(headers.map((h, i) => [h, p[i] ?? ""]));
  });
  return { headers, rows };
}

/* ══════════════════════════════════════════════════════════════════════════════
   LibraryBlockTile — draggable from the block palette
══════════════════════════════════════════════════════════════════════════════ */
function LibraryBlockTile({ type }: { type: BlockType }) {
  const meta = BLOCK_META[type];
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: `lib::${type}`,
      data: { source: "library", type },
    });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.35 : 1,
      }}
      className="flex cursor-grab items-center gap-2.5 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 transition-all select-none active:cursor-grabbing hover:border-white/15 hover:bg-white/[0.07]"
    >
      <div
        className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg"
        style={{ backgroundColor: `${meta.color}20`, color: meta.color }}
      >
        {meta.icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-slate-200 leading-tight">
          {meta.label}
        </p>
        <p className="text-[10px] text-slate-600 truncate">{meta.sub}</p>
      </div>
      <span className="text-slate-700 flex-shrink-0">
        <IcGrip />
      </span>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   SortablePipelineBlock — draggable + sortable inside the canvas
══════════════════════════════════════════════════════════════════════════════ */
function SortablePipelineBlock({
  block,
  status,
  isLast,
  onConfig,
  onDelete,
}: {
  block: PipelineBlock;
  status: BlockStatus;
  isLast: boolean;
  onConfig: () => void;
  onDelete: () => void;
}) {
  const meta = BLOCK_META[block.type];
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: block.id,
    data: { source: "pipeline", type: block.type },
  });

  return (
    <div
      data-pipeline-block="true"
      className="flex flex-shrink-0 items-center gap-4"
    >
      {/* Block card */}
      <div
        ref={setNodeRef}
        style={{
          transform: CSS.Transform.toString(transform),
          transition,
          opacity: isDragging ? 0.2 : 1,
          boxShadow:
            status === "active"
              ? `0 0 0 1px ${meta.color}50, 0 0 40px ${meta.glow}`
              : status === "done"
                ? `0 0 0 1px rgba(34,197,94,0.2)`
                : undefined,
        }}
        className={`relative w-56 rounded-2xl border bg-[#0f0f1a] transition-all duration-200 ${
          status === "active"
            ? "border-white/20 shadow-2xl"
            : status === "done"
              ? "border-white/10"
              : status === "failed"
                ? "border-rose-500/50"
                : "border-white/[0.07] hover:border-white/15"
        }`}
      >
        {status === "active" && (
          <div
            className="animate-pulse-ring absolute inset-0 rounded-2xl border-2"
            style={{ borderColor: `${meta.color}60` }}
          />
        )}

        {/* Drag handle — top center grip */}
        <div
          {...attributes}
          {...listeners}
          className="absolute inset-x-0 top-0 flex cursor-grab items-center justify-center pb-1 pt-2.5 text-slate-700 hover:text-slate-500 transition-colors active:cursor-grabbing"
        >
          <IcGrip />
        </div>

        <div className="flex flex-col gap-4 p-5 pt-8">
          {/* Icon + status indicator */}
          <div className="flex items-center justify-between">
            <div
              className="flex h-11 w-11 items-center justify-center rounded-2xl flex-shrink-0"
              style={{
                backgroundColor: `${meta.color}18`,
                color: meta.color,
                boxShadow: `0 0 16px ${meta.glow}`,
              }}
            >
              <span className="scale-125">{meta.icon}</span>
            </div>
            {status === "active" && (
              <span className="text-sky-400 scale-125">
                <IcLoader />
              </span>
            )}
            {status === "done" && (
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/40">
                <IcCheck />
              </div>
            )}
            {status === "failed" && (
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-rose-500">
                <IcX />
              </div>
            )}
          </div>

          {/* Label */}
          <div>
            <p className="text-sm font-semibold leading-tight text-slate-100">
              {meta.label}
            </p>
            <p className="mt-1 text-[11px] text-slate-500">{meta.sub}</p>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onConfig}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.04] py-1.5 text-[11px] font-medium text-slate-500 transition-all hover:border-white/15 hover:bg-white/[0.07] hover:text-slate-300"
            >
              <IcSettings />
              <span>Configure</span>
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="rounded-xl border border-white/[0.08] bg-white/[0.04] p-1.5 text-slate-600 transition-all hover:border-rose-500/30 hover:bg-rose-500/[0.06] hover:text-rose-400"
            >
              <IcX />
            </button>
          </div>
        </div>

        {/* Left accent bar */}
        <div
          className="absolute bottom-4 left-0 top-4 w-[3px] rounded-r-full"
          style={{
            backgroundColor: meta.color,
            opacity: status === "pending" ? 0.35 : 1,
          }}
        />
      </div>

      {/* Connector arrow between blocks */}
      {!isLast && (
        <div className="flex-shrink-0 text-slate-700 opacity-60">
          <IcArrowRight />
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   BlockCardPreview — ghost shown in DragOverlay
══════════════════════════════════════════════════════════════════════════════ */
function BlockCardPreview({ type }: { type: BlockType }) {
  const meta = BLOCK_META[type];
  return (
    <div
      className="w-56 rounded-2xl border border-white/20 bg-[#0f0f1a] p-5 rotate-2"
      style={{
        boxShadow: `0 0 0 1px ${meta.color}50, 0 12px 48px rgba(0,0,0,0.7)`,
      }}
    >
      <div className="flex items-center gap-3 mb-3">
        <div
          className="flex h-11 w-11 items-center justify-center rounded-2xl flex-shrink-0"
          style={{ backgroundColor: `${meta.color}25`, color: meta.color }}
        >
          <span className="scale-125">{meta.icon}</span>
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-100">{meta.label}</p>
          <p className="text-[11px] text-slate-500">{meta.sub}</p>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   StatusBadge
══════════════════════════════════════════════════════════════════════════════ */
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; text: string; dot: string }> = {
    pending: {
      bg: "bg-slate-800",
      text: "text-slate-400",
      dot: "bg-slate-500",
    },
    running: { bg: "bg-sky-950", text: "text-sky-300", dot: "bg-sky-400" },
    completed: {
      bg: "bg-emerald-950",
      text: "text-emerald-300",
      dot: "bg-emerald-400",
    },
    failed: { bg: "bg-rose-950", text: "text-rose-300", dot: "bg-rose-400" },
  };
  const s = map[status] ?? map.pending;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${s.bg} ${s.text}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${s.dot} ${status === "running" ? "animate-pulse" : ""}`}
      />
      {status}
    </span>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   SkeletonRow
══════════════════════════════════════════════════════════════════════════════ */
function SkeletonRow({ cols }: { cols: number }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-3 py-2.5">
          <div className="shimmer h-3 w-full rounded" />
        </td>
      ))}
    </tr>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   PipelineDropZone — empty state target
══════════════════════════════════════════════════════════════════════════════ */
function PipelineDropZone({ isOver }: { isOver: boolean }) {
  return (
    <div
      className={`flex h-36 w-full items-center justify-center rounded-2xl border-2 border-dashed transition-all ${
        isOver
          ? "border-violet-400/60 bg-violet-500/[0.06]"
          : "border-white/[0.07]"
      }`}
    >
      <div className="text-center">
        <div
          className={`mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-xl border transition-colors ${
            isOver
              ? "border-violet-400/40 bg-violet-500/10 text-violet-400"
              : "border-white/[0.07] bg-white/[0.03] text-slate-700"
          }`}
        >
          <IcPlus />
        </div>
        <p className="text-xs font-medium text-slate-600">
          Drag blocks here to build your workflow
        </p>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   Main component
══════════════════════════════════════════════════════════════════════════════ */
export function WorkflowStudio() {
  /* ── SSR guard — dnd-kit generates browser-only attributes that mismatch SSR ── */
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  /* ── Pipeline state ─────────────────────────────────────────────────────── */
  const [pipeline, setPipeline] = useState<PipelineBlock[]>(DEFAULT_PIPELINE);
  const [configBlockId, setConfigBlockId] = useState<string | null>(null);

  /* ── CSV / file state ───────────────────────────────────────────────────── */
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);

  /* ── Canvas pan state ───────────────────────────────────────────────────── */
  const [pan, setPan] = useState({ x: 32, y: 0 });
  const [panStart, setPanStart] = useState<{
    mx: number;
    my: number;
    px: number;
    py: number;
  } | null>(null);

  /* ── Run / queue state ──────────────────────────────────────────────────── */
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(
    null,
  );
  const [isDraftView, setIsDraftView] = useState(true);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  /* ── Preview state ──────────────────────────────────────────────────────── */
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewExpanded, setPreviewExpanded] = useState(true);
  const [previewMode, setPreviewMode] = useState<"table" | "json">("table");

  /* ── DnD active drag state ──────────────────────────────────────────────── */
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [activeDragType, setActiveDragType] = useState<BlockType | null>(null);

  /* ── dnd-kit sensors ────────────────────────────────────────────────────── */
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  /* ── Pipeline droppable (for empty-pipeline drops) ──────────────────────── */
  const { setNodeRef: setPipelineDropRef, isOver: pipelineIsOver } =
    useDroppable({ id: "pipeline-drop" });
  const pipelineRef = (el: HTMLDivElement | null) => {
    viewportRef.current = el;
    setPipelineDropRef(el);
  };

  /* ── Derived ────────────────────────────────────────────────────────────── */
  const configBlock = pipeline.find((b) => b.id === configBlockId) ?? null;
  const pipelineIds = pipeline.map((b) => b.id);
  const hasRunning = queue.some(
    (q) => q.status === "pending" || q.status === "running",
  );
  const filterBlocks = pipeline.filter((b) => b.type === "filter");
  const hasFilterError = filterBlocks.some(
    (b) => !b.params.column || !b.params.value,
  );
  const hasNoReadCsvFirst =
    pipeline.length > 0 && pipeline[0].type !== "read_csv";
  const hasComputeColError = pipeline.some((b) => {
    if (b.type !== "compute_column") return false;
    if (!b.params.column || !b.params.source_column) return true;
    const op = String(b.params.operator ?? "");
    return ["gt", "lt"].includes(op) && !String(b.params.value ?? "").trim();
  });
  const runDisabled =
    hasRunning ||
    isSubmitting ||
    hasFilterError ||
    hasNoReadCsvFirst ||
    hasComputeColError ||
    pipeline.length === 0;

  const selectedWorkflow =
    !isDraftView && selectedWorkflowId
      ? (queue.find((q) => q.workflow_id === selectedWorkflowId) ?? null)
      : null;

  /* ── Auto-select first column for filter blocks when headers load ─────────── */
  useEffect(() => {
    if (!headers.length) return;
    setPipeline((prev) =>
      prev.map((b) =>
        b.type === "filter" && !b.params.column
          ? { ...b, params: { ...b.params, column: headers[0] } }
          : b,
      ),
    );
  }, [headers]);

  /* ── Poll workflow status ───────────────────────────────────────────────── */
  useEffect(() => {
    const active = queue.filter(
      (q) => q.status === "pending" || q.status === "running",
    );
    if (!active.length) return;
    const id = setInterval(async () => {
      await Promise.all(
        active.map(async (item) => {
          try {
            const res = await fetch(
              `${API_BASE}/workflows/${item.workflow_id}/status`,
            );
            if (!res.ok) {
              setQueue((prev) =>
                prev.map((q) =>
                  q.workflow_id === item.workflow_id
                    ? {
                        ...q,
                        status: "failed",
                        error_message: `Server error ${res.status} — workflow state lost`,
                      }
                    : q,
                ),
              );
              return;
            }
            const data = (await res.json()) as WorkflowStatusPayload;
            setQueue((prev) =>
              prev.map((q) =>
                q.workflow_id === item.workflow_id
                  ? {
                      ...q,
                      status: data.status,
                      current_block: data.current_block,
                      progress_percentage: data.progress_percentage,
                      rows_processed: data.rows_processed,
                      total_rows: data.total_rows,
                      error_message: data.error_message,
                      output_path: data.output_path,
                    }
                  : q,
              ),
            );
            if (item.workflow_id === selectedWorkflowId)
              void fetchPreview(item.workflow_id);
          } catch {
            setQueue((prev) =>
              prev.map((q) =>
                q.workflow_id === item.workflow_id
                  ? {
                      ...q,
                      status: "failed",
                      error_message: "Status polling failed",
                    }
                  : q,
              ),
            );
          }
        }),
      );
    }, 3000);
    return () => clearInterval(id);
  }, [queue, selectedWorkflowId]);

  /* ── Sync selected workflow ─────────────────────────────────────────────── */
  useEffect(() => {
    if (queue.length === 0 || isDraftView) {
      setSelectedWorkflowId(null);
      return;
    }
    if (
      !selectedWorkflowId ||
      !queue.some((q) => q.workflow_id === selectedWorkflowId)
    ) {
      setSelectedWorkflowId(queue[0].workflow_id);
    }
  }, [queue, selectedWorkflowId, isDraftView]);

  /* ── Canvas pan mouse handlers ──────────────────────────────────────────── */
  useEffect(() => {
    if (!panStart) return;
    const onMove = (e: MouseEvent) => {
      const vp = viewportRef.current;
      const raw = {
        x: panStart.px + (e.clientX - panStart.mx),
        y: panStart.py + (e.clientY - panStart.my),
      };
      if (!vp) {
        setPan(raw);
        return;
      }
      // block width (224) + arrow gap (32) ≈ 256 per block, plus 64px side padding
      const contentW = pipeline.length * 256 + 64;
      const minX = Math.min(32, vp.clientWidth - contentW);
      // allow small vertical drift but snap back to center
      setPan({
        x: Math.max(minX, Math.min(32, raw.x)),
        y: Math.max(-40, Math.min(40, raw.y)),
      });
    };
    const onUp = () => setPanStart(null);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [panStart, pipeline.length]);

  /* ── Helpers ────────────────────────────────────────────────────────────── */
  const fetchPreview = async (wfId: string) => {
    setPreviewLoading(true);
    try {
      const res = await fetch(`${API_BASE}/workflows/${wfId}/preview?limit=20`);
      const data = (await res.json()) as PreviewData;
      setPreviewData(data);
    } catch {
      /* ignore */
    } finally {
      setPreviewLoading(false);
    }
  };

  const updateBlockParams = (
    blockId: string,
    updates: Record<string, unknown>,
  ) => {
    setPipeline((prev) =>
      prev.map((b) =>
        b.id === blockId ? { ...b, params: { ...b.params, ...updates } } : b,
      ),
    );
  };

  const deleteBlock = (blockId: string) => {
    setPipeline((prev) => prev.filter((b) => b.id !== blockId));
    if (configBlockId === blockId) setConfigBlockId(null);
  };

  /* ── Block status resolver (uses selected workflow from history) ─────────── */
  const blockStatus = (blockId: string): BlockStatus => {
    const blockIdx = pipeline.findIndex((b) => b.id === blockId);
    const block = pipeline[blockIdx];
    if (!block || !selectedWorkflow) return "pending";
    const { status, current_block } = selectedWorkflow;
    if (status === "completed") return "done";
    const firstMatchIdx = pipeline.findIndex((b) => b.type === current_block);
    if (blockIdx < firstMatchIdx) return "done";
    if (blockIdx === firstMatchIdx)
      return status === "failed" ? "failed" : "active";
    return "pending";
  };

  /* ── DnD handlers ───────────────────────────────────────────────────────── */
  const handleDragStart = (event: DragStartEvent) => {
    const src = event.active.data.current?.source as string;
    const type = event.active.data.current?.type as BlockType;
    setActiveDragId(String(event.active.id));
    setActiveDragType(type ?? null);
    // for pipeline items, type comes from data; for library, same
    if (src === "pipeline") {
      const blk = pipeline.find((b) => b.id === event.active.id);
      setActiveDragType(blk?.type ?? null);
    }
  };

  const handleDragOver = (_event: DragOverEvent) => {
    /* visual handled by dnd-kit */
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragId(null);
    setActiveDragType(null);
    const { active, over } = event;
    if (!over) return;

    const src = active.data.current?.source as string;

    if (src === "library") {
      const type = active.data.current?.type as BlockType;
      const newBlock: PipelineBlock = {
        id: makeId(),
        type,
        params: { ...DEFAULT_PARAMS[type] },
      };
      const overIdx = pipeline.findIndex((b) => b.id === over.id);
      if (overIdx >= 0) {
        setPipeline((prev) => [
          ...prev.slice(0, overIdx + 1),
          newBlock,
          ...prev.slice(overIdx + 1),
        ]);
      } else {
        setPipeline((prev) => [...prev, newBlock]);
      }
    } else if (src === "pipeline") {
      const oldIdx = pipeline.findIndex((b) => b.id === String(active.id));
      const newIdx = pipeline.findIndex((b) => b.id === String(over.id));
      if (oldIdx !== -1 && newIdx !== -1 && oldIdx !== newIdx) {
        setPipeline((prev) => arrayMove(prev, oldIdx, newIdx));
      }
    }
  };

  /* ── CSV drop/upload handler ────────────────────────────────────────────── */
  const onDropCsv = async (file: File) => {
    const text = await file.text();
    const parsed = parseCsv(text);
    setFileName(file.name);
    setHeaders(parsed.headers);
    setRows(parsed.rows);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${API_BASE}/files/upload`, {
        method: "POST",
        body: form,
      });
      if (res.ok) {
        const d = (await res.json()) as { path: string };
        // Update read_csv block path in pipeline
        setPipeline((prev) =>
          prev.map((b) =>
            b.type === "read_csv"
              ? { ...b, params: { ...b.params, path: d.path } }
              : b,
          ),
        );
      }
    } catch {
      setError("Preview loaded, but backend upload failed.");
    }
  };

  /* ── Run workflow ───────────────────────────────────────────────────────── */
  const workflowPayload = useMemo(
    () => ({
      blocks: pipeline.map((b) => ({ type: b.type, params: b.params })),
      max_concurrency: 4,
      submission_batch_size: 10,
      poll_batch_size: 10,
      poll_interval_seconds: 2,
      max_poll_seconds: 300,
      max_retries: 0,
      backoff_base_seconds: 0.5,
      request_timeout_seconds: 45,
    }),
    [pipeline],
  );

  const runWorkflow = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setError("");
    if (hasNoReadCsvFirst) {
      setError("First block must be Read CSV.");
      setIsSubmitting(false);
      return;
    }
    if (hasFilterError) {
      setError("Configure all Filter blocks — column and value are required.");
      setIsSubmitting(false);
      return;
    }
    if (hasComputeColError) {
      setError(
        "Configure all Compute Column blocks — column name, source column, and numeric value are required.",
      );
      setIsSubmitting(false);
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/workflows/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(workflowPayload),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as {
        workflow_id: string;
        status: string;
      };
      const item: QueueItem = {
        local_id: makeId(),
        workflow_id: data.workflow_id,
        csv_file_name: fileName || "manual-path.csv",
        pipeline_snapshot: [...pipeline],
        status: data.status,
        current_block: null,
        progress_percentage: 0,
        rows_processed: 0,
        total_rows: 0,
        error_message: null,
        output_path: null,
      };
      setQueue((prev) => [item, ...prev]);
      setSelectedWorkflowId(data.workflow_id);
      setIsDraftView(false);
      setPreviewData(null);
      setPreviewExpanded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start workflow");
    } finally {
      setIsSubmitting(false);
    }
  };

  /* ── Reset ──────────────────────────────────────────────────────────────── */
  const resetDraft = () => {
    setPipeline([
      ...DEFAULT_PIPELINE.map((b) => ({
        ...b,
        id: makeId(),
        params: { ...b.params },
      })),
    ]);
    setIsDraftView(true);
    setSelectedWorkflowId(null);
    setFileName("");
    setHeaders([]);
    setRows([]);
    setDragOver(false);
    setConfigBlockId(null);
    setError("");
    setPreviewData(null);
    setPan({ x: 32, y: 0 });
    setPanStart(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  /* ══════════════════════════════════════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════════════════════════════════════ */
  if (!mounted) return null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <main className="min-h-screen bg-[#08080e] text-slate-100 selection:bg-violet-500/30">
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <header className="sticky top-0 z-30 border-b border-white/[0.07] bg-[#0c0c14]/80 backdrop-blur-xl">
          <div className="mx-auto flex max-w-[1700px] items-center justify-between px-6 py-3.5">
            <div className="flex items-center gap-3">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 shadow-lg shadow-violet-500/30">
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="white"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="18" cy="5" r="3" />
                  <circle cx="6" cy="12" r="3" />
                  <circle cx="18" cy="19" r="3" />
                  <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                  <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                </svg>
              </div>
              <span className="text-[15px] font-semibold tracking-tight">
                Workflow Studio
              </span>
              <span className="hidden sm:block h-4 w-px bg-white/10" />
              <span className="hidden sm:block rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-0.5 text-[11px] font-medium text-indigo-300 tracking-wide uppercase">
                Beta
              </span>
            </div>
            <div className="flex items-center gap-2">
              {selectedWorkflow && (
                <div className="hidden sm:flex items-center gap-2 rounded-full border border-white/[0.07] bg-white/[0.04] px-3 py-1.5 text-xs text-slate-400">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      selectedWorkflow.status === "running"
                        ? "bg-sky-400 animate-pulse"
                        : selectedWorkflow.status === "completed"
                          ? "bg-emerald-400"
                          : "bg-rose-400"
                    }`}
                  />
                  {selectedWorkflow.status === "running"
                    ? `Running · ${Math.round(selectedWorkflow.progress_percentage)}%`
                    : selectedWorkflow.status === "completed"
                      ? "Completed"
                      : selectedWorkflow.status}
                </div>
              )}
              <button
                type="button"
                onClick={resetDraft}
                className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.05] px-3 py-1.5 text-xs font-medium text-slate-300 transition-all hover:border-white/15 hover:bg-white/[0.08] hover:text-white"
              >
                <IcPlus />
                <span>New Workflow</span>
              </button>
            </div>
          </div>
        </header>

        <div className="mx-auto max-w-[1700px] px-6 py-6 space-y-5">
          {/* ── Main grid: left panel + canvas ──────────────────────────── */}
          <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
            {/* ── Left Panel ──────────────────────────────────────────────── */}
            <div className="flex flex-col gap-4">
              {/* Block Library */}
              <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4">
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-slate-500">
                  Block Library
                </p>
                <p className="mb-3 text-[10px] text-slate-600">
                  Drag blocks onto the canvas to build your workflow.
                </p>
                <div className="space-y-1.5">
                  {LIBRARY_BLOCKS.map((type) => (
                    <LibraryBlockTile key={type} type={type} />
                  ))}
                </div>
              </div>

              {/* Upload card */}
              <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4">
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-slate-500">
                  Data Source
                </p>
                <label
                  className={`group relative flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-4 text-center transition-all ${
                    dragOver
                      ? "border-violet-400/70 bg-violet-500/10"
                      : "border-white/[0.09] bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]"
                  }`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                    const f = e.dataTransfer.files?.[0];
                    if (f) void onDropCsv(f);
                  }}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv"
                    className="hidden"
                    onClick={(e) => {
                      e.currentTarget.value = "";
                    }}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void onDropCsv(f);
                    }}
                  />
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] text-slate-400 transition-colors group-hover:text-slate-300">
                    <IcUpload />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-300">
                      Drop CSV here
                    </p>
                    <p className="mt-0.5 text-[10px] text-slate-600">
                      or click to browse
                    </p>
                  </div>
                </label>
                {fileName && (
                  <div className="mt-3 flex items-center gap-2.5 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.07] px-3 py-2">
                    <span className="text-emerald-400">
                      <IcFile />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-emerald-300">
                        {fileName}
                      </p>
                      <p className="text-[10px] text-emerald-600">
                        {rows.length} rows · {headers.length} cols
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Run card */}
              <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4">
                {hasNoReadCsvFirst && (
                  <div className="mb-3 rounded-lg border border-rose-500/20 bg-rose-500/[0.08] px-3 py-2 text-[11px] text-rose-300">
                    First block must be Read CSV.
                  </div>
                )}
                {hasFilterError && (
                  <div className="mb-3 rounded-lg border border-amber-500/20 bg-amber-500/[0.08] px-3 py-2 text-[11px] text-amber-300">
                    Configure all Filter blocks — column and value are required.
                  </div>
                )}
                {hasComputeColError && (
                  <div className="mb-3 rounded-lg border border-orange-500/20 bg-orange-500/[0.08] px-3 py-2 text-[11px] text-orange-300">
                    Configure all Compute Column blocks — column name and source
                    column are required.
                  </div>
                )}
                {error && (
                  <div className="mb-3 rounded-lg border border-rose-500/20 bg-rose-500/[0.08] px-3 py-2 text-[11px] text-rose-300">
                    {error}
                  </div>
                )}
                <button
                  type="button"
                  onClick={runWorkflow}
                  disabled={runDisabled}
                  className={`flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-all ${
                    runDisabled
                      ? "cursor-not-allowed bg-white/[0.05] text-slate-600"
                      : "bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-lg shadow-violet-500/20 hover:brightness-110 hover:shadow-violet-500/30 active:scale-[0.98]"
                  }`}
                >
                  {isSubmitting || hasRunning ? (
                    <>
                      <IcLoader />
                      <span>Running…</span>
                    </>
                  ) : (
                    <>
                      <IcPlay />
                      <span>Run Workflow</span>
                    </>
                  )}
                </button>
                <p className="mt-2 text-center text-[10px] text-slate-700">
                  {pipeline.length} block{pipeline.length !== 1 ? "s" : ""} in
                  pipeline
                </p>
              </div>
            </div>

            {/* ── Pipeline Canvas ──────────────────────────────────────────── */}
            <div className="flex flex-col rounded-2xl border border-white/[0.07] bg-[#0c0c14] overflow-hidden">
              <div className="flex items-center justify-between border-b border-white/[0.05] px-5 py-3">
                <div className="flex items-center gap-3">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-600">
                    Canvas
                  </p>
                  <span className="rounded-full border border-white/[0.07] bg-white/[0.03] px-2 py-0.5 text-[10px] text-slate-600">
                    {pipeline.length} block{pipeline.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-slate-700">
                  <IcGrip />
                  <span>
                    Drag grip to reorder · Drag from library to add · Pan
                    background to scroll
                  </span>
                </div>
              </div>

              {/* Pannable viewport */}
              <div
                ref={pipelineRef}
                className={`relative flex-1 overflow-hidden canvas-grid ${panStart ? "cursor-grabbing select-none" : "cursor-grab"}`}
                onMouseDown={(e) => {
                  if (e.button !== 0) return;
                  const t = e.target as HTMLElement;
                  if (t.closest("[data-pipeline-block]") || t.closest("button"))
                    return;
                  e.preventDefault();
                  setPanStart({
                    mx: e.clientX,
                    my: e.clientY,
                    px: pan.x,
                    py: pan.y,
                  });
                }}
              >
                {pipeline.length === 0 ? (
                  <div className="absolute inset-0 flex items-center justify-center p-8">
                    <PipelineDropZone isOver={pipelineIsOver} />
                  </div>
                ) : (
                  /* Translated content layer */
                  <div
                    className="absolute inset-0 flex items-center"
                    style={{
                      transform: `translate(${pan.x}px, ${pan.y}px)`,
                      transition: panStart
                        ? "none"
                        : "transform 160ms ease-out",
                    }}
                  >
                    <SortableContext
                      items={pipelineIds}
                      strategy={horizontalListSortingStrategy}
                    >
                      <div className="flex items-center gap-0 px-2">
                        {pipeline.map((block, idx) => (
                          <SortablePipelineBlock
                            key={block.id}
                            block={block}
                            status={blockStatus(block.id)}
                            isLast={idx === pipeline.length - 1}
                            onConfig={() => setConfigBlockId(block.id)}
                            onDelete={() => deleteBlock(block.id)}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Live Data Preview ──────────────────────────────────────────── */}
          {(previewData ||
            previewLoading ||
            selectedWorkflow ||
            rows.length > 0) &&
            (() => {
              const displayCols = previewData?.columns ?? headers;
              const displayRows = previewData
                ? previewData.rows
                : (rows.slice(0, 8) as Record<string, unknown>[]);
              const jsonStr = JSON.stringify(displayRows.slice(0, 20), null, 2);
              return (
                <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] overflow-hidden">
                  {/* header row */}
                  <div className="flex items-center justify-between px-5 py-3">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setPreviewExpanded((v) => !v)}
                        className="flex items-center gap-2 hover:opacity-80 transition-opacity"
                      >
                        <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">
                          Data Preview
                        </p>
                        <span
                          className={`text-slate-600 transition-transform ${previewExpanded ? "rotate-90" : ""}`}
                        >
                          <IcChevronRight />
                        </span>
                      </button>
                      {(previewData || rows.length > 0) && (
                        <span className="rounded-full border border-white/[0.07] bg-white/[0.04] px-2 py-0.5 text-[10px] text-slate-500">
                          {displayRows.length} rows · {displayCols.length} cols
                        </span>
                      )}
                      {previewLoading && (
                        <span className="text-slate-600">
                          <IcLoader />
                        </span>
                      )}
                    </div>
                    {/* Table / JSON toggle */}
                    {previewExpanded && displayRows.length > 0 && (
                      <div className="flex items-center rounded-lg border border-white/[0.07] bg-white/[0.03] p-0.5 gap-0.5">
                        <button
                          type="button"
                          onClick={() => setPreviewMode("table")}
                          className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition-all ${
                            previewMode === "table"
                              ? "bg-white/[0.08] text-slate-200"
                              : "text-slate-600 hover:text-slate-400"
                          }`}
                        >
                          <IcTable2 />
                          <span>Table</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setPreviewMode("json")}
                          className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition-all ${
                            previewMode === "json"
                              ? "bg-white/[0.08] text-slate-200"
                              : "text-slate-600 hover:text-slate-400"
                          }`}
                        >
                          <IcCode />
                          <span>JSON</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {previewExpanded && (
                    <div className="border-t border-white/[0.05]">
                      {previewMode === "table" ? (
                        <div className="max-h-72 overflow-auto">
                          <table className="min-w-full text-left text-xs">
                            <thead className="sticky top-0 border-b border-white/[0.06] bg-[#0c0c14]">
                              <tr>
                                {displayCols.map((col) => (
                                  <th
                                    key={col}
                                    className="whitespace-nowrap px-3 py-2.5 font-medium font-mono text-slate-400"
                                  >
                                    {col}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {previewLoading &&
                                !previewData &&
                                Array.from({ length: 4 }).map((_, i) => (
                                  <SkeletonRow
                                    key={i}
                                    cols={displayCols.length || 5}
                                  />
                                ))}
                              {!previewLoading &&
                                displayRows.map((row, i) => (
                                  <tr
                                    key={i}
                                    className="border-t border-white/[0.04] transition-colors hover:bg-white/[0.02]"
                                  >
                                    {displayCols.map((col) => (
                                      <td
                                        key={col}
                                        className="max-w-[240px] truncate px-3 py-2 font-mono text-slate-400"
                                      >
                                        {String(row[col] ?? "-")}
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              {!previewLoading &&
                                !previewData &&
                                rows.length === 0 && (
                                  <tr>
                                    <td
                                      colSpan={99}
                                      className="px-3 py-5 text-center text-slate-700"
                                    >
                                      Drop a CSV or run a workflow to see data
                                      here.
                                    </td>
                                  </tr>
                                )}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="max-h-72 overflow-auto">
                          <pre className="p-4 text-[11px] font-mono leading-relaxed text-slate-400 whitespace-pre-wrap break-all">
                            <span className="text-slate-600">{`// ${displayRows.length} record${displayRows.length !== 1 ? "s" : ""}\n`}</span>
                            {jsonStr}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

          {/* ── Run History ───────────────────────────────────────────────── */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-600">
                Run History
              </p>
              {queue.length > 0 && (
                <span className="rounded-full border border-white/[0.07] bg-white/[0.04] px-2.5 py-0.5 text-[11px] text-slate-500">
                  {queue.length} run{queue.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>

            {queue.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/[0.06] py-12 text-center">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.03] text-slate-700">
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  >
                    <circle cx="18" cy="5" r="3" />
                    <circle cx="6" cy="12" r="3" />
                    <circle cx="18" cy="19" r="3" />
                    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-slate-600">
                  No workflows yet
                </p>
                <p className="mt-1 text-xs text-slate-700">
                  Build your pipeline and hit Run Workflow.
                </p>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {queue.map((item) => {
                  const isSelected = item.workflow_id === selectedWorkflowId;
                  const uniqueTypes = [
                    ...new Set(item.pipeline_snapshot.map((b) => b.type)),
                  ];
                  return (
                    <button
                      key={item.local_id}
                      type="button"
                      onClick={() => {
                        setSelectedWorkflowId(item.workflow_id);
                        setIsDraftView(false);
                        void fetchPreview(item.workflow_id);
                      }}
                      className={`w-full rounded-2xl border p-4 text-left transition-all hover:border-white/15 ${
                        isSelected
                          ? "border-violet-500/40 bg-violet-500/[0.06] shadow-lg shadow-violet-500/10"
                          : "border-white/[0.07] bg-white/[0.03] hover:bg-white/[0.05]"
                      }`}
                    >
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="flex-shrink-0 text-slate-500">
                            <IcFile />
                          </span>
                          <span className="truncate text-xs font-medium text-slate-300">
                            {item.csv_file_name}
                          </span>
                        </div>
                        <StatusBadge status={item.status} />
                      </div>
                      <div className="h-1 w-full overflow-hidden rounded-full bg-white/[0.06]">
                        <div
                          className="h-1 rounded-full transition-all duration-700"
                          style={{
                            width: `${item.progress_percentage}%`,
                            background:
                              item.status === "failed"
                                ? "#f43f5e"
                                : item.status === "completed"
                                  ? "#22c55e"
                                  : "linear-gradient(90deg,#6366f1,#a78bfa)",
                          }}
                        />
                      </div>
                      <div className="mt-2.5 flex items-center justify-between text-[10px] text-slate-600">
                        <span className="max-w-[120px] truncate font-mono">
                          {item.workflow_id.split("-")[0]}…
                        </span>
                        <span className="flex items-center gap-1">
                          {item.current_block && item.status === "running" && (
                            <>
                              <span className="text-sky-500">
                                <IcLoader />
                              </span>
                              {item.current_block}
                            </>
                          )}
                          {item.status === "completed" &&
                            `${item.rows_processed} rows`}
                          {item.status === "failed" && (
                            <span
                              className="text-rose-400"
                              title={item.error_message ?? ""}
                            >
                              {(item.error_message?.length ?? 0) > 55
                                ? item.error_message!.slice(0, 55) + "…"
                                : item.error_message}
                            </span>
                          )}
                        </span>
                      </div>
                      <div className="mt-2.5 flex items-center justify-between gap-2">
                        <div className="flex flex-wrap gap-1">
                          {uniqueTypes.map((t) => (
                            <span
                              key={t}
                              className="rounded-full border px-2 py-0.5 text-[10px]"
                              style={{
                                borderColor: `${BLOCK_META[t].color}30`,
                                color: BLOCK_META[t].color,
                              }}
                            >
                              {BLOCK_META[t].label}
                            </span>
                          ))}
                        </div>
                        {item.status === "completed" && item.output_path && (
                          <a
                            href={`${API_BASE}/workflows/${item.workflow_id}/download`}
                            download
                            onClick={(e) => e.stopPropagation()}
                            className="flex flex-shrink-0 items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/[0.07] px-2 py-1 text-[10px] font-medium text-emerald-400 transition-all hover:border-emerald-500/50 hover:bg-emerald-500/[0.12]"
                          >
                            <IcDownloadCloud />
                            <span>Download</span>
                          </a>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            Config drawer
        ══════════════════════════════════════════════════════════════════ */}
        <button
          type="button"
          aria-label="Close config"
          className={`pointer-events-none fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity ${configBlock ? "pointer-events-auto opacity-100" : "opacity-0"}`}
          onClick={() => setConfigBlockId(null)}
        />

        <aside
          className={`fixed right-0 top-0 z-50 flex h-screen w-[min(95vw,440px)] flex-col border-l border-white/[0.08] bg-[#0f0f1a] shadow-2xl transition-transform duration-300 ease-out ${configBlock ? "translate-x-0" : "translate-x-full"}`}
        >
          {configBlock &&
            (() => {
              const meta = BLOCK_META[configBlock.type];
              return (
                <>
                  <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div
                        className="flex h-8 w-8 items-center justify-center rounded-xl"
                        style={{
                          backgroundColor: `${meta.color}18`,
                          color: meta.color,
                        }}
                      >
                        {meta.icon}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-100">
                          {meta.label}
                        </p>
                        <p className="text-[10px] text-slate-600">
                          Configure block parameters
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setConfigBlockId(null)}
                      className="rounded-lg border border-white/[0.07] bg-white/[0.05] p-1.5 text-slate-500 transition-colors hover:text-slate-300"
                    >
                      <IcX />
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto p-5 space-y-4">
                    {/* ── read_csv ── */}
                    {configBlock.type === "read_csv" && (
                      <label className="block text-xs font-medium text-slate-400">
                        CSV Path
                        <input
                          className="mt-1.5 w-full rounded-xl border border-white/[0.08] bg-white/[0.05] px-3 py-2 text-sm font-mono text-slate-200 placeholder-slate-700 focus:border-violet-500/50 focus:outline-none"
                          value={String(configBlock.params.path ?? "")}
                          onChange={(e) =>
                            updateBlockParams(configBlock.id, {
                              path: e.target.value,
                            })
                          }
                          placeholder="path/to/input.csv"
                        />
                        <p className="mt-1.5 text-[10px] text-slate-600">
                          Path relative to the backend server root. Upload a CSV
                          above to set automatically.
                        </p>
                      </label>
                    )}

                    {/* ── filter ── */}
                    {configBlock.type === "filter" && (
                      <>
                        <label className="block text-xs font-medium text-slate-400">
                          Column
                          {headers.length > 0 ? (
                            <select
                              className="mt-1.5 w-full rounded-xl border border-white/[0.08] bg-white/[0.05] px-3 py-2 text-sm text-slate-200 focus:border-violet-500/50 focus:outline-none"
                              value={String(configBlock.params.column ?? "")}
                              onChange={(e) =>
                                updateBlockParams(configBlock.id, {
                                  column: e.target.value,
                                })
                              }
                            >
                              {headers.map((h) => (
                                <option
                                  key={h}
                                  value={h}
                                  className="bg-[#0f0f1a]"
                                >
                                  {h}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input
                              className="mt-1.5 w-full rounded-xl border border-white/[0.08] bg-white/[0.05] px-3 py-2 text-sm text-slate-200 placeholder-slate-700 focus:border-violet-500/50 focus:outline-none"
                              value={String(configBlock.params.column ?? "")}
                              onChange={(e) =>
                                updateBlockParams(configBlock.id, {
                                  column: e.target.value,
                                })
                              }
                              placeholder="e.g. company"
                            />
                          )}
                        </label>
                        <label className="block text-xs font-medium text-slate-400">
                          Operator
                          <select
                            className="mt-1.5 w-full rounded-xl border border-white/[0.08] bg-white/[0.05] px-3 py-2 text-sm text-slate-200 focus:border-violet-500/50 focus:outline-none"
                            value={String(
                              configBlock.params.operator ?? "contains",
                            )}
                            onChange={(e) =>
                              updateBlockParams(configBlock.id, {
                                operator: e.target.value,
                              })
                            }
                          >
                            <option value="contains" className="bg-[#0f0f1a]">
                              contains
                            </option>
                            <option value="equals" className="bg-[#0f0f1a]">
                              equals
                            </option>
                            <option value="gt" className="bg-[#0f0f1a]">
                              greater than
                            </option>
                            <option value="lt" className="bg-[#0f0f1a]">
                              less than
                            </option>
                          </select>
                        </label>
                        <label className="block text-xs font-medium text-slate-400">
                          Value
                          <input
                            className="mt-1.5 w-full rounded-xl border border-white/[0.08] bg-white/[0.05] px-3 py-2 text-sm text-slate-200 placeholder-slate-700 focus:border-violet-500/50 focus:outline-none"
                            value={String(configBlock.params.value ?? "")}
                            onChange={(e) =>
                              updateBlockParams(configBlock.id, {
                                value: e.target.value,
                              })
                            }
                            placeholder="e.g. Ariglad Inc"
                          />
                        </label>
                        {configBlock.params.column &&
                          configBlock.params.value && (
                            <div className="rounded-xl border border-violet-500/20 bg-violet-500/[0.06] px-3 py-2.5 text-xs font-mono text-slate-400">
                              df[df[
                              <span className="text-violet-300">
                                &apos;{String(configBlock.params.column)}&apos;
                              </span>
                              ].str.{String(configBlock.params.operator)}(
                              <span className="text-emerald-300">
                                &apos;{String(configBlock.params.value)}&apos;
                              </span>
                              )]
                            </div>
                          )}
                      </>
                    )}

                    {/* ── enrich_lead ── */}
                    {configBlock.type === "enrich_lead" && (
                      <>
                        <div>
                          <p className="text-xs font-medium text-slate-400">
                            Research Plan{" "}
                            <span className="text-slate-600 font-normal">
                              (optional)
                            </span>
                          </p>
                          <p className="mt-1 text-[10px] text-slate-600">
                            Describe what additional context the AI should
                            research about each lead.
                          </p>
                          <textarea
                            className="mt-1.5 w-full rounded-xl border border-white/[0.08] bg-white/[0.05] px-3 py-2 text-sm text-slate-200 placeholder-slate-700 focus:border-violet-500/50 focus:outline-none resize-none"
                            rows={4}
                            value={String(
                              configBlock.params.research_plan ?? "",
                            )}
                            onChange={(e) =>
                              updateBlockParams(configBlock.id, {
                                research_plan: e.target.value,
                              })
                            }
                            placeholder="e.g. Return educational background including undergrad university. Add boolean field is_american_education."
                          />
                        </div>
                        <div className="rounded-xl border border-violet-500/20 bg-violet-500/[0.06] px-3 py-3 text-[11px] text-slate-400 space-y-1">
                          <p className="font-semibold text-violet-300">
                            Default enrichment fields:
                          </p>
                          {[
                            "name",
                            "email",
                            "phone",
                            "company",
                            "title",
                            "linkedin",
                            "website",
                            "location",
                          ].map((f) => (
                            <p key={f} className="font-mono">
                              · {f}
                            </p>
                          ))}
                          <p className="text-slate-600 pt-1">
                            Custom struct fields can be configured via the API
                            directly.
                          </p>
                        </div>
                      </>
                    )}

                    {/* ── find_email ── */}
                    {configBlock.type === "find_email" && (
                      <div>
                        <p className="text-xs font-medium text-slate-400 mb-2">
                          Email Mode
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          {(["PROFESSIONAL", "PERSONAL"] as const).map(
                            (mode) => (
                              <button
                                key={mode}
                                type="button"
                                onClick={() =>
                                  updateBlockParams(configBlock.id, { mode })
                                }
                                className={`rounded-xl border py-2.5 text-xs font-medium transition-all ${
                                  configBlock.params.mode === mode
                                    ? "border-sky-500/50 bg-sky-500/10 text-sky-300"
                                    : "border-white/[0.08] bg-white/[0.04] text-slate-500 hover:border-white/15 hover:text-slate-300"
                                }`}
                              >
                                {mode.charAt(0) + mode.slice(1).toLowerCase()}
                              </button>
                            ),
                          )}
                        </div>
                        <p className="mt-2 text-[10px] text-slate-600">
                          {configBlock.params.mode === "PROFESSIONAL"
                            ? "Finds work/corporate email addresses."
                            : "Finds personal email addresses."}
                        </p>
                      </div>
                    )}

                    {/* ── compute_column ── */}
                    {configBlock.type === "compute_column" && (
                      <>
                        <label className="block text-xs font-medium text-slate-400">
                          New Column Name
                          <input
                            className="mt-1.5 w-full rounded-xl border border-white/[0.08] bg-white/[0.05] px-3 py-2 text-sm text-slate-200 placeholder-slate-700 focus:border-orange-500/50 focus:outline-none"
                            value={String(configBlock.params.column ?? "")}
                            onChange={(e) =>
                              updateBlockParams(configBlock.id, {
                                column: e.target.value,
                              })
                            }
                            placeholder="e.g. is_american_education"
                          />
                          <p className="mt-1 text-[10px] text-slate-600">
                            Name of the new boolean/derived column to add.
                          </p>
                        </label>
                        <label className="block text-xs font-medium text-slate-400">
                          Source Column
                          {headers.length > 0 ? (
                            <select
                              className="mt-1.5 w-full rounded-xl border border-white/[0.08] bg-white/[0.05] px-3 py-2 text-sm text-slate-200 focus:border-orange-500/50 focus:outline-none"
                              value={String(
                                configBlock.params.source_column ?? "",
                              )}
                              onChange={(e) =>
                                updateBlockParams(configBlock.id, {
                                  source_column: e.target.value,
                                })
                              }
                            >
                              <option value="" className="bg-[#0f0f1a]">
                                — select column —
                              </option>
                              {headers.map((h) => (
                                <option
                                  key={h}
                                  value={h}
                                  className="bg-[#0f0f1a]"
                                >
                                  {h}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input
                              className="mt-1.5 w-full rounded-xl border border-white/[0.08] bg-white/[0.05] px-3 py-2 text-sm text-slate-200 placeholder-slate-700 focus:border-orange-500/50 focus:outline-none"
                              value={String(
                                configBlock.params.source_column ?? "",
                              )}
                              onChange={(e) =>
                                updateBlockParams(configBlock.id, {
                                  source_column: e.target.value,
                                })
                              }
                              placeholder="e.g. undergrad_university"
                            />
                          )}
                          <p className="mt-1 text-[10px] text-slate-600">
                            Existing column to evaluate the expression against.
                          </p>
                        </label>
                        <label className="block text-xs font-medium text-slate-400">
                          Operation
                          <select
                            className="mt-1.5 w-full rounded-xl border border-white/[0.08] bg-white/[0.05] px-3 py-2 text-sm text-slate-200 focus:border-orange-500/50 focus:outline-none"
                            value={String(
                              configBlock.params.operator ?? "contains",
                            )}
                            onChange={(e) =>
                              updateBlockParams(configBlock.id, {
                                operator: e.target.value,
                              })
                            }
                          >
                            <option value="contains" className="bg-[#0f0f1a]">
                              contains → boolean
                            </option>
                            <option
                              value="not_contains"
                              className="bg-[#0f0f1a]"
                            >
                              not contains → boolean
                            </option>
                            <option value="equals" className="bg-[#0f0f1a]">
                              equals → boolean
                            </option>
                            <option value="not_equals" className="bg-[#0f0f1a]">
                              not equals → boolean
                            </option>
                            <option value="gt" className="bg-[#0f0f1a]">
                              greater than → boolean
                            </option>
                            <option value="lt" className="bg-[#0f0f1a]">
                              less than → boolean
                            </option>
                            <option value="not_null" className="bg-[#0f0f1a]">
                              is not empty → boolean
                            </option>
                            <option value="is_null" className="bg-[#0f0f1a]">
                              is empty → boolean
                            </option>
                          </select>
                        </label>
                        {!["not_null", "is_null"].includes(
                          String(configBlock.params.operator),
                        ) && (
                          <label className="block text-xs font-medium text-slate-400">
                            Value
                            <input
                              className="mt-1.5 w-full rounded-xl border border-white/[0.08] bg-white/[0.05] px-3 py-2 text-sm text-slate-200 placeholder-slate-700 focus:border-orange-500/50 focus:outline-none"
                              value={String(configBlock.params.value ?? "")}
                              onChange={(e) =>
                                updateBlockParams(configBlock.id, {
                                  value: e.target.value,
                                })
                              }
                              placeholder="e.g. United States"
                            />
                          </label>
                        )}
                        {configBlock.params.column &&
                          configBlock.params.source_column && (
                            <div className="rounded-xl border border-orange-500/20 bg-orange-500/[0.06] px-3 py-2.5 text-xs font-mono text-slate-400">
                              df[
                              <span className="text-orange-300">
                                &apos;{String(configBlock.params.column)}&apos;
                              </span>
                              ] = df[
                              <span className="text-sky-300">
                                &apos;{String(configBlock.params.source_column)}
                                &apos;
                              </span>
                              ].str.
                              {String(
                                configBlock.params.operator ?? "contains",
                              )}
                              (
                              <span className="text-emerald-300">
                                &apos;{String(configBlock.params.value ?? "")}
                                &apos;
                              </span>
                              )
                            </div>
                          )}
                      </>
                    )}

                    {/* ── save_csv ── */}
                    {configBlock.type === "save_csv" && (
                      <label className="block text-xs font-medium text-slate-400">
                        Output Path
                        <input
                          className="mt-1.5 w-full rounded-xl border border-white/[0.08] bg-white/[0.05] px-3 py-2 text-sm font-mono text-slate-200 placeholder-slate-700 focus:border-violet-500/50 focus:outline-none"
                          value={String(configBlock.params.path ?? "")}
                          onChange={(e) =>
                            updateBlockParams(configBlock.id, {
                              path: e.target.value,
                            })
                          }
                          placeholder="path/to/output.csv"
                        />
                        <p className="mt-1.5 text-[10px] text-slate-600">
                          The enriched CSV will be saved here on the backend
                          server.
                        </p>
                      </label>
                    )}
                  </div>

                  <div className="border-t border-white/[0.07] p-5">
                    <button
                      type="button"
                      onClick={() => setConfigBlockId(null)}
                      className="w-full rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-500/20 transition-all hover:brightness-110"
                    >
                      Save &amp; Close
                    </button>
                  </div>
                </>
              );
            })()}
        </aside>
      </main>

      {/* ── DragOverlay — floating ghost card while dragging ─────────────── */}
      <DragOverlay dropAnimation={{ duration: 150, easing: "ease-out" }}>
        {activeDragType ? <BlockCardPreview type={activeDragType} /> : null}
      </DragOverlay>
    </DndContext>
  );
}
