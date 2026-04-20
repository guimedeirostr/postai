"use client";

import { useState, useEffect } from "react";
import { X, Sparkles, Loader2, Copy, Check, Hash, ImageIcon, Brain, ChevronRight, Camera, Wand2, Layers, Download, ScanSearch, Upload, Plus, Zap, UserCircle2, Crosshair, Box, SlidersHorizontal, Dna, Eye, Pencil, RefreshCw } from "lucide-react";
import type { BrandPhoto } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import type { BrandProfile, StrategyBriefing, ReferenceDNA, SocialNetwork } from "@/types";
import { FORMAT_OPTIONS, FORMAT_ASPECT } from "@/lib/post-formats";

const LINKEDIN_FORMAT_OPTIONS = [
  { value: "linkedin_post",      label: "Post",      desc: "Até 3.000 chars · Feed" },
  { value: "linkedin_carousel",  label: "Carrossel", desc: "PDF com slides" },
  { value: "linkedin_article",   label: "Artigo",    desc: "800–2000 palavras · SEO" },
] as const;

const LINKEDIN_PILAR_COLORS: Record<string, string> = {
  "Thought Leadership":       "bg-blue-100 text-blue-700",
  "Educação":                  "bg-emerald-100 text-emerald-700",
  "Case / Resultado":          "bg-amber-100 text-amber-700",
  "Bastidores Profissionais":  "bg-orange-100 text-orange-700",
  "Tendência de Mercado":      "bg-sky-100 text-sky-700",
  "Reconhecimento":            "bg-pink-100 text-pink-700",
  "Debate":                    "bg-red-100 text-red-700",
};

type Format = "feed" | "stories" | "reels_cover" | "linkedin_post" | "linkedin_article" | "linkedin_carousel";

// Step 0 = referência visual, Step 1 = strategy, Step 2 = form + generate
type Step = 0 | 1 | 2;

