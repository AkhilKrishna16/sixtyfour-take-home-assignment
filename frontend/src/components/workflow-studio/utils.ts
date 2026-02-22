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
