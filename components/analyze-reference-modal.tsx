"use client";

/**
 * AnalyzeReferenceModal
 *
 * - Formato Feed/Stories/Reels: upload de 1 imagem, análise individual
 * - Formato Carrossel: upload de até 20 slides, Claude analisa todos juntos
 *   e extrai o padrão visual consolidado da sequência
 */

import { useState, useEffect, useRef } from "react";
import { X, ScanSearch, Loader2, Check, ExternalLink, Palette, Type, Layout, Camera, Dna, Sparkles, ShieldCheck, Upload, GalleryHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import type { BrandProfile, BrandDNA } from "@/types";

interface Props {
  client:  BrandProfile;
  onClose: () => void;
  onSaved: () => void;
}

interface AnalysisResult {
  id:                    string;
  visual_prompt:         string;
  layout_prompt:         string;
  visual_headline_style: string;
  pilar:                 string;
  format:                string;
  description:           string;
  color_mood:            string;
  composition_zone:      string;
  blueprint:             Record<string, unknown>;
}

interface SlideImage { b64: string; mime: string; preview: string; }

const FORMAT_OPTIONS = [
  { value: "feed",        label: "Feed",      icon: "🖼️" },
  { value: "carousel",    label: "Carrossel", icon: "🎠" },
  { value: "stories",     label: "Stories",   icon: "📱" },
  { value: "reels_cover", label: "Reels",     icon: "🎬" },
];

const PILAR_COLORS: Record<string, string> = {
  "Produto":      "bg-blue-100 text-blue-700",
  "Educação":     "bg-emerald-100 text-emerald-700",
  "Prova Social": "bg-amber-100 text-amber-700",
  "Bastidores":   "bg-orange-100 text-orange-700",
  "Engajamento":  "bg-pink-100 text-pink-700",
  "Promoção":     "bg-red-100 text-red-700",
  "Trend":        "bg-purple-100 text-purple-700",
};

const MAX_CAROUSEL_SLIDES = 20;

// Comprime uma imagem para base64 (max 1200px, JPEG 85%)
function compressToB64(file: File): Promise<SlideImage> {
  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const MAX = 1200;
      let { width, height } = img;
      if (width > MAX || height > MAX) {
        if (width > height) { height = Math.round(height * MAX / width); width = MAX; }
        else                { width  = Math.round(width  * MAX / height); height = MAX; }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
      resolve({ b64: dataUrl.split(",")[1], mime: "image/jpeg", preview: dataUrl });
    };
    img.onerror = () => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const [header, b64] = dataUrl.split(",");
        const mime = header.match(/data:([^;]+)/)?.[1] ?? "image/jpeg";
        resolve({ b64, mime, preview: dataUrl });
      };
      reader.readAsDataURL(file);
    };
    img.src = objectUrl;
  });
}

