"use client";

import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type { BlockType } from "./types";
import { BLOCK_META } from "./constants";
import { IcGrip } from "./icons";

export function LibraryBlockTile({
  type,
  disabled,
}: {
  type: BlockType;
  disabled?: boolean;
}) {
  const meta = BLOCK_META[type];
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `lib::${type}`,
    data: { source: "library", type },
    disabled,
  });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...(disabled ? {} : listeners)}
      style={{
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.35 : disabled ? 0.38 : 1,
      }}
      className={`flex items-center gap-2.5 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 transition-all select-none ${
        disabled
          ? "cursor-not-allowed"
          : "cursor-grab active:cursor-grabbing hover:border-white/15 hover:bg-white/[0.07]"
      }`}
    >
      <div
        className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg"
        style={{ backgroundColor: `${meta.color}20`, color: disabled ? "#475569" : meta.color }}
      >
        {meta.icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-xs font-medium leading-tight ${disabled ? "text-slate-600" : "text-slate-200"}`}>
          {meta.label}
        </p>
        <p className="text-[10px] text-slate-600 truncate">{meta.sub}</p>
      </div>
      <span className="text-slate-700 flex-shrink-0">
        <IcGrip />
      </span>
    </div>
  );
}
