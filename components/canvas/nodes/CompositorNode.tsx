"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { Layers, AlertCircle, Type, Palette, Image as ImageIcon } from "lucide-react";
import BaseNode from "@/components/canvas/BaseNode";
import FontSelectorModal from "@/components/canvas/FontSelectorModal";
import { useCanvasStore, FONT_PAIRS } from "@/lib/canvas-store";

// ── Types ──────────────────────────────────────────────────────────────────────

type TextPosition = "top" | "center" | "bottom-left" | "bottom-full";

interface TextPosOption {
  value:   TextPosition;
  label:   string;
  bandCls: string;
}

const TEXT_POS_OPTIONS: TextPosOption[] = [
  { value: "top",         label: "Topo",       bandCls: "top-0 left-0 right-0 h-1/3"           },
  { value: "center",      label: "Centro",     bandCls: "inset-y-1/3 left-0 right-0"            },
  { value: "bottom-left", label: "Inf. Esq.",  bandCls: "bottom-0 left-0 w-1/2 h-1/3"          },
  { value: "bottom-full", label: "Inf. Total", bandCls: "bottom-0 left-0 right-0 h-1/3"        },
];

type LogoPlacementOption = "top-left" | "top-right" | "bottom-right" | "none";

const LOGO_POS_OPTIONS: { value: LogoPlacementOption; label: string }[] = [
  { value: "top-left",    label: "Sup. Esq." },
  { value: "top-right",   label: "Sup. Dir." },
  { value: "bottom-right",label: "Inf. Dir." },
  { value: "none",        label: "Nenhum"    },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function AnimatedDots() {
  const [count, setCount] = useState(1);
  useEffect(() => {
    const id = setInterval(() => setCount((c) => (c % 3) + 1), 500);
    return () => clearInterval(id);
  }, []);
  return <span>{".".repeat(count)}</span>;
}

function ShimmerBox() {
  return <div className="w-full rounded-lg bg-slate-200 animate-pulse" style={{ height: 160 }} />;
}

function IdlePlaceholder() {
  return (
    <p className="text-sm text-slate-400 text-center leading-relaxed py-2">
      Aguardando diretor de fotografia...
    </p>
  );
}

// ── Toggle row helper ─────────────────────────────────────────────────────────

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="nodrag nopan flex items-center justify-between cursor-pointer select-none">
      <span className="text-xs text-slate-600">{label}</span>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={[
          "relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200",
          checked ? "bg-violet-600" : "bg-slate-200",
        ].join(" ")}
      >
        <span
          className={[
            "inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform duration-200",
            checked ? "translate-x-4" : "translate-x-0.5",
          ].join(" ")}
        />
      </button>
    </label>
  );
}

// ── Node type ─────────────────────────────────────────────────────────────────

export type CompositorNodeType = Node<{ label: string }, "compositor">;

// ── CompositorNode ────────────────────────────────────────────────────────────

