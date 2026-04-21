"use client";

import { NodeProps, useReactFlow } from "@xyflow/react";
import { ImageIcon, ChevronDown, ChevronUp, Wand2, Loader2, RefreshCw } from "lucide-react";
import { useState, useEffect } from "react";
import BaseNodeV3 from "./BaseNodeV3";
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

const FORMAT_OPTIONS = [
  { value: "feed",     label: "Feed (4:5)"   },
  { value: "story",    label: "Story (9:16)" },
  { value: "reels",    label: "Reels (9:16)" },
  { value: "carousel", label: "Quadrado (1:1)" },
];

const MODEL_OPTIONS: { value: ReplicateImageModel; label: string }[] = [
  { value: "google/nano-banana-2",              label: "🍌 Nano Banana 2 (4K)" },
  { value: "google/imagen-4-ultra",             label: "✨ Imagen 4 Ultra"      },
  { value: "google/imagen-4",                   label: "Google Imagen 4"        },
  { value: "black-forest-labs/flux-1.1-pro",    label: "Flux 1.1 Pro"          },
  { value: "black-forest-labs/flux-kontext-pro",label: "Flux Kontext Pro"       },
  { value: "ideogram-ai/ideogram-v3-turbo",     label: "Ideogram v3 Turbo"      },
];

