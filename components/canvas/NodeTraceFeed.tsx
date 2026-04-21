"use client";

import { useEffect, useRef, useState } from "react";
import { useCanvasStore } from "@/lib/canvas/store";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PhaseId, TraceLevel } from "@/types";

const LEVEL_DOT: Record<TraceLevel, string> = {
  info:  "bg-violet-400",
  warn:  "bg-amber-400",
  error: "bg-red-500",
};

const CODE_LABEL: Record<string, string> = {
  "start":              "▶ start",
  "done":               "✓ done",
  "error":              "✕ error",
  "llm.call":           "🧠 llm",
  "llm.response":       "⬅ resp",
  "llm.parse":          "⚙ parse",
  "replicate.predict":  "🎨 predict",
  "replicate.status":   "⏳ status",
  "replicate.output":   "🖼 output",
  "r2.upload":          "☁ upload",
  "compile.start":      "⚙ compile",
  "compile.done":       "✓ compile",
};

function formatTs(ts: number, baseTs?: number): string {
  if (baseTs !== undefined) {
    const delta = ts - baseTs;
    return `+${(delta / 1000).toFixed(2)}s`;
  }
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}.${String(d.getMilliseconds()).padStart(3, "0")}`;
}

interface NodeTraceFeedProps {
  phaseId:    PhaseId;
  slideN?:    number;
  maxVisible?: number;
}

export function NodeTraceFeed({ phaseId, slideN, maxVisible = 5 }: NodeTraceFeedProps) {
  const allTraces = useCanvasStore(s => s.traces);
  const [expanded, setExpanded] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const entries = allTraces.filter(
    t => t.phaseId === phaseId && (slideN === undefined || t.slideN === slideN || t.slideN === undefined),
  );

  useEffect(() => {
    if (expanded) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries.length, expanded]);

  if (entries.length === 0) return null;

  const baseTs = entries[0]?.ts;
  const visible = expanded ? entries : entries.slice(-maxVisible);

  return (
    <div className="mt-2 rounded-lg bg-pi-surface-muted/50 border border-pi-border/40 overflow-hidden text-[10px] font-mono">
      {/* Toggle header */}
      <button
        className="w-full flex items-center justify-between px-2 py-1 hover:bg-pi-surface-muted/70 transition-colors"
        onClick={() => setExpanded(v => !v)}
      >
        <span className="text-pi-text-muted">{entries.length} eventos</span>
        {expanded
          ? <ChevronUp className="w-3 h-3 text-pi-text-muted" />
          : <ChevronDown className="w-3 h-3 text-pi-text-muted" />
        }
      </button>

      {/* Entries */}
      <div className={cn("divide-y divide-pi-border/20", expanded ? "max-h-52 overflow-y-auto" : "")}>
        {!expanded && entries.length > maxVisible && (
          <div className="px-2 py-0.5 text-pi-text-muted/50 text-center">
            ↑ {entries.length - maxVisible} mais
          </div>
        )}
        {visible.map((entry, i) => (
          <div key={i} className="flex items-start gap-1.5 px-2 py-1">
            <div className={cn("w-1.5 h-1.5 rounded-full flex-none mt-0.5", LEVEL_DOT[entry.level])} />
            <span className="text-pi-text-muted/50 flex-none w-14 truncate">
              {formatTs(entry.ts, baseTs)}
            </span>
            <span className="text-violet-300 flex-none w-20 truncate">
              {CODE_LABEL[entry.code] ?? entry.code}
            </span>
            <span className="text-pi-text/80 flex-1 truncate" title={entry.message}>
              {entry.message}
            </span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
