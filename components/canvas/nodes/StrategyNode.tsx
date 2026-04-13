"use client";

import { useState } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { Lightbulb, RefreshCw, RotateCcw, AlertCircle, Pencil } from "lucide-react";
import BaseNode from "@/components/canvas/BaseNode";
import { useCanvasStore } from "@/lib/canvas-store";
import type { StepStatus } from "@/lib/canvas-store";
import type { StrategyBriefing } from "@/types";

// ── Pilar badge color map ─────────────────────────────────────────────────────

const PILAR_COLORS: Record<string, string> = {
  "Produto":      "bg-violet-100 text-violet-700",
  "Educação":     "bg-blue-100   text-blue-700",
  "Prova Social": "bg-emerald-100 text-emerald-700",
  "Bastidores":   "bg-amber-100  text-amber-700",
  "Comunidade":   "bg-pink-100   text-pink-700",
  "Inspiração":   "bg-orange-100 text-orange-700",
  "Oferta":       "bg-red-100    text-red-700",
};

function pilarClass(pilar: string): string {
  return PILAR_COLORS[pilar] ?? "bg-slate-100 text-slate-600";
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SkeletonRows() {
  return (
    <div className="flex flex-col gap-2 py-1">
      {[72, 56, 88].map((w) => (
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
      Aguardando cliente...
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
        Tentar novamente
      </button>
    </div>
  );
}

// ── Editable field ────────────────────────────────────────────────────────────

function EditableField({
  label,
  value,
  multiline,
  onSave,
}: {
  label: string;
  value: string;
  multiline?: boolean;
  onSave: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState(value);

  function save() {
    onSave(local);
    setEditing(false);
  }

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          {label}
        </span>
        {!editing && (
          <button
            type="button"
            onClick={() => { setLocal(value); setEditing(true); }}
            className="nodrag nopan p-0.5 rounded text-slate-300 hover:text-violet-500 transition-colors"
          >
            <Pencil className="h-2.5 w-2.5" />
          </button>
        )}
      </div>
      {editing ? (
        <div className="flex flex-col gap-1">
          {multiline ? (
            <textarea
              className="nodrag nopan w-full rounded border border-violet-300 bg-white px-2 py-1 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-violet-500 resize-none"
              rows={2}
              value={local}
              onChange={e => setLocal(e.target.value)}
              autoFocus
            />
          ) : (
            <input
              className="nodrag nopan w-full rounded border border-violet-300 bg-white px-2 py-1 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-violet-500"
              value={local}
              onChange={e => setLocal(e.target.value)}
              autoFocus
              onKeyDown={e => e.key === "Enter" && save()}
            />
          )}
          <div className="flex gap-1">
            <button
              type="button"
              onClick={save}
              className="nodrag nopan px-2 py-0.5 rounded bg-violet-600 text-white text-[10px] font-medium"
            >
              Salvar
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="nodrag nopan px-2 py-0.5 rounded bg-slate-100 text-slate-500 text-[10px] font-medium"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <span className="text-sm text-slate-700 leading-snug">{value}</span>
      )}
    </div>
  );
}

// ── BriefingDisplay ───────────────────────────────────────────────────────────

function BriefingDisplay({
  briefing,
  onRegenerate,
  onEditField,
}: {
  briefing: StrategyBriefing;
  onRegenerate: () => void;
  onEditField: (field: string, value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      {/* Pilar badge */}
      <div className="flex flex-wrap gap-1.5">
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${pilarClass(briefing.pilar)}`}
        >
          {briefing.pilar}
        </span>
        {briefing.hook_type && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600">
            Hook: {briefing.hook_type}
          </span>
        )}
      </div>

      {/* Tema — editable */}
      <EditableField
        label="Tema"
        value={briefing.tema}
        onSave={v => onEditField("tema", v)}
      />

      {/* Objetivo — editable (multiline) */}
      <EditableField
        label="Objetivo"
        value={briefing.objetivo}
        multiline
        onSave={v => onEditField("objetivo", v)}
      />

      {/* Público — editable */}
      {briefing.publico_especifico && (
        <EditableField
          label="Público"
          value={briefing.publico_especifico}
          onSave={v => onEditField("publico_especifico", v)}
        />
      )}

      {/* Regenerate link */}
      <div className="flex justify-end pt-1">
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
          Regerar
        </button>
      </div>
    </div>
  );
}

// ── Node type ─────────────────────────────────────────────────────────────────

export type StrategyNodeType = Node<{ label: string }, "strategy">;

// ── StrategyNode ──────────────────────────────────────────────────────────────

export default function StrategyNode({ selected }: NodeProps<StrategyNodeType>) {
  const briefing         = useCanvasStore((s) => s.briefing);
  const strategyStatus   = useCanvasStore((s) => s.strategyStatus) as StepStatus;
  const strategyError    = useCanvasStore((s) => s.strategyError);
  const runStrategy      = useCanvasStore((s) => s.runStrategy);
  const resetStep        = useCanvasStore((s) => s.resetStep);
  const editBriefingField = useCanvasStore((s) => s.editBriefingField);

  function handleRegenerate() {
    resetStep("strategy");
    runStrategy();
  }

  return (
    <>
      {/* Input handle — left side */}
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        className="!bg-slate-400 !w-3 !h-3 !border-2 !border-white"
      />

      <BaseNode
        title="Estratégia"
        icon={<Lightbulb />}
        status={strategyStatus}
        selected={selected}
        width={280}
      >
        {strategyStatus === "idle" && <IdlePlaceholder />}

        {(strategyStatus === "loading") && <SkeletonRows />}

        {strategyStatus === "error" && (
          <ErrorState
            message={strategyError ?? "Ocorreu um erro inesperado."}
            onRetry={handleRegenerate}
          />
        )}

        {strategyStatus === "done" && briefing && (
          <BriefingDisplay
            briefing={briefing}
            onRegenerate={handleRegenerate}
            onEditField={editBriefingField}
          />
        )}
      </BaseNode>

      {/* Output handle — right side */}
      <Handle
        type="source"
        position={Position.Right}
        id="out"
        className="!bg-violet-600 !w-3 !h-3 !border-2 !border-white"
      />
    </>
  );
}
