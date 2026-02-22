import type { BlockType, BlockMeta, PipelineBlock, ExtraStructField } from "./types";
import { IcTable, IcFunnel, IcSparkles, IcMail, IcDownload, IcFormula } from "./icons";

export const API_BASE = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000"
).replace(/\/$/, "");

export const DEFAULT_CSV_PATH = "_smoke_input.csv";
export const DEFAULT_SAVE_PATH = "workflow_output.csv";

export const makeId = () => crypto.randomUUID();

export const DEFAULT_ENRICH_STRUCT: Record<string, string> = {
  name:     "The individual's full name",
  email:    "The individual's email address",
  phone:    "The individual's phone number",
  company:  "The company the individual is associated with",
  title:    "The individual's job title",
  linkedin: "LinkedIn URL for the person",
  website:  "Company website URL",
  location: "The individual's location",
};

export const DEFAULT_PARAMS: Record<BlockType, Record<string, unknown>> = {
  read_csv:       { path: DEFAULT_CSV_PATH },
  filter:         { column: "", operator: "contains", value: "" },
  enrich_lead:    { research_plan: "", extra_struct_fields: [] as ExtraStructField[] },
  find_email:     { mode: "PROFESSIONAL" },
  save_csv:       { path: DEFAULT_SAVE_PATH },
  compute_column: { column: "", source_column: "", operator: "contains", value: "" },
};

export const DEFAULT_PIPELINE: PipelineBlock[] = [
  { id: "dp-1", type: "read_csv",    params: { path: DEFAULT_CSV_PATH } },
  { id: "dp-2", type: "filter",      params: { column: "", operator: "contains", value: "" } },
  { id: "dp-3", type: "enrich_lead", params: { research_plan: "", extra_struct_fields: [] as ExtraStructField[] } },
  { id: "dp-4", type: "find_email",  params: { mode: "PROFESSIONAL" } },
  { id: "dp-5", type: "save_csv",    params: { path: DEFAULT_SAVE_PATH } },
];

export const LIBRARY_BLOCKS: BlockType[] = [
  "read_csv", "filter", "enrich_lead", "find_email", "save_csv", "compute_column",
];

export const BLOCK_META: Record<BlockType, BlockMeta> = {
  read_csv:       { label: "Read CSV",       sub: "Load data source",   color: "#10b981", glow: "rgba(16,185,129,0.35)",  icon: <IcTable /> },
  filter:         { label: "Filter",         sub: "Apply conditions",   color: "#f59e0b", glow: "rgba(245,158,11,0.35)",  icon: <IcFunnel /> },
  enrich_lead:    { label: "Enrich Lead",    sub: "AI data enrichment", color: "#a78bfa", glow: "rgba(167,139,250,0.35)", icon: <IcSparkles /> },
  find_email:     { label: "Find Email",     sub: "Email discovery",    color: "#38bdf8", glow: "rgba(56,189,248,0.35)",  icon: <IcMail /> },
  save_csv:       { label: "Save CSV",       sub: "Export results",     color: "#fb7185", glow: "rgba(251,113,133,0.35)", icon: <IcDownload /> },
  compute_column: { label: "Compute Column", sub: "Derive new values",  color: "#f97316", glow: "rgba(249,115,22,0.35)",  icon: <IcFormula /> },
};
