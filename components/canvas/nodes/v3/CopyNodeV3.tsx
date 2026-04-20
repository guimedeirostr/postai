"use client";

import { NodeProps, useReactFlow } from "@xyflow/react";
import { PenLine } from "lucide-react";
import { useEffect } from "react";
import BaseNodeV3 from "./BaseNodeV3";
import { InlineRunButton } from "./InlineRunButton";
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
  const { phases, clientId: storeClientId, setStatus, setOutput, setInputHash, markStaleDownstream, approve, runId } = useCanvasStore();
  const phaseStatus = phases.copy.status;
  const isRunnable = canRun(phases, 'copy', storeClientId);

  // Resolve inputs from store — node data is never populated via edges in React Flow
  const briefingOut = phases.briefing.output as { clientId?: string; objetivo?: string; formato?: string } | undefined;
  const planoOut    = phases.plano.output    as { plan?: unknown } | undefined;
  const resolvedClientId = storeClientId ?? briefingOut?.clientId ?? d.clientId;
  const resolvedObjetivo = briefingOut?.objetivo ?? d.objetivo;
  const resolvedFormato  = briefingOut?.formato  ?? d.formato ?? 'feed';
  const resolvedPlan     = planoOut?.plan        ?? d.plan;

  async function run(triggeredBy: 'step' | 'run-to-here' | 'regenerate' = 'step') {
    if (!resolvedClientId) {
      console.error('[CopyNodeV3] clientId ausente — selecione um cliente no header do Canvas');
      return;
    }
    const input = { objetivo: resolvedObjetivo, formato: resolvedFormato, plan: resolvedPlan };
    setStatus('copy', 'running');
    setInputHash('copy', hashInput(input));
    try {
      const res = await fetch("/api/canvas/phase/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: resolvedClientId, phaseId: 'copy', input, triggeredBy, runId }),
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
      body: JSON.stringify({ phaseId: 'copy', clientId: resolvedClientId, runId }),
    }).catch(() => null);
  }

  useEffect(() => {
    function handler(e: Event) {
      if ((e as CustomEvent).detail?.phaseId === 'copy') run();
    }
    window.addEventListener('canvas:run-phase', handler);
    return () => window.removeEventListener('canvas:run-phase', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedClientId, resolvedObjetivo, resolvedFormato]);

  return (
    <BaseNodeV3
      label="Copy"
      icon={<PenLine className="w-3.5 h-3.5" />}
      accentColor="#34d399"
      selected={selected}
      phaseId="copy"
      phaseStatus={phaseStatus}
      onRunToHere={() => run('run-to-here')}
      onRegenerate={() => run('regenerate')}
      onReset={() => { setStatus('copy', 'idle'); updateNodeData(id, { headline: undefined, caption: undefined }); }}
      onApprove={handleApprove}
    >
      {d.headline ? (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-slate-200 leading-snug line-clamp-2">{d.headline}</p>
          {d.caption && <p className="text-xs text-slate-400 line-clamp-3">{d.caption}</p>}
        </div>
      ) : (
        <p className="text-xs text-slate-500 text-center py-2">
          {phaseStatus === "running" ? "IA escrevendo…" : "Aguardando Plano"}
        </p>
      )}

      <div className="flex justify-end border-t border-slate-700/40 pt-2">
        <InlineRunButton
          status={phaseStatus}
          canRun={isRunnable}
          onRun={() => run('step')}
          label="Gerar copy"
          doneLabel="Gerar outras versões"
          size="sm"
        />
      </div>
    </BaseNodeV3>
  );
}
