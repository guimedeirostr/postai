"use client";

import { NodeProps, useReactFlow } from "@xyflow/react";
import { FileText } from "lucide-react";
import BaseNodeV3 from "./BaseNodeV3";

interface BriefingData {
  clientId?: string;
  objetivo?: string;
  formato?: string;
}

export default function BriefingNode({ id, data, selected }: NodeProps) {
  const d = data as BriefingData;
  const { updateNodeData } = useReactFlow();

  return (
    <BaseNodeV3 label="Briefing" icon={<FileText className="w-3.5 h-3.5" />}
      accentColor="#60a5fa" hasInput={false} selected={selected}>
      <div className="space-y-2.5">
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
      </div>
    </BaseNodeV3>
  );
}
