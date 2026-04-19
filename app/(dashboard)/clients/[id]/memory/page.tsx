"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft, Loader2, Plus, Trash2, Save,
  Brain, BarChart2, AlertTriangle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ClientMemory, PromptSlotKey } from "@/types";

const SLOT_LABELS: Partial<Record<PromptSlotKey, string>> = {
  FORMATO:          "Formato",
  ESTETICA_MAE:     "Estética Mãe",
  REF_ESTILO:       "Ref. Estilo",
  IMAGEM_PRINCIPAL: "Imagem Principal",
  ATMOSFERA:        "Atmosfera",
  COMPOSICAO:       "Composição",
  PALETA:           "Paleta",
  HIERARQUIA_TIPO:  "Hierarquia Tipo",
  TEXTO_LITERAL:    "Texto Literal",
  ELEMENTOS_GRAFICOS: "Elementos Gráficos",
  ACABAMENTO:       "Acabamento",
};

export default function MemoryPage() {
  const params    = useParams();
  const clientId  = params.id as string;

  const [memory,      setMemory]      = useState<ClientMemory | null>(null);
  const [clientName,  setClientName]  = useState("");
  const [loading,     setLoading]     = useState(true);
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [newTone,     setNewTone]     = useState("");
  const [toneList,    setToneList]    = useState<string[]>([]);

  useEffect(() => {
    fetch(`/api/clients/${clientId}/memory`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); return; }
        setMemory(d.memory ?? null);
        setClientName(d.clientName ?? "");
        setToneList(d.memory?.toneExamples ?? []);
      })
      .catch(() => setError("Erro ao carregar memória"))
      .finally(() => setLoading(false));
  }, [clientId]);

  async function saveTones() {
    setSaving(true);
    try {
      await fetch(`/api/clients/${clientId}/memory`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ toneExamples: toneList }),
      });
    } catch { /* non-fatal */ }
    finally { setSaving(false); }
  }

  function addTone() {
    const t = newTone.trim();
    if (!t) return;
    setToneList(prev => [...prev, t]);
    setNewTone("");
  }

  const slotWeights = memory?.slotWeights as Record<PromptSlotKey, { approvals: number; rejections: number; total: number }> | undefined;

  if (loading) return (
    <div className="flex justify-center items-center py-32">
      <Loader2 className="w-6 h-6 animate-spin text-violet-400" />
    </div>
  );

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <Link href={`/clients/${clientId}/brand`} className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-violet-600 mb-6 transition-colors">
        <ArrowLeft className="w-3.5 h-3.5" /> Brand Kit
      </Link>

      <div className="mb-8 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center">
          <Brain className="w-5 h-5 text-violet-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Memória do Cliente</h1>
          <p className="text-sm text-slate-400">{clientName} · Aprendizado contínuo por aprovações</p>
        </div>
      </div>

      {error && <p className="text-red-500 text-sm mb-6">{error}</p>}

      {!memory && !error && (
        <div className="text-center py-20 text-slate-400">
          <Brain className="w-8 h-8 mx-auto mb-3 text-slate-300" />
          <p className="text-sm">Ainda sem memória. Aprove posts no Canvas para começar a treinar.</p>
        </div>
      )}

      {memory && (
        <div className="space-y-8">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "Aprovados",  value: memory.stats?.approved ?? 0,  color: "text-green-600", bg: "bg-green-50" },
              { label: "Rejeitados", value: memory.stats?.rejected ?? 0,  color: "text-red-600",   bg: "bg-red-50"   },
              { label: "Score médio",value: (memory.stats?.avgCriticScore ?? 0).toFixed(1), color: "text-violet-600", bg: "bg-violet-50" },
            ].map(({ label, value, color, bg }) => (
              <div key={label} className={`rounded-xl ${bg} p-4`}>
                <p className="text-xs text-slate-500 mb-1">{label}</p>
                <p className={`text-2xl font-bold ${color}`}>{value}</p>
              </div>
            ))}
          </div>

          {/* Tom de Voz */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-slate-800 flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-violet-400" /> Exemplos de Tom de Voz
              </h2>
              <Button
                size="sm"
                variant="outline"
                onClick={saveTones}
                disabled={saving}
                className="text-xs"
              >
                {saving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Save className="w-3 h-3 mr-1" />}
                Salvar
              </Button>
            </div>

            <div className="space-y-2 mb-3">
              {toneList.map((ex, idx) => (
                <div key={idx} className="flex items-start gap-2 p-3 bg-slate-50 rounded-xl">
                  <p className="flex-1 text-sm text-slate-700 leading-relaxed">{ex}</p>
                  <button
                    onClick={() => setToneList(prev => prev.filter((_, i) => i !== idx))}
                    className="text-slate-300 hover:text-red-500 transition-colors mt-0.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={newTone}
                onChange={e => setNewTone(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addTone()}
                placeholder="Adicionar exemplo de tom de voz…"
                className="flex-1 text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-400"
              />
              <Button size="sm" onClick={addTone} variant="outline">
                <Plus className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>

          {/* Padrões Rejeitados */}
          {(memory.rejectedPatterns?.length ?? 0) > 0 && (
            <div>
              <h2 className="font-semibold text-slate-800 flex items-center gap-2 mb-3">
                <AlertTriangle className="w-4 h-4 text-red-400" /> Padrões Rejeitados
              </h2>
              <div className="space-y-2">
                {memory.rejectedPatterns?.map((rp, idx) => (
                  <div key={idx} className="p-3 bg-red-50 border border-red-100 rounded-xl">
                    <p className="text-sm font-medium text-red-700">{rp.pattern}</p>
                    {rp.reason && <p className="text-xs text-red-500 mt-0.5">{rp.reason}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Slot Weights ML */}
          {slotWeights && Object.keys(slotWeights).length > 0 && (
            <div>
              <h2 className="font-semibold text-slate-800 flex items-center gap-2 mb-3">
                <Brain className="w-4 h-4 text-violet-400" /> Pesos dos Slots (Modelo A)
              </h2>
              <div className="rounded-xl overflow-hidden border border-slate-100">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500">Slot</th>
                      <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500">Aprova.</th>
                      <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500">Rejeit.</th>
                      <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500">Peso</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(Object.entries(slotWeights) as [PromptSlotKey, { approvals: number; rejections: number; total: number }][])
                      .sort(([, a], [, b]) => b.total - a.total)
                      .map(([key, entry]) => {
                        const weight = entry.total >= 5 ? (entry.approvals - entry.rejections) / entry.total : null;
                        return (
                          <tr key={key} className="border-t border-slate-50">
                            <td className="px-4 py-2 font-mono text-xs text-slate-600">{SLOT_LABELS[key] ?? key}</td>
                            <td className="px-4 py-2 text-green-700 text-xs">{entry.approvals}</td>
                            <td className="px-4 py-2 text-red-600 text-xs">{entry.rejections}</td>
                            <td className="px-4 py-2">
                              {weight != null ? (
                                <Badge className={`text-[10px] border-0 ${weight > 0 ? "bg-green-100 text-green-700" : weight < 0 ? "bg-red-100 text-red-600" : "bg-slate-100 text-slate-600"}`}>
                                  {weight > 0 ? "+" : ""}{(weight * 100).toFixed(0)}%
                                </Badge>
                              ) : (
                                <span className="text-xs text-slate-300">— pouco dados</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
