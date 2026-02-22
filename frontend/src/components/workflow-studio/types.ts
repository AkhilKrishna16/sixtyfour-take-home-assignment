import type { ReactNode } from "react";

export type BlockType =
  | "read_csv"
  | "filter"
  | "enrich_lead"
  | "find_email"
  | "save_csv"
  | "compute_column";

export type BlockStatus = "pending" | "active" | "done" | "failed";

export type PipelineBlock = {
  id: string;
  type: BlockType;
  params: Record<string, unknown>;
};

export type QueueItem = {
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

export type PreviewData = { columns: string[]; rows: Record<string, unknown>[] };

export type ExtraStructField = { key: string; description: string };

export type WorkflowStatusPayload = {
  workflow_id: string;
  status: string;
  current_block: string | null;
  progress_percentage: number;
  rows_processed: number;
  total_rows: number;
  error_message: string | null;
  output_path: string | null;
};

export type BlockMeta = {
  label: string;
  sub: string;
  color: string;
  glow: string;
  icon: ReactNode;
};
