"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PT_BR } from "@/lib/i18n/pt-br";
import type { BrandLock, LockScope, FormatKey, LockSlideType } from "@/types";

const SCOPES: { value: LockScope; label: string; icon: string }[] = [
  { value: "color",       label: "Cor",        icon: "🎨" },
  { value: "typography",  label: "Tipografia",  icon: "Aa" },
  { value: "composition", label: "Composição",  icon: "▦"  },
  { value: "signature",   label: "Assinatura",  icon: "✒️" },
  { value: "cta",         label: "CTA",         icon: "🎯" },
  { value: "tone",        label: "Tom",         icon: "💬" },
  { value: "forbidden",   label: "Proibido",    icon: "⚠️" },
];

const ALL_FORMATS: { value: FormatKey; label: string }[] = [
  { value: "ig_feed",            label: "Feed IG" },
  { value: "ig_carousel",        label: "Carrossel IG" },
  { value: "ig_stories",         label: "Stories IG" },
  { value: "ig_reels_cover",     label: "Reels IG" },
  { value: "li_post_square",     label: "Post Quadrado LinkedIn" },
  { value: "li_post_horizontal", label: "Post Horizontal LinkedIn" },
  { value: "li_carousel_pdf",    label: "Carrossel PDF LinkedIn" },
  { value: "li_article",         label: "Artigo LinkedIn" },
];

const ALL_SLIDE_TYPES: { value: LockSlideType; label: string }[] = [
  { value: "single",           label: "Único" },
  { value: "carousel_opener",  label: "Abertura carrossel" },
  { value: "carousel_middle",  label: "Slide intermediário" },
  { value: "carousel_cta",     label: "CTA carrossel" },
  { value: "stories",          label: "Stories" },
  { value: "reels_cover",      label: "Capa Reels" },
];

interface Props {
  initial?: Partial<BrandLock>;
  onSave:   (data: Omit<BrandLock, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'>) => Promise<void>;
  onCancel: () => void;
}

export function LockForm({ initial, onSave, onCancel }: Props) {
  const [scope,       setScope]       = useState<LockScope>(initial?.scope ?? "color");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [enforcement, setEnforcement] = useState<'hard' | 'soft'>(initial?.enforcement ?? "soft");
  const [promptHint,  setPromptHint]  = useState(initial?.promptHint ?? "");
  const [formats,     setFormats]     = useState<FormatKey[]>(initial?.appliesTo?.formats ?? []);
  const [slideTypes,  setSlideTypes]  = useState<LockSlideType[]>(initial?.appliesTo?.slideTypes ?? []);
  const [saving,      setSaving]      = useState(false);
  const [errors,      setErrors]      = useState<Record<string, string>>({});

  function validate() {
    const errs: Record<string, string> = {};
    if (description.trim().length < 3) errs.description = "Mínimo 3 caracteres";
    if (description.trim().length > 200) errs.description = "Máximo 200 caracteres";
    if (promptHint.trim().length < 10) errs.promptHint = "Mínimo 10 caracteres";
    if (promptHint.trim().length > 500) errs.promptHint = "Máximo 500 caracteres";
    return errs;
  }

  async function handleSubmit() {
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    setSaving(true);
    try {
      await onSave({
        scope,
        description: description.trim(),
        enforcement,
        promptHint: promptHint.trim(),
        appliesTo: (formats.length || slideTypes.length)
          ? { formats: formats.length ? formats : undefined, slideTypes: slideTypes.length ? slideTypes : undefined }
          : undefined,
        source: initial?.source ?? 'manual',
        active: true,
      });
    } finally {
      setSaving(false);
    }
  }

  function toggleFormat(f: FormatKey) {
    setFormats(prev => prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f]);
  }

  function toggleSlideType(s: LockSlideType) {
    setSlideTypes(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
  }

  const helpText = PT_BR.lockset.promptHintHelp[scope];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-900">
            {initial?.id ? PT_BR.lockset.editLock : PT_BR.lockset.newLock}
          </h2>
          <button onClick={onCancel} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Scope */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Escopo *</label>
            <select
              value={scope}
              onChange={e => setScope(e.target.value as LockScope)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-violet-300"
            >
              {SCOPES.map(s => (
                <option key={s.value} value={s.value}>{s.icon} {s.label}</option>
              ))}
            </select>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Descrição curta *</label>
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Ex: Azul institucional em destaques"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-300"
            />
            {errors.description && <p className="text-xs text-red-500 mt-1">{errors.description}</p>}
          </div>

          {/* Enforcement */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Enforcement</label>
            <div className="flex gap-4">
              {(['soft', 'hard'] as const).map(e => (
                <label key={e} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="enforcement"
                    value={e}
                    checked={enforcement === e}
                    onChange={() => setEnforcement(e)}
                    className="accent-violet-600"
                  />
                  <span className="text-sm text-slate-700">
                    {e === 'soft' ? 'Soft — sugestão, pode ser quebrada' : 'Hard — obrigatório, Crítico rejeita se violar'}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Prompt hint */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Prompt hint *</label>
            <textarea
              value={promptHint}
              onChange={e => setPromptHint(e.target.value)}
              rows={3}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-300 resize-none"
              placeholder={helpText}
            />
            <p className="text-xs text-slate-400 mt-1">{helpText}</p>
            {errors.promptHint && <p className="text-xs text-red-500 mt-1">{errors.promptHint}</p>}
          </div>

          {/* Applies to */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Aplica a <span className="text-slate-400 font-normal">(opcional — vazio = todos)</span>
            </label>
            <p className="text-xs font-medium text-slate-500 mb-1">Formatos:</p>
            <div className="flex flex-wrap gap-2 mb-3">
              {ALL_FORMATS.map(f => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => toggleFormat(f.value)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                    formats.includes(f.value)
                      ? "bg-violet-100 border-violet-300 text-violet-700"
                      : "bg-white border-slate-200 text-slate-600 hover:border-violet-200"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <p className="text-xs font-medium text-slate-500 mb-1">Tipos de slide:</p>
            <div className="flex flex-wrap gap-2">
              {ALL_SLIDE_TYPES.map(s => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => toggleSlideType(s.value)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                    slideTypes.includes(s.value)
                      ? "bg-violet-100 border-violet-300 text-violet-700"
                      : "bg-white border-slate-200 text-slate-600 hover:border-violet-200"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-3 justify-end px-6 pb-5">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={saving}>Cancelar</Button>
          <Button size="sm" onClick={handleSubmit} disabled={saving}
            className="bg-violet-600 hover:bg-violet-700 text-white">
            {saving ? "Salvando..." : "Salvar lock"}
          </Button>
        </div>
      </div>
    </div>
  );
}
