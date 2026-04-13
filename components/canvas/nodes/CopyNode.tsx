"use client";

import { useState, useRef, useEffect } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { FileText, RotateCcw, RefreshCw, Copy, Check, AlertCircle, Pencil } from "lucide-react";
import BaseNode from "@/components/canvas/BaseNode";
import { useCanvasStore } from "@/lib/canvas-store";
import type { CopyData } from "@/lib/canvas-store";

// ── Hook type suggestions ──────────────────────────────────────────────────────

const HOOK_SUGGESTIONS = [
  "Dor", "Desejo", "Curiosidade", "Pergunta", "Número",
  "Afirmação Ousada", "Relatable", "Ironia", "Escassez", "Contraste",
];

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
  onEditHookType,
  onEditVisualHeadline,
}: {
  copy: CopyData;
  onRegenerate: () => void;
  onEditCaption: (caption: string) => void;
  onEditHookType: (hookType: string) => void;
  onEditVisualHeadline: (headline: string) => void;
}) {
  const [editingCaption,  setEditingCaption]  = useState(false);
  const [localCaption,    setLocalCaption]    = useState(copy.caption);
  const [editingHook,     setEditingHook]     = useState(false);
  const [localHook,       setLocalHook]       = useState(copy.hook_type ?? "");
  const [editingHeadline, setEditingHeadline] = useState(false);
  const [localHeadline,   setLocalHeadline]   = useState(copy.visual_headline);
  const hookInputRef     = useRef<HTMLInputElement>(null);
  const headlineInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingHook) hookInputRef.current?.focus();
  }, [editingHook]);

  useEffect(() => {
    if (editingHeadline) headlineInputRef.current?.focus();
  }, [editingHeadline]);

  const wordCount = localHeadline.trim().split(/\s+/).filter(Boolean).length;

  const captionPreview =
    !editingCaption && copy.caption.length > 150
      ? copy.caption.slice(0, 150) + "..."
      : copy.caption;

  const frameworkKey = copy.framework_used.split("_")[0].toUpperCase();

  function saveCaption() {
    onEditCaption(localCaption);
    setEditingCaption(false);
  }

  function saveHook() {
    if (localHook.trim()) onEditHookType(localHook.trim());
    setEditingHook(false);
  }

  function saveHeadline() {
    if (localHeadline.trim()) onEditVisualHeadline(localHeadline);
    setEditingHeadline(false);
  }

  return (
    <div className="flex flex-col gap-2.5">
      {/* Visual headline — editable */}
      {!editingHeadline ? (
        <div className="group flex items-start gap-1.5">
          <div className="flex-1 flex flex-col gap-0.5">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              Headline da Arte
            </span>
            <p className="text-base font-bold text-violet-700 leading-tight line-clamp-2 break-words">
              {copy.visual_headline}
            </p>
          </div>
          <div className="flex items-center gap-0.5 mt-4">
            <button
              type="button"
              onClick={() => { setLocalHeadline(copy.visual_headline); setEditingHeadline(true); }}
              className="nodrag nopan p-1 rounded text-slate-300 hover:text-violet-500 transition-colors"
              title="Editar texto da arte (máx 6 palavras)"
            >
              <Pencil className="h-3 w-3" />
            </button>
            <CopyClipboardButton text={copy.visual_headline} />
          </div>
        </div>
      ) : (
        <div className="nodrag nopan flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Headline da Arte</span>
            <span className={["text-[10px] font-medium", wordCount > 6 ? "text-red-500" : "text-slate-400"].join(" ")}>
              {wordCount}/6 palavras
            </span>
          </div>
          <input
            ref={headlineInputRef}
            type="text"
            value={localHeadline}
            onChange={e => setLocalHeadline(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") saveHeadline(); if (e.key === "Escape") setEditingHeadline(false); }}
            className="w-full rounded border border-violet-300 bg-white px-2 py-1 text-sm font-bold text-violet-700 focus:outline-none focus:ring-1 focus:ring-violet-500"
          />
          {wordCount > 6 && (
            <p className="text-[10px] text-amber-600">⚠ Máx 6 palavras — será cortado ao salvar</p>
          )}
          <div className="flex gap-1">
            <button type="button" onClick={saveHeadline} className="px-2 py-0.5 rounded bg-violet-600 text-white text-[10px] font-medium">Salvar</button>
            <button type="button" onClick={() => setEditingHeadline(false)} className="px-2 py-0.5 rounded bg-slate-100 text-slate-500 text-[10px] font-medium">Cancelar</button>
          </div>
        </div>
      )}

      {/* Framework badge + Hook editable badge */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${frameworkClass(copy.framework_used)}`}
        >
          {frameworkKey}
        </span>

        {/* Hook — editable */}
        {!editingHook ? (
          <button
            type="button"
            onClick={() => { setLocalHook(copy.hook_type ?? ""); setEditingHook(true); }}
            className="nodrag nopan group inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600 hover:bg-violet-50 hover:text-violet-700 transition-colors"
            title="Clique para editar o hook type"
          >
            Hook: {copy.hook_type || "—"}
            <Pencil className="h-2.5 w-2.5 opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>
        ) : (
          <div className="nodrag nopan flex flex-col gap-1 w-full mt-0.5">
            <div className="flex items-center gap-1">
              <input
                ref={hookInputRef}
                type="text"
                value={localHook}
                onChange={e => setLocalHook(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") saveHook(); if (e.key === "Escape") setEditingHook(false); }}
                placeholder="ex: Dor, Curiosidade..."
                className="flex-1 rounded border border-violet-300 bg-white px-2 py-0.5 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-violet-500 min-w-0"
              />
              <button type="button" onClick={saveHook}       className="px-1.5 py-0.5 rounded bg-violet-600 text-white text-[10px] font-medium">OK</button>
              <button type="button" onClick={() => setEditingHook(false)} className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 text-[10px] font-medium">✕</button>
            </div>
            {/* Quick suggestions */}
            <div className="flex flex-wrap gap-1">
              {HOOK_SUGGESTIONS.map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => { onEditHookType(s); setEditingHook(false); }}
                  className="nodrag nopan px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 text-[10px] hover:bg-violet-100 hover:text-violet-700 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
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
  const copy               = useCanvasStore((s) => s.copy);
  const copyStatus         = useCanvasStore((s) => s.copyStatus);
  const copyError          = useCanvasStore((s) => s.copyError);
  const runCopy            = useCanvasStore((s) => s.runCopy);
  const resetStep          = useCanvasStore((s) => s.resetStep);
  const editCaption        = useCanvasStore((s) => s.editCaption);
  const editHookType       = useCanvasStore((s) => s.editHookType);
  const editVisualHeadline = useCanvasStore((s) => s.editVisualHeadline);

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
            onEditHookType={editHookType}
            onEditVisualHeadline={editVisualHeadline}
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
