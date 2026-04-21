"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

type PlanoDePost = {
  pilar?: string;
  tema?: string;
  objetivo?: string;
  publico?: string;
  dor?: string;
  desejo?: string;
  estrategia?: string;
  gancho?: string;
  [key: string]: unknown;
};

const FIELD_LABELS: [keyof PlanoDePost, string][] = [
  ["pilar",      "Pilar"],
  ["tema",       "Tema"],
  ["objetivo",   "Objetivo"],
  ["publico",    "Público"],
  ["dor",        "Dor"],
  ["desejo",     "Desejo"],
  ["estrategia", "Estratégia"],
  ["gancho",     "Gancho"],
];

export function PlanOutput({ output }: { output: Record<string, unknown> }) {
  const [expanded, setExpanded] = useState(false);
  const plan = output.plan as PlanoDePost | undefined;
  if (!plan) return null;

  const pairs = FIELD_LABELS.map(([k, l]) => [l, plan[k]] as [string, unknown])
    .filter(([, v]) => v && typeof v === "string");

  const visible = expanded ? pairs : pairs.slice(0, 3);

  return (
    <div className="space-y-1 text-[11px]">
      {visible.map(([label, value]) => (
        <div key={label} className="flex gap-1.5">
          <span className="text-pi-text-muted/60 flex-none w-16">{label}</span>
          <span className="text-pi-text/80 flex-1 leading-relaxed line-clamp-2">{value as string}</span>
        </div>
      ))}
      {pairs.length > 3 && (
        <button
          onClick={() => setExpanded(v => !v)}
          className="flex items-center gap-1 text-pi-text-muted/60 hover:text-pi-text-muted transition-colors"
        >
          {expanded
            ? <><ChevronUp className="w-3 h-3" /> menos</>
            : <><ChevronDown className="w-3 h-3" /> +{pairs.length - 3} campos</>}
        </button>
      )}
    </div>
  );
}
