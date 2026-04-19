"use client";

import { NodeProps } from "@xyflow/react";
import { Download, ExternalLink } from "lucide-react";
import BaseNodeV3 from "./BaseNodeV3";

interface OutputData {
  imageUrl?: string;
  postId?: string;
  status?: string;
}

export default function OutputNode({ data, selected }: NodeProps) {
  const d = data as OutputData;
  const hasOutput = !!d.imageUrl;

  return (
    <BaseNodeV3
      label="Output"
      icon={<Download className="w-3.5 h-3.5" />}
      accentColor="#22d3ee"
      status={d.status === "loading" ? "loading" : hasOutput ? "done" : "idle"}
      selected={selected}
      hasOutput={false}
      width={220}
    >
      {!hasOutput ? (
        <p className="text-xs text-slate-500 text-center py-4">
          {d.status === "loading" ? "Compondo…" : "Aguardando pipeline"}
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
