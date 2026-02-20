"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/* ══════════════════════════════════════════════════════════════════════════════
   Types
══════════════════════════════════════════════════════════════════════════════ */
type BlockType   = "read_csv" | "filter" | "enrich_lead" | "find_email" | "save_csv";
type BlockStatus = "pending" | "active" | "done" | "failed" | "skipped";

type FilterConfig = {
  column:   string;
  operator: "equals" | "contains" | "gt" | "lt";
  value:    string;
};

type StepToggles = { enrich_lead: boolean; filter: boolean; find_email: boolean };

type WorkflowStatusPayload = {
  workflow_id:         string;
  status:              string;
  current_block:       string | null;
  progress_percentage: number;
  rows_processed:      number;
  total_rows:          number;
  error_message:       string | null;
  output_path:         string | null;
};

type QueueItem = {
  local_id:            string;
  workflow_id:         string;
  csv_file_name:       string;
  csv_path:            string;
  enrich_lead_enabled: boolean;
  filter_enabled:      boolean;
  find_email_enabled:  boolean;
  status:              string;
  current_block:       string | null;
  progress_percentage: number;
  rows_processed:      number;
  total_rows:          number;
  error_message:       string | null;
  output_path:         string | null;
};

type PreviewData = {
  columns: string[];
  rows:    Record<string, unknown>[];
};

/* ══════════════════════════════════════════════════════════════════════════════
   Constants
══════════════════════════════════════════════════════════════════════════════ */
const NODE_W    = 192;
const NODE_H    = 108;
const CANVAS_H  = 380;
const API_BASE  = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ?? "http://127.0.0.1:8000";

const DEFAULT_CSV_PATH  = "backend/_smoke_input.csv";
const DEFAULT_SAVE_PATH = "backend/workflow_output.csv";

const NODES = [
  { id: "n1", label: "Read CSV",    sub: "Load data source",   type: "read_csv"    as BlockType, x: 40,   y: 136 },
  { id: "n2", label: "Enrich Lead", sub: "AI data enrichment", type: "enrich_lead" as BlockType, x: 290,  y: 84  },
  { id: "n3", label: "Filter",      sub: "Apply conditions",   type: "filter"      as BlockType, x: 540,  y: 190 },
  { id: "n4", label: "Find Email",  sub: "Email discovery",    type: "find_email"  as BlockType, x: 790,  y: 110 },
  { id: "n5", label: "Save CSV",    sub: "Export results",     type: "save_csv"    as BlockType, x: 1042, y: 136 },
];

const CANVAS_W = NODES[NODES.length - 1].x + NODE_W + 58;

/* ══════════════════════════════════════════════════════════════════════════════
   Block visual identity
══════════════════════════════════════════════════════════════════════════════ */
type BlockMeta = { color: string; glow: string; icon: React.ReactNode };

const BLOCK_META: Record<BlockType, BlockMeta> = {
  read_csv:    { color: "#10b981", glow: "rgba(16,185,129,0.35)",  icon: <IcTable /> },
  enrich_lead: { color: "#a78bfa", glow: "rgba(167,139,250,0.35)", icon: <IcSparkles /> },
  filter:      { color: "#f59e0b", glow: "rgba(245,158,11,0.35)",  icon: <IcFunnel /> },
  find_email:  { color: "#38bdf8", glow: "rgba(56,189,248,0.35)",  icon: <IcMail /> },
  save_csv:    { color: "#fb7185", glow: "rgba(251,113,133,0.35)", icon: <IcDownload /> },
};

/* ══════════════════════════════════════════════════════════════════════════════
   Icons (inline SVGs — no extra deps)
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
function IcChevronRight() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6"/>
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
      style={{ animation: "spin 0.9s linear infinite" }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
    </svg>
  );
}

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
   Bezier connection path helper
══════════════════════════════════════════════════════════════════════════════ */
function bezierPath(x1: number, y1: number, x2: number, y2: number): string {
  const cx = Math.abs(x2 - x1) * 0.55;
  return `M ${x1} ${y1} C ${x1 + cx} ${y1}, ${x2 - cx} ${y2}, ${x2} ${y2}`;
}

