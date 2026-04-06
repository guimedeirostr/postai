/**
 * Prompt de análise profunda de DNA visual para o fluxo de Referência.
 * Usado em POST /api/posts/analyze-reference.
 *
 * Retorna ReferenceDNA — estrutura mais rica que DesignExample,
 * focada em hierarquia tipográfica, zonas de texto e tratamento de fundo.
 */
export function buildReferenceDNAPrompt(): string {
  return `You are a senior art director performing a surgical visual DNA extraction from an Instagram post design.

Analyze every pixel of this image and return ONLY valid JSON (no markdown, no explanation outside the JSON):

{
  "composition_zone": "ONE of: left | right | bottom | top | center — the primary safe zone where text lives",
  "text_zones": "Precise description of where and how text is placed: e.g. 'headline in bottom third with 40% dark gradient overlay, logo pinned bottom-right corner' or 'left white panel occupying 45% of width with headline, subheadline and body stacked vertically'",
  "background_treatment": "What is behind the text: 'dark-to-transparent gradient from bottom 40%' | 'solid brand-colored band at bottom 25%' | 'glassmorphism frosted panel' | 'full semi-transparent dark overlay' | 'none — text directly on image with drop shadow' | describe exactly",
  "headline_style": "Typography of the main headline: weight (bold/black/light), color (white/dark/brand), case (uppercase/title/sentence), estimated relative size, and exact position — e.g. 'extra-bold white uppercase, approximately 18% image height, centered in bottom third'",
  "typography_hierarchy": "How all text levels relate to each other: e.g. 'H1 bold large (dominant) > H2 medium weight (60% H1 size) > body small regular. Left-aligned. Tight line-height.' or 'Only headline present, centered, no secondary text'",
  "visual_prompt": "Detailed English photography/design prompt for the image scene: subjects, environment, lighting style, camera angle, mood, color palette, depth of field, photographic style. Do NOT mention any text, overlays, or graphic design elements.",
  "layout_prompt": "English design composition description: exact text zone positioning, overlay style and opacity, typography weight and hierarchy within the layout, how subject and text areas relate spatially, negative space usage. End with: 'All text overlays are in Brazilian Portuguese (pt-BR).'",
  "color_mood": "Dominant color mood description: e.g. 'dark moody with warm amber brand accents', 'clean white minimal with black typography', 'high-contrast black background with neon brand color', 'warm earthy tones with muted palette'",
  "description": "1-2 sentences in Brazilian Portuguese: what makes this a strong design reference and when to use this style.",
  "pilar": "ONE of: Produto | Educação | Prova Social | Bastidores | Engajamento | Promoção | Trend",
  "format": "ONE of: feed | stories | reels_cover — infer from aspect ratio (4:5 or square = feed, 9:16 tall = stories or reels_cover)",
  "visual_headline_style": "Describe the headline style: approximate word count range, tone (bold claim / question / number-led / emotional), and visual position on the image"
}`;
}

/**
 * Claude Vision prompt used to analyze an Instagram post image
 * and extract structured design metadata to store as a client example.
 */
export const DESIGN_EXAMPLE_ANALYSIS_PROMPT = `You are an expert Instagram visual designer and art director. Analyze this Instagram post image carefully.

Extract the following information and return ONLY valid JSON (no markdown, no explanation):

{
  "visual_prompt": "Detailed English photography prompt describing the scene: subjects, environment, lighting style, camera angle, mood, color palette, depth of field, photographic style. This will be used as a Freepik image generation prompt. Be specific and technical. Do NOT mention text overlays or graphic elements.",
  "layout_prompt": "English design composition description: where text overlays are positioned (bottom third / left panel / top area / etc.), overlay style (dark gradient / solid color band / glassmorphism / none visible), typography weight if visible (bold / light), how the subject and text areas relate spatially. Always end with: 'All text overlays are in Brazilian Portuguese (pt-BR).'",
  "visual_headline_style": "Describe the headline style visible or implied: how many words, what tone (bold claim / question / number-led / emotional), where positioned on the image.",
  "pilar": "ONE of: Produto | Educação | Prova Social | Bastidores | Engajamento | Promoção | Trend",
  "format": "ONE of: feed | stories | reels_cover — infer from aspect ratio (square/portrait 4:5 = feed, tall 9:16 = stories or reels_cover)",
  "description": "1-2 sentences in Brazilian Portuguese describing what makes this a good design reference and when to use this style.",
  "color_mood": "Describe the dominant color mood: warm / cool / high-contrast / pastel / dark / vibrant",
  "composition_zone": "ONE of: left | right | bottom | top | center — where the main text safe zone appears to be"
}

Be precise. The visual_prompt and layout_prompt will directly guide AI image generation, so quality matters.`;
