"use client";

const FORMAT_LABEL: Record<string, string> = {
  feed:            "Feed",
  ig_feed:         "Feed",
  story:           "Story",
  ig_story:        "Story",
  reels:           "Reels",
  ig_reels:        "Reels",
  carousel:        "Carrossel",
  ig_carousel:     "Carrossel",
  li_carousel_pdf: "LinkedIn PDF",
  linkedin_post:   "LinkedIn",
};

export function BriefingOutput({ output }: { output: Record<string, unknown> }) {
  const objetivo = output.objetivo as string | undefined;
  const formato  = output.formato  as string | undefined;

  return (
    <div className="space-y-1.5 text-[11px]">
      {formato && (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-violet-500/15 border border-violet-500/25 text-violet-300 font-medium">
          {FORMAT_LABEL[formato] ?? formato}
        </span>
      )}
      {objetivo && (
        <p className="text-pi-text/80 leading-relaxed line-clamp-3">{objetivo}</p>
      )}
    </div>
  );
}
