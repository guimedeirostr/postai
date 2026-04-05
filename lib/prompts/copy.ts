import type { BrandProfile, DesignExample } from "@/types";

export interface StrategyContext {
  pilar?: string;
  publico_especifico?: string;
  dor_desejo?: string;
  hook_type?: string;
}

export function selectFramework(
  objective: string,
  hookTypeOverride?: string
): { framework: string; hook: string; description: string } {
  if (hookTypeOverride) {
    const hookMap: Record<string, { framework: string; description: string }> = {
      "Dor":          { framework: "PASTOR", description: "Problem → Amplify → Story → Testimony → Offer → Response" },
      "Curiosidade":  { framework: "AIDA",   description: "Attention → Interest → Desire → Action" },
      "Pergunta":     { framework: "PAS",    description: "Problem → Agitate → Solution" },
      "Prova Social": { framework: "PPPP",   description: "Picture → Promise → Prove → Push" },
      "Controvérsia": { framework: "AIDA",   description: "Attention → Interest → Desire → Action" },
      "Número":       { framework: "AIDA",   description: "Attention → Interest → Desire → Action" },
    };
    const mapped = hookMap[hookTypeOverride];
    if (mapped) {
      return { framework: mapped.framework, hook: hookTypeOverride, description: mapped.description };
    }
  }

  const obj = objective.toLowerCase();

  if (obj.match(/vend|compra|oferta|promo|preço|desconto/))
    return { framework: "PASTOR", hook: "Dor",         description: "Problem → Amplify → Story → Testimony → Offer → Response" };
  if (obj.match(/educ|inform|explic|aprend|ensin|dica|como/))
    return { framework: "AIDA",   hook: "Curiosidade", description: "Attention → Interest → Desire → Action" };
  if (obj.match(/engaj|curtid|coment|compartilh|alcance|viral/))
    return { framework: "PAS",    hook: "Pergunta",    description: "Problem → Agitate → Solution" };
  if (obj.match(/confi|autor|credib|prova|result|depoim/))
    return { framework: "PPPP",   hook: "Prova Social", description: "Picture → Promise → Prove → Push" };
  if (obj.match(/lança|novo|novidad|exclusiv|anuncia/))
    return { framework: "AIDA",   hook: "Controvérsia", description: "Attention → Interest → Desire → Action" };

  return { framework: "PAS", hook: "Dor", description: "Problem → Agitate → Solution" };
}

export const HOOK_GUIDE: Record<string, string> = {
  "Dor":          "Comece identificando a dor exata que o público sente. Seja cirúrgico. Ex: 'Cansado de...' / 'Você já chegou em...'",
  "Curiosidade":  "Crie uma lacuna de curiosidade irresistível. O leitor precisa continuar. Ex: 'O erro que...' / 'Por que todo...'",
  "Pergunta":     "Faça uma pergunta que o público responde mentalmente 'sim'. Técnica de comprometimento. Ex: 'Você sabia que...' / 'E se fosse possível...'",
  "Prova Social": "Comece com resultado, número ou transformação real. Ex: 'X pessoas já...' / 'Depois de Y...'",
  "Controvérsia": "Quebre uma crença comum do mercado. Ex: 'Esqueça tudo que...' / 'O que ninguém fala sobre...'",
  "Número":       "Use número específico no início. Específico = crível. Ex: '3 razões...' / 'Em 7 dias...'",
};

export const FORMAT_GUIDE: Record<string, string> = {
  feed: `
FEED (1080×1350 — retrato 4:5):
- Legenda até 2200 chars. Use storytelling completo.
- Estrutura: Hook forte → Desenvolvimento com contexto → Prova/Benefício → CTA
- Quebras de linha duplas entre blocos para respiração visual
- Emojis estratégicos: no máximo 1 por parágrafo, nunca decorativo — sempre reforça sentido
- Primeiros 125 chars são CRÍTICOS (aparecem sem "ver mais") — devem conter o hook
- CTA no final: sempre verbo de ação + benefício`,

  stories: `
STORIES (1080×1920 — vertical 9:16):
- Texto curtíssimo. Máximo 3 frases na legenda.
- Foco total no visual_headline — é o que aparece na arte
- CTA urgente e direto: "Clique aqui", "Arraste pra cima", "Responda"
- Tom conversacional, como mensagem de amigo
- Emojis: 1-2 no máximo`,

  reels_cover: `
CAPA DE REELS (1080×1920 — vertical 9:16):
- visual_headline = a razão do clique. É TUDO.
- Legenda deve complementar, não repetir
- Gere curiosidade sobre o conteúdo do Reel
- Tom: provocador, intrigante, que instiga "preciso ver isso"
- Use números ou perguntas no visual_headline`,
};

