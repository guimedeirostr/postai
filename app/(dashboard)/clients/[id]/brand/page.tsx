"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Save, Plus, X, Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { BrandKit } from "@/types";

const GOOGLE_FONTS = [
  "Inter", "Roboto", "Open Sans", "Lato", "Montserrat", "Raleway", "Poppins",
  "Playfair Display", "Merriweather", "Lora", "Cormorant Garamond", "EB Garamond",
  "DM Serif Display", "Fraunces", "Libre Baskerville", "Source Serif 4",
  "Oswald", "Bebas Neue", "Anton", "Barlow", "Nunito", "Quicksand",
];

function ColorSwatch({ color, onChange }: { color: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <div
        className="w-9 h-9 rounded-lg border border-slate-200 cursor-pointer shadow-sm overflow-hidden"
        style={{ backgroundColor: color }}
        onClick={() => document.getElementById(`picker-${color}`)?.click()}
      />
      <input
        id={`picker-${color}`}
        type="color"
        value={color}
        onChange={e => onChange(e.target.value)}
        className="sr-only"
      />
      <input
        type="text"
        value={color}
        onChange={e => onChange(e.target.value)}
        className="w-24 text-xs border border-slate-200 rounded-lg px-2 py-1.5 font-mono text-slate-700"
        maxLength={7}
      />
    </div>
  );
}

function TagList({ items, onAdd, onRemove, placeholder }: {
  items: string[]; placeholder: string;
  onAdd: (v: string) => void; onRemove: (v: string) => void;
}) {
  const [draft, setDraft] = useState("");
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {items.map(item => (
          <span key={item} className="inline-flex items-center gap-1 text-xs bg-violet-100 text-violet-700 rounded-full px-2.5 py-1">
            {item}
            <button onClick={() => onRemove(item)}><X className="w-3 h-3" /></button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={draft} onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && draft.trim()) { onAdd(draft.trim()); setDraft(""); } }}
          placeholder={placeholder}
          className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-violet-400"
        />
        <Button size="sm" variant="outline" onClick={() => { if (draft.trim()) { onAdd(draft.trim()); setDraft(""); } }}>
          <Plus className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}

