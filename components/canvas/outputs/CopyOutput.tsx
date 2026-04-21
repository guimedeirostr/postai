"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

type Slide = { n?: number; role?: string; headline?: string; body?: string; cta?: string };

export function CopyOutput({ output }: { output: Record<string, unknown> }) {
  const [expanded, setExpanded] = useState(false);

  // Carousel path
  const slides = output.slides as Slide[] | undefined;
  if (slides?.length) {
    const visible = expanded ? slides : slides.slice(0, 2);
    return (
      <div className="space-y-1.5 text-[11px]">
        {visible.map((s, i) => (
          <div key={i} className="rounded-lg bg-pi-surface-muted/50 px-2.5 py-1.5 space-y-0.5">
            {s.role && (
              <span className="text-[9px] uppercase tracking-wide text-pi-text-muted/60 font-medium">{s.role}</span>
            )}
            {s.headline && <p className="font-semibold text-pi-text/90 leading-snug">{s.headline}</p>}
            {s.body     && <p className="text-pi-text/60 line-clamp-2 leading-relaxed">{s.body}</p>}
          </div>
        ))}
        {slides.length > 2 && (
          <button
            onClick={() => setExpanded(v => !v)}
            className="flex items-center gap-1 text-pi-text-muted/60 hover:text-pi-text-muted transition-colors"
          >
            {expanded
              ? <><ChevronUp className="w-3 h-3" /> menos</>
              : <><ChevronDown className="w-3 h-3" /> +{slides.length - 2} slides</>}
          </button>
        )}
      </div>
    );
  }

  // Single-post path
  const headline = output.headline       as string | undefined;
  const caption  = output.caption        as string | undefined;
  const visual   = output.visual_headline as string | undefined;

  return (
    <div className="space-y-1 text-[11px]">
      {visual    && <p className="text-[10px] text-violet-300 font-mono truncate">"{visual}"</p>}
      {headline  && <p className="font-semibold text-pi-text/90 leading-snug line-clamp-2">{headline}</p>}
      {caption   && <p className="text-pi-text/60 line-clamp-3 leading-relaxed">{caption}</p>}
    </div>
  );
}
