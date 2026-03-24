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
