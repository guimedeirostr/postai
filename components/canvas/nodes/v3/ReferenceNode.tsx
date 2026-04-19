"use client";

import { NodeProps, useReactFlow } from "@xyflow/react";
import { Image as ImageIcon, Upload } from "lucide-react";
import BaseNodeV3 from "./BaseNodeV3";

interface ReferenceData {
  assetUrl?: string;
  slug?: string;
  label?: string;
  status?: string;
}

export default function ReferenceNode({ id, data, selected }: NodeProps) {
  const d = data as ReferenceData;
  const { updateNodeData } = useReactFlow();

  return (
    <BaseNodeV3
      label={d.label ?? "Referência"}
      icon={<ImageIcon className="w-3.5 h-3.5" />}
      accentColor="#f472b6"
      status={d.assetUrl ? "done" : "idle"}
      selected={selected}
      width={200}
    >
      {d.assetUrl ? (
        <div className="space-y-1.5">
          <div className="rounded-lg overflow-hidden border border-slate-700 aspect-square">
            <img src={d.assetUrl} alt="" className="w-full h-full object-cover" />
          </div>
          {d.slug && (
            <p className="text-xs text-center font-mono text-pink-400">{d.slug}</p>
          )}
        </div>
      ) : (
        <label className="flex flex-col items-center gap-2 py-4 rounded-lg border border-dashed border-slate-600/50 cursor-pointer hover:border-pink-400/40 transition-colors">
          <Upload className="w-5 h-5 text-slate-500" />
          <span className="text-xs text-slate-500">Clique para escolher</span>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={e => {
              const file = e.target.files?.[0];
              if (!file) return;
              const url = URL.createObjectURL(file);
              updateNodeData(id, { assetUrl: url });
            }}
          />
        </label>
      )}
    </BaseNodeV3>
  );
}
