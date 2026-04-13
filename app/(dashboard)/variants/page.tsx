"use client";

import { useEffect, useState } from "react";
import {
  Layers, Loader2, Sparkles, AlertCircle, ImageIcon,
  Copy, Check, Hash, ChevronDown, Zap,
} from "lucide-react";
import type { BrandProfile } from "@/types";
import type { VariantCopy, GenerateVariantsResponse } from "@/app/api/posts/generate-variants/route";

// ── Hook badge colors ─────────────────────────────────────────────────────────

const HOOK_COLORS: Record<string, string> = {
  "Dor":          "bg-red-100 text-red-700",
  "Curiosidade":  "bg-amber-100 text-amber-700",
  "Pergunta":     "bg-sky-100 text-sky-700",
  "Prova Social": "bg-emerald-100 text-emerald-700",
  "Controvérsia": "bg-orange-100 text-orange-700",
  "Número":       "bg-violet-100 text-violet-700",
};

// ── Variant card ──────────────────────────────────────────────────────────────

interface VariantCardProps {
  variant:    VariantCopy;
  index:      number;
  clientId:   string;
}

function VariantCard({ variant, index, clientId }: VariantCardProps) {
  const [copied,       setCopied]       = useState<string | null>(null);
  const [imgLoading,   setImgLoading]   = useState(false);
  const [imgError,     setImgError]     = useState<string | null>(null);
  const [imageUrl,     setImageUrl]     = useState<string | null>(null);
  const [showCaption,  setShowCaption]  = useState(false);

  void clientId; // used for future image generation scoping

  function copyText(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  async function handleGenerateImage() {
    setImgLoading(true);
    setImgError(null);
    try {
      const res  = await fetch("/api/posts/generate-image", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ post_id: variant.post_id }),
      });
      const data = await res.json() as { image_url?: string; task_id?: string; post_id?: string; error?: string };
      if (!res.ok) { setImgError(data.error ?? "Erro ao iniciar geração"); setImgLoading(false); return; }

      if (data.image_url) {
        setImageUrl(data.image_url);
        setImgLoading(false);
        return;
      }

      // Freepik async — poll
      const { task_id, post_id } = data as { task_id: string; post_id: string };
      for (let i = 0; i < 22; i++) {
        await new Promise(r => setTimeout(r, 4000));
        const check     = await fetch(`/api/posts/check-image?task_id=${task_id}&post_id=${post_id}`);
        const checkData = await check.json() as { status: string; image_url?: string; error?: string };
        if (checkData.status === "COMPLETED" && checkData.image_url) {
          setImageUrl(checkData.image_url);
          setImgLoading(false);
          return;
        }
        if (checkData.status === "FAILED") {
          setImgError(checkData.error ?? "Falha na geração");
          setImgLoading(false);
          return;
        }
      }
      setImgError("Timeout. Tente novamente.");
    } catch { setImgError("Erro inesperado."); }
    setImgLoading(false);
  }

  const hookColor = HOOK_COLORS[variant.hook_type] ?? "bg-slate-100 text-slate-600";
  const framework = variant.framework_used?.split("_")[0]?.toUpperCase() ?? "COPY";

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
      {/* Image area */}
      <div className="relative w-full bg-gradient-to-br from-slate-100 to-slate-200" style={{ aspectRatio: "1/1" }}>
        {imageUrl ? (
          <img src={imageUrl} alt={variant.visual_headline} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-3 p-4">
            <ImageIcon className="w-8 h-8 text-slate-300" />
            <p
              className="text-sm font-bold text-slate-600 text-center leading-tight max-w-[80%]"
            >
              {variant.visual_headline}
            </p>
          </div>
        )}

        {/* Variant badge */}
        <span className="absolute top-2 left-2 bg-black/60 text-white text-[11px] font-bold px-2 py-0.5 rounded-full">
          #{index + 1}
        </span>

        {/* Hook badge */}
        <span className={`absolute top-2 right-2 text-[11px] font-semibold px-2 py-0.5 rounded-full ${hookColor}`}>
          {variant.hook_type}
        </span>
      </div>

      {/* Content */}
      <div className="p-4 flex flex-col gap-3 flex-1">
        {/* Badges */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700">
            {framework}
          </span>
        </div>

        {/* Headline */}
        <p className="font-bold text-slate-900 text-sm leading-snug">
          {variant.headline}
        </p>

        {/* Caption preview / expand */}
        <div>
          <p className={`text-xs text-slate-500 leading-relaxed ${showCaption ? "" : "line-clamp-3"}`}>
            {variant.caption}
          </p>
          {variant.caption.length > 120 && (
            <button
              type="button"
              onClick={() => setShowCaption(v => !v)}
              className="flex items-center gap-0.5 text-[11px] text-slate-400 hover:text-slate-600 mt-1"
            >
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showCaption ? "rotate-180" : ""}`} />
              {showCaption ? "Menos" : "Ver mais"}
            </button>
          )}
        </div>

        {/* Hashtags preview */}
        {variant.hashtags?.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {variant.hashtags.slice(0, 4).map(h => (
              <span key={h} className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">
                #{h}
              </span>
            ))}
            {variant.hashtags.length > 4 && (
              <span className="text-[10px] text-slate-400 px-1 py-0.5">
                +{variant.hashtags.length - 4}
              </span>
            )}
          </div>
        )}

        {/* Error */}
        {imgError && (
          <div className="flex items-start gap-1.5 rounded-lg bg-red-50 border border-red-200 px-2.5 py-2">
            <AlertCircle className="h-3.5 w-3.5 text-red-500 flex-none mt-0.5" />
            <p className="text-xs text-red-600">{imgError}</p>
          </div>
        )}

        {/* Actions */}
        <div className="mt-auto flex flex-col gap-2">
          {/* Copy actions */}
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => copyText(variant.caption, `caption-${variant.post_id}`)}
              className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
            >
              {copied === `caption-${variant.post_id}`
                ? <Check className="w-3 h-3 text-green-500" />
                : <Copy className="w-3 h-3" />}
              Legenda
            </button>
            <button
              type="button"
              onClick={() => copyText(variant.hashtags.map(h => `#${h}`).join(" "), `hash-${variant.post_id}`)}
              className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
            >
              {copied === `hash-${variant.post_id}`
                ? <Check className="w-3 h-3 text-green-500" />
                : <Hash className="w-3 h-3" />}
              Hashtags
            </button>
          </div>

          {/* Generate image */}
          <button
            type="button"
            onClick={handleGenerateImage}
            disabled={imgLoading || !!imageUrl}
            className={[
              "w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold text-white transition-colors",
              imgLoading
                ? "bg-violet-300 cursor-not-allowed"
                : imageUrl
                  ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                  : "bg-violet-600 hover:bg-violet-700",
            ].join(" ")}
          >
            {imgLoading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Gerando...
              </>
            ) : imageUrl ? (
              <>
                <Check className="w-3.5 h-3.5" />
                Imagem pronta
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                Gerar Imagem
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function VariantsPage() {
  const [clients,       setClients]       = useState<BrandProfile[]>([]);
  const [clientId,      setClientId]      = useState("");
  const [focus,         setFocus]         = useState("");
  const [count,         setCount]         = useState<2 | 4 | 6>(4);
  const [format,        setFormat]        = useState("feed");
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState<string | null>(null);
  const [result,        setResult]        = useState<GenerateVariantsResponse | null>(null);

  useEffect(() => {
    fetch("/api/clients")
      .then(r => r.json())
      .then(d => {
        const list = (d.clients ?? []) as BrandProfile[];
        setClients(list);
        if (list.length > 0) setClientId(list[0].id);
      })
      .catch(() => {});
  }, []);

  async function handleGenerate() {
    if (!clientId) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res  = await fetch("/api/posts/generate-variants", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ client_id: clientId, count, campaign_focus: focus || undefined, format }),
      });
      const data = await res.json() as GenerateVariantsResponse & { error?: string };
      if (!res.ok) { setError(data.error ?? "Erro ao gerar variantes"); return; }
      setResult(data);
    } catch {
      setError("Erro de rede. Verifique sua conexão e tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  const selectedClient = clients.find(c => c.id === clientId);

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-9 h-9 rounded-xl bg-violet-600 flex items-center justify-center">
            <Layers className="w-4.5 h-4.5 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Variantes de Post</h1>
        </div>
        <p className="text-slate-500 text-sm ml-12">
          Gere múltiplas variações de copy em paralelo — cada uma com um hook diferente, ideal para A/B test.
        </p>
      </div>

      {/* Config card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          {/* Client */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Cliente
            </label>
            <select
              value={clientId}
              onChange={e => setClientId(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-500"
            >
              {clients.length === 0 && (
                <option value="">Nenhum cliente cadastrado</option>
              )}
              {clients.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Format */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Formato
            </label>
            <select
              value={format}
              onChange={e => setFormat(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-500"
            >
              <option value="feed">Feed</option>
              <option value="stories">Stories</option>
              <option value="reels_cover">Capa de Reels</option>
            </select>
          </div>

          {/* Campaign focus */}
          <div className="flex flex-col gap-1.5 md:col-span-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Foco da Campanha <span className="font-normal text-slate-300">(opcional)</span>
            </label>
            <input
              type="text"
              value={focus}
              onChange={e => setFocus(e.target.value)}
              placeholder="Ex: lançamento de produto, Black Friday, conteúdo educativo..."
              className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>
        </div>

        {/* Count selector */}
        <div className="flex flex-col gap-2 mb-5">
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Número de Variantes
          </label>
          <div className="flex gap-2">
            {([2, 4, 6] as const).map(n => (
              <button
                key={n}
                type="button"
                onClick={() => setCount(n)}
                className={[
                  "flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-all duration-150",
                  count === n
                    ? "border-violet-500 bg-violet-600 text-white shadow-sm"
                    : "border-slate-200 bg-white text-slate-600 hover:border-violet-300 hover:text-violet-700",
                ].join(" ")}
              >
                {n} variantes
              </button>
            ))}
          </div>
        </div>

        {/* Hooks preview */}
        <div className="flex flex-wrap gap-1.5 mb-5">
          {["Dor", "Curiosidade", "Pergunta", "Prova Social", "Controvérsia", "Número"].slice(0, count).map(hook => (
            <span
              key={hook}
              className={`text-xs font-medium px-2.5 py-1 rounded-full ${HOOK_COLORS[hook] ?? "bg-slate-100 text-slate-600"}`}
            >
              {hook}
            </span>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 px-4 py-3 mb-4">
            <AlertCircle className="h-4 w-4 text-red-500 flex-none mt-0.5" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Generate button */}
        <button
          type="button"
          onClick={handleGenerate}
          disabled={loading || !clientId}
          className={[
            "w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold text-white transition-colors",
            loading || !clientId
              ? "bg-violet-300 cursor-not-allowed"
              : "bg-violet-600 hover:bg-violet-700 active:bg-violet-800",
          ].join(" ")}
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Gerando {count} variantes com IA...
            </>
          ) : (
            <>
              <Zap className="w-4 h-4" />
              Gerar {count} Variantes
            </>
          )}
        </button>

        {loading && (
          <p className="text-xs text-slate-400 text-center mt-2">
            Isso pode levar até 60s — estratégia + {count} copies em paralelo
          </p>
        )}
      </div>

      {/* Results */}
      {result && (
        <div>
          {/* Strategy summary */}
          <div className="flex items-start gap-3 bg-violet-50 border border-violet-200 rounded-xl px-4 py-3 mb-6">
            <Sparkles className="w-4 h-4 text-violet-600 flex-none mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-violet-900">{result.strategy_tema}</p>
              <p className="text-xs text-violet-600 mt-0.5">{result.strategy_obj}</p>
            </div>
            <span className="ml-auto text-xs text-violet-500 font-medium whitespace-nowrap">
              {result.total} variante{result.total !== 1 ? "s" : ""}
            </span>
          </div>

          {/* Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
            {result.variants.map((variant, i) => (
              <VariantCard
                key={variant.post_id}
                variant={variant}
                index={i}
                clientId={clientId}
              />
            ))}
          </div>

          {selectedClient && (
            <p className="text-xs text-slate-400 text-center mt-6">
              {result.total} posts salvos em Firestore para {selectedClient.name} — acesse em Posts Gerados
            </p>
          )}
        </div>
      )}
    </div>
  );
}
