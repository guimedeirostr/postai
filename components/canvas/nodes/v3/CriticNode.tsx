"use client";

import { NodeProps } from "@xyflow/react";
import { ShieldCheck, Star } from "lucide-react";
import BaseNodeV3 from "./BaseNodeV3";

interface CriticData {
  score?: number;
  notes?: string;
  status?: string;
}

export default function CriticNode({ data, selected }: NodeProps) {
  const d = data as CriticData;
  const hasResult = d.score !== undefined;

  const scoreColor =
    d.score === undefined ? "#94a3b8" :
    d.score >= 8 ? "#34d399" :
    d.score >= 6 ? "#f59e0b" :
    "#f87171";

  return (
    <BaseNodeV3
      label="Crítico"
      icon={<ShieldCheck className="w-3.5 h-3.5" />}
      accentColor="#fb923c"
      status={d.status === "loading" ? "loading" : hasResult ? "done" : "idle"}
      selected={selected}
      width={240}
    >
      {!hasResult ? (
        <p className="text-xs text-slate-500 text-center py-2">
          {d.status === "loading" ? "Avaliando…" : "Aguardando imagem"}
        </p>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Star className="w-4 h-4" style={{ color: scoreColor }} />
            <span className="text-lg font-bold" style={{ color: scoreColor }}>
              {d.score}/10
            </span>
          </div>
          {d.notes && (
            <p className="text-xs text-slate-400 leading-relaxed">{d.notes}</p>
          )}
          {d.score !== undefined && d.score < 7 && (
            <div className="flex items-center gap-1.5 bg-amber-500/10 rounded-lg px-2.5 py-1.5">
              <span className="text-xs text-amber-400">Abaixo do limiar — reagendando geração</span>
            </div>
          )}
        </div>
      )}
    </BaseNodeV3>
  );
}
