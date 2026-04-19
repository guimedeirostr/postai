"use client";

import { NodeProps } from "@xyflow/react";
import { Download, ExternalLink } from "lucide-react";
import BaseNodeV3 from "./BaseNodeV3";
import { useCanvasStore, canRun } from "@/lib/canvas/store";
import { hashInput } from "@/lib/canvas/staleness";

interface OutputData {
  imageUrl?: string;
  postId?: string;
  status?: string;
  clientId?: string;
}

export default function OutputNode({ data, selected }: NodeProps) {
  const d = data as OutputData;
  const { phases, setStatus, setOutput, setInputHash, markStaleDownstream, approve, runId } = useCanvasStore();
  const phaseStatus = phases.output.status;
  const isRunnable = canRun(phases, 'output');
  const hasOutput = !!d.imageUrl;

  async function run(triggeredBy: 'step' | 'run-to-here' | 'regenerate' = 'step') {
    const input = { imageUrl: d.imageUrl, clientId: d.clientId };
    const h = hashInput(input);
    setStatus('output', 'running');
    setInputHash('output', h);

    try {
      const res = await fetch("/api/canvas/phase/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: d.clientId, phaseId: 'output', input, triggeredBy, runId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erro no output");
      setOutput('output', json.output ?? {});
      markStaleDownstream('output');
    } catch {
      setStatus('output', 'error');
    }
  }

  async function handleApprove() {
    approve('output');
    await fetch("/api/canvas/phase/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phaseId: 'output', clientId: d.clientId, runId, postId: d.postId }),
    }).catch(() => null);
  }

  return (
    <BaseNodeV3
      label="Output"
      icon={<Download className="w-3.5 h-3.5" />}
      accentColor="#22d3ee"
      selected={selected}
      hasOutput={false}
      width={220}
      phaseId="output"
      phaseStatus={phaseStatus}
      canRun={isRunnable}
      onRun={() => run('step')}
      onRunToHere={() => run('run-to-here')}
      onRegenerate={() => run('regenerate')}
      onApprove={handleApprove}
    >
      {!hasOutput ? (
        <p className="text-xs text-slate-500 text-center py-4">
          {phaseStatus === "running" ? "Compondo…" : "Use ▶ após o Crítico"}
        </p>
      ) : (
        <div className="space-y-2.5">
          <div className="rounded-xl overflow-hidden border border-slate-700 aspect-square">
            <img src={d.imageUrl} alt="Post final" className="w-full h-full object-cover" />
          </div>
          <div className="flex gap-2">
            <a
              href={d.imageUrl}
              download="post.jpg"
              className="flex-1 flex items-center justify-center gap-1.5 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 rounded-lg py-1.5 text-xs text-cyan-400 transition-colors"
            >
              <Download className="w-3 h-3" />
              Baixar
            </a>
            {d.postId && (
              <a
                href={`/posts/${d.postId}`}
                target="_blank"
                className="flex items-center justify-center gap-1.5 px-3 bg-slate-800/60 hover:bg-slate-700/60 border border-slate-600/50 rounded-lg text-xs text-slate-400 transition-colors"
              >
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        </div>
      )}
    </BaseNodeV3>
  );
}
