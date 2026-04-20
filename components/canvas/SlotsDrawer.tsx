"use client";

import React, { useEffect, useState } from "react";
import { X, AlertTriangle } from "lucide-react";
import { compilerStrings, carouselStrings } from "@/lib/i18n/pt-br";
import { SLOT_ORDER } from "@/types";
import type { CompileOutput, PromptSlot, SlotKey, CarouselCompileOutput } from "@/types";

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

function SlotCard({ slot, warnings }: { slot: PromptSlot; warnings: string[] }) {
  const label = resolveSourceLabel(slot);
  const badgeClass = SOURCE_BADGE_COLORS[label] ?? "bg-slate-100 text-slate-600";
  return (
    <div className={`rounded-lg border p-3 ${slot.skipped ? "border-red-100 bg-red-50/40" : "border-slate-200 bg-slate-50/60"}`}>
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="flex items-center gap-1.5 text-sm font-medium text-slate-800">
          <span>{SLOT_ICONS[slot.key]}</span>
          {compilerStrings.slotNames[slot.key]}
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
}

function SlotList({ slots, warnings }: { slots: PromptSlot[]; warnings: CompileOutput["warnings"] }) {
  const slotsByKey = Object.fromEntries(slots.map(s => [s.key, s]));
  const warningsByKey: Record<string, string[]> = {};
  for (const w of warnings) {
    if (w.slot) {
      if (!warningsByKey[w.slot]) warningsByKey[w.slot] = [];
      warningsByKey[w.slot].push(w.message);
    }
  }
  return (
    <div className="space-y-3">
      {SLOT_ORDER.map((key) => {
        const slot = slotsByKey[key] as PromptSlot | undefined;
        if (!slot) return null;
        return <SlotCard key={key} slot={slot} warnings={warningsByKey[key] ?? []} />;
      })}
    </div>
  );
}

// ── Single-post mode ──────────────────────────────────────────────────────────

interface SingleSlotsDrawerProps {
  mode?: "single";
  open: boolean;
  output: CompileOutput;
  compiledAt?: string;
  onClose: () => void;
}

// ── Carousel mode ─────────────────────────────────────────────────────────────

interface CarouselSlotsDrawerProps {
  mode: "carousel";
  open: boolean;
  output: CarouselCompileOutput;
  compiledAt?: string;
  onClose: () => void;
}

type SlotsDrawerProps = SingleSlotsDrawerProps | CarouselSlotsDrawerProps;

export function SlotsDrawer(props: SlotsDrawerProps) {
  const { open, onClose, compiledAt } = props;
  const [activeTab, setActiveTab] = useState<"base" | number>("base");

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  useEffect(() => {
    if (open) setActiveTab("base");
  }, [open]);

  if (!open) return null;

  const isCarousel = props.mode === "carousel";

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
            {isCarousel ? (
              <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                {carouselStrings.slidesCount((props.output as CarouselCompileOutput).meta.slides_count)}
              </span>
            ) : (
              <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                {compilerStrings.slotsCounter((props.output as CompileOutput).trace.slotsRendered, SLOT_ORDER.length)}
              </span>
            )}
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100 transition-colors">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        {/* Tab bar (carousel only) */}
        {isCarousel && (() => {
          const co = props.output as CarouselCompileOutput;
          return (
            <div className="flex overflow-x-auto border-b border-slate-200 shrink-0 px-2 pt-1 gap-1">
              <button
                onClick={() => setActiveTab("base")}
                className={`shrink-0 text-xs px-3 py-1.5 rounded-t border-b-2 transition-colors ${
                  activeTab === "base"
                    ? "border-violet-500 text-violet-700 font-medium"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                }`}
              >
                {carouselStrings.slotsDrawerBaseTab}
              </button>
              {co.slides.map((slide, i) => (
                <button
                  key={i}
                  onClick={() => setActiveTab(i)}
                  className={`shrink-0 text-xs px-3 py-1.5 rounded-t border-b-2 transition-colors ${
                    activeTab === i
                      ? "border-violet-500 text-violet-700 font-medium"
                      : "border-transparent text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {carouselStrings.slotsDrawerSlideTab(i, carouselStrings.roleLabels[slide.role] ?? slide.role)}
                </button>
              ))}
            </div>
          );
        })()}

        {/* Slot cards */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {isCarousel ? (() => {
            const co = props.output as CarouselCompileOutput;
            if (activeTab === "base") {
              const baseSlots = Object.values(co.sharedBase).filter(Boolean) as import("@/types").PromptSlot[];
              return <SlotList slots={baseSlots} warnings={co.globalWarnings} />;
            }
            const slide = co.slides[activeTab as number];
            if (!slide) return null;
            return <SlotList slots={slide.slots} warnings={[]} />;
          })() : (
            <SlotList
              slots={(props.output as CompileOutput).slots}
              warnings={(props.output as CompileOutput).warnings}
            />
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-200 text-xs text-slate-400 shrink-0">
          {compiledAt && <span>Compilado em {compiledAt} • </span>}
          {isCarousel ? (
            <span>
              {(props.output as CarouselCompileOutput).meta.totalChars} chars totais
            </span>
          ) : (
            <span>{(props.output as CompileOutput).trace.ms}ms</span>
          )}
        </div>
      </div>
    </div>
  );
}
