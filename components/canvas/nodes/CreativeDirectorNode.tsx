"use client";

import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { Wand2, Link, Type, AlertCircle } from "lucide-react";
import BaseNode from "@/components/canvas/BaseNode";
import FontSelectorModal from "@/components/canvas/FontSelectorModal";
import { useCanvasStore } from "@/lib/canvas-store";

// ── Idle placeholder ──────────────────────────────────────────────────────────

function IdlePlaceholder() {
  return (
    <p className="text-sm text-slate-400 py-2 text-center leading-relaxed">
      Aguardando copy...
    </p>
  );
}

// ── Node type ─────────────────────────────────────────────────────────────────

export type CreativeDirectorNodeType = Node<{ label: string }, "creative">;

// ── CreativeDirectorNode ──────────────────────────────────────────────────────

export default function CreativeDirectorNode({ selected }: NodeProps<CreativeDirectorNodeType>) {
  const copy             = useCanvasStore((s) => s.copy);
  const copyStatus       = useCanvasStore((s) => s.copyStatus);
  const imageStatus      = useCanvasStore((s) => s.imageStatus);
  const visualPromptEdit = useCanvasStore((s) => s.visualPromptEdit);
  const referenceUrl     = useCanvasStore((s) => s.referenceUrl);
  const fontModalOpen    = useCanvasStore((s) => s.fontModalOpen);
  const selectedFont     = useCanvasStore((s) => s.selectedFont);

  const setVisualPromptEdit = useCanvasStore((s) => s.setVisualPromptEdit);
  const setReferenceUrl     = useCanvasStore((s) => s.setReferenceUrl);
  const openFontModal       = useCanvasStore((s) => s.openFontModal);
  const runImage            = useCanvasStore((s) => s.runImage);
  const resetStep           = useCanvasStore((s) => s.resetStep);

  const isGenerating = imageStatus === "loading" || imageStatus === "polling";

  function handleGenerateImage() {
    resetStep("image");
    runImage();
  }

  // Derive status for BaseNode header
  const nodeStatus =
    imageStatus === "done"    ? "done"    :
    imageStatus === "error"   ? "error"   :
    isGenerating              ? imageStatus :
    copyStatus === "done"     ? "idle"    :
    "idle";

  return (
    <>
      <Handle
        type="target"
        position={Position.Top}
        id="in"
        className="!bg-slate-400 !w-3 !h-3 !border-2 !border-white"
      />

      <BaseNode
        title="Diretor Criativo"
        icon={<Wand2 />}
        status={nodeStatus}
        selected={selected}
        width={340}
      >
        {copyStatus !== "done" ? (
          <IdlePlaceholder />
        ) : (
          <div className="flex flex-col gap-3">
            {/* DNA badges */}
            {copy && (
              <div className="flex flex-wrap gap-1.5">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-violet-100 text-violet-700">
                  <Type className="h-3 w-3" />
                  {copy.framework_used.split("_")[0].toUpperCase()}
                </span>
                {copy.hook_type && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600">
                    Hook: {copy.hook_type}
                  </span>
                )}
              </div>
            )}

            {/* Visual prompt textarea */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Prompt Visual (EN)
              </label>
              <textarea
                className={[
                  "nodrag nopan",
                  "w-full rounded-lg border border-slate-200 bg-white",
                  "px-2.5 py-2 text-xs text-slate-700 placeholder-slate-400",
                  "focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent",
                  "resize-none leading-relaxed",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                ].join(" ")}
                rows={4}
                value={visualPromptEdit}
                onChange={(e) => setVisualPromptEdit(e.target.value)}
                placeholder="Describe the visual scene in English..."
                disabled={isGenerating}
              />
            </div>

            {/* Reference URL */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                URL de Referência (opcional)
              </label>
              <div className="relative">
                <Link className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400 pointer-events-none" />
                <input
                  type="url"
                  className={[
                    "nodrag nopan",
                    "w-full rounded-lg border border-slate-200 bg-white",
                    "pl-7 pr-2.5 py-1.5 text-xs text-slate-700 placeholder-slate-400",
                    "focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
                  ].join(" ")}
                  placeholder="https://..."
                  value={referenceUrl ?? ""}
                  onChange={(e) => setReferenceUrl(e.target.value || null)}
                  disabled={isGenerating}
                />
              </div>
            </div>

            {/* Font selector */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Fonte do Headline
              </label>
              <button
                type="button"
                onClick={openFontModal}
                disabled={isGenerating}
                className={[
                  "nodrag nopan",
                  "flex items-center gap-2 w-full rounded-lg border px-3 py-2 text-xs font-medium",
                  "transition-colors duration-150",
                  isGenerating
                    ? "border-slate-200 text-slate-300 cursor-not-allowed bg-slate-50"
                    : "border-slate-200 text-slate-600 hover:border-violet-300 hover:text-violet-700 hover:bg-violet-50",
                ].join(" ")}
              >
                <Type className="h-3.5 w-3.5 flex-none" />
                {selectedFont ? (
                  <span className="flex items-center gap-1.5 flex-1">
                    <span
                      className="inline-block w-3.5 h-3.5 rounded-full border border-slate-200 flex-none"
                      style={{ backgroundColor: selectedFont.color }}
                    />
                    <span className="font-semibold">
                      {{
                        "montserrat-black":  "Montserrat Black",
                        "playfair-display":  "Playfair Display",
                        "dancing-script":    "Dancing Script",
                        "inter-medium":      "Inter Medium",
                      }[selectedFont.family]}
                    </span>
                  </span>
                ) : (
                  <span className="flex-1 text-left">Escolher Fonte</span>
                )}
              </button>
            </div>

            {/* Error message from image generation */}
            {imageStatus === "error" && (
              <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2">
                <AlertCircle className="h-3.5 w-3.5 text-red-500 flex-none mt-0.5" />
                <p className="text-xs text-red-700 leading-relaxed">
                  Erro ao gerar imagem. Verifique o prompt e tente novamente.
                </p>
              </div>
            )}

            {/* Generate image button */}
            <button
              type="button"
              onClick={handleGenerateImage}
              disabled={isGenerating || !visualPromptEdit.trim()}
              className={[
                "nodrag nopan",
                "w-full flex items-center justify-center gap-2",
                "rounded-lg px-3 py-2.5 text-sm font-semibold text-white",
                "transition-colors duration-150",
                isGenerating || !visualPromptEdit.trim()
                  ? "bg-violet-300 cursor-not-allowed"
                  : "bg-violet-600 hover:bg-violet-700 active:bg-violet-800",
              ].join(" ")}
            >
              {isGenerating ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Gerando...
                </>
              ) : (
                <>▶ Gerar Imagem</>
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

      {/* Font modal — portal overlay */}
      {fontModalOpen && copy && (
        <FontSelectorModal
          headline={copy.visual_headline}
          onClose={() => useCanvasStore.getState().closeFontModal()}
        />
      )}
    </>
  );
}
