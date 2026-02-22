import type { PipelineBlock, ExtraStructField } from "./types";

/**
 * Returns the full set of column headers available at `blockIndex` in the
 * pipeline, i.e. the original CSV headers plus any columns that upstream
 * blocks (enrich_lead, find_email, compute_column) are known to produce.
 */
export function getEffectiveHeaders(
  pipeline: PipelineBlock[],
  blockIndex: number,
  originalHeaders: string[],
  enrichDefaultKeys: string[],
): string[] {
  const seen = new Set<string>(originalHeaders);
  const result = [...originalHeaders];

  const add = (key: string) => {
    if (key && !seen.has(key)) { seen.add(key); result.push(key); }
  };

  for (let i = 0; i < blockIndex; i++) {
    const block = pipeline[i];

    if (block.type === "enrich_lead") {
      for (const key of enrichDefaultKeys) add(key);
      add("enrich_confidence_score");
      const extras = (block.params.extra_struct_fields ?? []) as ExtraStructField[];
      for (const f of extras) add(f.key.trim());

    } else if (block.type === "find_email") {
      add("email");
      add("personal_email");

    } else if (block.type === "compute_column") {
      add(String(block.params.column ?? "").trim());
    }
  }

  return result;
}

export function parseCsv(raw: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return { headers: [], rows: [] };

  const splitLine = (line: string) => {
    const out: string[] = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = !inQ;
      } else if (c === "," && !inQ) {
        out.push(cur); cur = "";
      } else {
        cur += c;
      }
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