export function AnalyzeReferenceModal({ client, onClose, onSaved }: Props) {
  const [tab, setTab] = useState<"add" | "synthesize">("add");

  // ── Estado — Adicionar Referência (single) ────────────────────────────────
  const [postUrl,       setPostUrl]       = useState("");
  const [imageUrl,      setImageUrl]      = useState("");
  const [uploadB64,     setUploadB64]     = useState<string | null>(null);
  const [uploadMime,    setUploadMime]    = useState("image/jpeg");
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [format,        setFormat]        = useState("feed");
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState<string | null>(null);
  const [result,        setResult]        = useState<AnalysisResult | null>(null);

  // ── Estado — Carrossel (multi-imagem) ────────────────────────────────────
  const [carouselSlides, setCarouselSlides] = useState<SlideImage[]>([]);
  const fileRef        = useRef<HTMLInputElement>(null);
  const carouselRef    = useRef<HTMLInputElement>(null);

  // ── Estado — Síntese de DNA ───────────────────────────────────────────────
  const [currentDna,       setCurrentDna]       = useState<BrandDNA | null>(null);
  const [examplesCount,    setExamplesCount]    = useState(0);
  const [dnaLoading,       setDnaLoading]       = useState(false);
  const [synthesizing,     setSynthesizing]     = useState(false);
  const [synthesisError,   setSynthesisError]   = useState<string | null>(null);
  const [synthesisMessage, setSynthesisMessage] = useState<string | null>(null);

  // Reset slides when switching away from carousel
  useEffect(() => {
    if (format !== "carousel") setCarouselSlides([]);
  }, [format]);

  useEffect(() => {
    if (tab !== "synthesize") return;
    setDnaLoading(true);
    fetch(`/api/clients/${client.id}/synthesize-dna`)
      .then(r => r.json())
      .then((data: { dna?: BrandDNA; examples_count?: number }) => {
        setCurrentDna(data.dna ?? null);
        setExamplesCount(data.examples_count ?? 0);
      })
      .catch(() => {})
      .finally(() => setDnaLoading(false));
  }, [tab, client.id]);

  async function handleSynthesize() {
    setSynthesizing(true);
    setSynthesisError(null);
    setSynthesisMessage(null);
    try {
      const res  = await fetch(`/api/clients/${client.id}/synthesize-dna`, { method: "POST" });
      const data = await res.json() as { dna?: BrandDNA; message?: string; error?: string };
      if (!res.ok) { setSynthesisError(data.error ?? "Erro na síntese"); return; }
      setCurrentDna(data.dna ?? null);
      setSynthesisMessage(data.message ?? "DNA sintetizado com sucesso!");
      onSaved();
    } catch {
      setSynthesisError("Erro inesperado. Tente novamente.");
    } finally {
      setSynthesizing(false);
    }
  }

  // ── Upload helpers ────────────────────────────────────────────────────────
  function handleUploadFile(file: File) {
    setError(null);
    setPostUrl("");
    compressToB64(file).then(({ b64, mime, preview }) => {
      setUploadB64(b64);
      setUploadMime(mime);
      setUploadPreview(preview);
    });
  }

  async function handleCarouselFiles(files: File[]) {
    setError(null);
    const remaining = MAX_CAROUSEL_SLIDES - carouselSlides.length;
    const toProcess = files.slice(0, remaining);
    const compressed = await Promise.all(toProcess.map(compressToB64));
    setCarouselSlides(prev => [...prev, ...compressed].slice(0, MAX_CAROUSEL_SLIDES));
  }

  function removeCarouselSlide(idx: number) {
    setCarouselSlides(prev => prev.filter((_, i) => i !== idx));
  }

  function clearUpload() {
    setUploadB64(null);
    setUploadMime("image/jpeg");
    setUploadPreview(null);
  }

  // ── Analyze ───────────────────────────────────────────────────────────────
  async function handleAnalyze() {
    const isCarousel = format === "carousel";
    if (isCarousel && carouselSlides.length === 0) return;
    if (!isCarousel && !uploadB64 && !postUrl.trim()) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      let body: Record<string, unknown> = { format };

      if (isCarousel) {
        body.carousel_slides = carouselSlides.map(s => ({ b64: s.b64, mime: s.mime }));
      } else if (uploadB64) {
        body.image_base64 = uploadB64;
        body.image_type   = uploadMime;
      } else {
        const trimmed = postUrl.trim();
        if (/instagram\.com\/(p|reel|tv)\//.test(trimmed)) body.source_url = trimmed;
        else body.image_url = trimmed;
      }

      const res  = await fetch(`/api/clients/${client.id}/analyze-reference`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });

      const data = await res.json() as AnalysisResult & { error?: string; image_url?: string };
      if (!res.ok) { setError(data.error ?? "Erro na análise"); return; }

      setImageUrl(data.image_url ?? "");
      setResult(data);
      onSaved();
    } catch {
      setError("Erro inesperado. Verifique a imagem e tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  function handleNew() {
    setResult(null);
    setPostUrl("");
    setImageUrl("");
    clearUpload();
    setCarouselSlides([]);
    setError(null);
    setFormat("feed");
  }

  const metadata       = result?.blueprint?.metadata as Record<string, string | string[]> | undefined;
  const dominantColors = (metadata?.dominant_colors as string[] | undefined) ?? [];
  const isCarousel     = format === "carousel";
  const canAnalyze     = isCarousel
    ? carouselSlides.length > 0
    : (!!uploadB64 || !!postUrl.trim());

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: client.primary_color }}>
              <ScanSearch className="w-3.5 h-3.5 text-white" />
            </div>
            <div>
              <p className="font-semibold text-slate-900 text-sm">DNA Visual — {client.name}</p>
              <p className="text-xs text-slate-400">Adicione referências ou sintetize o padrão da marca</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex gap-1 p-1.5 bg-slate-100 mx-6 mt-4 rounded-xl">
          <button onClick={() => setTab("add")}
            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
              tab === "add" ? "bg-white text-violet-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}>
            <ScanSearch className="w-3.5 h-3.5" /> Adicionar Referência
          </button>
          <button onClick={() => setTab("synthesize")}
            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
              tab === "synthesize" ? "bg-white text-violet-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}>
            <Dna className="w-3.5 h-3.5" /> Sintetizar DNA
            {currentDna && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />}
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">

          {/* ── TAB: Sintetizar DNA ── */}
          {tab === "synthesize" && (
            <div className="space-y-5">
              {dnaLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-5 h-5 animate-spin text-violet-400 mr-2" />
                  <span className="text-sm text-slate-400">Carregando DNA...</span>
                </div>
              ) : (
                <>
                  <div className={`p-4 rounded-xl border ${currentDna ? "bg-emerald-50 border-emerald-100" : "bg-slate-50 border-slate-200"}`}>
                    <div className="flex items-start gap-3">
                      <Dna className={`w-5 h-5 mt-0.5 flex-shrink-0 ${currentDna ? "text-emerald-600" : "text-slate-400"}`} />
                      <div>
                        {currentDna ? (
                          <>
                            <p className="text-sm font-semibold text-emerald-700">DNA ativo — {currentDna.examples_count} posts analisados</p>
                            <p className="text-xs text-emerald-600 mt-0.5">Confiança: {currentDna.confidence_score}/100 · Art Director usa este DNA em todas as gerações</p>
                          </>
                        ) : (
                          <>
                            <p className="text-sm font-semibold text-slate-700">Sem DNA sintetizado ainda</p>
                            <p className="text-xs text-slate-500 mt-0.5">
                              {examplesCount < 3
                                ? `Adicione pelo menos 3 referências (você tem ${examplesCount}) para sintetizar o DNA.`
                                : `Você tem ${examplesCount} referências — pronto para sintetizar!`}
                            </p>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="p-4 bg-violet-50 border border-violet-100 rounded-xl space-y-2">
                    <p className="text-xs font-semibold text-violet-700 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5" /> Como funciona o Machine Learning
                    </p>
                    <p className="text-xs text-violet-600 leading-relaxed">
                      O agente de síntese analisa <strong>visualmente</strong> todos os posts de referência desta marca e extrai os <strong>padrões consistentes</strong>: onde o texto sempre vive, qual é o background típico, o estilo fotográfico, a hierarquia tipográfica.
                    </p>
                    <p className="text-xs text-violet-600 leading-relaxed">
                      O resultado alimenta o <strong>Art Director</strong> como lei primária em toda geração futura. Quanto mais referências, mais preciso o DNA.
                    </p>
                  </div>

                  <Button onClick={handleSynthesize} disabled={synthesizing || examplesCount < 3}
                    className="w-full bg-violet-600 hover:bg-violet-700 text-white">
                    {synthesizing
                      ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Analisando {examplesCount} posts com IA...</>
                      : currentDna
                      ? <><Dna className="w-4 h-4 mr-2" />Re-sintetizar DNA ({examplesCount} posts)</>
                      : <><Dna className="w-4 h-4 mr-2" />Sintetizar DNA da Marca</>}
                  </Button>

                  {synthesisError   && <p className="text-xs text-red-500 text-center">{synthesisError}</p>}
                  {synthesisMessage && (
                    <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-100 rounded-xl">
                      <Check className="w-4 h-4 text-emerald-600" />
                      <p className="text-xs text-emerald-700">{synthesisMessage}</p>
                    </div>
                  )}

                  {currentDna && (
                    <div className="space-y-3">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" /> DNA Sintetizado
                      </p>
                      <div className="p-3 bg-slate-50 rounded-xl">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Identidade Visual</p>
                        <p className="text-xs text-slate-700 leading-relaxed italic">{currentDna.brand_visual_identity}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="p-3 bg-slate-50 rounded-xl">
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Zona Dominante</p>
                          <p className="text-sm font-bold text-slate-800 capitalize">{currentDna.dominant_composition_zone}</p>
                        </div>
                        <div className="p-3 bg-slate-50 rounded-xl">
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Confiança</p>
                          <p className="text-sm font-bold text-slate-800">{currentDna.confidence_score}/100</p>
                        </div>
                      </div>
                      <div className="p-3 bg-slate-50 rounded-xl">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Regras da Marca</p>
                        <ul className="space-y-1">
                          {currentDna.design_rules.map((rule, i) => (
                            <li key={i} className="text-xs text-slate-700 flex gap-1.5">
                              <span className="text-violet-500 font-bold flex-shrink-0">{i + 1}.</span>
                              {rule}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="grid grid-cols-1 gap-2">
                        {([
                          ["Posicionamento de Texto", currentDna.text_placement_pattern],
                          ["Fundo nos Textos",        currentDna.background_treatment],
                          ["Tipografia",              currentDna.typography_pattern],
                          ["Fotografia",              currentDna.photography_style],
                          ["Cores",                   currentDna.color_treatment],
                        ] as [string, string][]).map(([label, value]) => (
                          <div key={label} className="p-3 bg-slate-50 rounded-xl">
                            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-0.5">{label}</p>
                            <p className="text-xs text-slate-700 leading-relaxed">{value}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── TAB: Adicionar Referência ── */}
          {tab === "add" && !result && (
            <>
              {/* Formato — sempre visível primeiro */}
              <div className="space-y-2">
                <Label>Formato</Label>
                <div className="grid grid-cols-4 gap-2">
                  {FORMAT_OPTIONS.map(opt => (
                    <button key={opt.value} type="button"
                      onClick={() => { setFormat(opt.value); clearUpload(); setPostUrl(""); setError(null); }}
                      className={`p-2.5 rounded-xl border-2 text-xs font-semibold transition-all flex flex-col items-center gap-1 ${
                        format === opt.value
                          ? "border-violet-500 bg-violet-50 text-violet-700"
                          : "border-slate-200 text-slate-600 hover:border-slate-300"
                      }`}>
                      <span className="text-base leading-none">{opt.icon}</span>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── CARROSSEL: upload múltiplo ── */}
              {isCarousel ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Slides do carrossel *</Label>
                    <span className="text-xs text-slate-400">
                      {carouselSlides.length}/{MAX_CAROUSEL_SLIDES} slides
                    </span>
                  </div>

                  {/* Thumbnails */}
                  {carouselSlides.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {carouselSlides.map((slide, i) => (
                        <div key={i} className="relative w-16 h-20 rounded-lg overflow-hidden border border-violet-200 flex-none">
                          <img src={slide.preview} alt={`Slide ${i + 1}`} className="w-full h-full object-cover" />
                          <button type="button" onClick={() => removeCarouselSlide(i)}
                            className="absolute top-0.5 right-0.5 bg-black/60 rounded-full p-0.5 text-white hover:bg-red-600 transition-colors">
                            <X className="w-2.5 h-2.5" />
                          </button>
                          <span className="absolute bottom-0.5 left-0.5 text-[9px] bg-black/50 text-white px-1 rounded font-bold">
                            {i + 1}
                          </span>
                        </div>
                      ))}

                      {/* Botão adicionar mais */}
                      {carouselSlides.length < MAX_CAROUSEL_SLIDES && (
                        <label
                          className="w-16 h-20 rounded-lg border-2 border-dashed border-violet-200 flex flex-col items-center justify-center cursor-pointer hover:border-violet-400 hover:bg-violet-50 transition-colors text-slate-400 flex-none"
                          onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
                          onDrop={e => {
                            e.preventDefault(); e.stopPropagation();
                            const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith("image/"));
                            if (files.length) handleCarouselFiles(files);
                          }}>
                          <Upload className="w-4 h-4 opacity-60" />
                          <span className="text-[9px] mt-0.5 font-medium">+ Mais</span>
                          <input ref={carouselRef} type="file" accept="image/*" multiple className="hidden"
                            onChange={e => {
                              const files = Array.from(e.target.files ?? []);
                              if (files.length) handleCarouselFiles(files);
                              e.target.value = "";
                            }} />
                        </label>
                      )}
                    </div>
                  )}

                  {/* Drop zone inicial */}
                  {carouselSlides.length === 0 && (
                    <label
                      className="flex flex-col items-center justify-center gap-3 py-10 border-2 border-dashed border-slate-200 rounded-xl cursor-pointer hover:border-violet-400 hover:bg-violet-50/40 transition-colors"
                      onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
                      onDrop={e => {
                        e.preventDefault(); e.stopPropagation();
                        const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith("image/"));
                        if (files.length) handleCarouselFiles(files);
                      }}>
                      <div className="w-12 h-12 rounded-2xl bg-violet-100 flex items-center justify-center">
                        <GalleryHorizontal className="w-6 h-6 text-violet-500" />
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-semibold text-slate-700">Arraste os slides ou clique para selecionar</p>
                        <p className="text-xs text-slate-400 mt-1">Selecione múltiplos arquivos de uma vez — até {MAX_CAROUSEL_SLIDES} slides</p>
                        <p className="text-xs text-slate-400">Salve cada slide do Instagram como imagem e faça upload</p>
                      </div>
                      <input type="file" accept="image/*" multiple className="hidden"
                        onChange={e => {
                          const files = Array.from(e.target.files ?? []);
                          if (files.length) handleCarouselFiles(files);
                        }} />
                    </label>
                  )}

                  {carouselSlides.length > 0 && (
                    <div className="flex items-center gap-2 p-3 bg-violet-50 border border-violet-100 rounded-xl">
                      <GalleryHorizontal className="w-4 h-4 text-violet-500 flex-none" />
                      <p className="text-xs text-violet-700">
                        <strong>{carouselSlides.length} slide{carouselSlides.length > 1 ? "s" : ""}</strong> prontos — o Claude vai analisar a sequência completa e extrair o padrão visual do carrossel.
                      </p>
                    </div>
                  )}
                </div>

              ) : (
                /* ── SINGLE IMAGE: upload + URL ── */
                <>
                  <div className="space-y-1.5">
                    <Label>Imagem de referência *</Label>
                    <label
                      className={`flex items-center gap-3 p-3 rounded-xl border-2 border-dashed cursor-pointer transition-all ${
                        uploadB64
                          ? "border-violet-400 bg-violet-50"
                          : "border-slate-200 hover:border-violet-300 hover:bg-violet-50/40"
                      }`}
                      onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
                      onDrop={e => {
                        e.preventDefault(); e.stopPropagation();
                        const file = e.dataTransfer.files?.[0];
                        if (file && file.type.startsWith("image/")) handleUploadFile(file);
                      }}>
                      <input type="file" accept="image/*" className="hidden"
                        onChange={e => { if (e.target.files?.[0]) handleUploadFile(e.target.files[0]); }} />
                      {uploadPreview ? (
                        <>
                          <img src={uploadPreview} alt="Referência" className="w-14 h-14 object-cover rounded-lg flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-violet-700">Imagem carregada ✓</p>
                            <p className="text-xs text-slate-400">Clique para trocar</p>
                          </div>
                          <button type="button" onClick={e => { e.preventDefault(); clearUpload(); }}
                            className="text-slate-400 hover:text-red-500 flex-shrink-0">
                            <X className="w-4 h-4" />
                          </button>
                        </>
                      ) : (
                        <>
                          <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                            <Camera className="w-5 h-5 text-slate-400" />
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-slate-600">Arraste ou clique para enviar</p>
                            <p className="text-xs text-slate-400">Salve o post do Instagram como imagem e faça upload</p>
                          </div>
                        </>
                      )}
                    </label>
                  </div>

                  {!uploadB64 && (
                    <div className="space-y-1.5">
                      <Label className="text-slate-500">Ou URL direta da imagem</Label>
                      <Input value={postUrl} onChange={e => setPostUrl(e.target.value)}
                        placeholder="https://... (não funciona com links do Instagram)" type="url" />
                      <p className="text-xs text-amber-600">⚠️ URLs do Instagram bloqueiam acesso server-side — prefira o upload acima.</p>
                    </div>
                  )}

                  {!uploadB64 && postUrl && (
                    <div className="rounded-xl overflow-hidden border bg-slate-50 flex items-center justify-center min-h-24">
                      <img src={postUrl} alt="Preview" className="max-h-48 object-contain"
                        onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                    </div>
                  )}
                </>
              )}

              {error && (
                <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}
            </>
          )}

          {/* ── RESULTADO DA ANÁLISE ── */}
          {tab === "add" && result && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-100 rounded-xl">
                <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                  <Check className="w-4 h-4 text-green-600" />
                </div>
                <div>
                  <p className="font-semibold text-green-800 text-sm">Análise salva com sucesso!</p>
                  <p className="text-xs text-green-600">Referência ID: {result.id}</p>
                </div>
              </div>

              {/* Preview da imagem */}
              {uploadPreview ? (
                <div className="rounded-xl overflow-hidden border bg-slate-50 flex items-center justify-center">
                  <img src={uploadPreview} alt="Referência analisada" className="max-h-56 object-contain" />
                </div>
              ) : carouselSlides.length > 0 ? (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {carouselSlides.map((s, i) => (
                    <div key={i} className="flex-none w-20 h-24 rounded-lg overflow-hidden border border-slate-200">
                      <img src={s.preview} alt={`Slide ${i + 1}`} className="w-full h-full object-cover" />
                    </div>
                  ))}
                </div>
              ) : imageUrl ? (
                <div className="rounded-xl overflow-hidden border bg-slate-50 flex items-center justify-center min-h-24">
                  <img src={imageUrl} alt="Referência analisada" className="max-h-56 object-contain"
                    onError={e => {
                      const el = e.currentTarget.parentElement;
                      if (el) el.innerHTML = `<div class="flex flex-col items-center gap-2 py-8 text-slate-400"><svg xmlns="http://www.w3.org/2000/svg" class="w-10 h-10 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg><p class="text-sm font-medium text-slate-500">Referência salva com sucesso</p><p class="text-xs text-slate-400">Preview indisponível — a análise foi salva normalmente</p></div>`;
                    }} />
                </div>
              ) : (
                <div className="rounded-xl border bg-slate-50 flex flex-col items-center gap-2 py-8 text-slate-400">
                  <Camera className="w-10 h-10 opacity-30" />
                  <p className="text-sm font-medium text-slate-500">Referência salva com sucesso</p>
                </div>
              )}

              {/* Tags */}
              <div className="flex flex-wrap items-center gap-2">
                <span className={`text-xs font-semibold px-3 py-1 rounded-full ${PILAR_COLORS[result.pilar] ?? "bg-slate-100 text-slate-600"}`}>
                  {result.pilar}
                </span>
                <Badge variant="outline" className="text-xs">
                  {FORMAT_OPTIONS.find(f => f.value === result.format)?.icon}{" "}
                  {FORMAT_OPTIONS.find(f => f.value === result.format)?.label ?? result.format}
                </Badge>
                <Badge variant="outline" className="text-xs capitalize">{result.composition_zone}</Badge>
                {!isCarousel && imageUrl && (
                  <a href={imageUrl} target="_blank" rel="noopener"
                    className="ml-auto text-xs text-violet-600 hover:underline flex items-center gap-1">
                    <ExternalLink className="w-3 h-3" /> Ver original
                  </a>
                )}
              </div>

              <div className="p-4 bg-slate-50 rounded-xl space-y-1">
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wide flex items-center gap-1">
                  <Layout className="w-3.5 h-3.5" /> Estilo visual
                </p>
                <p className="text-sm text-slate-700">{result.description}</p>
                <p className="text-xs text-slate-400 italic">{result.color_mood}</p>
              </div>

              {dominantColors.length > 0 && (
                <div className="p-4 bg-slate-50 rounded-xl space-y-2">
                  <p className="text-xs font-medium text-slate-400 uppercase tracking-wide flex items-center gap-1">
                    <Palette className="w-3.5 h-3.5" /> Cores dominantes
                  </p>
                  <div className="flex items-center gap-2">
                    {dominantColors.map(c => (
                      <div key={c} className="flex items-center gap-1.5">
                        <div className="w-6 h-6 rounded-full border-2 border-white shadow-sm" style={{ backgroundColor: c }} />
                        <span className="text-xs text-slate-500 font-mono">{c}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {result.visual_headline_style && (
                <div className="p-4 bg-slate-50 rounded-xl space-y-1">
                  <p className="text-xs font-medium text-slate-400 uppercase tracking-wide flex items-center gap-1">
                    <Type className="w-3.5 h-3.5" /> Tipografia detectada
                  </p>
                  <p className="text-sm text-slate-700">{result.visual_headline_style}</p>
                </div>
              )}

              <details className="p-4 bg-violet-50 rounded-xl space-y-1 cursor-pointer">
                <summary className="text-xs font-medium text-violet-500 uppercase tracking-wide">Visual Prompt</summary>
                <p className="text-sm text-slate-700 mt-2 leading-relaxed">{result.visual_prompt}</p>
              </details>
              <details className="p-4 bg-indigo-50 rounded-xl space-y-1 cursor-pointer">
                <summary className="text-xs font-medium text-indigo-500 uppercase tracking-wide">Layout Prompt</summary>
                <p className="text-sm text-slate-700 mt-2 leading-relaxed">{result.layout_prompt}</p>
              </details>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t">
          {tab === "synthesize" ? (
            <Button onClick={onClose} className="bg-violet-600 hover:bg-violet-700 text-white">Fechar</Button>
          ) : result ? (
            <>
              <Button variant="outline" onClick={handleNew}>Analisar outra</Button>
              <Button onClick={onClose} className="bg-violet-600 hover:bg-violet-700 text-white">Fechar</Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={onClose}>Cancelar</Button>
              <Button onClick={handleAnalyze} disabled={loading || !canAnalyze}
                className="bg-violet-600 hover:bg-violet-700 text-white min-w-[160px]">
                {loading
                  ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Analisando...</>
                  : isCarousel
                  ? <><GalleryHorizontal className="w-4 h-4 mr-2" />Analisar {carouselSlides.length > 0 ? `${carouselSlides.length} slides` : "carrossel"}</>
                  : <><ScanSearch className="w-4 h-4 mr-2" />Extrair DNA visual</>}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
