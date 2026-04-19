"use client";

import { NodeProps, useReactFlow } from "@xyflow/react";
import { Zap, AtSign, Play } from "lucide-react";
import BaseNodeV3 from "./BaseNodeV3";
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

  async function enqueue() {
    if (!d.prompt?.trim() || !d.clientId) return;
    updateNodeData(id, { status: "loading" });
    try {
      const res = await fetch("/api/generate/image/enqueue", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          nodeId:  id,
          prompt:  d.prompt,
          model:   d.model ?? "flux-pro",
          format:  d.format ?? "feed",
          clientId: d.clientId,
          postId:  d.postId,
          slideId: d.slideId,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erro ao enfileirar");
      // jobId saved but status stays "loading" — worker will update via Firestore
      updateNodeData(id, { jobId: json.jobId });
    } catch {
      updateNodeData(id, { status: "error" });
    }
  }

  return (
    <BaseNodeV3
      label={`Prompt${d.slideN ? ` · Slide ${d.slideN}` : ""}`}
      icon={<Zap className="w-3.5 h-3.5" />}
      accentColor="#f59e0b"
      status={d.status ?? "idle"}
      selected={selected}
      width={300}
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

        {d.assetUrl ? (
          <div className="rounded-lg overflow-hidden border border-slate-700 aspect-square">
            <img src={d.assetUrl} alt="" className="w-full h-full object-cover" />
          </div>
        ) : (
          d.clientId && d.prompt && d.status !== "loading" && (
            <button
              onClick={enqueue}
              className="w-full flex items-center justify-center gap-1.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-lg py-1.5 text-xs font-medium text-amber-400 transition-colors"
            >
              <Play className="w-3.5 h-3.5" />
              Gerar Imagem
            </button>
          )
        )}
      </div>
    </BaseNodeV3>
  );
}