export default function CompositorNode({ selected }: NodeProps<CompositorNodeType>) {
  const imageUrl         = useCanvasStore((s) => s.imageUrl);
  const imageStatus      = useCanvasStore((s) => s.imageStatus);
  const composedUrl      = useCanvasStore((s) => s.composedUrl);
  const compositorStatus = useCanvasStore((s) => s.compositorStatus);
  const compositorError  = useCanvasStore((s) => s.compositorError);
  const copy             = useCanvasStore((s) => s.copy);
  const referenceImageUrl= useCanvasStore((s) => s.referenceImageUrl);

  // Compositor controls
  const textPosition     = useCanvasStore((s) => s.textPosition);
  const logoPlacement    = useCanvasStore((s) => s.logoPlacement);
  const footerVisible    = useCanvasStore((s) => s.footerVisible);
  const footerOverlay    = useCanvasStore((s) => s.footerOverlay);
  const gradientOverlay  = useCanvasStore((s) => s.gradientOverlay);
  const textBgOverlay    = useCanvasStore((s) => s.textBgOverlay);
  const logoOverlay      = useCanvasStore((s) => s.logoOverlay);
  const headlineColor    = useCanvasStore((s) => s.headlineColor);
  const accentColor      = useCanvasStore((s) => s.accentColor);
  const selectedFont     = useCanvasStore((s) => s.selectedFont);
  const fontModalOpen    = useCanvasStore((s) => s.fontModalOpen);

  const setTextPosition    = useCanvasStore((s) => s.setTextPosition);
  const setLogoPlacement   = useCanvasStore((s) => s.setLogoPlacement);
  const setFooterVisible   = useCanvasStore((s) => s.setFooterVisible);
  const setFooterOverlay   = useCanvasStore((s) => s.setFooterOverlay);
  const setGradientOverlay = useCanvasStore((s) => s.setGradientOverlay);
  const setTextBgOverlay   = useCanvasStore((s) => s.setTextBgOverlay);
  const setLogoOverlay     = useCanvasStore((s) => s.setLogoOverlay);
  const setHeadlineColor   = useCanvasStore((s) => s.setHeadlineColor);
  const setAccentColor     = useCanvasStore((s) => s.setAccentColor);
  const openFontModal      = useCanvasStore((s) => s.openFontModal);
  const composeManual      = useCanvasStore((s) => s.composeManual);

  const activePair = selectedFont ? FONT_PAIRS.find(p => p.id === selectedFont.pairId) : null;
  const isComposing  = compositorStatus === "loading";
  const isImageReady = imageStatus === "done" && !!imageUrl;

  // Composition source indicator
  const compositionSource = referenceImageUrl ? "Referência" : imageStatus === "done" ? "IA" : null;

  const nodeStatus =
    compositorStatus === "done"    ? "done"    :
    compositorStatus === "error"   ? "error"   :
    compositorStatus === "loading" ? "loading" :
    imageStatus === "loading"      ? "loading" :
    imageStatus === "polling"      ? "polling" :
    imageStatus === "error"        ? "error"   :
    "idle";

  function getOverlayCss(pos: TextPosition): string {
    switch (pos) {
      case "top":         return "top-0 left-0 right-0 pb-1 pt-1 px-1 items-start";
      case "center":      return "top-1/2 left-0 right-0 -translate-y-1/2 px-1 items-center";
      case "bottom-left": return "bottom-0 left-0 w-1/2 pt-1 pb-1 px-1 items-end";
      case "bottom-full": return "bottom-0 left-0 right-0 pt-1 pb-1 px-1 items-end";
    }
  }

  return (
    <>
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        className="!bg-slate-400 !w-3 !h-3 !border-2 !border-white"
      />

      <BaseNode
        title="Compositor"
        icon={<Layers />}
        status={nodeStatus}
        selected={selected}
        width={380}
      >
        {/* Idle */}
        {!isImageReady && imageStatus !== "loading" && imageStatus !== "polling" && (
          <IdlePlaceholder />
        )}

        {/* Loading / Polling */}
        {(imageStatus === "loading" || imageStatus === "polling") && (
          <div className="flex flex-col gap-2">
            <ShimmerBox />
            <p className="text-xs text-blue-600 text-center font-medium">
              {imageStatus === "polling"
                ? <>Processando na IA<AnimatedDots /></>
                : "Gerando imagem..."}
            </p>
          </div>
        )}

        {/* Image ready — full compositor UI */}
        {isImageReady && (
          <div className="flex flex-col gap-3">

            {/* Source + preview */}
            <div className="relative rounded-lg overflow-hidden" style={{ height: 160 }}>
              <img src={imageUrl} alt="Imagem" className="w-full h-full object-cover" />
              <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-black/60 via-transparent to-transparent" />
              {copy?.visual_headline && (
                <div className={["absolute flex", getOverlayCss(textPosition)].join(" ")}>
                  <p
                    className="text-[11px] font-bold drop-shadow leading-tight"
                    style={{ color: headlineColor, textShadow: "0 1px 3px rgba(0,0,0,0.8)" }}
                  >
                    {copy.visual_headline}
                  </p>
                </div>
              )}
              {compositionSource && (
                <div className="absolute top-2 right-2">
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-black/50 text-white flex items-center gap-1">
                    <ImageIcon className="w-2.5 h-2.5" />
                    {compositionSource}
                  </span>
                </div>
              )}
            </div>

            {/* ── Tipografia ── */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Tipografia
              </label>
              <button
                type="button"
                onClick={openFontModal}
                disabled={isComposing}
                className={[
                  "nodrag nopan flex items-center gap-2 w-full rounded-lg border px-3 py-2 text-xs font-medium transition-colors duration-150",
                  isComposing
                    ? "border-slate-200 text-slate-300 cursor-not-allowed bg-slate-50"
                    : "border-slate-200 text-slate-600 hover:border-violet-300 hover:text-violet-700 hover:bg-violet-50",
                ].join(" ")}
              >
                <Type className="h-3.5 w-3.5 flex-none" />
                {activePair ? (
                  <span className="flex items-center gap-1.5 flex-1">
                    <span
                      className="inline-block w-3 h-3 rounded-full border border-slate-200 flex-none"
                      style={{ backgroundColor: selectedFont?.color ?? "#fff" }}
                    />
                    <span className="font-semibold">{activePair.headline.cssFamily}</span>
                    <span className="text-slate-400">+ {activePair.secondary.cssFamily}</span>
                  </span>
                ) : (
                  <span className="flex-1 text-left">Escolher Par de Fontes</span>
                )}
              </button>
            </div>

            {/* ── Cores ── */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 flex items-center gap-1">
                <Palette className="w-3 h-3" />
                Cores
              </label>
              <div className="flex gap-2">
                <label className="nodrag nopan flex flex-col items-center gap-1 cursor-pointer">
                  <span className="text-[10px] text-slate-500">Texto</span>
                  <div className="relative w-8 h-8 rounded-lg border-2 border-slate-200 overflow-hidden shadow-sm hover:border-violet-400 transition-colors">
                    <div className="absolute inset-0 rounded" style={{ backgroundColor: headlineColor }} />
                    <input
                      type="color"
                      value={headlineColor}
                      onChange={e => setHeadlineColor(e.target.value)}
                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    />
                  </div>
                </label>
                <label className="nodrag nopan flex flex-col items-center gap-1 cursor-pointer">
                  <span className="text-[10px] text-slate-500">Acento</span>
                  <div className="relative w-8 h-8 rounded-lg border-2 border-slate-200 overflow-hidden shadow-sm hover:border-violet-400 transition-colors">
                    <div className="absolute inset-0 rounded" style={{ backgroundColor: accentColor }} />
                    <input
                      type="color"
                      value={accentColor}
                      onChange={e => setAccentColor(e.target.value)}
                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    />
                  </div>
                </label>
                <div className="flex-1 flex flex-col gap-1">
                  <ToggleRow label="Gradiente" checked={gradientOverlay} onChange={setGradientOverlay} />
                  <ToggleRow label="Box no texto" checked={textBgOverlay} onChange={setTextBgOverlay} />
                </div>
              </div>
            </div>

            {/* ── Posição do Texto ── */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Posição do Texto
              </label>
              <div className="grid grid-cols-4 gap-1.5">
                {TEXT_POS_OPTIONS.map((opt) => {
                  const isSelected = textPosition === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setTextPosition(opt.value)}
                      className={[
                        "nodrag nopan relative rounded border overflow-hidden flex flex-col items-center gap-1 py-2 px-1 transition-all duration-150",
                        isSelected ? "border-violet-500 bg-violet-50" : "border-slate-200 bg-white hover:border-slate-300",
                      ].join(" ")}
                    >
                      <div className="relative w-8 h-6 rounded bg-slate-200 overflow-hidden">
                        <div className={["absolute bg-violet-400 opacity-70", opt.bandCls].join(" ")} />
                      </div>
                      <span className={["text-[10px] font-medium leading-none", isSelected ? "text-violet-700" : "text-slate-500"].join(" ")}>
                        {opt.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ── Logo ── */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Logo
              </label>
              <div className="flex gap-1.5 flex-wrap">
                {LOGO_POS_OPTIONS.map((opt) => {
                  const storeVal = opt.value as typeof logoPlacement;
                  const isSelected = logoPlacement === storeVal;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setLogoPlacement(storeVal)}
                      className={[
                        "nodrag nopan px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all duration-150",
                        isSelected ? "border-violet-500 bg-violet-100 text-violet-700" : "border-slate-200 bg-white text-slate-500 hover:border-slate-300",
                      ].join(" ")}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              {logoPlacement !== "none" && (
                <ToggleRow label="Badge de fundo no logo" checked={logoOverlay} onChange={setLogoOverlay} />
              )}
            </div>

            {/* ── Rodapé ── */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Rodapé
              </label>
              <ToggleRow label="Exibir rodapé com handle" checked={footerVisible} onChange={setFooterVisible} />
              {footerVisible && (
                <ToggleRow label="Rodapé semi-transparente" checked={footerOverlay} onChange={setFooterOverlay} />
              )}
            </div>

            {/* Error */}
            {compositorStatus === "error" && compositorError && (
              <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2">
                <AlertCircle className="h-3.5 w-3.5 text-red-500 flex-none mt-0.5" />
                <p className="text-xs text-red-700 leading-relaxed">{compositorError}</p>
              </div>
            )}

            {/* Compose button */}
            <button
              type="button"
              onClick={composeManual}
              disabled={isComposing}
              className={[
                "nodrag nopan w-full flex items-center justify-center gap-2",
                "rounded-lg px-3 py-2.5 text-sm font-semibold text-white transition-colors duration-150",
                isComposing
                  ? "bg-emerald-300 cursor-not-allowed"
                  : "bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800",
              ].join(" ")}
            >
              {isComposing ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Compondo...
                </>
              ) : (
                "Compor Post Final"
              )}
            </button>
          </div>
        )}
      </BaseNode>

      <Handle
        type="source"
        position={Position.Right}
        id="out"
        className="!bg-violet-600 !w-3 !h-3 !border-2 !border-white"
      />

      {fontModalOpen && copy && (
        <FontSelectorModal
          headline={copy.visual_headline}
          onClose={() => useCanvasStore.getState().closeFontModal()}
        />
      )}
    </>
  );
}
