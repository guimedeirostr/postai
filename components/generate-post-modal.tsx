"use client";

import { useState } from "react";
import { X, Sparkles, Loader2, Copy, Check, Hash, ImageIcon, Brain, ChevronRight, Camera, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import type { BrandProfile, StrategyBriefing } from "@/types";
import { FORMAT_OPTIONS, FORMAT_ASPECT } from "@/lib/post-formats";

type Format = "feed" | "stories" | "reels_cover";

// Step 0 = strategy, Step 1 = form + generate
type Step = 0 | 1;

interface CopyResult {
  post_id:         string;
  visual_headline: string;
  headline:        string;
  caption:         string;
  hashtags:        string[];
  visual_prompt:   string;
  framework_used?: string;
  hook_type?:      string;
  image_url?:      string | null;
}

interface Props {
  client: BrandProfile;
  onClose: () => void;
  onGenerated: () => void;
}

const PILAR_COLORS: Record<string, string> = {
  "Produto":     "bg-blue-100 text-blue-700",
  "Educação":    "bg-emerald-100 text-emerald-700",
  "Prova Social":"bg-amber-100 text-amber-700",
  "Bastidores":  "bg-orange-100 text-orange-700",
  "Engajamento": "bg-pink-100 text-pink-700",
  "Promoção":    "bg-red-100 text-red-700",
  "Trend":       "bg-purple-100 text-purple-700",
};

export function GeneratePostModal({ client, onClose, onGenerated }: Props) {
  // Step management
  const [step,          setStep]          = useState<Step>(0);

  // Strategy step state
  const [campaignFocus, setCampaignFocus] = useState("");
  const [strategyLoading, setStrategyLoading] = useState(false);
  const [strategy,      setStrategy]      = useState<StrategyBriefing | null>(null);
  const [strategyError, setStrategyError] = useState<string | null>(null);

  // Form step state
  const [theme,          setTheme]          = useState("");
  const [objective,      setObjective]      = useState("");
  const [format,         setFormat]         = useState<Format>("feed");
  const [loading,        setLoading]        = useState(false);
  const [result,         setResult]         = useState<CopyResult | null>(null);
  const [copied,         setCopied]         = useState<string | null>(null);
  const [imgLoading,     setImgLoading]     = useState(false);
  const [imgError,       setImgError]       = useState<string | null>(null);
  const [imageMode,      setImageMode]      = useState<"freepik" | "real">("freepik");
  const [curateReason,   setCurateReason]   = useState<string | null>(null);

  async function handleGenerateStrategy() {
    setStrategyLoading(true);
    setStrategyError(null);
    setStrategy(null);

    try {
      const res  = await fetch("/api/posts/generate-strategy", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ client_id: client.id, campaign_focus: campaignFocus || undefined }),
      });
      const data = await res.json() as StrategyBriefing & { error?: string };

      if (!res.ok) {
        setStrategyError(data.error ?? "Erro ao gerar estratégia");
        return;
      }

      setStrategy(data);
      // Auto-fill form fields from strategy
      setTheme(data.tema);
      setObjective(data.objetivo);
      setFormat(data.formato_sugerido);
    } catch {
      setStrategyError("Erro inesperado. Tente novamente.");
    } finally {
      setStrategyLoading(false);
    }
  }

  function handleSkipStrategy() {
    setStrategy(null);
    setStep(1);
  }

  function handleProceedWithStrategy() {
    setStep(1);
  }

  async function handleGenerate() {
    if (!theme || !objective) return;
    setLoading(true);
    setResult(null);

    const body: Record<string, string> = { client_id: client.id, theme, objective, format };
    if (strategy) {
      if (strategy.pilar)             body.pilar             = strategy.pilar;
      if (strategy.publico_especifico) body.publico_especifico = strategy.publico_especifico;
      if (strategy.dor_desejo)        body.dor_desejo        = strategy.dor_desejo;
      if (strategy.hook_type)         body.hook_type         = strategy.hook_type;
    }

    const res  = await fetch("/api/posts/generate-copy", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(body),
    });
    const data = await res.json();
    if (res.ok) { setResult(data); onGenerated(); }
    setLoading(false);
  }

  function copyText(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  async function handleGenerateImage() {
    if (!result?.post_id) return;
    setImgLoading(true);
    setImgError(null);

    try {
      // 1. Submete para o Freepik → recebe task_id imediatamente
      const res  = await fetch("/api/posts/generate-image", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ post_id: result.post_id }),
      });
      const data = await res.json();

      if (!res.ok) {
        setImgError(data.error ?? "Erro ao iniciar geração");
        setImgLoading(false);
        return;
      }

      const { task_id, post_id } = data as { task_id: string; post_id: string };

      // 2. Polling client-side: chama check-image a cada 4s por até 90s
      const maxAttempts = 22;
      for (let i = 0; i < maxAttempts; i++) {
        await new Promise(r => setTimeout(r, 4000));
        const check = await fetch(
          `/api/posts/check-image?task_id=${task_id}&post_id=${post_id}`
        );
        const checkData = await check.json() as { status: string; image_url?: string; error?: string };

        if (checkData.status === "COMPLETED" && checkData.image_url) {
          setResult(prev => prev ? { ...prev, image_url: checkData.image_url } : prev);
          setImgLoading(false);
          return;
        }
        if (checkData.status === "FAILED") {
          setImgError(checkData.error ?? "Falha na geração da imagem");
          setImgLoading(false);
          return;
        }
        // PENDING → continua polling
      }

      setImgError("Timeout: a imagem demorou mais que o esperado. Tente novamente.");
    } catch (err) {
      console.error("handleGenerateImage:", err);
      setImgError("Erro inesperado. Tente novamente.");
    }

    setImgLoading(false);
  }

  async function handleCurateImage() {
    if (!result?.post_id) return;
    setImgLoading(true);
    setImgError(null);
    setCurateReason(null);

    try {
      const body: Record<string, string> = {
        client_id: client.id,
        post_id:   result.post_id,
        theme,
        objective,
      };
      if (strategy?.pilar)      body.pilar      = strategy.pilar;
      if (strategy?.dor_desejo) body.dor_desejo = strategy.dor_desejo;

      const res  = await fetch("/api/posts/curate-image", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });
      const data = await res.json() as { image_url?: string; curation_reason?: string; error?: string };

      if (!res.ok) {
        setImgError(data.error ?? "Erro na curadoria de imagem");
        return;
      }

      setCurateReason(data.curation_reason ?? null);
      setResult(prev => prev ? { ...prev, image_url: data.image_url } : prev);
    } catch {
      setImgError("Erro inesperado. Tente novamente.");
    } finally {
      setImgLoading(false);
    }
  }

  const pilarColorClass = strategy ? (PILAR_COLORS[strategy.pilar] ?? "bg-slate-100 text-slate-700") : "";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: client.primary_color }}>
              <Sparkles className="w-3.5 h-3.5 text-white" />
            </div>
            <div>
              <p className="font-semibold text-slate-900 text-sm">Gerar post — {client.name}</p>
              <p className="text-xs text-slate-400">{client.segment}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">

          {/* ─── STEP 0: Strategy ─── */}
          {step === 0 && !result && (
            <div className="space-y-5">
              {/* Step indicator */}
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span className="w-5 h-5 rounded-full bg-violet-600 text-white flex items-center justify-center font-bold text-xs">1</span>
                <span className="font-medium text-slate-600">Estratégia</span>
                <ChevronRight className="w-3 h-3" />
                <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center font-bold text-xs">2</span>
                <span>Conteúdo</span>
              </div>

              {/* Campaign focus textarea */}
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-slate-700">Contexto da campanha <span className="text-slate-400 font-normal">(opcional)</span></Label>
                <textarea
                  value={campaignFocus}
                  onChange={e => setCampaignFocus(e.target.value)}
                  rows={2}
                  placeholder="Ex: Semana de lançamento do produto X, Dia das Mães se aproximando..."
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 resize-none focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent"
                />
              </div>

              {/* Generate strategy button */}
              <Button
                onClick={handleGenerateStrategy}
                disabled={strategyLoading}
                className="w-full bg-violet-600 hover:bg-violet-700 text-white"
              >
                {strategyLoading
                  ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Analisando marca...</>
                  : <><Brain className="w-4 h-4 mr-2" />Gerar Estratégia</>}
              </Button>

              {strategyError && (
                <p className="text-xs text-red-500 text-center">{strategyError}</p>
              )}

              {/* Skip link */}
              <div className="text-center">
                <button
                  type="button"
                  onClick={handleSkipStrategy}
                  className="text-xs text-slate-400 hover:text-slate-600 underline underline-offset-2"
                >
                  Pular → preencher manualmente
                </button>
              </div>

              {/* Strategy result cards */}
              {strategy && (
                <div className="space-y-3">
                  {/* Success banner */}
                  <div className="flex items-center gap-2 p-3 bg-violet-50 border border-violet-100 rounded-xl">
                    <span className="text-violet-600 text-sm">📐</span>
                    <p className="text-xs font-medium text-violet-700">Estratégia gerada — edite se quiser</p>
                  </div>

                  {/* Pilar badge + rationale */}
                  <div className="p-4 bg-slate-50 rounded-xl space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs font-semibold px-3 py-1 rounded-full ${pilarColorClass}`}>
                        {strategy.pilar}
                      </span>
                      <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">
                        🎣 {strategy.hook_type}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 italic leading-relaxed">{strategy.rationale}</p>
                  </div>

                  {/* Dor/Desejo highlight */}
                  <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl">
                    <p className="text-xs font-semibold text-amber-700 mb-1 uppercase tracking-wide">Dor / Desejo a explorar</p>
                    <p className="text-sm text-amber-900">{strategy.dor_desejo}</p>
                  </div>

                  {/* Tema + objetivo preview */}
                  <div className="grid grid-cols-1 gap-2">
                    <div className="p-3 bg-slate-50 rounded-xl">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Tema sugerido</p>
                      <p className="text-sm text-slate-800">{strategy.tema}</p>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-xl">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Objetivo</p>
                      <p className="text-sm text-slate-800">{strategy.objetivo}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ─── STEP 1: Form ─── */}
          {step === 1 && !result && (
            <>
              {/* Step indicator */}
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-500 flex items-center justify-center font-bold text-xs">1</span>
                <span>Estratégia</span>
                <ChevronRight className="w-3 h-3" />
                <span className="w-5 h-5 rounded-full bg-violet-600 text-white flex items-center justify-center font-bold text-xs">2</span>
                <span className="font-medium text-slate-600">Conteúdo</span>
              </div>

              {/* Strategy used badge */}
              {strategy && (
                <div className="flex items-center gap-2 p-3 bg-violet-50 border border-violet-100 rounded-xl">
                  <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${pilarColorClass}`}>{strategy.pilar}</span>
                  <p className="text-xs text-violet-700">📐 Estratégia gerada — edite se quiser</p>
                </div>
              )}

              {/* Formato */}
              <div className="space-y-2">
                <Label>Formato</Label>
                <div className="grid grid-cols-3 gap-2">
                  {FORMAT_OPTIONS.map(opt => (
                    <button key={opt.value} type="button"
                      onClick={() => setFormat(opt.value)}
                      className={`p-3 rounded-xl border-2 text-left transition-all ${
                        format === opt.value
                          ? "border-violet-500 bg-violet-50"
                          : "border-slate-200 hover:border-slate-300"
                      }`}>
                      <p className="text-sm font-medium text-slate-900">{opt.label}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{opt.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Tema */}
              <div className="space-y-1.5">
                <Label>Tema do post *</Label>
                <Input value={theme} onChange={e => setTheme(e.target.value)}
                  placeholder="Ex: Benefícios do laser para dores articulares" />
              </div>

              {/* Objetivo */}
              <div className="space-y-1.5">
                <Label>Objetivo *</Label>
                <Input value={objective} onChange={e => setObjective(e.target.value)}
                  placeholder="Ex: Educar e gerar curiosidade para agendar consulta" />
              </div>

              {/* Brand preview */}
              <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-xl text-xs text-slate-500">
                <div className="flex gap-1">
                  <div className="w-4 h-4 rounded-full" style={{ backgroundColor: client.primary_color }} />
                  <div className="w-4 h-4 rounded-full" style={{ backgroundColor: client.secondary_color }} />
                </div>
                <span>Tom: <strong className="text-slate-700">{client.tone_of_voice.slice(0, 60)}{client.tone_of_voice.length > 60 ? "..." : ""}</strong></span>
              </div>
            </>
          )}

          {/* ─── Result ─── */}
          {result && (
            <div className="space-y-4">

              {/* Badge framework + hook */}
              {result.framework_used && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-violet-100 text-violet-700">
                    📐 {result.framework_used}
                  </span>
                  <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">
                    🎣 Hook: {result.hook_type}
                  </span>
                </div>
              )}

              {/* Visual Headline (overlay) */}
              {result.visual_headline && (
                <div className="p-4 bg-violet-50 border border-violet-100 rounded-xl space-y-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-violet-500 uppercase tracking-wide">Visual Headline (overlay)</Label>
                    <button onClick={() => copyText(result.visual_headline, "visual_headline")}
                      className="text-slate-400 hover:text-slate-700">
                      {copied === "visual_headline" ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="font-black text-violet-900 text-2xl leading-tight">{result.visual_headline}</p>
                </div>
              )}

              {/* Headline completa */}
              <div className="p-4 bg-slate-50 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-slate-500 uppercase tracking-wide">Headline</Label>
                  <button onClick={() => copyText(result.headline, "headline")}
                    className="text-slate-400 hover:text-slate-700">
                    {copied === "headline" ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
                <p className="font-bold text-slate-900 text-lg leading-snug">{result.headline}</p>
              </div>

              {/* Caption */}
              <div className="p-4 bg-slate-50 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-slate-500 uppercase tracking-wide">Legenda</Label>
                  <button onClick={() => copyText(result.caption, "caption")}
                    className="text-slate-400 hover:text-slate-700">
                    {copied === "caption" ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-slate-700 text-sm whitespace-pre-wrap leading-relaxed">{result.caption}</p>
              </div>

              {/* Hashtags */}
              <div className="p-4 bg-slate-50 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-slate-500 uppercase tracking-wide flex items-center gap-1">
                    <Hash className="w-3.5 h-3.5" /> Hashtags ({result.hashtags.length})
                  </Label>
                  <button onClick={() => copyText(result.hashtags.map(h => `#${h}`).join(" "), "hashtags")}
                    className="text-slate-400 hover:text-slate-700">
                    {copied === "hashtags" ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {result.hashtags.map(h => (
                    <Badge key={h} variant="secondary" className="text-xs">#{h}</Badge>
                  ))}
                </div>
              </div>

              {/* Visual prompt */}
              <div className="p-4 bg-violet-50 rounded-xl space-y-2">
                <Label className="text-xs text-violet-500 uppercase tracking-wide">Prompt visual (Freepik)</Label>
                <p className="text-slate-600 text-sm italic">{result.visual_prompt}</p>
              </div>

              {/* ── Imagem ── */}
              {result.image_url ? (
                <div className="space-y-2">
                  <div className={`rounded-xl overflow-hidden border w-full ${FORMAT_ASPECT[format]}`}>
                    <img src={result.image_url} alt="Imagem gerada" className="w-full h-full object-cover" />
                  </div>
                  {curateReason && (
                    <div className="flex items-start gap-2 p-3 bg-emerald-50 border border-emerald-100 rounded-xl">
                      <span className="text-emerald-500 mt-0.5">🎯</span>
                      <p className="text-xs text-emerald-700"><strong>Curador IA:</strong> {curateReason}</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Mode selector */}
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button"
                      onClick={() => setImageMode("freepik")}
                      className={`p-3 rounded-xl border-2 text-left transition-all ${
                        imageMode === "freepik"
                          ? "border-violet-500 bg-violet-50"
                          : "border-slate-200 hover:border-slate-300"
                      }`}>
                      <div className="flex items-center gap-2 mb-1">
                        <Wand2 className="w-3.5 h-3.5 text-violet-600" />
                        <p className="text-xs font-semibold text-slate-900">Freepik IA</p>
                      </div>
                      <p className="text-xs text-slate-400">Gera imagem do zero com prompt visual</p>
                    </button>
                    <button type="button"
                      onClick={() => setImageMode("real")}
                      className={`p-3 rounded-xl border-2 text-left transition-all ${
                        imageMode === "real"
                          ? "border-violet-500 bg-violet-50"
                          : "border-slate-200 hover:border-slate-300"
                      }`}>
                      <div className="flex items-center gap-2 mb-1">
                        <Camera className="w-3.5 h-3.5 text-violet-600" />
                        <p className="text-xs font-semibold text-slate-900">Foto Real</p>
                      </div>
                      <p className="text-xs text-slate-400">IA seleciona melhor foto da biblioteca</p>
                    </button>
                  </div>

                  {/* Action button */}
                  <Button
                    onClick={imageMode === "freepik" ? handleGenerateImage : handleCurateImage}
                    disabled={imgLoading}
                    className="w-full bg-violet-600 hover:bg-violet-700 text-white"
                  >
                    {imgLoading ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        {imageMode === "freepik" ? "Gerando imagem..." : "Curando com IA..."}</>
                    ) : imageMode === "freepik" ? (
                      <><ImageIcon className="w-4 h-4 mr-2" />Gerar com Freepik IA</>
                    ) : (
                      <><Camera className="w-4 h-4 mr-2" />Curar foto da biblioteca</>
                    )}
                  </Button>

                  {imgError && (
                    <p className="text-xs text-red-500 text-center">{imgError}</p>
                  )}
                </div>
              )}

              <Button variant="outline" className="w-full" onClick={() => {
                setResult(null);
                setImgError(null);
                setCurateReason(null);
                setImageMode("freepik");
                setStep(0);
                setStrategy(null);
                setTheme("");
                setObjective("");
                setFormat("feed");
                setCampaignFocus("");
              }}>
                Gerar outro post
              </Button>
            </div>
          )}
        </div>

        {/* Footer */}
        {!result && (
          <div className="flex justify-end gap-3 px-6 py-4 border-t">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>

            {step === 0 && (
              <Button
                onClick={strategy ? handleProceedWithStrategy : handleSkipStrategy}
                disabled={strategyLoading}
                className="bg-violet-600 hover:bg-violet-700 text-white min-w-[160px]"
              >
                {strategy
                  ? <><Sparkles className="w-4 h-4 mr-2" />Usar estratégia</>
                  : <><ChevronRight className="w-4 h-4 mr-2" />Pular etapa</>}
              </Button>
            )}

            {step === 1 && (
              <Button onClick={handleGenerate}
                disabled={loading || !theme || !objective}
                className="bg-violet-600 hover:bg-violet-700 text-white min-w-[140px]">
                {loading
                  ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Gerando...</>
                  : <><Sparkles className="w-4 h-4 mr-2" />Gerar post</>}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
