"use client";

import { NodeProps, useReactFlow } from "@xyflow/react";
import { Download, ExternalLink } from "lucide-react";
import { useState, useEffect } from "react";
import BaseNodeV3 from "./BaseNodeV3";
import { InlineRunButton } from "./InlineRunButton";
import { useCanvasStore, canRun } from "@/lib/canvas/store";
import { hashInput } from "@/lib/canvas/staleness";
import { cn } from "@/lib/utils";

type Variations = 1 | 2 | 4;
type Ratio = "4:5" | "1:1" | "9:16";
type Resolution = "2K" | "4K";

interface OutputData {
  imageUrl?: string;
  postId?: string;
  status?: string;
  clientId?: string;
}

function SegmentControl<T extends string>({ options, value, onChange }: {
  options: T[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex bg-slate-800/60 rounded-md p-0.5 gap-0.5">
      {options.map(opt => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={cn(
            "flex-1 text-[10px] px-1.5 py-0.5 rounded transition-colors font-medium",
            value === opt ? "bg-slate-600 text-slate-100" : "text-slate-500 hover:text-slate-400",
          )}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

export default function OutputNode({ data, selected }: NodeProps) {
  const d = data as OutputData;
  const { phases, clientId: storeClientId, setStatus, setOutput, setInputHash, markStaleDownstream, approve, runId } = useCanvasStore();
  const phaseStatus = phases.output.status;
  const isRunnable = canRun(phases, 'output', storeClientId);
  const hasOutput = !!d.imageUrl;

  const [variations, setVariations] = useState<Variations>(1);
  const [ratio,      setRatio]      = useState<Ratio>("4:5");
  const [resolution, setResolution] = useState<Resolution>("2K");

  const resolvedClientId = storeClientId ?? d.clientId;

  async function run(triggeredBy: 'step' | 'run-to-here' | 'regenerate' = 'step') {
    if (!resolvedClientId) {
      console.error('[OutputNode] clientId ausente — selecione um cliente no header do Canvas');
      return;
    }
    const input = { imageUrl: d.imageUrl, variations, ratio, resolution };
    setStatus('output', 'running');
    setInputHash('output', hashInput(input));
    try {
      const res = await fetch("/api/canvas/phase/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: resolvedClientId, phaseId: 'output', input, triggeredBy, runId }),
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
      body: JSON.stringify({ phaseId: 'output', clientId: resolvedClientId, runId, postId: d.postId }),
    }).catch(() => null);
  }

  useEffect(() => {
    function handler(e: Event) {
      if ((e as CustomEvent).detail?.phaseId === 'output') run();
    }
    window.addEventListener('canvas:run-phase', handler);
    return () => window.removeEventListener('canvas:run-phase', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.imageUrl, resolvedClientId, variations, ratio, resolution]);

  return (
    <BaseNodeV3
      label="Output"
      icon={<Download className="w-3.5 h-3.5" />}
      accentColor="#22d3ee"
      selected={selected}
      hasOutput={false}
      width={240}
      phaseId="output"
      phaseStatus={phaseStatus}
      onRunToHere={() => run('run-to-here')}
      onRegenerate={() => run('regenerate')}
      onReset={() => setStatus('output', 'idle')}
      onApprove={handleApprove}
    >
      {hasOutput && (
        <div className="rounded-xl overflow-hidden border border-slate-700 aspect-square mb-2">
          <img src={d.imageUrl} alt="Post final" className="w-full h-full object-cover" />
        </div>
      )}

      {/* Inline controls — variações / proporção / resolução */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] text-slate-500 w-16 flex-none">Variações</span>
          <SegmentControl<string>
            options={["x1", "x2", "x4"]}
            value={`x${variations}`}
            onChange={v => setVariations(Number(v.replace("x", "")) as Variations)}
          />
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] text-slate-500 w-16 flex-none">Proporção</span>
          <SegmentControl<Ratio>
            options={["4:5", "1:1", "9:16"]}
            value={ratio}
            onChange={setRatio}
          />
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] text-slate-500 w-16 flex-none">Resolução</span>
          <SegmentControl<Resolution>
            options={["2K", "4K"]}
            value={resolution}
            onChange={setResolution}
          />
        </div>
      </div>

      {/* Footer: download link + run button */}
      <div className="flex items-center justify-between gap-2 border-t border-slate-700/40 pt-2 mt-1">
        {hasOutput && d.postId ? (
          <a
            href={`/posts/${d.postId}`}
            target="_blank"
            className="flex items-center gap-1 text-[10px] text-cyan-400 hover:text-cyan-300 transition-colors"
          >
            <ExternalLink className="w-3 h-3" />
            Ver post
          </a>
        ) : (
          hasOutput ? (
            <a
              href={d.imageUrl}
              download="post.jpg"
              className="flex items-center gap-1 text-[10px] text-cyan-400 hover:text-cyan-300 transition-colors"
            >
              <Download className="w-3 h-3" />
              Baixar
            </a>
          ) : <span />
        )}
        <InlineRunButton
          status={phaseStatus}
          canRun={isRunnable}
          onRun={() => run('step')}
          label="Gerar imagem"
          doneLabel="Gerar variação"
          size="sm"
        />
      </div>
    </BaseNodeV3>
  );
}
