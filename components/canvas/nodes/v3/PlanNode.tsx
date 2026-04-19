"use client";

import { NodeProps, useReactFlow } from "@xyflow/react";
import { Brain, ChevronDown, ChevronUp, RefreshCw } from "lucide-react";
import { useState } from "react";
import BaseNodeV3 from "./BaseNodeV3";
import type { PlanoDePost } from "@/types";

interface PlanData {
  plan?: PlanoDePost;
  status?: string;
  clientId?: string;
  objetivo?: string;
  formato?: string;
  clientName?: string;
  postId?: string;
}

export default function PlanNode({ id, data, selected }: NodeProps) {
  const d = data as PlanData;
  const { updateNodeData } = useReactFlow();
  const [expanded, setExpanded] = useState(false);

  async function generate() {
    if (!d.clientId || !d.objetivo) return;
    updateNodeData(id, { status: "loading" });
    try {
      const res = await fetch("/api/director/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId:   d.clientId,
          objetivo:   d.objetivo,
          formato:    d.formato ?? "feed",
          clientName: d.clientName,
          postId:     d.postId,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erro ao gerar plano");
      updateNodeData(id, { plan: json.plan, status: "done" });
      setExpanded(true);
    } catch (err) {
      updateNodeData(id, { status: "error" });
      console.error(err);
    }
  }

  return (
    <BaseNodeV3
      label="Plano"
      icon={<Brain className="w-3.5 h-3.5" />}
      accentColor="#a78bfa"
      status={d.status === "loading" ? "loading" : d.plan ? "done" : "idle"}
      selected={selected}
      width={320}
    >
      {!d.plan ? (
        <div className="space-y-2">
          {(!d.clientId || !d.objetivo) ? (
            <p className="text-xs text-slate-500 text-center py-3">
              Conecte um BriefingNode com clientId e objetivo preenchidos
            </p>
          ) : (
            <>
              <p className="text-xs text-slate-400 text-center">
                {d.status === "loading" ? "IA planejando…" : "Pronto para planejar"}
              </p>
              <button
                onClick={generate}
                disabled={d.status === "loading"}
                className="w-full flex items-center justify-center gap-1.5 bg-violet-500/10 hover:bg-violet-500/20 border border-violet-500/30 rounded-lg py-1.5 text-xs font-medium text-violet-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Brain className="w-3.5 h-3.5" />
                Gerar Plano
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-slate-300 font-medium line-clamp-2">{d.plan.bigIdea}</p>

          <div className="flex flex-wrap gap-1">
            {(d.plan.tomVoz ?? []).map(t => (
              <span key={t} className="text-xs bg-violet-500/10 text-violet-400 rounded-md px-1.5 py-0.5">{t}</span>
            ))}
          </div>

          <div className="flex items-center justify-between">
            <button
              onClick={() => setExpanded(v => !v)}
              className="flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300"
            >
              {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              {d.plan.slidesBriefing?.length ?? 0} slides
            </button>
            <button
              onClick={generate}
              disabled={d.status === "loading"}
              className="flex items-center gap-1 text-xs text-slate-500 hover:text-violet-400 transition-colors disabled:opacity-40"
              title="Regenerar plano"
            >
              <RefreshCw className="w-3 h-3" />
            </button>
          </div>

          {expanded && (
            <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
              {(d.plan.slidesBriefing ?? []).map(s => (
                <div key={s.n} className="bg-slate-800/60 rounded-lg px-2.5 py-2">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-xs font-medium text-violet-400">Slide {s.n}</span>
                    <span className="text-xs text-slate-600 capitalize">{s.intencao}</span>
                  </div>
                  <p className="text-xs text-slate-300 leading-snug line-clamp-2">{s.copy}</p>
                  {s.visual && (
                    <p className="text-xs text-slate-600 mt-0.5 line-clamp-1 italic">{s.visual}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </BaseNodeV3>
  );
}
