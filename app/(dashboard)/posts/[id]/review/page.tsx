"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, X, RefreshCw, Loader2, ImageIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { SlideV3, PostV3 } from "@/types";

type Decision = "approved" | "rejected" | "regenerated";

interface SlideDecision {
  slideId:  string;
  decision: Decision;
}

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  approved:    { label: "Aprovado",   className: "bg-green-100 text-green-700" },
  rejected:    { label: "Rejeitado",  className: "bg-red-100 text-red-600"    },
  regenerated: { label: "Regerado",   className: "bg-amber-100 text-amber-700" },
};

export default function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: postId } = React.use(params);

  const [slides,    setSlides]    = useState<SlideV3[]>([]);
  const [postData,  setPostData]  = useState<PostV3 | null>(null);
  const [clientId,  setClientId]  = useState<string>("");
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [saving,    setSaving]    = useState<Record<string, boolean>>({});
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [saved,     setSaved]     = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetch(`/api/posts/${postId}/slides`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); return; }
        setSlides(d.slides ?? []);
        setClientId(d.clientId ?? "");
        setPostData(d.postData ?? null);
      })
      .catch(() => setError("Erro ao carregar slides"))
      .finally(() => setLoading(false));
  }, [postId]);

  async function recordDecision(slide: SlideV3, decision: Decision) {
    setSaving(p => ({ ...p, [slide.id]: true }));
    setDecisions(p => ({ ...p, [slide.id]: decision }));

    try {
      await fetch("/api/outcomes/record", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          clientId,
          compiledPromptId: "",
          slideId:          slide.id,
          slotsSnapshot:    [],
          criticScore:      slide.criticScore ?? 0,
          humanDecision:    decision,
        }),
      });
      setSaved(p => ({ ...p, [slide.id]: true }));
    } catch { /* non-fatal */ }
    finally {
      setSaving(p => ({ ...p, [slide.id]: false }));
    }
  }

  const allDecided  = slides.length > 0 && slides.every(s => decisions[s.id]);
  const totalApproved = Object.values(decisions).filter(d => d === "approved").length;

  if (loading) return (
    <div className="flex justify-center items-center py-32">
      <Loader2 className="w-6 h-6 animate-spin text-violet-400" />
    </div>
  );

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <Link href={`/posts/${postId}`} className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-violet-600 mb-6 transition-colors">
        <ArrowLeft className="w-3.5 h-3.5" /> Timeline do Post
      </Link>

      <div className="mb-8">
        <h1 className="text-xl font-bold text-slate-900">Revisão de Slides</h1>
        <p className="text-sm text-slate-400 mt-1">
          Aprove, rejeite ou regenere cada slide. Cada decisão treina o modelo.
        </p>
      </div>

      {error && <p className="text-red-500 text-sm mb-6">{error}</p>}

      {slides.length === 0 && !error && (
        <div className="text-center py-20 text-slate-400">
          <ImageIcon className="w-8 h-8 mx-auto mb-3 text-slate-300" />
          <p className="text-sm">Nenhum slide gerado ainda. Execute o pipeline no Canvas primeiro.</p>
        </div>
      )}

      <div className="space-y-6">
        {slides.map((slide, idx) => {
          const decision = decisions[slide.id];
          const isSaving = saving[slide.id];
          const wasSaved = saved[slide.id];

          return (
            <div key={slide.id} className={[
              "border rounded-2xl overflow-hidden transition-all",
              decision === "approved"    ? "border-green-200 bg-green-50/30" :
              decision === "rejected"    ? "border-red-200 bg-red-50/30"     :
              decision === "regenerated" ? "border-amber-200 bg-amber-50/30" :
              "border-slate-200",
            ].join(" ")}>
              <div className="p-5">
                <div className="flex items-start gap-4">
                  {/* Thumbnail */}
                  <div className="w-24 h-24 rounded-xl overflow-hidden border bg-slate-100 flex-none">
                    {slide.assetUrl ? (
                      <img src={slide.assetUrl} alt={`Slide ${idx + 1}`} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <ImageIcon className="w-6 h-6 text-slate-300" />
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-semibold text-slate-800 text-sm">Slide {idx + 1}</span>
                      {slide.criticScore != null && (
                        <Badge className={`text-xs border-0 ${slide.criticScore >= 7 ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                          Score: {slide.criticScore}/10
                        </Badge>
                      )}
                      {decision && (
                        <Badge className={`text-xs border-0 ${STATUS_BADGE[decision]?.className}`}>
                          {STATUS_BADGE[decision]?.label}
                          {wasSaved && " ✓"}
                        </Badge>
                      )}
                    </div>
                    {slide.copy && (
                      <p className="text-xs text-slate-500 line-clamp-2 mb-3">{slide.copy}</p>
                    )}

                    {/* Action buttons */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => recordDecision(slide, "approved")}
                        disabled={isSaving}
                        className={[
                          "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                          decision === "approved"
                            ? "bg-green-600 text-white"
                            : "bg-green-100 text-green-700 hover:bg-green-200",
                        ].join(" ")}
                      >
                        {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                        Aprovar
                      </button>
                      <button
                        onClick={() => recordDecision(slide, "rejected")}
                        disabled={isSaving}
                        className={[
                          "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                          decision === "rejected"
                            ? "bg-red-600 text-white"
                            : "bg-red-100 text-red-600 hover:bg-red-200",
                        ].join(" ")}
                      >
                        <X className="w-3 h-3" />
                        Rejeitar
                      </button>
                      <button
                        onClick={() => recordDecision(slide, "regenerated")}
                        disabled={isSaving}
                        className={[
                          "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                          decision === "regenerated"
                            ? "bg-amber-500 text-white"
                            : "bg-slate-100 text-slate-600 hover:bg-slate-200",
                        ].join(" ")}
                      >
                        <RefreshCw className="w-3 h-3" />
                        Regenerar
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {allDecided && (
        <div className="mt-8 p-5 bg-violet-50 border border-violet-200 rounded-2xl text-center">
          <p className="font-semibold text-violet-800 mb-1">
            Revisão concluída — {totalApproved}/{slides.length} slides aprovados
          </p>
          <p className="text-xs text-violet-600">
            As decisões já foram salvas e vão treinar o modelo na próxima geração.
          </p>
          <Link
            href="/posts"
            className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium rounded-xl transition-colors"
          >
            Ver todos os posts
          </Link>
        </div>
      )}
    </div>
  );
}
