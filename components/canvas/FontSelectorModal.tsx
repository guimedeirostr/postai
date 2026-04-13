"use client";

import { createPortal } from "react-dom";
import { useState } from "react";
import { X, Check } from "lucide-react";
import { useCanvasStore, FONT_PAIRS, type FontPairId } from "@/lib/canvas-store";

// ── Google Fonts — loads all 8 fonts (4 headline + 4 secondary) ───────────────

const GOOGLE_FONTS_URL =
  "https://fonts.googleapis.com/css2?" +
  FONT_PAIRS.map(p => `family=${p.headline.googleId}&family=${p.secondary.googleId}`).join("&") +
  "&display=swap";

// ── Color presets ─────────────────────────────────────────────────────────────

interface ColorPreset { hex: string; label: string }

function buildColorPresets(primary?: string | null, secondary?: string | null): ColorPreset[] {
  return [
    { hex: "#FFFFFF", label: "Branco" },
    { hex: "#000000", label: "Preto" },
    ...(primary   ? [{ hex: primary,   label: "Primária" }]   : []),
    ...(secondary ? [{ hex: secondary, label: "Secundária" }] : []),
  ];
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface FontSelectorModalProps {
  headline: string;
  onClose:  () => void;
}

// ── FontSelectorModal ─────────────────────────────────────────────────────────

export default function FontSelectorModal({ headline, onClose }: FontSelectorModalProps) {
  const client       = useCanvasStore(s => s.client);
  const selectedFont = useCanvasStore(s => s.selectedFont);
  const selectFont   = useCanvasStore(s => s.selectFont);

  const colorPresets = buildColorPresets(client?.primary_color, client?.secondary_color);

  const [localPairId, setLocalPairId] = useState<FontPairId>(selectedFont?.pairId ?? "modern");
  const [localColor,  setLocalColor]  = useState<string>(selectedFont?.color ?? "#FFFFFF");
  const [customHex,   setCustomHex]   = useState<string>("");

  function handleConfirm() {
    selectFont({ pairId: localPairId, color: localColor });
    onClose();
  }

  function handleCustomHex(val: string) {
    setCustomHex(val);
    if (/^#[0-9A-Fa-f]{6}$/.test(val) || /^#[0-9A-Fa-f]{3}$/.test(val)) {
      setLocalColor(val);
    }
  }

  const activePair = FONT_PAIRS.find(p => p.id === localPairId)!;

  const modal = (
    <>
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link rel="stylesheet" href={GOOGLE_FONTS_URL} />

      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
        onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      >
        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden">

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <div>
              <h2 className="text-base font-bold text-slate-900">Tipografia</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Escolha um par de fontes — headline + texto secundário
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              aria-label="Fechar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="px-5 py-4 flex flex-col gap-5">

            {/* Font pair cards */}
            <div className="grid grid-cols-2 gap-3">
              {FONT_PAIRS.map(pair => {
                const isSelected = localPairId === pair.id;
                return (
                  <button
                    key={pair.id}
                    type="button"
                    onClick={() => setLocalPairId(pair.id)}
                    className={[
                      "relative flex flex-col items-start gap-2 rounded-xl border-2 px-3 pt-3 pb-2.5",
                      "transition-all duration-150 cursor-pointer text-left",
                      isSelected
                        ? "border-violet-500 bg-violet-50 ring-2 ring-violet-500 ring-offset-1"
                        : "border-slate-200 bg-white hover:border-slate-300",
                    ].join(" ")}
                  >
                    {/* Selected checkmark */}
                    {isSelected && (
                      <span className="absolute top-2 right-2 w-5 h-5 rounded-full bg-violet-500 flex items-center justify-center">
                        <Check className="h-3 w-3 text-white" />
                      </span>
                    )}

                    {/* Headline font preview */}
                    <p
                      className="text-lg text-slate-900 leading-tight break-words w-full pr-6"
                      style={{
                        fontFamily: `"${pair.headline.cssFamily}", sans-serif`,
                        fontWeight: pair.headline.weight,
                      }}
                    >
                      {headline.length > 20 ? headline.slice(0, 20) + "…" : headline}
                    </p>

                    {/* Secondary font preview */}
                    <p
                      className="text-[11px] text-slate-500 leading-snug"
                      style={{
                        fontFamily: `"${pair.secondary.cssFamily}", sans-serif`,
                        fontWeight: pair.secondary.weight,
                      }}
                    >
                      Subtítulo · Legenda
                    </p>

                    {/* Labels */}
                    <div className="mt-0.5">
                      <p className="text-[10px] font-bold text-slate-700 uppercase tracking-wide">
                        {pair.headline.cssFamily}
                      </p>
                      <p className="text-[10px] text-slate-400">
                        + {pair.secondary.cssFamily} · {pair.descriptor}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Live preview */}
            <div className="rounded-xl bg-slate-900 px-4 py-5 flex flex-col items-center justify-center gap-1 min-h-[80px]">
              <p
                className="text-center text-xl leading-tight break-words"
                style={{
                  fontFamily: `"${activePair.headline.cssFamily}", sans-serif`,
                  fontWeight: activePair.headline.weight,
                  color:      localColor,
                }}
              >
                {headline}
              </p>
              <p
                className="text-center text-xs opacity-60"
                style={{
                  fontFamily: `"${activePair.secondary.cssFamily}", sans-serif`,
                  fontWeight: activePair.secondary.weight,
                  color:      localColor,
                }}
              >
                Subtítulo ou handle @marca
              </p>
            </div>

            {/* Color selector */}
            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Cor do Texto
              </label>
              <div className="flex items-center gap-2 flex-wrap">
                {colorPresets.map(preset => {
                  const isSelected = localColor === preset.hex;
                  return (
                    <button
                      key={preset.hex}
                      type="button"
                      title={preset.label}
                      onClick={() => setLocalColor(preset.hex)}
                      className={[
                        "w-8 h-8 rounded-full border-2 transition-all duration-150 flex-none",
                        "focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-1",
                        isSelected
                          ? "border-violet-500 ring-2 ring-violet-500 ring-offset-1"
                          : "border-slate-300 hover:border-slate-400",
                        preset.hex === "#FFFFFF" ? "shadow-inner" : "",
                      ].join(" ")}
                      style={{ backgroundColor: preset.hex }}
                    />
                  );
                })}

                {/* Custom hex */}
                <div className="flex items-center gap-1.5 flex-1 min-w-[120px]">
                  <div
                    className="w-6 h-6 rounded-full border border-slate-300 flex-none"
                    style={{ backgroundColor: localColor }}
                  />
                  <input
                    type="text"
                    maxLength={7}
                    placeholder="#FFFFFF"
                    value={customHex}
                    onChange={e => handleCustomHex(e.target.value)}
                    className="flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-5 py-4 border-t border-slate-100 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-violet-600 text-white hover:bg-violet-700 transition-colors"
            >
              Confirmar Tipografia
            </button>
          </div>
        </div>
      </div>
    </>
  );

  if (typeof document === "undefined") return null;
  return createPortal(modal, document.body);
}
