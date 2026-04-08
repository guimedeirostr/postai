"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { GalleryHorizontal, Loader2, Download, Hash, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { GeneratedCarousel, CarouselSlide } from "@/types";

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  pending:         { label: "Pendente",   className: "bg-slate-50 text-slate-500 border-slate-200" },
  generating_hook: { label: "Gerando…",  className: "bg-amber-50 text-amber-700 border-amber-200" },
  composing:       { label: "Compondo…", className: "bg-orange-50 text-orange-700 border-orange-200" },
  ready:           { label: "Pronto",    className: "bg-green-50 text-green-700 border-green-200" },
  failed:          { label: "Falhou",    className: "bg-red-50 text-red-600 border-red-200" },
};

function CarouselDetailModal({
  carousel,
  onClose,
}: {
  carousel: GeneratedCarousel;
  onClose: () => void;
}) {
  const [selected, setSelected]           = useState(0);
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [copied, setCopied]               = useState(false);

  const slides   = carousel.slides ?? [];
  const ready    = slides.filter(s => s.composed_url);
  const current  = slides[selected] as CarouselSlide | undefined;

  async function downloadSlide(slide: CarouselSlide) {
    if (!slide.composed_url) return;
    const res  = await fetch(slide.composed_url);
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `carrossel-slide-${slide.index + 1}.jpg`; a.click();
    URL.revokeObjectURL(url);
  }

  async function downloadAll() {
    setDownloadProgress(0);
    for (let i = 0; i < ready.length; i++) {
      await downloadSlide(ready[i]);
      setDownloadProgress(i + 1);
      if (i < ready.length - 1) await new Promise(r => setTimeout(r, 350));
    }
    setDownloadProgress(null);
  }

  async function copyCaption() {
    await navigator.clipboard.writeText(carousel.caption ?? "");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b sticky top-0 bg-white z-10 rounded-t-2xl">
          <div>
            <p className="font-semibold text-slate-900">{carousel.topic || carousel.theme}</p>
            <p className="text-xs text-slate-400">{carousel.client_name} · {carousel.slide_count} slides</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl font-bold px-2">✕</button>
        </div>

        <div className="p-6 space-y-5">
          {/* Main preview */}
          <div className="aspect-[4/5] w-full max-w-sm mx-auto rounded-2xl overflow-hidden bg-slate-100 border">
            {current?.composed_url ? (
              <img src={current.composed_url} alt={`Slide ${selected + 1}`} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-slate-400">
                <Layers className="w-10 h-10 opacity-30" />
                <p className="text-sm">Slide {selected + 1}</p>
                <p className="text-xs font-medium">{current?.headline}</p>
              </div>
            )}
          </div>

          {/* Slide info */}
          {current && (
            <div className="bg-slate-50 rounded-xl p-3 text-sm space-y-1">
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  current.type === "hook" ? "bg-violet-100 text-violet-700"
                  : current.type === "cta" ? "bg-emerald-100 text-emerald-700"
                  : "bg-slate-200 text-slate-600"
                }`}>
                  {current.type === "hook" ? "🎣 Hook" : current.type === "cta" ? "✅ CTA" : `📌 Slide ${selected + 1}`}
                </span>
                {current.composed_url && (
                  <button onClick={() => downloadSlide(current)}
                    className="text-xs text-violet-600 hover:text-violet-800 flex items-center gap-1 ml-auto">
                    <Download className="w-3 h-3" /> Baixar este
                  </button>
                )}
              </div>
              <p className="font-semibold text-slate-800">{current.headline}</p>
              {current.body_text && <p className="text-slate-500 text-xs leading-relaxed">{current.body_text}</p>}
              {current.cta_text && <p className="text-emerald-700 text-xs font-semibold">{current.cta_text}</p>}
            </div>
          )}

          {/* Thumbnail strip */}
          <div className="flex gap-2 overflow-x-auto pb-1">
            {slides.map((slide, i) => (
              <button key={i} type="button" onClick={() => setSelected(i)}
                className={`flex-none w-16 h-16 rounded-xl overflow-hidden border-2 transition-all ${
                  selected === i ? "border-violet-500 ring-2 ring-violet-200" : "border-transparent hover:border-slate-300"
                }`}>
                {slide.composed_url ? (
                  <img src={slide.composed_url} alt={`Slide ${i+1}`} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-slate-100 flex items-center justify-center">
                    <span className="text-xs text-slate-400 font-bold">{i+1}</span>
                  </div>
                )}
              </button>
            ))}
          </div>

          {/* Caption */}
          {carousel.caption && (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-700">Caption</p>
                <button onClick={copyCaption} className="text-xs text-violet-600 hover:text-violet-800">
                  {copied ? "✓ Copiado!" : "Copiar"}
                </button>
              </div>
              <div className="bg-slate-50 rounded-xl p-3 text-sm text-slate-700 whitespace-pre-wrap leading-relaxed max-h-36 overflow-y-auto">
                {carousel.caption}
              </div>
            </div>
          )}

          {/* Hashtags */}
          {carousel.hashtags?.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              <Hash className="w-3.5 h-3.5 text-slate-400 mt-1" />
              {carousel.hashtags.map((tag, i) => (
                <span key={i} className="text-xs bg-violet-50 text-violet-700 px-2 py-1 rounded-full">#{tag}</span>
              ))}
            </div>
          )}

          {/* Download all */}
          <Button
            onClick={downloadAll}
            disabled={ready.length === 0 || downloadProgress !== null}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl h-11"
          >
            {downloadProgress !== null ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Baixando {downloadProgress}/{ready.length}...</>
            ) : (
              <><Download className="w-4 h-4 mr-2" />Baixar todos ({ready.length} slides)</>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function CarouselsPage() {
  const [carousels, setCarousels] = useState<GeneratedCarousel[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [selected,  setSelected]  = useState<GeneratedCarousel | null>(null);

  async function load() {
    setLoading(true);
    const res  = await fetch("/api/carousels");
    const data = await res.json() as { carousels?: GeneratedCarousel[] };
    setCarousels(data.carousels ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const hookSlide = (c: GeneratedCarousel) =>
    c.slides?.find(s => s.type === "hook" || s.index === 0);

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Carrosseis</h1>
        <p className="text-slate-500 mt-1">Carrosseis gerados para seus clientes</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-violet-400" />
        </div>
      ) : carousels.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center text-slate-400 gap-3">
          <GalleryHorizontal className="w-10 h-10 text-slate-300" />
          <p className="font-medium text-slate-600">Nenhum carrossel ainda</p>
          <p className="text-sm">Vá em Clientes e clique em "Carrossel" para criar</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {carousels.map(carousel => {
            const hook   = hookSlide(carousel);
            const status = STATUS_BADGE[carousel.status] ?? STATUS_BADGE.pending;
            const ready  = (carousel.slides ?? []).filter(s => s.composed_url).length;

            return (
              <Card key={carousel.id}
                className="border-0 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => setSelected(carousel)}>
                <CardContent className="p-0">
                  {/* Hook thumbnail */}
                  <div className="aspect-[4/5] w-full rounded-t-xl overflow-hidden bg-slate-100">
                    {hook?.composed_url ? (
                      <img src={hook.composed_url} alt="Hook" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-slate-400">
                        <GalleryHorizontal className="w-10 h-10 opacity-30" />
                        <p className="text-xs">{carousel.status === "generating_hook" ? "Gerando capa..." : "Sem preview"}</p>
                      </div>
                    )}
                  </div>

                  <div className="p-4 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-slate-900 text-sm truncate flex-1">
                        {carousel.topic || carousel.theme}
                      </p>
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium flex-none ${status.className}`}>
                        {status.label}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400">{carousel.client_name}</p>
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span>{carousel.slide_count} slides</span>
                      {carousel.status === "ready" && (
                        <span className="text-emerald-600 font-medium">{ready} prontos</span>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {selected && (
        <CarouselDetailModal
          carousel={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
