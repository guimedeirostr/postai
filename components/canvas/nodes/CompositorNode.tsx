"use client";

import { useEffect, useState } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { Layers, AlertCircle, Type } from "lucide-react";
import BaseNode from "@/components/canvas/BaseNode";
import FontSelectorModal from "@/components/canvas/FontSelectorModal";
import { useCanvasStore, FONT_PAIRS } from "@/lib/canvas-store";

// ── Text position option ───────────────────────────────────────────────────────

type TextPosition = "top" | "center" | "bottom-left" | "bottom-full";

interface TextPosOption {
  value:   TextPosition;
  label:   string;
  /** CSS classes to style the colored band inside the preview rectangle */
  bandCls: string;
  bandPos: "top" | "center" | "bottom";
}

const TEXT_POS_OPTIONS: TextPosOption[] = [
  { value: "top",          label: "Topo",      bandCls: "top-0 left-0 right-0 h-1/3",  bandPos: "top"    },
  { value: "center",       label: "Centro",    bandCls: "inset-y-1/3 left-0 right-0",   bandPos: "center" },
  { value: "bottom-left",  label: "Inf. Esq.", bandCls: "bottom-0 left-0 w-1/2 h-1/3", bandPos: "bottom" },
  { value: "bottom-full",  label: "Inf. Total",bandCls: "bottom-0 left-0 right-0 h-1/3",bandPos: "bottom" },
];

// ── Logo placement option ──────────────────────────────────────────────────────

type LogoPlacementOption = "top-left" | "top-right" | "bottom-right" | "none";

const LOGO_POS_OPTIONS: { value: LogoPlacementOption; label: string }[] = [
  { value: "top-left",    label: "Sup. Esq." },
  { value: "top-right",   label: "Sup. Dir." },
  { value: "bottom-right",label: "Inf. Dir." },
  { value: "none",        label: "Nenhum" },
];

// ── Animated polling dots ─────────────────────────────────────────────────────

function AnimatedDots() {
  const [count, setCount] = useState(1);
  useEffect(() => {
    const id = setInterval(() => setCount((c) => (c % 3) + 1), 500);
    return () => clearInterval(id);
  }, []);
  return <span>{".".repeat(count)}</span>;
}

// ── Shimmer box ───────────────────────────────────────────────────────────────

function ShimmerBox() {
  return (
    <div className="w-full rounded-lg bg-slate-200 animate-pulse" style={{ height: 160 }} />
  );
}

// ── Idle placeholder ──────────────────────────────────────────────────────────

function IdlePlaceholder() {
  return (
    <p className="text-sm text-slate-400 text-center leading-relaxed py-2">
      Aguardando diretor criativo...
    </p>
  );
}

// ── Node type ─────────────────────────────────────────────────────────────────

export type CompositorNodeType = Node<{ label: string }, "compositor">;

// ── CompositorNode ────────────────────────────────────────────────────────────

