"use client";

import { NodeProps, useReactFlow } from "@xyflow/react";
import { ShieldCheck, Star, RefreshCw } from "lucide-react";
import BaseNodeV3 from "./BaseNodeV3";

interface CriticData {
  score?: number;
  notes?: string;
  status?: string;
  imageUrl?: string;
  brief?: string;
  clientId?: string;
  postId?: string;
  slideId?: string;
}

export default function CriticNode({ id, data, selected }: NodeProps) {
  const d = data as CriticData;
  const { updateNodeData } = useReactFlow();
  const hasResult = d.score !== undefined;

  const scoreColor =
    d.score === undefined ? "#94a3b8" :
    d.score >= 8  ? "#34d399" :
    d.score >= 6  ? "#f59e0b" :
    "#f87171";

  async function evaluate() {
    if (!d.imageUrl || !d.brief) return;
    updateNodeData(id, { status: "loading" });
    try {
      const res = await fetch("/api/generate/critic", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          imageUrl:  d.imageUrl,
          brief:     d.brief,
          clientId:  d.clientId,
          postId:    d.postId,
          slideId:   d.slideId,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erro na crítica");
      updateNodeData(id, { score: json.score, notes: json.notes, status: "done" });
    } catch {
      updateNodeData(id, { status: "error" });
    }
  }

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
        <div className="space-y-2">
          <p className="text-xs text-slate-500 text-center py-1">
            {d.status === "loading" ? "Avaliando com GPT-4o…" : "Aguardando imagem gerada"}
          </p>
          {d.imageUrl && d.brief && d.status !== "loading" && (
            <button
              onClick={evaluate}
              className="w-full flex items-center justify-center gap-1.5 bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/30 rounded-lg py-1.5 text-xs font-medium text-orange-400 transition-colors"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              Avaliar Imagem
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Star className="w-4 h-4" style={{ color: scoreColor }} />
              <span className="text-lg font-bold" style={{ color: scoreColor }}>
                {d.score}/10
              </span>
            </div>
            <button
              onClick={evaluate}
              disabled={!d.imageUrl || !d.brief || d.status === "loading"}
              className="text-slate-500 hover:text-orange-400 transition-colors disabled:opacity-30"
              title="Re-avaliar"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>

          {d.notes && (
            <p className="text-xs text-slate-400 leading-relaxed">{d.notes}</p>
          )}

          {d.score !== undefined && d.score < 7 && (
            <div className="bg-amber-500/10 rounded-lg px-2.5 py-1.5">
              <p className="text-xs text-amber-400">Score &lt; 7 — regeneração recomendada</p>
            </div>
          )}
        </div>
      )}
    </BaseNodeV3>
  );
}
