"use client";

import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { CheckCircle, Download, AlertCircle } from "lucide-react";
import BaseNode from "@/components/canvas/BaseNode";
import { useCanvasStore } from "@/lib/canvas-store";

// ── Idle placeholder ──────────────────────────────────────────────────────────

function IdlePlaceholder() {
  return (
    <p className="text-sm text-slate-400 py-2 text-center leading-relaxed">
      Aguardando compositor...
    </p>
  );
}

// ── Node type ─────────────────────────────────────────────────────────────────

export type PostFinalNodeType = Node<{ label: string }, "postfinal">;

// ── PostFinalNode ─────────────────────────────────────────────────────────────

export default function PostFinalNode({ selected }: NodeProps<PostFinalNodeType>) {
  const composedUrl    = useCanvasStore((s) => s.composedUrl);
  const compositorStatus = useCanvasStore((s) => s.compositorStatus);
  const copy           = useCanvasStore((s) => s.copy);
  const approveStatus  = useCanvasStore((s) => s.approveStatus);
  const approvePost    = useCanvasStore((s) => s.approvePost);
  const rejectPost     = useCanvasStore((s) => s.rejectPost);

  const hasImage = !!composedUrl;
  const approved = approveStatus === "done";

  // Derive node status
  const nodeStatus =
    approved                         ? "done"    :
    approveStatus === "loading"      ? "loading" :
    approveStatus === "error"        ? "error"   :
    compositorStatus === "loading"   ? "loading" :
    compositorStatus === "error"     ? "error"   :
    hasImage                         ? "idle"    :
    "idle";

  const captionPreview = copy?.caption
    ? copy.caption.length > 80
      ? copy.caption.slice(0, 80) + "..."
      : copy.caption
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
        {!hasImage ? (
          <IdlePlaceholder />
        ) : (
          <div className="flex flex-col gap-2.5">
            {/* Composed image */}
            <img
              src={composedUrl!}
              alt="Post composto"
              className="w-full rounded-lg object-cover"
              style={{ height: 200 }}
            />

            {/* Visual headline */}
            {copy?.visual_headline && (
              <p className="text-sm font-bold text-slate-900 leading-snug break-words">
                {copy.visual_headline}
              </p>
            )}

            {/* Caption preview */}
            {captionPreview && (
              <p className="text-xs text-slate-500 leading-relaxed">{captionPreview}</p>
            )}

            {/* Download row */}
            <div className="flex justify-end">
              <a
                href={composedUrl!}
                download
                className={[
                  "nodrag nopan",
                  "inline-flex items-center gap-1 text-[11px] font-medium",
                  "text-slate-400 hover:text-slate-700 transition-colors duration-150",
                ].join(" ")}
              >
                <Download className="h-3.5 w-3.5" />
                Baixar
              </a>
            </div>

            {/* Approve / Reject */}
            {approved ? (
              <div className="flex items-center justify-center gap-1.5 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2">
                <CheckCircle className="h-4 w-4 text-emerald-600 flex-none" />
                <span className="text-sm font-semibold text-emerald-700">Post aprovado!</span>
              </div>
            ) : (
              <div className="flex gap-2 pt-0.5">
                <button
                  type="button"
                  onClick={approvePost}
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

                <button
                  type="button"
                  onClick={rejectPost}
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

            {/* Approve error */}
            {approveStatus === "error" && (
              <div className="flex items-center gap-1.5 rounded-lg bg-red-50 border border-red-200 px-3 py-1.5">
                <AlertCircle className="h-3.5 w-3.5 text-red-500 flex-none" />
                <span className="text-xs text-red-700">Erro ao aprovar. Tente novamente.</span>
              </div>
            )}
          </div>
        )}
      </BaseNode>
    </>
  );
}