export default function CompositorNode({ selected }: NodeProps<CompositorNodeType>) {
  const imageUrl        = useCanvasStore((s) => s.imageUrl);
  const imageStatus     = useCanvasStore((s) => s.imageStatus);
  const composedUrl     = useCanvasStore((s) => s.composedUrl);
  const compositorStatus = useCanvasStore((s) => s.compositorStatus);
  const compositorError  = useCanvasStore((s) => s.compositorError);
  const copy            = useCanvasStore((s) => s.copy);
  const textPosition    = useCanvasStore((s) => s.textPosition);
  const logoPlacement   = useCanvasStore((s) => s.logoPlacement);
  const footerVisible   = useCanvasStore((s) => s.footerVisible);

  const selectedFont     = useCanvasStore((s) => s.selectedFont);
  const fontModalOpen    = useCanvasStore((s) => s.fontModalOpen);

  const setTextPosition  = useCanvasStore((s) => s.setTextPosition);
  const setLogoPlacement = useCanvasStore((s) => s.setLogoPlacement);
  const setFooterVisible = useCanvasStore((s) => s.setFooterVisible);
  const openFontModal    = useCanvasStore((s) => s.openFontModal);
  const composeManual    = useCanvasStore((s) => s.composeManual);

  const activePair = selectedFont ? FONT_PAIRS.find(p => p.id === selectedFont.pairId) : null;

  const isComposing = compositorStatus === "loading";
  const isImageReady = imageStatus === "done" && !!imageUrl;

  // Derive node status
  const nodeStatus =
    compositorStatus === "done"    ? "done"    :
    compositorStatus === "error"   ? "error"   :
    compositorStatus === "loading" ? "loading" :
    imageStatus === "loading"      ? "loading" :
    imageStatus === "polling"      ? "polling" :
    imageStatus === "error"        ? "error"   :
    "idle";

  // Get CSS position classes for the text overlay preview
  function getOverlayCss(pos: TextPosition): string {
    switch (pos) {
      case "top":          return "top-0 left-0 right-0 pb-1 pt-1 px-1 items-start";
      case "center":       return "top-1/2 left-0 right-0 -translate-y-1/2 px-1 items-center";
      case "bottom-left":  return "bottom-0 left-0 w-1/2 pt-1 pb-1 px-1 items-end";
      case "bottom-full":  return "bottom-0 left-0 right-0 pt-1 pb-1 px-1 items-end";
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
        width={360}
      >
        {/* Idle — no image yet */}
        {!isImageReady && imageStatus !== "loading" && imageStatus !== "polling" && (
          <IdlePlaceholder />
        )}

        {/* Loading / Polling */}
        {(imageStatus === "loading" || imageStatus === "polling") && (
          <div className="flex flex-col gap-2">
            <ShimmerBox />
            <p className="text-xs text-blue-600 text-center font-medium">
              {imageStatus === "polling"
                ? <>Processando na Freepik<AnimatedDots /></>
                : "Gerando imagem..."}
            </p>
          </div>
        )}

        {/* Image ready — full compositor UI */}
        {isImageReady && (
          <div className="flex flex-col gap-3">
            {/* Image with live CSS text preview */}
            <div className="relative rounded-lg overflow-hidden" style={{ height: 160 }}>
              <img
                src={imageUrl}
                alt="Imagem gerada"
                className="w-full h-full object-cover"
              />

              {/* Dark gradient band */}
              <div
                className={[
                  "absolute inset-0 pointer-events-none",
                  "bg-gradient-to-t from-black/60 via-transparent to-transparent",
                ].join(" ")}
              />

              {/* Text overlay preview */}
              {copy?.visual_headline && (
                <div className={["absolute flex", getOverlayCss(textPosition)].join(" ")}>
                  <p
                    className="text-white text-[11px] font-bold drop-shadow leading-tight"
                    style={{ textShadow: "0 1px 3px rgba(0,0,0,0.8)" }}
                  >
                    {copy.visual_headline}
                  </p>
                </div>
              )}
            </div>

            {/* Font pair picker */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Tipografia
              </label>
              <button
                type="button"
                onClick={openFontModal}
                disabled={isComposing}
                className={[
                  "nodrag nopan",
                  "flex items-center gap-2 w-full rounded-lg border px-3 py-2 text-xs font-medium",
                  "transition-colors duration-150",
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

            {/* Text position picker */}
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
                        "nodrag nopan",
                        "relative rounded border overflow-hidden flex flex-col items-center gap-1",
                        "py-2 px-1 transition-all duration-150",
                        isSelected
                          ? "border-violet-500 bg-violet-50"
                          : "border-slate-200 bg-white hover:border-slate-300",
                      ].join(" ")}
                    >
                      {/* Mini visual band */}
                      <div className="relative w-8 h-6 rounded bg-slate-200 overflow-hidden">
                        <div
                          className={[
                            "absolute bg-violet-400 opacity-70",
                            opt.bandCls,
                          ].join(" ")}
                        />
                      </div>
                      <span className={["text-[10px] font-medium leading-none", isSelected ? "text-violet-700" : "text-slate-500"].join(" ")}>
                        {opt.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Logo placement */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Posição do Logo
              </label>
              <div className="flex gap-1.5 flex-wrap">
                {LOGO_POS_OPTIONS.map((opt) => {
                  // Cast to match store type (subset of allowed values)
                  const storeVal = opt.value as typeof logoPlacement;
                  const isSelected = logoPlacement === storeVal;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setLogoPlacement(storeVal)}
                      className={[
                        "nodrag nopan",
                        "px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all duration-150",
                        isSelected
                          ? "border-violet-500 bg-violet-100 text-violet-700"
                          : "border-slate-200 bg-white text-slate-500 hover:border-slate-300",
                      ].join(" ")}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Footer toggle */}
            <label className="nodrag nopan flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                className="w-3.5 h-3.5 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                checked={footerVisible}
                onChange={(e) => setFooterVisible(e.target.checked)}
              />
              <span className="text-xs text-slate-600">Rodapé com handle</span>
            </label>

            {/* Compositor error */}
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
                "nodrag nopan",
                "w-full flex items-center justify-center gap-2",
                "rounded-lg px-3 py-2.5 text-sm font-semibold text-white",
                "transition-colors duration-150",
                isComposing
                  ? "bg-emerald-300 cursor-not-allowed"
                  : "bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800",
              ].join(" ")}
            >
              {isComposing ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Compondo...
                </>
              ) : (
                <>&#10003; Compor Post Final</>
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

      {/* Font pair modal — portal to escape ReactFlow stacking context */}
      {fontModalOpen && copy && (
        <FontSelectorModal
          headline={copy.visual_headline}
          onClose={() => useCanvasStore.getState().closeFontModal()}
        />
      )}
    </>
  );
}
