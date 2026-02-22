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
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useEffect, useMemo, useRef, useState } from "react";

import type { BlockType, PipelineBlock, QueueItem, PreviewData, WorkflowStatusPayload } from "./workflow-studio/types";
import {
  API_BASE,
  DEFAULT_PARAMS,
  DEFAULT_PIPELINE,
  LIBRARY_BLOCKS,
  makeId,
  DEFAULT_ENRICH_STRUCT,
} from "./workflow-studio/constants";
import { parseCsv, getEffectiveHeaders } from "./workflow-studio/utils";
import {
  IcPlus, IcPlay, IcCheck, IcX, IcLoader, IcGrip,
  IcUpload, IcFile,
} from "./workflow-studio/icons";
import { LibraryBlockTile }      from "./workflow-studio/LibraryBlockTile";
import { SortablePipelineBlock } from "./workflow-studio/SortablePipelineBlock";
import { PipelineDropZone }      from "./workflow-studio/PipelineDropZone";
import { DragOverlayCard }       from "./workflow-studio/DragOverlayCard";
import { ConfigPanel }           from "./workflow-studio/ConfigPanel";
import { QueueCard }             from "./workflow-studio/QueueCard";
import { LiveDataPreview }       from "./workflow-studio/LiveDataPreview";
import type { ExtraStructField } from "./workflow-studio/types";

