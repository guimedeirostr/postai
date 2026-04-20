"use client";

import { NodeProps, useReactFlow } from "@xyflow/react";
import { ShieldCheck, Star } from "lucide-react";
import { useEffect } from "react";
import BaseNodeV3 from "./BaseNodeV3";
import { InlineRunButton } from "./InlineRunButton";
import { useCanvasStore, canRun } from "@/lib/canvas/store";
import { hashInput } from "@/lib/canvas/staleness";
import type { CopySingleOutput, CopyCarouselOutput } from "@/lib/director/copy";

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

type CopyOut = (CopySingleOutput | CopyCarouselOutput) & Record<string, unknown>;

export default function CriticNode({ id, data, selected }: NodeProps) {
  const d = data as CriticData;
  const { updateNodeData } = useReactFlow();
  const { phases, clientId: storeClientId, setStatus, setOutput, setInputHash, markStaleDownstream, approve, runId } = useCanvasStore();
  const phaseStatus = phases.critico.status;
  const isRunnable = canRun(phases, 'critico', storeClientId);
  const hasResult = d.score !== undefined;

  // Resolve inputs from store
  const imageOut = phases.image.output as { imageUrl?: string } | undefined;
  const copyOut  = phases.copy.output  as CopyOut              | undefined;
  const resolvedClientId = storeClientId ?? d.clientId;
  const resolvedImageUrl = imageOut?.imageUrl ?? d.imageUrl;
  const resolvedBrief    = (copyOut as CopySingleOutput | undefined)?.caption
    ?? (copyOut as CopySingleOutput | undefined)?.headline
    ?? d.brief;

  const scoreColor =
    d.score === undefined ? "#94a3b8" :
    d.score >= 8 ? "#34d399" :
    d.score >= 6 ? "#f59e0b" :
    "#f87171";

  async function run(triggeredBy: 'step' | 'run-to-here' | 'regenerate' = 'step') {
    if (!resolvedClientId) {
      console.error('[CriticNode] clientId ausente — selecione um cliente no header do Canvas');
      return;
    }
    if (!resolvedImageUrl) {
      console.error('[CriticNode] imageUrl ausente — aguardando fase de Imagem');
      return;
    }
    if (!resolvedBrief) {
      console.error('[CriticNode] brief ausente — aguardando fase de Copy');
      return;
    }
    const input = { imageUrl: resolvedImageUrl, brief: resolvedBrief };
    setStatus('critico', 'running');
    setInputHash('critico', hashInput(input));
    try {
      const res = await fetch("/api/canvas/phase/run", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ clientId: resolvedClientId, phaseId: 'critico', input, triggeredBy, runId }),
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
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ phaseId: 'critico', clientId: resolvedClientId, runId }),
    }).catch(() => null);
  }

  useEffect(() => {
    function handler(e: Event) {
      if ((e as CustomEvent).detail?.phaseId === 'critico') run();
    }
    window.addEventListener('canvas:run-phase', handler);
    return () => window.removeEventListener('canvas:run-phase', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedImageUrl, resolvedBrief, resolvedClientId]);

  // Determine what is missing
  const missingImage = !resolvedImageUrl;
  const missingCopy  = !resolvedBrief;

  return (
    <BaseNodeV3
      label="Crítica"
      icon={<ShieldCheck className="w-3.5 h-3.5" />}
      accentColor="#fb923c"
      selected={selected}
      width={240}
      phaseId="critico"
      phaseStatus={phaseStatus}
      requiredService="anthropic"
      onRunToHere={() => run('run-to-here')}
      onRegenerate={() => run('regenerate')}
      onReset={() => { setStatus('critico', 'idle'); updateNodeData(id, { score: undefined, notes: undefined }); }}
      onApprove={handleApprove}
    >
      {hasResult ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Star className="w-4 h-4" style={{ color: scoreColor }} />
            <span className="text-lg font-bold" style={{ color: scoreColor }}>{d.score}/10</span>
          </div>
          {d.notes && <p className="text-xs text-slate-400 leading-relaxed">{d.notes}</p>}
          {d.score !== undefined && d.score < 7 && (
            <div className="bg-amber-500/10 rounded-lg px-2.5 py-1.5">
              <p className="text-xs text-amber-400">Score &lt; 7 — regeneração recomendada</p>
            </div>
          )}
        </div>
      ) : (
        <p className="text-xs text-slate-500 text-center py-1">
          {phaseStatus === "running"
            ? "Avaliando…"
            : missingImage
            ? "Aguardando imagem gerada"
            : missingCopy
            ? "Aguardando copy"
            : "Pronto para avaliar"}
        </p>
      )}

      <div className="flex justify-end border-t border-slate-700/40 pt-2">
        <InlineRunButton
          status={phaseStatus}
          canRun={isRunnable && !!resolvedImageUrl && !!resolvedBrief}
          onRun={() => run('step')}
          label="Revisar"
          doneLabel="Revisar de novo"
          size="sm"
        />
      </div>
    </BaseNodeV3>
  );
}
