"use client";

import { NodeProps } from "@xyflow/react";
import { Brain, BookOpen } from "lucide-react";
import { useState } from "react";
import BaseNodeV3 from "./BaseNodeV3";
import { useCanvasStore } from "@/lib/canvas/store";
import { hashInput } from "@/lib/canvas/staleness";
import type { ClientMemory } from "@/types";

interface ClientMemoryData {
  memory?: ClientMemory;
  status?: string;
  clientId?: string;
}

export default function ClientMemoryNode({ data, selected }: NodeProps) {
  const d = data as ClientMemoryData;
  const mem = d.memory;
  const [tab, setTab] = useState<"approved" | "rejected">("approved");
  const { phases, setStatus, setOutput, setInputHash, approve, runId } = useCanvasStore();
  const phaseStatus = phases.memoria.status;

  async function run(triggeredBy: 'step' | 'run-to-here' | 'regenerate' = 'step') {
    if (!d.clientId) return;
    const input = { clientId: d.clientId };
    setStatus('memoria', 'running');
    setInputHash('memoria', hashInput(input));
    try {
      const res = await fetch("/api/canvas/phase/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: d.clientId, phaseId: 'memoria', input, triggeredBy, runId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erro ao carregar memória");
      setOutput('memoria', json.output ?? {});
    } catch {
      setStatus('memoria', 'error');
    }
  }

  // Memória não tem InlineRunButton — só menu ⋯ no header ("Re-processar memória")
  return (
    <BaseNodeV3
      label="Memória"
      icon={<Brain className="w-3.5 h-3.5" />}
      accentColor="#818cf8"
      selected={selected}
      width={280}
      phaseId="memoria"
      phaseStatus={phaseStatus}
      onRunToHere={() => run('run-to-here')}
      onRegenerate={() => run('regenerate')}
      onReset={() => setStatus('memoria', 'idle')}
      onApprove={() => approve('memoria')}
    >
      {!mem ? (
        <p className="text-xs text-slate-500 text-center py-2">
          {phaseStatus === "running" ? "Carregando memória…" : "Nenhum histórico ainda"}
        </p>
      ) : (
        <div className="space-y-2">
          <div className="flex gap-1 bg-slate-800/60 rounded-lg p-0.5">
            {(["approved", "rejected"] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 text-xs rounded-md py-1 transition-colors ${tab === t ? "bg-indigo-500/20 text-indigo-300" : "text-slate-500 hover:text-slate-400"}`}
              >
                {t === "approved" ? `Aprovados (${mem.toneExamples?.length ?? 0})` : `Rejeitados (${mem.rejectedPatterns?.length ?? 0})`}
              </button>
            ))}
          </div>

          <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
            {tab === "approved" ? (
              (mem.toneExamples ?? []).slice(0, 5).map((ex, i) => (
                <div key={i} className="bg-slate-800/60 rounded-lg px-2.5 py-1.5">
                  <p className="text-xs text-slate-300 line-clamp-2">{ex}</p>
                </div>
              ))
            ) : (
              (mem.rejectedPatterns ?? []).slice(0, 5).map((rp, i) => (
                <div key={i} className="bg-slate-800/60 rounded-lg px-2.5 py-1.5">
                  <p className="text-xs text-red-400 font-medium line-clamp-1">{rp.pattern}</p>
                  {rp.reason && <p className="text-xs text-slate-500 mt-0.5">{rp.reason}</p>}
                </div>
              ))
            )}
            {tab === "approved" && (mem.toneExamples?.length ?? 0) === 0 && (
              <p className="text-xs text-slate-600 text-center py-2">
                <BookOpen className="w-4 h-4 mx-auto mb-1" />
                Aprove posts para criar memória
              </p>
            )}
          </div>
        </div>
      )}
    </BaseNodeV3>
  );
}