export default function ImageNode({ id, data, selected }: NodeProps) {
  const d = data as ImageData;
  const { updateNodeData, getNodes } = useReactFlow();
  const {
    phases, clientId: storeClientId,
    setStatus, setOutput, setInputHash, markStaleDownstream, approve, runId,
  } = useCanvasStore();
  const phaseStatus    = phases.image.status;
  const isRunnable     = canRun(phases, 'image', storeClientId);

  const [promptExpanded, setPromptExpanded] = useState(false);

  // ── Resolve compiled prompt ─────────────────────────────────────────────────
  // Priority: store output → sibling PromptNode data → own node data
  const promptOut   = phases.prompt.output as { compiledText?: string; format?: string } | undefined;
  const briefingOut = phases.briefing.output as { formato?: string } | undefined;

  // Fallback: read compiledText from the PromptNode in the React Flow graph
  const promptNodeData = getNodes().find(n => n.type === "prompt")?.data as
    { compiledText?: string; prompt?: string; format?: string } | undefined;

  const resolvedClientId = storeClientId ?? d.clientId;
  const resolvedCompiled =
    promptOut?.compiledText ??
    promptNodeData?.compiledText ??
    promptNodeData?.prompt ??
    d.compiledText ?? "";
  const resolvedFormato =
    briefingOut?.formato ??
    promptOut?.format ??
    promptNodeData?.format ??
    d.formato ?? "feed";
  const resolvedModel = d.model ?? "google/nano-banana-2";

  const hasPrompt = !!resolvedCompiled.trim();
  const hasImage  = !!d.imageUrl;

  // ── Run ─────────────────────────────────────────────────────────────────────
  async function run(triggeredBy: "step" | "run-to-here" | "regenerate" = "step") {
    if (!resolvedClientId) return;
    if (!resolvedCompiled.trim()) return;
    const input = {
      compiledText: resolvedCompiled,
      formato:      resolvedFormato,
      model:        resolvedModel,
      slideN:       d.slideN,
    };
    setStatus("image", "running");
    setInputHash("image", hashInput(input));
    try {
      const res = await fetch("/api/canvas/phase/run", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ clientId: resolvedClientId, phaseId: "image", input, triggeredBy, runId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erro na geração de imagem");
      const imageUrl = json.output?.imageUrl as string | undefined;
      updateNodeData(id, { imageUrl });
      setOutput("image", { imageUrl });
      markStaleDownstream("image");
    } catch {
      setStatus("image", "error");
    }
  }

  async function handleApprove() {
    approve("image");
    await fetch("/api/canvas/phase/approve", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ phaseId: "image", clientId: resolvedClientId, runId }),
    }).catch(() => null);
  }

  useEffect(() => {
    function handler(e: Event) {
      if ((e as CustomEvent).detail?.phaseId === "image") run();
    }
    window.addEventListener("canvas:run-phase", handler);
    return () => window.removeEventListener("canvas:run-phase", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedClientId, resolvedCompiled, resolvedFormato, resolvedModel]);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <BaseNodeV3
      label="Imagem"
      icon={<ImageIcon className="w-3.5 h-3.5" />}
      accentColor="#f472b6"
      selected={selected}
      width={296}
      phaseId="image"
      phaseStatus={phaseStatus}
      requiredService="replicate"
      onRunToHere={() => run("run-to-here")}
      onRegenerate={() => run("regenerate")}
      onReset={() => { setStatus("image", "idle"); updateNodeData(id, { imageUrl: undefined }); }}
      onApprove={handleApprove}
    >
      <div className="space-y-2.5">

        {/* ── Compiled prompt preview ─────────────────────────────────── */}
        {hasPrompt ? (
          <div className="rounded-lg bg-slate-800/60 border border-slate-700/50 px-2.5 py-2">
            <div className="flex items-center justify-between gap-1 mb-1">
              <span className="text-[9px] font-semibold text-pink-400/70 uppercase tracking-wider">
                Prompt compilado
              </span>
              <button
                onClick={() => setPromptExpanded(v => !v)}
                className="text-slate-500 hover:text-slate-300 transition-colors"
              >
                {promptExpanded
                  ? <ChevronUp className="w-3 h-3" />
                  : <ChevronDown className="w-3 h-3" />}
              </button>
            </div>
            <p className={`text-[10px] text-slate-300 leading-relaxed font-mono ${promptExpanded ? "" : "line-clamp-3"}`}>
              {resolvedCompiled}
            </p>
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-lg bg-slate-800/30 border border-slate-700/30 px-2.5 py-2">
            <Wand2 className="w-3.5 h-3.5 text-slate-600 flex-none" />
            <p className="text-xs text-slate-500">
              {phaseStatus === "running" ? "Gerando imagem…" : "Compilação do prompt pendente"}
            </p>
          </div>
        )}

        {/* ── Format + Model selectors ────────────────────────────────── */}
        <div className="flex gap-1.5">
          <select
            value={resolvedFormato}
            onChange={e => updateNodeData(id, { formato: e.target.value })}
            className="flex-1 min-w-0 bg-slate-800/60 border border-slate-700/50 rounded-lg px-2 py-1.5 text-[10px] text-slate-300 focus:outline-none focus:border-pink-500/50 cursor-pointer"
          >
            {FORMAT_OPTIONS.map(f => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
          <select
            value={resolvedModel}
            onChange={e => updateNodeData(id, { model: e.target.value as ReplicateImageModel })}
            className="flex-1 min-w-0 bg-slate-800/60 border border-slate-700/50 rounded-lg px-2 py-1.5 text-[10px] text-slate-300 focus:outline-none focus:border-pink-500/50 cursor-pointer"
          >
            {MODEL_OPTIONS.map(m => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>

        {/* ── Generated image ─────────────────────────────────────────── */}
        {hasImage && (
          <div className="rounded-xl overflow-hidden border border-slate-700 aspect-[4/5]">
            <img src={d.imageUrl} alt="Imagem gerada" className="w-full h-full object-cover" />
          </div>
        )}

        {/* ── Generate / Regenerate button ────────────────────────────── */}
        <button
          onClick={() => run(hasImage ? "regenerate" : "step")}
          disabled={!hasPrompt || !isRunnable || phaseStatus === "running"}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-xl font-medium text-sm transition-all
            bg-pink-500/20 border border-pink-500/40 text-pink-300
            hover:bg-pink-500/30 hover:border-pink-400/60
            disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {phaseStatus === "running" ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Gerando…
            </>
          ) : hasImage ? (
            <>
              <RefreshCw className="w-4 h-4" />
              Regerar imagem
            </>
          ) : (
            <>
              <Wand2 className="w-4 h-4" />
              Gerar imagem
            </>
          )}
        </button>

      </div>
    </BaseNodeV3>
  );
}
