/**
 * lib/prompts/carousel.ts
 *
 * Prompt do Criador de Carrossel Editorial.
 * Instrui o Claude a gerar um JSON com slides para carrossel do Instagram.
 */

import type { BrandProfile } from "@/types";

export interface DnaContext {
  dominant_colors: string[];
  color_mood:      string;
  visual_style:    string;
  description?:    string;
}

export function buildCarouselPrompt(
  client: BrandProfile,
  slideCount: number,
  dnaContext?: DnaContext | null
): string {
  const brandSection = `
## PERFIL DA MARCA
- **Nome**: ${client.name}
- **Segmento**: ${client.segment ?? "não informado"}
- **Público-alvo**: ${client.target_audience ?? "não informado"}
- **Tom de voz**: ${client.tone_of_voice ?? "profissional"}
- **Cor primária**: ${client.primary_color ?? "#6d28d9"}
- **Cor secundária**: ${client.secondary_color ?? "#f59e0b"}
- **Keywords**: ${client.keywords?.join(", ") ?? "não informadas"}
`.trim();

  const dnaSection = dnaContext ? `

## DNA VISUAL DE REFERÊNCIA (respeite este estilo)
- **Estilo Visual**: ${dnaContext.visual_style}
- **Mood das cores**: ${dnaContext.color_mood}
- **Cores dominantes**: ${dnaContext.dominant_colors.join(", ")}
${dnaContext.description ? `- **Descrição**: ${dnaContext.description}` : ""}
O visual_prompt do slide hook DEVE incorporar este DNA: use as cores, o estilo e o mood descritos acima.
` : "";

  return `Você é um estrategista editorial especializado em carrosseis para Instagram. Seu trabalho é criar carrosseis altamente engajadores que educam, inspiram ou convencem o público-alvo da marca.

${brandSection}${dnaSection}

## REGRAS DO CARROSSEL

1. **Estrutura obrigatória**:
   - Slide 0 (index 0): type "hook" — headline impactante + subheadline que provoca curiosidade + visual_prompt em inglês
   - Slides 1 a N-2: type "content" — conteúdo educativo/informativo rotacionando bg_style
   - Último slide: type "cta" — call to action claro e direto com cta_text

2. **Número de slides**: Gere exatamente ${slideCount} slides (índices 0 a ${slideCount - 1}).

3. **bg_style (fundo de cada slide content)**:
   - "brand" = cor primária sólida da marca
   - "dark" = fundo escuro (#0f0f0f)
   - "accent" = cor secundária sólida da marca
   - "light" = fundo claro quase branco
   - Rotacione para criar ritmo visual: dark → brand → accent → light → dark → ...
   - Hook e CTA usam "brand" por padrão

4. **headline**: MÁXIMO 6 PALAVRAS, em caixa alta estilo Instagram. Deve ser impactante.

5. **visual_prompt**: APENAS no slide 0 (hook). SEMPRE em inglês. Descreva a cena, iluminação, estilo fotográfico e mood. Não use nomes de marcas. Ex: "A confident businesswoman at a modern office, cinematic lighting, teal and gold color palette, shallow depth of field, professional photography style"

6. **number_highlight**: Use quando houver uma estatística ou número forte (ex: "73%", "3x", "R$0"). Omita se não houver.

7. **icon_emoji**: Um único emoji que representa o tema do slide. Omita no hook.

8. **caption**: Legenda completa para o post do carrossel no Instagram. Deve ter storytelling, usar quebras de linha, e terminar com CTA (ex: "Salva esse carrossel 🔖").

9. **hashtags**: Entre 15 e 25 hashtags relevantes, SEM o #.

## FORMATO DE SAÍDA

Retorne SOMENTE o JSON válido, sem markdown, sem backticks, sem comentários:

{
  "topic": "O tema/ângulo editorial do carrossel",
  "caption": "Legenda completa para o Instagram...",
  "hashtags": ["tag1", "tag2"],
  "slides": [
    {
      "index": 0,
      "type": "hook",
      "headline": "FRASE CURTA IMPACTANTE",
      "subheadline": "Frase de apoio que provoca curiosidade e faz arrastar",
      "visual_prompt": "Scene description in English for AI image generation...",
      "bg_style": "brand",
      "icon_emoji": null,
      "number_highlight": null
    },
    {
      "index": 1,
      "type": "content",
      "headline": "TÍTULO DO SLIDE",
      "subheadline": "Contexto curto",
      "body_text": "Texto explicativo com 2-3 frases. Seja direto e valioso para o público.",
      "bg_style": "dark",
      "icon_emoji": "📌",
      "number_highlight": null
    },
    {
      "index": ${slideCount - 1},
      "type": "cta",
      "headline": "PRÓXIMO PASSO",
      "subheadline": "Descrição do que o usuário deve fazer",
      "cta_text": "Texto do botão / ação",
      "bg_style": "brand",
      "icon_emoji": "✅",
      "number_highlight": null
    }
  ]
}`;
}
