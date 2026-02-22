import type { PipelineBlock, ExtraStructField } from "./types";
import { BLOCK_META, DEFAULT_ENRICH_STRUCT } from "./constants";
import { IcX, IcPlus } from "./icons";

export function ConfigPanel({
  configBlock,
  configBlockId,
  headers,
  onClose,
  onUpdateBlock,
}: {
  configBlock: PipelineBlock | null;
  configBlockId: string | null;
  headers: string[];
  onClose: () => void;
  onUpdateBlock: (id: string, partialParams: Record<string, unknown>) => void;
}) {
  return (
    <>
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close config"
        className={`pointer-events-none fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity ${
          configBlockId ? "pointer-events-auto opacity-100" : "opacity-0"
        }`}
        onClick={onClose}
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
                  <div
                    className="flex h-8 w-8 items-center justify-center rounded-xl"
                    style={{ backgroundColor: `${meta.color}18`, color: meta.color }}
                  >
                    {meta.icon}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-100">{meta.label}</p>
                    <p className="text-[10px] text-slate-600">Configure block parameters</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
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
                      onChange={(e) => onUpdateBlock(configBlock.id, { path: e.target.value })}
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
                        onChange={(e) => onUpdateBlock(configBlock.id, { column: e.target.value })}
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
                        onChange={(e) => onUpdateBlock(configBlock.id, { operator: e.target.value })}
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
                        onChange={(e) => onUpdateBlock(configBlock.id, { value: e.target.value })}
                        placeholder="e.g. Ariglad Inc"
                      />
                    </label>
                    {configBlock.params.column && configBlock.params.value && (() => {
                      const col = String(configBlock.params.column);
                      const op  = String(configBlock.params.operator ?? "contains");
                      const val = String(configBlock.params.value);
                      const colSpan = <span className="text-violet-300">&apos;{col}&apos;</span>;
                      const valSpan = <span className="text-emerald-300">&apos;{val}&apos;</span>;
                      const numSpan = <span className="text-emerald-300">{val}</span>;
                      return (
                        <div className="rounded-xl border border-violet-500/20 bg-violet-500/[0.06] px-3 py-2.5 text-xs text-slate-400 font-mono">
                          {op === "equals"   && <>df[df[{colSpan}] == {valSpan}]</>}
                          {op === "gt"       && <>df[pd.to_numeric(df[{colSpan}]) &gt; {numSpan}]</>}
                          {op === "lt"       && <>df[pd.to_numeric(df[{colSpan}]) &lt; {numSpan}]</>}
                          {op === "contains" && <>df[df[{colSpan}].str.contains({valSpan})]</>}
                        </div>
                      );
                    })()}
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
                          onChange={(e) => onUpdateBlock(configBlock.id, { research_plan: e.target.value })}
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
                              onUpdateBlock(configBlock.id, { extra_struct_fields: updated });
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
                                      onUpdateBlock(configBlock.id, { extra_struct_fields: updated });
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
                                      onUpdateBlock(configBlock.id, { extra_struct_fields: updated });
                                    }}
                                  />
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const updated = extraFields.filter((_, i) => i !== idx);
                                    onUpdateBlock(configBlock.id, { extra_struct_fields: updated });
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
                      onChange={(e) => onUpdateBlock(configBlock.id, { mode: e.target.value })}
                    >
                      <option value="PROFESSIONAL" className="bg-[#0f0f1a]">PROFESSIONAL</option>
                      <option value="PERSONAL"     className="bg-[#0f0f1a]">PERSONAL</option>
                    </select>
                    <p className="mt-1.5 text-[10px] text-slate-600">
                      PROFESSIONAL searches work email · PERSONAL searches personal email.
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
                      onChange={(e) => onUpdateBlock(configBlock.id, { path: e.target.value })}
                      placeholder="path/to/output.csv"
                    />
                    <p className="mt-1.5 text-[10px] text-slate-600">The enriched CSV will be saved here.</p>
                  </label>
                )}

                {/* ── compute_column ── */}
                {configBlock.type === "compute_column" && (() => {
                  const op        = String(configBlock.params.operator ?? "contains");
                  const noValueOp = op === "not_null" || op === "is_null";
                  return (
                    <>
                      <label className="block text-xs font-medium text-slate-400">
                        New Column Name
                        <input
                          className="mt-1.5 w-full rounded-xl border border-white/[0.08] bg-white/[0.05] px-3 py-2 text-sm text-slate-200 placeholder-slate-700 focus:border-violet-500/50 focus:outline-none"
                          value={String(configBlock.params.column ?? "")}
                          onChange={(e) => onUpdateBlock(configBlock.id, { column: e.target.value })}
                          placeholder="e.g. is_american_education"
                        />
                      </label>
                      <label className="block text-xs font-medium text-slate-400">
                        Source Column
                        <select
                          className="mt-1.5 w-full rounded-xl border border-white/[0.08] bg-white/[0.05] px-3 py-2 text-sm text-slate-200 transition-colors focus:border-violet-500/50 focus:outline-none"
                          value={String(configBlock.params.source_column ?? "")}
                          onChange={(e) => onUpdateBlock(configBlock.id, { source_column: e.target.value })}
                        >
                          <option value="" className="bg-[#0f0f1a]">— select column —</option>
                          {(headers.length ? headers : ["name", "email", "company", "linkedin"]).map((h) => (
                            <option key={h} value={h} className="bg-[#0f0f1a]">{h}</option>
                          ))}
                        </select>
                      </label>
                      <label className="block text-xs font-medium text-slate-400">
                        Operator
                        <select
                          className="mt-1.5 w-full rounded-xl border border-white/[0.08] bg-white/[0.05] px-3 py-2 text-sm text-slate-200 transition-colors focus:border-violet-500/50 focus:outline-none"
                          value={op}
                          onChange={(e) => onUpdateBlock(configBlock.id, { operator: e.target.value })}
                        >
                          <option value="contains"     className="bg-[#0f0f1a]">contains</option>
                          <option value="not_contains" className="bg-[#0f0f1a]">does not contain</option>
                          <option value="equals"       className="bg-[#0f0f1a]">equals</option>
                          <option value="not_equals"   className="bg-[#0f0f1a]">not equals</option>
                          <option value="gt"           className="bg-[#0f0f1a]">greater than</option>
                          <option value="lt"           className="bg-[#0f0f1a]">less than</option>
                          <option value="not_null"     className="bg-[#0f0f1a]">is not empty</option>
                          <option value="is_null"      className="bg-[#0f0f1a]">is empty</option>
                        </select>
                      </label>
                      {!noValueOp && (
                        <label className="block text-xs font-medium text-slate-400">
                          Value
                          <input
                            className="mt-1.5 w-full rounded-xl border border-white/[0.08] bg-white/[0.05] px-3 py-2 text-sm text-slate-200 placeholder-slate-700 focus:border-violet-500/50 focus:outline-none"
                            value={String(configBlock.params.value ?? "")}
                            onChange={(e) => onUpdateBlock(configBlock.id, { value: e.target.value })}
                            placeholder="e.g. United States"
                          />
                        </label>
                      )}
                      {configBlock.params.column && configBlock.params.source_column && (
                        <div className="rounded-xl border border-orange-500/20 bg-orange-500/[0.06] px-3 py-2.5 text-xs text-slate-400 font-mono">
                          df[<span className="text-orange-300">&apos;{String(configBlock.params.column)}&apos;</span>]
                          {" = "}
                          {noValueOp
                            ? <>df[<span className="text-violet-300">&apos;{String(configBlock.params.source_column)}&apos;</span>].{op === "not_null" ? "notna()" : "isna()"}</>
                            : (op === "gt" || op === "lt")
                              ? <>pd.to_numeric(df[<span className="text-violet-300">&apos;{String(configBlock.params.source_column)}&apos;</span>]) {op === "gt" ? ">" : "<"} <span className="text-emerald-300">{String(configBlock.params.value ?? "")}</span></>
                              : (op === "contains" || op === "not_contains")
                                ? <>{op === "not_contains" ? "~" : ""}df[<span className="text-violet-300">&apos;{String(configBlock.params.source_column)}&apos;</span>].str.contains(<span className="text-emerald-300">&apos;{String(configBlock.params.value ?? "")}&apos;</span>)</>
                                : <>df[<span className="text-violet-300">&apos;{String(configBlock.params.source_column)}&apos;</span>] {op === "not_equals" ? "!=" : "=="} <span className="text-emerald-300">&apos;{String(configBlock.params.value ?? "")}&apos;</span></>
                          }
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>

              <div className="border-t border-white/[0.07] p-5">
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-500/20 hover:brightness-110 transition-all"
                >
                  Save &amp; Close
                </button>
              </div>
            </>
          );
        })()}
      </aside>
    </>
  );
}
