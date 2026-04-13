"use client";

import { createPortal } from "react-dom";
import { useState } from "react";
import { X, Check } from "lucide-react";
import { useCanvasStore } from "@/lib/canvas-store";

// ── Google Fonts loader ───────────────────────────────────────────────────────

const GOOGLE_FONTS_URL =
  "https://fonts.googleapis.com/css2?family=Montserrat:wght@900&family=Playfair+Display:wght@700&family=Dancing+Script:wght@700&family=Inter:wght@500&display=swap";

// ── Font options ──────────────────────────────────────────────────────────────

type FontFamily = "montserrat-black" | "playfair-display" | "dancing-script" | "inter-medium";

interface FontOption {
  family:     FontFamily;
  label:      string;
  descriptor: string;
  cssFamily:  string;
  weight:     string | number;
}

const FONT_OPTIONS: FontOption[] = [
  {
    family:     "montserrat-black",
    label:      "MONTSERRAT BLACK",
    descriptor: "Moderno & Bold",
    cssFamily:  "Montserrat",
    weight:     900,
  },
  {
    family:     "playfair-display",
    label:      "Playfair Display",
    descriptor: "Editorial & Elegante",
    cssFamily:  "Playfair Display",
    weight:     700,
  },
  {
    family:     "dancing-script",
    label:      "Dancing Script",
    descriptor: "Artesanal & Script",
    cssFamily:  "Dancing Script",
    weight:     700,
  },
  {
    family:     "inter-medium",
    label:      "Inter Medium",
    descriptor: "Minimal & Clean",
    cssFamily:  "Inter",
    weight:     500,
  },
];

// ── Color presets ─────────────────────────────────────────────────────────────

interface ColorPreset {
  hex:   string;
  label: string;
}

function buildColorPresets(primaryColor?: string | null, secondaryColor?: string | null): ColorPreset[] {
  return [
    { hex: "#FFFFFF", label: "Branco" },
    { hex: "#000000", label: "Preto" },
    ...(primaryColor   ? [{ hex: primaryColor,   label: "Primária" }]   : []),
    ...(secondaryColor ? [{ hex: secondaryColor, label: "Secundária" }] : []),
  ];
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface FontSelectorModalProps {
  headline: string;
  onClose:  () => void;
}

// ── FontSelectorModal ─────────────────────────────────────────────────────────

export default function FontSelectorModal({ headline, onClose }: FontSelectorModalProps) {
  const client       = useCanvasStore((s) => s.client);
  const selectedFont = useCanvasStore((s) => s.selectedFont);
  const selectFont   = useCanvasStore((s) => s.selectFont);

  const colorPresets = buildColorPresets(client?.primary_color, client?.secondary_color);

  // Local selections (committed on Confirmar)
  const [localFamily, setLocalFamily] = useState<FontFamily>(
    selectedFont?.family ?? "montserrat-black"
  );
  const [localColor, setLocalColor] = useState<string>(
    selectedFont?.color ?? "#FFFFFF"
  );
  const [customHex, setCustomHex] = useState<string>("");

  function handleConfirm() {
    selectFont({ family: localFamily, color: localColor });
  }

  function handleColorPreset(hex: string) {
    setLocalColor(hex);
  }

  function handleCustomHex(val: string) {
    setCustomHex(val);
    // Accept 3 or 6-char hex codes
    if (/^#[0-9A-Fa-f]{6}$/.test(val) || /^#[0-9A-Fa-f]{3}$/.test(val)) {
      setLocalColor(val);
    }
  }

  const activeFont = FONT_OPTIONS.find(f => f.family === localFamily)!;

  const modal = (
    <>
      {/* Google Fonts link */}
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link rel="stylesheet" href={GOOGLE_FONTS_URL} />

      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <div>
              <h2 className="text-base font-bold text-slate-900">Escolher Fonte</h2>
              <p className="text-xs text-slate-400 mt-0.5">Selecione o estilo tipográfico do headline</p>
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
            {/* Font cards */}
            <div className="grid grid-cols-2 gap-3">
              {FONT_OPTIONS.map((opt) => {
                const isSelected = localFamily === opt.family;
                return (
                  <button
                    key={opt.family}
                    type="button"
                    onClick={() => setLocalFamily(opt.family)}
                    className={[
                      "relative flex flex-col items-center gap-1.5 rounded-xl border-2 px-3 py-4",
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

                    {/* Preview text */}
                    <p
                      className="text-xl text-slate-900 text-center leading-tight break-words w-full"
                      style={{
                        fontFamily: `"${opt.cssFamily}", sans-serif`,
                        fontWeight: opt.weight,
                      }}
                    >
                      {headline}
                    </p>

                    {/* Font name */}
                    <p className="text-[11px] font-semibold text-slate-700 text-center">
                      {opt.label}
                    </p>

                    {/* Descriptor */}
                    <p className="text-[10px] text-slate-400 text-center">
                      {opt.descriptor}
                    </p>
                  </button>
                );
              })}
            </div>

            {/* Live preview */}
            <div className="rounded-xl bg-slate-900 px-4 py-5 flex items-center justify-center min-h-[64px]">
              <p
                className="text-center text-xl leading-tight break-words"
                style={{
                  fontFamily: `"${activeFont.cssFamily}", sans-serif`,
                  fontWeight: activeFont.weight,
                  color:      localColor,
                }}
              >
                {headline}
              </p>
            </div>

            {/* Color selector */}
            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Cor do Texto
              </label>
              <div className="flex items-center gap-2 flex-wrap">
                {colorPresets.map((preset) => {
                  const isSelected = localColor === preset.hex;
                  return (
                    <button
                      key={preset.hex}
                      type="button"
                      title={preset.label}
                      onClick={() => handleColorPreset(preset.hex)}
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

                {/* Custom hex input */}
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
                    onChange={(e) => handleCustomHex(e.target.value)}
                    className={[
                      "flex-1 rounded-lg border border-slate-200 bg-white",
                      "px-2 py-1 text-xs text-slate-700 placeholder-slate-400",
                      "focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent",
                    ].join(" ")}
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
              Confirmar Fonte
            </button>
          </div>
        </div>
      </div>
    </>
  );

  // Render into body portal to escape the ReactFlow node stacking context
  if (typeof document === "undefined") return null;
  return createPortal(modal, document.body);
}
