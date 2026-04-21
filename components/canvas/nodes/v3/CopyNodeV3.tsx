"use client";

import { NodeProps, useReactFlow } from "@xyflow/react";
import { PenLine, AlertTriangle, Sparkles, Star } from "lucide-react";
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
  const {
    phases, clientId: storeClientId,
    setStatus, setOutput, setInputHash, markStaleDownstream, approve, runId,
  } = useCanvasStore();
  const phaseStatus = phases.copy.status;
  const isRunnable  = canRun(phases, 'copy', storeClientId);

  // Resolve inputs from store
  const briefingOut = phases.briefing.output as { clientId?: string; objetivo?: string; formato?: string } | undefined;
  const planoOut    = phases.plano.output    as { plan?: unknown } | undefined;
  const criticOut   = phases.critico.output  as { score?: number; notes?: string } | undefined;

  const resolvedClientId = storeClientId ?? briefingOut?.clientId ?? d.clientId;
  const resolvedObjetivo = briefingOut?.objetivo ?? d.objetivo;
  const resolvedFormato  = briefingOut?.formato  ?? d.formato ?? 'feed';
  const resolvedPlan     = planoOut?.plan        ?? d.plan;

  // Critique feedback — only surface when score is available and copy is done
  const critiqueScore = criticOut?.score;
  const critiqueNotes = criticOut?.notes;
  const hasCritique   = typeof critiqueScore === 'number' && !!critiqueNotes;
  const needsWork     = hasCritique && critiqueScore < 7;

  // Score colour
  const scoreColor =
    !hasCritique         ? ''
    : critiqueScore >= 8 ? 'text-emerald-400'
    : critiqueScore >= 6 ? 'text-amber-400'
    :                      'text-red-400';

  // ── Runs ──────────────────────────────────────────────────────────────────
  async function run(triggeredBy: 'step' | 'run-to-here' | 'regenerate' = 'step', withCritique = false) {
    if (!resolvedClientId) return;
    const input = {
      objetivo:     resolvedObjetivo,
      formato:      resolvedFormato,
      plan:         resolvedPlan,
      // inject critique notes only when explicitly requested
      ...(withCritique && critiqueNotes ? { critiqueNotes } : {}),
    };
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
      requiredService="anthropic"
      onRunToHere={() => run('run-to-here')}
      onRegenerate={() => run('regenerate')}
      onReset={() => { setStatus('copy', 'idle'); updateNodeData(id, { headline: undefined, caption: undefined }); }}
      onApprove={handleApprove}
    >
      {/* ── Copy content ────────────────────────────────────────────── */}
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

      {/* ── Critique feedback card ────────────────────────────────── */}
      {hasCritique && (
        <div className={`rounded-lg border px-2.5 py-2 space-y-1.5 ${
          needsWork
            ? 'bg-amber-500/8 border-amber-500/30'
            : 'bg-emerald-500/8 border-emerald-500/20'
        }`}>
          {/* Score row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              {needsWork
                ? <AlertTriangle className="w-3 h-3 text-amber-400 flex-none" />
                : <Star className="w-3 h-3 text-emerald-400 flex-none" />}
              <span className="text-[10px] font-semibold text-slate-400">Crítica de arte</span>
            </div>
            <span className={`text-[11px] font-bold tabular-nums ${scoreColor}`}>
              {critiqueScore}/10
            </span>
          </div>

          {/* Notes */}
          <p className="text-[10px] text-slate-400 leading-snug line-clamp-3">
            {critiqueNotes}
          </p>

          {/* CTA — only when improvement is warranted */}
          {needsWork && (
            <button
              onClick={() => run('regenerate', true)}
              disabled={phaseStatus === 'running'}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg
                bg-amber-500/15 border border-amber-500/40 text-amber-300
                hover:bg-amber-500/25 hover:border-amber-400/60
                transition-all text-[11px] font-medium disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Sparkles className="w-3 h-3" />
              Melhorar copy com a crítica
            </button>
          )}
        </div>
      )}

      {/* ── Standard run button ───────────────────────────────────── */}
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
