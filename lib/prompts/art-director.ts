import type { BrandProfile, StrategyBriefing, DesignExample } from "@/types";

export interface ArtDirection {
  visual_style:       string;
  lighting:           string;
  composition:        string;
  colors:             string;
  background:         string;
  typography:         string;
  texture:            string;
  image_type:         "photography" | "illustration" | "3d_render" | "graphic_design";
  lens:               string;
  depth_of_field:     string;
  emotion:            string;
  negative_prompt:    string;
  final_visual_prompt: string;
  final_layout_prompt: string;
}

/**
 * Decision table: pilar → art direction defaults.
 * These are injected into the prompt as style suggestions,
 * giving the model a strong starting point per content pillar.
 */
const PILAR_STYLE_MAP: Record<string, {
  visual_style: string;
  lighting:     string;
  composition:  string;
  emotion:      string;
  texture:      string;
}> = {
  "Produto": {
    visual_style: "commercial photography, clean product focus",
    lighting:     "studio light, soft product highlight, white reflectors",
    composition:  "centered subject, clean background, space for headline top",
    emotion:      "desire, confidence, quality",
    texture:      "clean sharp, minimal grain",
  },
  "Educação": {
    visual_style: "editorial, flat design, modern infographic",
    lighting:     "natural light, neutral, bright",
    composition:  "grid layout, infographic zones, space for text blocks",
    emotion:      "clarity, curiosity, trust",
    texture:      "clean, crisp, digital",
  },
  "Prova Social": {
    visual_style: "documentary, authentic, warm portrait",
    lighting:     "natural window light, warm ambient",
    composition:  "portrait rule of thirds, testimonial layout, face visible",
    emotion:      "trust, credibility, transformation",
    texture:      "realistic, subtle film grain",
  },
  "Bastidores": {
    visual_style: "cinematic, candid, lifestyle",
    lighting:     "natural light, ambient, golden hour or indoor warm",
    composition:  "candid rule of thirds, human element, authentic moment",
    emotion:      "humanity, authenticity, connection",
    texture:      "film grain, organic, slightly imperfect",
  },
  "Engajamento": {
    visual_style: "vibrant, energetic, eye-catching",
    lighting:     "bright, colorful, high energy",
    composition:  "dynamic center, bold focal point",
    emotion:      "joy, energy, community",
    texture:      "clean, modern, vivid",
  },
  "Promoção": {
    visual_style: "commercial marketing, high contrast, bold",
    lighting:     "dramatic studio light, glow, high contrast",
    composition:  "centered product, price emphasis zone, strong focal point",
    emotion:      "urgency, excitement, desire",
    texture:      "clean, sharp, bold graphic",
  },
  "Trend": {
    visual_style: "contemporary, aesthetic, culturally current",
    lighting:     "trendy aesthetic light, moody or vibrant depending on trend",
    composition:  "editorial asymmetric, modern crop",
    emotion:      "freshness, relevance, cultural connection",
    texture:      "modern, intentional grain or clean digital",
  },
};

export interface CopyContext {
  visual_headline:  string;
  visual_prompt:    string;
  layout_prompt?:   string;
}

