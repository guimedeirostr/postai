"use client";

import { NodeProps, useReactFlow } from "@xyflow/react";
import { ImageIcon, ChevronDown } from "lucide-react";
import { useState, useEffect } from "react";
import BaseNodeV3 from "./BaseNodeV3";
import { InlineRunButton } from "./InlineRunButton";
import { useCanvasStore, canRun } from "@/lib/canvas/store";
import { hashInput } from "@/lib/canvas/staleness";
import type { ReplicateImageModel } from "@/lib/replicate";

interface ImageData {
  imageUrl?: string;
  status?: string;
  clientId?: string;
  formato?: string;
  compiledText?: string;
  model?: ReplicateImageModel;
  slideN?: number;
}

const MODEL_OPTIONS: { value: ReplicateImageModel; label: string }[] = [
  { value: "google/nano-banana-2",          label: "🍌 Nano Banana 2 (4K)" },
  { value: "google/imagen-4-ultra",         label: "✨ Imagen 4 Ultra" },
  { value: "google/imagen-4",               label: "Google Imagen 4" },
  { value: "black-forest-labs/flux-1.1-pro", label: "Flux 1.1 Pro" },
  { value: "black-forest-labs/flux-kontext-pro", label: "Flux Kontext Pro" },
  { value: "ideogram-ai/ideogram-v3-turbo", label: "Ideogram v3 Turbo" },
];

export default function ImageNode({ id, data, selected }: NodeProps) {
  const d = data as ImageData;
  const { updateNodeData } = useReactFlow();
  const { phases, clientId: storeClientId, setStatus, setOutput, setInputHash, markStaleDownstream, approve, runId } = useCanvasStore();
  const phaseStatus = phases.image.status;
  const isRunnable = canRun(phases, 'image', storeClientId);

  const [showModel, setShowModel] = useState(false);

  // Resolve inputs from store
  const promptOut    = phases.prompt.output   as { compiledText?: string; format?: string } | undefined;
  const briefingOut  = phases.briefing.output as { formato?: string } | undefined;
  const resolvedClientId   = storeClientId ?? d.clientId;
  const resolvedCompiled   = promptOut?.compiledText ?? d.compiledText ?? '';
  const resolvedFormato    = briefingOut?.formato ?? promptOut?.format ?? d.formato ?? 'feed';
  const resolvedModel      = d.model ?? 'google/nano-banana-2';

  async function run(triggeredBy: 'step' | 'run-to-here' | 'regenerate' = 'step') {
    if (!resolvedClientId) {
      console.error('[ImageNode] clientId ausente — selecione um cliente no header do Canvas');
      return;
    }
    if (!resolvedCompiled.trim()) {
      console.error('[ImageNode] Prompt compilado vazio — execute o Prompt primeiro');
      return;
    }
    const input = {
      compiledText: resolvedCompiled,
      formato:      resolvedFormato,
      model:        resolvedModel,
      slideN:       d.slideN,
    };
    setStatus('image', 'running');
    setInputHash('image', hashInput(input));
    try {
      const res = await fetch("/api/canvas/phase/run", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ clientId: resolvedClientId, phaseId: 'image', input, triggeredBy, runId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erro na geração de imagem");
      const imageUrl = json.output?.imageUrl as string | undefined;
      updateNodeData(id, { imageUrl });
      setOutput('image', { imageUrl });
      markStaleDownstream('image');
    } catch {
      setStatus('image', 'error');
    }
  }

  async function handleApprove() {
    approve('image');
    await fetch("/api/canvas/phase/approve", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ phaseId: 'image', clientId: resolvedClientId, runId }),
    }).catch(() => null);
  }

  useEffect(() => {
    function handler(e: Event) {
      if ((e as CustomEvent).detail?.phaseId === 'image') run();
    }
    window.addEventListener('canvas:run-phase', handler);
    return () => window.removeEventListener('canvas:run-phase', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedClientId, resolvedCompiled, resolvedFormato, resolvedModel]);

  const hasImage = !!d.imageUrl;

  return (
    <BaseNodeV3
      label="Imagem"
      icon={<ImageIcon className="w-3.5 h-3.5" />}
      accentColor="#f472b6"
      selected={selected}
      width={280}
      phaseId="image"
      phaseStatus={phaseStatus}
      requiredService="replicate"
      onRunToHere={() => run('run-to-here')}
      onRegenerate={() => run('regenerate')}
      onReset={() => { setStatus('image', 'idle'); updateNodeData(id, { imageUrl: undefined }); }}
      onApprove={handleApprove}
    >
      {hasImage ? (
        <div className="space-y-2">
          <div className="rounded-xl overflow-hidden border border-slate-700 aspect-[4/5]">
            <img src={d.imageUrl} alt="Imagem gerada" className="w-full h-full object-cover" />
          </div>
        </div>
      ) : (
        <p className="text-xs text-slate-500 text-center py-3">
          {phaseStatus === "running"
            ? "Gerando imagem…"
            : !resolvedCompiled.trim()
            ? "Aguardando prompt compilado"
            : "Pronto para gerar"}
        </p>
      )}

      {/* Model selector */}
      <div className="mt-2">
        <button
          onClick={() => setShowModel(v => !v)}
          className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-400 transition-colors"
        >
          <ChevronDown className={`w-3 h-3 transition-transform ${showModel ? 'rotate-180' : ''}`} />
          {MODEL_OPTIONS.find(m => m.value === resolvedModel)?.label ?? resolvedModel}
        </button>
        {showModel && (
          <div className="mt-1 bg-slate-800/80 rounded-lg border border-slate-700/50 overflow-hidden">
            {MODEL_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => { updateNodeData(id, { model: opt.value }); setShowModel(false); }}
                className={`w-full text-left px-2.5 py-1.5 text-[10px] transition-colors ${
                  opt.value === resolvedModel
                    ? 'bg-pink-500/20 text-pink-300'
                    : 'text-slate-400 hover:bg-slate-700/50'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex justify-end pt-1 border-t border-slate-700/40 mt-2">
        <InlineRunButton
          status={phaseStatus}
          canRun={isRunnable && !!resolvedCompiled.trim()}
          onRun={() => run('step')}
          label="Gerar imagem"
          doneLabel="Regerar imagem"
          size="sm"
        />
      </div>
    </BaseNodeV3>
  );
}
