export function StatusBadge({ status }: { status: string }) {
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