export function buildArtDirectorPrompt(
  client:          BrandProfile,
  briefing:        StrategyBriefing,
  copy:            CopyContext,
  designExamples?: DesignExample[]
): string {
  const defaults = PILAR_STYLE_MAP[briefing.pilar] ?? PILAR_STYLE_MAP["Engajamento"];

  return `Você é um Diretor de Arte sênior especializado em social media para marcas brasileiras, com 15 anos de experiência em campanhas para Instagram.

Sua função: receber um briefing estratégico e uma copy já escrita, e transformar isso em uma DIREÇÃO DE ARTE PROFISSIONAL completa — elevando o visual_prompt de genérico para cinematográfico, digno de agência.

━━━━━━━━━━━━━━━━━━━━━━━━━━━
PERFIL DA MARCA — ${client.name.toUpperCase()}
━━━━━━━━━━━━━━━━━━━━━━━━━━━
Segmento:        ${client.segment}
Público-alvo:    ${client.target_audience}
Tom de voz:      ${client.tone_of_voice}
Cor primária:    ${client.primary_color}
Cor secundária:  ${client.secondary_color}
${client.fonts.length ? `Tipografia:      ${client.fonts.join(", ")}` : ""}
${client.bio ? `Sobre a marca:   ${client.bio}` : ""}
${client.keywords.length ? `Keywords:        ${client.keywords.join(", ")}` : ""}

━━━━━━━━━━━━━━━━━━━━━━━━━━━
BRIEFING ESTRATÉGICO
━━━━━━━━━━━━━━━━━━━━━━━━━━━
Pilar:           ${briefing.pilar}
Tema:            ${briefing.tema}
Objetivo:        ${briefing.objetivo}
Público:         ${briefing.publico_especifico}
Dor/Desejo:      ${briefing.dor_desejo}
Formato:         ${briefing.formato_sugerido}
Hook type:       ${briefing.hook_type}

━━━━━━━━━━━━━━━━━━━━━━━━━━━
COPY GERADA PELO COMPOSITOR
━━━━━━━━━━━━━━━━━━━━━━━━━━━
Headline visual (texto que vai sobreposto na imagem): "${copy.visual_headline}"
Visual prompt inicial (rascunho do copywriter):
  ${copy.visual_prompt}
${copy.layout_prompt ? `Layout prompt inicial (rascunho):\n  ${copy.layout_prompt}` : ""}

━━━━━━━━━━━━━━━━━━━━━━━━━━━
PONTO DE PARTIDA — ESTILO BASE PARA PILAR "${briefing.pilar}"
━━━━━━━━━━━━━━━━━━━━━━━━━━━
Estilo visual sugerido:   ${defaults.visual_style}
Iluminação sugerida:      ${defaults.lighting}
Composição sugerida:      ${defaults.composition}
Emoção central:           ${defaults.emotion}
Textura:                  ${defaults.texture}

Use isso como ponto de partida — mas adapte à marca, ao tema e ao objetivo específico.

${designExamples && designExamples.length > 0 ? `━━━━━━━━━━━━━━━━━━━━━━━━━━━
REFERÊNCIAS VISUAIS APROVADAS — DNA EXTRAÍDO (use como inspiração direta)
━━━━━━━━━━━━━━━━━━━━━━━━━━━
Estas referências foram analisadas e aprovadas para o estilo visual do cliente.
PRIORIZE estas referências ao criar o final_visual_prompt e final_layout_prompt.
São posts reais que funcionaram no nicho — não ignore.

${designExamples.slice(0, 3).map((ex, i) => `--- Referência ${i + 1} | Pilar: ${ex.pilar} | Formato: ${ex.format} ---
Estilo visual: ${ex.description}
Color mood:    ${ex.color_mood}
Zona de composição: ${ex.composition_zone}
Tipografia na headline: ${ex.visual_headline_style}
Visual prompt desta referência (em inglês):
  ${ex.visual_prompt}
Layout prompt desta referência (em inglês):
  ${ex.layout_prompt}`).join("\n\n")}

INSTRUÇÃO: adapte o estilo destas referências para o tema atual — não copie,
mas use o mesmo nível de qualidade, mood de cores e composição como base.

` : ""}━━━━━━━━━━━━━━━━━━━━━━━━━━━
SEU PROCESSO MENTAL (siga esta ordem antes de gerar o output)
━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. O que é o foco principal da imagem — pessoa, produto, cena, conceito abstrato?
2. Fotografia realista, ilustração, 3D ou design gráfico?
3. A imagem é minimalista ou cinematográfica e carregada?
4. Qual a emoção central que ela deve evocar no público desta marca?
5. O texto vai sobreposto na imagem — onde fica o espaço negativo para ele?
6. Qual lente e profundidade de campo criam a sensação certa?
7. A luz é suave e emocional, dramática, ou natural e autêntica?
8. As cores seguem a marca (${client.primary_color}, ${client.secondary_color}), são neutras ou vibrantes?
9. A imagem deve parecer premium, emocional, corporativa ou comercial?
10. O visual_prompt inicial do copywriter está no nível certo? Eleve-o com linguagem de diretor de arte.

━━━━━━━━━━━━━━━━━━━━━━━━━━━
REGRAS CRÍTICAS — NUNCA QUEBRE
━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. final_visual_prompt SEMPRE em inglês — será enviado diretamente à API Freepik (gerador de imagem)
2. NÃO descreva textos, logos, elementos gráficos, preços ou marcas no final_visual_prompt — apenas cena fotográfica
3. final_layout_prompt em inglês — descreve a composição do DESIGN: onde o texto overlay fica, estilo do panel, como imagem e texto interagem
4. final_layout_prompt SEMPRE termina com: "All text overlays are in Brazilian Portuguese (pt-BR)."
5. Prompts devem ser cinematográficos e detalhados — nunca curtos ou genéricos
6. final_visual_prompt DEVE incluir: tipo de imagem, descrição da cena, sujeito/objeto, iluminação, lente, profundidade de campo, estilo visual, paleta de cores, textura, qualidade, composição para social media, espaço para texto overlay

━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT — JSON VÁLIDO APENAS (sem markdown, sem explicações, sem texto fora do JSON)
━━━━━━━━━━━━━━━━━━━━━━━━━━━
{
  "visual_style":        "estilo visual — ex: cinematic minimal, editorial vibrant, documentary warm",
  "lighting":            "iluminação — ex: soft golden hour light, dramatic studio light, natural window light",
  "composition":         "composição — ex: negative space top third for headline, rule of thirds subject right, centered product",
  "colors":              "paleta — ex: warm neutral tones with ${client.primary_color} accent, monochromatic cool",
  "background":          "fundo — ex: clean blurred bokeh, soft gradient, urban texture, abstract shapes",
  "typography":          "estilo tipográfico sugerido para overlay — ex: bold sans-serif 900 weight, elegant serif display",
  "texture":             "textura da imagem — ex: subtle film grain, clean digital, paper texture, cinematic grain",
  "image_type":          "photography|illustration|3d_render|graphic_design",
  "lens":                "lente — ex: 50mm portrait, 85mm telephoto, 35mm environmental, wide angle",
  "depth_of_field":      "ex: shallow depth of field soft bokeh background, deep focus all sharp, extreme bokeh",
  "emotion":             "emoção que a imagem deve evocar — ex: hope and determination, urgency and desire, calm trust",
  "negative_prompt":     "o que EVITAR na geração — ex: low quality, blurry, distorted text, watermark, generic stock photo, oversaturated",
  "final_visual_prompt": "prompt cinematográfico completo e detalhado em inglês para gerar a imagem no Freepik — mínimo 80 palavras, máximo 200",
  "final_layout_prompt": "composição do design em inglês: posição do texto overlay, estilo do panel/overlay, peso tipográfico, como sujeito e texto interagem, zona segura para leitura. Termina com: 'All text overlays are in Brazilian Portuguese (pt-BR).'"
}`;
}
