"use client";

import React, { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft, Loader2, Plus, Trash2, Save,
  Brain, BarChart2, AlertTriangle, Upload, X,
  Image as ImageIcon, ChevronDown, ChevronUp,
  Heart, Bookmark, Eye,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ClientMemory, PostExample, PostSlide, PromptSlotKey } from "@/types";

// ── Constants ─────────────────────────────────────────────────────────────────

const SLOT_LABELS: Partial<Record<PromptSlotKey, string>> = {
  FORMATO:            "Formato",
  ESTETICA_MAE:       "Estética Mãe",
  REF_ESTILO:         "Ref. Estilo",
  IMAGEM_PRINCIPAL:   "Imagem Principal",
  ATMOSFERA:          "Atmosfera",
  COMPOSICAO:         "Composição",
  PALETA:             "Paleta",
  HIERARQUIA_TIPO:    "Hierarquia Tipo",
  TEXTO_LITERAL:      "Texto Literal",
  ELEMENTOS_GRAFICOS: "Elementos Gráficos",
  ACABAMENTO:         "Acabamento",
};

const PILAR_OPTIONS = [
  { value: "educacao",       label: "Educação" },
  { value: "produto",        label: "Produto/Serviço" },
  { value: "bastidores",     label: "Bastidores" },
  { value: "inspiracao",     label: "Inspiração" },
  { value: "prova_social",   label: "Prova Social" },
  { value: "promocao",       label: "Promoção/Oferta" },
  { value: "entretenimento", label: "Entretenimento" },
];

const HOOK_OPTIONS = [
  { value: "pergunta",    label: "Pergunta" },
  { value: "estatistica", label: "Estatística" },
  { value: "dor",         label: "Dor/Problema" },
  { value: "desejo",      label: "Desejo/Aspiração" },
  { value: "curiosidade", label: "Curiosidade" },
  { value: "polemica",    label: "Polêmica" },
  { value: "afirmacao",   label: "Afirmação Forte" },
];

const FORMAT_LABELS: Record<string, string> = {
  feed:      "Feed",
  carousel:  "Carrossel",
  story:     "Story",
  reels:     "Reels",
};

const FORMAT_COLORS: Record<string, string> = {
  feed:     "bg-blue-100 text-blue-700",
  carousel: "bg-purple-100 text-purple-700",
  story:    "bg-pink-100 text-pink-700",
  reels:    "bg-orange-100 text-orange-700",
};

type TabType = "feed" | "carousel" | "story";

// ── Import Modal ───────────────────────────────────────────────────────────────

interface ImportPostModalProps {
  clientId: string;
  onClose:  () => void;
  onImported: (example: PostExample) => void;
}

