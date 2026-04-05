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

import { useState } from "react";
import { X, ScanSearch, Loader2, Check, ExternalLink, Palette, Type, Layout, Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import type { BrandProfile } from "@/types";

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
  const [postUrl,        setPostUrl]        = useState("");
  const [imageUrl,       setImageUrl]       = useState("");   // URL resolvida (preview)
  const [uploadB64,      setUploadB64]      = useState<string | null>(null);
  const [uploadMime,     setUploadMime]     = useState("image/jpeg");
  const [uploadPreview,  setUploadPreview]  = useState<string | null>(null);
  const [format,         setFormat]         = useState("feed");
  const [loading,        setLoading]        = useState(false);
  const [error,          setError]          = useState<string | null>(null);
  const [result,         setResult]         = useState<AnalysisResult | null>(null);

  function handleUploadFile(file: File) {
    setError(null);
    setPostUrl("");
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const [header, b64] = dataUrl.split(",");
      const mime = header.match(/data:([^;]+)/)?.[1] ?? "image/jpeg";
      setUploadB64(b64);
      setUploadMime(mime);
      setUploadPreview(dataUrl);
    };
    reader.readAsDataURL(file);
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
              <p className="font-semibold text-slate-900 text-sm">Analisar Referência Visual</p>
              <p className="text-xs text-slate-400">{client.name} · DNA visual via IA</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">

          {!result ? (
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
          ) : (
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
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t">
          {result ? (
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
