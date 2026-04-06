"use client";

/**
 * AnalyzeReferenceModal
 *
 * Permite que o usuário cole a URL de uma imagem do Instagram (ou qualquer
 * imagem pública) e o Claude faz a engenharia reversa visual — extraindo
 * paleta de cores, tipografia, composição, estilo — e salva como
 * design_example do cliente no Firestore.
 *
 * Integra o Analisador Visual Blueprint diretamente no PostAI.
 */

import { useState, useEffect } from "react";
import { X, ScanSearch, Loader2, Check, ExternalLink, Palette, Type, Layout, Camera, Dna, Sparkles, ShieldCheck } from "lucide-react";
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

const FORMAT_OPTIONS = [
  { value: "feed",        label: "Feed" },
  { value: "stories",     label: "Stories" },
  { value: "reels_cover", label: "Reels" },
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

export function AnalyzeReferenceModal({ client, onClose, onSaved }: Props) {
  // Tab: "add" = adicionar referência individual, "synthesize" = sintetizar DNA
  const [tab, setTab] = useState<"add" | "synthesize">("add");

  // ── Estado — Adicionar Referência ─────────────────────────────────────────
  const [postUrl,        setPostUrl]        = useState("");
  const [imageUrl,       setImageUrl]       = useState("");
  const [uploadB64,      setUploadB64]      = useState<string | null>(null);
  const [uploadMime,     setUploadMime]     = useState("image/jpeg");
  const [uploadPreview,  setUploadPreview]  = useState<string | null>(null);
  const [format,         setFormat]         = useState("feed");
  const [loading,        setLoading]        = useState(false);
  const [error,          setError]          = useState<string | null>(null);
  const [result,         setResult]         = useState<AnalysisResult | null>(null);

  // ── Estado — Síntese de DNA ───────────────────────────────────────────────
  const [currentDna,       setCurrentDna]       = useState<BrandDNA | null>(null);
  const [examplesCount,    setExamplesCount]    = useState(0);
  const [dnaLoading,       setDnaLoading]       = useState(false);
  const [synthesizing,     setSynthesizing]     = useState(false);
  const [synthesisError,   setSynthesisError]   = useState<string | null>(null);
  const [synthesisMessage, setSynthesisMessage] = useState<string | null>(null);

  // Carrega DNA atual quando abre aba de síntese
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
      if (!res.ok) {
        setSynthesisError(data.error ?? "Erro na síntese");
        return;
      }
      setCurrentDna(data.dna ?? null);
      setSynthesisMessage(data.message ?? "DNA sintetizado com sucesso!");
      onSaved();
    } catch {
      setSynthesisError("Erro inesperado. Tente novamente.");
    } finally {
      setSynthesizing(false);
    }
  }

  function handleUploadFile(file: File) {
    setError(null);
    setPostUrl("");
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
      canvas.width = width; canvas.height = height;
      canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
      setUploadB64(dataUrl.split(",")[1]);
      setUploadMime("image/jpeg");
      setUploadPreview(dataUrl);
    };
    img.onerror = () => {
      // fallback: use FileReader without compression
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        setUploadB64(dataUrl.split(",")[1]);
        setUploadMime(file.type || "image/jpeg");
        setUploadPreview(dataUrl);
      };
      reader.readAsDataURL(file);
    };
    img.src = objectUrl;
  }

  function clearUpload() {
    setUploadB64(null);
    setUploadMime("image/jpeg");
    setUploadPreview(null);
  }

  async function handleAnalyze() {
    if (!uploadB64 && !postUrl.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const body: Record<string, string> = { format };

      if (uploadB64) {
        // Upload direto — sem fetch externo, funciona sempre
        body.image_base64 = uploadB64;
        body.image_type   = uploadMime;
      } else {
        const trimmed = postUrl.trim();
        if (/instagram\.com\/(p|reel|tv)\//.test(trimmed)) {
          body.source_url = trimmed;
        } else {
          body.image_url = trimmed;
        }
      }

      const res = await fetch(`/api/clients/${client.id}/analyze-reference`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });

      const data = await res.json() as AnalysisResult & { error?: string; image_url?: string };
      if (!res.ok) {
        setError(data.error ?? "Erro na análise");
        return;
      }

      setImageUrl(data.image_url ?? uploadPreview ?? postUrl);
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
    setError(null);
    setFormat("feed");
  }

  const metadata = result?.blueprint?.metadata as Record<string, string | string[]> | undefined;
  const dominantColors = (metadata?.dominant_colors as string[] | undefined) ?? [];

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
          <button
            onClick={() => setTab("add")}
            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
              tab === "add" ? "bg-white text-violet-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <ScanSearch className="w-3.5 h-3.5" /> Adicionar Referência
          </button>
          <button
            onClick={() => setTab("synthesize")}
            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
              tab === "synthesize" ? "bg-white text-violet-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
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
                  {/* Status atual */}
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

                  {/* Como funciona */}
                  <div className="p-4 bg-violet-50 border border-violet-100 rounded-xl space-y-2">
                    <p className="text-xs font-semibold text-violet-700 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5" /> Como funciona o Machine Learning
                    </p>
                    <p className="text-xs text-violet-600 leading-relaxed">
                      O agente de síntese analisa <strong>visualmente</strong> todos os posts de referência desta marca — vê as imagens reais + os metadados — e extrai os <strong>padrões consistentes</strong>: onde o texto sempre vive, qual é o background típico, o estilo fotográfico, a hierarquia tipográfica.
                    </p>
                    <p className="text-xs text-violet-600 leading-relaxed">
                      O resultado alimenta o <strong>Art Director</strong> como lei primária em toda geração futura. Quanto mais referências, mais preciso o DNA.
                    </p>
                  </div>

                  {/* Botão de síntese */}
                  <Button
                    onClick={handleSynthesize}
                    disabled={synthesizing || examplesCount < 3}
                    className="w-full bg-violet-600 hover:bg-violet-700 text-white"
                  >
                    {synthesizing
                      ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Analisando {examplesCount} posts com IA...</>
                      : currentDna
                      ? <><Dna className="w-4 h-4 mr-2" />Re-sintetizar DNA ({examplesCount} posts)</>
                      : <><Dna className="w-4 h-4 mr-2" />Sintetizar DNA da Marca</>}
                  </Button>

                  {synthesisError && (
                    <p className="text-xs text-red-500 text-center">{synthesisError}</p>
                  )}
                  {synthesisMessage && (
                    <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-100 rounded-xl">
                      <Check className="w-4 h-4 text-emerald-600" />
                      <p className="text-xs text-emerald-700">{synthesisMessage}</p>
                    </div>
                  )}

                  {/* Resultado do DNA */}
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
                        {[
                          ["Posicionamento de Texto", currentDna.text_placement_pattern],
                          ["Fundo nos Textos",        currentDna.background_treatment],
                          ["Tipografia",              currentDna.typography_pattern],
                          ["Fotografia",              currentDna.photography_style],
                          ["Cores",                   currentDna.color_treatment],
                        ].map(([label, value]) => (
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

          {tab === "add" && !result ? (
            <>
              {/* Upload zone — método principal */}
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
                    e.preventDefault();
                    e.stopPropagation();
                    const file = e.dataTransfer.files?.[0];
                    if (file && file.type.startsWith("image/")) handleUploadFile(file);
                  }}
                >
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={e => { if (e.target.files?.[0]) handleUploadFile(e.target.files[0]); }}
                  />
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

              {/* URL — fallback para imagens diretas */}
              {!uploadB64 && (
                <div className="space-y-1.5">
                  <Label className="text-slate-500">Ou URL direta da imagem</Label>
                  <Input
                    value={postUrl}
                    onChange={e => setPostUrl(e.target.value)}
                    placeholder="https://... (não funciona com links do Instagram)"
                    type="url"
                  />
                  <p className="text-xs text-amber-600">⚠️ URLs do Instagram bloqueiam acesso server-side — prefira o upload acima.</p>
                </div>
              )}

              {/* Formato */}
              <div className="space-y-2">
                <Label>Formato</Label>
                <div className="grid grid-cols-3 gap-2">
                  {FORMAT_OPTIONS.map(opt => (
                    <button key={opt.value} type="button"
                      onClick={() => setFormat(opt.value)}
                      className={`p-2.5 rounded-xl border-2 text-sm font-medium transition-all ${
                        format === opt.value
                          ? "border-violet-500 bg-violet-50 text-violet-700"
                          : "border-slate-200 text-slate-600 hover:border-slate-300"
                      }`}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Preview URL direta */}
              {!uploadB64 && postUrl && (
                <div className="rounded-xl overflow-hidden border bg-slate-50 flex items-center justify-center min-h-24">
                  <img
                    src={postUrl}
                    alt="Preview"
                    className="max-h-48 object-contain"
                    onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                </div>
              )}

              {error && (
                <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}
            </>
          ) : tab === "add" && result ? (
            /* ── Resultado da análise ── */
            <div className="space-y-4">
              {/* Sucesso banner */}
              <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-100 rounded-xl">
                <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                  <Check className="w-4 h-4 text-green-600" />
                </div>
                <div>
                  <p className="font-semibold text-green-800 text-sm">Análise salva com sucesso!</p>
                  <p className="text-xs text-green-600">Referência ID: {result.id}</p>
                </div>
              </div>

              {/* Preview imagem */}
              <div className="rounded-xl overflow-hidden border bg-slate-50 flex items-center justify-center">
                <img src={imageUrl} alt="Referência analisada" className="max-h-56 object-contain" />
              </div>

              {/* Pilar + formato + zone */}
              <div className="flex flex-wrap items-center gap-2">
                <span className={`text-xs font-semibold px-3 py-1 rounded-full ${PILAR_COLORS[result.pilar] ?? "bg-slate-100 text-slate-600"}`}>
                  {result.pilar}
                </span>
                <Badge variant="outline" className="text-xs">{FORMAT_OPTIONS.find(f => f.value === result.format)?.label ?? result.format}</Badge>
                <Badge variant="outline" className="text-xs capitalize">{result.composition_zone}</Badge>
                {postUrl && (
                  <a href={postUrl} target="_blank" rel="noopener"
                    className="ml-auto text-xs text-violet-600 hover:underline flex items-center gap-1">
                    <ExternalLink className="w-3 h-3" /> Ver post original
                  </a>
                )}
              </div>

              {/* Descrição do estilo */}
              <div className="p-4 bg-slate-50 rounded-xl space-y-1">
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wide flex items-center gap-1">
                  <Layout className="w-3.5 h-3.5" /> Estilo visual
                </p>
                <p className="text-sm text-slate-700">{result.description}</p>
                <p className="text-xs text-slate-400 italic">{result.color_mood}</p>
              </div>

              {/* Cores dominantes */}
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

              {/* Visual headline style */}
              {result.visual_headline_style && (
                <div className="p-4 bg-slate-50 rounded-xl space-y-1">
                  <p className="text-xs font-medium text-slate-400 uppercase tracking-wide flex items-center gap-1">
                    <Type className="w-3.5 h-3.5" /> Tipografia detectada
                  </p>
                  <p className="text-sm text-slate-700">{result.visual_headline_style}</p>
                </div>
              )}

              {/* Visual prompt (colapsado) */}
              <details className="p-4 bg-violet-50 rounded-xl space-y-1 cursor-pointer">
                <summary className="text-xs font-medium text-violet-500 uppercase tracking-wide">
                  Visual Prompt (para Freepik / FAL.ai)
                </summary>
                <p className="text-sm text-slate-700 mt-2 leading-relaxed">{result.visual_prompt}</p>
              </details>

              <details className="p-4 bg-indigo-50 rounded-xl space-y-1 cursor-pointer">
                <summary className="text-xs font-medium text-indigo-500 uppercase tracking-wide">
                  Layout Prompt (para composição img2img)
                </summary>
                <p className="text-sm text-slate-700 mt-2 leading-relaxed">{result.layout_prompt}</p>
              </details>
            </div>
          ) : null}
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
              <Button
                onClick={handleAnalyze}
                disabled={loading || (!uploadB64 && !postUrl.trim())}
                className="bg-violet-600 hover:bg-violet-700 text-white min-w-[160px]">
                {loading
                  ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Analisando...</>
                  : <><ScanSearch className="w-4 h-4 mr-2" />Extrair DNA visual</>}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
