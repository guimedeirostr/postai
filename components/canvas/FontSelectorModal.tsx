"use client";

import { createPortal } from "react-dom";
import { useState, useEffect, useMemo, useRef } from "react";
import { X, Check, Search, Loader2 } from "lucide-react";
import { useCanvasStore, FONT_PAIRS } from "@/lib/canvas-store";
import type { FontPair } from "@/lib/canvas-store";

// ── Google Font metadata (from /api/fonts) ────────────────────────────────────

interface GoogleFont {
  family:   string;
  category: string;
  variants: string[];
}

// ── Color presets ─────────────────────────────────────────────────────────────

interface ColorPreset { hex: string; label: string }

function buildColorPresets(primary?: string | null, secondary?: string | null): ColorPreset[] {
  return [
    { hex: "#FFFFFF", label: "Branco" },
    { hex: "#000000", label: "Preto" },
    ...(primary   ? [{ hex: primary,   label: "Primária" }]   : []),
    ...(secondary ? [{ hex: secondary, label: "Secundária" }] : []),
    { hex: "#F59E0B", label: "Dourado" },
    { hex: "#EF4444", label: "Vermelho" },
  ];
}

// ── Category filter options ───────────────────────────────────────────────────

const CATEGORIES = [
  { value: "all",         label: "Todos"      },
  { value: "sans-serif",  label: "Sem serifa" },
  { value: "serif",       label: "Serifa"     },
  { value: "display",     label: "Display"    },
  { value: "handwriting", label: "Cursiva"    },
  { value: "monospace",   label: "Mono"       },
];

const PAGE_SIZE = 40;

// ── Pre-build Google Fonts URL for all 8 curated pairs ────────────────────────

const PAIRS_FONTS_URL = (() => {
  const seen    = new Set<string>();
  const families: string[] = [];
  for (const p of FONT_PAIRS) {
    for (const fam of [p.headlineFont, p.bodyFont]) {
      if (!seen.has(fam)) {
        seen.add(fam);
        families.push(`family=${fam.replace(/ /g, "+")}:wght@400;700`);
      }
    }
  }
  return `https://fonts.googleapis.com/css2?${families.join("&")}&display=swap`;
})();

// ── Build preview URL for the live preview bar ───────────────────────────────

function previewUrl(headline: string, body: string): string {
  const enc = (f: string) => f.replace(/ /g, "+");
  const h   = `family=${enc(headline)}:wght@400;700;900`;
  const b   = body !== headline ? `&family=${enc(body)}:wght@400;500` : "";
  return `https://fonts.googleapis.com/css2?${h}${b}&display=swap`;
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  headline: string;
  onClose:  () => void;
}

// ── FontSelectorModal ─────────────────────────────────────────────────────────

