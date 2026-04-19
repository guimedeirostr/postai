"use client";

import { NodeProps, useReactFlow } from "@xyflow/react";
import { FileText } from "lucide-react";
import { useEffect } from "react";
import BaseNodeV3 from "./BaseNodeV3";
import { InlineRunButton } from "./InlineRunButton";
import { ClientPicker } from "@/components/canvas/ClientPicker";
import { useCanvasStore, canRun } from "@/lib/canvas/store";
import { hashInput } from "@/lib/canvas/staleness";

interface BriefingData {
  clientId?: string;
  objetivo?: string;
  formato?: string;
}

export default function BriefingNode({ id, data, selected }: NodeProps) {
  const d = data as BriefingData;
  const { updateNodeData } = useReactFlow();
  const { phases, clientId: storeClientId, setStatus, setOutput, setInputHash, markStaleDownstream, approve } = useCanvasStore();
  const phaseStatus = phases.briefing.status;
  const effectiveClientId = storeClientId ?? d.clientId;

  useEffect(() => {
    const h = hashInput({ clientId: effectiveClientId, objetivo: d.objetivo, formato: d.formato });
    const prev = phases.briefing.inputHash;
    if (prev && prev !== h && (phaseStatus === 'done' || phaseStatus === 'stale')) {
      setInputHash('briefing', h);
      markStaleDownstream('briefing');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveClientId, d.objetivo, d.formato]);

  async function run() {
    if (!effectiveClientId) return;
    const input = { clientId: effectiveClientId, objetivo: d.objetivo ?? '', formato: d.formato ?? 'feed' };
    setStatus('briefing', 'running');
    setInputHash('briefing', hashInput(input));
    await new Promise(r => setTimeout(r, 200));
    setOutput('briefing', input);
  }

  useEffect(() => {
    function handler(e: Event) {
      if ((e as CustomEvent).detail?.phaseId === 'briefing') run();
    }
    window.addEventListener('canvas:run-phase', handler);
    return () => window.removeEventListener('canvas:run-phase', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveClientId, d.objetivo, d.formato]);

  return (
    <BaseNodeV3
      label="Briefing"
      icon={<FileText className="w-3.5 h-3.5" />}
      accentColor="#60a5fa"
      hasInput={false}
      selected={selected}
      phaseId="briefing"
      phaseStatus={phaseStatus}
      onRunToHere={run}
      onRegenerate={run}
      onReset={() => setStatus('briefing', 'idle')}
      onApprove={() => approve('briefing')}
    >
      <div className="space-y-2.5">
        <div className="space-y-1">
          <label className="text-xs text-slate-400">Cliente</label>
          <ClientPicker variant="briefing" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-slate-400">Objetivo</label>
          <input
            value={d.objetivo ?? ""}
            onChange={e => updateNodeData(id, { objetivo: e.target.value })}
            placeholder="Ex: Vender café da manhã de segunda"
            className="w-full bg-slate-800/60 border border-slate-600/50 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-blue-400/50"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-slate-400">Formato</label>
          <select
            value={d.formato ?? "feed"}
            onChange={e => updateNodeData(id, { formato: e.target.value })}
            className="w-full bg-slate-800/60 border border-slate-600/50 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-400/50"
          >
            <option value="feed">Feed</option>
            <option value="carousel">Carrossel</option>
            <option value="story">Stories</option>
            <option value="reels-cover">Capa de Reels</option>
          </select>
        </div>

        <div className="flex justify-end pt-1">
          <InlineRunButton
            status={phaseStatus}
            canRun={canRun(phases, 'briefing', effectiveClientId)}
            onRun={run}
            label="Salvar briefing"
            doneLabel="Rerodar briefing"
            size="sm"
          />
        </div>
      </div>
    </BaseNodeV3>
  );
}
