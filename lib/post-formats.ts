// Formatos de post e seus aspect ratios para display
export const FORMAT_ASPECT: Record<string, string> = {
  feed:        "aspect-[4/5]",   // 1080x1350
  stories:     "aspect-[9/16]",  // 1080x1920
  reels_cover: "aspect-[9/16]",  // 1080x1920
};

export const FORMAT_LABEL: Record<string, string> = {
  feed:        "Feed (1080×1350)",
  stories:     "Stories (1080×1920)",
  reels_cover: "Reels (1080×1920)",
};

export const FORMAT_OPTIONS = [
  { value: "feed",        label: "Feed",    desc: "1080×1350 · Retrato 4:5" },
  { value: "stories",     label: "Stories", desc: "1080×1920 · Vertical 9:16" },
  { value: "reels_cover", label: "Reels",   desc: "1080×1920 · Vertical 9:16" },
] as const;
