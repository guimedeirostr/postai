"use client";

import { NodeProps, useReactFlow } from "@xyflow/react";
import { Zap, AtSign } from "lucide-react";
import BaseNodeV3 from "./BaseNodeV3";
import type { NodeStatus } from "./BaseNodeV3";

interface PromptData {
  prompt?: string;
  assetUrl?: string;
  status?: NodeStatus;
  slideN?: number;
}

export default function PromptNode({ id, data, selected }: NodeProps) {
  const d = data as PromptData;
  const { updateNodeData } = useReactFlow();

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

        {d.assetUrl && (
          <div className="rounded-lg overflow-hidden border border-slate-700 aspect-square">
            <img src={d.assetUrl} alt="" className="w-full h-full object-cover" />
          </div>
        )}
      </div>
    </BaseNodeV3>
  );
}
