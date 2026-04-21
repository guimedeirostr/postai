"use client";

import { NodeProps } from "@xyflow/react";
import { Brain, BookOpen } from "lucide-react";
import { useState, useEffect, useRef } from "react";
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
  const [tab, setTab] = useState<"approved" | "rejected">("approved");
  const { phases, clientId: storeClientId, clientContext, setStatus, setOutput, setInputHash, approve, runId } = useCanvasStore();

  // Resolve memória de múltiplas fontes: output da fase > clientContext > node data
  const phaseOutput = phases.memoria.output as { memory?: ClientMemory } | undefined;
  const mem = phaseOutput?.memory ?? clientContext?.clientMemory ?? d.memory ?? null;

  // Auto-completa a fase quando o contexto do cliente já carregou (custo zero)
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (clientContext?.clientMemory && phases.memoria.status === 'idle' && !hydratedRef.current) {
      hydratedRef.current = true;
      setOutput('memoria', {
        memory:     clientContext.clientMemory,
        clientId:   clientContext.clientId,
        clientName: clientContext.clientName,
      });
    }
  }, [clientContext, phases.memoria.status, setOutput]);
  const phaseStatus = phases.memoria.status;
  const resolvedClientId = storeClientId ?? d.clientId;

  async function run(triggeredBy: 'step' | 'run-to-here' | 'regenerate' = 'step') {
    if (!resolvedClientId) {
      console.error('[ClientMemoryNode] clientId ausente — selecione um cliente no header do Canvas');
      return;
    }
    const input = { clientId: resolvedClientId };
    setStatus('memoria', 'running');
    setInputHash('memoria', hashInput(input));
    try {
      const res = await fetch("/api/canvas/phase/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: resolvedClientId, phaseId: 'memoria', input, triggeredBy, runId }),
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
          {/* Resumo rápido */}
          <div className="flex gap-2 text-[10px] text-slate-400">
            {(mem.examples?.length ?? 0) > 0 && (
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 inline-block" />
                {mem.examples!.length} exemplo{mem.examples!.length !== 1 ? "s" : ""}
              </span>
            )}
            {(mem.toneExamples?.length ?? 0) > 0 && (
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                {mem.toneExamples!.length} tom de voz
              </span>
            )}
            {(mem.rejectedPatterns?.length ?? 0) > 0 && (
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block" />
                {mem.rejectedPatterns!.length} rejeitado{mem.rejectedPatterns!.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>

          <div className="flex gap-1 bg-slate-800/60 rounded-lg p-0.5">
            {(["approved", "rejected"] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 text-xs rounded-md py-1 transition-colors ${tab === t ? "bg-indigo-500/20 text-indigo-300" : "text-slate-500 hover:text-slate-400"}`}
              >
                {t === "approved"
                  ? `Exemplos (${(mem.examples?.length ?? 0) + (mem.toneExamples?.length ?? 0)})`
                  : `Rejeitados (${mem.rejectedPatterns?.length ?? 0})`}
              </button>
            ))}
          </div>

          <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
            {tab === "approved" ? (
              <>
                {/* PostExamples ricos (importados / aprovados no canvas) */}
                {(mem.examples ?? []).slice(0, 3).map((ex, i) => (
                  <div key={`ex-${i}`} className="bg-slate-800/60 rounded-lg px-2.5 py-1.5 flex gap-2">
                    {ex.imageUrl && (
                      <img src={ex.imageUrl} alt="" className="w-8 h-8 rounded object-cover flex-none" />
                    )}
                    <div className="min-w-0">
                      <p className="text-[10px] font-medium text-indigo-300 capitalize">{ex.format} · {ex.pilar ?? "—"}</p>
                      <p className="text-xs text-slate-300 line-clamp-2">{ex.caption}</p>
                      {ex.visualDesign?.promptHint && (
                        <p className="text-[9px] text-slate-500 mt-0.5 line-clamp-1 font-mono">{ex.visualDesign.promptHint}</p>
                      )}
                    </div>
                  </div>
                ))}
                {/* toneExamples legados */}
                {(mem.toneExamples ?? []).slice(0, 3).map((ex, i) => (
                  <div key={`tone-${i}`} className="bg-slate-800/60 rounded-lg px-2.5 py-1.5">
                    <p className="text-xs text-slate-300 line-clamp-2">{ex}</p>
                  </div>
                ))}
                {(mem.examples?.length ?? 0) === 0 && (mem.toneExamples?.length ?? 0) === 0 && (
                  <p className="text-xs text-slate-600 text-center py-2">
                    <BookOpen className="w-4 h-4 mx-auto mb-1" />
                    Aprove posts para criar memória
                  </p>
                )}
              </>
            ) : (
              (mem.rejectedPatterns ?? []).slice(0, 5).map((rp, i) => (
                <div key={i} className="bg-slate-800/60 rounded-lg px-2.5 py-1.5">
                  <p className="text-xs text-red-400 font-medium line-clamp-1">{rp.pattern}</p>
                  {rp.reason && <p className="text-xs text-slate-500 mt-0.5">{rp.reason}</p>}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </BaseNodeV3>
  );
}
