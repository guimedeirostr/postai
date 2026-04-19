"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { CompiledPromptV3, SlideV3 } from "@/types";

const SOURCE_BADGE: Record<string, { label: string; className: string }> = {
  recipe:   { label: "Recipe",    className: "bg-purple-100 text-purple-700" },
  brandkit: { label: "Brand Kit", className: "bg-violet-100 text-violet-700" },
  plan:     { label: "Plano",     className: "bg-blue-100 text-blue-700"    },
  ml:       { label: "IA",        className: "bg-green-100 text-green-700"  },
  user:     { label: "Manual",    className: "bg-orange-100 text-orange-700" },
};

const MODEL_BADGE: Record<string, string> = {
  "flux-1.1-pro": "bg-sky-100 text-sky-700",
  "ideogram-3":   "bg-pink-100 text-pink-700",
  "nano-banana":  "bg-yellow-100 text-yellow-700",
};

export default function CompilerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: postId } = React.use(params);

  const [slides,   setSlides]   = useState<SlideV3[]>([]);
  const [compiled, setCompiled] = useState<(CompiledPromptV3 & { slideOrder: number })[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/posts/${postId}/compiler`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); return; }
        setSlides(d.slides ?? []);
        setCompiled(d.compiled ?? []);
      })
      .catch(() => setError("Erro ao carregar"))
      .finally(() => setLoading(false));
  }, [postId]);

  if (loading) return (
    <div className="flex justify-center items-center py-32">
      <Loader2 className="w-6 h-6 animate-spin text-violet-400" />
    </div>
  );

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <Link href={`/posts/${postId}`} className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-violet-600 mb-6 transition-colors">
        <ArrowLeft className="w-3.5 h-3.5" /> Timeline do Post
      </Link>

      <h1 className="text-xl font-bold text-slate-900 mb-1">Prompt Compiler V3</h1>
      <p className="text-sm text-slate-400 mb-8">11 slots determinísticos por slide. Fonte de cada slot rastreada.</p>

      {error && <p className="text-red-500 text-sm">{error}</p>}

      {compiled.length === 0 && !error && (
        <div className="text-center py-20 text-slate-400">
          <Info className="w-8 h-8 mx-auto mb-3 text-slate-300" />
          <p className="text-sm">Nenhum prompt compilado encontrado. Este post precisa usar o pipeline V3.</p>
        </div>
      )}

      <div className="space-y-6">
        {compiled.map((cp, idx) => {
          const slideLabel = `Slide ${cp.slideOrder ?? idx + 1}`;
          const isOpen     = expanded === cp.slideId;
          return (
            <div key={cp.slideId} className="border border-slate-200 rounded-2xl overflow-hidden">
              {/* Header */}
              <button
                onClick={() => setExpanded(isOpen ? null : cp.slideId)}
                className="w-full flex items-center justify-between px-5 py-4 bg-slate-50 hover:bg-slate-100 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-slate-800">{slideLabel}</span>
                  <Badge className={`text-xs border-0 ${MODEL_BADGE[cp.modelTarget] ?? "bg-slate-100 text-slate-600"}`}>
                    {cp.modelTarget}
                  </Badge>
                  <Badge className="text-xs border-0 bg-slate-200 text-slate-600">
                    v{cp.version}
                  </Badge>
                </div>
                <span className="text-xs text-slate-400">{isOpen ? "▲" : "▼"}</span>
              </button>

              {isOpen && (
                <div className="p-5 space-y-4">
                  {/* Slots table */}
                  <div className="rounded-xl overflow-hidden border border-slate-100">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50">
                          <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500 w-40">Slot</th>
                          <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500">Valor</th>
                          <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500 w-24">Fonte</th>
                          <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500 w-20">Conf.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cp.slots.map(slot => {
                          const src = SOURCE_BADGE[slot.source] ?? { label: slot.source, className: "bg-slate-100 text-slate-600" };
                          return (
                            <tr key={slot.key} className="border-t border-slate-50 hover:bg-slate-50/50">
                              <td className="px-4 py-2 font-mono text-xs text-slate-500 font-medium">{slot.key}</td>
                              <td className="px-4 py-2 text-slate-700 text-xs leading-relaxed">{slot.value || <span className="text-slate-300 italic">—</span>}</td>
                              <td className="px-4 py-2">
                                <Badge className={`text-[10px] border-0 ${src.className}`}>{src.label}</Badge>
                              </td>
                              <td className="px-4 py-2 text-xs text-slate-400">
                                {slot.confidence != null ? `${Math.round(slot.confidence * 100)}%` : "—"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Final text */}
                  <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Prompt Final Montado</p>
                    <pre className="text-xs text-slate-700 bg-slate-50 rounded-xl p-4 whitespace-pre-wrap leading-relaxed border border-slate-100">
                      {cp.finalText}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {slides.length > 0 && compiled.length === 0 && (
        <div className="mt-6 text-sm text-slate-500">
          {slides.length} slide(s) encontrado(s), mas nenhum prompt compilado ainda.
        </div>
      )}
    </div>
  );
}
