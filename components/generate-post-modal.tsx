"use client";

import { useState } from "react";
import { X, Sparkles, Loader2, Copy, Check, Hash, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import type { BrandProfile } from "@/types";
import { FORMAT_OPTIONS, FORMAT_ASPECT } from "@/lib/post-formats";

type Format = "feed" | "stories" | "reels_cover";

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

export function GeneratePostModal({ client, onClose, onGenerated }: Props) {
  const [theme,          setTheme]          = useState("");
  const [objective,      setObjective]      = useState("");
  const [format,         setFormat]         = useState<Format>("feed");
  const [loading,        setLoading]        = useState(false);
  const [result,         setResult]         = useState<CopyResult | null>(null);
  const [copied,         setCopied]         = useState<string | null>(null);
  const [imgLoading,     setImgLoading]     = useState(false);
  const [imgError,       setImgError]       = useState<string | null>(null);

  async function handleGenerate() {
    if (!theme || !objective) return;
    setLoading(true);
    setResult(null);

    const res  = await fetch("/api/posts/generate-copy", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ client_id: client.id, theme, objective, format }),
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

          {/* Formulário */}
          {!result && (
            <>
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

          {/* Preview do resultado */}
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

              {/* Imagem gerada */}
              {result.image_url ? (
                <div className={`rounded-xl overflow-hidden border w-full ${FORMAT_ASPECT[format]}`}>
                  <img src={result.image_url} alt="Imagem gerada" className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="space-y-2">
                  <Button
                    onClick={handleGenerateImage}
                    disabled={imgLoading}
                    className="w-full bg-violet-600 hover:bg-violet-700 text-white"
                  >
                    {imgLoading
                      ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Gerando imagem...</>
                      : <><ImageIcon className="w-4 h-4 mr-2" />Gerar imagem com Freepik</>}
                  </Button>
                  {imgError && (
                    <p className="text-xs text-red-500 text-center">{imgError}</p>
                  )}
                </div>
              )}

              <Button variant="outline" className="w-full" onClick={() => { setResult(null); setImgError(null); }}>
                Gerar outro post
              </Button>
            </div>
          )}
        </div>

        {/* Footer */}
        {!result && (
          <div className="flex justify-end gap-3 px-6 py-4 border-t">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
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
    </div>
  );
}
