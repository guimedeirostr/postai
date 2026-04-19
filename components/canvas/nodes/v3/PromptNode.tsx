"use client";

import { NodeProps, useReactFlow } from "@xyflow/react";
import { Zap, AtSign } from "lucide-react";
import BaseNodeV3 from "./BaseNodeV3";
import { useCanvasStore, canRun } from "@/lib/canvas/store";
import { hashInput } from "@/lib/canvas/staleness";
import type { NodeStatus } from "./BaseNodeV3";

interface PromptData {
  prompt?:    string;
  assetUrl?:  string;
  status?:    NodeStatus;
  slideN?:    number;
  clientId?:  string;
  flowId?:    string;
  postId?:    string;
  slideId?:   string;
  format?:    string;
  model?:     string;
}

export default function PromptNode({ id, data, selected }: NodeProps) {
  const d = data as PromptData;
  const { updateNodeData } = useReactFlow();
  const { phases, setStatus, setOutput, setInputHash, markStaleDownstream, approve, runId } = useCanvasStore();
  const phaseStatus = phases.prompt.status;
  const isRunnable = canRun(phases, 'prompt');

  async function run(triggeredBy: 'step' | 'run-to-here' | 'regenerate' = 'step') {
    if (!d.prompt?.trim() || !d.clientId) return;
    const input = { prompt: d.prompt, clientId: d.clientId, model: d.model ?? 'flux-pro', format: d.format ?? 'feed' };
    const h = hashInput(input);
    setStatus('prompt', 'running');
    setInputHash('prompt', h);
    updateNodeData(id, { status: "loading" });

    try {
      const res = await fetch("/api/canvas/phase/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: d.clientId, phaseId: 'prompt', input, triggeredBy, runId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erro ao enfileirar");
      const assetUrl = json.output?.assetUrl;
      if (assetUrl) updateNodeData(id, { assetUrl, status: "done" });
      setOutput('prompt', json.output ?? {});
      markStaleDownstream('prompt');
    } catch {
      setStatus('prompt', 'error');
      updateNodeData(id, { status: "error" });
    }
  }

  async function handleApprove() {
    approve('prompt');
    await fetch("/api/canvas/phase/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phaseId: 'prompt', clientId: d.clientId, runId }),
    }).catch(() => null);
  }

  return (
    <BaseNodeV3
      label={`Prompt${d.slideN ? ` · Slide ${d.slideN}` : ""}`}
      icon={<Zap className="w-3.5 h-3.5" />}
      accentColor="#f59e0b"
      selected={selected}
      width={300}
      phaseId="prompt"
      phaseStatus={phaseStatus}
      canRun={isRunnable}
      onRun={() => run('step')}
      onRunToHere={() => run('run-to-here')}
      onRegenerate={() => run('regenerate')}
      onApprove={handleApprove}
    >
      <div className="space-y-2.5">
        <div className="relative">
          <textarea
            value={d.prompt ?? ""}
            onChange={e => updateNodeData(id, { prompt: e.target.value })}
            placeholder="Descreva a imagem… use @img1 para referenciar assets"
            rows={3}
            className="w-full bg-slate-800/60 border border-slate-600/50 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-amber-400/50 resize-none"
          />
          <AtSign className="absolute right-2.5 bottom-2.5 w-3.5 h-3.5 text-slate-600" />
        </div>

        {d.assetUrl && (
          <div className="rounded-lg overflow-hidden border border-slate-700 aspect-square">
            <img src={d.assetUrl} alt="" className="w-full h-full object-cover" />
          </div>
        )}
      </div>
    </BaseNodeV3>
  );
}
