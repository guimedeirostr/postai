"use client";

import { NodeProps } from "@xyflow/react";
import { PenLine } from "lucide-react";
import BaseNodeV3 from "./BaseNodeV3";

interface CopyData {
  headline?: string;
  caption?: string;
  status?: string;
}

export default function CopyNodeV3({ data, selected }: NodeProps) {
  const d = data as CopyData;

  return (
    <BaseNodeV3
      label="Copy" icon={<PenLine className="w-3.5 h-3.5" />}
      accentColor="#34d399"
      status={d.status === "loading" ? "loading" : d.headline ? "done" : "idle"}
      selected={selected}
    >
      {!d.headline ? (
        <p className="text-xs text-slate-500 text-center py-2">
          {d.status === "loading" ? "IA escrevendo…" : "Aguardando Plano"}
        </p>
      ) : (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-slate-200 leading-snug line-clamp-2">{d.headline}</p>
          {d.caption && <p className="text-xs text-slate-400 line-clamp-3">{d.caption}</p>}
        </div>
      )}
    </BaseNodeV3>
  );
}
