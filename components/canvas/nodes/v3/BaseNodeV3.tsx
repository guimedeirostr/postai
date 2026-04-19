"use client";

import { Handle, Position, NodeProps } from "@xyflow/react";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { NodeHeader } from "./NodeHeader";
import type { PhaseId, PhaseStatus } from "@/types";

export type NodeStatus = "idle" | "loading" | "done" | "error";

interface BaseNodeV3Props {
  children: React.ReactNode;
  label: string;
  icon: React.ReactNode;
  status?: NodeStatus;
  accentColor?: string;
  hasInput?: boolean;
  hasOutput?: boolean;
  width?: number;
  selected?: NodeProps["selected"];
  // Phase state machine props (V3 execution modes)
  phaseId?: PhaseId;
  phaseStatus?: PhaseStatus;
  onRunToHere?: () => void;
  onRegenerate?: () => void;
  onReset?: () => void;
  onApprove?: () => void;
}

export default function BaseNodeV3({
  children, label, icon, status = "idle",
  accentColor = "#a855f7",
  hasInput = true, hasOutput = true,
  width = 280, selected,
  phaseId, phaseStatus,
  onRunToHere, onRegenerate, onReset, onApprove,
}: BaseNodeV3Props) {
  const usePhaseHeader = phaseId !== undefined && phaseStatus !== undefined;

  return (
    <div
      className={cn(
        "relative rounded-2xl border shadow-lg backdrop-blur-sm transition-all duration-200",
        "bg-slate-900/90 border-slate-700/60",
        selected && "ring-2 ring-violet-500/60",
        phaseStatus === 'stale' && "border-amber-500/40",
        phaseStatus === 'error' && "border-red-500/40",
        phaseStatus === 'done'  && "border-emerald-500/30",
      )}
      style={{ width, boxShadow: selected ? `0 0 0 2px ${accentColor}40` : undefined }}
    >
      {/* Glassmorphism highlight */}
      <div className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
      </div>

      {/* Header */}
      {usePhaseHeader ? (
        <NodeHeader
          phaseId={phaseId}
          status={phaseStatus}
          onRunToHere={onRunToHere ?? (() => {})}
          onRegenerate={onRegenerate ?? (() => {})}
          onReset={onReset ?? (() => {})}
          onApprove={onApprove ?? (() => {})}
          label={label}
          icon={icon}
          accentColor={accentColor}
        />
      ) : (
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-slate-700/50">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center flex-none"
            style={{ backgroundColor: `${accentColor}25`, color: accentColor }}
          >
            {icon}
          </div>
          <span className="text-sm font-semibold text-slate-200 flex-1 truncate">{label}</span>
          {status === "loading" && <Loader2 className="w-4 h-4 text-violet-400 animate-spin flex-none" />}
          {status === "done"    && <CheckCircle2 className="w-4 h-4 text-green-400 flex-none" />}
          {status === "error"   && <XCircle className="w-4 h-4 text-red-400 flex-none" />}
        </div>
      )}

      {/* Body */}
      <div className="p-4 space-y-3">{children}</div>

      {/* Handles */}
      {hasInput && (
        <Handle
          type="target"
          position={Position.Left}
          className="!w-3 !h-3 !rounded-full !border-2"
          style={{ backgroundColor: accentColor, borderColor: "#1e293b" }}
        />
      )}
      {hasOutput && (
        <Handle
          type="source"
          position={Position.Right}
          className="!w-3 !h-3 !rounded-full !border-2"
          style={{ backgroundColor: accentColor, borderColor: "#1e293b" }}
        />
      )}
    </div>
  );
}
