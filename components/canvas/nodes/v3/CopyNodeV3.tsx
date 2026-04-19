"use client";

import { NodeProps, useReactFlow } from "@xyflow/react";
import { PenLine } from "lucide-react";
import BaseNodeV3 from "./BaseNodeV3";
import { useCanvasStore, canRun } from "@/lib/canvas/store";
import { hashInput } from "@/lib/canvas/staleness";

interface CopyData {
  headline?: string;
  caption?: string;
  status?: string;
  clientId?: string;
  objetivo?: string;
  formato?: string;
  plan?: unknown;
}

export default function CopyNodeV3({ id, data, selected }: NodeProps) {
  const d = data as CopyData;
  const { updateNodeData } = useReactFlow();
  const { phases, setStatus, setOutput, setInputHash, markStaleDownstream, approve, runId } = useCanvasStore();
  const phaseStatus = phases.copy.status;
  const isRunnable = canRun(phases, 'copy');

  async function run(triggeredBy: 'step' | 'run-to-here' | 'regenerate' = 'step') {
    const input = { clientId: d.clientId, objetivo: d.objetivo, formato: d.formato, plan: d.plan };
    const h = hashInput(input);
    setStatus('copy', 'running');
    setInputHash('copy', h);

    try {
      const res = await fetch("/api/canvas/phase/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: d.clientId, phaseId: 'copy', input, triggeredBy, runId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erro ao gerar copy");
      const out = json.output ?? {};
      updateNodeData(id, { headline: out.headline, caption: out.caption });
      setOutput('copy', out);
      markStaleDownstream('copy');
    } catch {
      setStatus('copy', 'error');
    }
  }

  async function handleApprove() {
    approve('copy');
    await fetch("/api/canvas/phase/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phaseId: 'copy', clientId: d.clientId, runId }),
    }).catch(() => null);
  }

  return (
    <BaseNodeV3
      label="Copy"
      icon={<PenLine className="w-3.5 h-3.5" />}
      accentColor="#34d399"
      selected={selected}
      phaseId="copy"
      phaseStatus={phaseStatus}
      canRun={isRunnable}
      onRun={() => run('step')}
      onRunToHere={() => run('run-to-here')}
      onRegenerate={() => run('regenerate')}
      onApprove={handleApprove}
    >
      {!d.headline ? (
        <p className="text-xs text-slate-500 text-center py-2">
          {phaseStatus === "running" ? "IA escrevendo…" : "Use ▶ para gerar copy"}
        </p>
      ) : (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-slate-200 leading-snug line-clamp-2">{d.headline}</p>
          {d.caption && <p className="text-xs text-slate-400 line-clamp-3">{d.caption}</p>}
        </div>
      )}
    </BaseNodeV3>
  );
}
