"use client";

import { useState } from "react";
import { MoreHorizontal, Pencil, Copy, EyeOff, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { previewLockAsPromptHint } from "@/lib/lockset/injection";
import { PT_BR } from "@/lib/i18n/pt-br";
import type { BrandLock, LockScope } from "@/types";

const SCOPE_ICON: Record<LockScope, string> = {
  typography:  "Aa",
  color:       "🎨",
  composition: "▦",
  signature:   "✒️",
  cta:         "🎯",
  tone:        "💬",
  forbidden:   "⚠️",
};

const FORMAT_LABELS: Record<string, string> = {
  ig_feed:           "Feed IG",
  ig_carousel:       "Carrossel IG",
  ig_stories:        "Stories IG",
  ig_reels_cover:    "Reels IG",
  li_post_square:    "Post LinkedIn",
  li_post_horizontal:"Post H LinkedIn",
  li_carousel_pdf:   "Carrossel PDF",
  li_article:        "Artigo LinkedIn",
};

interface Props {
  lock: BrandLock;
  onEdit:      (lock: BrandLock) => void;
  onDuplicate: (lock: BrandLock) => void;
  onToggle:    (lock: BrandLock) => void;
  onDelete:    (lock: BrandLock) => void;
}

export function LockCard({ lock, onEdit, onDuplicate, onToggle, onDelete }: Props) {
  const [menuOpen,   setMenuOpen]   = useState(false);
  const [showHint,   setShowHint]   = useState(false);

  const preview = previewLockAsPromptHint(lock);
  const scopeLabel = PT_BR.lockset.scopes[lock.scope];
  const inactive = lock.active === false;

  return (
    <div className={cn(
      "relative bg-white rounded-xl border p-4 shadow-sm transition-opacity",
      inactive ? "opacity-50 border-slate-200" : "border-slate-200 hover:border-violet-200 hover:shadow-md",
    )}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <span className="text-lg leading-none">{SCOPE_ICON[lock.scope]}</span>
          <span className="text-xs font-semibold text-slate-700">{scopeLabel}</span>
          <span className={cn(
            "text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide",
            lock.enforcement === 'hard'
              ? "bg-red-100 text-red-700"
              : "bg-slate-100 text-slate-500",
          )}>
            {lock.enforcement === 'hard' ? PT_BR.lockset.enforcementHard : PT_BR.lockset.enforcementSoft}
          </span>
        </div>

        {/* Menu */}
        <div className="relative">
          <button
            onClick={() => setMenuOpen(v => !v)}
            className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 w-44 bg-white border border-slate-200 rounded-xl shadow-xl z-20 overflow-hidden">
              <button onClick={() => { onEdit(lock); setMenuOpen(false); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-slate-50 text-slate-700">
                <Pencil className="w-3.5 h-3.5" /> Editar
              </button>
              <button onClick={() => { onDuplicate(lock); setMenuOpen(false); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-slate-50 text-slate-700">
                <Copy className="w-3.5 h-3.5" /> Duplicar
              </button>
              <button onClick={() => { onToggle(lock); setMenuOpen(false); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-slate-50 text-slate-700">
                <EyeOff className="w-3.5 h-3.5" /> {inactive ? "Ativar" : "Desativar"}
              </button>
              <div className="border-t border-slate-100 my-0.5" />
              <button onClick={() => { onDelete(lock); setMenuOpen(false); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-red-50 text-red-600">
                <Trash2 className="w-3.5 h-3.5" /> Excluir
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Description */}
      <p className="text-sm text-slate-800 mb-2">{lock.description}</p>

      {/* Prompt hint preview */}
      <button
        onClick={() => setShowHint(v => !v)}
        className="text-xs text-violet-600 hover:underline mb-2"
      >
        {showHint ? "▲ Ocultar preview" : "▼ Ver preview do prompt-hint"}
      </button>
      {showHint && (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs text-slate-600 mb-2">
          <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wide block mb-1">
            Slot: {preview.slotKey}
          </span>
          {preview.hint}
        </div>
      )}

      {/* Applies to */}
      {(lock.appliesTo?.formats?.length || lock.appliesTo?.slideTypes?.length) && (
        <p className="text-xs text-slate-400 mt-1">
          Aplica a: {lock.appliesTo?.formats?.map(f => FORMAT_LABELS[f] ?? f).join(", ")}
          {lock.appliesTo?.slideTypes?.length ? ` · ${lock.appliesTo.slideTypes.join(", ")}` : ""}
        </p>
      )}

      {/* Footer */}
      <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-100">
        <span className="text-[10px] text-slate-400">
          Origem: {lock.source === 'manual' ? 'manual' : lock.source === 'dna_visual' ? 'DNA Visual' : 'padrão aprovado'}
        </span>
        <span className="text-[10px] text-slate-300">·</span>
        <span className="text-[10px] text-slate-400">
          {new Date(lock.createdAt).toLocaleDateString('pt-BR')}
        </span>
      </div>
    </div>
  );
}
