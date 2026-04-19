"use client";

import { BaseEdge, EdgeProps, getBezierPath } from "@xyflow/react";

export default function GlowEdge({
  id, sourceX, sourceY, targetX, targetY,
  sourcePosition, targetPosition, style = {}, markerEnd,
}: EdgeProps) {
  const [edgePath] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });

  return (
    <>
      <style>{`
        @keyframes electroPulse {
          0%   { stroke-dashoffset: 0; opacity: 0.9; }
          50%  { opacity: 0.5; }
          100% { stroke-dashoffset: -40; opacity: 0.9; }
        }
        @keyframes pulseGlow {
          0%, 100% { filter: drop-shadow(0 0 3px #a855f7); }
          50%       { filter: drop-shadow(0 0 8px #a855f7) drop-shadow(0 0 16px #7c3aed); }
        }
        .glow-edge-path {
          animation: electroPulse 1.2s linear infinite, pulseGlow 2s ease-in-out infinite;
          stroke-dasharray: 20 10;
        }
      `}</style>
      {/* Glow layer */}
      <BaseEdge
        id={`${id}-glow`}
        path={edgePath}
        style={{
          ...style,
          stroke: "#a855f7",
          strokeWidth: 4,
          strokeOpacity: 0.3,
          filter: "blur(3px)",
        }}
      />
      {/* Main animated line */}
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{ ...style, stroke: "#a855f7", strokeWidth: 2 }}
        className="glow-edge-path"
      />
    </>
  );
}