export default function BrandKitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: clientId } = React.use(params);

  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [saved,    setSaved]    = useState(false);
  const [toast,    setToast]    = useState<string | null>(null);

  const [kit, setKit] = useState<BrandKit>({
    tone: "",
    palette: { primary: "#1A1A2E", secondary: "#E8D5C4", accents: ["#C9A96E"] },
    typography: { headline: "Playfair Display", body: "Inter", weights: [300, 400, 700] },
    logoUrl: undefined,
    voiceGuidelines: "",
    dosAndDonts: { dos: [], donts: [] },
    updatedAt: null as unknown as BrandKit["updatedAt"],
  });

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 3000); }

  useEffect(() => {
    fetch(`/api/clients/${clientId}/brand-kit`)
      .then(r => r.json())
      .then(d => { if (d.brandKit) setKit(d.brandKit); })
      .finally(() => setLoading(false));
  }, [clientId]);

  async function handleSave() {
    setSaving(true);
    const res = await fetch(`/api/clients/${clientId}/brand-kit`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(kit),
    });
    setSaving(false);
    if (res.ok) { setSaved(true); showToast("Brand Kit salvo!"); setTimeout(() => setSaved(false), 2000); }
    else showToast("Erro ao salvar.");
  }

  function setPalette(key: "primary" | "secondary", val: string) {
    setKit(k => ({ ...k, palette: { ...k.palette, [key]: val } }));
  }
  function addAccent(v: string) {
    setKit(k => ({ ...k, palette: { ...k.palette, accents: [...k.palette.accents, v] } }));
  }
  function removeAccent(v: string) {
    setKit(k => ({ ...k, palette: { ...k.palette, accents: k.palette.accents.filter(a => a !== v) } }));
  }
  function addDo(v: string)    { setKit(k => ({ ...k, dosAndDonts: { dos: [...(k.dosAndDonts?.dos ?? []), v], donts: k.dosAndDonts?.donts ?? [] } })); }
  function removeDo(v: string) { setKit(k => ({ ...k, dosAndDonts: { dos: (k.dosAndDonts?.dos ?? []).filter(x => x !== v), donts: k.dosAndDonts?.donts ?? [] } })); }
  function addDont(v: string)    { setKit(k => ({ ...k, dosAndDonts: { donts: [...(k.dosAndDonts?.donts ?? []), v], dos: k.dosAndDonts?.dos ?? [] } })); }
  function removeDont(v: string) { setKit(k => ({ ...k, dosAndDonts: { donts: (k.dosAndDonts?.donts ?? []).filter(x => x !== v), dos: k.dosAndDonts?.dos ?? [] } })); }

  if (loading) return <div className="flex justify-center py-32"><Loader2 className="w-5 h-5 animate-spin text-violet-400" /></div>;

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <Link href="/clients" className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-violet-600 mb-6 transition-colors">
        <ArrowLeft className="w-3.5 h-3.5" /> Clientes
      </Link>

      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Palette className="w-6 h-6 text-violet-500" /> Brand Kit
          </h1>
          <p className="text-slate-500 mt-1">Identidade visual e diretrizes de comunicação do cliente</p>
        </div>
        <Button onClick={handleSave} disabled={saving} className="bg-violet-600 hover:bg-violet-700 text-white gap-2">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saved ? "Salvo!" : "Salvar"}
        </Button>
      </div>

      <div className="space-y-8">
        {/* Tom de Voz */}
        <section className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm space-y-3">
          <h2 className="font-semibold text-slate-900">Tom de Voz</h2>
          <textarea
            value={kit.tone}
            onChange={e => setKit(k => ({ ...k, tone: e.target.value }))}
            placeholder='Ex: "autoridade médica editorial — sofisticado, empático, transformador"'
            rows={3}
            className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-violet-400"
          />
          <h3 className="font-medium text-slate-700 text-sm mt-4">Diretrizes de Voz</h3>
          <textarea
            value={kit.voiceGuidelines ?? ""}
            onChange={e => setKit(k => ({ ...k, voiceGuidelines: e.target.value }))}
            placeholder="Explique detalhadamente como a marca se comunica..."
            rows={4}
            className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-violet-400"
          />
        </section>

        {/* Paleta */}
        <section className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm space-y-4">
          <h2 className="font-semibold text-slate-900">Paleta de Cores</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Primária</label>
              <ColorSwatch color={kit.palette.primary} onChange={v => setPalette("primary", v)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Secundária</label>
              <ColorSwatch color={kit.palette.secondary} onChange={v => setPalette("secondary", v)} />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Acentos</label>
            <div className="flex flex-wrap gap-2">
              {kit.palette.accents.map((c, i) => (
                <div key={i} className="flex items-center gap-1">
                  <ColorSwatch color={c} onChange={v => {
                    const accents = [...kit.palette.accents];
                    accents[i] = v;
                    setKit(k => ({ ...k, palette: { ...k.palette, accents } }));
                  }} />
                  <button onClick={() => removeAccent(c)} className="text-slate-300 hover:text-red-400">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              <button
                onClick={() => addAccent("#888888")}
                className="flex items-center gap-1 text-xs text-violet-600 hover:text-violet-700 px-2 py-1.5 rounded-lg border border-dashed border-violet-200 hover:border-violet-400"
              >
                <Plus className="w-3.5 h-3.5" /> Adicionar
              </button>
            </div>
          </div>
        </section>

        {/* Tipografia */}
        <section className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm space-y-4">
          <h2 className="font-semibold text-slate-900">Tipografia</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Headline</label>
              <select
                value={kit.typography.headline}
                onChange={e => setKit(k => ({ ...k, typography: { ...k.typography, headline: e.target.value } }))}
                className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-400"
              >
                {GOOGLE_FONTS.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
              <p className="text-slate-800 mt-1" style={{ fontFamily: kit.typography.headline, fontSize: 18 }}>Exemplo de Título</p>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Corpo</label>
              <select
                value={kit.typography.body}
                onChange={e => setKit(k => ({ ...k, typography: { ...k.typography, body: e.target.value } }))}
                className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-400"
              >
                {GOOGLE_FONTS.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
              <p className="text-slate-600 text-sm mt-1" style={{ fontFamily: kit.typography.body }}>Exemplo de texto corpo</p>
            </div>
          </div>
        </section>

        {/* Do's & Don'ts */}
        <section className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm space-y-5">
          <h2 className="font-semibold text-slate-900">Do&apos;s &amp; Don&apos;ts</h2>
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-green-700 flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-green-100 text-green-600 flex items-center justify-center text-xs">✓</span>
                Fazer
              </h3>
              <TagList
                items={kit.dosAndDonts?.dos ?? []}
                onAdd={addDo} onRemove={removeDo}
                placeholder="Ex: Antes e depois..."
              />
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-red-700 flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-xs">✕</span>
                Evitar
              </h3>
              <TagList
                items={kit.dosAndDonts?.donts ?? []}
                onAdd={addDont} onRemove={removeDont}
                placeholder="Ex: Vermelho vibrante..."
              />
            </div>
          </div>
        </section>
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white text-sm px-5 py-3 rounded-xl shadow-xl">
          {toast}
        </div>
      )}
    </div>
  );
}
