"use client";

import { useState, useEffect } from "react";
import { X, Sparkles, Loader2, Copy, Check, Hash, ImageIcon, Brain, ChevronRight, Camera, Wand2, Layers, Download, ScanSearch, Upload, Plus } from "lucide-react";
import type { BrandPhoto } from "@/types";
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
  post_id:            string;
  visual_headline:    string;
  headline:           string;
  caption:            string;
  hashtags:           string[];
  visual_prompt:      string;
  framework_used?:    string;
  hook_type?:         string;
  image_url?:         string | null;
  composed_url?:      string | null;
  reference_warning?: string;
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
  const [imageMode,          setImageMode]          = useState<"freepik" | "real" | "library">("freepik");
  const [curateReason,       setCurateReason]       = useState<string | null>(null);
  const [composedUrl,        setComposedUrl]        = useState<string | null>(null);
  const [viewComposed,       setViewComposed]       = useState(true);
  const [libraryPhotos,      setLibraryPhotos]      = useState<BrandPhoto[]>([]);
  const [libraryLoading,     setLibraryLoading]     = useState(false);
  const [selectedLibPhoto,   setSelectedLibPhoto]   = useState<string | null>(null);
  const [referenceUrl,       setReferenceUrl]       = useState("");
  const [referenceB64,       setReferenceB64]       = useState<string | null>(null);
  const [referenceType,      setReferenceType]      = useState<string>("image/jpeg");
  const [referencePreview,   setReferencePreview]   = useState<string | null>(null);
  const [referenceWarn,      setReferenceWarn]      = useState<string | null>(null);
  const [copyError,          setCopyError]          = useState<string | null>(null);
  const [freepikModel,       setFreepikModel]       = useState<"mystic" | "seedream">("mystic");
  const [extraInstructions,  setExtraInstructions]  = useState("");
  const [libUploadLoading,   setLibUploadLoading]   = useState(false);
  const [libUploadError,     setLibUploadError]     = useState<string | null>(null);

  // Fetch library photos when mode = "library" and we have a result
  useEffect(() => {
    if (imageMode !== "library" || !result) return;
    if (libraryPhotos.length > 0) return; // already loaded
    setLibraryLoading(true);
    fetch(`/api/clients/${client.id}/photos`)
      .then(r => r.json())
      .then((data: { photos?: BrandPhoto[] }) => setLibraryPhotos(data.photos ?? []))
      .catch(() => setLibraryPhotos([]))
      .finally(() => setLibraryLoading(false));
  }, [imageMode, result, client.id, libraryPhotos.length]);

  function handleReferenceFile(file: File) {
    setReferenceWarn(null);
    setReferenceUrl("");

    // Compress via canvas before base64 — prevents 413 on large photos
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
      canvas.width  = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, width, height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
      const b64 = dataUrl.split(",")[1];
      setReferenceB64(b64);
      setReferenceType("image/jpeg");
      setReferencePreview(dataUrl);
    };
    img.src = objectUrl;
  }

  // Compress image via canvas before uploading to library (prevents 413 / server errors)
  function compressForUpload(file: File): Promise<File> {
    return new Promise((resolve) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        const MAX = 1920;
        let { width, height } = img;
        if (width > MAX || height > MAX) {
          if (width > height) { height = Math.round(height * MAX / width); width = MAX; }
          else                { width  = Math.round(width  * MAX / height); height = MAX; }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
        canvas.toBlob(blob => {
          resolve(blob ? new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" }) : file);
        }, "image/jpeg", 0.85);
      };
      img.onerror = () => resolve(file); // fallback: use original
      img.src = objectUrl;
    });
  }

  async function handleLibraryUpload(file: File) {
    setLibUploadLoading(true);
    setLibUploadError(null);
    try {
      const compressed = await compressForUpload(file);
      const fd = new FormData();
      fd.append("file", compressed);
      fd.append("category", "outro");

      let res: Response;
      try {
        res = await fetch(`/api/clients/${client.id}/photos`, { method: "POST", body: fd });
      } catch {
        setLibUploadError("Sem conexão com o servidor. Verifique sua internet.");
        return;
      }

      // Guard against non-JSON responses (500 HTML, 413, etc.)
      let data: { id?: string; url?: string; error?: string } = {};
      try {
        data = await res.json();
      } catch {
        setLibUploadError(`Erro ${res.status} ao fazer upload. Tente novamente.`);
        return;
      }

      if (!res.ok || !data.url) {
        setLibUploadError(data.error ?? `Erro ${res.status} ao fazer upload.`);
        return;
      }

      const newPhoto = {
        id:          data.id ?? "",
        url:         data.url,
        filename:    file.name,
        category:    "outro" as const,
        tags:        [] as string[],
        description: "",
        agency_id:   client.agency_id ?? "",
        client_id:   client.id,
        r2_key:      "",
        created_at:  { seconds: Date.now() / 1000 } as unknown as import("firebase/firestore").Timestamp,
      } satisfies BrandPhoto;
      setLibraryPhotos(prev => [newPhoto, ...prev]);
      setSelectedLibPhoto(data.url);
    } catch (err) {
      setLibUploadError(err instanceof Error ? err.message : "Erro inesperado ao fazer upload.");
    } finally {
      setLibUploadLoading(false);
    }
  }

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
    if (referenceB64) {
      body.reference_image_base64 = referenceB64;
      body.reference_image_type   = referenceType;
    } else if (referenceUrl.trim()) {
      body.reference_url = referenceUrl.trim();
    }
    body.image_provider = freepikModel;
    if (extraInstructions.trim()) body.extra_instructions = extraInstructions.trim();

    setCopyError(null);
    const res  = await fetch("/api/posts/generate-copy", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(body),
    });

    // Guard against non-JSON responses (413 Payload Too Large, 502 Gateway, etc.)
    let data: Record<string, unknown> = {};
    try {
      data = await res.json();
    } catch {
      if (res.status === 413) {
        setCopyError("A imagem de referência é grande demais. Tente com uma imagem menor.");
      } else {
        setCopyError(`Erro ${res.status}: resposta inesperada do servidor.`);
      }
      setLoading(false);
      return;
    }

    if (res.ok) {
      setResult(data as unknown as CopyResult);
      onGenerated();
      if (data.reference_warning) setReferenceWarn(data.reference_warning as string);
    } else {
      setCopyError((data.error as string | undefined) ?? "Erro ao gerar copy. Tente novamente.");
    }
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

      // FAL/Imagen4: sync — image_url returned immediately
      if (data.image_url) {
        setResult(prev => prev ? { ...prev, image_url: data.image_url } : prev);
        if (data.composed_url) {
          setComposedUrl(data.composed_url);
          setViewComposed(true);
        }
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
        const checkData = await check.json() as { status: string; image_url?: string; composed_url?: string; error?: string };

        if (checkData.status === "COMPLETED" && checkData.image_url) {
          setResult(prev => prev ? { ...prev, image_url: checkData.image_url } : prev);
          if (checkData.composed_url) {
            setComposedUrl(checkData.composed_url);
            setViewComposed(true);
          }
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

  async function handleComposeWithLibraryPhoto() {
    if (!result?.post_id || !selectedLibPhoto) return;
    setImgLoading(true);
    setImgError(null);

    try {
      // Send photo to Seedream Edit — it refines it with the visual_prompt
      // then the compositor adds text overlays on top
      const res  = await fetch("/api/posts/generate-image", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ post_id: result.post_id, image_url: selectedLibPhoto }),
      });
      const data = await res.json() as { task_id?: string; post_id?: string; error?: string };

      if (!res.ok) {
        setImgError(data.error ?? "Erro ao enviar foto para o Seedream");
        return;
      }

      const { task_id, post_id } = data;
      if (!task_id || !post_id) {
        setImgError("Resposta inesperada do servidor.");
        return;
      }

      // Polling — same as Freepik IA flow
      const maxAttempts = 22;
      for (let i = 0; i < maxAttempts; i++) {
        await new Promise(r => setTimeout(r, 4000));
        const check     = await fetch(`/api/posts/check-image?task_id=${task_id}&post_id=${post_id}`);
        const checkData = await check.json() as { status: string; image_url?: string; composed_url?: string; error?: string };

        if (checkData.status === "COMPLETED" && checkData.image_url) {
          setResult(prev => prev ? { ...prev, image_url: checkData.image_url } : prev);
          if (checkData.composed_url) {
            setComposedUrl(checkData.composed_url);
            setViewComposed(true);
          }
          return;
        }
        if (checkData.status === "FAILED") {
          setImgError(checkData.error ?? "Falha na geração com Seedream Edit");
          return;
        }
      }

      setImgError("Timeout: a imagem demorou mais que o esperado. Tente novamente.");
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

              {/* Referência visual (opcional) */}
              <div className="space-y-2">
                <Label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                  <ScanSearch className="w-3.5 h-3.5 text-emerald-500" />
                  Referência visual <span className="text-slate-400 font-normal">(opcional)</span>
                </Label>

                {/* Upload zone */}
                <label
                  className={`flex items-center gap-3 p-3 rounded-xl border-2 border-dashed cursor-pointer transition-all ${
                    referenceB64
                      ? "border-emerald-400 bg-emerald-50"
                      : "border-slate-200 hover:border-violet-300 hover:bg-violet-50/40"
                  }`}
                  onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
                  onDrop={e => {
                    e.preventDefault();
                    e.stopPropagation();
                    const file = e.dataTransfer.files?.[0];
                    if (file && file.type.startsWith("image/")) handleReferenceFile(file);
                  }}
                >
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={e => { if (e.target.files?.[0]) handleReferenceFile(e.target.files[0]); }}
                  />
                  {referencePreview ? (
                    <>
                      <img src={referencePreview} alt="Referência" className="w-12 h-12 object-cover rounded-lg flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-emerald-700">Imagem carregada ✓</p>
                        <p className="text-xs text-slate-400 truncate">A IA vai usar como inspiração visual</p>
                      </div>
                      <button type="button" onClick={e => { e.preventDefault(); setReferenceB64(null); setReferencePreview(null); setReferenceType("image/jpeg"); }}
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

                {/* URL fallback */}
                {!referenceB64 && (
                  <div className="space-y-1">
                    <Input
                      value={referenceUrl}
                      onChange={e => { setReferenceUrl(e.target.value); setReferenceWarn(null); }}
                      placeholder="Ou cole URL direta de imagem (não Instagram)"
                      type="url"
                      className="text-xs"
                    />
                    <p className="text-xs text-slate-400">⚠️ URLs do Instagram bloqueiam acesso server-side — prefira o upload acima.</p>
                  </div>
                )}

                {referenceWarn && (
                  <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                    ⚠️ {referenceWarn}
                  </p>
                )}
              </div>

              {/* Instruções extras */}
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-slate-700">
                  Instruções para a IA <span className="text-slate-400 font-normal">(opcional)</span>
                </Label>
                <textarea
                  value={extraInstructions}
                  onChange={e => setExtraInstructions(e.target.value)}
                  placeholder={'Ex: "Fundo branco limpo, sem pessoas"\n"Tom mais sério e corporativo"\n"Foco no produto, estilo editorial"'}
                  rows={2}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 resize-none focus:outline-none focus:ring-2 focus:ring-violet-400"
                />
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

              {/* Reference warning */}
              {referenceWarn && (
                <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-100 rounded-xl">
                  <span className="text-amber-500 mt-0.5 flex-shrink-0">⚠️</span>
                  <p className="text-xs text-amber-700">{referenceWarn}</p>
                </div>
              )}

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
                  {/* Toggle raw vs composed */}
                  {result.image_url && composedUrl && (
                    <div className="flex items-center gap-2 text-xs">
                      <button onClick={() => setViewComposed(false)}
                        className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${!viewComposed ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>
                        IA Bruta
                      </button>
                      <button onClick={() => setViewComposed(true)}
                        className={`px-3 py-1.5 rounded-lg font-medium flex items-center gap-1.5 transition-colors ${viewComposed ? "bg-violet-600 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>
                        <Layers className="w-3 h-3" /> Premium
                      </button>
                      <a href={(viewComposed ? composedUrl : result.image_url) ?? "#"} download={`post-${result.post_id}.jpg`} target="_blank"
                        className="ml-auto text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100">
                        <Download className="w-4 h-4" />
                      </a>
                    </div>
                  )}
                  <div className={`rounded-xl overflow-hidden border w-full ${FORMAT_ASPECT[format]}`}>
                    <img src={(viewComposed && composedUrl) ? composedUrl : result.image_url}
                      alt="Imagem gerada" className="w-full h-full object-cover" />
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
                  {/* Mode selector — 3 options */}
                  <div className="grid grid-cols-3 gap-2">
                    <button type="button"
                      onClick={() => setImageMode("freepik")}
                      className={`p-3 rounded-xl border-2 text-left transition-all ${
                        imageMode === "freepik"
                          ? "border-violet-500 bg-violet-50"
                          : "border-slate-200 hover:border-slate-300"
                      }`}>
                      <div className="flex items-center gap-1.5 mb-1">
                        <Wand2 className="w-3.5 h-3.5 text-violet-600" />
                        <p className="text-xs font-semibold text-slate-900">Freepik IA</p>
                      </div>
                      <p className="text-xs text-slate-400">Gera do zero com prompt</p>
                    </button>
                    <button type="button"
                      onClick={() => setImageMode("real")}
                      className={`p-3 rounded-xl border-2 text-left transition-all ${
                        imageMode === "real"
                          ? "border-violet-500 bg-violet-50"
                          : "border-slate-200 hover:border-slate-300"
                      }`}>
                      <div className="flex items-center gap-1.5 mb-1">
                        <Brain className="w-3.5 h-3.5 text-violet-600" />
                        <p className="text-xs font-semibold text-slate-900">IA Curada</p>
                      </div>
                      <p className="text-xs text-slate-400">IA escolhe da biblioteca</p>
                    </button>
                    <button type="button"
                      onClick={() => setImageMode("library")}
                      className={`p-3 rounded-xl border-2 text-left transition-all ${
                        imageMode === "library"
                          ? "border-emerald-500 bg-emerald-50"
                          : "border-slate-200 hover:border-slate-300"
                      }`}>
                      <div className="flex items-center gap-1.5 mb-1">
                        <Camera className="w-3.5 h-3.5 text-emerald-600" />
                        <p className="text-xs font-semibold text-slate-900">Minha Foto</p>
                      </div>
                      <p className="text-xs text-slate-400">Seedream Edit + compositor</p>
                    </button>
                  </div>

                  {/* Freepik model selector */}
                  {imageMode === "freepik" && (
                    <div className="flex items-center gap-2 p-1 bg-slate-100 rounded-xl">
                      <button
                        type="button"
                        onClick={() => setFreepikModel("mystic")}
                        className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all ${
                          freepikModel === "mystic"
                            ? "bg-white text-violet-700 shadow-sm"
                            : "text-slate-500 hover:text-slate-700"
                        }`}
                      >
                        ✦ Mystic
                      </button>
                      <button
                        type="button"
                        onClick={() => setFreepikModel("seedream")}
                        className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all ${
                          freepikModel === "seedream"
                            ? "bg-white text-violet-700 shadow-sm"
                            : "text-slate-500 hover:text-slate-700"
                        }`}
                      >
                        ✦ Seedream V5
                      </button>
                    </div>
                  )}

                  {/* Library photo picker */}
                  {imageMode === "library" && (
                    <div className="space-y-2">
                      {libraryLoading ? (
                        <div className="flex items-center justify-center py-8 text-slate-400">
                          <Loader2 className="w-5 h-5 animate-spin mr-2" />
                          <span className="text-sm">Carregando fotos...</span>
                        </div>
                      ) : libraryPhotos.length === 0 ? (
                        /* ── Empty state: upload zone ── */
                        <label
                          className="flex flex-col items-center justify-center gap-2 py-8 border-2 border-dashed border-slate-200 rounded-xl cursor-pointer hover:border-emerald-400 hover:bg-emerald-50/40 transition-colors text-slate-400"
                          onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
                          onDrop={e => {
                            e.preventDefault(); e.stopPropagation();
                            const file = e.dataTransfer.files[0];
                            if (file) handleLibraryUpload(file);
                          }}
                        >
                          {libUploadLoading ? (
                            <>
                              <Loader2 className="w-7 h-7 animate-spin text-emerald-500" />
                              <p className="text-sm text-emerald-600">Fazendo upload...</p>
                            </>
                          ) : (
                            <>
                              <Upload className="w-7 h-7 opacity-40" />
                              <p className="text-sm font-medium">Arraste uma foto ou clique para escolher</p>
                              <p className="text-xs text-slate-300">A foto será salva na biblioteca automaticamente</p>
                            </>
                          )}
                          <input type="file" accept="image/*" className="hidden"
                            onChange={e => { const f = e.target.files?.[0]; if (f) handleLibraryUpload(f); }} />
                        </label>
                      ) : (
                        /* ── Grid with inline "add" cell ── */
                        <div className="grid grid-cols-3 gap-2 max-h-52 overflow-y-auto pr-1">
                          {libraryPhotos.map(photo => (
                            <button
                              key={photo.id}
                              type="button"
                              onClick={() => setSelectedLibPhoto(
                                selectedLibPhoto === photo.url ? null : photo.url
                              )}
                              className={`relative aspect-square rounded-xl overflow-hidden border-2 transition-all ${
                                selectedLibPhoto === photo.url
                                  ? "border-emerald-500 ring-2 ring-emerald-300"
                                  : "border-transparent hover:border-slate-300"
                              }`}
                            >
                              <img src={photo.url} alt={photo.filename}
                                className="w-full h-full object-cover" />
                              {selectedLibPhoto === photo.url && (
                                <div className="absolute inset-0 bg-emerald-500/20 flex items-center justify-center">
                                  <Check className="w-6 h-6 text-white drop-shadow" />
                                </div>
                              )}
                            </button>
                          ))}
                          {/* "+ Add" cell */}
                          <label
                            className="relative aspect-square rounded-xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center cursor-pointer hover:border-emerald-400 hover:bg-emerald-50/40 transition-colors text-slate-400"
                            title="Adicionar foto à biblioteca"
                            onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
                            onDrop={e => {
                              e.preventDefault(); e.stopPropagation();
                              const file = e.dataTransfer.files[0];
                              if (file) handleLibraryUpload(file);
                            }}
                          >
                            {libUploadLoading
                              ? <Loader2 className="w-5 h-5 animate-spin text-emerald-500" />
                              : <Plus className="w-5 h-5 opacity-50" />
                            }
                            <input type="file" accept="image/*" className="hidden"
                              onChange={e => { const f = e.target.files?.[0]; if (f) handleLibraryUpload(f); }} />
                          </label>
                        </div>
                      )}
                      {libUploadError && (
                        <p className="text-xs text-red-500 mt-1">{libUploadError}</p>
                      )}
                    </div>
                  )}

                  {/* Action button */}
                  <Button
                    onClick={
                      imageMode === "freepik" ? handleGenerateImage
                      : imageMode === "real"   ? handleCurateImage
                      :                         handleComposeWithLibraryPhoto
                    }
                    disabled={
                      imgLoading ||
                      (imageMode === "library" && !selectedLibPhoto)
                    }
                    className={`w-full text-white ${
                      imageMode === "library"
                        ? "bg-emerald-600 hover:bg-emerald-700"
                        : "bg-violet-600 hover:bg-violet-700"
                    }`}
                  >
                    {imgLoading ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        {imageMode === "freepik" ? "Gerando imagem..."
                         : imageMode === "real"   ? "Curando com IA..."
                         :                         "Estilizando com IA..."}</>
                    ) : imageMode === "freepik" ? (
                      <><ImageIcon className="w-4 h-4 mr-2" />Gerar com Freepik IA</>
                    ) : imageMode === "real" ? (
                      <><Brain className="w-4 h-4 mr-2" />Curar foto com IA</>
                    ) : (
                      <><Layers className="w-4 h-4 mr-2" />Estilizar com Seedream</>
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
                setFreepikModel("mystic");
                setReferenceB64(null);
                setReferenceType("image/jpeg");
                setReferencePreview(null);
                setReferenceWarn(null);
                setExtraInstructions("");
                setComposedUrl(null);
                setViewComposed(true);
                setLibraryPhotos([]);
                setSelectedLibPhoto(null);
                setReferenceUrl("");
                setLibUploadError(null);
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
              <div className="flex flex-col items-end gap-2">
                {copyError && (
                  <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-1.5 text-right max-w-xs">
                    {copyError}
                  </p>
                )}
                <Button onClick={handleGenerate}
                  disabled={loading || !theme || !objective}
                  className="bg-violet-600 hover:bg-violet-700 text-white min-w-[140px]">
                  {loading
                    ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Gerando...</>
                    : <><Sparkles className="w-4 h-4 mr-2" />Gerar post</>}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
