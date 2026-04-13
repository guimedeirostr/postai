"use client";

import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { CheckCircle, Download, AlertCircle } from "lucide-react";
import BaseNode from "@/components/canvas/BaseNode";
import { useCanvasStore } from "@/lib/canvas-store";

// ── Format badge ──────────────────────────────────────────────────────────────

const FORMAT_LABELS: Record<string, string> = {
  feed:               "Feed",
  stories:            "Stories",
  reels:              "Reels",
  reels_cover:        "Reels",
  carrossel:          "Carrossel",
  carousel:           "Carrossel",
  linkedin_post:      "LinkedIn Post",
  linkedin_article:   "LinkedIn Artigo",
  linkedin_carousel:  "LinkedIn Carrossel",
};

function formatLabel(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return FORMAT_LABELS[raw.toLowerCase()] ?? raw;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function IdlePlaceholder() {
  return (
    <p className="text-sm text-slate-400 py-2 text-center leading-relaxed">
      Aguardando imagem...
    </p>
  );
}

function PostPreview({
  displayUrl,
  headline,
  captionPreview,
  format,
  approveStatus,
  onApprove,
  onReject,
}: {
  displayUrl:     string;
  headline:       string | null;
  captionPreview: string | null;
  format:         string | null;
  approveStatus:  "idle" | "loading" | "done" | "error" | "polling";
  onApprove:      () => void;
  onReject:       () => void;
}) {
  const approved = approveStatus === "done";

  return (
    <div className="flex flex-col gap-2.5">
      {/* Image preview */}
      <img
        src={displayUrl}
        alt="Post composto"
        className="w-full rounded-lg object-cover"
        style={{ height: 200 }}
      />

      {/* Headline */}
      {headline && (
        <p className="text-sm font-bold text-slate-900 leading-snug break-words">
          {headline}
        </p>
      )}

      {/* Caption preview */}
      {captionPreview && (
        <p className="text-xs text-slate-500 leading-relaxed">{captionPreview}</p>
      )}

      {/* Format + download row */}
      <div className="flex items-center justify-between gap-2">
        {format && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600">
            {format}
          </span>
        )}
        <a
          href={displayUrl}
          download
          className={[
            "nodrag nopan",
            "inline-flex items-center gap-1 text-[11px] font-medium",
            "text-slate-400 hover:text-slate-700 transition-colors duration-150",
            "ml-auto",
          ].join(" ")}
        >
          <Download className="h-3.5 w-3.5" />
          Baixar
        </a>
      </div>

      {/* Approve / reject */}
      {approved ? (
        <div className="flex items-center justify-center gap-1.5 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2">
          <CheckCircle className="h-4 w-4 text-emerald-600 flex-none" />
          <span className="text-sm font-semibold text-emerald-700">
            ✅ Post aprovado!
          </span>
        </div>
      ) : (
        <div className="flex gap-2 pt-0.5">
          {/* Approve */}
          <button
            type="button"
            onClick={onApprove}
            disabled={approveStatus === "loading"}
            className={[
              "nodrag nopan flex-1",
              "flex items-center justify-center gap-1.5",
              "rounded-lg px-3 py-2 text-sm font-semibold text-white",
              "transition-colors duration-150",
              approveStatus === "loading"
                ? "bg-emerald-300 cursor-not-allowed"
                : "bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700",
            ].join(" ")}
          >
            {approveStatus === "loading" ? "..." : "✓ Aprovar"}
          </button>

          {/* Reject */}
          <button
            type="button"
            onClick={onReject}
            disabled={approveStatus === "loading"}
            className={[
              "nodrag nopan flex-1",
              "flex items-center justify-center gap-1.5",
              "rounded-lg border-2 border-red-400 px-3 py-2 text-sm font-semibold",
              "transition-colors duration-150",
              approveStatus === "loading"
                ? "text-red-300 border-red-200 cursor-not-allowed"
                : "text-red-600 hover:bg-red-50 active:bg-red-100",
            ].join(" ")}
          >
            ✗ Rejeitar
          </button>
        </div>
      )}

      {/* Error feedback for approve */}
      {approveStatus === "error" && (
        <div className="flex items-center gap-1.5 rounded-lg bg-red-50 border border-red-200 px-3 py-1.5">
          <AlertCircle className="h-3.5 w-3.5 text-red-500 flex-none" />
          <span className="text-xs text-red-700">Erro ao aprovar. Tente novamente.</span>
        </div>
      )}
    </div>
  );
}

// ── Node type ─────────────────────────────────────────────────────────────────

export type ComposedNodeType = Node<{ label: string }, "composed">;

// ── ComposedNode ──────────────────────────────────────────────────────────────

export default function ComposedNode({ selected }: NodeProps<ComposedNodeType>) {
  const composedUrl   = useCanvasStore((s) => s.composedUrl);
  const imageUrl      = useCanvasStore((s) => s.imageUrl);
  const copy          = useCanvasStore((s) => s.copy);
  const briefing      = useCanvasStore((s) => s.briefing);
  const approveStatus = useCanvasStore((s) => s.approveStatus);
  const approvePost   = useCanvasStore((s) => s.approvePost);
  const rejectPost    = useCanvasStore((s) => s.rejectPost);

  const displayUrl = composedUrl ?? imageUrl;

  // Derive node-level status for the BaseNode bar
  const nodeStatus =
    approveStatus === "done"    ? "done"    :
    approveStatus === "loading" ? "loading" :
    approveStatus === "error"   ? "error"   :
    displayUrl                  ? "idle"    :
    "idle";

  const captionPreview = copy?.caption
    ? copy.caption.length > 80
      ? copy.caption.slice(0, 80) + "..."
      : copy.caption
    : null;

  const format = briefing?.formato_sugerido
    ? formatLabel(briefing.formato_sugerido)
    : null;

  return (
    <>
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        className="!bg-slate-400 !w-3 !h-3 !border-2 !border-white"
      />

      <BaseNode
        title="Post Final"
        icon={<CheckCircle />}
        status={nodeStatus}
        selected={selected}
        width={300}
      >
        {!displayUrl ? (
          <IdlePlaceholder />
        ) : (
          <PostPreview
            displayUrl={displayUrl}
            headline={copy?.visual_headline ?? null}
            captionPreview={captionPreview}
            format={format}
            approveStatus={approveStatus}
            onApprove={approvePost}
            onReject={rejectPost}
          />
        )}
      </BaseNode>
    </>
  );
}