/** Formats up to `max` design examples as a few-shot reference block */
function buildExamplesBlock(examples: DesignExample[], max = 5): string {
  if (!examples.length) return "";

  const selected = examples.slice(0, max);
  const lines    = selected.map((ex, i) => `
Exemplo ${i + 1}${ex.description ? ` — ${ex.description}` : ""}:
  visual_prompt:   "${ex.visual_prompt}"
  layout_prompt:   "${ex.layout_prompt}"
  composition_zone: ${ex.composition_zone}
  color_mood:      ${ex.color_mood}`).join("\n");

  return `━━━━━━━━━━━━━━━━━━━━━━━━━━━
REFERÊNCIAS VISUAIS APROVADAS DESTE CLIENTE
━━━━━━━━━━━━━━━━━━━━━━━━━━━
Os exemplos abaixo são posts reais aprovados por este cliente. Eles definem o estilo visual e de composição esperado. Ao gerar visual_prompt e layout_prompt, replique a qualidade, o estilo fotográfico e a lógica de composição desses exemplos — adaptando para o tema atual.
${lines}

`;
}

export function buildCopyPrompt(
  client: BrandProfile,
  format: string,
  objective: string,
  strategy?: StrategyContext,
  designExamples?: DesignExample[],
  hasReferenceImage?: boolean
): string {
  const { framework, hook, description } = selectFramework(objective, strategy?.hook_type);
  const hookGuide    = HOOK_GUIDE[hook] ?? HOOK_GUIDE["Dor"];
  const formatGuide  = FORMAT_GUIDE[format] ?? FORMAT_GUIDE.feed;
  const examplesBlock = designExamples?.length ? buildExamplesBlock(designExamples) : "";

  return `Você é um copywriter sênior especialista em Instagram para o mercado brasileiro, com 10+ anos criando conteúdo viral para marcas.

━━━━━━━━━━━━━━━━━━━━━━━━━━━
BRAND BRIEF — ${client.name.toUpperCase()}
━━━━━━━━━━━━━━━━━━━━━━━━━━━
Segmento:       ${client.segment}
Público-alvo:   ${client.target_audience}
Tom de voz:     ${client.tone_of_voice}
Instagram:      ${client.instagram_handle || "não informado"}
${client.bio ? `Sobre a marca:  ${client.bio}` : ""}
${client.keywords.length ? `Keywords:       ${client.keywords.join(", ")}` : ""}
${client.avoid_words.length ? `NUNCA use:      ${client.avoid_words.join(", ")}` : ""}
Cor primária:   ${client.primary_color}
Cor secundária: ${client.secondary_color}

━━━━━━━━━━━━━━━━━━━━━━━━━━━
FRAMEWORK DE ESCRITA: ${framework}
━━━━━━━━━━━━━━━━━━━━━━━━━━━
${description}

TIPO DE HOOK: ${hook}
${hookGuide}

Aplique este framework rigorosamente na estrutura da legenda.

━━━━━━━━━━━━━━━━━━━━━━━━━━━
FORMATO: ${format.toUpperCase()}
━━━━━━━━━━━━━━━━━━━━━━━━━━━
${formatGuide}

${examplesBlock}${strategy && (strategy.pilar || strategy.publico_especifico || strategy.dor_desejo) ? `━━━━━━━━━━━━━━━━━━━━━━━━━━━
BRIEFING DO ESTRATEGISTA
━━━━━━━━━━━━━━━━━━━━━━━━━━━
${strategy.pilar ? `Pilar de conteúdo:    ${strategy.pilar}` : ""}
${strategy.publico_especifico ? `Público específico:   ${strategy.publico_especifico}` : ""}
${strategy.dor_desejo ? `Dor/Desejo a explorar: ${strategy.dor_desejo}` : ""}

Use este briefing para calibrar a profundidade emocional e o ângulo do copy. O público específico e a dor/desejo devem estar visivelmente presentes na copy.

` : ""}━━━━━━━━━━━━━━━━━━━━━━━━━━━
REGRAS DE OURO — NUNCA QUEBRE
━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. visual_headline: MÁXIMO 6 PALAVRAS. É o texto que aparece sobreposto na imagem. Deve funcionar sozinho, sem contexto. Impacto imediato. Sem pontuação excessiva.
2. headline: Versão expandida para display (máx 12 palavras). Pode ter emoção e pontuação.
3. Escreva como humano, não como IA. Zero frases genéricas. Zero "no mundo atual". Zero "num cenário onde".
4. Cada parágrafo tem uma função específica no framework — não escreva parágrafos decorativos.
5. CTA sempre específico: nunca "clique no link da bio" sem dizer por quê.
6. Hashtags: mix estratégico — 10 de nicho específico + 10 de médio alcance + 10 de alta relevância para o segmento. Nunca genéricas (#vida #amor).
7. visual_prompt em inglês: descreva cena real, fotografia profissional, lighting, estilo. NÃO descreva textos, logos ou elementos gráficos na imagem. IMPORTANTE: qualquer texto ou frase visível na arte final estará em PORTUGUÊS-BR — mencione isso no prompt como "text overlays in Brazilian Portuguese".${hasReferenceImage ? `
   ⚠️ REFERÊNCIA VISUAL ENVIADA: derive cores, estilo e composição DIRETAMENTE da imagem de referência acima — NÃO use as cores da marca (${client.primary_color} / ${client.secondary_color}) na imagem. A identidade da marca aparece no copy e nos overlays de texto, não na paleta fotográfica.` : ""}
8. layout_prompt em inglês: descreva a COMPOSIÇÃO DO DESIGN — onde o texto ficará posicionado, qual overlay será usado, o estilo do layout (glassmorphism, cards, gradiente), e como a imagem e o texto vão interagir. Este prompt é enviado para o gerador de imagens img2img para que ele entenda o contexto do design final. SEMPRE inclua: "All text overlays are in Brazilian Portuguese (pt-BR)."

━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT — JSON VÁLIDO APENAS (sem markdown, sem explicações)
━━━━━━━━━━━━━━━━━━━━━━━━━━━
{
  "visual_headline": "máximo 6 palavras para overlay",
  "headline": "headline completa para display (máx 12 palavras)",
  "caption": "legenda completa seguindo o framework ${framework}, com emojis estratégicos e quebras de linha",
  "hashtags": ["exatamente 30 hashtags sem #, estrategicamente selecionadas"],
  "visual_prompt": "${hasReferenceImage ? "detailed professional photography/design prompt in English — replicate the exact style, color palette, composition and mood of the reference image above. Do NOT use brand colors. Text overlays in Brazilian Portuguese (pt-BR)." : `detailed professional photography prompt in English with scene, lighting, mood, style, brand colors ${client.primary_color} and ${client.secondary_color}. Text overlays in Brazilian Portuguese (pt-BR).`}",
  "layout_prompt": "Instagram design composition in English: describe text overlay position (bottom third / left panel / right side), overlay style (glassmorphism frosted panel / solid brand color strip / dark gradient), typography weight (bold 900 / display), and how subject and text interact. Always end with: 'All text overlays are in Brazilian Portuguese (pt-BR).' Example: 'Product centered right, bold headline text panel on left third with brand primary color ${client.primary_color} glassmorphism overlay, white typography, brand strip at bottom with logo. All text overlays are in Brazilian Portuguese (pt-BR).'",
  "framework_used": "${framework}",
  "hook_type": "${hook}"
}`;
}
