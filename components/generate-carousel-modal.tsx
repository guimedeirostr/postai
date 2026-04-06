"use client";

import { useState, useRef } from "react";
import {
  X, Loader2, Upload, Layers, Hash, Download, Check,
  ChevronRight, Sparkles, GalleryHorizontal, Image as ImageIcon
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { BrandProfile, CarouselSlide, GeneratedCarousel } from "@/types";

interface Props {
  client: BrandProfile;
  onClose: () => void;
}

type Step = 0 | 1 | 2; // 0=config, 1=generating, 2=result

interface CarouselResult {
  carousel_id: string;
  task_id:     string | null;
  topic:       string;
  slides:      CarouselSlide[];
  caption:     string;
  hashtags:    string[];
}

const OBJECTIVES = ["Educar", "Engajar", "Vender", "Inspirar", "Mostrar Bastidores", "Provar Autoridade"];
const SLIDE_COUNTS = [3, 5, 7, 10, 12, 15, 20];

export function GenerateCarouselModal({ client, onClose }: Props) {
  const [step, setStep] = useState<Step>(0);

  // Step 0 — config
  const [theme,           setTheme]           = useState("");
  const [objective,       setObjective]       = useState("Educar");
  const [slideCount,      setSlideCount]      = useState(7);
  const [extraInstructions, setExtraInstructions] = useState("");
  const [dnaB64,          setDnaB64]          = useState<string | null>(null);
  const [dnaMime,         setDnaMime]         = useState<string>("image/jpeg");
  const [dnaPreview,      setDnaPreview]      = useState<string | null>(null);

  // Step 1 — generation progress
  const [statusMsg,       setStatusMsg]       = useState("");
  const [generateError,   setGenerateError]   = useState<string | null>(null);

  // Step 2 — result
  const [result,          setResult]          = useState<CarouselResult | null>(null);
  const [composedSlides,  setComposedSlides]  = useState<CarouselSlide[]>([]);
  const [polling,         setPolling]         = useState(false);
  const [selectedSlide,   setSelectedSlide]   = useState<number>(0);
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [copied,          setCopied]          = useState(false);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── DNA upload ──────────────────────────────────────────────────────────────
  function handleDnaFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const [header, b64] = dataUrl.split(",");
      const mime = header.match(/data:([^;]+)/)?.[1] ?? "image/jpeg";
      setDnaB64(b64);
      setDnaMime(mime);
      setDnaPreview(dataUrl);
    };
    reader.readAsDataURL(file);
  }

  // ── Generate ────────────────────────────────────────────────────────────────
  async function handleGenerate() {
    if (!theme.trim()) return;
    setStep(1);
    setGenerateError(null);
    setStatusMsg("Estrategista editorial criando os slides...");

    try {
      const body: Record<string, unknown> = {
        client_id:   client.id,
        theme:       theme.trim(),
        objective,
        slide_count: slideCount,
      };
      if (extraInstructions.trim()) body.extra_instructions = extraInstructions.trim();
      if (dnaB64) {
        body.dna_image_base64 = dnaB64;
        body.dna_image_type   = dnaMime;
      }

      const res  = await fetch("/api/carousels/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json() as CarouselResult & { error?: string };

      if (!res.ok) {
        setGenerateError(data.error ?? "Erro ao gerar carrossel.");
        setStep(0);
        return;
      }

      setResult(data);
      setComposedSlides(data.slides); // initially without composed_url

      if (data.task_id) {
        setStatusMsg("Gerando imagem do slide de capa...");
        setPolling(true);
        pollHook(data.carousel_id, data.task_id, data.slides);
      } else {
        // No image generation needed (no visual_prompt)
        setStatusMsg("Finalizando composição dos slides...");
        await composeDirectly(data.carousel_id, data.slides);
      }

    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : "Erro de conexão.");
      setStep(0);
    }
  }

  function pollHook(carouselId: string, taskId: string, slides: CarouselSlide[]) {
    let attempts = 0;
    const MAX    = 55;

    function tick() {
      pollRef.current = setTimeout(async () => {
        attempts++;
        try {
          const res  = await fetch(`/api/carousels/check-hook?task_id=${taskId}&carousel_id=${carouselId}`);
          const data = await res.json() as {
            status: string;
            slides?: CarouselSlide[];
            error?: string;
          };

          if (data.status === "COMPLETED" && data.slides) {
            setPolling(false);
            setComposedSlides(data.slides);
            setStep(2);
            setSelectedSlide(0);
            return;
          }

          if (data.status === "FAILED" || data.error) {
            setPolling(false);
            setGenerateError("Falha ao gerar imagem da capa. Tente novamente.");
            setStep(0);
            return;
          }

          if (data.status === "composing") setStatusMsg("Compondo os slides...");
          else setStatusMsg("Gerando imagem de capa...");

          if (attempts < MAX) tick();
          else {
            setPolling(false);
            setGenerateError("Timeout: a geração demorou demais. Tente novamente.");
            setStep(0);
          }
        } catch {
          if (attempts < MAX) tick();
        }
      }, 4000);
    }
    tick();
  }

  async function composeDirectly(carouselId: string, slides: CarouselSlide[]) {
    // Fallback: if somehow no hook task (shouldn't happen normally)
    // Just show the result with unrendered slides
    void carouselId; void slides;
    setStep(2);
    setSelectedSlide(0);
  }

  // ── Download ────────────────────────────────────────────────────────────────
  async function downloadAll() {
    const ready = composedSlides.filter(s => s.composed_url);
    if (!ready.length) return;
    setDownloadProgress(0);
    for (let i = 0; i < ready.length; i++) {
      const url = ready[i].composed_url!;
      try {
        const res  = await fetch(url);
        const blob = await res.blob();
        const burl = URL.createObjectURL(blob);
        const a    = document.createElement("a");
        a.href     = burl;
        a.download = `carrossel-slide-${ready[i].index + 1}.jpg`;
        a.click();
        URL.revokeObjectURL(burl);
      } catch {
        // skip failed downloads
      }
      setDownloadProgress(i + 1);
      if (i < ready.length - 1) await new Promise(r => setTimeout(r, 350));
    }
    setDownloadProgress(null);
  }

  async function downloadSlide(slide: CarouselSlide) {
    if (!slide.composed_url) return;
    const res  = await fetch(slide.composed_url);
    const blob = await res.blob();
    const burl = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = burl;
    a.download = `carrossel-slide-${slide.index + 1}.jpg`;
    a.click();
    URL.revokeObjectURL(burl);
  }

  async function copyCaption() {
    if (!result?.caption) return;
    await navigator.clipboard.writeText(result.caption);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function reset() {
    if (pollRef.current) clearTimeout(pollRef.current);
    setStep(0);
    setTheme("");
    setObjective("Educar");
    setSlideCount(7);
    setExtraInstructions("");
    setDnaB64(null); setDnaPreview(null); setDnaMime("image/jpeg");
    setStatusMsg(""); setGenerateError(null);
    setResult(null); setComposedSlides([]);
    setPolling(false); setSelectedSlide(0);
    setDownloadProgress(null); setCopied(false);
  }

  const selectedComposed = composedSlides[selectedSlide];
  const readyCount = composedSlides.filter(s => s.composed_url).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b sticky top-0 bg-white z-10 rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-violet-100 rounded-xl flex items-center justify-center">
              <GalleryHorizontal className="w-5 h-5 text-violet-600" />
            </div>
            <div>
              <p className="font-semibold text-slate-900">Criar Carrossel</p>
              <p className="text-xs text-slate-400">{client.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">

          {/* ── STEP 0: Config ── */}
          {step === 0 && (
            <>
              {/* DNA Reference */}
              <div>
                <Label className="text-sm font-semibold text-slate-700 mb-2 block">
                  📸 DNA Visual de Referência (opcional)
                </Label>
                <p className="text-xs text-slate-400 mb-3">
                  Faça upload de um slide de carrossel que você admira. A IA vai copiar o estilo visual.
                </p>
                {dnaPreview ? (
                  <div className="flex items-center gap-3 p-3 bg-violet-50 rounded-xl border border-violet-200">
                    <img src={dnaPreview} alt="DNA" className="w-14 h-14 object-cover rounded-lg flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-violet-700">DNA carregado ✓</p>
                      <p className="text-xs text-slate-400">A IA vai replicar este estilo visual</p>
                    </div>
                    <button type="button" onClick={() => { setDnaB64(null); setDnaPreview(null); }}
                      className="text-slate-400 hover:text-red-500">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <label
                    className="flex flex-col items-center justify-center gap-2 py-6 border-2 border-dashed border-slate-200 rounded-xl cursor-pointer hover:border-violet-400 hover:bg-violet-50/40 transition-colors text-slate-400"
                    onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
                    onDrop={e => { e.preventDefault(); e.stopPropagation(); const f = e.dataTransfer.files[0]; if (f) handleDnaFile(f); }}
                  >
                    <Upload className="w-6 h-6 opacity-40" />
                    <p className="text-sm">Arraste ou clique para selecionar um slide de referência</p>
                    <input type="file" accept="image/*" className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) handleDnaFile(f); }} />
                  </label>
                )}
              </div>

              {/* Theme */}
              <div>
                <Label htmlFor="theme" className="text-sm font-semibold text-slate-700 mb-1 block">
                  Tema do Carrossel *
                </Label>
                <Input
                  id="theme"
                  placeholder="Ex: 5 erros que destroem sua produtividade, Como reduzir custos de embalagem..."
                  value={theme}
                  onChange={e => setTheme(e.target.value)}
                  className="rounded-xl"
                />
              </div>

              {/* Objective */}
              <div>
                <Label className="text-sm font-semibold text-slate-700 mb-2 block">Objetivo</Label>
                <div className="flex flex-wrap gap-2">
                  {OBJECTIVES.map(obj => (
                    <button
                      key={obj}
                      type="button"
                      onClick={() => setObjective(obj)}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${
                        objective === obj
                          ? "bg-violet-600 text-white border-violet-600"
                          : "bg-white text-slate-600 border-slate-200 hover:border-violet-300"
                      }`}
                    >
                      {obj}
                    </button>
                  ))}
                </div>
              </div>

              {/* Slide count */}
              <div>
                <Label className="text-sm font-semibold text-slate-700 mb-2 block">
                  Número de slides
                </Label>
                <div className="flex flex-wrap gap-2">
                  {SLIDE_COUNTS.map(n => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setSlideCount(n)}
                      className={`w-12 h-10 rounded-xl text-sm font-bold transition-all border ${
                        slideCount === n
                          ? "bg-violet-600 text-white border-violet-600"
                          : "bg-white text-slate-600 border-slate-200 hover:border-violet-300"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              {/* Extra instructions */}
              <div>
                <Label htmlFor="extra" className="text-sm font-semibold text-slate-700 mb-1 block">
                  Instruções adicionais (opcional)
                </Label>
                <textarea
                  id="extra"
                  rows={2}
                  placeholder="Ex: Foque em dados concretos, use exemplos do setor têxtil, tom mais descontraído..."
                  value={extraInstructions}
                  onChange={e => setExtraInstructions(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-violet-400"
                />
              </div>

              {generateError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                  {generateError}
                </div>
              )}

              <Button
                onClick={handleGenerate}
                disabled={!theme.trim()}
                className="w-full bg-violet-600 hover:bg-violet-700 text-white rounded-xl h-11"
              >
                <Sparkles className="w-4 h-4 mr-2" />
                Criar Carrossel com {slideCount} slides
              </Button>
            </>
          )}

          {/* ── STEP 1: Generating ── */}
          {step === 1 && (
            <div className="flex flex-col items-center justify-center py-16 gap-6">
              <div className="w-16 h-16 bg-violet-100 rounded-2xl flex items-center justify-center">
                <Layers className="w-8 h-8 text-violet-600 animate-pulse" />
              </div>
              <div className="text-center space-y-2">
                <p className="font-semibold text-slate-900">{statusMsg || "Criando carrossel..."}</p>
                <p className="text-sm text-slate-400">Isso pode levar até 1 minuto</p>
              </div>
              <div className="w-48 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-violet-500 rounded-full animate-pulse w-2/3" />
              </div>
            </div>
          )}

          {/* ── STEP 2: Result ── */}
          {step === 2 && result && (
            <>
              {/* Slide viewer */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-700">
                    {readyCount} / {composedSlides.length} slides prontos
                  </p>
                  {polling && (
                    <div className="flex items-center gap-1.5 text-xs text-violet-600">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Compondo...
                    </div>
                  )}
                </div>

                {/* Main preview */}
                <div className="aspect-square w-full max-w-sm mx-auto rounded-2xl overflow-hidden bg-slate-100 border border-slate-200">
                  {selectedComposed?.composed_url ? (
                    <img
                      src={selectedComposed.composed_url}
                      alt={`Slide ${selectedSlide + 1}`}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-slate-400">
                      <ImageIcon className="w-10 h-10 opacity-30" />
                      <p className="text-sm">Slide {selectedSlide + 1}</p>
                      <p className="text-xs">{selectedComposed?.headline}</p>
                    </div>
                  )}
                </div>

                {/* Slide info */}
                {selectedComposed && (
                  <div className="bg-slate-50 rounded-xl p-3 text-sm space-y-1">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        selectedComposed.type === "hook" ? "bg-violet-100 text-violet-700"
                        : selectedComposed.type === "cta" ? "bg-emerald-100 text-emerald-700"
                        : "bg-slate-200 text-slate-600"
                      }`}>
                        {selectedComposed.type === "hook" ? "🎣 Hook" : selectedComposed.type === "cta" ? "✅ CTA" : `📌 Slide ${selectedSlide + 1}`}
                      </span>
                      {selectedComposed.composed_url && (
                        <button
                          onClick={() => downloadSlide(selectedComposed)}
                          className="text-xs text-violet-600 hover:text-violet-800 flex items-center gap-1 ml-auto"
                        >
                          <Download className="w-3 h-3" /> Baixar este slide
                        </button>
                      )}
                    </div>
                    <p className="font-semibold text-slate-800">{selectedComposed.headline}</p>
                    {selectedComposed.body_text && (
                      <p className="text-slate-500 text-xs leading-relaxed">{selectedComposed.body_text}</p>
                    )}
                  </div>
                )}

                {/* Thumbnail strip */}
                <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
                  {composedSlides.map((slide, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setSelectedSlide(i)}
                      className={`flex-none w-16 h-16 rounded-xl overflow-hidden border-2 transition-all ${
                        selectedSlide === i
                          ? "border-violet-500 ring-2 ring-violet-200"
                          : "border-transparent hover:border-slate-300"
                      }`}
                    >
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
              </div>

              {/* Caption */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold text-slate-700">Caption</Label>
                  <button
                    onClick={copyCaption}
                    className="flex items-center gap-1 text-xs text-violet-600 hover:text-violet-800 transition-colors"
                  >
                    {copied ? <Check className="w-3 h-3" /> : null}
                    {copied ? "Copiado!" : "Copiar caption"}
                  </button>
                </div>
                <div className="bg-slate-50 rounded-xl p-3 text-sm text-slate-700 whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto">
                  {result.caption}
                </div>
              </div>

              {/* Hashtags */}
              {result.hashtags?.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-slate-700 flex items-center gap-1">
                    <Hash className="w-3.5 h-3.5" /> Hashtags
                  </Label>
                  <div className="flex flex-wrap gap-1.5">
                    {result.hashtags.map((tag, i) => (
                      <span key={i} className="text-xs bg-violet-50 text-violet-700 px-2 py-1 rounded-full">
                        #{tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <Button
                  onClick={downloadAll}
                  disabled={readyCount === 0 || downloadProgress !== null}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl h-11"
                >
                  {downloadProgress !== null ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Baixando {downloadProgress}/{readyCount}...</>
                  ) : (
                    <><Download className="w-4 h-4 mr-2" />Baixar todos ({readyCount} slides)</>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={reset}
                  className="rounded-xl h-11 px-4"
                >
                  <ChevronRight className="w-4 h-4 mr-1" />
                  Novo
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