export default function FontSelectorModal({ headline, onClose }: Props) {
  const client       = useCanvasStore(s => s.client);
  const selectedFont = useCanvasStore(s => s.selectedFont);
  const selectFont   = useCanvasStore(s => s.selectFont);

  const colorPresets = buildColorPresets(client?.primary_color, client?.secondary_color);

  // ── Local state ─────────────────────────────────────────────────────────────

  const [activeTab,         setActiveTab]         = useState<"pairs" | "custom">("pairs");
  const [localHeadlineFont, setLocalHeadlineFont] = useState(
    selectedFont?.headlineFont ?? FONT_PAIRS[0].headlineFont
  );
  const [localBodyFont,     setLocalBodyFont]     = useState(
    selectedFont?.bodyFont ?? FONT_PAIRS[0].bodyFont
  );
  const [localColor,        setLocalColor]        = useState(selectedFont?.color ?? "#FFFFFF");
  const [customHex,         setCustomHex]         = useState("");

  // ── Font browser state ───────────────────────────────────────────────────────

  const [activePicker,   setActivePicker]   = useState<"headline" | "body">("headline");
  const [searchQuery,    setSearchQuery]    = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [fonts,          setFonts]          = useState<GoogleFont[]>([]);
  const [fontsLoading,   setFontsLoading]   = useState(false);
  const [fontsError,     setFontsError]     = useState<string | null>(null);
  const [visibleCount,   setVisibleCount]   = useState(PAGE_SIZE);
  const fontsFetched = useRef(false);

  // ── Fetch fonts when "Personalizado" tab first opened ─────────────────────

  useEffect(() => {
    if (activeTab !== "custom" || fontsFetched.current) return;
    fontsFetched.current = true;
    setFontsLoading(true);
    fetch("/api/fonts?limit=500&sort=popularity")
      .then(r => r.json() as Promise<{ fonts?: GoogleFont[]; error?: string }>)
      .then(data => {
        if (data.error) throw new Error(data.error);
        setFonts(data.fonts ?? []);
        setFontsLoading(false);
      })
      .catch(err => {
        setFontsError((err as Error).message ?? "Erro ao carregar fontes");
        setFontsLoading(false);
      });
  }, [activeTab]);

  // ── Filter + paginate ──────────────────────────────────────────────────────

  const filteredFonts = useMemo(() => {
    return fonts
      .filter(f => activeCategory === "all" || f.category === activeCategory)
      .filter(f => !searchQuery || f.family.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [fonts, activeCategory, searchQuery]);

  const visibleFonts = filteredFonts.slice(0, visibleCount);

  // Reset pagination when filter changes
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [searchQuery, activeCategory]);

  // ── Load Google Fonts CSS for font browser list (one batch request) ─────────

  useEffect(() => {
    if (visibleFonts.length === 0) return;
    const id = "gf-browser-batch";
    let el = document.getElementById(id) as HTMLLinkElement | null;
    if (!el) {
      el = document.createElement("link");
      el.id = id;
      el.rel = "stylesheet";
      document.head.appendChild(el);
    }
    const families = visibleFonts
      .map(f => `family=${f.family.replace(/ /g, "+")}`)
      .join("&");
    el.href = `https://fonts.googleapis.com/css2?${families}&display=swap`;
    return () => { document.getElementById("gf-browser-batch")?.remove(); };
  }, [visibleFonts]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleSelectPair(pair: FontPair) {
    setLocalHeadlineFont(pair.headlineFont);
    setLocalBodyFont(pair.bodyFont);
  }

  function handleFontClick(family: string) {
    if (activePicker === "headline") setLocalHeadlineFont(family);
    else setLocalBodyFont(family);
  }

  function handleCustomHex(val: string) {
    setCustomHex(val);
    if (/^#[0-9A-Fa-f]{6}$/.test(val) || /^#[0-9A-Fa-f]{3}$/.test(val)) {
      setLocalColor(val);
    }
  }

  function handleConfirm() {
    selectFont({ headlineFont: localHeadlineFont, bodyFont: localBodyFont, color: localColor });
    onClose();
  }

  // Highlight active pair card
  const activePairId = FONT_PAIRS.find(
    p => p.headlineFont === localHeadlineFont && p.bodyFont === localBodyFont
  )?.id ?? null;

  // ── Modal markup ───────────────────────────────────────────────────────────

  const modal = (
    <>
      {/* Load all 8 pair fonts upfront */}
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link rel="stylesheet" href={PAIRS_FONTS_URL} />

      {/* Load preview fonts for live preview */}
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link rel="stylesheet" href={previewUrl(localHeadlineFont, localBodyFont)} />

      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
        onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      >
        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">

          {/* ── Header ──────────────────────────────────────────────────── */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 flex-none">
            <div>
              <h2 className="text-base font-bold text-slate-900">Tipografia</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Escolha o par de fontes — Google Fonts
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

          {/* ── Tabs ─────────────────────────────────────────────────────── */}
          <div className="flex border-b border-slate-100 flex-none px-5">
            {(["pairs", "custom"] as const).map(tab => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={[
                  "px-4 py-2.5 text-xs font-semibold border-b-2 -mb-px transition-colors",
                  activeTab === tab
                    ? "border-violet-500 text-violet-600"
                    : "border-transparent text-slate-400 hover:text-slate-600",
                ].join(" ")}
              >
                {tab === "pairs" ? "Pares Populares" : "Personalizado"}
              </button>
            ))}
          </div>

          {/* ── Scrollable content ──────────────────────────────────────── */}
          <div className="flex-1 overflow-y-auto px-5 py-4 min-h-0">

            {/* Tab: Pares Populares */}
            {activeTab === "pairs" && (
              <div className="grid grid-cols-2 gap-3">
                {FONT_PAIRS.map(pair => {
                  const isSelected = pair.id === activePairId;
                  return (
                    <button
                      key={pair.id}
                      type="button"
                      onClick={() => handleSelectPair(pair)}
                      className={[
                        "relative flex flex-col items-start gap-1.5 rounded-xl border-2 px-3 pt-3 pb-2.5 text-left",
                        "transition-all duration-150 cursor-pointer",
                        isSelected
                          ? "border-violet-500 bg-violet-50 ring-2 ring-violet-500 ring-offset-1"
                          : "border-slate-200 bg-white hover:border-slate-300",
                      ].join(" ")}
                    >
                      {isSelected && (
                        <span className="absolute top-2 right-2 w-5 h-5 rounded-full bg-violet-500 flex items-center justify-center">
                          <Check className="h-3 w-3 text-white" />
                        </span>
                      )}

                      {/* Headline preview */}
                      <p
                        className="text-base text-slate-900 leading-tight break-words w-full pr-5 line-clamp-2"
                        style={{
                          fontFamily:    `"${pair.headlineFont}", sans-serif`,
                          fontWeight:    pair.headlineWeight,
                          textTransform: pair.headlineUppercase ? "uppercase" : "none",
                        }}
                      >
                        {headline.length > 20 ? headline.slice(0, 20) + "…" : headline}
                      </p>

                      {/* Body preview */}
                      <p
                        className="text-[11px] text-slate-500"
                        style={{
                          fontFamily: `"${pair.bodyFont}", sans-serif`,
                          fontWeight: pair.bodyWeight,
                        }}
                      >
                        Texto de legenda
                      </p>

                      {/* Labels */}
                      <div className="mt-0.5">
                        <p className="text-[10px] font-bold text-slate-700 uppercase tracking-wide leading-none">
                          {pair.headlineFont}
                        </p>
                        <p className="text-[10px] text-slate-400">
                          + {pair.bodyFont} · {pair.descriptor}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Tab: Personalizado */}
            {activeTab === "custom" && (
              <div className="flex flex-col gap-3">

                {/* Active picker selector */}
                <div className="grid grid-cols-2 gap-2">
                  {(["headline", "body"] as const).map(picker => {
                    const family = picker === "headline" ? localHeadlineFont : localBodyFont;
                    return (
                      <button
                        key={picker}
                        type="button"
                        onClick={() => setActivePicker(picker)}
                        className={[
                          "flex flex-col items-start px-3 py-2 rounded-xl border-2 text-left transition-all",
                          activePicker === picker
                            ? "border-violet-500 bg-violet-50"
                            : "border-slate-200 hover:border-slate-300 bg-white",
                        ].join(" ")}
                      >
                        <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">
                          {picker === "headline" ? "Título" : "Corpo"}
                        </span>
                        <span
                          className="text-sm font-semibold text-slate-800 truncate w-full"
                          style={{ fontFamily: `"${family}", sans-serif` }}
                        >
                          {family}
                        </span>
                        {activePicker === picker && (
                          <span className="text-[9px] text-violet-500 font-medium mt-0.5">
                            Clique na lista para alterar
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Search bar */}
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Buscar fonte por nome..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white pl-8 pr-3 py-2 text-xs text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>

                {/* Category chips */}
                <div className="flex gap-1 flex-wrap">
                  {CATEGORIES.map(cat => (
                    <button
                      key={cat.value}
                      type="button"
                      onClick={() => setActiveCategory(cat.value)}
                      className={[
                        "px-2.5 py-1 rounded-full text-[10px] font-medium transition-colors",
                        activeCategory === cat.value
                          ? "bg-violet-600 text-white"
                          : "bg-slate-100 text-slate-500 hover:bg-slate-200",
                      ].join(" ")}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>

                {/* Loading / error / font list */}
                {fontsLoading && (
                  <div className="flex items-center justify-center py-10 gap-2 text-slate-400">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-xs">Carregando catálogo Google Fonts...</span>
                  </div>
                )}

                {fontsError && (
                  <p className="text-xs text-red-500 py-6 text-center">{fontsError}</p>
                )}

                {!fontsLoading && !fontsError && (
                  <>
                    <div className="flex flex-col gap-0.5">
                      {visibleFonts.map(font => {
                        const isActiveHL = font.family === localHeadlineFont;
                        const isActiveBD = font.family === localBodyFont;
                        const isActive   = activePicker === "headline" ? isActiveHL : isActiveBD;
                        return (
                          <button
                            key={font.family}
                            type="button"
                            onClick={() => handleFontClick(font.family)}
                            className={[
                              "flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors",
                              isActive
                                ? "bg-violet-50 border border-violet-200"
                                : "hover:bg-slate-50 border border-transparent",
                            ].join(" ")}
                          >
                            <span
                              className="text-xl text-slate-800 w-9 text-center flex-none select-none"
                              style={{ fontFamily: `"${font.family}", sans-serif` }}
                              aria-hidden="true"
                            >
                              Aa
                            </span>
                            <span className="flex-1 text-xs text-slate-700 truncate">
                              {font.family}
                            </span>
                            <span className="text-[9px] text-slate-400 flex-none">
                              {font.category}
                            </span>
                            {/* Badges for both headline and body */}
                            {isActiveHL && (
                              <span className="text-[9px] bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded-full font-medium flex-none">
                                título
                              </span>
                            )}
                            {isActiveBD && (
                              <span className="text-[9px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full font-medium flex-none">
                                corpo
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>

                    {/* Load more */}
                    {visibleCount < filteredFonts.length && (
                      <button
                        type="button"
                        onClick={() => setVisibleCount(v => v + PAGE_SIZE)}
                        className="w-full py-2 text-xs text-violet-600 font-medium hover:bg-violet-50 rounded-lg transition-colors border border-violet-100"
                      >
                        Carregar mais {Math.min(PAGE_SIZE, filteredFonts.length - visibleCount)} fontes
                        <span className="text-slate-400 ml-1">
                          ({filteredFonts.length - visibleCount} restantes)
                        </span>
                      </button>
                    )}

                    {filteredFonts.length === 0 && fonts.length > 0 && (
                      <p className="text-xs text-slate-400 text-center py-6">
                        Nenhuma fonte encontrada{searchQuery ? ` para "${searchQuery}"` : ""}
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {/* ── Live preview ──────────────────────────────────────────────── */}
          <div className="flex-none px-5 pt-3 pb-2 border-t border-slate-100">
            <div className="rounded-xl bg-slate-900 px-4 py-4 flex flex-col items-center justify-center gap-1 min-h-[70px]">
              <p
                className="text-center text-xl leading-tight break-words"
                style={{
                  fontFamily: `"${localHeadlineFont}", sans-serif`,
                  fontWeight: 700,
                  color:      localColor,
                }}
              >
                {headline || "Seu Headline"}
              </p>
              <p
                className="text-center text-xs opacity-50"
                style={{
                  fontFamily: `"${localBodyFont}", sans-serif`,
                  fontWeight: 400,
                  color:      localColor,
                }}
              >
                Legenda do post · @{client?.instagram_handle?.replace(/^@/, "") ?? "marca"}
              </p>
            </div>
          </div>

          {/* ── Color picker ──────────────────────────────────────────────── */}
          <div className="flex-none px-5 py-3 border-t border-slate-100">
            <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 block mb-2">
              Cor do Texto
            </label>
            <div className="flex items-center gap-2 flex-wrap">
              {colorPresets.map(preset => {
                const isSel = localColor === preset.hex;
                return (
                  <button
                    key={preset.hex}
                    type="button"
                    title={preset.label}
                    onClick={() => { setLocalColor(preset.hex); setCustomHex(""); }}
                    className={[
                      "w-7 h-7 rounded-full border-2 transition-all flex-none",
                      "focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-1",
                      isSel ? "border-violet-500 ring-2 ring-violet-500 ring-offset-1" : "border-slate-300",
                      preset.hex === "#FFFFFF" ? "shadow-inner" : "",
                    ].join(" ")}
                    style={{ backgroundColor: preset.hex }}
                  />
                );
              })}
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
                  className="flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>
            </div>
          </div>

          {/* ── Footer ────────────────────────────────────────────────────── */}
          <div className="flex-none px-5 py-3 border-t border-slate-100 flex items-center justify-between">
            <p className="text-[10px] text-slate-400 truncate mr-2">
              <span className="font-semibold text-slate-600">{localHeadlineFont}</span>
              {" + "}
              <span className="font-semibold text-slate-600">{localBodyFont}</span>
            </p>
            <div className="flex gap-2 flex-none">
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
                Confirmar
              </button>
            </div>
          </div>

        </div>
      </div>
    </>
  );

  if (typeof document === "undefined") return null;
  return createPortal(modal, document.body);
}
