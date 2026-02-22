"use client";

import {
  DndContext,
  type DragEndEvent,
  type DragStartEvent,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  useDraggable,
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
type BlockType = "read_csv" | "filter" | "enrich_lead" | "find_email" | "save_csv" | "compute_column";
type BlockStatus = "pending" | "active" | "done" | "failed";

type PipelineBlock = {
  id: string;
  type: BlockType;
  params: Record<string, unknown>;
};

type QueueItem = {
  local_id: string;
  workflow_id: string;
  csv_file_name: string;
  csv_headers: string[];
  csv_row_count: number;
  pipeline_snapshot: PipelineBlock[];
  status: string;
  current_block: string | null;
  progress_percentage: number;
  rows_processed: number;
  total_rows: number;
  error_message: string | null;
  output_path: string | null;
};

type PreviewData = { columns: string[]; rows: Record<string, unknown>[] };
type ExtraStructField = { key: string; description: string };

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

/* ══════════════════════════════════════════════════════════════════════════════
   Constants
══════════════════════════════════════════════════════════════════════════════ */
const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");
const DEFAULT_CSV_PATH = "_smoke_input.csv";
const DEFAULT_SAVE_PATH = "workflow_output.csv";
const makeId = () => crypto.randomUUID();

const DEFAULT_ENRICH_STRUCT: Record<string, string> = {
  name: "The individual's full name",
  email: "The individual's email address",
  phone: "The individual's phone number",
  company: "The company the individual is associated with",
  title: "The individual's job title",
  linkedin: "LinkedIn URL for the person",
  website: "Company website URL",
  location: "The individual's location",
};

const DEFAULT_PARAMS: Record<BlockType, Record<string, unknown>> = {
  read_csv:       { path: DEFAULT_CSV_PATH },
  filter:         { column: "", operator: "contains", value: "" },
  enrich_lead:    { research_plan: "", extra_struct_fields: [] as ExtraStructField[] },
  find_email:     { mode: "PROFESSIONAL" },
  save_csv:       { path: DEFAULT_SAVE_PATH },
  compute_column: { column: "", source_column: "", operator: "contains", value: "" },
};

const DEFAULT_PIPELINE: PipelineBlock[] = [
  { id: "dp-1", type: "read_csv",    params: { path: DEFAULT_CSV_PATH } },
  { id: "dp-2", type: "filter",      params: { column: "company", operator: "contains", value: "" } },
  { id: "dp-3", type: "enrich_lead", params: { research_plan: "", extra_struct_fields: [] as ExtraStructField[] } },
  { id: "dp-4", type: "find_email",  params: { mode: "PROFESSIONAL" } },
  { id: "dp-5", type: "save_csv",    params: { path: DEFAULT_SAVE_PATH } },
];

const LIBRARY_BLOCKS: BlockType[] = [
  "read_csv", "filter", "enrich_lead", "find_email", "save_csv", "compute_column",
];

/* ══════════════════════════════════════════════════════════════════════════════
   Icons
══════════════════════════════════════════════════════════════════════════════ */
function IcTable() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
      <line x1="3" y1="9" x2="21" y2="9"/>
      <line x1="3" y1="15" x2="21" y2="15"/>
      <line x1="9" y1="3" x2="9" y2="21"/>
    </svg>
  );
}
function IcSparkles() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/>
      <path d="M20 3v4M22 5h-4M4 17v2M5 18H3"/>
    </svg>
  );
}
function IcFunnel() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
    </svg>
  );
}
function IcMail() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4"/>
      <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94"/>
    </svg>
  );
}
function IcDownload() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/>
      <line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
  );
}
function IcFormula() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3h7l1 9 1.5-4.5L15 21l2-6h4"/>
    </svg>
  );
}
function IcUpload() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="17 8 12 3 7 8"/>
      <line x1="12" y1="3" x2="12" y2="15"/>
    </svg>
  );
}
function IcPlay() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <polygon points="5 3 19 12 5 21 5 3"/>
    </svg>
  );
}
function IcCheck() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  );
}
function IcX() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.5" strokeLinecap="round">
      <path d="M18 6 6 18M6 6l12 12"/>
    </svg>
  );
}
function IcGrip() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="9" cy="5" r="1.5"/><circle cx="15" cy="5" r="1.5"/>
      <circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/>
      <circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="19" r="1.5"/>
    </svg>
  );
}
function IcSettings() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  );
}
function IcFile() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
    </svg>
  );
}
function IcLoader() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.5" strokeLinecap="round"
      className="animate-spin-loader">
      <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
    </svg>
  );
}
function IcArrowRight() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M12 5l7 7-7 7"/>
    </svg>
  );
}
function IcPlus() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.5" strokeLinecap="round">
      <path d="M12 5v14M5 12h14"/>
    </svg>
  );
}
function IcChevronRight() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6"/>
    </svg>
  );
}
function IcDownloadCloud() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="8 17 12 21 16 17"/>
      <line x1="12" y1="12" x2="12" y2="21"/>
      <path d="M20.88 18.09A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.29"/>
    </svg>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   Block visual identity
══════════════════════════════════════════════════════════════════════════════ */
type BlockMeta = { label: string; sub: string; color: string; glow: string; icon: React.ReactNode };

const BLOCK_META: Record<BlockType, BlockMeta> = {
  read_csv:       { label: "Read CSV",       sub: "Load data source",   color: "#10b981", glow: "rgba(16,185,129,0.35)",  icon: <IcTable /> },
  filter:         { label: "Filter",         sub: "Apply conditions",   color: "#f59e0b", glow: "rgba(245,158,11,0.35)",  icon: <IcFunnel /> },
  enrich_lead:    { label: "Enrich Lead",    sub: "AI data enrichment", color: "#a78bfa", glow: "rgba(167,139,250,0.35)", icon: <IcSparkles /> },
  find_email:     { label: "Find Email",     sub: "Email discovery",    color: "#38bdf8", glow: "rgba(56,189,248,0.35)",  icon: <IcMail /> },
  save_csv:       { label: "Save CSV",       sub: "Export results",     color: "#fb7185", glow: "rgba(251,113,133,0.35)", icon: <IcDownload /> },
  compute_column: { label: "Compute Column", sub: "Derive new values",  color: "#f97316", glow: "rgba(249,115,22,0.35)",  icon: <IcFormula /> },
};

