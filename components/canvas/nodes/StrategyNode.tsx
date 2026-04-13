"use client";

import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { Lightbulb, RefreshCw, RotateCcw, AlertCircle } from "lucide-react";
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

function BriefingDisplay({
  briefing,
  onRegenerate,
}: {
  briefing: StrategyBriefing;
  onRegenerate: () => void;
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

      {/* Tema */}
      <div className="flex flex-col gap-0.5">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          Tema
        </span>
        <span className="text-sm font-medium text-slate-900 leading-snug">
          {briefing.tema}
        </span>
      </div>

      {/* Objetivo */}
      <div className="flex flex-col gap-0.5">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          Objetivo
        </span>
        <span className="text-sm text-slate-600 leading-snug">
          {briefing.objetivo}
        </span>
      </div>

      {/* Público específico */}
      {briefing.publico_especifico && (
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Público
          </span>
          <span className="text-xs text-slate-500 leading-snug">
            {briefing.publico_especifico}
          </span>
        </div>
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
  const briefing       = useCanvasStore((s) => s.briefing);
  const strategyStatus = useCanvasStore((s) => s.strategyStatus) as StepStatus;
  const strategyError  = useCanvasStore((s) => s.strategyError);
  const runStrategy    = useCanvasStore((s) => s.runStrategy);
  const resetStep      = useCanvasStore((s) => s.resetStep);

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
          <BriefingDisplay briefing={briefing} onRegenerate={handleRegenerate} />
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
