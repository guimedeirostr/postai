"use client";

import { useEffect, useState } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { ImageIcon, RotateCcw, RefreshCw, AlertCircle, ExternalLink, Scissors, Download } from "lucide-react";
import BaseNode from "@/components/canvas/BaseNode";
import { useCanvasStore } from "@/lib/canvas-store";
import type { StepStatus } from "@/lib/canvas-store";

// ── Provider display label ─────────────────────────────────────────────────────

function providerLabel(raw: string | null): string {
  if (!raw) return "Desconhecido";
  const lower = raw.toLowerCase();
  if (lower.includes("fal"))     return "FAL.ai";
  if (lower.includes("freepik")) return "Freepik";
  if (lower.includes("imagen"))  return "Imagen 4";
  return raw;
}

// ── Quality score bar ─────────────────────────────────────────────────────────

function QualityBar({ score }: { score: number }) {
  const color =
    score >= 70 ? "bg-emerald-500" :
    score >= 50 ? "bg-amber-400"   :
    "bg-red-500";

  const textColor =
    score >= 70 ? "text-emerald-700" :
    score >= 50 ? "text-amber-700"   :
    "text-red-700";

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${Math.min(score, 100)}%` }}
        />
      </div>
      <span className={`text-[11px] font-semibold tabular-nums ${textColor}`}>
        {score}
      </span>
    </div>
  );
}

// ── Animated polling dots ─────────────────────────────────────────────────────

function AnimatedDots() {
  const [count, setCount] = useState(1);

  useEffect(() => {
    const id = setInterval(() => setCount((c) => (c % 3) + 1), 500);
    return () => clearInterval(id);
  }, []);

  return <span>{".".repeat(count)}</span>;
}

// ── Shimmer placeholder box ───────────────────────────────────────────────────

function ShimmerBox() {
  return (
    <div className="w-full rounded-lg bg-slate-200 animate-pulse" style={{ height: 160 }} />
  );
}

// ── Idle placeholder ──────────────────────────────────────────────────────────

function IdlePlaceholder() {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-slate-400 text-center leading-relaxed">
        Aguardando copy...
      </p>
      <div
        className={[
          "w-full rounded-lg border-2 border-dashed border-slate-200",
          "flex items-center justify-center text-slate-300",
        ].join(" ")}
        style={{ height: 160 }}
      >
        <ImageIcon className="h-8 w-8" />
      </div>
    </div>
  );
}

// ── Loading state ─────────────────────────────────────────────────────────────

function LoadingState() {
  return (
    <div className="flex flex-col gap-2">
      <ShimmerBox />
      <p className="text-xs text-slate-500 text-center">Gerando imagem...</p>
    </div>
  );
}

// ── Polling state ─────────────────────────────────────────────────────────────

function PollingState() {
  return (
    <div className="flex flex-col gap-2">
      <ShimmerBox />
      <p className="text-xs text-blue-600 text-center font-medium">
        Processando na Freepik<AnimatedDots />
      </p>
    </div>
  );
}

// ── Error state ───────────────────────────────────────────────────────────────

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

// ── Remove Background button ──────────────────────────────────────────────────

function RemoveBgSection({
  status,
  error,
  transparentUrl,
  onRemove,
}: {
  status:         StepStatus;
  error:          string | null;
  transparentUrl: string | null;
  onRemove:       () => void;
}) {
  if (status === "done" && transparentUrl) {
    return (
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-600">
            Fundo removido
          </span>
        </div>
        {/* Checkerboard preview = transparency */}
        <div
          className="w-full rounded-lg overflow-hidden"
          style={{
            backgroundImage:
              "repeating-conic-gradient(#e2e8f0 0% 25%, white 0% 50%) 0 0 / 12px 12px",
            height: 80,
          }}
        >
          <img
            src={transparentUrl}
            alt="Sem fundo"
            className="w-full h-full object-contain"
          />
        </div>
        <a
          href={transparentUrl}
          download
          className="nodrag nopan inline-flex items-center justify-center gap-1 text-[11px] font-medium text-emerald-600 hover:text-emerald-800 transition-colors"
        >
          <Download className="h-3 w-3" />
          Baixar PNG Transparente
        </a>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex flex-col gap-1">
        <p className="text-[11px] text-red-600">{error ?? "Erro ao remover fundo"}</p>
        <button
          type="button"
          onClick={onRemove}
          className="nodrag nopan inline-flex items-center gap-1 text-[11px] font-medium text-red-500 hover:text-red-700 transition-colors"
        >
          <RotateCcw className="h-3 w-3" />
          Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onRemove}
      disabled={status === "loading"}
      className={[
        "nodrag nopan w-full",
        "inline-flex items-center justify-center gap-1.5 text-[11px] font-medium",
        "rounded-lg border border-violet-200 px-2 py-1.5 transition-colors duration-150",
        status === "loading"
          ? "text-violet-300 border-violet-100 cursor-not-allowed"
          : "text-violet-600 hover:bg-violet-50 hover:border-violet-300",
      ].join(" ")}
    >
      <Scissors className="h-3 w-3" />
      {status === "loading" ? "Removendo fundo..." : "✂ Remover Fundo (PNG)"}
    </button>
  );
}

// ── Done state ────────────────────────────────────────────────────────────────

function DoneState({
  imageUrl,
  composedUrl,
  imageProvider,
  qualityScore,
  transparentUrl,
  removeBgStatus,
  removeBgError,
  onRegenerate,
  onVariation,
  onRemoveBg,
}: {
  imageUrl:       string | null;
  composedUrl:    string | null;
  imageProvider:  string | null;
  qualityScore:   number | null;
  transparentUrl: string | null;
  removeBgStatus: StepStatus;
  removeBgError:  string | null;
  onRegenerate:   () => void;
  onVariation:    () => void;
  onRemoveBg:     () => void;
}) {
  const displayUrl = composedUrl ?? imageUrl;

  return (
    <div className="flex flex-col gap-2.5">
      {/* Image */}
      {displayUrl && (
        <a
          href={displayUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="nodrag nopan block relative group"
        >
          <img
            src={displayUrl}
            alt="Imagem gerada"
            className={[
              "w-full rounded-lg object-cover",
              "cursor-pointer transition-opacity duration-150 group-hover:opacity-90",
            ].join(" ")}
            style={{ maxHeight: 200 }}
          />
          <span className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 rounded p-1">
            <ExternalLink className="h-3 w-3 text-white" />
          </span>
        </a>
      )}

      {/* Provider badge */}
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600">
          {providerLabel(imageProvider)}
        </span>
      </div>

      {/* Quality score */}
      {qualityScore !== null && (
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Qualidade
          </span>
          <QualityBar score={qualityScore} />
        </div>
      )}

      {/* Remove background */}
      {displayUrl && (
        <RemoveBgSection
          status={removeBgStatus}
          error={removeBgError}
          transparentUrl={transparentUrl}
          onRemove={onRemoveBg}
        />
      )}

      {/* Separator */}
      <div className="h-px bg-slate-100" />

      {/* Action buttons */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onRegenerate}
          className={[
            "nodrag nopan flex-1",
            "inline-flex items-center justify-center gap-1 text-[11px] font-medium",
            "rounded-lg border border-slate-200 px-2 py-1.5",
            "text-slate-500 hover:text-slate-700 hover:border-slate-300 transition-colors duration-150",
          ].join(" ")}
        >
          <RefreshCw className="h-3 w-3" />
          Regerar
        </button>
        <button
          type="button"
          onClick={onVariation}
          className={[
            "nodrag nopan flex-1",
            "inline-flex items-center justify-center gap-1 text-[11px] font-medium",
            "rounded-lg border border-slate-200 px-2 py-1.5",
            "text-slate-500 hover:text-slate-700 hover:border-slate-300 transition-colors duration-150",
          ].join(" ")}
        >
          Variação
        </button>
      </div>
    </div>
  );
}

// ── Node type ─────────────────────────────────────────────────────────────────

export type ImageNodeType = Node<{ label: string }, "image">;

// ── ImageNode ─────────────────────────────────────────────────────────────────

export default function ImageNode({ selected }: NodeProps<ImageNodeType>) {
  const imageUrl        = useCanvasStore((s) => s.imageUrl);
  const composedUrl     = useCanvasStore((s) => s.composedUrl);
  const imageStatus     = useCanvasStore((s) => s.imageStatus);
  const imageError      = useCanvasStore((s) => s.imageError);
  const imageProvider   = useCanvasStore((s) => s.imageProvider);
  const qualityScore    = useCanvasStore((s) => s.qualityScore);
  const transparentUrl  = useCanvasStore((s) => s.transparentUrl);
  const removeBgStatus  = useCanvasStore((s) => s.removeBgStatus);
  const removeBgError   = useCanvasStore((s) => s.removeBgError);
  const runImage        = useCanvasStore((s) => s.runImage);
  const resetStep       = useCanvasStore((s) => s.resetStep);
  const removeBgAction  = useCanvasStore((s) => s.removeBackground);

  function handleRetry() {
    resetStep("image");
    runImage();
  }

  function handleRegenerate() {
    resetStep("image");
    runImage();
  }

  function handleVariation() {
    runImage();
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
        title="Imagem Gerada"
        icon={<ImageIcon />}
        status={imageStatus}
        selected={selected}
        width={320}
      >
        {imageStatus === "idle" && <IdlePlaceholder />}

        {imageStatus === "loading" && <LoadingState />}

        {imageStatus === "polling" && <PollingState />}

        {imageStatus === "error" && (
          <ErrorState
            message={imageError ?? "Ocorreu um erro inesperado."}
            onRetry={handleRetry}
          />
        )}

        {imageStatus === "done" && (
          <DoneState
            imageUrl={imageUrl}
            composedUrl={composedUrl}
            imageProvider={imageProvider}
            qualityScore={qualityScore}
            transparentUrl={transparentUrl}
            removeBgStatus={removeBgStatus}
            removeBgError={removeBgError}
            onRegenerate={handleRegenerate}
            onVariation={handleVariation}
            onRemoveBg={removeBgAction}
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