/* ══════════════════════════════════════════════════════════════════════════════
   CSV parser
══════════════════════════════════════════════════════════════════════════════ */
function parseCsv(raw: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return { headers: [], rows: [] };
  const splitLine = (line: string) => {
    const out: string[] = [];
    let cur = ""; let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { if (inQ && line[i + 1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
      else if (c === "," && !inQ) { out.push(cur); cur = ""; }
      else cur += c;
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
   LibraryBlockTile
══════════════════════════════════════════════════════════════════════════════ */
function LibraryBlockTile({ type, disabled }: { type: BlockType; disabled?: boolean }) {
  const meta = BLOCK_META[type];
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `lib::${type}`,
    data: { source: "library", type },
    disabled,
  });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...(disabled ? {} : listeners)}
      style={{ transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.35 : disabled ? 0.38 : 1 }}
      className={`flex items-center gap-2.5 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 transition-all select-none ${
        disabled ? "cursor-not-allowed" : "cursor-grab active:cursor-grabbing hover:border-white/15 hover:bg-white/[0.07]"
      }`}
    >
      <div
        className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg"
        style={{ backgroundColor: `${meta.color}20`, color: disabled ? "#475569" : meta.color }}
      >
        {meta.icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-xs font-medium leading-tight ${disabled ? "text-slate-600" : "text-slate-200"}`}>{meta.label}</p>
        <p className="text-[10px] text-slate-600 truncate">{meta.sub}</p>
      </div>
      <span className="text-slate-700 flex-shrink-0"><IcGrip /></span>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   SortablePipelineBlock
══════════════════════════════════════════════════════════════════════════════ */
function SortablePipelineBlock({
  block, status, isLast, onConfig, onDelete, interactive = true,
}: {
  block: PipelineBlock; status: BlockStatus; isLast: boolean;
  onConfig: () => void; onDelete: () => void; interactive?: boolean;
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
          boxShadow: status === "active" ? `0 0 0 1px ${meta.color}50, 0 0 20px ${meta.glow}` :
                     status === "done"   ? `0 0 0 1px rgba(34,197,94,0.2)` : undefined,
        }}
      >
        {/* Active pulse ring */}
        {status === "active" && (
          <div className="animate-pulse-ring absolute inset-0 rounded-2xl border-2 pointer-events-none"
            style={{ borderColor: `${meta.color}60` }} />
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
            {status === "active"  && <span className="text-sky-400"><IcLoader /></span>}
            {status === "done"    && (
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 shadow shadow-emerald-500/40">
                <IcCheck />
              </div>
            )}
            {status === "failed"  && (
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-500">
                <IcX />
              </div>
            )}
          </div>

          {/* Label */}
          <div className="min-w-0">
            <p className="text-[15px] font-semibold leading-tight text-slate-200 truncate">{meta.label}</p>
            <p className="mt-0.5 text-[12px] text-slate-500 truncate">{meta.sub}</p>
          </div>

          {/* Action buttons */}
          {interactive && (
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onConfig(); }}
                className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-white/[0.07] bg-white/[0.04] py-2 text-[12px] text-slate-500 transition-all hover:border-white/15 hover:text-slate-300"
              >
                <IcSettings /><span>Config</span>
              </button>
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

/* ══════════════════════════════════════════════════════════════════════════════
   PipelineDropZone
══════════════════════════════════════════════════════════════════════════════ */
function PipelineDropZone({ isOver }: { isOver: boolean }) {
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

/* ══════════════════════════════════════════════════════════════════════════════
   DragOverlayCard
══════════════════════════════════════════════════════════════════════════════ */
function DragOverlayCard({ type }: { type: BlockType }) {
  const meta = BLOCK_META[type];
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-white/20 bg-[#0f0f1a] px-3 py-2.5 shadow-2xl shadow-black/60"
      style={{ rotate: "2deg", scale: "1.04" }}>
      <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg"
        style={{ backgroundColor: `${meta.color}20`, color: meta.color }}>
        {meta.icon}
      </div>
      <div>
        <p className="text-xs font-medium text-slate-200">{meta.label}</p>
        <p className="text-[10px] text-slate-600">{meta.sub}</p>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   StatusBadge
══════════════════════════════════════════════════════════════════════════════ */
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; text: string; dot: string; label?: string }> = {
    not_started: { bg: "bg-slate-800/60", text: "text-slate-500", dot: "bg-slate-600", label: "saved" },
    pending:     { bg: "bg-slate-800",    text: "text-slate-400", dot: "bg-slate-500" },
    running:     { bg: "bg-sky-950",      text: "text-sky-300",   dot: "bg-sky-400" },
    completed:   { bg: "bg-emerald-950",  text: "text-emerald-300", dot: "bg-emerald-400" },
    failed:      { bg: "bg-rose-950",     text: "text-rose-300",  dot: "bg-rose-400" },
  };
  const s = map[status] ?? map.pending;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${s.bg} ${s.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot} ${status === "running" ? "animate-pulse" : ""}`} />
      {s.label ?? status}
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
   WorkflowStudio — main component
══════════════════════════════════════════════════════════════════════════════ */
export function WorkflowStudio() {
  /* ── Pipeline / draft state ──────────────────────────────────────────── */
  /* Use stable IDs on initial render to avoid SSR/client hydration mismatch.
     makeId() is only called in event handlers (resetDraft, handleDragEnd, etc.). */
  const [pipeline, setPipeline] = useState<PipelineBlock[]>(
    DEFAULT_PIPELINE.map((b) => ({ ...b, params: { ...b.params } }))
  );

  /* ── Queue / run state ───────────────────────────────────────────────── */
  const [queue,              setQueue]              = useState<QueueItem[]>([]);
  const [isDraftView,        setIsDraftView]        = useState(true);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const [isSubmitting,       setIsSubmitting]       = useState(false);
  const [error,              setError]              = useState("");

  /* ── File / CSV state ────────────────────────────────────────────────── */
  const [fileName, setFileName] = useState("");
  const [headers,  setHeaders]  = useState<string[]>([]);
  const [rows,     setRows]     = useState<Record<string, string>[]>([]);
  const [dragOver, setDragOver] = useState(false);

  /* ── DnD state ───────────────────────────────────────────────────────── */
  const [activeDragId,   setActiveDragId]   = useState<string | null>(null);
  const [activeDragType, setActiveDragType] = useState<BlockType | null>(null);

  /* ── Config panel state ──────────────────────────────────────────────── */
  const [configBlockId, setConfigBlockId] = useState<string | null>(null);

  /* ── Preview state ───────────────────────────────────────────────────── */
  const [previewData,     setPreviewData]     = useState<PreviewData | null>(null);
  const [previewLoading,  setPreviewLoading]  = useState(false);
  const [previewExpanded, setPreviewExpanded] = useState(true);

  /* ── Canvas pan state ────────────────────────────────────────────────── */
  const [pan,      setPan]      = useState({ x: 32, y: 0 });
  const [panStart, setPanStart] = useState<{ mx: number; my: number; px: number; py: number } | null>(null);

  const fileInputRef  = useRef<HTMLInputElement | null>(null);
  const viewportRef   = useRef<HTMLDivElement | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  /* ── Derived values (ORDER MATTERS) ─────────────────────────────────── */
  const configBlock = pipeline.find((b) => b.id === configBlockId) ?? null;
  const pipelineIds = pipeline.map((b) => b.id);

  const filterBlocks       = pipeline.filter((b) => b.type === "filter");
  const hasFilterError     = filterBlocks.some((b) => !b.params.column || !b.params.value);
  const hasNoReadCsvFirst  = pipeline.length > 0 && pipeline[0].type !== "read_csv";
  const hasSaveCsvNotLast  = pipeline.some((b, idx) => b.type === "save_csv" && idx < pipeline.length - 1);
  const hasComputeColError = pipeline.some((b) => {
    if (b.type !== "compute_column") return false;
    if (!b.params.column || !b.params.source_column) return true;
    const op = String(b.params.operator ?? "");
    return ["gt", "lt"].includes(op) && !String(b.params.value ?? "").trim();
  });

  const runDisabled =
    isSubmitting ||
    pipeline.length === 0 ||
    hasNoReadCsvFirst ||
    hasSaveCsvNotLast ||
    hasFilterError ||
    hasComputeColError;

  /* selectedWorkflow MUST be declared before libraryLocked and displayPipeline */
  const selectedWorkflow = !isDraftView && selectedWorkflowId
    ? (queue.find((q) => q.workflow_id === selectedWorkflowId) ?? null)
    : null;

  const libraryLocked =
    !!selectedWorkflow &&
    (selectedWorkflow.status === "pending" || selectedWorkflow.status === "running");

  const displayPipeline: PipelineBlock[] = selectedWorkflow?.pipeline_snapshot ?? pipeline;
  const displayPipelineIds = displayPipeline.map((b) => b.id);

  /* ── workflowPayload (builds struct for enrich_lead) ─────────────────── */
  const workflowPayload = useMemo(() => ({
    blocks: pipeline.map((b) => {
      if (b.type !== "enrich_lead") return { type: b.type, params: b.params };
      const { extra_struct_fields, ...rest } =
        b.params as { extra_struct_fields: ExtraStructField[]; [k: string]: unknown };
      const extras = (extra_struct_fields ?? []).filter((f) => f.key.trim());
      if (extras.length === 0) return { type: b.type, params: rest };
      const struct = { ...DEFAULT_ENRICH_STRUCT };
      for (const f of extras) struct[f.key.trim()] = f.description.trim() || f.key.trim();
      return { type: b.type, params: { ...rest, struct } };
    }),
    max_concurrency: 4,
    submission_batch_size: 10,
    poll_batch_size: 10,
    poll_interval_seconds: 2,
    max_poll_seconds: 300,
    max_retries: 0,
    backoff_base_seconds: 0.5,
    request_timeout_seconds: 45,
  }), [pipeline]);

  /* ── blockStatus ─────────────────────────────────────────────────────── */
  const blockStatus = (blockId: string): BlockStatus => {
    const blockIdx = displayPipeline.findIndex((b) => b.id === blockId);
    const block = displayPipeline[blockIdx];
    if (!block || !selectedWorkflow) return "pending";
    const { status, current_block } = selectedWorkflow;
    if (status === "completed") return "done";
    if (status === "not_started") return "pending";
    const firstMatchIdx = displayPipeline.findIndex((b) => b.type === current_block);
    if (blockIdx < firstMatchIdx) return "done";
    if (blockIdx === firstMatchIdx) return status === "failed" ? "failed" : "active";
    return "pending";
  };

  /* ── Effects ─────────────────────────────────────────────────────────── */

  /* Keep refs in sync so the polling interval can always read latest values */
  const queueRef              = useRef(queue);
  const selectedWorkflowIdRef = useRef(selectedWorkflowId);
  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => { selectedWorkflowIdRef.current = selectedWorkflowId; }, [selectedWorkflowId]);

  /* Poll workflow status — stable interval, reads queue via ref */
  useEffect(() => {
    const id = setInterval(async () => {
      const active = queueRef.current.filter(
        (q) => q.status === "pending" || q.status === "running"
      );
      if (!active.length) return;
      await Promise.all(
        active.map(async (item) => {
          try {
            const res = await fetch(`${API_BASE}/workflows/${item.workflow_id}/status`);
            if (!res.ok) {
              setQueue((prev) =>
                prev.map((q) =>
                  q.workflow_id === item.workflow_id
                    ? { ...q, status: "failed", error_message: "Could not reach workflow" }
                    : q
                )
              );
              return;
            }
            const data = (await res.json()) as WorkflowStatusPayload;
            setQueue((prev) =>
              prev.map((q) =>
                q.workflow_id === item.workflow_id
                  ? {
                      ...q,
                      status:              data.status,
                      current_block:       data.current_block,
                      progress_percentage: data.progress_percentage,
                      rows_processed:      data.rows_processed,
                      total_rows:          data.total_rows,
                      error_message:       data.error_message,
                      output_path:         data.output_path,
                    }
                  : q
              )
            );
            if (item.workflow_id === selectedWorkflowIdRef.current) {
              void fetchPreview(item.workflow_id);
            }
          } catch {
            setQueue((prev) =>
              prev.map((q) =>
                q.workflow_id === item.workflow_id
                  ? { ...q, status: "failed", error_message: "Status polling failed" }
                  : q
              )
            );
          }
        })
      );
    }, 2000);
    return () => clearInterval(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* Canvas pan mouse handlers */
  useEffect(() => {
    if (!panStart) return;
    const onMove = (e: MouseEvent) => {
      const raw = { x: panStart.px + (e.clientX - panStart.mx), y: 0 };
      setPan(raw);
    };
    const onUp = () => setPanStart(null);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup",   onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup",   onUp);
    };
  }, [panStart]);

  /* ── Handlers ────────────────────────────────────────────────────────── */

  const fetchPreview = async (wfId: string) => {
    setPreviewLoading(true);
    try {
      const res = await fetch(`${API_BASE}/workflows/${wfId}/preview?limit=20`);
      if (!res.ok) return; // gracefully handle 404
      const data = (await res.json()) as PreviewData;
      setPreviewData(data);
    } catch { /* ignore */ }
    finally { setPreviewLoading(false); }
  };

  const onDropCsv = async (file: File) => {
    const text   = await file.text();
    const parsed = parseCsv(text);
    setFileName(file.name);
    setHeaders(parsed.headers);
    setRows(parsed.rows);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${API_BASE}/files/upload`, { method: "POST", body: form });
      if (!res.ok) throw new Error("upload failed");
    } catch { setError("Preview loaded, but backend upload failed."); }
  };

  const updateBlock = (id: string, partialParams: Record<string, unknown>) => {
    setPipeline((prev) =>
      prev.map((b) => b.id === id ? { ...b, params: { ...b.params, ...partialParams } } : b)
    );
  };

  const deleteBlock = (id: string) => {
    setPipeline((prev) => prev.filter((b) => b.id !== id));
    if (configBlockId === id) setConfigBlockId(null);
  };

  const runWorkflow = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/workflows/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(workflowPayload),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { workflow_id: string; status: string };
      const item: QueueItem = {
        local_id:            makeId(),
        workflow_id:         data.workflow_id,
        csv_file_name:       fileName || "manual-path.csv",
        csv_headers:         [...headers],
        csv_row_count:       rows.length,
        pipeline_snapshot:   pipeline.map((b) => ({ ...b, params: { ...b.params } })),
        status:              data.status,
        current_block:       null,
        progress_percentage: 0,
        rows_processed:      0,
        total_rows:          0,
        error_message:       null,
        output_path:         null,
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

  const resetDraft = () => {
    /* Auto-save current draft as not_started before clearing */
    if (isDraftView && pipeline.length > 0) {
      const savedItem: QueueItem = {
        local_id:            makeId(),
        workflow_id:         `draft-${makeId()}`,
        csv_file_name:       fileName || "unsaved-draft.csv",
        csv_headers:         [...headers],
        csv_row_count:       rows.length,
        pipeline_snapshot:   pipeline.map((b) => ({ ...b, params: { ...b.params } })),
        status:              "not_started",
        current_block:       null,
        progress_percentage: 0,
        rows_processed:      0,
        total_rows:          0,
        error_message:       null,
        output_path:         null,
      };
      setQueue((prev) => [savedItem, ...prev]);
    }
    setPipeline(DEFAULT_PIPELINE.map((b) => ({ ...b, id: makeId(), params: { ...b.params } })));
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

  const deleteQueueItem = (localId: string) => {
    const item = queue.find((q) => q.local_id === localId);
    if (!item) return;
    if (item.status === "running" || item.status === "pending") return;
    setQueue((prev) => prev.filter((q) => q.local_id !== localId));
    if (item.workflow_id === selectedWorkflowId) {
      setIsDraftView(true);
      setSelectedWorkflowId(null);
      setPreviewData(null);
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragId(String(event.active.id));
    setActiveDragType(event.active.data.current?.type as BlockType ?? null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragId(null);
    setActiveDragType(null);
    const { active, over } = event;
    const src = active.data.current?.source as string;

    if (src === "library") {
      if (libraryLocked) return;
      const type = active.data.current?.type as BlockType;
      const newBlock: PipelineBlock = { id: makeId(), type, params: { ...DEFAULT_PARAMS[type] } };
      /* over may be null when pipeline is empty — fall back to append */
      const overIdx = over ? pipeline.findIndex((b) => b.id === over.id) : -1;
      if (overIdx >= 0) {
        setPipeline((prev) => [
          ...prev.slice(0, overIdx + 1),
          newBlock,
          ...prev.slice(overIdx + 1),
        ]);
      } else {
        setPipeline((prev) => [...prev, newBlock]);
      }
      return;
    }

    if (!over) return;

    if (src === "pipeline") {
      const oldIdx = pipeline.findIndex((b) => b.id === String(active.id));
      const newIdx = pipeline.findIndex((b) => b.id === String(over.id));
      if (oldIdx !== -1 && newIdx !== -1 && oldIdx !== newIdx) {
        const movingBlock = pipeline[oldIdx];
        /* Prevent non-read_csv from being moved to position 0 */
        if (newIdx === 0 && movingBlock.type !== "read_csv") return;
        setPipeline((prev) => arrayMove(prev, oldIdx, newIdx));
      }
    }
  };

  /* ═══════════════════════════════════════════════════════════════════════
     RENDER
  ═══════════════════════════════════════════════════════════════════════ */
  return (
    <main className="min-h-screen bg-[#08080e] text-slate-100 selection:bg-violet-500/30">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 border-b border-white/[0.07] bg-[#0c0c14]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between px-6 py-3.5">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 shadow-lg shadow-violet-500/30">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white"
                  strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                  <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
                  <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
                </svg>
              </div>
              <span className="text-[15px] font-semibold tracking-tight">Workflow Studio</span>
            </div>
            <span className="hidden h-4 w-px bg-white/10 sm:block" />
            <span className="hidden rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-0.5 text-[11px] font-medium text-indigo-300 tracking-wide uppercase sm:block">
              Beta
            </span>
          </div>
          <button
            type="button"
            onClick={resetDraft}
            className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.05] px-3 py-1.5 text-xs font-medium text-slate-300 transition-all hover:border-white/15 hover:bg-white/[0.08] hover:text-white"
          >
            <IcPlus />
            New Workflow
          </button>
        </div>
      </header>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="mx-auto max-w-[1600px] px-6 py-6 space-y-5">

          {/* ── Main grid ─────────────────────────────────────────────── */}
          <div className="grid gap-5 lg:grid-cols-[280px_1fr]">

            {/* ── Left panel ──────────────────────────────────────────── */}
            <div className="flex flex-col gap-4">

              {/* Block Library */}
              <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4">
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-slate-500">Block Library</p>
                {libraryLocked ? (
                  <p className="mb-3 text-[10px] text-amber-500/80">Locked while workflow is running.</p>
                ) : (
                  <p className="mb-3 text-[10px] text-slate-600">Drag blocks onto the canvas to build your workflow.</p>
                )}
                <div className="flex flex-col gap-2">
                  {LIBRARY_BLOCKS.map((type) => (
                    <LibraryBlockTile key={type} type={type} disabled={libraryLocked} />
                  ))}
                </div>
              </div>

              {/* Data Source */}
              <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4">
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-slate-500">Data Source</p>

                {isDraftView ? (
                  /* Drop zone for new files */
                  <>
                    <label
                      className={`group relative flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-5 text-center transition-all ${
                        dragOver
                          ? "border-violet-400/70 bg-violet-500/10"
                          : "border-white/[0.09] bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]"
                      }`}
                      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                      onDragLeave={() => setDragOver(false)}
                      onDrop={(e) => {
                        e.preventDefault(); setDragOver(false);
                        const f = e.dataTransfer.files?.[0];
                        if (f) void onDropCsv(f);
                      }}
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".csv"
                        className="hidden"
                        onClick={(e) => { e.currentTarget.value = ""; }}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) void onDropCsv(f);
                          e.currentTarget.value = "";
                        }}
                      />
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] text-slate-400 transition-colors group-hover:text-slate-300">
                        <IcUpload />
                      </div>
                      <div>
                        <p className="text-xs font-medium text-slate-300">Drop CSV here</p>
                        <p className="mt-0.5 text-[11px] text-slate-600">or click to browse</p>
                      </div>
                    </label>
                    {fileName && (
                      <div className="mt-3 flex items-center gap-2.5 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.07] px-3 py-2">
                        <span className="text-emerald-400 flex-shrink-0"><IcFile /></span>
                        <div className="min-w-0">
                          <p className="truncate text-xs font-medium text-emerald-300">{fileName}</p>
                          <p className="text-[10px] text-emerald-600">{rows.length} rows · {headers.length} columns</p>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  /* Historical file info — read only */
                  <div className="flex items-center gap-2.5 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-3">
                    <span className="flex-shrink-0 text-slate-400"><IcFile /></span>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-slate-300">
                        {selectedWorkflow?.csv_file_name ?? "—"}
                      </p>
                      {((selectedWorkflow?.csv_row_count ?? 0) > 0 || (selectedWorkflow?.csv_headers.length ?? 0) > 0) && (
                        <p className="text-[10px] text-slate-600">
                          {selectedWorkflow?.csv_row_count ?? 0} rows · {selectedWorkflow?.csv_headers.length ?? 0} cols
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Run card */}
              <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4">
                {isDraftView && hasNoReadCsvFirst && (
                  <div className="mb-3 rounded-lg border border-amber-500/20 bg-amber-500/[0.08] px-3 py-2 text-[11px] text-amber-300">
                    First block must be <strong>Read CSV</strong>.
                  </div>
                )}
                {isDraftView && hasSaveCsvNotLast && (
                  <div className="mb-3 rounded-lg border border-amber-500/20 bg-amber-500/[0.08] px-3 py-2 text-[11px] text-amber-300">
                    <strong>Save CSV</strong> must be the last block.
                  </div>
                )}
                {isDraftView && hasFilterError && (
                  <div className="mb-3 rounded-lg border border-amber-500/20 bg-amber-500/[0.08] px-3 py-2 text-[11px] text-amber-300">
                    Configure filter — set column and value.
                  </div>
                )}
                {isDraftView && hasComputeColError && (
                  <div className="mb-3 rounded-lg border border-amber-500/20 bg-amber-500/[0.08] px-3 py-2 text-[11px] text-amber-300">
                    Compute Column needs a name, source column, and value (for gt/lt).
                  </div>
                )}
                {isDraftView && error && (
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
                      : "bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-lg shadow-violet-500/20 hover:shadow-violet-500/30 hover:brightness-110 active:scale-[0.98]"
                  }`}
                >
                  {isSubmitting
                    ? <><IcLoader /><span>Submitting…</span></>
                    : <><IcPlay /><span>Run Workflow</span></>
                  }
                </button>
              </div>
            </div>

            {/* ── Canvas ──────────────────────────────────────────────── */}
            <div className="rounded-2xl border border-white/[0.07] bg-[#0c0c14] overflow-hidden flex flex-col">
              {/* Canvas header */}
              <div className="flex items-center justify-between border-b border-white/[0.05] px-4 py-2.5 flex-shrink-0">
                <div className="flex items-center gap-2.5">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-600">Canvas</p>
                  <span className="rounded-full border border-white/[0.07] bg-white/[0.03] px-2 py-0.5 text-[10px] text-slate-600">
                    {displayPipeline.length} block{displayPipeline.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-slate-700">
                  <IcGrip />
                  {isDraftView ? (
                    <span>Drag grip to reorder · Drag from library to add · Pan to scroll</span>
                  ) : (
                    <span>Read-only snapshot · Click New Workflow to edit</span>
                  )}
                </div>
              </div>

              {/* Canvas viewport */}
              <div
                ref={viewportRef}
                className={`relative overflow-hidden canvas-grid flex-1 min-h-[340px] ${panStart ? "cursor-grabbing select-none" : "cursor-grab"}`}
                onMouseDown={(e) => {
                  if (e.button !== 0) return;
                  const t = e.target as HTMLElement;
                  if (t.closest("[data-no-pan]")) return;
                  setPanStart({ mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y });
                }}
              >
                <div
                  className="absolute inset-0 flex items-center"
                  style={{
                    transform: `translate(${pan.x}px, ${pan.y}px)`,
                    transition: panStart ? "none" : "transform 160ms ease-out",
                  }}
                >
                  {isDraftView && pipeline.length === 0 ? (
                    <div className="w-full px-8">
                      <PipelineDropZone isOver={activeDragId !== null} />
                    </div>
                  ) : (
                    <SortableContext
                      items={isDraftView ? pipelineIds : displayPipelineIds}
                      strategy={horizontalListSortingStrategy}
                    >
                      <div className="flex items-center gap-0 px-8 py-6" data-no-pan="true">
                        {displayPipeline.map((block, idx) => (
                          <SortablePipelineBlock
                            key={block.id}
                            block={block}
                            status={blockStatus(block.id)}
                            isLast={idx === displayPipeline.length - 1}
                            onConfig={() => setConfigBlockId(block.id)}
                            onDelete={() => deleteBlock(block.id)}
                            interactive={isDraftView}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ── Live Data Preview ────────────────────────────────────────── */}
          {(previewData || previewLoading || selectedWorkflow) && (() => {
            const displayCols = previewData?.columns ?? (selectedWorkflow?.csv_headers ?? headers);
            const displayRows = previewData
              ? previewData.rows
              : (rows.slice(0, 8) as Record<string, unknown>[]);
            return (
              <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] overflow-hidden">
                <button
                  type="button"
                  onClick={() => setPreviewExpanded((v) => !v)}
                  className="flex w-full items-center justify-between px-5 py-3 hover:bg-white/[0.02] transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">Live Data Preview</p>
                    {previewData && (
                      <span className="rounded-full border border-white/[0.07] bg-white/[0.04] px-2 py-0.5 text-[10px] text-slate-500">
                        {previewData.rows.length} rows · {previewData.columns.length} cols
                      </span>
                    )}
                    {previewLoading && <span className="text-slate-600"><IcLoader /></span>}
                  </div>
                  <span className={`text-slate-600 transition-transform ${previewExpanded ? "rotate-90" : ""}`}>
                    <IcChevronRight />
                  </span>
                </button>
                {previewExpanded && (
                  <div className="border-t border-white/[0.05] overflow-auto max-h-64">
                    <table className="min-w-full text-left text-xs">
                      <thead className="sticky top-0 bg-[#0c0c14] border-b border-white/[0.06]">
                        <tr>
                          {displayCols.map((col) => (
                            <th key={col} className="whitespace-nowrap px-3 py-2.5 font-medium font-mono text-slate-400">
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {previewLoading && !previewData && Array.from({ length: 4 }).map((_, i) => (
                          <SkeletonRow key={i} cols={displayCols.length || 5} />
                        ))}
                        {!previewLoading && displayRows.map((row, i) => (
                          <tr key={i} className="border-t border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                            {displayCols.map((col) => (
                              <td key={col} className="max-w-[240px] truncate px-3 py-2 font-mono text-slate-400">
                                {String(row[col] ?? "-")}
                              </td>
                            ))}
                          </tr>
                        ))}
                        {!previewLoading && !previewData && displayCols.length === 0 && (
                          <tr>
                            <td colSpan={99} className="px-3 py-5 text-center text-slate-700">
                              Run a workflow to see live data here.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })()}

          {/* ── Run History ───────────────────────────────────────────────── */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-600">Run History</p>
              {queue.length > 0 && (
                <span className="rounded-full border border-white/[0.07] bg-white/[0.04] px-2.5 py-0.5 text-[11px] text-slate-500">
                  {queue.length} run{queue.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>

            {queue.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/[0.06] py-12 text-center">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.03] text-slate-700">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
                    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
                  </svg>
                </div>
                <p className="text-sm font-medium text-slate-600">No workflows yet</p>
                <p className="mt-1 text-xs text-slate-700">Configure your pipeline and hit Run Workflow to get started.</p>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {queue.map((item) => {
                  const isSelected = item.workflow_id === selectedWorkflowId;
                  return (
                    <div
                      key={item.local_id}
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        setSelectedWorkflowId(item.workflow_id);
                        setIsDraftView(false);
                        if (item.status !== "not_started") void fetchPreview(item.workflow_id);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelectedWorkflowId(item.workflow_id);
                          setIsDraftView(false);
                          if (item.status !== "not_started") void fetchPreview(item.workflow_id);
                        }
                      }}
                      className={`group w-full cursor-pointer rounded-2xl border p-4 text-left transition-all hover:border-white/15 ${
                        isSelected
                          ? "border-violet-500/40 bg-violet-500/[0.06] shadow-lg shadow-violet-500/10"
                          : "border-white/[0.07] bg-white/[0.03] hover:bg-white/[0.05]"
                      }`}
                    >
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
                              onClick={(e) => { e.stopPropagation(); deleteQueueItem(item.local_id); }}
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

                      {/* Download button for completed runs */}
                      {item.status === "completed" && item.output_path && (
                        <div className="mt-2.5 flex items-center gap-1.5 text-[10px] text-emerald-500">
                          <IcDownloadCloud />
                          <span className="truncate font-mono">{item.output_path}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <DragOverlay>
          {activeDragId && activeDragType && <DragOverlayCard type={activeDragType} />}
        </DragOverlay>
      </DndContext>

      {/* ══════════════════════════════════════════════════════════════════
          Config panel (right drawer)
      ══════════════════════════════════════════════════════════════════ */}
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close config"
        className={`pointer-events-none fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity ${
          configBlockId ? "pointer-events-auto opacity-100" : "opacity-0"
        }`}
        onClick={() => setConfigBlockId(null)}
      />

      {/* Panel */}
      <aside
        className={`fixed right-0 top-0 z-50 flex h-screen w-[min(95vw,440px)] flex-col border-l border-white/[0.08] bg-[#0f0f1a] shadow-2xl transition-transform duration-300 ease-out ${
          configBlockId ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {configBlock && (() => {
          const meta = BLOCK_META[configBlock.type];
          return (
            <>
              <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl"
                    style={{ backgroundColor: `${meta.color}18`, color: meta.color }}>
                    {meta.icon}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-100">{meta.label}</p>
                    <p className="text-[10px] text-slate-600">Configure block parameters</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setConfigBlockId(null)}
                  className="rounded-lg border border-white/[0.07] bg-white/[0.05] p-1.5 text-slate-500 hover:text-slate-300 transition-colors"
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
                      onChange={(e) => updateBlock(configBlock.id, { path: e.target.value })}
                      placeholder="path/to/input.csv"
                    />
                    <p className="mt-1.5 text-[10px] text-slate-600">Path relative to the backend server root.</p>
                  </label>
                )}

                {/* ── filter ── */}
                {configBlock.type === "filter" && (
                  <>
                    <label className="block text-xs font-medium text-slate-400">
                      Column
                      <select
                        className="mt-1.5 w-full rounded-xl border border-white/[0.08] bg-white/[0.05] px-3 py-2 text-sm text-slate-200 transition-colors focus:border-violet-500/50 focus:outline-none"
                        value={String(configBlock.params.column ?? "")}
                        onChange={(e) => updateBlock(configBlock.id, { column: e.target.value })}
                      >
                        {(headers.length ? headers : ["company", "name", "title", "email"]).map((h) => (
                          <option key={h} value={h} className="bg-[#0f0f1a]">{h}</option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-xs font-medium text-slate-400">
                      Operator
                      <select
                        className="mt-1.5 w-full rounded-xl border border-white/[0.08] bg-white/[0.05] px-3 py-2 text-sm text-slate-200 transition-colors focus:border-violet-500/50 focus:outline-none"
                        value={String(configBlock.params.operator ?? "contains")}
                        onChange={(e) => updateBlock(configBlock.id, { operator: e.target.value })}
                      >
                        <option value="contains"  className="bg-[#0f0f1a]">contains</option>
                        <option value="equals"    className="bg-[#0f0f1a]">equals</option>
                        <option value="gt"        className="bg-[#0f0f1a]">greater than</option>
                        <option value="lt"        className="bg-[#0f0f1a]">less than</option>
                      </select>
                    </label>
                    <label className="block text-xs font-medium text-slate-400">
                      Value
                      <input
                        className="mt-1.5 w-full rounded-xl border border-white/[0.08] bg-white/[0.05] px-3 py-2 text-sm text-slate-200 placeholder-slate-700 transition-colors focus:border-violet-500/50 focus:outline-none"
                        value={String(configBlock.params.value ?? "")}
                        onChange={(e) => updateBlock(configBlock.id, { value: e.target.value })}
                        placeholder="e.g. Ariglad Inc"
                      />
                    </label>
                    {configBlock.params.column && configBlock.params.value && (
                      <div className="rounded-xl border border-violet-500/20 bg-violet-500/[0.06] px-3 py-2.5 text-xs text-slate-400 font-mono">
                        df[df[<span className="text-violet-300">&apos;{String(configBlock.params.column)}&apos;</span>]
                        .str.{String(configBlock.params.operator)}(<span className="text-emerald-300">&apos;{String(configBlock.params.value)}&apos;</span>)]
                      </div>
                    )}
                  </>
                )}

                {/* ── enrich_lead ── */}
                {configBlock.type === "enrich_lead" && (() => {
                  const extraFields = (configBlock.params.extra_struct_fields ?? []) as ExtraStructField[];
                  return (
                    <>
                      <label className="block text-xs font-medium text-slate-400">
                        Research Plan
                        <textarea
                          className="mt-1.5 w-full rounded-xl border border-white/[0.08] bg-white/[0.05] px-3 py-2 text-sm text-slate-200 placeholder-slate-700 transition-colors focus:border-violet-500/50 focus:outline-none resize-none"
                          rows={4}
                          value={String(configBlock.params.research_plan ?? "")}
                          onChange={(e) => updateBlock(configBlock.id, { research_plan: e.target.value })}
                          placeholder="Describe what to research about each lead…"
                        />
                        <p className="mt-1 text-[10px] text-slate-600">
                          Natural language instructions for the AI enrichment agent.
                        </p>
                      </label>

                      <div>
                        <div className="mb-2 flex items-center justify-between">
                          <p className="text-xs font-medium text-slate-400">Additional Output Fields</p>
                          <button
                            type="button"
                            onClick={() => {
                              const updated = [...extraFields, { key: "", description: "" }];
                              updateBlock(configBlock.id, { extra_struct_fields: updated });
                            }}
                            className="flex items-center gap-1 rounded-lg border border-white/[0.07] bg-white/[0.04] px-2 py-1 text-[11px] text-slate-500 hover:text-slate-300 transition-colors"
                          >
                            <IcPlus /><span>Add field</span>
                          </button>
                        </div>
                        <p className="mb-3 text-[10px] text-slate-600">
                          Default fields: {Object.keys(DEFAULT_ENRICH_STRUCT).join(", ")}
                        </p>
                        {extraFields.length === 0 ? (
                          <p className="text-[11px] text-slate-700 italic">No extra fields — using defaults only.</p>
                        ) : (
                          <div className="flex flex-col gap-2">
                            {extraFields.map((field, idx) => (
                              <div key={idx} className="flex gap-2 items-start">
                                <div className="flex flex-1 flex-col gap-1.5">
                                  <input
                                    className="w-full rounded-lg border border-white/[0.08] bg-white/[0.05] px-2.5 py-1.5 text-xs text-slate-200 placeholder-slate-700 focus:border-violet-500/50 focus:outline-none"
                                    placeholder="field_name"
                                    value={field.key}
                                    onChange={(e) => {
                                      const updated = extraFields.map((f, i) =>
                                        i === idx ? { ...f, key: e.target.value } : f
                                      );
                                      updateBlock(configBlock.id, { extra_struct_fields: updated });
                                    }}
                                  />
                                  <input
                                    className="w-full rounded-lg border border-white/[0.08] bg-white/[0.05] px-2.5 py-1.5 text-xs text-slate-400 placeholder-slate-700 focus:border-violet-500/50 focus:outline-none"
                                    placeholder="Description (optional)"
                                    value={field.description}
                                    onChange={(e) => {
                                      const updated = extraFields.map((f, i) =>
                                        i === idx ? { ...f, description: e.target.value } : f
                                      );
                                      updateBlock(configBlock.id, { extra_struct_fields: updated });
                                    }}
                                  />
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const updated = extraFields.filter((_, i) => i !== idx);
                                    updateBlock(configBlock.id, { extra_struct_fields: updated });
                                  }}
                                  className="mt-1 rounded-lg border border-white/[0.07] bg-white/[0.04] p-1.5 text-slate-600 hover:text-rose-400 transition-colors"
                                >
                                  <IcX />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </>
                  );
                })()}

                {/* ── find_email ── */}
                {configBlock.type === "find_email" && (
                  <label className="block text-xs font-medium text-slate-400">
                    Mode
                    <select
                      className="mt-1.5 w-full rounded-xl border border-white/[0.08] bg-white/[0.05] px-3 py-2 text-sm text-slate-200 transition-colors focus:border-violet-500/50 focus:outline-none"
                      value={String(configBlock.params.mode ?? "PROFESSIONAL")}
                      onChange={(e) => updateBlock(configBlock.id, { mode: e.target.value })}
                    >
                      <option value="PROFESSIONAL" className="bg-[#0f0f1a]">PROFESSIONAL</option>
                      <option value="PERSONAL"     className="bg-[#0f0f1a]">PERSONAL</option>
                      <option value="ALL"          className="bg-[#0f0f1a]">ALL</option>
                    </select>
                    <p className="mt-1.5 text-[10px] text-slate-600">
                      PROFESSIONAL searches work email · PERSONAL searches personal email · ALL searches both.
                    </p>
                  </label>
                )}

                {/* ── save_csv ── */}
                {configBlock.type === "save_csv" && (
                  <label className="block text-xs font-medium text-slate-400">
                    Output Path
                    <input
                      className="mt-1.5 w-full rounded-xl border border-white/[0.08] bg-white/[0.05] px-3 py-2 text-sm font-mono text-slate-200 placeholder-slate-700 focus:border-violet-500/50 focus:outline-none"
                      value={String(configBlock.params.path ?? "")}
                      onChange={(e) => updateBlock(configBlock.id, { path: e.target.value })}
                      placeholder="path/to/output.csv"
                    />
                    <p className="mt-1.5 text-[10px] text-slate-600">The enriched CSV will be saved here.</p>
                  </label>
                )}

                {/* ── compute_column ── */}
                {configBlock.type === "compute_column" && (
                  <>
                    <label className="block text-xs font-medium text-slate-400">
                      New Column Name
                      <input
                        className="mt-1.5 w-full rounded-xl border border-white/[0.08] bg-white/[0.05] px-3 py-2 text-sm text-slate-200 placeholder-slate-700 focus:border-violet-500/50 focus:outline-none"
                        value={String(configBlock.params.column ?? "")}
                        onChange={(e) => updateBlock(configBlock.id, { column: e.target.value })}
                        placeholder="e.g. is_enterprise"
                      />
                    </label>
                    <label className="block text-xs font-medium text-slate-400">
                      Source Column
                      <select
                        className="mt-1.5 w-full rounded-xl border border-white/[0.08] bg-white/[0.05] px-3 py-2 text-sm text-slate-200 transition-colors focus:border-violet-500/50 focus:outline-none"
                        value={String(configBlock.params.source_column ?? "")}
                        onChange={(e) => updateBlock(configBlock.id, { source_column: e.target.value })}
                      >
                        <option value="" className="bg-[#0f0f1a]">— select column —</option>
                        {(headers.length ? headers : ["company", "name", "title", "email"]).map((h) => (
                          <option key={h} value={h} className="bg-[#0f0f1a]">{h}</option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-xs font-medium text-slate-400">
                      Operator
                      <select
                        className="mt-1.5 w-full rounded-xl border border-white/[0.08] bg-white/[0.05] px-3 py-2 text-sm text-slate-200 transition-colors focus:border-violet-500/50 focus:outline-none"
                        value={String(configBlock.params.operator ?? "contains")}
                        onChange={(e) => updateBlock(configBlock.id, { operator: e.target.value })}
                      >
                        <option value="contains"  className="bg-[#0f0f1a]">contains</option>
                        <option value="equals"    className="bg-[#0f0f1a]">equals</option>
                        <option value="gt"        className="bg-[#0f0f1a]">greater than</option>
                        <option value="lt"        className="bg-[#0f0f1a]">less than</option>
                      </select>
                    </label>
                    <label className="block text-xs font-medium text-slate-400">
                      Value
                      <input
                        className="mt-1.5 w-full rounded-xl border border-white/[0.08] bg-white/[0.05] px-3 py-2 text-sm text-slate-200 placeholder-slate-700 focus:border-violet-500/50 focus:outline-none"
                        value={String(configBlock.params.value ?? "")}
                        onChange={(e) => updateBlock(configBlock.id, { value: e.target.value })}
                        placeholder="e.g. Enterprise"
                      />
                    </label>
                    {configBlock.params.column && configBlock.params.source_column && (
                      <div className="rounded-xl border border-orange-500/20 bg-orange-500/[0.06] px-3 py-2.5 text-xs text-slate-400 font-mono">
                        df[<span className="text-orange-300">&apos;{String(configBlock.params.column)}&apos;</span>]
                        {" = "}df[<span className="text-violet-300">&apos;{String(configBlock.params.source_column)}&apos;</span>]
                        .str.{String(configBlock.params.operator ?? "contains")}(
                        <span className="text-emerald-300">&apos;{String(configBlock.params.value ?? "")}&apos;</span>)
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="border-t border-white/[0.07] p-5">
                <button
                  type="button"
                  onClick={() => setConfigBlockId(null)}
                  className="w-full rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-500/20 hover:brightness-110 transition-all"
                >
                  Save &amp; Close
                </button>
              </div>
            </>
          );
        })()}
      </aside>
    </main>
  );
}