/* ══════════════════════════════════════════════════════════════════════════════
   WorkflowStudio — main orchestrator (state + handlers + layout)
══════════════════════════════════════════════════════════════════════════════ */
export function WorkflowStudio() {
  /* ── Pipeline / draft state ──────────────────────────────────────────── */
  /* Use stable IDs on initial render to avoid SSR/client hydration mismatch.
     makeId() is only called in event handlers (resetDraft, handleDragEnd, etc.). */
  const [pipeline, setPipeline] = useState<PipelineBlock[]>(
    DEFAULT_PIPELINE.map((b) => ({ ...b, params: { ...b.params } }))
  );

  /* ── Queue / run state ───────────────────────────────────────────────── */
  const [queue, setQueue]              = useState<QueueItem[]>([]);
  const [isDraftView, setIsDraftView]        = useState(true);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting]       = useState(false);
  const [error, setError]              = useState("");

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

  /* ── Toast state (transient, auto-dismissing) ────────────────────────── */
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (msg: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(msg);
    toastTimerRef.current = setTimeout(() => setToast(null), 4500);
  };
  const dismissToast = () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(null);
  };

  const fileInputRef     = useRef<HTMLInputElement | null>(null);
  const viewportRef      = useRef<HTMLDivElement | null>(null);
  /* Incremented by resetDraft so any in-flight runWorkflow call can detect
     that the draft was discarded and skip updating view state. */
  const submissionGenRef = useRef(0);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  /* ── Derived values (ORDER MATTERS) ─────────────────────────────────── */
  const configBlock  = pipeline.find((b) => b.id === configBlockId) ?? null;
  const pipelineIds  = pipeline.map((b) => b.id);

  /* Headers available at the position of the currently-configured block:
     original CSV columns + any columns produced by upstream blocks. */
  const effectiveHeaders = useMemo(() => {
    if (!configBlock) return headers;
    const blockIndex = pipeline.findIndex((b) => b.id === configBlock.id);
    if (blockIndex <= 0) return headers;
    return getEffectiveHeaders(pipeline, blockIndex, headers, Object.keys(DEFAULT_ENRICH_STRUCT));
  }, [configBlock, pipeline, headers]);


  const filterBlocks       = pipeline.filter((b) => b.type === "filter");
  const hasFilterError     = filterBlocks.some((b) => !b.params.column || !b.params.value);
  const hasNoReadCsvFirst  = pipeline.length > 0 && pipeline[0].type !== "read_csv";
  /* Multiple save_csv blocks are allowed anywhere; the only rule is that
     the final block must be a save_csv so results are actually persisted. */
  const hasNoFinalSaveCsv  = pipeline.length > 0 && pipeline[pipeline.length - 1].type !== "save_csv";
  const hasComputeColError = pipeline.some((b) => {
    if (b.type !== "compute_column") return false;
    if (!b.params.column || !b.params.source_column) return true;
    const op = String(b.params.operator ?? "");
    // not_null / is_null need no value; all other ops do
    if (op === "not_null" || op === "is_null") return false;
    return !String(b.params.value ?? "").trim();
  });

  const hasNoCsv = headers.length === 0;

  const runDisabled =
    isSubmitting ||
    hasNoCsv ||
    pipeline.length === 0 ||
    hasNoReadCsvFirst ||
    hasNoFinalSaveCsv ||
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
  const blockStatus = (blockId: string) => {
    const blockIdx = displayPipeline.findIndex((b) => b.id === blockId);
    const block    = displayPipeline[blockIdx];
    if (!block || !selectedWorkflow) return "pending" as const;
    const { status, current_block } = selectedWorkflow;
    if (status === "completed")    return "done"    as const;
    if (status === "not_started")  return "pending" as const;
    const firstMatchIdx = displayPipeline.findIndex((b) => b.type === current_block);
    if (blockIdx < firstMatchIdx)  return "done"    as const;
    if (blockIdx === firstMatchIdx) return (status === "failed" ? "failed" : "active") as "failed" | "active";
    return "pending" as const;
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
      const data = await res.json() as { filename: string; path: string };
      // Wire the first read_csv block to the uploaded file path so the workflow
      // can actually read the file without the user needing to type the path manually.
      setPipeline((prev) => {
        const firstReadIdx = prev.findIndex((b) => b.type === "read_csv");
        if (firstReadIdx === -1) return prev;
        return prev.map((b, i) =>
          i === firstReadIdx ? { ...b, params: { ...b.params, path: data.path } } : b
        );
      });
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
    const gen = ++submissionGenRef.current;
    try {
      const res = await fetch(`${API_BASE}/workflows/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(workflowPayload),
      });
      /* If resetDraft was called while the fetch was in flight, bail out
         so we don't overwrite the new draft's view state. */
      if (submissionGenRef.current !== gen) return;
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
      if (submissionGenRef.current !== gen) return;
      setError(e instanceof Error ? e.message : "Failed to start workflow");
    } finally {
      if (submissionGenRef.current === gen) setIsSubmitting(false);
    }
  };

  const resetDraft = () => {
    /* Invalidate any in-flight submission so it won't switch the view
       back to a stale workflow once the fetch eventually resolves. */
    submissionGenRef.current++;
    setIsSubmitting(false);
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

  const downloadFile = async (path: string) => {
    if (!path) { showToast("No output path configured for this Save CSV block."); return; }
    try {
      const res = await fetch(`${API_BASE}/files/download?path=${encodeURIComponent(path)}`);
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = path.split(/[\\/]/).pop() ?? "output.csv";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    } catch (e) {
      showToast(`Download failed — ${e instanceof Error ? e.message : "unknown error"}`);
    }
  };

  const openQueueItem = (item: QueueItem) => {
    /* Auto-save the current draft whenever navigating away from it. */
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
      /* Add the saved draft and, if the target itself is a not_started draft,
         remove it from the queue in the same update (it's being loaded). */
      setQueue((prev) => [
        savedItem,
        ...prev.filter((q) => item.status === "not_started" ? q.local_id !== item.local_id : true),
      ]);
    } else if (item.status === "not_started") {
      /* Not in draft view — just pluck the clicked draft out of the queue. */
      setQueue((prev) => prev.filter((q) => q.local_id !== item.local_id));
    }

    if (item.status === "not_started") {
      /* Restore the saved draft into the editor so the user can continue editing. */
      setPipeline(item.pipeline_snapshot.map((b) => ({ ...b, params: { ...b.params } })));
      setFileName(item.csv_file_name !== "unsaved-draft.csv" ? item.csv_file_name : "");
      setHeaders(item.csv_headers);
      setRows([]);
      setIsDraftView(true);
      setSelectedWorkflowId(null);
      setPreviewData(null);
      setConfigBlockId(null);
      setPan({ x: 32, y: 0 });
    } else {
      setSelectedWorkflowId(item.workflow_id);
      setIsDraftView(false);
      void fetchPreview(item.workflow_id);
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

      /* closestCenter always returns the nearest droppable regardless of actual
         distance, so we can't trust `over` to indicate "inside the canvas".
         Reconstruct the final pointer position (activator position + total delta)
         and bail out if the pointer was released outside the canvas viewport. */
      const ae = event.activatorEvent;
      const isPointer = ae instanceof PointerEvent || ae instanceof MouseEvent;
      const finalX = isPointer ? (ae as PointerEvent).clientX + event.delta.x : null;
      const finalY = isPointer ? (ae as PointerEvent).clientY + event.delta.y : null;

      const vp = viewportRef.current;
      if (vp && finalX !== null && finalY !== null) {
        const canvasRect = vp.getBoundingClientRect();
        if (
          finalX < canvasRect.left || finalX > canvasRect.right ||
          finalY < canvasRect.top  || finalY > canvasRect.bottom
        ) return; // released outside canvas — discard
      }

      const type = active.data.current?.type as BlockType;
      const newBlock: PipelineBlock = { id: makeId(), type, params: { ...DEFAULT_PARAMS[type] } };

      if (over) {
        const overIdx = pipeline.findIndex((b) => b.id === over.id);
        if (overIdx >= 0) {
          /* Insert before or after the hovered block based on which horizontal
             half the pointer is in — left half → before, right half → after. */
          const overCenterX = over.rect.left + over.rect.width / 2;
          const insertIdx = (finalX !== null && finalX < overCenterX) ? overIdx : overIdx + 1;
          setPipeline((prev) => {
            const before = prev[insertIdx - 1];
            const after  = prev[insertIdx];
            if ((before && before.type === type) || (after && after.type === type)) return prev;
            return [...prev.slice(0, insertIdx), newBlock, ...prev.slice(insertIdx)];
          });
        } else {
          setPipeline((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.type === type) return prev;
            return [...prev, newBlock];
          });
        }
      } else {
        /* over is null only when pipeline is empty (no droppables) — append. */
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
        setPipeline((prev) => {
          const next = arrayMove(prev, oldIdx, newIdx);
          for (let i = 1; i < next.length; i++) {
            if (next[i].type === next[i - 1].type) return prev;
          }
          return next;
        });
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
                {isDraftView && hasNoCsv && (
                  <div className="mb-3 rounded-lg border border-amber-500/20 bg-amber-500/[0.08] px-3 py-2 text-[11px] text-amber-300">
                    Drop a CSV file before running.
                  </div>
                )}
                {isDraftView && hasNoReadCsvFirst && (
                  <div className="mb-3 rounded-lg border border-amber-500/20 bg-amber-500/[0.08] px-3 py-2 text-[11px] text-amber-300">
                    First block must be <strong>Read CSV</strong>.
                  </div>
                )}
                {isDraftView && hasNoFinalSaveCsv && (
                  <div className="mb-3 rounded-lg border border-amber-500/20 bg-amber-500/[0.08] px-3 py-2 text-[11px] text-amber-300">
                    Last block must be <strong>Save CSV</strong>.
                  </div>
                )}
                {isDraftView && hasFilterError && (
                  <div className="mb-3 rounded-lg border border-amber-500/20 bg-amber-500/[0.08] px-3 py-2 text-[11px] text-amber-300">
                    Configure filter — set column and value.
                  </div>
                )}
                {isDraftView && hasComputeColError && (
                  <div className="mb-3 rounded-lg border border-amber-500/20 bg-amber-500/[0.08] px-3 py-2 text-[11px] text-amber-300">
                    Compute Column needs a name, source column, and a value (not required for "is not empty" / "is empty").
                  </div>
                )}
                {isDraftView && error && (
                  <div className="mb-3 rounded-lg border border-rose-500/20 bg-rose-500/[0.08] px-3 py-2 text-[11px] text-rose-300">
                    {error}
                  </div>
                )}
                {isDraftView ? (
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
                ) : (() => {
                  const st = selectedWorkflow?.status;
                  const isActive = st === "pending" || st === "running";
                  return (
                    <div className={`flex w-full select-none items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold ${
                      isActive           ? "bg-sky-950/70 text-sky-400"          :
                      st === "completed" ? "bg-emerald-950/70 text-emerald-400"  :
                      st === "failed"    ? "bg-rose-950/70 text-rose-400"        :
                      "bg-white/[0.05] text-slate-500"
                    }`}>
                      {isActive           && <IcLoader />}
                      {st === "completed" && <IcCheck />}
                      {st === "failed"    && <IcX />}
                      <span>
                        {isActive          ? "Running…"  :
                         st === "completed" ? "Finished"  :
                         st === "failed"    ? "Failed"    :
                         "View Only"}
                      </span>
                    </div>
                  );
                })()}
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
                            onDownload={() => downloadFile(String(block.params.path ?? ""))}
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
          {(previewData || previewLoading || selectedWorkflow) && (
            <LiveDataPreview
              previewData={previewData}
              previewLoading={previewLoading}
              selectedWorkflow={selectedWorkflow}
              headers={headers}
              rows={rows}
              previewExpanded={previewExpanded}
              onToggleExpanded={() => setPreviewExpanded((v) => !v)}
            />
          )}

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
                {queue.map((item) => (
                  <QueueCard
                    key={item.local_id}
                    item={item}
                    isSelected={item.workflow_id === selectedWorkflowId}
                    onOpen={() => openQueueItem(item)}
                    onDelete={() => deleteQueueItem(item.local_id)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        <DragOverlay>
          {activeDragId && activeDragType && <DragOverlayCard type={activeDragType} />}
        </DragOverlay>
      </DndContext>

      {/* ── Config panel ─────────────────────────────────────────────────── */}
      <ConfigPanel
        configBlock={configBlock}
        configBlockId={configBlockId}
        headers={effectiveHeaders}
        onClose={() => setConfigBlockId(null)}
        onUpdateBlock={updateBlock}
      />

      {/* ── Download error toast ─────────────────────────────────────────── */}
      {toast && (
        <div
          role="alert"
          className="fixed bottom-6 right-6 z-[70] flex items-center gap-3 rounded-xl border border-rose-500/25 bg-[#1c0b10] px-4 py-3.5 shadow-2xl shadow-black/60"
        >
          <span className="h-2 w-2 flex-shrink-0 rounded-full bg-rose-400" />
          <p className="max-w-[280px] text-[13px] text-rose-300">{toast}</p>
          <button
            type="button"
            onClick={dismissToast}
            aria-label="Dismiss"
            className="ml-1 flex-shrink-0 text-rose-700 transition-colors hover:text-rose-300"
          >
            <IcX />
          </button>
        </div>
      )}
    </main>
  );
}
