"use client";

import React, { useEffect } from "react";
import { X, AlertTriangle } from "lucide-react";
import { compilerStrings } from "@/lib/i18n/pt-br";
import { SLOT_ORDER } from "@/types";
import type { CompileOutput, PromptSlot, SlotKey } from "@/types";

const SLOT_ICONS: Record<SlotKey, string> = {
  BRAND_IDENTITY:     "🏷️",
  TONE_AND_VOICE:     "🗣️",
  PALETA:             "🎨",
  TIPOGRAFIA:         "🔤",
  LOGO:               "🔰",
  PRODUTO:            "📦",
  PESSOA:             "👤",
  FUNDO:              "🖼️",
  BRIEFING:           "📋",
  RESTRICOES_DURAS:   "🔒",
  CONTEXTO_CARROSSEL: "🎠",
};

function resolveSourceLabel(slot: PromptSlot): string {
  if (slot.skipped) return compilerStrings.sourceLabels.missing;
  if (slot.sources.length === 0) return compilerStrings.sourceLabels.default;
  const first = slot.sources[0];
  if (first.kind === "lock") return compilerStrings.sourceLabels.lockset;
  if (first.kind === "asset") return compilerStrings.sourceLabels["asset-preferred"];
  if (first.kind === "dna") return compilerStrings.sourceLabels["brand-hint"];
  if (first.kind === "brief") return compilerStrings.sourceLabels.briefing;
  return compilerStrings.sourceLabels.default;
}

const SOURCE_BADGE_COLORS: Record<string, string> = {
  [compilerStrings.sourceLabels.lockset]:           "bg-emerald-100 text-emerald-700",
  [compilerStrings.sourceLabels["asset-preferred"]]: "bg-blue-100 text-blue-700",
  [compilerStrings.sourceLabels["brand-hint"]]:     "bg-slate-100 text-slate-600",
  [compilerStrings.sourceLabels.briefing]:          "bg-violet-100 text-violet-700",
  [compilerStrings.sourceLabels.default]:           "bg-amber-100 text-amber-700",
  [compilerStrings.sourceLabels.missing]:           "bg-red-100 text-red-700",
};

interface SlotsDrawerProps {
  open: boolean;
  output: CompileOutput;
  compiledAt?: string;
  onClose: () => void;
}

export function SlotsDrawer({ open, output, compiledAt, onClose }: SlotsDrawerProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  const slotsByKey = Object.fromEntries(output.slots.map(s => [s.key, s]));
  const warningsByKey: Record<string, string[]> = {};
  for (const w of output.warnings) {
    if (w.slot) {
      if (!warningsByKey[w.slot]) warningsByKey[w.slot] = [];
      warningsByKey[w.slot].push(w.message);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-[480px] h-full bg-white shadow-2xl border-l border-slate-200 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-800">{compilerStrings.slotsDrawerTitle}</span>
            <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
              {compilerStrings.slotsCounter(output.trace.slotsRendered, SLOT_ORDER.length)}
            </span>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100 transition-colors">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        {/* Slot cards */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {SLOT_ORDER.map((key) => {
            const slot = slotsByKey[key] as PromptSlot | undefined;
            if (!slot) return null;
            const label = resolveSourceLabel(slot);
            const badgeClass = SOURCE_BADGE_COLORS[label] ?? "bg-slate-100 text-slate-600";
            const warnings = warningsByKey[key] ?? [];

            return (
              <div key={key} className={`rounded-lg border p-3 ${slot.skipped ? "border-red-100 bg-red-50/40" : "border-slate-200 bg-slate-50/60"}`}>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="flex items-center gap-1.5 text-sm font-medium text-slate-800">
                    <span>{SLOT_ICONS[key]}</span>
                    {compilerStrings.slotNames[key]}
                  </span>
                  <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${badgeClass}`}>
                    {slot.skipped ? compilerStrings.sourceLabels.missing : label}
                  </span>
                </div>

                {slot.skipped ? (
                  <p className="text-xs text-red-500 italic">{slot.skipReason ?? "omitido"}</p>
                ) : (
                  <p className="text-xs text-slate-600 line-clamp-3 whitespace-pre-wrap">
                    {slot.rendered.length > 180 ? slot.rendered.slice(0, 180) + "..." : slot.rendered}
                  </p>
                )}

                {warnings.length > 0 && (
                  <div className="mt-1.5 space-y-1">
                    {warnings.map((msg, i) => (
                      <div key={i} className="flex items-center gap-1 text-xs text-amber-600">
                        <AlertTriangle className="w-3 h-3 shrink-0" />
                        {msg}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-200 text-xs text-slate-400 shrink-0">
          {compiledAt && <span>Compilado em {compiledAt} • </span>}
          <span>{output.trace.ms}ms</span>
        </div>
      </div>
    </div>
  );
}