function ImportPostModal({ clientId, onClose, onImported }: ImportPostModalProps) {
  const [tab,            setTab]            = useState<TabType>("feed");
  const [imageFile,      setImageFile]      = useState<File | null>(null);
  const [imagePreview,   setImagePreview]   = useState<string | null>(null);
  const [headline,       setHeadline]       = useState("");
  const [caption,        setCaption]        = useState("");
  const [hashtags,       setHashtags]       = useState("");
  const [pilar,          setPilar]          = useState("");
  const [hookType,       setHookType]       = useState("");
  const [objetivo,       setObjetivo]       = useState("");
  const [publishedAt,    setPublishedAt]    = useState("");
  const [engOpen,        setEngOpen]        = useState(false);
  const [likes,          setLikes]          = useState("");
  const [comments,       setComments]       = useState("");
  const [saves,          setSaves]          = useState("");
  const [reach,          setReach]          = useState("");
  const [slides,         setSlides]         = useState<PostSlide[]>([
    { role: "hook", headline: "", body: "" },
  ]);
  const [loading,        setLoading]        = useState(false);
  const [error,          setError]          = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleImageChange(file: File) {
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = e => setImagePreview(e.target?.result as string);
    reader.readAsDataURL(file);
  }

  function addSlide() {
    if (slides.length >= 15) return;
    setSlides(prev => [...prev, { role: "content", headline: "", body: "" }]);
  }

  function removeSlide(idx: number) {
    setSlides(prev => prev.filter((_, i) => i !== idx));
  }

  function updateSlide(idx: number, field: keyof PostSlide, value: string) {
    setSlides(prev => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!caption.trim()) { setError("Caption é obrigatório."); return; }
    setError(null);
    setLoading(true);

    try {
      const fd = new FormData();
      fd.append("format",  tab === "carousel" ? "carousel" : tab === "story" ? "story" : "feed");
      fd.append("caption", caption.trim());
      if (headline.trim())    fd.append("headline",    headline.trim());
      if (pilar)               fd.append("pilar",       pilar);
      if (hookType)            fd.append("hook_type",   hookType);
      if (objetivo.trim())    fd.append("objetivo",    objetivo.trim());
      if (publishedAt)        fd.append("publishedAt", publishedAt);

      if (hashtags.trim()) {
        const tags = hashtags.split(",").map(t => t.trim()).filter(Boolean);
        fd.append("hashtags", JSON.stringify(tags));
      }

      if (tab === "carousel" && slides.length > 0) {
        const validSlides = slides.filter(s => s.headline.trim() || s.body.trim());
        if (validSlides.length > 0) fd.append("slides", JSON.stringify(validSlides));
      }

      const eng: Record<string, number> = {};
      if (likes)    eng.likes    = Number(likes);
      if (comments) eng.comments = Number(comments);
      if (saves)    eng.saves    = Number(saves);
      if (reach)    eng.reach    = Number(reach);
      if (Object.keys(eng).length > 0) fd.append("engagement", JSON.stringify(eng));

      if (imageFile) fd.append("image", imageFile);

      const res  = await fetch(`/api/clients/${clientId}/memory/import`, { method: "POST", body: fd });
      const data = await res.json() as { ok?: boolean; example?: PostExample; error?: string };

      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Erro ao importar");
      }

      if (data.example) onImported(data.example);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao importar post");
    } finally {
      setLoading(false);
    }
  }

  const inputCls = "w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white";
  const labelCls = "block text-xs font-medium text-slate-600 mb-1";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-900">Importar Post Existente</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1">
          <form onSubmit={handleSubmit} className="p-6 space-y-5">
            {/* Tab selector */}
            <div className="flex gap-2 p-1 bg-slate-100 rounded-xl">
              {([["feed", "📸 Feed"], ["carousel", "🎠 Carrossel"], ["story", "📱 Story/Reels"]] as [TabType, string][]).map(([t, label]) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${tab === t ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Image drop zone */}
            <div>
              <label className={labelCls}>Imagem do Post (opcional)</label>
              <div
                className={`relative border-2 border-dashed rounded-xl cursor-pointer transition-colors ${imagePreview ? "border-violet-300 bg-violet-50" : "border-slate-200 hover:border-violet-300 bg-slate-50"}`}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => e.target.files?.[0] && handleImageChange(e.target.files[0])}
                />
                {imagePreview ? (
                  <div className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={imagePreview} alt="Preview" className="w-full max-h-48 object-contain rounded-xl" />
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); setImageFile(null); setImagePreview(null); }}
                      className="absolute top-2 right-2 w-6 h-6 bg-white rounded-full shadow flex items-center justify-center text-slate-600 hover:text-red-500"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 py-8 text-slate-400">
                    <Upload className="w-6 h-6" />
                    <p className="text-sm">Clique para selecionar imagem</p>
                    <p className="text-xs text-slate-300">Claude Vision analisará o design automaticamente</p>
                  </div>
                )}
              </div>
            </div>

            {/* Caption (all tabs) */}
            <div>
              <label className={labelCls}>Caption <span className="text-red-400">*</span></label>
              <textarea
                value={caption}
                onChange={e => setCaption(e.target.value)}
                placeholder={tab === "story" ? "Contexto do story/reels..." : "Texto da legenda do post..."}
                rows={4}
                className={inputCls + " resize-none"}
                required
              />
            </div>

            {/* Feed + Story headline */}
            {tab !== "carousel" && (
              <div>
                <label className={labelCls}>Headline{tab === "story" ? " (opcional)" : " (opcional)"}</label>
                <input type="text" value={headline} onChange={e => setHeadline(e.target.value)} placeholder="Título ou chamada principal" className={inputCls} />
              </div>
            )}

            {/* Carousel slides */}
            {tab === "carousel" && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className={labelCls + " mb-0"}>Slides ({slides.length}/15)</label>
                  {slides.length < 15 && (
                    <button type="button" onClick={addSlide} className="text-xs text-violet-600 hover:text-violet-800 font-medium flex items-center gap-1">
                      <Plus className="w-3 h-3" /> Adicionar slide
                    </button>
                  )}
                </div>
                <div className="space-y-3">
                  {slides.map((slide, idx) => (
                    <div key={idx} className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-slate-500">Slide {idx + 1}</span>
                        <div className="flex items-center gap-2">
                          <select
                            value={slide.role}
                            onChange={e => updateSlide(idx, "role", e.target.value)}
                            className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white"
                          >
                            <option value="hook">Hook</option>
                            <option value="content">Conteúdo</option>
                            <option value="cta">CTA</option>
                          </select>
                          {slides.length > 1 && (
                            <button type="button" onClick={() => removeSlide(idx)} className="text-slate-300 hover:text-red-500 transition-colors">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                      <input
                        type="text"
                        value={slide.headline}
                        onChange={e => updateSlide(idx, "headline", e.target.value)}
                        placeholder="Headline do slide"
                        className={inputCls}
                      />
                      <textarea
                        value={slide.body}
                        onChange={e => updateSlide(idx, "body", e.target.value)}
                        placeholder="Corpo do slide"
                        rows={2}
                        className={inputCls + " resize-none"}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Hashtags */}
            <div>
              <label className={labelCls}>Hashtags (separadas por vírgula, opcional)</label>
              <input type="text" value={hashtags} onChange={e => setHashtags(e.target.value)} placeholder="#marketing, #marca, ..." className={inputCls} />
            </div>

            {/* Pilar + Hook */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Pilar</label>
                <select value={pilar} onChange={e => setPilar(e.target.value)} className={inputCls}>
                  <option value="">Selecionar...</option>
                  {PILAR_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Tipo de Hook</label>
                <select value={hookType} onChange={e => setHookType(e.target.value)} className={inputCls}>
                  <option value="">Selecionar...</option>
                  {HOOK_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>

            {/* Objetivo */}
            <div>
              <label className={labelCls}>Objetivo (opcional)</label>
              <textarea value={objetivo} onChange={e => setObjetivo(e.target.value)} placeholder="Ex: gerar leads, educação de mercado..." rows={2} className={inputCls + " resize-none"} />
            </div>

            {/* Engajamento collapsible */}
            <div>
              <button
                type="button"
                onClick={() => setEngOpen(v => !v)}
                className="flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-800 transition-colors"
              >
                {engOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                Dados de Engajamento (opcional)
              </button>
              {engOpen && (
                <div className="grid grid-cols-2 gap-3 mt-3">
                  {[
                    { label: "Curtidas",     val: likes,    set: setLikes },
                    { label: "Comentários",  val: comments, set: setComments },
                    { label: "Salvamentos",  val: saves,    set: setSaves },
                    { label: "Alcance",      val: reach,    set: setReach },
                  ].map(({ label, val, set }) => (
                    <div key={label}>
                      <label className={labelCls}>{label}</label>
                      <input type="number" min="0" value={val} onChange={e => set(e.target.value)} placeholder="0" className={inputCls} />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Published date */}
            <div>
              <label className={labelCls}>Data de Publicação (opcional)</label>
              <input type="date" value={publishedAt} onChange={e => setPublishedAt(e.target.value)} className={inputCls} />
            </div>

            {error && <p className="text-sm text-red-500 bg-red-50 rounded-xl px-3 py-2">{error}</p>}
          </form>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={onClose} disabled={loading}>Cancelar</Button>
          <Button
            type="button"
            disabled={loading || !caption.trim()}
            onClick={e => { const form = (e.target as HTMLElement).closest("form") ?? document.querySelector("form"); if (form) form.requestSubmit(); else handleSubmit({ preventDefault: () => {} } as React.FormEvent); }}
            className="bg-violet-600 hover:bg-violet-700 text-white"
          >
            {loading ? (
              <><Loader2 className="w-4 h-4 animate-spin mr-2" />Analisando com IA...</>
            ) : (
              "Importar e Analisar Design"
            )}
          </Button>
        </div>

        {/* Workaround submit */}
        <form id="import-form" onSubmit={handleSubmit} className="hidden" />
      </div>
    </div>
  );
}

// ── Example Card ───────────────────────────────────────────────────────────────

function ExampleCard({ example, onDelete }: { example: PostExample; onDelete: () => void }) {
  const pilarLabel = PILAR_OPTIONS.find(p => p.value === example.pilar)?.label;

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden flex flex-col">
      {/* Image */}
      {example.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={example.imageUrl} alt="" className="w-full h-40 object-cover" />
      ) : (
        <div className="w-full h-28 bg-slate-50 flex items-center justify-center">
          <ImageIcon className="w-8 h-8 text-slate-200" />
        </div>
      )}

      <div className="p-4 flex-1 flex flex-col gap-2">
        {/* Badges row */}
        <div className="flex flex-wrap gap-1.5 items-center">
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${FORMAT_COLORS[example.format] ?? "bg-slate-100 text-slate-600"}`}>
            {FORMAT_LABELS[example.format] ?? example.format}
          </span>
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${example.source === "canvas" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"}`}>
            {example.source === "canvas" ? "Canvas" : "Import"}
          </span>
          {pilarLabel && (
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-violet-100 text-violet-700">
              {pilarLabel}
            </span>
          )}
        </div>

        {/* Caption */}
        <p className="text-sm text-slate-700 leading-relaxed line-clamp-2 flex-1">
          {example.caption}
        </p>

        {/* Visual design tags */}
        {example.visualDesign && (
          <div className="flex flex-wrap gap-1">
            <span className="text-[10px] bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full border border-amber-100 truncate max-w-[140px]" title={example.visualDesign.palette}>
              {example.visualDesign.palette}
            </span>
            <span className="text-[10px] bg-slate-50 text-slate-600 px-2 py-0.5 rounded-full border border-slate-100 truncate max-w-[120px]" title={example.visualDesign.mood}>
              {example.visualDesign.mood}
            </span>
          </div>
        )}

        {/* Engagement */}
        {example.engagement && (
          <div className="flex items-center gap-3 text-xs text-slate-400">
            {example.engagement.likes != null && (
              <span className="flex items-center gap-1"><Heart className="w-3 h-3" />{example.engagement.likes.toLocaleString("pt-BR")}</span>
            )}
            {example.engagement.saves != null && (
              <span className="flex items-center gap-1"><Bookmark className="w-3 h-3" />{example.engagement.saves.toLocaleString("pt-BR")}</span>
            )}
            {example.engagement.reach != null && (
              <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{example.engagement.reach.toLocaleString("pt-BR")}</span>
            )}
          </div>
        )}

        {/* Delete */}
        <div className="flex justify-end pt-1">
          <button onClick={onDelete} className="text-slate-300 hover:text-red-500 transition-colors">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function MemoryPage() {
  const params   = useParams();
  const clientId = params.id as string;

  const [memory,      setMemory]      = useState<ClientMemory | null>(null);
  const [clientName,  setClientName]  = useState("");
  const [loading,     setLoading]     = useState(true);
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [newTone,     setNewTone]     = useState("");
  const [toneList,    setToneList]    = useState<string[]>([]);
  const [toneOpen,    setToneOpen]    = useState(false);
  const [showImport,  setShowImport]  = useState(false);
  const [examples,    setExamples]    = useState<PostExample[]>([]);

  useEffect(() => {
    fetch(`/api/clients/${clientId}/memory`)
      .then(r => r.json())
      .then((d: { error?: string; memory?: ClientMemory; clientName?: string }) => {
        if (d.error) { setError(d.error); return; }
        setMemory(d.memory ?? null);
        setClientName(d.clientName ?? "");
        setToneList(d.memory?.toneExamples ?? []);
        setExamples(d.memory?.examples ?? []);
      })
      .catch(() => setError("Erro ao carregar memória"))
      .finally(() => setLoading(false));
  }, [clientId]);

  async function saveTones() {
    setSaving(true);
    try {
      await fetch(`/api/clients/${clientId}/memory`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ toneExamples: toneList }),
      });
    } catch { /* non-fatal */ }
    finally { setSaving(false); }
  }

  function addTone() {
    const t = newTone.trim();
    if (!t) return;
    setToneList(prev => [...prev, t]);
    setNewTone("");
  }

  function handleImported(example: PostExample) {
    setExamples(prev => [...prev, example]);
    setMemory(prev => prev ? {
      ...prev,
      stats: { ...prev.stats, imported: (prev.stats?.imported ?? 0) + 1 },
    } : prev);
  }

  async function deleteExample(id: string) {
    const updated = examples.filter(e => e.id !== id);
    setExamples(updated);
    // Persist deletion
    try {
      await fetch(`/api/clients/${clientId}/memory`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ examples: updated }),
      });
    } catch { /* non-fatal */ }
  }

  const slotWeights = memory?.slotWeights as Record<PromptSlotKey, { approvals: number; rejections: number; total: number }> | undefined;

  if (loading) return (
    <div className="flex justify-center items-center py-32">
      <Loader2 className="w-6 h-6 animate-spin text-violet-400" />
    </div>
  );

  const stats = memory?.stats;

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <Link
        href={`/clients/${clientId}/brand`}
        className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-violet-600 mb-6 transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Brand Kit
      </Link>

      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center">
            <Brain className="w-5 h-5 text-violet-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Memória do Cliente</h1>
            <p className="text-sm text-slate-400">{clientName} · Aprendizado contínuo por aprovações e importações</p>
          </div>
        </div>
        <Button
          onClick={() => setShowImport(true)}
          className="bg-violet-600 hover:bg-violet-700 text-white flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> Importar Post
        </Button>
      </div>

      {error && <p className="text-red-500 text-sm mb-6">{error}</p>}

      {/* Stats bar — always visible once memory loads or we have data */}
      {(memory || examples.length > 0) && (
        <div className="grid grid-cols-4 gap-4 mb-8">
          {[
            {
              label: "Aprovados",
              value: stats?.approved ?? 0,
              color: "text-green-600",
              bg:    "bg-green-50",
            },
            {
              label: "Importados",
              value: stats?.imported ?? 0,
              color: "text-blue-600",
              bg:    "bg-blue-50",
            },
            {
              label: "Rejeitados",
              value: stats?.rejected ?? 0,
              color: "text-red-600",
              bg:    "bg-red-50",
            },
            {
              label: "Score Médio",
              value: (stats?.avgCriticScore ?? 0).toFixed(1),
              color: "text-violet-600",
              bg:    "bg-violet-50",
            },
          ].map(({ label, value, color, bg }) => (
            <div key={label} className={`rounded-xl ${bg} p-4`}>
              <p className="text-xs text-slate-500 mb-1">{label}</p>
              <p className={`text-2xl font-bold ${color}`}>{value}</p>
            </div>
          ))}
        </div>
      )}

      {!memory && !error && examples.length === 0 && (
        <div className="text-center py-20 text-slate-400">
          <Brain className="w-8 h-8 mx-auto mb-3 text-slate-300" />
          <p className="text-sm">Ainda sem memória. Aprove posts no Canvas ou importe posts para começar.</p>
        </div>
      )}

      {/* Examples Gallery */}
      {examples.length > 0 && (
        <div className="mb-8">
          <h2 className="font-semibold text-slate-800 flex items-center gap-2 mb-4">
            <ImageIcon className="w-4 h-4 text-blue-400" /> Biblioteca de Exemplos
            <span className="text-xs font-normal text-slate-400">({examples.length})</span>
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {examples.map(ex => (
              <ExampleCard
                key={ex.id}
                example={ex}
                onDelete={() => deleteExample(ex.id)}
              />
            ))}
          </div>
        </div>
      )}

      {memory && (
        <div className="space-y-8">
          {/* Tom de Voz (collapsible, less prominent) */}
          <div>
            <button
              onClick={() => setToneOpen(v => !v)}
              className="w-full flex items-center justify-between mb-1 group"
            >
              <h2 className="font-semibold text-slate-800 flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-violet-400" />
                Exemplos de Tom de Voz
                <span className="text-xs font-normal text-slate-400">({toneList.length})</span>
              </h2>
              {toneOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
            </button>

            {toneOpen && (
              <div className="mt-3">
                <div className="flex justify-end mb-2">
                  <Button size="sm" variant="outline" onClick={saveTones} disabled={saving} className="text-xs">
                    {saving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Save className="w-3 h-3 mr-1" />}
                    Salvar
                  </Button>
                </div>
                <div className="space-y-2 mb-3">
                  {toneList.map((ex, idx) => (
                    <div key={idx} className="flex items-start gap-2 p-3 bg-slate-50 rounded-xl">
                      <p className="flex-1 text-sm text-slate-700 leading-relaxed">{ex}</p>
                      <button
                        onClick={() => setToneList(prev => prev.filter((_, i) => i !== idx))}
                        className="text-slate-300 hover:text-red-500 transition-colors mt-0.5"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newTone}
                    onChange={e => setNewTone(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && addTone()}
                    placeholder="Adicionar exemplo de tom de voz…"
                    className="flex-1 text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-400"
                  />
                  <Button size="sm" onClick={addTone} variant="outline">
                    <Plus className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Padrões Rejeitados */}
          {(memory.rejectedPatterns?.length ?? 0) > 0 && (
            <div>
              <h2 className="font-semibold text-slate-800 flex items-center gap-2 mb-3">
                <AlertTriangle className="w-4 h-4 text-red-400" /> Padrões Rejeitados
              </h2>
              <div className="space-y-2">
                {memory.rejectedPatterns?.map((rp, idx) => (
                  <div key={idx} className="p-3 bg-red-50 border border-red-100 rounded-xl">
                    <p className="text-sm font-medium text-red-700">{rp.pattern}</p>
                    {rp.reason && <p className="text-xs text-red-500 mt-0.5">{rp.reason}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Slot Weights ML */}
          {slotWeights && Object.keys(slotWeights).length > 0 && (
            <div>
              <h2 className="font-semibold text-slate-800 flex items-center gap-2 mb-3">
                <Brain className="w-4 h-4 text-violet-400" /> Pesos dos Slots (Modelo A)
              </h2>
              <div className="rounded-xl overflow-hidden border border-slate-100">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500">Slot</th>
                      <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500">Aprova.</th>
                      <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500">Rejeit.</th>
                      <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500">Peso</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(Object.entries(slotWeights) as [PromptSlotKey, { approvals: number; rejections: number; total: number }][])
                      .sort(([, a], [, b]) => b.total - a.total)
                      .map(([key, entry]) => {
                        const weight = entry.total >= 5 ? (entry.approvals - entry.rejections) / entry.total : null;
                        return (
                          <tr key={key} className="border-t border-slate-50">
                            <td className="px-4 py-2 font-mono text-xs text-slate-600">{SLOT_LABELS[key] ?? key}</td>
                            <td className="px-4 py-2 text-green-700 text-xs">{entry.approvals}</td>
                            <td className="px-4 py-2 text-red-600 text-xs">{entry.rejections}</td>
                            <td className="px-4 py-2">
                              {weight != null ? (
                                <Badge className={`text-[10px] border-0 ${weight > 0 ? "bg-green-100 text-green-700" : weight < 0 ? "bg-red-100 text-red-600" : "bg-slate-100 text-slate-600"}`}>
                                  {weight > 0 ? "+" : ""}{(weight * 100).toFixed(0)}%
                                </Badge>
                              ) : (
                                <span className="text-xs text-slate-300">— poucos dados</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Import Modal */}
      {showImport && (
        <ImportPostModal
          clientId={clientId}
          onClose={() => setShowImport(false)}
          onImported={handleImported}
        />
      )}
    </div>
  );
}
