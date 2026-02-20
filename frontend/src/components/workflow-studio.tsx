"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type WorkflowBlockType =
  | "read_csv"
  | "filter"
  | "enrich_lead"
  | "find_email"
  | "save_csv";

type Node = {
  id: string;
  label: string;
  type: WorkflowBlockType;
  x: number;
  y: number;
};

type FilterConfig = {
  column: string;
  operator: "equals" | "contains" | "gt" | "lt";
  value: string;
};

type StepToggles = {
  enrich_lead: boolean;
  filter: boolean;
  find_email: boolean;
};

type WorkflowStatus = {
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
  csv_path: string;
  enrich_lead_enabled: boolean;
  filter_enabled: boolean;
  find_email_enabled: boolean;
  status: string;
  current_block: string | null;
  progress_percentage: number;
  rows_processed: number;
  total_rows: number;
  error_message: string | null;
  output_path: string | null;
};

const BASE_NODES: Node[] = [
  { id: "n1", label: "Read CSV", type: "read_csv", x: 60, y: 90 },
  { id: "n2", label: "Enrich Lead", type: "enrich_lead", x: 320, y: 70 },
  { id: "n3", label: "Filter", type: "filter", x: 560, y: 120 },
  { id: "n4", label: "Find Email", type: "find_email", x: 830, y: 95 },
  { id: "n5", label: "Save CSV", type: "save_csv", x: 1070, y: 80 },
];

const NODE_W = 180;
const NODE_H = 86;
const CANVAS_W = 1280;
const CANVAS_H = 420;
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ?? "http://127.0.0.1:8000";
const DEFAULT_CSV_PATH = "backend/_smoke_input.csv";
const DEFAULT_SAVE_PATH = "backend/workflow_output.csv";

function parseCsv(raw: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return { headers: [], rows: [] };

  const splitLine = (line: string) => {
    const out: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const c = line[i];
      if (c === '"') {
        const next = line[i + 1];
        if (inQuotes && next === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (c === "," && !inQuotes) {
        out.push(current);
        current = "";
      } else {
        current += c;
      }
    }
    out.push(current);
    return out.map((v) => v.trim());
  };

  const headers = splitLine(lines[0]);
  const rows = lines.slice(1).map((line) => {
    const parts = splitLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = parts[idx] ?? "";
    });
    return row;
  });
  return { headers, rows };
}

function CsvIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" fill="#22c55e" />
      <path d="M14 2v6h6" fill="#86efac" />
      <path d="M7.5 15h9M7.5 18h9M7.5 12h5" stroke="#052e16" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function WorkflowStudio() {
  const [activeNodeId, setActiveNodeId] = useState<string>("n1");
  const [isDark, setIsDark] = useState(false);
  const [csvPath, setCsvPath] = useState(DEFAULT_CSV_PATH);
  const [savePath, setSavePath] = useState(DEFAULT_SAVE_PATH);
  const [fileName, setFileName] = useState<string>("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  const [csvModalOpen, setCsvModalOpen] = useState(false);
  const [filter, setFilter] = useState<FilterConfig>({
    column: "",
    operator: "contains",
    value: "",
  });
  const [enabledSteps, setEnabledSteps] = useState<StepToggles>({
    enrich_lead: true,
    filter: true,
    find_email: true,
  });
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const [isDraftView, setIsDraftView] = useState(true);
  const [error, setError] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [panStart, setPanStart] = useState<{
    mouseX: number;
    mouseY: number;
    panX: number;
    panY: number;
  } | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const isFilterConfigured = filter.column.trim().length > 0 && filter.value.trim().length > 0;
  const isToggleableBlock = (type: WorkflowBlockType) =>
    type === "enrich_lead" || type === "filter" || type === "find_email";

  useEffect(() => {
    if (!filter.column && headers.length) {
      setFilter((prev) => ({ ...prev, column: headers[0] }));
    }
  }, [headers, filter.column]);

  useEffect(() => {
    document.body.style.background = isDark ? "#020617" : "#f4f5f7";
    document.documentElement.style.background = isDark ? "#020617" : "#f4f5f7";
    return () => {
      document.body.style.background = "#f4f5f7";
      document.documentElement.style.background = "#f4f5f7";
    };
  }, [isDark]);

  useEffect(() => {
    const active = queue.filter((q) => q.status === "pending" || q.status === "running");
    if (!active.length) return;

    const id = setInterval(async () => {
      await Promise.all(
        active.map(async (item) => {
          try {
            const response = await fetch(`${API_BASE}/workflows/${item.workflow_id}/status`);
            const data: WorkflowStatus = await response.json();
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
          } catch {
            setQueue((prev) =>
              prev.map((q) =>
                q.workflow_id === item.workflow_id
                  ? { ...q, status: "failed", error_message: "Status polling failed" }
                  : q,
              ),
            );
          }
        }),
      );
    }, 3000);

    return () => clearInterval(id);
  }, [queue]);

  useEffect(() => {
    if (queue.length === 0 || isDraftView) {
      setSelectedWorkflowId(null);
      return;
    }
    if (!selectedWorkflowId || !queue.some((q) => q.workflow_id === selectedWorkflowId)) {
      setSelectedWorkflowId(queue[0].workflow_id);
    }
  }, [queue, selectedWorkflowId, isDraftView]);

  const workflowJson = useMemo(() => {
    const blocks: Array<{ type: WorkflowBlockType; params: Record<string, unknown> }> = [
      { type: "read_csv", params: { path: csvPath } },
    ];
    if (enabledSteps.enrich_lead) {
      blocks.push({ type: "enrich_lead", params: {} });
    }
    if (enabledSteps.filter) {
      blocks.push({
        type: "filter",
        params: { column: filter.column, operator: filter.operator, value: filter.value },
      });
    }
    if (enabledSteps.find_email) {
      blocks.push({ type: "find_email", params: { mode: "PROFESSIONAL" } });
    }
    blocks.push({ type: "save_csv", params: { path: savePath } });
    return {
      blocks,
      max_concurrency: 4,
      submission_batch_size: 10,
      poll_batch_size: 10,
      poll_interval_seconds: 2,
      max_poll_seconds: 300,
      max_retries: 0,
      backoff_base_seconds: 0.5,
      request_timeout_seconds: 45,
    };
  }, [csvPath, savePath, filter, enabledSteps]);

  const onDropCsv = async (file: File) => {
    const text = await file.text();
    const parsed = parseCsv(text);
    setFileName(file.name);
    setHeaders(parsed.headers);
    setRows(parsed.rows);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch(`${API_BASE}/files/upload`, {
        method: "POST",
        body: form,
      });
      if (response.ok) {
        const data = (await response.json()) as { path: string };
        setCsvPath(data.path);
      }
    } catch {
      setError("Uploaded for preview, but backend file upload failed.");
    }
  };

  const runWorkflow = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setError("");
    if (hasStepSelectionError) {
      setError("No steps are enabled. Check at least one step.");
      setIsSubmitting(false);
      return;
    }
    if (hasFilterValidationError) {
      setError("Filter is enabled. Uncheck the box or pass in filters.");
      setIsSubmitting(false);
      return;
    }
    try {
      const response = await fetch(`${API_BASE}/workflows/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(workflowJson),
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const data = (await response.json()) as { workflow_id: string; status: string };
      const item: QueueItem = {
        local_id: crypto.randomUUID(),
        workflow_id: data.workflow_id,
        csv_file_name: fileName || "manual-path.csv",
        csv_path: csvPath,
        enrich_lead_enabled: enabledSteps.enrich_lead,
        filter_enabled: enabledSteps.filter,
        find_email_enabled: enabledSteps.find_email,
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
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start workflow");
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetDraftWorkflow = () => {
    setIsDraftView(true);
    setSelectedWorkflowId(null);
    setActiveNodeId("n1");
    setCsvPath(DEFAULT_CSV_PATH);
    setSavePath(DEFAULT_SAVE_PATH);
    setFileName("");
    setHeaders([]);
    setRows([]);
    setDragOver(false);
    setFilterDrawerOpen(false);
    setCsvModalOpen(false);
    setEnabledSteps({ enrich_lead: true, filter: true, find_email: true });
    setFilter({ column: "", operator: "contains", value: "" });
    setError("");
    setPan({ x: 0, y: 0 });
    setPanStart(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const clampPan = (x: number, y: number) => {
    const viewport = viewportRef.current;
    if (!viewport) return { x, y };
    const maxX = 20;
    const minX = Math.min(20, viewport.clientWidth - CANVAS_W - 20);
    const maxY = 20;
    const minY = Math.min(20, viewport.clientHeight - CANVAS_H - 20);
    return { x: Math.max(minX, Math.min(maxX, x)), y: Math.max(minY, Math.min(maxY, y)) };
  };

  useEffect(() => {
    if (!panStart) return;
    const onMove = (e: MouseEvent) => {
      setPan(
        clampPan(
          panStart.panX + (e.clientX - panStart.mouseX),
          panStart.panY + (e.clientY - panStart.mouseY),
        ),
      );
    };
    const onUp = () => setPanStart(null);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [panStart]);

  const shellClass = isDark
    ? "min-h-screen bg-[radial-gradient(circle_at_0%_0%,#1d4ed8_0%,rgba(29,78,216,0)_32%),radial-gradient(circle_at_100%_0%,#0ea5e9_0%,rgba(14,165,233,0)_28%),radial-gradient(circle_at_50%_100%,#111827_0%,#020617_62%)] p-6 text-slate-100"
    : "min-h-screen bg-[radial-gradient(circle_at_0%_0%,#dbeafe_0%,rgba(219,234,254,0)_32%),radial-gradient(circle_at_100%_0%,#cffafe_0%,rgba(207,250,254,0)_28%),radial-gradient(circle_at_50%_100%,#f8fafc_0%,#eef2ff_62%)] p-6 text-slate-900";
  const cardClass = isDark
    ? "rounded-2xl border border-white/10 bg-slate-900/70 p-4 shadow-[0_20px_50px_rgba(2,6,23,0.45)] backdrop-blur-xl"
    : "rounded-2xl border border-white/60 bg-white/85 p-4 shadow-[0_20px_45px_rgba(15,23,42,0.08)] backdrop-blur-xl";
  const selectedWorkflow = !isDraftView && selectedWorkflowId
    ? queue.find((q) => q.workflow_id === selectedWorkflowId) ?? null
    : null;
  const effectiveEnabledSteps: StepToggles = selectedWorkflow
    ? {
        enrich_lead: selectedWorkflow.enrich_lead_enabled ?? true,
        filter: selectedWorkflow.filter_enabled ?? true,
        find_email: selectedWorkflow.find_email_enabled ?? true,
      }
    : enabledSteps;
  const hasRunningWorkflow = queue.some((q) => q.status === "pending" || q.status === "running");
  const hasNoOptionalStepsEnabled =
    !enabledSteps.enrich_lead && !enabledSteps.filter && !enabledSteps.find_email;
  const hasFilterValidationError = enabledSteps.filter && !isFilterConfigured;
  const hasStepSelectionError = hasNoOptionalStepsEnabled;
  const runDisabled =
    hasRunningWorkflow || isSubmitting || hasFilterValidationError || hasStepSelectionError;
  const visualOrder: WorkflowBlockType[] = [
    "read_csv",
    ...(effectiveEnabledSteps.enrich_lead ? (["enrich_lead"] as WorkflowBlockType[]) : []),
    ...(effectiveEnabledSteps.filter ? (["filter"] as WorkflowBlockType[]) : []),
    ...(effectiveEnabledSteps.find_email ? (["find_email"] as WorkflowBlockType[]) : []),
    "save_csv",
  ];
  const currentIdx =
    selectedWorkflow?.current_block != null
      ? visualOrder.indexOf(selectedWorkflow.current_block as WorkflowBlockType)
      : -1;

  const blockState = (type: WorkflowBlockType): "pending" | "active" | "done" | "failed" | "skipped" => {
    if (type === "enrich_lead" && !effectiveEnabledSteps.enrich_lead) return "skipped";
    if (type === "filter" && !effectiveEnabledSteps.filter) return "skipped";
    if (type === "find_email" && !effectiveEnabledSteps.find_email) return "skipped";
    if (!selectedWorkflow) return "pending";
    if (selectedWorkflow.status === "failed" && selectedWorkflow.current_block === type) return "failed";
    if (selectedWorkflow.status === "completed") {
      return visualOrder.includes(type) ? "done" : "skipped";
    }
    if (selectedWorkflow.current_block === type) return "active";
    if (currentIdx >= 0 && visualOrder.indexOf(type) >= 0 && visualOrder.indexOf(type) < currentIdx) return "done";
    return "pending";
  };

  const toggleStepForBlock = (type: WorkflowBlockType) => {
    if (!isDraftView) return;
    if (type === "enrich_lead") {
      setEnabledSteps((prev) => ({ ...prev, enrich_lead: !prev.enrich_lead }));
      return;
    }
    if (type === "filter") {
      setEnabledSteps((prev) => ({ ...prev, filter: !prev.filter }));
      return;
    }
    if (type === "find_email") {
      setEnabledSteps((prev) => ({ ...prev, find_email: !prev.find_email }));
    }
  };

  const isBlockEnabled = (type: WorkflowBlockType): boolean => {
    if (type === "enrich_lead") return effectiveEnabledSteps.enrich_lead;
    if (type === "filter") return effectiveEnabledSteps.filter;
    if (type === "find_email") return effectiveEnabledSteps.find_email;
    return true;
  };

  return (
    <main className={shellClass}>
      <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-5">
        <header className={`rounded-2xl border p-5 ${isDark ? "border-white/10 bg-slate-900/60" : "border-white/70 bg-white/80"} shadow-[0_18px_40px_rgba(2,6,23,0.18)] backdrop-blur-xl`}>
          <div className="flex items-center justify-between">
            <div>
              <div className={`mb-2 inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${isDark ? "border-cyan-300/30 bg-cyan-400/10 text-cyan-200" : "border-sky-200 bg-sky-50 text-sky-700"}`}>
                Automation Console
              </div>
              <h1 className="text-3xl font-semibold tracking-tight">Workflow Studio</h1>
            </div>
            <button
              type="button"
              onClick={() => setIsDark((v) => !v)}
              className={`rounded-lg px-3 py-2 text-sm font-medium ${isDark ? "bg-white text-slate-900" : "bg-slate-900 text-white"}`}
            >
              {isDark ? "Light Mode" : "Dark Mode"}
            </button>
          </div>
        </header>

        <section className="grid gap-5 lg:grid-cols-[0.56fr_1.44fr]">
          <div className="space-y-4">
            <div className={cardClass}>
              <h2 className={`text-sm font-semibold uppercase tracking-wide ${isDark ? "text-slate-200" : "text-slate-600"}`}>CSV Upload / Download</h2>
              <label
                className={`mt-3 block cursor-pointer rounded-xl border-2 border-dashed p-3 text-sm transition-all ${
                  dragOver
                    ? "border-cyan-400 bg-cyan-50/80 text-slate-900"
                    : isDark
                      ? "border-white/15 bg-slate-950/70 hover:border-cyan-400/60"
                      : "border-slate-300/80 bg-slate-50/80 hover:border-sky-400"
                }`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file) void onDropCsv(file);
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
                    const file = e.target.files?.[0];
                    if (file) void onDropCsv(file);
                    e.currentTarget.value = "";
                  }}
                />
                Drop CSV here or click to select
              </label>
              <div className={`mt-3 flex items-center gap-3 rounded-lg p-3 ${isDark ? "bg-slate-800/80 ring-1 ring-white/10" : "bg-slate-100/80 ring-1 ring-slate-200/80"}`}>
                <CsvIcon />
                <div className="text-sm">
                  <div className="font-semibold">{fileName || "No file selected"}</div>
                  <div className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>CSV preview loaded locally</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCsvModalOpen(true)}
                className={`mt-3 w-full rounded-lg px-3 py-2 text-sm font-medium transition-colors ${isDark ? "bg-slate-800/90 text-slate-100 hover:bg-slate-700" : "bg-slate-100 text-slate-900 hover:bg-slate-200"}`}
              >
                Open CSV Preview & Paths
              </button>
            </div>

            <div className={cardClass}>
              {hasFilterValidationError && (
                <div className={`mb-3 rounded-lg p-2 text-xs ${isDark ? "bg-amber-900/50 text-amber-100" : "bg-amber-100 text-amber-900"}`}>
                  Filter is enabled. Uncheck the box or pass in filters.
                </div>
              )}
              {hasStepSelectionError && (
                <div className={`mb-3 rounded-lg p-2 text-xs ${isDark ? "bg-amber-900/50 text-amber-100" : "bg-amber-100 text-amber-900"}`}>
                  No steps are enabled. Check at least one step.
                </div>
              )}
              <button
                type="button"
                onClick={runWorkflow}
                disabled={runDisabled}
                className={`w-full rounded-xl px-4 py-3 text-sm font-semibold ${
                  runDisabled
                    ? "cursor-not-allowed bg-slate-500 text-white opacity-70"
                    : isDark
                      ? "bg-gradient-to-r from-cyan-300 via-sky-300 to-emerald-300 text-slate-950 hover:brightness-105"
                      : "bg-gradient-to-r from-slate-900 via-slate-800 to-slate-700 text-white hover:brightness-110"
                }`}
              >
                {hasRunningWorkflow || isSubmitting ? "Workflow Running" : "Run Workflow"}
              </button>
              {error && (
                <div className={`mt-3 rounded-lg p-2 text-xs ${isDark ? "bg-rose-900/50 text-rose-100" : "bg-rose-100 text-rose-800"}`}>
                  {error}
                </div>
              )}
            </div>
          </div>

          <div className={cardClass}>
            <div
              ref={viewportRef}
              className={`relative h-[420px] overflow-hidden rounded-xl border border-dashed ${isDark ? "border-white/15 bg-slate-950/70" : "border-slate-300 bg-slate-50/80"} ${panStart ? "cursor-grabbing select-none" : "cursor-grab"}`}
              onMouseDown={(e) => {
                if (e.button !== 0) return;
                const target = e.target as HTMLElement;
                if (target.closest("button") || target.closest("[data-block-node='true']")) return;
                setPanStart({ mouseX: e.clientX, mouseY: e.clientY, panX: pan.x, panY: pan.y });
              }}
            >
              <div
                className="relative"
                style={{
                  width: `${CANVAS_W}px`,
                  height: `${CANVAS_H}px`,
                  transform: `translate(${pan.x}px, ${pan.y}px)`,
                  transition: panStart ? "none" : "transform 180ms ease-out",
                }}
              >
                <svg className="pointer-events-none absolute inset-0 h-full w-full">
                  {BASE_NODES.slice(0, -1).map((node, idx) => {
                    const next = BASE_NODES[idx + 1];
                    return (
                      <line
                        key={`${node.id}->${next.id}`}
                        x1={node.x + NODE_W}
                        y1={node.y + NODE_H / 2}
                        x2={next.x}
                        y2={next.y + NODE_H / 2}
                        stroke={isDark ? "#475569" : "#8a9bad"}
                        strokeWidth={2}
                        strokeDasharray="6 4"
                      />
                    );
                  })}
                </svg>
                {BASE_NODES.map((node) => (
                  <div
                    key={node.id}
                    data-block-node="true"
                    className={`absolute rounded-xl border p-4 text-left shadow-sm ${
                      (() => {
                        const state = blockState(node.type);
                        if (state === "failed") return "border-rose-500 bg-rose-100";
                        if (state === "active") return isDark ? "border-cyan-300 bg-cyan-500/10 shadow-[0_0_0_1px_rgba(103,232,249,0.25)]" : "border-emerald-400 bg-emerald-50";
                        if (state === "done") return isDark ? "border-emerald-400 bg-emerald-500/10" : "border-emerald-300 bg-emerald-50";
                        if (state === "skipped") return isDark ? "border-slate-700 bg-slate-900/40 opacity-60" : "border-slate-200 bg-slate-100 opacity-70";
                        return isDark ? "border-slate-700 bg-slate-900/90 hover:border-slate-500" : "border-slate-200 bg-white/95 hover:border-slate-300";
                      })()
                    }`}
                    style={{ width: NODE_W, height: NODE_H, left: node.x, top: node.y }}
                    onClick={() => {
                      setActiveNodeId(node.id);
                      if (node.type === "filter") {
                        setFilterDrawerOpen(true);
                        return;
                      }
                      if (isToggleableBlock(node.type)) {
                        toggleStepForBlock(node.type);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter" && e.key !== " ") return;
                      e.preventDefault();
                      setActiveNodeId(node.id);
                      if (node.type === "filter") {
                        setFilterDrawerOpen(true);
                        return;
                      }
                      if (isToggleableBlock(node.type)) {
                        toggleStepForBlock(node.type);
                      }
                    }}
                  >
                    <div className={`text-xs uppercase tracking-wide ${isDark ? "text-slate-400" : "text-slate-500"}`}>Block</div>
                    <div className="mt-1 text-sm font-semibold">{node.label}</div>
                    <div className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>{node.type}</div>
                    {isToggleableBlock(node.type) && (
                      <button
                        type="button"
                        aria-label={`${isBlockEnabled(node.type) ? "Disable" : "Enable"} ${node.label}`}
                        className={`absolute bottom-2 right-2 grid h-5 w-5 place-items-center rounded-full border transition-all ${
                          isBlockEnabled(node.type)
                            ? "border-emerald-400 bg-emerald-500 text-white shadow-[0_0_0_2px_rgba(16,185,129,0.22)]"
                            : isDark
                              ? "border-slate-500 bg-slate-900 text-slate-400"
                              : "border-slate-400 bg-white text-slate-600"
                        }`}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleStepForBlock(node.type);
                        }}
                      >
                        {isBlockEnabled(node.type) && (
                          <svg
                            width="10"
                            height="10"
                            viewBox="0 0 12 12"
                            fill="none"
                            aria-hidden="true"
                          >
                            <path
                              d="M2.3 6.3 4.8 8.7 9.7 3.7"
                              stroke="currentColor"
                              strokeWidth="1.8"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        )}
                      </button>
                    )}
                    {selectedWorkflow && (
                      <div className={`mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] ${
                        blockState(node.type) === "active"
                          ? "bg-sky-100 text-sky-700"
                          : blockState(node.type) === "done"
                            ? "bg-emerald-100 text-emerald-700"
                            : blockState(node.type) === "failed"
                              ? "bg-rose-100 text-rose-700"
                              : blockState(node.type) === "skipped"
                                ? "bg-slate-200 text-slate-600"
                                : "bg-slate-200 text-slate-600"
                      }`}>
                        {blockState(node.type)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className={cardClass}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide">Workflow Queue</h2>
            <button
              type="button"
              onClick={resetDraftWorkflow}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                isDark
                  ? "bg-gradient-to-r from-cyan-300 to-sky-300 text-slate-950 hover:brightness-105"
                  : "bg-gradient-to-r from-slate-900 to-slate-700 text-white hover:brightness-110"
              }`}
            >
              New Workflow
            </button>
          </div>
          {selectedWorkflow && (
            <div className={`mb-3 rounded-lg border p-3 text-xs ${isDark ? "border-slate-700 bg-slate-900" : "border-slate-200 bg-slate-50"}`}>
              <div className="mb-2 font-semibold">Selected Workflow Progress</div>
              <div className={`h-2 w-full rounded ${isDark ? "bg-slate-800" : "bg-slate-200"}`}>
                <div
                  className="h-2 rounded bg-emerald-500 transition-all"
                  style={{ width: `${selectedWorkflow.progress_percentage}%` }}
                />
              </div>
              <div className="mt-1">
                {selectedWorkflow.progress_percentage}% | {selectedWorkflow.status} | block: {selectedWorkflow.current_block ?? "-"}
              </div>
            </div>
          )}
          <div className={`overflow-auto rounded-lg border ${isDark ? "border-slate-700" : "border-slate-200"}`}>
            <table className="min-w-full text-left text-sm">
              <thead className={isDark ? "bg-slate-800 text-slate-300" : "bg-slate-100 text-slate-600"}>
                <tr>
                  <th className="px-3 py-2 font-medium">File</th>
                  <th className="px-3 py-2 font-medium">Workflow ID</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Current Block</th>
                  <th className="px-3 py-2 font-medium">Progress</th>
                </tr>
              </thead>
              <tbody>
                {queue.length === 0 ? (
                  <tr>
                    <td className="px-3 py-3 text-xs opacity-70" colSpan={5}>
                      No workflows yet.
                    </td>
                  </tr>
                ) : (
                  queue.map((item) => (
                    <tr
                      key={item.local_id}
                      className={`cursor-pointer ${isDark ? "border-t border-slate-800 hover:bg-slate-800/70" : "border-t border-slate-100 hover:bg-slate-50"} ${
                        selectedWorkflowId === item.workflow_id
                          ? isDark
                            ? "bg-slate-800/80"
                            : "bg-emerald-50"
                          : ""
                      }`}
                      onClick={() => {
                        setSelectedWorkflowId(item.workflow_id);
                        setIsDraftView(false);
                      }}
                    >
                      <td className="px-3 py-2">{item.csv_file_name}</td>
                      <td className="px-3 py-2 text-xs break-all">{item.workflow_id}</td>
                      <td className="px-3 py-2">{item.status}</td>
                      <td className="px-3 py-2">{item.current_block ?? "-"}</td>
                      <td className="px-3 py-2">{item.progress_percentage}%</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <div className="pointer-events-none fixed inset-0 z-50">
        <button
          type="button"
          className={`absolute inset-0 transition-opacity duration-300 ${filterDrawerOpen ? "pointer-events-auto bg-black/45 opacity-100 backdrop-blur-sm" : "opacity-0"}`}
          onClick={() => setFilterDrawerOpen(false)}
          aria-label="Close filter editor"
        />
        <aside
          className={`pointer-events-auto absolute right-0 top-0 h-screen w-[min(92vw,440px)] border-l p-6 shadow-2xl transition-transform duration-300 ease-out ${
            filterDrawerOpen ? "translate-x-0" : "translate-x-full"
          } ${isDark ? "border-slate-700 bg-slate-950 text-slate-100" : "border-slate-200 bg-white text-slate-900"}`}
        >
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Filter Block</h2>
            <button type="button" onClick={() => setFilterDrawerOpen(false)} className={`rounded-md px-3 py-1 text-sm ${isDark ? "bg-slate-800" : "bg-slate-100"}`}>
              Close
            </button>
          </div>
          <div className="grid gap-3 text-sm">
            <label>
              Column
              <select
                className={`mt-1 w-full rounded-lg border p-2 ${isDark ? "border-slate-700 bg-slate-900" : "border-slate-300 bg-white"}`}
                value={filter.column}
                onChange={(e) => setFilter((prev) => ({ ...prev, column: e.target.value }))}
              >
                {(headers.length ? headers : ["company", "name", "title"]).map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Operator
              <select
                className={`mt-1 w-full rounded-lg border p-2 ${isDark ? "border-slate-700 bg-slate-900" : "border-slate-300 bg-white"}`}
                value={filter.operator}
                onChange={(e) =>
                  setFilter((prev) => ({
                    ...prev,
                    operator: e.target.value as FilterConfig["operator"],
                  }))
                }
              >
                <option value="contains">contains</option>
                <option value="equals">equals</option>
                <option value="gt">gt</option>
                <option value="lt">lt</option>
              </select>
            </label>
            <label>
              Value
              <input
                className={`mt-1 w-full rounded-lg border p-2 ${isDark ? "border-slate-700 bg-slate-900" : "border-slate-300 bg-white"}`}
                value={filter.value}
                onChange={(e) => setFilter((prev) => ({ ...prev, value: e.target.value }))}
                placeholder="Google"
              />
            </label>
          </div>
        </aside>
      </div>

      <div className="pointer-events-none fixed inset-0 z-40">
        <button
          type="button"
          className={`absolute inset-0 transition-opacity duration-300 ${csvModalOpen ? "pointer-events-auto bg-black/40 opacity-100 backdrop-blur-sm" : "opacity-0"}`}
          onClick={() => setCsvModalOpen(false)}
          aria-label="Close csv modal"
        />
        <section
          className={`pointer-events-auto absolute bottom-0 left-0 right-0 h-[70vh] rounded-t-2xl border-t p-4 transition-transform duration-300 ease-out ${
            csvModalOpen ? "translate-y-0" : "translate-y-full"
          } ${isDark ? "border-slate-700 bg-slate-950 text-slate-100" : "border-slate-200 bg-white text-slate-900"}`}
        >
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold">CSV Preview & Backend Paths</h3>
            <button type="button" onClick={() => setCsvModalOpen(false)} className={`rounded-md px-3 py-1 text-sm ${isDark ? "bg-slate-800" : "bg-slate-100"}`}>
              Close
            </button>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-sm">
              CSV Path for backend
              <input
                className={`mt-1 w-full rounded-lg border p-2 ${isDark ? "border-slate-700 bg-slate-900" : "border-slate-300 bg-white"}`}
                value={csvPath}
                onChange={(e) => setCsvPath(e.target.value)}
              />
            </label>
            <label className="text-sm">
              Save Path
              <input
                className={`mt-1 w-full rounded-lg border p-2 ${isDark ? "border-slate-700 bg-slate-900" : "border-slate-300 bg-white"}`}
                value={savePath}
                onChange={(e) => setSavePath(e.target.value)}
              />
            </label>
          </div>
          <div className={`mt-4 h-[45vh] overflow-auto rounded-lg border ${isDark ? "border-slate-700" : "border-slate-200"}`}>
            <table className="min-w-full text-left text-sm">
              <thead className={isDark ? "bg-slate-800 text-slate-300" : "bg-slate-100 text-slate-600"}>
                <tr>
                  {(headers.length ? headers : ["(drop a csv to preview columns)"]).map((h) => (
                    <th key={h} className="px-3 py-2 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(rows.length ? rows.slice(0, 15) : Array.from({ length: 3 }).map(() => ({} as Record<string, string>))).map((row, idx) => (
                  <tr key={idx} className={isDark ? "border-t border-slate-800" : "border-t border-slate-100"}>
                    {(headers.length ? headers : [""]).map((h) => (
                      <td key={`${idx}-${h}`} className="px-3 py-2">
                        {row[h] ?? "-"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}

