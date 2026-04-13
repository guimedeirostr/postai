"use client";

import { useState } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { FileText, RotateCcw, RefreshCw, Copy, Check, AlertCircle, Pencil } from "lucide-react";
import BaseNode from "@/components/canvas/BaseNode";
import { useCanvasStore } from "@/lib/canvas-store";
import type { CopyData } from "@/lib/canvas-store";

// ── Framework badge colors ─────────────────────────────────────────────────────

const FRAMEWORK_COLORS: Record<string, string> = {
  PASTOR: "bg-violet-100 text-violet-700",
  AIDA:   "bg-blue-100   text-blue-700",
  PAS:    "bg-amber-100  text-amber-700",
  PPPP:   "bg-emerald-100 text-emerald-700",
};

function frameworkClass(fw: string): string {
  const key = fw.split("_")[0].toUpperCase();
  return FRAMEWORK_COLORS[key] ?? "bg-slate-100 text-slate-600";
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SkeletonRows() {
  return (
    <div className="flex flex-col gap-2.5 py-1">
      {[88, 64, 80, 48].map((w) => (
        <div
          key={w}
          className="h-3 rounded bg-slate-200 animate-pulse"
          style={{ width: `${w}%` }}
        />
      ))}
    </div>
  );
}

function IdlePlaceholder() {
  return (
    <p className="text-sm text-slate-400 py-2 text-center leading-relaxed">
      Aguardando estratégia...
    </p>
  );
}

function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2">
        <AlertCircle className="h-4 w-4 text-red-500 flex-none mt-0.5" />
        <p className="text-xs text-red-700 leading-relaxed">{message}</p>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className={[
          "nodrag nopan",
          "flex items-center justify-center gap-1.5",
          "rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium",
          "text-red-600 hover:bg-red-50 transition-colors duration-150",
        ].join(" ")}
      >
        <RotateCcw className="h-3 w-3" />
        ↺ Tentar Novamente
      </button>
    </div>
  );
}

function CopyClipboardButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // silently ignore clipboard errors
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      title="Copiar headline"
      className={[
        "nodrag nopan",
        "flex-none p-1 rounded transition-colors duration-150",
        copied
          ? "text-emerald-600"
          : "text-slate-400 hover:text-slate-600",
      ].join(" ")}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

function CopyDisplay({
  copy,
  onRegenerate,
  onEditCaption,
}: {
  copy: CopyData;
  onRegenerate: () => void;
  onEditCaption: (caption: string) => void;
}) {
  const [editingCaption, setEditingCaption] = useState(false);
  const [localCaption, setLocalCaption] = useState(copy.caption);

  const captionPreview =
    !editingCaption && copy.caption.length > 150
      ? copy.caption.slice(0, 150) + "..."
      : copy.caption;

  const frameworkKey = copy.framework_used.split("_")[0].toUpperCase();

  function saveCaption() {
    onEditCaption(localCaption);
    setEditingCaption(false);
  }

  return (
    <div className="flex flex-col gap-2.5">
      {/* Visual headline */}
      <div className="flex items-start gap-1.5">
        <p
          className={[
            "flex-1 text-base font-bold text-violet-700 leading-tight",
            "line-clamp-2 break-words",
          ].join(" ")}
        >
          {copy.visual_headline}
        </p>
        <CopyClipboardButton text={copy.visual_headline} />
      </div>

      {/* Framework + Hook badges */}
      <div className="flex flex-wrap gap-1.5">
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${frameworkClass(copy.framework_used)}`}
        >
          {frameworkKey}
        </span>
        {copy.hook_type && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600">
            Hook: {copy.hook_type}
          </span>
        )}
      </div>

      {/* Caption — editable */}
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Caption
          </span>
          {!editingCaption && (
            <button
              type="button"
              onClick={() => { setLocalCaption(copy.caption); setEditingCaption(true); }}
              className="nodrag nopan p-0.5 rounded text-slate-300 hover:text-violet-500 transition-colors"
            >
              <Pencil className="h-2.5 w-2.5" />
            </button>
          )}
        </div>

        {editingCaption ? (
          <div className="flex flex-col gap-1">
            <textarea
              className="nodrag nopan w-full rounded border border-violet-300 bg-white px-2 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-violet-500 resize-none leading-relaxed"
              rows={5}
              value={localCaption}
              onChange={e => setLocalCaption(e.target.value)}
              autoFocus
            />
            <div className="flex gap-1">
              <button
                type="button"
                onClick={saveCaption}
                className="nodrag nopan px-2 py-0.5 rounded bg-violet-600 text-white text-[10px] font-medium"
              >
                Salvar
              </button>
              <button
                type="button"
                onClick={() => setEditingCaption(false)}
                className="nodrag nopan px-2 py-0.5 rounded bg-slate-100 text-slate-500 text-[10px] font-medium"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-600 leading-snug">{captionPreview}</p>
        )}
      </div>

      {/* Hashtags count */}
      <p className="text-[11px] text-slate-400">
        {copy.hashtags.length} hashtags geradas
      </p>

      {/* Regenerate */}
      <div className="flex justify-end pt-0.5">
        <button
          type="button"
          onClick={onRegenerate}
          className={[
            "nodrag nopan",
            "inline-flex items-center gap-1 text-[11px] font-medium",
            "text-slate-400 hover:text-violet-600 transition-colors duration-150",
          ].join(" ")}
        >
          <RefreshCw className="h-3 w-3" />
          ↺ Regerar Copy
        </button>
      </div>
    </div>
  );
}

// ── Node type ─────────────────────────────────────────────────────────────────

export type CopyNodeType = Node<{ label: string }, "copy">;

// ── CopyNode ──────────────────────────────────────────────────────────────────

export default function CopyNode({ selected }: NodeProps<CopyNodeType>) {
  const copy        = useCanvasStore((s) => s.copy);
  const copyStatus  = useCanvasStore((s) => s.copyStatus);
  const copyError   = useCanvasStore((s) => s.copyError);
  const runCopy     = useCanvasStore((s) => s.runCopy);
  const resetStep   = useCanvasStore((s) => s.resetStep);
  const editCaption = useCanvasStore((s) => s.editCaption);

  function handleRegenerate() {
    resetStep("copy");
    runCopy();
  }

  function handleRetry() {
    resetStep("copy");
    runCopy();
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
        title="Copy & Texto"
        icon={<FileText />}
        status={copyStatus}
        selected={selected}
        width={300}
      >
        {copyStatus === "idle" && <IdlePlaceholder />}

        {copyStatus === "loading" && <SkeletonRows />}

        {copyStatus === "error" && (
          <ErrorState
            message={copyError ?? "Ocorreu um erro inesperado."}
            onRetry={handleRetry}
          />
        )}

        {copyStatus === "done" && copy && (
          <CopyDisplay
            copy={copy}
            onRegenerate={handleRegenerate}
            onEditCaption={editCaption}
          />
        )}
      </BaseNode>

      <Handle
        type="source"
        position={Position.Right}
        id="out"
        className="!bg-violet-600 !w-3 !h-3 !border-2 !border-white"
      />
    </>
  );
}