// Shape minimalista de um DesignExample vindo do GET da biblioteca
interface DesignExampleLite {
  id:                    string;
  visual_prompt:         string;
  layout_prompt:         string;
  visual_headline_style: string;
  description:           string;
  pilar:                 string;
  format:                "feed" | "stories" | "reels_cover";
  composition_zone:      "left" | "right" | "bottom" | "top" | "center";
  color_mood:            string;
  image_url?:            string;
  text_zones?:           string;
  background_treatment?: string;
  headline_style?:       string;
  typography_hierarchy?: string;
  logo_placement?:       "top-left" | "top-right" | "bottom-left" | "bottom-right" | "bottom-center" | "none";
  intent?:               "library" | "stage0";
}

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
  slides?:            Array<{ headline: string; subheadline?: string | null; body?: string | null }>;
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
  // Network selector — inicia na primeira rede habilitada do cliente
  const hasLinkedIn   = !!(client.social_networks?.includes("linkedin"));
  const [socialNetwork, setSocialNetwork] = useState<SocialNetwork>(
    client.social_networks?.includes("instagram") ? "instagram"
    : hasLinkedIn ? "linkedin"
    : "instagram"
  );
  const isLinkedIn = socialNetwork === "linkedin";

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
  const [imageMode,          setImageMode]          = useState<"freepik" | "real" | "library" | "fal" | "fal_pulid" | "fal_canny" | "fal_depth" | "ideogram" | "imagen4" | "imagen4_ultra" | "nano_banana2" | "flux_dev" | "gemini">("freepik");
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
  const [captionSuggestion,  setCaptionSuggestion]  = useState("");
  const [libUploadLoading,   setLibUploadLoading]   = useState(false);
  const [libUploadError,     setLibUploadError]     = useState<string | null>(null);

  // ── LinkedIn image state ──────────────────────────────────────────────────
  const [liImgLoading,   setLiImgLoading]   = useState(false);
  const [liImgError,     setLiImgError]     = useState<string | null>(null);
  const [liComposedUrl,  setLiComposedUrl]  = useState<string | null>(null);
  const [liSlideUrls,    setLiSlideUrls]    = useState<string[]>([]);
  const [liTaskId,       setLiTaskId]       = useState<string | null>(null);

  // ── Logo size para Gemini ─────────────────────────────────────────────────
  const [logoSize, setLogoSize] = useState<"S" | "M" | "L">("M");

  // ── Visual prompt — edição e tradução automática ──────────────────────────
  const [editedPrompt,   setEditedPrompt]   = useState("");
  const [isTranslating,  setIsTranslating]  = useState(false);

  // ── Edit / Reload de campos de copy ──────────────────────────────────────
  type CopyField = "visual_headline" | "headline" | "caption";
  const [editField,        setEditField]        = useState<CopyField | null>(null);
  const [editDraft,        setEditDraft]        = useState("");
  const [saveEditLoading,  setSaveEditLoading]  = useState(false);
  const [reloadingField,   setReloadingField]   = useState<CopyField | null>(null);

  // ── Reference DNA state ───────────────────────────────────────────────────
  const [referenceDna,          setReferenceDna]          = useState<ReferenceDNA | null>(null);
  const [referenceAnalyzing,    setReferenceAnalyzing]    = useState(false);
  const [referenceAnalysisError, setReferenceAnalysisError] = useState<string | null>(null);

  // ── Reference Library picker (sub-tab do Stage 0) ─────────────────────────
  const [refSource,         setRefSource]         = useState<"upload" | "library">("upload");
  const [refLibrary,        setRefLibrary]        = useState<DesignExampleLite[]>([]);
  const [refLibraryLoading, setRefLibraryLoading] = useState(false);
  const [refLibraryError,   setRefLibraryError]   = useState<string | null>(null);
  /** ID do design_example escolhido — sent for generate-copy via reference_example_id */
  const [selectedExampleId, setSelectedExampleId] = useState<string | null>(null);

  // ── Preview do layout (P3) ────────────────────────────────────────────────
  const [previewUrl,     setPreviewUrl]     = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError,   setPreviewError]   = useState<string | null>(null);

  // ── FAL.ai advanced state ─────────────────────────────────────────────────
  // Photos for FAL advanced modes are picked from the brand library
  const [falLibPhotos,       setFalLibPhotos]       = useState<BrandPhoto[]>([]);
  const [falLibLoading,      setFalLibLoading]      = useState(false);
  // Character Lock (PuLID): face reference photo
  const [charLockPhoto,      setCharLockPhoto]      = useState<string | null>(null);
  const [idWeight,           setIdWeight]           = useState(1.0);
  // ControlNet (Canny / Depth): reference composition/depth photo
  const [controlPhoto,       setControlPhoto]       = useState<string | null>(null);
  const [controlStrength,    setControlStrength]    = useState(0.7);

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

  // Fetch library photos for FAL advanced modes (PuLID / ControlNet)
  useEffect(() => {
    const isFalAdvanced = imageMode === "fal_pulid" || imageMode === "fal_canny" || imageMode === "fal_depth";
    if (!isFalAdvanced || !result) return;
    if (falLibPhotos.length > 0) return;
    setFalLibLoading(true);
    fetch(`/api/clients/${client.id}/photos`)
      .then(r => r.json())
      .then((data: { photos?: BrandPhoto[] }) => setFalLibPhotos(data.photos ?? []))
      .catch(() => setFalLibPhotos([]))
      .finally(() => setFalLibLoading(false));
  }, [imageMode, result, client.id, falLibPhotos.length]);

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

  // ── Reference library fetcher ────────────────────────────────────────────
  useEffect(() => {
    if (step !== 0 || refSource !== "library") return;
    if (refLibrary.length > 0) return;
    setRefLibraryLoading(true);
    setRefLibraryError(null);
    fetch(`/api/clients/${client.id}/design-examples`)
      .then(r => r.json())
      .then((data: { examples?: DesignExampleLite[] }) => {
        setRefLibrary(data.examples ?? []);
      })
      .catch(() => setRefLibraryError("Não foi possível carregar a biblioteca"))
      .finally(() => setRefLibraryLoading(false));
  }, [step, refSource, client.id, refLibrary.length]);

  /** Seleciona uma referência da biblioteca — promove para ReferenceDNA local */
  function handleSelectLibraryExample(ex: DesignExampleLite) {
    const isRich = !!(ex.text_zones || ex.background_treatment || ex.headline_style);
    if (!isRich) {
      setReferenceAnalysisError("Este exemplo é antigo (sem DNA rico). Use um mais recente ou suba uma nova arte.");
      return;
    }
    setSelectedExampleId(ex.id);
    setReferenceDna({
      composition_zone:      ex.composition_zone,
      text_zones:            ex.text_zones ?? "",
      background_treatment:  ex.background_treatment ?? "",
      headline_style:        ex.headline_style ?? "",
      typography_hierarchy:  ex.typography_hierarchy ?? "",
      visual_prompt:         ex.visual_prompt,
      layout_prompt:         ex.layout_prompt,
      color_mood:            ex.color_mood,
      description:           ex.description,
      pilar:                 ex.pilar,
      format:                ex.format,
      visual_headline_style: ex.visual_headline_style,
      ...(ex.logo_placement ? { logo_placement: ex.logo_placement } : {}),
    });
    setReferenceAnalysisError(null);
  }

  async function handleAnalyzeReference() {
    if (!referenceB64) return;
    setReferenceAnalyzing(true);
    setReferenceAnalysisError(null);
    setReferenceDna(null);
    try {
      const res  = await fetch("/api/posts/analyze-reference", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        // client_id é enviado para que o DNA seja AUTOMATICAMENTE salvo
        // como design_example da marca — fluxo unificado: nada se perde.
        body:    JSON.stringify({
          image_base64: referenceB64,
          image_mime:   referenceType,
          client_id:    client.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setReferenceAnalysisError(data.error ?? "Erro ao analisar referência");
        return;
      }
      setReferenceDna(data as ReferenceDNA);
      // data.design_example_id já foi gravado em design_examples (auto-save).
      // Não precisamos guardar localmente — o backend vai poder carregá-lo
      // pelo reference_dna inline em /api/posts/generate.
    } catch {
      setReferenceAnalysisError("Erro inesperado. Tente novamente.");
    } finally {
      setReferenceAnalyzing(false);
    }
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
        body:    JSON.stringify({ client_id: client.id, campaign_focus: campaignFocus || undefined, social_network: socialNetwork }),
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
    setStep(2);
  }

  function handleProceedWithStrategy() {
    setStep(2);
  }

  async function handleGenerate() {
    if (!theme || !objective) return;
    setLoading(true);
    setResult(null);

    const body: Record<string, string> = { client_id: client.id, theme, objective, format, social_network: socialNetwork };
    if (strategy) {
      if (strategy.pilar)             body.pilar             = strategy.pilar;
      if (strategy.publico_especifico) body.publico_especifico = strategy.publico_especifico;
      if (strategy.dor_desejo)        body.dor_desejo        = strategy.dor_desejo;
      if (strategy.hook_type)         body.hook_type         = strategy.hook_type;
    }
    if (selectedExampleId) {
      // Veio da biblioteca — backend resolve o DNA por ID (evita payload pesado)
      (body as Record<string, unknown>).reference_example_id = selectedExampleId;
    } else if (referenceDna) {
      // DNA já foi extraído pelo Stage 0 — passa estruturado (mais rico)
      (body as Record<string, unknown>).reference_dna = referenceDna;
    } else if (referenceB64) {
      // Fallback: imagem bruta sem análise prévia
      body.reference_image_base64 = referenceB64;
      body.reference_image_type   = referenceType;
    } else if (referenceUrl.trim()) {
      body.reference_url = referenceUrl.trim();
    }
    body.image_provider = freepikModel;
    if (extraInstructions.trim())  body.extra_instructions  = extraInstructions.trim();
    if (captionSuggestion.trim())  body.caption_suggestion  = captionSuggestion.trim();

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
      setEditedPrompt((data as unknown as CopyResult).visual_prompt ?? "");
      onGenerated();
      if (data.reference_warning) setReferenceWarn(data.reference_warning as string);
    } else {
      setCopyError((data.error as string | undefined) ?? "Erro ao gerar copy. Tente novamente.");
    }
    setLoading(false);
  }

  /**
   * Renderiza um preview do layout sem gastar crédito de IA — usa o tema
   * truncado a 6 palavras como placeholder do visual_headline real.
   * Útil pra validar tipografia, logo placement, mood e zona antes de gerar.
   */
  async function handlePreviewLayout() {
    if (!theme) return;
    setPreviewLoading(true);
    setPreviewError(null);
    setPreviewUrl(null);

    const placeholderHeadline = theme.split(/\s+/).slice(0, 6).join(" ");

    const body: Record<string, unknown> = {
      client_id:       client.id,
      visual_headline: placeholderHeadline,
      format,
    };
    if (selectedExampleId)  body.reference_example_id = selectedExampleId;
    else if (referenceDna)  body.reference_dna        = referenceDna;

    try {
      const res  = await fetch("/api/posts/preview", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setPreviewError(data.error ?? "Erro ao gerar preview");
      } else {
        setPreviewUrl(data.preview_url);
      }
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : "Erro de rede");
    } finally {
      setPreviewLoading(false);
    }
  }

  function copyText(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  function startEdit(field: CopyField) {
    if (!result) return;
    const value =
      field === "visual_headline" ? result.visual_headline :
      field === "headline"        ? result.headline :
                                    result.caption;
    setEditDraft(value ?? "");
    setEditField(field);
  }

  async function handleSaveEdit() {
    if (!editField || !result?.post_id) return;
    setSaveEditLoading(true);
    try {
      await fetch(`/api/posts/${result.post_id}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ [editField]: editDraft }),
      });
      setResult(prev => prev ? { ...prev, [editField!]: editDraft } : prev);
    } catch { /* ignora erro — valor local já atualizado */ }
    setSaveEditLoading(false);
    setEditField(null);
  }

  async function handleReloadField(field: CopyField) {
    if (!result?.post_id || reloadingField) return;
    setReloadingField(field);
    try {
      const body: Record<string, unknown> = {
        client_id: client.id,
        theme,
        objective,
        format,
      };
      if (strategy) {
        if (strategy.pilar)              body.pilar              = strategy.pilar;
        if (strategy.publico_especifico) body.publico_especifico = strategy.publico_especifico;
        if (strategy.dor_desejo)         body.dor_desejo         = strategy.dor_desejo;
        if (strategy.hook_type)          body.hook_type          = strategy.hook_type;
      }
      if (selectedExampleId)      body.reference_example_id = selectedExampleId;
      else if (referenceDna)      body.reference_dna        = referenceDna;
      else if (referenceB64)      { body.reference_image_base64 = referenceB64; body.reference_image_type = referenceType; }
      else if (referenceUrl.trim()) body.reference_url        = referenceUrl.trim();
      body.image_provider = freepikModel;
      body.no_persist     = true; // não cria novo post — só regenera o campo
      if (extraInstructions.trim()) body.extra_instructions = extraInstructions.trim();
      if (captionSuggestion.trim()) body.caption_suggestion  = captionSuggestion.trim();

      const res  = await fetch("/api/posts/generate-copy", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });
      const data = await res.json() as Partial<CopyResult> & { error?: string };
      if (res.ok) {
        const newValue = data[field];
        if (newValue) {
          setResult(prev => prev ? { ...prev, [field]: newValue } : prev);
          // Persist to Firestore
          await fetch(`/api/posts/${result.post_id}`, {
            method:  "PATCH",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ [field]: newValue }),
          });
        }
      }
    } catch { /* ignora erro */ }
    setReloadingField(null);
  }

  async function handleGenerateImage() {
    if (!result?.post_id) return;
    setImgLoading(true);
    setImgError(null);

    try {
      // Monta payload base; adiciona params avançados conforme o modo FAL
      const payload: Record<string, unknown> = { post_id: result.post_id };

      // Inclui override do prompt se o usuário editou
      if (editedPrompt && editedPrompt !== result.visual_prompt) {
        payload.visual_prompt_override = editedPrompt;
      }

      if (imageMode === "fal") {
        payload.provider = "fal";
      } else if (imageMode === "fal_pulid") {
        payload.provider            = "fal_pulid";
        payload.character_lock_url  = charLockPhoto;
        payload.id_weight           = idWeight;
      } else if (imageMode === "fal_canny") {
        payload.provider          = "fal_canny";
        payload.control_image_url = controlPhoto;
        payload.control_type      = "canny";
        payload.control_strength  = controlStrength;
      } else if (imageMode === "fal_depth") {
        payload.provider          = "fal_depth";
        payload.control_image_url = controlPhoto;
        payload.control_type      = "depth";
        payload.control_strength  = controlStrength;
      } else if (freepikModel === "seedream") {
        payload.provider = "seedream";
      } else if (imageMode === "ideogram") {
        payload.provider = "ideogram_text";
      } else if (imageMode === "imagen4") {
        payload.provider        = "replicate";
        payload.replicate_model = "google/imagen-4";
      } else if (imageMode === "imagen4_ultra") {
        payload.provider        = "replicate";
        payload.replicate_model = "google/imagen-4-ultra";
      } else if (imageMode === "nano_banana2") {
        payload.provider        = "replicate";
        payload.replicate_model = "google/nano-banana-2";
      } else if (imageMode === "flux_dev") {
        payload.provider        = "replicate";
        payload.replicate_model = "black-forest-labs/flux-dev";
      }
      // freepik (mystic) = default, sem provider no payload

      // ── Gemini: rota própria, síncrona ───────────────────────────────────
      if (imageMode === "gemini") {
        const geminiPayload: Record<string, unknown> = {
          post_id:    result.post_id,
          resolution: "2K",
          logo_size:  logoSize,
        };
        if (selectedLibPhoto) geminiPayload.library_url = selectedLibPhoto;

        const gemRes  = await fetch("/api/posts/generate-image-gemini", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify(geminiPayload),
        });
        const gemData = await gemRes.json() as { image_url?: string; error?: string };
        if (!gemRes.ok) {
          setImgError(gemData.error ?? "Erro na geração Gemini");
          setImgLoading(false);
          return;
        }
        if (gemData.image_url) {
          setResult(prev => prev ? { ...prev, image_url: gemData.image_url } : prev);
        }
        setImgLoading(false);
        return;
      }

      // 1. Submete geração → recebe task_id (async) ou image_url (sync)
      const res = await fetch("/api/posts/generate-image", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
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
      // library_direct: compositor aplica overlay direto na foto — sem geração de IA
      const res  = await fetch("/api/posts/generate-image", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ post_id: result.post_id, image_url: selectedLibPhoto }),
      });
      const data = await res.json() as {
        image_url?:    string;
        composed_url?: string;
        task_id?:      string;
        post_id?:      string;
        error?:        string;
      };

      if (!res.ok) {
        setImgError(data.error ?? "Erro ao compor foto da biblioteca");
        return;
      }

      // Resposta síncrona (library_direct): image_url já disponível
      if (data.image_url) {
        setResult(prev => prev ? { ...prev, image_url: data.image_url } : prev);
        if (data.composed_url) {
          setComposedUrl(data.composed_url);
          setViewComposed(true);
        }
        return;
      }

      // Fallback assíncrono (caso algum dia passe por polling)
      const { task_id, post_id } = data;
      if (!task_id || !post_id) {
        setImgError("Resposta inesperada do servidor.");
        return;
      }

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
          setImgError(checkData.error ?? "Falha ao processar foto");
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

  // ── LinkedIn image / slides generator ────────────────────────────────────
  async function handleGenerateLinkedInImages() {
    if (!result?.post_id) return;
    setLiImgLoading(true);
    setLiImgError(null);
    setLiComposedUrl(null);
    setLiSlideUrls([]);
    setLiTaskId(null);

    try {
      const res  = await fetch("/api/posts/generate-linkedin-images", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ post_id: result.post_id }),
      });
      const data = await res.json() as {
        linkedin_slide_urls?: string[];
        image_url?:           string;
        composed_url?:        string;
        task_id?:             string;
        status?:              string;
        error?:               string;
      };

      if (!res.ok) { setLiImgError(data.error ?? "Erro ao gerar imagem LinkedIn"); return; }

      // Carousel: slides ready immediately
      if (data.linkedin_slide_urls?.length) {
        setLiSlideUrls(data.linkedin_slide_urls);
        return;
      }

      // Sync provider (fal/imagen4): image + composed returned immediately
      if (data.composed_url) { setLiComposedUrl(data.composed_url); return; }
      if (data.image_url)    { setLiComposedUrl(data.image_url); return; }

      // Async provider (Freepik/Seedream): poll check-image
      const task_id = data.task_id;
      if (!task_id) { setLiImgError("Nenhuma imagem retornada"); return; }
      setLiTaskId(task_id);

      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 4000));
        const check     = await fetch(`/api/posts/check-image?task_id=${task_id}&post_id=${result.post_id}`);
        const checkData = await check.json() as { status: string; composed_url?: string; image_url?: string; error?: string };
        if (checkData.status === "COMPLETED") {
          setLiComposedUrl(checkData.composed_url ?? checkData.image_url ?? null);
          return;
        }
        if (checkData.status === "FAILED") { setLiImgError(checkData.error ?? "Falha ao gerar imagem"); return; }
      }
      setLiImgError("Timeout: imagem demorou mais que o esperado.");
    } catch {
      setLiImgError("Erro inesperado. Tente novamente.");
    } finally {
      setLiImgLoading(false);
    }
  }

  const allPilarColors  = { ...PILAR_COLORS, ...LINKEDIN_PILAR_COLORS };
  const pilarColorClass = strategy ? (allPilarColors[strategy.pilar] ?? "bg-slate-100 text-slate-700") : "";

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
          <div className="flex items-center gap-2">
            {/* Seletor de rede — só aparece se o cliente tiver LinkedIn habilitado */}
            {hasLinkedIn && (
              <div className="flex items-center gap-1 p-0.5 bg-slate-100 rounded-lg">
                <button
                  type="button"
                  onClick={() => { setSocialNetwork("instagram"); setFormat("feed"); setStrategy(null); }}
                  className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold transition-all ${
                    !isLinkedIn ? "bg-white text-violet-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  📸 Instagram
                </button>
                <button
                  type="button"
                  onClick={() => { setSocialNetwork("linkedin"); setFormat("linkedin_post"); setStrategy(null); }}
                  className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold transition-all ${
                    isLinkedIn ? "bg-white text-blue-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  💼 LinkedIn
                </button>
              </div>
            )}
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">

          {/* ─── STEP 0: Referência Visual (Instagram only) ─── */}
          {step === 0 && !result && !isLinkedIn && (
            <div className="space-y-5">
              {/* Step indicator */}
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span className="w-5 h-5 rounded-full bg-violet-600 text-white flex items-center justify-center font-bold text-xs">1</span>
                <span className="font-medium text-slate-600">Referência</span>
                <ChevronRight className="w-3 h-3" />
                <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center font-bold text-xs">2</span>
                <span>Estratégia</span>
                <ChevronRight className="w-3 h-3" />
                <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center font-bold text-xs">3</span>
                <span>Conteúdo</span>
              </div>

              {/* Intro */}
              <div className="p-4 bg-violet-50 border border-violet-100 rounded-xl">
                <p className="text-xs font-semibold text-violet-700 mb-1 flex items-center gap-1.5">
                  <Dna className="w-3.5 h-3.5" /> Como funciona
                </p>
                <p className="text-xs text-violet-600 leading-relaxed">
                  Suba uma arte nova <strong>ou</strong> escolha uma referência já salva na biblioteca da marca. A IA lê o DNA visual exato — composição, hierarquia tipográfica, zonas de texto, mood de cores — e usa como guia em todo o pipeline de geração.
                </p>
                {refSource === "library" && (
                  <p className="text-[11px] text-violet-500/80 mt-1.5 italic">
                    Selecionar daqui reaproveita o DNA já analisado — sem reprocessar nem gastar créditos.
                  </p>
                )}
              </div>

              {/* Sub-toggle: Upload novo / Da biblioteca */}
              <div className="flex gap-1 p-1 bg-slate-100 rounded-xl">
                <button
                  type="button"
                  onClick={() => { setRefSource("upload"); setSelectedExampleId(null); }}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                    refSource === "upload"
                      ? "bg-white text-violet-700 shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  <Upload className="w-3.5 h-3.5" /> Nova arte
                </button>
                <button
                  type="button"
                  onClick={() => { setRefSource("library"); setReferenceB64(null); setReferencePreview(null); }}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                    refSource === "library"
                      ? "bg-white text-violet-700 shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" /> Biblioteca da marca
                </button>
              </div>

              {/* ── Library picker ──────────────────────────────────────── */}
              {refSource === "library" && (
                <div className="space-y-3">
                  {refLibraryLoading && (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-5 h-5 text-violet-500 animate-spin" />
                    </div>
                  )}
                  {refLibraryError && (
                    <p className="text-xs text-red-500 text-center">{refLibraryError}</p>
                  )}
                  {!refLibraryLoading && !refLibraryError && refLibrary.length === 0 && (
                    <div className="p-6 bg-slate-50 rounded-xl text-center">
                      <Layers className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                      <p className="text-xs font-semibold text-slate-500">Nenhuma referência salva ainda</p>
                      <p className="text-xs text-slate-400 mt-1">Suba uma arte nova para começar — ela vai ser salva automaticamente aqui.</p>
                    </div>
                  )}
                  {!refLibraryLoading && refLibrary.length > 0 && (
                    <div className="grid grid-cols-2 gap-3 max-h-[360px] overflow-y-auto pr-1">
                      {refLibrary.map(ex => {
                        const isSelected = selectedExampleId === ex.id;
                        const isRich     = !!(ex.text_zones || ex.background_treatment || ex.headline_style);
                        return (
                          <button
                            key={ex.id}
                            type="button"
                            onClick={() => handleSelectLibraryExample(ex)}
                            disabled={!isRich}
                            className={`relative text-left rounded-xl border-2 overflow-hidden transition-all ${
                              isSelected
                                ? "border-violet-500 ring-2 ring-violet-200"
                                : isRich
                                  ? "border-slate-200 hover:border-violet-300"
                                  : "border-slate-100 opacity-50 cursor-not-allowed"
                            }`}
                          >
                            {ex.image_url ? (
                              <div className="aspect-square bg-slate-100">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={ex.image_url} alt={ex.description} className="w-full h-full object-cover" />
                              </div>
                            ) : (
                              <div className="aspect-square bg-gradient-to-br from-violet-100 to-slate-100 flex items-center justify-center">
                                <Dna className="w-8 h-8 text-violet-300" />
                              </div>
                            )}
                            <div className="p-2 bg-white">
                              <div className="flex items-center gap-1 mb-1 flex-wrap">
                                <Badge className={`${PILAR_COLORS[ex.pilar] ?? "bg-slate-100 text-slate-600"} text-[10px] px-1.5 py-0`}>
                                  {ex.pilar}
                                </Badge>
                                {ex.intent === "stage0" && (
                                  <Badge className="bg-violet-100 text-violet-700 text-[10px] px-1.5 py-0">Stage 0</Badge>
                                )}
                                {ex.intent === "library" && (
                                  <Badge className="bg-emerald-100 text-emerald-700 text-[10px] px-1.5 py-0">Biblioteca</Badge>
                                )}
                              </div>
                              <p className="text-[11px] text-slate-700 font-medium leading-snug line-clamp-1">
                                {ex.headline_style || ex.visual_headline_style || ex.description}
                              </p>
                              <p className="text-[10px] text-slate-400 leading-snug line-clamp-1 mt-0.5">
                                {ex.color_mood}
                              </p>
                            </div>
                            {isSelected && (
                              <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-violet-600 text-white flex items-center justify-center">
                                <Check className="w-3.5 h-3.5" />
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Upload zone */}
              {refSource === "upload" && (
              <>
              <label
                className={`flex items-center gap-3 p-4 rounded-xl border-2 border-dashed cursor-pointer transition-all ${
                  referenceB64
                    ? "border-emerald-400 bg-emerald-50"
                    : "border-slate-200 hover:border-violet-300 hover:bg-violet-50/40"
                }`}
                onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
                onDrop={e => {
                  e.preventDefault(); e.stopPropagation();
                  const file = e.dataTransfer.files?.[0];
                  if (file && file.type.startsWith("image/")) handleReferenceFile(file);
                }}
              >
                <input type="file" accept="image/*" className="hidden"
                  onChange={e => { if (e.target.files?.[0]) handleReferenceFile(e.target.files[0]); }} />
                {referencePreview ? (
                  <>
                    <img src={referencePreview} alt="Referência" className="w-16 h-16 object-cover rounded-lg flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-emerald-700">Arte carregada ✓</p>
                      <p className="text-xs text-slate-400">Pronto para análise de DNA</p>
                    </div>
                    <button type="button" onClick={e => {
                      e.preventDefault();
                      setReferenceB64(null); setReferencePreview(null);
                      setReferenceType("image/jpeg"); setReferenceDna(null);
                      setReferenceAnalysisError(null);
                    }} className="text-slate-400 hover:text-red-500 flex-shrink-0">
                      <X className="w-4 h-4" />
                    </button>
                  </>
                ) : (
                  <>
                    <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">
                      <ScanSearch className="w-6 h-6 text-slate-400" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-600">Arraste ou clique para enviar</p>
                      <p className="text-xs text-slate-400 mt-0.5">Salve o post do Instagram como imagem e faça upload</p>
                    </div>
                  </>
                )}
              </label>

              {/* Botão Analisar DNA (só aparece no modo upload) */}
              {referenceB64 && !referenceDna && (
                <Button
                  onClick={handleAnalyzeReference}
                  disabled={referenceAnalyzing}
                  className="w-full bg-violet-600 hover:bg-violet-700 text-white"
                >
                  {referenceAnalyzing
                    ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Lendo DNA visual...</>
                    : <><Dna className="w-4 h-4 mr-2" />Analisar DNA da arte</>}
                </Button>
              )}
              </>
              )}

              {referenceAnalysisError && (
                <p className="text-xs text-red-500 text-center">{referenceAnalysisError}</p>
              )}

              {/* Resultado do DNA */}
              {referenceDna && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-100 rounded-xl">
                    <Dna className="w-4 h-4 text-emerald-600" />
                    <p className="text-xs font-semibold text-emerald-700">DNA extraído com sucesso — confirme e avance</p>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-3 bg-slate-50 rounded-xl">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Zona de texto</p>
                      <p className="text-sm font-bold text-slate-800 capitalize">{referenceDna.composition_zone}</p>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-xl">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Formato</p>
                      <p className="text-sm font-bold text-slate-800 capitalize">{referenceDna.format}</p>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-xl">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Pilar</p>
                      <p className="text-sm font-bold text-slate-800">{referenceDna.pilar}</p>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-xl">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Mood de cores</p>
                      <p className="text-sm font-bold text-slate-800">{referenceDna.color_mood}</p>
                    </div>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-xl">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Hierarquia tipográfica</p>
                    <p className="text-xs text-slate-700 leading-relaxed">{referenceDna.typography_hierarchy}</p>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-xl">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Tratamento de fundo</p>
                    <p className="text-xs text-slate-700 leading-relaxed">{referenceDna.background_treatment}</p>
                  </div>

                  <div className="p-3 bg-violet-50 border border-violet-100 rounded-xl">
                    <p className="text-xs font-semibold text-violet-500 uppercase tracking-wide mb-1">Análise</p>
                    <p className="text-xs text-violet-800 leading-relaxed italic">{referenceDna.description}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ─── STEP 1: Strategy ─── */}
          {step === 1 && !result && (
            <div className="space-y-5">
              {/* Step indicator */}
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-500 flex items-center justify-center font-bold text-xs">1</span>
                <span>Referência</span>
                <ChevronRight className="w-3 h-3" />
                <span className="w-5 h-5 rounded-full bg-violet-600 text-white flex items-center justify-center font-bold text-xs">2</span>
                <span className="font-medium text-slate-600">Estratégia</span>
                <ChevronRight className="w-3 h-3" />
                <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center font-bold text-xs">3</span>
                <span>Conteúdo</span>
              </div>

              {/* Reference DNA badge (se vier do Stage 0) */}
              {referenceDna && (
                <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-100 rounded-xl">
                  <Dna className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-emerald-700">DNA da referência ativo</p>
                    <p className="text-xs text-emerald-600 truncate">{referenceDna.description}</p>
                  </div>
                </div>
              )}

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

          {/* ─── STEP 2: Form ─── */}
          {step === 2 && !result && (
            <>
              {/* Step indicator */}
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-500 flex items-center justify-center font-bold text-xs">1</span>
                <span>Referência</span>
                <ChevronRight className="w-3 h-3" />
                <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-500 flex items-center justify-center font-bold text-xs">2</span>
                <span>Estratégia</span>
                <ChevronRight className="w-3 h-3" />
                <span className="w-5 h-5 rounded-full bg-violet-600 text-white flex items-center justify-center font-bold text-xs">3</span>
                <span className="font-medium text-slate-600">Conteúdo</span>
              </div>

              {/* Reference DNA badge (se vier do Stage 0) */}
              {referenceDna && (
                <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-100 rounded-xl">
                  <Dna className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-emerald-700">DNA de referência ativo — estilo guiado</p>
                    <p className="text-xs text-slate-500 truncate">Composição: <strong>{referenceDna.composition_zone}</strong> · {referenceDna.color_mood}</p>
                  </div>
                  <button type="button" onClick={() => setReferenceDna(null)}
                    className="ml-auto text-slate-400 hover:text-red-500 flex-shrink-0">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

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
                  {(isLinkedIn ? LINKEDIN_FORMAT_OPTIONS : FORMAT_OPTIONS).map(opt => (
                    <button key={opt.value} type="button"
                      onClick={() => setFormat(opt.value as Format)}
                      className={`p-3 rounded-xl border-2 text-left transition-all ${
                        format === opt.value
                          ? isLinkedIn ? "border-blue-500 bg-blue-50" : "border-violet-500 bg-violet-50"
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

              {/* ── Preview do layout (sem custo de IA) — Instagram only ────── */}
              {!isLinkedIn && (referenceDna || selectedExampleId) && theme && (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Eye className="w-3.5 h-3.5 text-violet-500" />
                      <p className="text-xs font-semibold text-slate-700">Preview do layout</p>
                    </div>
                    <button
                      type="button"
                      onClick={handlePreviewLayout}
                      disabled={previewLoading}
                      className="text-xs font-semibold text-violet-600 hover:text-violet-700 disabled:opacity-50 flex items-center gap-1"
                    >
                      {previewLoading
                        ? <><Loader2 className="w-3 h-3 animate-spin" />Renderizando...</>
                        : previewUrl ? "Atualizar" : "Gerar preview"}
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-snug">
                    Vê tipografia, posição do logo, mood e zona <strong>antes</strong> de gerar — sem gastar crédito de IA.
                  </p>
                  {previewError && (
                    <p className="text-xs text-red-500">{previewError}</p>
                  )}
                  {previewUrl && (
                    <div className="rounded-lg overflow-hidden border border-slate-200 bg-white">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={previewUrl} alt="Preview do layout" className="w-full h-auto" />
                    </div>
                  )}
                </div>
              )}

              {/* Referência visual (opcional) — Instagram only */}
              {!isLinkedIn && <div className="space-y-2">
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
              </div>}

              {/* LinkedIn info banner */}
              {isLinkedIn && (
                <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-100 rounded-xl">
                  <span className="text-blue-500 mt-0.5 text-sm">💼</span>
                  <p className="text-xs text-blue-700 leading-relaxed">
                    <strong>LinkedIn:</strong> A IA vai buscar tendências de mercado em tempo real, criar um post com thought leadership e hook profissional adaptado ao algoritmo do LinkedIn.
                  </p>
                </div>
              )}

              {/* Sugestão de legenda */}
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-slate-700">
                  Sugestão de legenda <span className="text-slate-400 font-normal">(opcional)</span>
                </Label>
                <textarea
                  value={captionSuggestion}
                  onChange={e => setCaptionSuggestion(e.target.value)}
                  placeholder={'Cole aqui uma legenda que você gostou, um trecho de texto ou ideia base — a IA vai usar como inspiração e adaptar para a marca.'}
                  rows={3}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 resize-none focus:outline-none focus:ring-2 focus:ring-violet-400"
                />
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
                    <div className="flex items-center gap-1">
                      <button
                        title="Reescrever"
                        onClick={() => handleReloadField("visual_headline")}
                        disabled={!!reloadingField}
                        className="text-slate-400 hover:text-violet-600 disabled:opacity-40 p-0.5 rounded">
                        {reloadingField === "visual_headline"
                          ? <Loader2 className="w-4 h-4 animate-spin text-violet-500" />
                          : <RefreshCw className="w-4 h-4" />}
                      </button>
                      <button
                        title="Editar"
                        onClick={() => startEdit("visual_headline")}
                        className="text-slate-400 hover:text-violet-600 p-0.5 rounded">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => copyText(result.visual_headline, "visual_headline")}
                        className="text-slate-400 hover:text-slate-700 p-0.5 rounded">
                        {copied === "visual_headline" ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  {editField === "visual_headline" ? (
                    <div className="space-y-2 pt-1">
                      <input
                        type="text"
                        value={editDraft}
                        onChange={e => setEditDraft(e.target.value)}
                        maxLength={80}
                        className="w-full rounded-lg border border-violet-300 bg-white px-3 py-1.5 text-xl font-black text-violet-900 focus:outline-none focus:ring-2 focus:ring-violet-400"
                      />
                      <div className="flex items-center gap-2">
                        <button
                          onClick={handleSaveEdit}
                          disabled={saveEditLoading}
                          className="flex items-center gap-1 px-3 py-1 rounded-lg bg-violet-600 text-white text-xs font-medium hover:bg-violet-700 disabled:opacity-60">
                          {saveEditLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                          Salvar
                        </button>
                        <button
                          onClick={() => setEditField(null)}
                          className="px-3 py-1 rounded-lg bg-slate-100 text-slate-600 text-xs font-medium hover:bg-slate-200">
                          Cancelar
                        </button>
                        <span className="text-xs text-slate-400 ml-auto">{editDraft.length}/80</span>
                      </div>
                    </div>
                  ) : (
                    <p className="font-black text-violet-900 text-2xl leading-tight">{result.visual_headline}</p>
                  )}
                </div>
              )}

              {/* Headline completa */}
              <div className="p-4 bg-slate-50 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-slate-500 uppercase tracking-wide">Headline</Label>
                  <div className="flex items-center gap-1">
                    <button
                      title="Reescrever"
                      onClick={() => handleReloadField("headline")}
                      disabled={!!reloadingField}
                      className="text-slate-400 hover:text-violet-600 disabled:opacity-40 p-0.5 rounded">
                      {reloadingField === "headline"
                        ? <Loader2 className="w-4 h-4 animate-spin text-violet-500" />
                        : <RefreshCw className="w-4 h-4" />}
                    </button>
                    <button
                      title="Editar"
                      onClick={() => startEdit("headline")}
                      className="text-slate-400 hover:text-violet-600 p-0.5 rounded">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={() => copyText(result.headline, "headline")}
                      className="text-slate-400 hover:text-slate-700 p-0.5 rounded">
                      {copied === "headline" ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                {editField === "headline" ? (
                  <div className="space-y-2">
                    <textarea
                      rows={2}
                      value={editDraft}
                      onChange={e => setEditDraft(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-base font-bold text-slate-900 resize-none focus:outline-none focus:ring-2 focus:ring-violet-400"
                    />
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleSaveEdit}
                        disabled={saveEditLoading}
                        className="flex items-center gap-1 px-3 py-1 rounded-lg bg-violet-600 text-white text-xs font-medium hover:bg-violet-700 disabled:opacity-60">
                        {saveEditLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                        Salvar
                      </button>
                      <button
                        onClick={() => setEditField(null)}
                        className="px-3 py-1 rounded-lg bg-slate-100 text-slate-600 text-xs font-medium hover:bg-slate-200">
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="font-bold text-slate-900 text-lg leading-snug">{result.headline}</p>
                )}
              </div>

              {/* Caption */}
              <div className="p-4 bg-slate-50 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-slate-500 uppercase tracking-wide">Legenda</Label>
                  <div className="flex items-center gap-1">
                    <button
                      title="Reescrever"
                      onClick={() => handleReloadField("caption")}
                      disabled={!!reloadingField}
                      className="text-slate-400 hover:text-violet-600 disabled:opacity-40 p-0.5 rounded">
                      {reloadingField === "caption"
                        ? <Loader2 className="w-4 h-4 animate-spin text-violet-500" />
                        : <RefreshCw className="w-4 h-4" />}
                    </button>
                    <button
                      title="Editar"
                      onClick={() => startEdit("caption")}
                      className="text-slate-400 hover:text-violet-600 p-0.5 rounded">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={() => copyText(result.caption, "caption")}
                      className="text-slate-400 hover:text-slate-700 p-0.5 rounded">
                      {copied === "caption" ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                {editField === "caption" ? (
                  <div className="space-y-2">
                    <textarea
                      rows={6}
                      value={editDraft}
                      onChange={e => setEditDraft(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 resize-none focus:outline-none focus:ring-2 focus:ring-violet-400"
                    />
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleSaveEdit}
                        disabled={saveEditLoading}
                        className="flex items-center gap-1 px-3 py-1 rounded-lg bg-violet-600 text-white text-xs font-medium hover:bg-violet-700 disabled:opacity-60">
                        {saveEditLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                        Salvar
                      </button>
                      <button
                        onClick={() => setEditField(null)}
                        className="px-3 py-1 rounded-lg bg-slate-100 text-slate-600 text-xs font-medium hover:bg-slate-200">
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-slate-700 text-sm whitespace-pre-wrap leading-relaxed">{result.caption}</p>
                )}
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

              {/* Visual prompt — editável com tradução automática */}
              {!isLinkedIn && result.visual_prompt && (
                <div className="p-4 bg-violet-50 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-violet-500 uppercase tracking-wide">Prompt visual (Freepik)</Label>
                    <button
                      onClick={async () => {
                        if (!editedPrompt.trim() || isTranslating) return;
                        setIsTranslating(true);
                        try {
                          const res = await fetch("/api/translate", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ text: editedPrompt }),
                          });
                          const data = await res.json() as { translated?: string; error?: string };
                          if (res.ok && data.translated) {
                            setEditedPrompt(data.translated);
                          }
                        } catch { /* silencioso */ }
                        finally { setIsTranslating(false); }
                      }}
                      disabled={isTranslating}
                      className="flex items-center gap-1 text-xs text-violet-600 hover:text-violet-800 disabled:opacity-50 transition-colors font-medium"
                    >
                      {isTranslating
                        ? <><Loader2 className="w-3 h-3 animate-spin" /> Traduzindo...</>
                        : <><Wand2 className="w-3 h-3" /> Traduzir para EN</>
                      }
                    </button>
                  </div>
                  <textarea
                    value={editedPrompt}
                    onChange={e => setEditedPrompt(e.target.value)}
                    rows={5}
                    className="w-full text-slate-700 text-sm rounded-lg border border-violet-200 bg-white px-3 py-2 resize-y focus:outline-none focus:ring-2 focus:ring-violet-400 leading-relaxed"
                    placeholder="Descreva a imagem em português ou inglês..."
                  />
                  {editedPrompt !== result.visual_prompt && (
                    <button
                      onClick={() => setEditedPrompt(result.visual_prompt)}
                      className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      ↩ Restaurar original
                    </button>
                  )}
                </div>
              )}

              {/* ── LinkedIn image / slides section ── */}
              {isLinkedIn && (format === "linkedin_post" || format === "linkedin_carousel") && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <ImageIcon className="w-4 h-4 text-blue-500" />
                    <Label className="text-xs text-blue-600 uppercase tracking-wide font-semibold">
                      {format === "linkedin_carousel" ? "Slides do Carrossel" : "Imagem do Post"}
                    </Label>
                  </div>

                  {/* Carousel slides preview */}
                  {format === "linkedin_carousel" && liSlideUrls.length > 0 && (
                    <div className="space-y-2">
                      <div className="grid grid-cols-3 gap-2">
                        {liSlideUrls.map((url, idx) => (
                          <div key={idx} className="relative aspect-square rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={url} alt={`Slide ${idx + 1}`} className="w-full h-full object-cover" />
                            <a href={url} download={`slide-${idx + 1}.jpg`} target="_blank"
                              className="absolute bottom-1 right-1 bg-black/50 rounded-md p-1 text-white hover:bg-black/70">
                              <Download className="w-3 h-3" />
                            </a>
                          </div>
                        ))}
                      </div>
                      <button
                        onClick={() => { setLiSlideUrls([]); setLiImgError(null); }}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-600 text-xs font-medium hover:bg-slate-50 transition-colors w-full justify-center">
                        <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
                        Regerar slides
                      </button>
                    </div>
                  )}

                  {/* linkedin_post image preview */}
                  {format === "linkedin_post" && liComposedUrl && (
                    <div className="space-y-2">
                      <div className="rounded-xl overflow-hidden border w-full aspect-video">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={liComposedUrl} alt="Imagem LinkedIn" className="w-full h-full object-cover" />
                      </div>
                      <div className="flex gap-2">
                        <a href={liComposedUrl} download={`linkedin-post-${result.post_id}.jpg`} target="_blank"
                          className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-600 text-xs font-medium hover:bg-slate-50 transition-colors">
                          <Download className="w-3.5 h-3.5" /> Download
                        </a>
                        <button
                          onClick={() => { setLiComposedUrl(null); setLiImgError(null); }}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-600 text-xs font-medium hover:bg-slate-50 transition-colors">
                          <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
                          Regerar imagem
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Generate button */}
                  {(format === "linkedin_carousel" ? liSlideUrls.length === 0 : !liComposedUrl) && (
                    <Button
                      onClick={handleGenerateLinkedInImages}
                      disabled={liImgLoading}
                      className="w-full text-white bg-blue-600 hover:bg-blue-700"
                    >
                      {liImgLoading
                        ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{format === "linkedin_carousel" ? "Gerando slides..." : "Gerando imagem..."}</>
                        : <><ImageIcon className="w-4 h-4 mr-2" />{format === "linkedin_carousel" ? "Gerar slides do carrossel" : "Gerar imagem do post"}</>
                      }
                    </Button>
                  )}

                  {liImgError && <p className="text-xs text-red-500 text-center">{liImgError}</p>}
                </div>
              )}

              {/* ── Imagem — Instagram only ── */}
              {!isLinkedIn && (result.image_url ? (
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

                  {/* ── Gerar nova versão da imagem ── */}
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={() => {
                        setResult(prev => prev ? { ...prev, image_url: null, composed_url: null } : prev);
                        setComposedUrl(null);
                        setImgError(null);
                        setCurateReason(null);
                      }}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-600 text-xs font-medium hover:bg-slate-50 hover:border-slate-300 transition-colors w-full justify-center">
                      <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
                      Gerar nova versão da imagem
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* ── Mode selector 2×2 ── */}
                  <div className="grid grid-cols-2 gap-2">
                    {/* Freepik IA */}
                    <button type="button"
                      onClick={() => setImageMode("freepik")}
                      className={`p-3 rounded-xl border-2 text-left transition-all ${
                        imageMode === "freepik" || imageMode === "fal"
                          ? "border-violet-500 bg-violet-50"
                          : "border-slate-200 hover:border-slate-300"
                      }`}>
                      <div className="flex items-center gap-1.5 mb-1">
                        <Wand2 className="w-3.5 h-3.5 text-violet-600" />
                        <p className="text-xs font-semibold text-slate-900">Freepik / FAL</p>
                      </div>
                      <p className="text-xs text-slate-400">Gera do zero com prompt</p>
                    </button>

                    {/* FAL.ai Pro — advanced controls */}
                    <button type="button"
                      onClick={() => setImageMode(
                        imageMode === "fal_pulid" || imageMode === "fal_canny" || imageMode === "fal_depth"
                          ? imageMode
                          : "fal_pulid"
                      )}
                      className={`p-3 rounded-xl border-2 text-left transition-all ${
                        imageMode === "fal_pulid" || imageMode === "fal_canny" || imageMode === "fal_depth"
                          ? "border-amber-500 bg-amber-50"
                          : "border-slate-200 hover:border-slate-300"
                      }`}>
                      <div className="flex items-center gap-1.5 mb-1">
                        <Zap className="w-3.5 h-3.5 text-amber-500" />
                        <p className="text-xs font-semibold text-slate-900">FAL Avançado</p>
                      </div>
                      <p className="text-xs text-slate-400">Character lock · ControlNet</p>
                    </button>

                    {/* IA Curada */}
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

                    {/* Minha Foto */}
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
                      <p className="text-xs text-slate-400">Foto direta + compositor</p>
                    </button>
                  </div>

                  {/* ── Freepik / FAL padrão — toggle de modelo ── */}
                  {(imageMode === "freepik" || imageMode === "fal" || imageMode === "ideogram" || imageMode === "imagen4" || imageMode === "imagen4_ultra" || imageMode === "nano_banana2" || imageMode === "flux_dev" || imageMode === "gemini") && (
                    <div className="space-y-1.5">
                      {/* Linha 1: Freepik models */}
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-1">Freepik</p>
                      <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl">
                        <button type="button"
                          onClick={() => { setImageMode("freepik"); setFreepikModel("mystic"); }}
                          className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold transition-all ${
                            imageMode === "freepik" && freepikModel === "mystic"
                              ? "bg-white text-violet-700 shadow-sm"
                              : "text-slate-500 hover:text-slate-700"
                          }`}>
                          ✦ Mystic
                        </button>
                        <button type="button"
                          onClick={() => { setImageMode("freepik"); setFreepikModel("seedream"); }}
                          className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold transition-all ${
                            imageMode === "freepik" && freepikModel === "seedream"
                              ? "bg-white text-violet-700 shadow-sm"
                              : "text-slate-500 hover:text-slate-700"
                          }`}>
                          ✦ Seedream V5
                        </button>
                        <button type="button" onClick={() => setImageMode("fal")}
                          className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold transition-all ${
                            imageMode === "fal"
                              ? "bg-white text-amber-600 shadow-sm"
                              : "text-slate-500 hover:text-slate-700"
                          }`}>
                          ⚡ Flux Pro
                        </button>
                      </div>
                      {/* Linha 2: Replicate — gratuitos */}
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-1 pt-1">Replicate <span className="text-emerald-600 normal-case font-semibold">grátis</span></p>
                      <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl">
                        <button type="button" onClick={() => setImageMode("ideogram")}
                          className={`flex-1 py-1.5 px-1.5 rounded-lg text-xs font-semibold transition-all ${
                            imageMode === "ideogram"
                              ? "bg-white text-rose-600 shadow-sm"
                              : "text-slate-500 hover:text-slate-700"
                          }`}>
                          ✍ Ideogram
                        </button>
                        <button type="button" onClick={() => setImageMode("imagen4")}
                          className={`flex-1 py-1.5 px-1.5 rounded-lg text-xs font-semibold transition-all ${
                            imageMode === "imagen4"
                              ? "bg-white text-blue-600 shadow-sm"
                              : "text-slate-500 hover:text-slate-700"
                          }`}>
                          🎨 Imagen 4
                        </button>
                        <button type="button" onClick={() => setImageMode("flux_dev")}
                          className={`flex-1 py-1.5 px-1.5 rounded-lg text-xs font-semibold transition-all ${
                            imageMode === "flux_dev"
                              ? "bg-white text-emerald-600 shadow-sm"
                              : "text-slate-500 hover:text-slate-700"
                          }`}>
                          ⚡ Flux Dev
                        </button>
                      </div>
                      {/* Linha 3: Google Gemini — Experimental */}
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-1 pt-1">Google <span className="text-sky-500 normal-case font-semibold">experimental</span></p>
                      {/* Linha 3: Google Premium */}
                      <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl">
                        <button type="button" onClick={() => setImageMode("nano_banana2")}
                          className={`flex-1 py-1.5 px-1.5 rounded-lg text-xs font-semibold transition-all ${
                            imageMode === "nano_banana2"
                              ? "bg-white text-yellow-600 shadow-sm"
                              : "text-slate-500 hover:text-slate-700"
                          }`}>
                          🍌 Nano Banana 2
                        </button>
                        <button type="button" onClick={() => setImageMode("imagen4_ultra")}
                          className={`flex-1 py-1.5 px-1.5 rounded-lg text-xs font-semibold transition-all ${
                            imageMode === "imagen4_ultra"
                              ? "bg-white text-indigo-600 shadow-sm"
                              : "text-slate-500 hover:text-slate-700"
                          }`}>
                          ✨ Imagen 4 Ultra
                        </button>
                      </div>
                      {/* Linha 4: Gemini */}
                      <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl">
                        <button type="button" onClick={() => setImageMode("gemini")}
                          className={`flex-1 py-1.5 px-1.5 rounded-lg text-xs font-semibold transition-all ${
                            imageMode === "gemini"
                              ? "bg-white text-sky-600 shadow-sm"
                              : "text-slate-500 hover:text-slate-700"
                          }`}>
✨ Gemini Flash
                        </button>
                      </div>
                      {/* Descrição do modelo selecionado */}
                      {imageMode === "ideogram" && (
                        <p className="text-xs text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">
                          <strong>Ideogram v3:</strong> Tipografia nativa na arte — uma zona de texto com qualidade de agência. Logo e handle adicionados pelo compositor depois.
                        </p>
                      )}
                      {imageMode === "imagen4" && (
                        <p className="text-xs text-blue-700 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                          <strong>Imagen 4:</strong> Fotorrealismo premium do Google. Ideal para cenas complexas, pessoas e produtos com alto detalhe.
                        </p>
                      )}
                      {imageMode === "flux_dev" && (
                        <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
                          <strong>Flux Dev:</strong> 12B parâmetros, experimental, gratuito. Boa diversidade criativa para cenários e ambientes.
                        </p>
                      )}
                      {imageMode === "nano_banana2" && (
                        <p className="text-xs text-yellow-700 bg-yellow-50 border border-yellow-100 rounded-lg px-3 py-2">
                          <strong>Nano Banana 2:</strong> Modelo Google de última geração — até 4K, suporte nativo 4:5 (sem crop), até 14 imagens de referência. Ideal para retratos e produtos com máximo detalhe.
                        </p>
                      )}
                      {imageMode === "imagen4_ultra" && (
                        <p className="text-xs text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2">
                          <strong>Imagen 4 Ultra:</strong> Versão premium do Imagen 4 — renderização de texto nativo, detalhes intrincados e cenas complexas. Limite de 400 chars no prompt.
                        </p>
                      )}
                      {imageMode === "gemini" && (
                        <div className="bg-sky-50 border border-sky-100 rounded-lg px-3 py-2.5 space-y-2.5">
                          <p className="text-xs text-sky-700">
                            <strong>Gemini 3.1 Flash Image:</strong> Pipeline enxuto — gera Foto + Texto nativo em uma chamada, sem polling. Aceita foto da biblioteca como referência img2img. Sharp adiciona só Logo + Assinatura.
                          </p>
                          {/* Tamanho da logo */}
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-sky-600 uppercase tracking-wide whitespace-nowrap">Tamanho da logo</span>
                            <div className="flex items-center gap-1 p-0.5 bg-white border border-sky-200 rounded-lg">
                              {(["S", "M", "L"] as const).map(sz => (
                                <button
                                  key={sz}
                                  type="button"
                                  onClick={() => setLogoSize(sz)}
                                  className={`px-2.5 py-0.5 rounded-md text-xs font-bold transition-all ${
                                    logoSize === sz
                                      ? "bg-sky-600 text-white shadow-sm"
                                      : "text-sky-400 hover:text-sky-600"
                                  }`}>
                                  {sz}
                                </button>
                              ))}
                            </div>
                            <span className="text-[10px] text-sky-500">
                              {logoSize === "S" ? "180px — discreta" : logoSize === "M" ? "280px — equilibrada" : "400px — destaque"}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── FAL Avançado — sub-seletor ── */}
                  {(imageMode === "fal_pulid" || imageMode === "fal_canny" || imageMode === "fal_depth") && (
                    <div className="space-y-3">
                      {/* Sub-mode selector */}
                      <div className="flex gap-2 p-1 bg-amber-50 border border-amber-100 rounded-xl">
                        <button type="button" onClick={() => { setImageMode("fal_pulid"); setCharLockPhoto(null); setControlPhoto(null); }}
                          className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1 ${
                            imageMode === "fal_pulid" ? "bg-white text-amber-700 shadow-sm" : "text-slate-500 hover:text-amber-700"
                          }`}>
                          <UserCircle2 className="w-3.5 h-3.5" /> Pessoa
                        </button>
                        <button type="button" onClick={() => { setImageMode("fal_canny"); setCharLockPhoto(null); setControlPhoto(null); }}
                          className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1 ${
                            imageMode === "fal_canny" ? "bg-white text-amber-700 shadow-sm" : "text-slate-500 hover:text-amber-700"
                          }`}>
                          <Crosshair className="w-3.5 h-3.5" /> Composição
                        </button>
                        <button type="button" onClick={() => { setImageMode("fal_depth"); setCharLockPhoto(null); setControlPhoto(null); }}
                          className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1 ${
                            imageMode === "fal_depth" ? "bg-white text-amber-700 shadow-sm" : "text-slate-500 hover:text-amber-700"
                          }`}>
                          <Box className="w-3.5 h-3.5" /> Volume
                        </button>
                      </div>

                      {/* Descrição do modo selecionado */}
                      <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl text-xs text-amber-800 leading-relaxed">
                        {imageMode === "fal_pulid" && (
                          <><strong>Character Lock (PuLID):</strong> Trava a identidade/rosto de uma pessoa de referência. Ideal para manter consistência de modelo ou influencer nos posts.</>
                        )}
                        {imageMode === "fal_canny" && (
                          <><strong>Structure Lock (Canny):</strong> Preserva a estrutura e composição de uma foto de referência. Ideal para replicar o layout de um post aprovado.</>
                        )}
                        {imageMode === "fal_depth" && (
                          <><strong>Depth Lock:</strong> Preserva a perspectiva e volume de uma imagem de referência. Ideal para manter a relação espacial entre sujeito e fundo.</>
                        )}
                      </div>

                      {/* Foto de referência — picker da biblioteca */}
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-slate-600 flex items-center gap-1">
                          <ImageIcon className="w-3.5 h-3.5 text-amber-500" />
                          {imageMode === "fal_pulid" ? "Foto de referência (rosto/pessoa)" : "Imagem de referência (composição)"}
                        </p>

                        {falLibLoading ? (
                          <div className="flex items-center justify-center py-6 text-slate-400">
                            <Loader2 className="w-4 h-4 animate-spin mr-2" />
                            <span className="text-xs">Carregando biblioteca...</span>
                          </div>
                        ) : falLibPhotos.length === 0 ? (
                          <div className="flex items-center gap-3 p-3 bg-slate-50 border border-dashed border-slate-200 rounded-xl text-xs text-slate-500">
                            <Camera className="w-5 h-5 text-slate-300 flex-shrink-0" />
                            <span>Nenhuma foto na biblioteca. Faça upload em <strong>Fotos</strong> primeiro.</span>
                          </div>
                        ) : (
                          <div className="grid grid-cols-4 gap-1.5 max-h-40 overflow-y-auto pr-1">
                            {falLibPhotos.map(photo => {
                              const activePhoto = imageMode === "fal_pulid" ? charLockPhoto : controlPhoto;
                              const setPhoto    = imageMode === "fal_pulid" ? setCharLockPhoto : setControlPhoto;
                              const isSelected  = activePhoto === photo.url;
                              return (
                                <button key={photo.id} type="button"
                                  onClick={() => setPhoto(isSelected ? null : photo.url)}
                                  className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                                    isSelected
                                      ? "border-amber-500 ring-2 ring-amber-300"
                                      : "border-transparent hover:border-amber-300"
                                  }`}>
                                  <img src={photo.url} alt={photo.filename} className="w-full h-full object-cover" />
                                  {isSelected && (
                                    <div className="absolute inset-0 bg-amber-500/20 flex items-center justify-center">
                                      <Check className="w-5 h-5 text-white drop-shadow" />
                                    </div>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Sliders de intensidade */}
                      <div className="space-y-3 p-3 bg-slate-50 rounded-xl">
                        <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                          <SlidersHorizontal className="w-3.5 h-3.5" />
                          {imageMode === "fal_pulid" ? "Força do lock de identidade" : "Força do controle de estrutura"}
                        </div>
                        <div className="space-y-1">
                          <input
                            type="range"
                            min={imageMode === "fal_pulid" ? 0.5 : 0.3}
                            max={imageMode === "fal_pulid" ? 1.8 : 1.0}
                            step={0.1}
                            value={imageMode === "fal_pulid" ? idWeight : controlStrength}
                            onChange={e => {
                              const v = parseFloat(e.target.value);
                              if (imageMode === "fal_pulid") setIdWeight(v);
                              else setControlStrength(v);
                            }}
                            className="w-full accent-amber-500"
                          />
                          <div className="flex justify-between text-xs text-slate-400">
                            <span>{imageMode === "fal_pulid" ? "Criativo" : "Livre"}</span>
                            <span className="font-semibold text-amber-600">
                              {imageMode === "fal_pulid" ? idWeight.toFixed(1) : controlStrength.toFixed(1)}
                            </span>
                            <span>{imageMode === "fal_pulid" ? "Idêntico" : "Exato"}</span>
                          </div>
                        </div>
                      </div>
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
                  {(() => {
                    const isFalAdvanced = imageMode === "fal_pulid" || imageMode === "fal_canny" || imageMode === "fal_depth";
                    const activeRef     = imageMode === "fal_pulid" ? charLockPhoto : controlPhoto;
                    const needsRef      = isFalAdvanced && !activeRef;
                    const isDisabled    = imgLoading || (imageMode === "library" && !selectedLibPhoto) || needsRef;

                    const btnColor = imageMode === "library"
                      ? "bg-emerald-600 hover:bg-emerald-700"
                      : isFalAdvanced || imageMode === "fal"
                      ? "bg-amber-500 hover:bg-amber-600"
                      : imageMode === "ideogram"
                      ? "bg-rose-600 hover:bg-rose-700"
                      : imageMode === "imagen4"
                      ? "bg-blue-600 hover:bg-blue-700"
                      : imageMode === "flux_dev"
                      ? "bg-emerald-600 hover:bg-emerald-700"
                      : "bg-violet-600 hover:bg-violet-700";

                    const label = imgLoading
                      ? imageMode === "real" ? "Curando com IA..." : imageMode === "library" ? "Compondo post..." : "Gerando imagem..."
                      : imageMode === "fal"       ? "Gerar com Flux Pro"
                      : imageMode === "fal_pulid"  ? "Gerar com Character Lock"
                      : imageMode === "fal_canny"  ? "Gerar com Canny Lock"
                      : imageMode === "fal_depth"  ? "Gerar com Depth Lock"
                      : imageMode === "ideogram"   ? "✍ Gerar com Ideogram v3"
                      : imageMode === "imagen4"    ? "🎨 Gerar com Imagen 4"
                      : imageMode === "flux_dev"   ? "⚡ Gerar com Flux Dev"
                      : imageMode === "gemini"     ? "✨ Gerar com Gemini Flash"
                      : imageMode === "real"       ? "Curar foto com IA"
                      : imageMode === "library"    ? "Usar esta foto"
                      : freepikModel === "seedream" ? "Gerar com Seedream V5"
                      : "Gerar com Freepik IA";

                    const Icon = imgLoading ? Loader2
                      : isFalAdvanced || imageMode === "fal" ? Zap
                      : imageMode === "real"    ? Brain
                      : imageMode === "library" ? Layers
                      : ImageIcon;

                    return (
                      <Button
                        onClick={
                          imageMode === "real"    ? handleCurateImage
                          : imageMode === "library" ? handleComposeWithLibraryPhoto
                          :                         handleGenerateImage
                        }
                        disabled={isDisabled}
                        className={`w-full text-white ${btnColor}`}
                      >
                        <Icon className={`w-4 h-4 mr-2 ${imgLoading ? "animate-spin" : ""}`} />
                        {needsRef ? "Selecione uma foto de referência" : label}
                      </Button>
                    );
                  })()}

                  {imgError && (
                    <p className="text-xs text-red-500 text-center">{imgError}</p>
                  )}
                </div>
              ))}


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
                setReferenceDna(null);
                setReferenceAnalyzing(false);
                setReferenceAnalysisError(null);
                setExtraInstructions("");
                setCaptionSuggestion("");
                setComposedUrl(null);
                setViewComposed(true);
                setLibraryPhotos([]);
                setSelectedLibPhoto(null);
                setReferenceUrl("");
                setLibUploadError(null);
                // FAL advanced reset
                setFalLibPhotos([]);
                setCharLockPhoto(null);
                setIdWeight(1.0);
                setControlPhoto(null);
                setControlStrength(0.7);
                setStep(0);
                setStrategy(null);
                setTheme("");
                setObjective("");
                setFormat("feed");
                setCampaignFocus("");
                setSelectedExampleId(null);
                setPreviewUrl(null);
                setPreviewError(null);
                setLogoSize("M");
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

            {/* Stage 0: Referência (Instagram) / Avançar (LinkedIn vai direto ao step 1) */}
            {step === 0 && (
              <Button
                onClick={() => setStep(1)}
                className={`text-white min-w-[160px] ${isLinkedIn ? "bg-blue-600 hover:bg-blue-700" : "bg-violet-600 hover:bg-violet-700"}`}
              >
                {selectedExampleId
                  ? <><Check className="w-4 h-4 mr-2" />Usar esta referência</>
                  : referenceDna
                    ? <><Dna className="w-4 h-4 mr-2" />Usar DNA extraído</>
                    : <><ChevronRight className="w-4 h-4 mr-2" />Pular referência</>}
              </Button>
            )}

            {/* Stage 1: Estratégia */}
            {step === 1 && (
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

            {/* Stage 2: Conteúdo */}
            {step === 2 && (
              <div className="flex flex-col items-end gap-2">
                {copyError && (
                  <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-1.5 text-right max-w-xs">
                    {copyError}
                  </p>
                )}
                <Button onClick={handleGenerate}
                  disabled={loading || !theme || !objective}
                  className={`text-white min-w-[140px] ${isLinkedIn ? "bg-blue-600 hover:bg-blue-700" : "bg-violet-600 hover:bg-violet-700"}`}>
                  {loading
                    ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Gerando...</>
                    : isLinkedIn
                      ? <><span className="mr-1.5 text-sm">💼</span>Gerar post LinkedIn</>
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
