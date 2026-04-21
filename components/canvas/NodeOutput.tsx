"use client";

import { useState, useMemo } from "react";
import { ChevronDown, ChevronUp, RefreshCw } from "lucide-react";
import { useCanvasStore } from "@/lib/canvas/store";
import { BriefingOutput } from "./outputs/BriefingOutput";
import { PlanOutput }     from "./outputs/PlanOutput";
import { CopyOutput }     from "./outputs/CopyOutput";
import { ImageOutput }    from "./outputs/ImageOutput";
import { CriticOutput }   from "./outputs/CriticOutput";
import type { PhaseId } from "@/types";

const PLAY_PER_NODE = process.env.NEXT_PUBLIC_CANVAS_V4_PLAY_PER_NODE === "true";

interface NodeOutputProps {
  phaseId: PhaseId;
  onRegenerate: () => void;
}

function OutputBody({ phaseId, output }: { phaseId: PhaseId; output: Record<string, unknown> }) {
  switch (phaseId) {
    case "briefing":  return <BriefingOutput output={output} />;
    case "plano":     return <PlanOutput     output={output} />;
    case "copy":      return <CopyOutput     output={output} />;
    case "image":     return <ImageOutput    output={output} />;
    case "critico":   return <CriticOutput   output={output} />;
    default:          return null;
  }
}

export function NodeOutput({ phaseId, onRegenerate }: NodeOutputProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [confirmRegen, setConfirmRegen] = useState(false);

  const phases = useCanvasStore(s => s.phases);
  const phase  = phases[phaseId];

  if (phase?.status !== "done" || !phase.output) return null;

  // Guard: only render known phases (avoid showing empty boxes for passthrough phases)
  const knownPhases: PhaseId[] = ["briefing", "plano", "copy", "image", "critico"];
  if (!knownPhases.includes(phaseId)) return null;

  const output = phase.output as Record<string, unknown>;

  return (
    <div className="border-t border-pi-border/20 pt-2.5 space-y-2">
      {/* Collapse toggle */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setCollapsed(v => !v)}
          className="flex items-center gap-1 text-[10px] text-pi-text-muted/60 hover:text-pi-text-muted transition-colors"
        >
          {collapsed
            ? <><ChevronDown className="w-3 h-3" /> ver resultado</>
            : <><ChevronUp   className="w-3 h-3" /> resultado</>}
        </button>

        {/* Regenerate button — only when feature flag is on */}
        {PLAY_PER_NODE && !collapsed && (
          <div className="flex items-center gap-1">
            {confirmRegen ? (
              <>
                <span className="text-[10px] text-amber-400">Regerar?</span>
                <button
                  onClick={() => { setConfirmRegen(false); onRegenerate(); }}
                  className="text-[10px] text-amber-400 hover:text-amber-300 font-medium px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/25 transition-colors"
                >
                  Sim
                </button>
                <button
                  onClick={() => setConfirmRegen(false)}
                  className="text-[10px] text-pi-text-muted/60 hover:text-pi-text-muted px-1.5 py-0.5 rounded transition-colors"
                >
                  Não
                </button>
              </>
            ) : (
              <button
                onClick={() => setConfirmRegen(true)}
                className="flex items-center gap-0.5 text-[10px] text-pi-text-muted/50 hover:text-pi-text-muted/80 transition-colors"
                title="Gerar novamente esta fase"
              >
                <RefreshCw className="w-3 h-3" />
                Regerar
              </button>
            )}
          </div>
        )}
      </div>

      {!collapsed && (
        <OutputBody phaseId={phaseId} output={output} />
      )}
    </div>
  );
}
