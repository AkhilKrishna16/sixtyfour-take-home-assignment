import { useState } from "react";
import type { PreviewData, QueueItem } from "./types";
import { IcLoader, IcChevronRight } from "./icons";

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

export function LiveDataPreview({
  previewData,
  previewLoading,
  selectedWorkflow,
  headers,
  rows,
  previewExpanded,
  onToggleExpanded,
}: {
  previewData: PreviewData | null;
  previewLoading: boolean;
  selectedWorkflow: QueueItem | null;
  headers: string[];
  rows: Record<string, string>[];
  previewExpanded: boolean;
  onToggleExpanded: () => void;
}) {
  const displayCols = previewData?.columns ?? (selectedWorkflow?.csv_headers ?? headers);
  const displayRows = previewData
    ? previewData.rows
    : (rows.slice(0, 8) as Record<string, unknown>[]);

  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] overflow-hidden">
      <button
        type="button"
        onClick={onToggleExpanded}
        className="flex w-full items-center justify-between px-5 py-3 hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">
            Live Data Preview
          </p>
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
}
