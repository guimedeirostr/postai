"use client";

import { NodeProps, useReactFlow } from "@xyflow/react";
import { Brain, ChevronDown, ChevronUp } from "lucide-react";
import { useState, useEffect } from "react";
import BaseNodeV3 from "./BaseNodeV3";
import { InlineRunButton } from "./InlineRunButton";
import { useCanvasStore, canRun } from "@/lib/canvas/store";
import { hashInput } from "@/lib/canvas/staleness";
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
  const { phases, setStatus, setOutput, setInputHash, markStaleDownstream, approve, runId } = useCanvasStore();
  const phaseStatus = phases.plano.status;
  const isRunnable = canRun(phases, 'plano');

  async function run(triggeredBy: 'step' | 'run-to-here' | 'regenerate' = 'step') {
    if (!d.clientId || !d.objetivo) return;
    const input = { clientId: d.clientId, objetivo: d.objetivo, formato: d.formato ?? 'feed' };
    setStatus('plano', 'running');
    setInputHash('plano', hashInput(input));
    try {
      const res = await fetch("/api/canvas/phase/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: d.clientId, phaseId: 'plano', input, triggeredBy, runId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erro ao gerar plano");
      const plan = json.output?.plan ?? json.plan;
      updateNodeData(id, { plan, status: "done" });
      setOutput('plano', { plan });
      markStaleDownstream('plano');
      setExpanded(true);
    } catch {
      setStatus('plano', 'error');
    }
  }

  async function handleApprove() {
    approve('plano');
    await fetch("/api/canvas/phase/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phaseId: 'plano', clientId: d.clientId, runId }),
    }).catch(() => null);
  }

  useEffect(() => {
    function handler(e: Event) {
      if ((e as CustomEvent).detail?.phaseId === 'plano') run();
    }
    window.addEventListener('canvas:run-phase', handler);
    return () => window.removeEventListener('canvas:run-phase', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.clientId, d.objetivo, d.formato]);

  return (
    <BaseNodeV3
      label="Plano"
      icon={<Brain className="w-3.5 h-3.5" />}
      accentColor="#a78bfa"
      selected={selected}
      width={320}
      phaseId="plano"
      phaseStatus={phaseStatus}
      onRunToHere={() => run('run-to-here')}
      onRegenerate={() => run('regenerate')}
      onReset={() => { setStatus('plano', 'idle'); updateNodeData(id, { plan: undefined }); }}
      onApprove={handleApprove}
    >
      {!d.plan ? (
        <div className="space-y-2">
          {(!d.clientId || !d.objetivo) ? (
            <p className="text-xs text-slate-500 text-center py-3">
              Conecte um BriefingNode com clientId e objetivo preenchidos
            </p>
          ) : (
            <p className="text-xs text-slate-400 text-center py-2">
              {phaseStatus === "running" ? "IA planejando…" : "Pronto para planejar"}
            </p>
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
          <button
            onClick={() => setExpanded(v => !v)}
            className="flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300"
          >
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {d.plan.slidesBriefing?.length ?? 0} slides
          </button>
          {expanded && (
            <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
              {(d.plan.slidesBriefing ?? []).map(s => (
                <div key={s.n} className="bg-slate-800/60 rounded-lg px-2.5 py-2">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-xs font-medium text-violet-400">Slide {s.n}</span>
                    <span className="text-xs text-slate-600 capitalize">{s.intencao}</span>
                  </div>
                  <p className="text-xs text-slate-300 leading-snug line-clamp-2">{s.copy}</p>
                  {s.visual && <p className="text-xs text-slate-600 mt-0.5 line-clamp-1 italic">{s.visual}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Inline run button in footer */}
      <div className="flex justify-end pt-1 border-t border-slate-700/40">
        <InlineRunButton
          status={phaseStatus}
          canRun={isRunnable}
          onRun={() => run('step')}
          label="Gerar plano"
          doneLabel="Regerar plano"
          size="sm"
        />
      </div>
    </BaseNodeV3>
  );
}