/* ══════════════════════════════════════════════════════════════════════════════
   Status badge
══════════════════════════════════════════════════════════════════════════════ */
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; text: string; dot: string }> = {
    pending:   { bg: "bg-slate-800",   text: "text-slate-400", dot: "bg-slate-500" },
    running:   { bg: "bg-sky-950",     text: "text-sky-300",   dot: "bg-sky-400"   },
    completed: { bg: "bg-emerald-950", text: "text-emerald-300", dot: "bg-emerald-400" },
    failed:    { bg: "bg-rose-950",    text: "text-rose-300",  dot: "bg-rose-400"  },
  };
  const s = map[status] ?? map.pending;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${s.bg} ${s.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot} ${status === "running" ? "animate-pulse" : ""}`} />
      {status}
    </span>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   Skeleton row (shimmer loading)
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
   Main component
══════════════════════════════════════════════════════════════════════════════ */
export function WorkflowStudio() {
  /* ── File / CSV state ──────────────────────────────────────────────────── */
  const [csvPath,   setCsvPath]   = useState(DEFAULT_CSV_PATH);
  const [savePath,  setSavePath]  = useState(DEFAULT_SAVE_PATH);
  const [fileName,  setFileName]  = useState("");
  const [headers,   setHeaders]   = useState<string[]>([]);
  const [rows,      setRows]      = useState<Record<string, string>[]>([]);
  const [dragOver,  setDragOver]  = useState(false);

  /* ── Workflow configuration state ──────────────────────────────────────── */
  const [filter,        setFilter]        = useState<FilterConfig>({ column: "", operator: "contains", value: "" });
  const [enabledSteps,  setEnabledSteps]  = useState<StepToggles>({ enrich_lead: true, filter: true, find_email: true });

  /* ── Run / queue state ─────────────────────────────────────────────────── */
  const [queue,              setQueue]              = useState<QueueItem[]>([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const [isDraftView,        setIsDraftView]         = useState(true);
  const [error,              setError]               = useState("");
  const [isSubmitting,       setIsSubmitting]        = useState(false);

  /* ── Canvas pan ────────────────────────────────────────────────────────── */
  const [pan,      setPan]      = useState({ x: 0, y: 0 });
  const [panStart, setPanStart] = useState<{ mx: number; my: number; px: number; py: number } | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);

  /* ── Panel / modal state ───────────────────────────────────────────────── */
  const [configBlock,    setConfigBlock]    = useState<BlockType | null>(null);
  const [csvModalOpen,   setCsvModalOpen]   = useState(false);

  /* ── Live preview state (Task #4) ──────────────────────────────────────── */
  const [previewData,    setPreviewData]    = useState<PreviewData | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewExpanded, setPreviewExpanded] = useState(true);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  /* ── Derived ───────────────────────────────────────────────────────────── */
  const isFilterConfigured  = filter.column.trim().length > 0 && filter.value.trim().length > 0;
  const hasFilterError      = enabledSteps.filter && !isFilterConfigured;
  const hasNoStepsError     = !enabledSteps.enrich_lead && !enabledSteps.filter && !enabledSteps.find_email;
  const hasRunningWorkflow  = queue.some((q) => q.status === "pending" || q.status === "running");
  const runDisabled         = hasRunningWorkflow || isSubmitting || hasFilterError || hasNoStepsError;

  const selectedWorkflow = !isDraftView && selectedWorkflowId
    ? (queue.find((q) => q.workflow_id === selectedWorkflowId) ?? null)
    : null;

  const effectiveSteps: StepToggles = selectedWorkflow
    ? { enrich_lead: selectedWorkflow.enrich_lead_enabled, filter: selectedWorkflow.filter_enabled, find_email: selectedWorkflow.find_email_enabled }
    : enabledSteps;

  const visualOrder: BlockType[] = [
    "read_csv",
    ...(effectiveSteps.enrich_lead ? ["enrich_lead" as BlockType] : []),
    ...(effectiveSteps.filter      ? ["filter"      as BlockType] : []),
    ...(effectiveSteps.find_email  ? ["find_email"  as BlockType] : []),
    "save_csv",
  ];

  const currentIdx = selectedWorkflow?.current_block != null
    ? visualOrder.indexOf(selectedWorkflow.current_block as BlockType)
    : -1;

  /* ── Auto-select first column for filter ──────────────────────────────── */
  useEffect(() => {
    if (!filter.column && headers.length) setFilter((p) => ({ ...p, column: headers[0] }));
  }, [headers, filter.column]);

  /* ── Poll workflow status (Task #4: also fetch preview) ───────────────── */
  useEffect(() => {
    const active = queue.filter((q) => q.status === "pending" || q.status === "running");
    if (!active.length) return;
    const id = setInterval(async () => {
      await Promise.all(active.map(async (item) => {
        try {
          const res  = await fetch(`${API_BASE}/workflows/${item.workflow_id}/status`);
          const data = (await res.json()) as WorkflowStatusPayload;
          setQueue((prev) => prev.map((q) =>
            q.workflow_id === item.workflow_id
              ? { ...q, status: data.status, current_block: data.current_block,
                  progress_percentage: data.progress_percentage,
                  rows_processed: data.rows_processed, total_rows: data.total_rows,
                  error_message: data.error_message, output_path: data.output_path }
              : q
          ));
          if (item.workflow_id === selectedWorkflowId) {
            void fetchPreview(item.workflow_id);
          }
        } catch {
          setQueue((prev) => prev.map((q) =>
            q.workflow_id === item.workflow_id
              ? { ...q, status: "failed", error_message: "Status polling failed" }
              : q
          ));
        }
      }));
    }, 3000);
    return () => clearInterval(id);
  }, [queue, selectedWorkflowId]);

  /* ── Sync selected workflow on queue changes ──────────────────────────── */
  useEffect(() => {
    if (queue.length === 0 || isDraftView) { setSelectedWorkflowId(null); return; }
    if (!selectedWorkflowId || !queue.some((q) => q.workflow_id === selectedWorkflowId)) {
      setSelectedWorkflowId(queue[0].workflow_id);
    }
  }, [queue, selectedWorkflowId, isDraftView]);

  /* ── Canvas pan mouse handlers ────────────────────────────────────────── */
  useEffect(() => {
    if (!panStart) return;
    const onMove = (e: MouseEvent) => {
      const vp  = viewportRef.current;
      const raw = { x: panStart.px + (e.clientX - panStart.mx), y: panStart.py + (e.clientY - panStart.my) };
      if (!vp) { setPan(raw); return; }
      const minX = Math.min(0, vp.clientWidth  - CANVAS_W - 16);
      const minY = Math.min(0, vp.clientHeight - CANVAS_H - 16);
      setPan({ x: Math.max(minX, Math.min(16, raw.x)), y: Math.max(minY, Math.min(16, raw.y)) });
    };
    const onUp = () => setPanStart(null);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup",   onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [panStart]);

  /* ── Fetch preview data (Task #4) ─────────────────────────────────────── */
  const fetchPreview = async (wfId: string) => {
    setPreviewLoading(true);
    try {
      const res  = await fetch(`${API_BASE}/workflows/${wfId}/preview?limit=20`);
      const data = (await res.json()) as PreviewData;
      setPreviewData(data);
    } catch { /* silently ignore */ }
    finally { setPreviewLoading(false); }
  };

  /* ── Block status resolver ────────────────────────────────────────────── */
  const blockStatus = (type: BlockType): BlockStatus => {
    if (type === "enrich_lead" && !effectiveSteps.enrich_lead) return "skipped";
    if (type === "filter"      && !effectiveSteps.filter)      return "skipped";
    if (type === "find_email"  && !effectiveSteps.find_email)  return "skipped";
    if (!selectedWorkflow) return "pending";
    if (selectedWorkflow.status === "failed"    && selectedWorkflow.current_block === type) return "failed";
    if (selectedWorkflow.status === "completed")  return visualOrder.includes(type) ? "done" : "skipped";
    if (selectedWorkflow.current_block === type)  return "active";
    if (currentIdx >= 0 && visualOrder.indexOf(type) < currentIdx) return "done";
    return "pending";
  };

  /* ── Connection status resolver ───────────────────────────────────────── */
  const connStatus = (fromType: BlockType, toType: BlockType): "active" | "done" | "skip" | "idle" => {
    if (!visualOrder.includes(fromType) || !visualOrder.includes(toType)) return "skip";
    const fromSt = blockStatus(fromType);
    const toSt   = blockStatus(toType);
    if (fromSt === "active" || toSt === "active") return "active";
    if (fromSt === "done"   && toSt !== "skipped") return "done";
    return "idle";
  };

  /* ── Workflow JSON builder ─────────────────────────────────────────────── */
  const workflowJson = useMemo(() => {
    const blocks: Array<{ type: BlockType; params: Record<string, unknown> }> = [
      { type: "read_csv", params: { path: csvPath } },
    ];
    if (enabledSteps.enrich_lead) blocks.push({ type: "enrich_lead", params: {} });
    if (enabledSteps.filter) blocks.push({ type: "filter", params: { column: filter.column, operator: filter.operator, value: filter.value } });
    if (enabledSteps.find_email)  blocks.push({ type: "find_email",  params: { mode: "PROFESSIONAL" } });
    blocks.push({ type: "save_csv", params: { path: savePath } });
    return { blocks, max_concurrency: 4, submission_batch_size: 10, poll_batch_size: 10,
             poll_interval_seconds: 2, max_poll_seconds: 300, max_retries: 0,
             backoff_base_seconds: 0.5, request_timeout_seconds: 45 };
  }, [csvPath, savePath, filter, enabledSteps]);

  /* ── CSV drop handler ─────────────────────────────────────────────────── */
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
      if (res.ok) { const d = (await res.json()) as { path: string }; setCsvPath(d.path); }
    } catch { setError("Preview loaded, but backend upload failed."); }
  };

  /* ── Run workflow ─────────────────────────────────────────────────────── */
  const runWorkflow = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true); setError("");
    if (hasNoStepsError)  { setError("Enable at least one optional step."); setIsSubmitting(false); return; }
    if (hasFilterError)   { setError("Configure filter column and value before running."); setIsSubmitting(false); return; }
    try {
      const res = await fetch(`${API_BASE}/workflows/run`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(workflowJson),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { workflow_id: string; status: string };
      const item: QueueItem = {
        local_id: crypto.randomUUID(), workflow_id: data.workflow_id,
        csv_file_name: fileName || "manual-path.csv", csv_path: csvPath,
        enrich_lead_enabled: enabledSteps.enrich_lead, filter_enabled: enabledSteps.filter,
        find_email_enabled: enabledSteps.find_email, status: data.status,
        current_block: null, progress_percentage: 0, rows_processed: 0,
        total_rows: 0, error_message: null, output_path: null,
      };
      setQueue((prev) => [item, ...prev]);
      setSelectedWorkflowId(data.workflow_id);
      setIsDraftView(false);
      setPreviewData(null);
      setPreviewExpanded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start workflow");
    } finally { setIsSubmitting(false); }
  };

  /* ── Reset ────────────────────────────────────────────────────────────── */
  const resetDraft = () => {
    setIsDraftView(true); setSelectedWorkflowId(null);
    setCsvPath(DEFAULT_CSV_PATH); setSavePath(DEFAULT_SAVE_PATH);
    setFileName(""); setHeaders([]); setRows([]);
    setDragOver(false); setConfigBlock(null); setCsvModalOpen(false);
    setEnabledSteps({ enrich_lead: true, filter: true, find_email: true });
    setFilter({ column: "", operator: "contains", value: "" });
    setError(""); setPan({ x: 0, y: 0 }); setPanStart(null);
    setPreviewData(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  /* ═══════════════════════════════════════════════════════════════════════
     RENDER
  ═══════════════════════════════════════════════════════════════════════ */
  return (
    <main className="min-h-screen bg-[#08080e] text-slate-100 selection:bg-violet-500/30">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="border-b border-white/[0.07] bg-[#0c0c14]/80 backdrop-blur-xl sticky top-0 z-30">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between px-6 py-3.5">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/30">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                  <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
                </svg>
              </div>
              <span className="text-[15px] font-semibold tracking-tight">Workflow Studio</span>
            </div>
            <span className="hidden sm:block h-4 w-px bg-white/10" />
            <span className="hidden sm:block rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-0.5 text-[11px] font-medium text-indigo-300 tracking-wide uppercase">
              Beta
            </span>
          </div>
          <div className="flex items-center gap-2">
            {selectedWorkflow && (
              <div className="hidden sm:flex items-center gap-2 rounded-full border border-white/[0.07] bg-white/[0.04] px-3 py-1.5 text-xs text-slate-400">
                <span className={`h-1.5 w-1.5 rounded-full ${selectedWorkflow.status === "running" ? "bg-sky-400 animate-pulse" : selectedWorkflow.status === "completed" ? "bg-emerald-400" : "bg-rose-400"}`} />
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
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
              New Workflow
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1600px] px-6 py-6 space-y-5">

        {/* ── Main grid: left panel + canvas ───────────────────────────── */}
        <div className="grid gap-5 lg:grid-cols-[300px_1fr]">

          {/* ── Left panel ─────────────────────────────────────────────── */}
          <div className="flex flex-col gap-4">

            {/* Upload card */}
            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-slate-500">Data Source</p>
              <label
                className={`group relative flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-5 text-center transition-all ${
                  dragOver
                    ? "border-violet-400/70 bg-violet-500/10"
                    : "border-white/[0.09] bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]"
                }`}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) void onDropCsv(f); }}
              >
                <input ref={fileInputRef} type="file" accept=".csv" className="hidden"
                  onClick={(e) => { e.currentTarget.value = ""; }}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) void onDropCsv(f); e.currentTarget.value = ""; }}
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
                <div className="mt-3 flex items-center gap-2.5 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.07] px-3 py-2 animate-fade-in">
                  <span className="text-emerald-400"><IcFile /></span>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-emerald-300">{fileName}</p>
                    <p className="text-[10px] text-emerald-600">{rows.length} rows · {headers.length} columns</p>
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={() => setCsvModalOpen(true)}
                className="mt-3 w-full rounded-lg border border-white/[0.07] bg-white/[0.03] py-1.5 text-xs font-medium text-slate-400 transition-all hover:border-white/15 hover:text-slate-300"
              >
                Configure paths & preview data
              </button>
            </div>

            {/* Steps card */}
            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-slate-500">Pipeline Steps</p>
              <div className="space-y-1.5">
                {NODES.map((node) => {
                  const meta      = BLOCK_META[node.type];
                  const isOptional = node.type === "enrich_lead" || node.type === "filter" || node.type === "find_email";
                  const enabled   = isOptional
                    ? effectiveSteps[node.type as keyof StepToggles]
                    : true;
                  const st        = blockStatus(node.type);
                  return (
                    <div
                      key={node.id}
                      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all ${
                        st === "active" ? "bg-white/[0.07] ring-1 ring-white/10" :
                        st === "done"   ? "bg-white/[0.03]" :
                        !enabled        ? "opacity-40"      : "hover:bg-white/[0.04]"
                      }`}
                    >
                      {/* icon badge */}
                      <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg"
                        style={{ backgroundColor: `${meta.color}20`, color: meta.color }}>
                        {meta.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium leading-tight text-slate-200">{node.label}</p>
                        <p className="text-[10px] text-slate-600 truncate">{node.sub}</p>
                      </div>
                      {/* right-side: status or toggle + configure */}
                      <div className="flex items-center gap-1.5">
                        {st === "active" && (
                          <span className="text-sky-400"><IcLoader /></span>
                        )}
                        {st === "done" && (
                          <div className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500">
                            <IcCheck />
                          </div>
                        )}
                        {st === "failed" && (
                          <div className="flex h-4 w-4 items-center justify-center rounded-full bg-rose-500">
                            <IcX />
                          </div>
                        )}
                        {isOptional && isDraftView && (
                          <button
                            type="button"
                            onClick={() => setEnabledSteps((p) => ({ ...p, [node.type]: !p[node.type as keyof StepToggles] }))}
                            className={`relative h-4 w-7 rounded-full transition-all ${enabled ? "bg-violet-500" : "bg-white/10"}`}
                            aria-label={`Toggle ${node.label}`}
                          >
                            <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-all ${enabled ? "left-[calc(100%-14px)]" : "left-0.5"}`} />
                          </button>
                        )}
                        {(node.type === "filter" || node.type === "save_csv" || node.type === "read_csv") && isDraftView && (
                          <button
                            type="button"
                            onClick={() => setConfigBlock(node.type)}
                            className="rounded-md border border-white/[0.07] bg-white/[0.05] p-1 text-slate-500 transition-all hover:border-white/15 hover:text-slate-300"
                          >
                            <IcSettings />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Run card */}
            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4">
              {hasFilterError && (
                <div className="mb-3 rounded-lg border border-amber-500/20 bg-amber-500/[0.08] px-3 py-2 text-[11px] text-amber-300">
                  Configure filter — set column and value.
                </div>
              )}
              {hasNoStepsError && (
                <div className="mb-3 rounded-lg border border-amber-500/20 bg-amber-500/[0.08] px-3 py-2 text-[11px] text-amber-300">
                  Enable at least one optional step.
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
                    : "bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-lg shadow-violet-500/20 hover:shadow-violet-500/30 hover:brightness-110 active:scale-[0.98]"
                }`}
              >
                {isSubmitting || hasRunningWorkflow
                  ? <><IcLoader /> Running…</>
                  : <><IcPlay /> Run Workflow</>
                }
              </button>
            </div>
          </div>

          {/* ── Canvas ─────────────────────────────────────────────────── */}
          <div className="rounded-2xl border border-white/[0.07] bg-[#0c0c14] overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/[0.05] px-4 py-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-600">Canvas</p>
              <div className="flex items-center gap-1.5 text-[10px] text-slate-600">
                <span className="h-1.5 w-1.5 rounded-full bg-slate-700" />Drag to pan
              </div>
            </div>
            <div
              ref={viewportRef}
              className={`relative overflow-hidden canvas-grid ${panStart ? "cursor-grabbing select-none" : "cursor-grab"}`}
              style={{ height: CANVAS_H }}
              onMouseDown={(e) => {
                if (e.button !== 0) return;
                const t = e.target as HTMLElement;
                if (t.closest("[data-node]") || t.closest("button")) return;
                setPanStart({ mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y });
              }}
            >
              <div
                className="absolute"
                style={{ width: CANVAS_W, height: CANVAS_H, transform: `translate(${pan.x}px,${pan.y}px)`, transition: panStart ? "none" : "transform 160ms ease-out" }}
              >
                {/* ── SVG connections (Task #2) ─────────────────────── */}
                <svg className="pointer-events-none absolute inset-0 overflow-visible" width={CANVAS_W} height={CANVAS_H}>
                  <defs>
                    {/* Glowing filter for active paths */}
                    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                      <feGaussianBlur stdDeviation="3" result="blur" />
                      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
                    </filter>
                  </defs>
                  {NODES.slice(0, -1).map((node, idx) => {
                    const next = NODES[idx + 1];
                    const x1   = node.x + NODE_W;
                    const y1   = node.y + NODE_H / 2;
                    const x2   = next.x;
                    const y2   = next.y + NODE_H / 2;
                    const d    = bezierPath(x1, y1, x2, y2);
                    const cs   = connStatus(node.type, next.type);
                    const fromMeta = BLOCK_META[node.type];

                    return (
                      <g key={`${node.id}->${next.id}`}>
                        {/* Base track */}
                        <path d={d} fill="none"
                          stroke={cs === "skip" ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.08)"}
                          strokeWidth={2} />
                        {/* Done / active overlay */}
                        {(cs === "done" || cs === "active") && (
                          <path d={d} fill="none"
                            stroke={cs === "done" ? "#22c55e" : fromMeta.color}
                            strokeWidth={cs === "active" ? 2.5 : 2}
                            strokeOpacity={cs === "done" ? 0.7 : 1}
                            strokeDasharray={cs === "active" ? "8 6" : "none"}
                            filter={cs === "active" ? "url(#glow)" : undefined}
                            className={cs === "active" ? "animate-flow-line" : undefined}
                          />
                        )}
                        {/* Traveling dot on active connection */}
                        {cs === "active" && (
                          <circle r="4" fill={fromMeta.color} filter="url(#glow)">
                            <animateMotion dur="1.6s" repeatCount="indefinite" path={d} />
                          </circle>
                        )}
                        {/* Arrow head */}
                        {cs !== "skip" && (
                          <path
                            d={`M ${x2 - 7} ${y2 - 5} L ${x2} ${y2} L ${x2 - 7} ${y2 + 5}`}
                            fill="none"
                            stroke={cs === "done" ? "#22c55e" : cs === "active" ? fromMeta.color : "rgba(255,255,255,0.15)"}
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        )}
                      </g>
                    );
                  })}
                </svg>

                {/* ── Block nodes (Task #1) ─────────────────────────── */}
                {NODES.map((node) => {
                  const meta = BLOCK_META[node.type];
                  const st   = blockStatus(node.type);
                  const isOptional = node.type === "enrich_lead" || node.type === "filter" || node.type === "find_email";
                  const isEnabled  = isOptional ? effectiveSteps[node.type as keyof StepToggles] : true;

                  return (
                    <div
                      key={node.id}
                      data-node="true"
                      className={`absolute rounded-2xl border bg-[#0f0f1a] transition-all duration-200 ${
                        st === "active"  ? "border-white/20 shadow-2xl"          :
                        st === "done"    ? "border-white/10"                      :
                        st === "failed"  ? "border-rose-500/50"                   :
                        st === "skipped" ? "border-white/[0.04] opacity-35"       :
                        "border-white/[0.07] hover:border-white/15"
                      }`}
                      style={{
                        width:     NODE_W,
                        height:    NODE_H,
                        left:      node.x,
                        top:       node.y,
                        boxShadow: st === "active"
                          ? `0 0 0 1px ${meta.color}50, 0 0 28px ${meta.glow}`
                          : st === "done"
                            ? `0 0 0 1px rgba(34,197,94,0.2)`
                            : undefined,
                      }}
                    >
                      {/* Active pulse ring */}
                      {st === "active" && (
                        <div
                          className="animate-pulse-ring absolute inset-0 rounded-2xl border-2"
                          style={{ borderColor: `${meta.color}60` }}
                        />
                      )}

                      <div className="flex h-full flex-col justify-between p-3.5">
                        <div className="flex items-start justify-between gap-2">
                          {/* Icon badge */}
                          <div
                            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl"
                            style={{ backgroundColor: `${meta.color}18`, color: meta.color, boxShadow: `0 0 12px ${meta.glow}` }}
                          >
                            {meta.icon}
                          </div>
                          {/* Status indicator top-right */}
                          {st === "active" && (
                            <span className="text-sky-400 mt-0.5"><IcLoader /></span>
                          )}
                          {st === "done" && (
                            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 shadow shadow-emerald-500/40">
                              <IcCheck />
                            </div>
                          )}
                          {st === "failed" && (
                            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-500">
                              <IcX />
                            </div>
                          )}
                          {isOptional && isDraftView && st === "pending" && (
                            <button
                              type="button"
                              onClick={() => setEnabledSteps((p) => ({ ...p, [node.type]: !isEnabled }))}
                              className={`relative mt-0.5 h-4 w-7 flex-shrink-0 rounded-full transition-all ${isEnabled ? "bg-violet-500" : "bg-white/10"}`}
                            >
                              <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-all ${isEnabled ? "left-[calc(100%-14px)]" : "left-0.5"}`} />
                            </button>
                          )}
                        </div>

                        <div>
                          <p className="text-[13px] font-semibold leading-tight text-slate-100">{node.label}</p>
                          <p className="mt-0.5 text-[10px] text-slate-600 truncate">{node.sub}</p>
                        </div>
                      </div>

                      {/* Left accent bar */}
                      <div
                        className="absolute left-0 top-3 bottom-3 w-0.5 rounded-r-full"
                        style={{ backgroundColor: st === "skipped" ? "transparent" : meta.color, opacity: st === "pending" ? 0.3 : 1 }}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* ── Live Data Preview (Task #4) ─────────────────────────────────── */}
        {(previewData || previewLoading || selectedWorkflow) && (() => {
          const displayCols = previewData?.columns ?? headers;
          const displayRows = previewData ? previewData.rows : (rows.slice(0, 8) as Record<string, unknown>[]);
          return (
            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] overflow-hidden animate-slide-up">
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
                          <th key={col} className="whitespace-nowrap px-3 py-2.5 font-medium text-slate-400 font-mono">
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
                      {!previewLoading && !previewData && rows.length === 0 && (
                        <tr><td colSpan={99} className="px-3 py-5 text-center text-slate-700">
                          Drop a CSV or run a workflow to see data here.
                        </td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })()}

        {/* ── Workflow History Cards (Task #5) ────────────────────────────── */}
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
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.03] text-slate-700 mb-3">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                  <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
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
                  <button
                    key={item.local_id}
                    type="button"
                    onClick={() => { setSelectedWorkflowId(item.workflow_id); setIsDraftView(false); void fetchPreview(item.workflow_id); }}
                    className={`w-full rounded-2xl border p-4 text-left transition-all hover:border-white/15 ${
                      isSelected
                        ? "border-violet-500/40 bg-violet-500/[0.06] shadow-lg shadow-violet-500/10"
                        : "border-white/[0.07] bg-white/[0.03] hover:bg-white/[0.05]"
                    }`}
                  >
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-slate-500 flex-shrink-0"><IcFile /></span>
                        <span className="truncate text-xs font-medium text-slate-300">{item.csv_file_name}</span>
                      </div>
                      <StatusBadge status={item.status} />
                    </div>

                    {/* Progress bar */}
                    <div className="h-1 w-full overflow-hidden rounded-full bg-white/[0.06]">
                      <div
                        className="h-1 rounded-full transition-all duration-700"
                        style={{
                          width: `${item.progress_percentage}%`,
                          background: item.status === "failed" ? "#f43f5e" : item.status === "completed" ? "#22c55e" : "linear-gradient(90deg,#6366f1,#a78bfa)",
                        }}
                      />
                    </div>

                    <div className="mt-2.5 flex items-center justify-between text-[10px] text-slate-600">
                      <span className="font-mono truncate max-w-[120px]">{item.workflow_id.split("-")[0]}…</span>
                      <span className="flex items-center gap-1">
                        {item.current_block && item.status === "running" && (
                          <><span className="text-sky-500"><IcLoader /></span>{item.current_block}</>
                        )}
                        {item.status === "completed" && `${item.rows_processed} rows`}
                        {item.status === "failed"    && <span className="text-rose-400">{item.error_message?.slice(0, 30)}</span>}
                      </span>
                    </div>

                    {/* Block pills */}
                    <div className="mt-2.5 flex flex-wrap gap-1">
                      {(["enrich_lead", "filter", "find_email"] as const).map((k) =>
                        item[`${k}_enabled`] ? (
                          <span key={k} className="rounded-full border border-white/[0.07] bg-white/[0.04] px-2 py-0.5 text-[10px] text-slate-600"
                            style={{ borderColor: `${BLOCK_META[k].color}30`, color: BLOCK_META[k].color }}>
                            {k.replace("_", " ")}
                          </span>
                        ) : null
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
          Config panel overlay (Task #3)
      ══════════════════════════════════════════════════════════════════ */}
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close config"
        className={`pointer-events-none fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity ${configBlock ? "pointer-events-auto opacity-100" : "opacity-0"}`}
        onClick={() => setConfigBlock(null)}
      />
      {/* Panel */}
      <aside
        className={`fixed right-0 top-0 z-50 flex h-screen w-[min(95vw,420px)] flex-col border-l border-white/[0.08] bg-[#0f0f1a] shadow-2xl transition-transform duration-300 ease-out ${configBlock ? "translate-x-0" : "translate-x-full"}`}
      >
        {configBlock && (() => {
          const meta = BLOCK_META[configBlock];
          return (
            <>
              <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl"
                    style={{ backgroundColor: `${meta.color}18`, color: meta.color }}>
                    {meta.icon}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-100">
                      {NODES.find((n) => n.type === configBlock)?.label}
                    </p>
                    <p className="text-[10px] text-slate-600">Configure block parameters</p>
                  </div>
                </div>
                <button type="button" onClick={() => setConfigBlock(null)}
                  className="rounded-lg border border-white/[0.07] bg-white/[0.05] p-1.5 text-slate-500 hover:text-slate-300 transition-colors">
                  <IcX />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {configBlock === "filter" && (
                  <>
                    <label className="block text-xs font-medium text-slate-400">
                      Column
                      <select
                        className="mt-1.5 w-full rounded-xl border border-white/[0.08] bg-white/[0.05] px-3 py-2 text-sm text-slate-200 transition-colors focus:border-violet-500/50 focus:outline-none"
                        value={filter.column}
                        onChange={(e) => setFilter((p) => ({ ...p, column: e.target.value }))}
                      >
                        {(headers.length ? headers : ["company", "name", "title"]).map((h) => (
                          <option key={h} value={h} className="bg-[#0f0f1a]">{h}</option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-xs font-medium text-slate-400">
                      Operator
                      <select
                        className="mt-1.5 w-full rounded-xl border border-white/[0.08] bg-white/[0.05] px-3 py-2 text-sm text-slate-200 transition-colors focus:border-violet-500/50 focus:outline-none"
                        value={filter.operator}
                        onChange={(e) => setFilter((p) => ({ ...p, operator: e.target.value as FilterConfig["operator"] }))}
                      >
                        <option value="contains" className="bg-[#0f0f1a]">contains</option>
                        <option value="equals"   className="bg-[#0f0f1a]">equals</option>
                        <option value="gt"        className="bg-[#0f0f1a]">greater than</option>
                        <option value="lt"        className="bg-[#0f0f1a]">less than</option>
                      </select>
                    </label>
                    <label className="block text-xs font-medium text-slate-400">
                      Value
                      <input
                        className="mt-1.5 w-full rounded-xl border border-white/[0.08] bg-white/[0.05] px-3 py-2 text-sm text-slate-200 placeholder-slate-700 transition-colors focus:border-violet-500/50 focus:outline-none"
                        value={filter.value}
                        onChange={(e) => setFilter((p) => ({ ...p, value: e.target.value }))}
                        placeholder="e.g. Ariglad Inc"
                      />
                    </label>
                    {filter.column && filter.value && (
                      <div className="rounded-xl border border-violet-500/20 bg-violet-500/[0.06] px-3 py-2.5 text-xs text-slate-400 font-mono">
                        df[df[<span className="text-violet-300">&apos;{filter.column}&apos;</span>].str.{filter.operator}(<span className="text-emerald-300">&apos;{filter.value}&apos;</span>)]
                      </div>
                    )}
                  </>
                )}
                {configBlock === "read_csv" && (
                  <label className="block text-xs font-medium text-slate-400">
                    CSV Path
                    <input
                      className="mt-1.5 w-full rounded-xl border border-white/[0.08] bg-white/[0.05] px-3 py-2 text-sm font-mono text-slate-200 placeholder-slate-700 focus:border-violet-500/50 focus:outline-none"
                      value={csvPath}
                      onChange={(e) => setCsvPath(e.target.value)}
                      placeholder="path/to/input.csv"
                    />
                    <p className="mt-1.5 text-[10px] text-slate-600">Path relative to the backend server root.</p>
                  </label>
                )}
                {configBlock === "save_csv" && (
                  <label className="block text-xs font-medium text-slate-400">
                    Output Path
                    <input
                      className="mt-1.5 w-full rounded-xl border border-white/[0.08] bg-white/[0.05] px-3 py-2 text-sm font-mono text-slate-200 placeholder-slate-700 focus:border-violet-500/50 focus:outline-none"
                      value={savePath}
                      onChange={(e) => setSavePath(e.target.value)}
                      placeholder="path/to/output.csv"
                    />
                    <p className="mt-1.5 text-[10px] text-slate-600">The enriched CSV will be saved here.</p>
                  </label>
                )}
              </div>
              <div className="border-t border-white/[0.07] p-5">
                <button
                  type="button"
                  onClick={() => setConfigBlock(null)}
                  className="w-full rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-500/20 hover:brightness-110 transition-all"
                >
                  Save & Close
                </button>
              </div>
            </>
          );
        })()}
      </aside>

      {/* ══════════════════════════════════════════════════════════════════
          CSV preview modal (Task #3 — data paths)
      ══════════════════════════════════════════════════════════════════ */}
      <button
        type="button"
        aria-label="Close CSV modal"
        className={`pointer-events-none fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity ${csvModalOpen ? "pointer-events-auto opacity-100" : "opacity-0"}`}
        onClick={() => setCsvModalOpen(false)}
      />
      <section
        className={`pointer-events-auto fixed bottom-0 left-0 right-0 z-50 flex flex-col rounded-t-2xl border-t border-white/[0.08] bg-[#0f0f1a] shadow-2xl transition-transform duration-300 ease-out ${csvModalOpen ? "translate-y-0" : "translate-y-full"}`}
        style={{ maxHeight: "70vh" }}
      >
        <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-3.5">
          <p className="text-sm font-semibold text-slate-200">CSV Preview &amp; Paths</p>
          <button type="button" onClick={() => setCsvModalOpen(false)}
            className="rounded-lg border border-white/[0.07] bg-white/[0.04] p-1.5 text-slate-500 hover:text-slate-300 transition-colors">
            <IcX />
          </button>
        </div>
        <div className="grid gap-4 px-5 pt-4 pb-2 sm:grid-cols-2">
          <label className="text-xs font-medium text-slate-400">
            Input CSV path
            <input className="mt-1.5 w-full rounded-xl border border-white/[0.08] bg-white/[0.05] px-3 py-2 text-xs font-mono text-slate-200 focus:border-violet-500/50 focus:outline-none"
              value={csvPath} onChange={(e) => setCsvPath(e.target.value)} />
          </label>
          <label className="text-xs font-medium text-slate-400">
            Output save path
            <input className="mt-1.5 w-full rounded-xl border border-white/[0.08] bg-white/[0.05] px-3 py-2 text-xs font-mono text-slate-200 focus:border-violet-500/50 focus:outline-none"
              value={savePath} onChange={(e) => setSavePath(e.target.value)} />
          </label>
        </div>
        <div className="flex-1 overflow-auto px-5 pb-5">
          <div className="rounded-xl border border-white/[0.06] overflow-hidden">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-white/[0.04] border-b border-white/[0.06]">
                <tr>
                  {(headers.length ? headers : ["(drop a CSV to preview)"]).map((h) => (
                    <th key={h} className="whitespace-nowrap px-3 py-2.5 font-medium font-mono text-slate-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(rows.length ? rows.slice(0, 15) : Array.from({ length: 2 }).map(() => ({} as Record<string, string>))).map((row, i) => (
                  <tr key={i} className="border-t border-white/[0.04] hover:bg-white/[0.02]">
                    {(headers.length ? headers : [""]).map((h) => (
                      <td key={`${i}-${h}`} className="max-w-[200px] truncate px-3 py-2 font-mono text-slate-500">{row[h] ?? "-"}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </main>
  );
}
