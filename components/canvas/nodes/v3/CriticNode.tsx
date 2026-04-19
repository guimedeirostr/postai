"use client";

import { NodeProps, useReactFlow } from "@xyflow/react";
import { ShieldCheck, Star } from "lucide-react";
import BaseNodeV3 from "./BaseNodeV3";
import { useCanvasStore, canRun } from "@/lib/canvas/store";
import { hashInput } from "@/lib/canvas/staleness";

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
  const { phases, setStatus, setOutput, setInputHash, markStaleDownstream, approve, runId } = useCanvasStore();
  const phaseStatus = phases.critico.status;
  const isRunnable = canRun(phases, 'critico');
  const hasResult = d.score !== undefined;

  const scoreColor =
    d.score === undefined ? "#94a3b8" :
    d.score >= 8  ? "#34d399" :
    d.score >= 6  ? "#f59e0b" :
    "#f87171";

  async function run(triggeredBy: 'step' | 'run-to-here' | 'regenerate' = 'step') {
    if (!d.imageUrl || !d.brief) return;
    const input = { imageUrl: d.imageUrl, brief: d.brief, clientId: d.clientId };
    const h = hashInput(input);
    setStatus('critico', 'running');
    setInputHash('critico', h);

    try {
      const res = await fetch("/api/canvas/phase/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: d.clientId, phaseId: 'critico', input, triggeredBy, runId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erro na crítica");
      const out = json.output ?? {};
      updateNodeData(id, { score: out.score, notes: out.notes });
      setOutput('critico', out);
      markStaleDownstream('critico');
    } catch {
      setStatus('critico', 'error');
    }
  }

  async function handleApprove() {
    approve('critico');
    await fetch("/api/canvas/phase/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phaseId: 'critico', clientId: d.clientId, runId }),
    }).catch(() => null);
  }

  return (
    <BaseNodeV3
      label="Crítico"
      icon={<ShieldCheck className="w-3.5 h-3.5" />}
      accentColor="#fb923c"
      selected={selected}
      width={240}
      phaseId="critico"
      phaseStatus={phaseStatus}
      canRun={isRunnable}
      onRun={() => run('step')}
      onRunToHere={() => run('run-to-here')}
      onRegenerate={() => run('regenerate')}
      onApprove={handleApprove}
    >
      {!hasResult ? (
        <p className="text-xs text-slate-500 text-center py-1">
          {phaseStatus === "running" ? "Avaliando…" : "Use ▶ para avaliar"}
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
            <div className="bg-amber-500/10 rounded-lg px-2.5 py-1.5">
              <p className="text-xs text-amber-400">Score &lt; 7 — regeneração recomendada</p>
            </div>
          )}
        </div>
      )}
    </BaseNodeV3>
  );
}
