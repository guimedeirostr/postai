import type { BrandProfile, DesignExample, StrategyContext } from "@/types";

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
  hasReferenceImage?: boolean,
  referenceDnaVisualPrompt?: string    // quando fornecido, bloqueia o estilo visual
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
7. visual_prompt em inglês:${referenceDnaVisualPrompt ? `
   ⚠️ MODO DNA DE REFERÊNCIA ATIVO — PRESERVE O ESTILO VISUAL 100%.
   O visual_prompt DEVE começar a partir deste prompt extraído da referência e preservar EXATAMENTE:
   estilo fotográfico, iluminação, ângulo de câmera, mood, paleta de cores e tratamento de fundo.
   BASE OBRIGATÓRIO: "${referenceDnaVisualPrompt}"
   ✅ PODE adaptar: o assunto específico (prato, produto, ambiente) ao tema atual.
   ❌ NUNCA mude: lighting style, camera angle, background treatment, color mood, photographic style.
   NÃO mencione textos, logos ou elementos gráficos. Sempre em inglês.` : hasReferenceImage ? `
   ⚠️ REFERÊNCIA VISUAL ENVIADA: derive cores, estilo e composição DIRETAMENTE da imagem de referência — NÃO use as cores da marca (${client.primary_color} / ${client.secondary_color}) na imagem. A identidade da marca aparece no copy e nos overlays de texto, não na paleta fotográfica.
   Descreva cena real, fotografia profissional, lighting, estilo. NÃO descreva textos, logos ou elementos gráficos.` : `
   Descreva cena real, fotografia profissional, lighting, estilo. NÃO descreva textos, logos ou elementos gráficos na imagem. IMPORTANTE: qualquer texto ou frase visível na arte final estará em PORTUGUÊS-BR — mencione isso no prompt como "text overlays in Brazilian Portuguese".`}
8. layout_prompt em inglês — LÓGICA DE SILKSCREEN (camadas do fundo ao topo, NUNCA misture numa frase genérica):
   Descreva CADA camada separadamente, nesta ordem exata. Este prompt vai para o gerador img2img — ele precisa entender a pilha de composição como um gráfico vetorial com passes de tinta separados.

   LAYER 1 — BACKGROUND: cena/foto pura, sem texto, sem overlay. Descreva enquadramento, assunto e profundidade de campo.
   LAYER 2 — WASH: tipo exato de overlay (none | gradient bottom-up black 0→55% opacity | solid color band at bottom 20% | frosted glass panel left half | vignette edges only). Se nenhum, escreva "none". NUNCA coloque gradiente pesado sem motivo — o DNA da marca manda.
   LAYER 3 — TEXT ZONE: quadrante preciso (bottom-left | bottom-full | top-right corner | center-bottom third | left column). Inclua dimensão aproximada: "occupies bottom 30% of frame".
   LAYER 4 — HEADLINE STYLE: peso (bold 900 | display thin | mixed weight), cor (white | ${client.primary_color} | dark charcoal), capitalização (ALL CAPS | Title Case | sentence case), linhas estimadas (1–2 lines max).
   LAYER 5 — BRAND ELEMENTS: posição do logo (top-left corner | top-right | bottom-center small), rodapé (full-width footer bar with brand name left and @handle right | none), cor da barra (solid ${client.primary_color} | solid black | transparent).
   TONE: editorial clean | bold aggressive | minimal luxury | warm organic | vibrant pop
   SEMPRE termine com: "All text overlays are in Brazilian Portuguese (pt-BR)."
9. background_analysis: Analise objetivamente a CENA descrita no visual_prompt (ou a imagem de referência, se enviada). Estime com precisão: entropy_level (0.0 = fundo liso; 1.0 = cena extremamente poluída), subject_position, depth_of_field, luminosidade por quadrante (top/bottom/left/right), temperatura de cor, quais quadrantes estão livres de sujeito (safe_areas) e as cores dominantes em hex. Se não houver imagem, estime com base no visual_prompt gerado.
10. tone_profile: Escolha o perfil de tom com base no tom_de_voz da marca, segmento e pilar. Luxury → minimal_luxury. Restaurante/food premium → warm_organic ou editorial_clean. Produto/embalagem agressivo → bold_aggressive. Empório/bebida/pop → vibrant_pop. Derive wash_preference do entropy_level: > 0.6 → strong; 0.3–0.6 → soft; < 0.3 → none (exceto bold_aggressive que é sempre strong).

━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT — JSON VÁLIDO APENAS (sem markdown, sem explicações)
━━━━━━━━━━━━━━━━━━━━━━━━━━━
{
  "visual_headline": "máximo 6 palavras para overlay",
  "headline": "headline completa para display (máx 12 palavras)",
  "caption": "legenda completa seguindo o framework ${framework}, com emojis estratégicos e quebras de linha",
  "hashtags": ["exatamente 30 hashtags sem #, estrategicamente selecionadas"],
  "visual_prompt": "${referenceDnaVisualPrompt ? `Start from the reference base prompt and adapt ONLY the subject to the current theme. Preserve exact lighting, camera angle, background, color mood, photographic style. Write in English. Text overlays in Brazilian Portuguese (pt-BR).` : hasReferenceImage ? "detailed professional photography/design prompt in English — replicate the exact style, color palette, composition and mood of the reference image above. Do NOT use brand colors. Text overlays in Brazilian Portuguese (pt-BR)." : `detailed professional photography prompt in English with scene, lighting, mood, style, brand colors ${client.primary_color} and ${client.secondary_color}. Text overlays in Brazilian Portuguese (pt-BR).`}",
  "layout_prompt": "Silkscreen layer stack in English — write each layer on its own line, bottom to top: LAYER 1 — BACKGROUND: [describe photo scene and framing only, no overlays]. LAYER 2 — WASH: [none | gradient direction colors opacity | solid band position height]. LAYER 3 — TEXT ZONE: [exact quadrant and approximate frame coverage, e.g. bottom-left, bottom 35% of frame]. LAYER 4 — HEADLINE: [font weight, color, capitalization, estimated line count]. LAYER 5 — BRAND ELEMENTS: [logo position and size, footer bar style color and content]. TONE: [editorial clean | bold aggressive | minimal luxury | warm organic]. All text overlays are in Brazilian Portuguese (pt-BR). — Example: 'LAYER 1 — BACKGROUND: full-bleed product photography, woman holding stacked branded boxes, shallow depth of field, natural indoor light. LAYER 2 — WASH: none. LAYER 3 — TEXT ZONE: bottom-left, occupies bottom 30% of frame. LAYER 4 — HEADLINE: bold 900 white ALL CAPS 2 lines, accent line in ${client.primary_color}. LAYER 5 — BRAND ELEMENTS: logo top-left corner small, full-width solid black footer bar with brand name left and @handle right. TONE: editorial clean. All text overlays are in Brazilian Portuguese (pt-BR).'",
  "framework_used": "${framework}",
  "hook_type": "${hook}",
  "background_analysis": {
    "entropy_level": 0.0,
    "subject_position": "center|left|right|top|bottom|full",
    "depth_of_field": "shallow|deep|mixed",
    "brightness_zones": { "top": "light|dark|neutral", "bottom": "light|dark|neutral", "left": "light|dark|neutral", "right": "light|dark|neutral" },
    "color_temperature": "warm|cool|neutral",
    "safe_areas": ["quadrantes livres de sujeito, ex: bottom-left, top-right"],
    "dominant_colors": ["#hex1", "#hex2"]
  },
  "tone_profile": {
    "name": "editorial_clean|bold_aggressive|minimal_luxury|warm_organic|vibrant_pop",
    "typography": { "weight": "light|regular|bold|black", "spacing": "tight|normal|wide", "case_style": "uppercase|titlecase|sentence" },
    "color_behavior": { "contrast": "low|medium|high", "saturation": "muted|natural|vibrant" },
    "composition": { "density": "minimal|balanced|dense", "alignment": "centered|left|asymmetric" },
    "wash_preference": "none|soft|strong"
  }
}`;
}

// ── LinkedIn Copy ─────────────────────────────────────────────────────────────

const LINKEDIN_HOOK_GUIDE: Record<string, string> = {
  "Controvérsia":    "Quebre uma crença comum do mercado logo na linha 1. Ex: 'A maioria das empresas está fazendo X errado.' / 'O que aprendi depois de [erro honesto]:'. Deve provocar reação imediata.",
  "Número":          "Use dado específico e surpreendente na linha 1. Específico = crível. Ex: '83% dos gestores cometem este erro silencioso.' / 'Perdemos R$120 mil por causa de uma planilha.'",
  "Story Pessoal":   "Comece com situação real e concreta. Ex: 'Em [mês/ano], recebi a pior ligação da minha carreira.' / 'Olhei para os números e percebi que estávamos indo à falência.' Nada genérico.",
  "Pergunta":        "Pergunta que o leitor responde mentalmente 'sim' ou que gera dissonância cognitiva. Ex: 'Você já percebeu que os melhores [cargo] nunca fazem X?' / 'Por que empresas como [referência] vencem sempre?'",
  "Lista":           "Anuncie o número de itens e o benefício claro na linha 1. Ex: '7 sinais de que sua estratégia de X está errada (e como corrigir).' A lista deve ter insights reais, não obviedades.",
  "Dado de Mercado": "Cite dado ou notícia recente do setor, posicione-se sobre ela. Ex: 'O relatório X acaba de revelar Y. Minha leitura:' / 'O mercado de X cresceu Z% em 2024. O que muda para [segmento]:'",
};

const LINKEDIN_FORMAT_GUIDE: Record<string, string> = {
  linkedin_post: `
POST LINKEDIN (até 3000 chars — texto corrido no feed):
- Linhas 1 e 2 são TUDO — aparecem antes do "ver mais". Devem gerar clique compulsório.
- Parágrafos curtos: 1 a 3 linhas. Linha em branco entre cada bloco.
- Estrutura: Hook (1-2 linhas) → Contexto/Desenvolvimento → Virada/Insight → Lição ou CTA
- Emojis: use com moderação — apenas para estrutura (→, ✅, ❌, •) nunca decorativo
- CTA final: convide ao debate ("O que você acha?", "Já passou por isso?", "Discorda? Me conta.")
- Não termine com "Curta se concordar" ou "Compartilhe se..."
- Tom: humano e profissional. Nunca corporativo genérico. Voz de pessoa, não de empresa.`,

  linkedin_carousel: `
CARROSSEL LINKEDIN (PDF com slides — caption + estrutura de slides):
- Caption do post: Hook forte nas primeiras 2 linhas + promessa do que vem no carrossel
- O carrossel em si deve ter: Slide 1 (título = hook), Slides 2-N (conteúdo), Slide final (CTA)
- Na caption, descreva o conteúdo do carrossel para quem não abrir
- Estrutura recomendada: "Slide 1: [título]" / "Slides 2-7: [pontos principais]" / "Slide final: [CTA]"
- CTA: pedir para salvar ("Salva esse post") é o mais eficaz para carrossel`,

  linkedin_article: `
ARTIGO LINKEDIN (indexado pelo Google — 800 a 2000 palavras):
- Caption do post que divulga o artigo: Hook nas primeiras 2 linhas + resumo do aprendizado principal
- O artigo deve ter: Título forte, introdução com problema, desenvolvimento com exemplos reais, conclusão com ação
- Escreva a caption como se fosse o "trailer" do artigo — suficiente para engajar, não completo
- Artigos geram menos alcance no feed mas constroem autoridade de longo prazo (SEO)`,
};

export function buildLinkedInCopyPrompt(
  client:   BrandProfile,
  format:   string,
  objective: string,
  strategy?: StrategyContext,
): string {
  const hookType   = strategy?.hook_type ?? "Story Pessoal";
  const hookGuide  = LINKEDIN_HOOK_GUIDE[hookType] ?? LINKEDIN_HOOK_GUIDE["Story Pessoal"];
  const formatGuide = LINKEDIN_FORMAT_GUIDE[format] ?? LINKEDIN_FORMAT_GUIDE.linkedin_post;

  return `Você é um ghostwriter sênior especializado em LinkedIn para o mercado brasileiro, com 10+ anos criando conteúdo de thought leadership para executivos e marcas B2B. Você entende profundamente o algoritmo do LinkedIn e como criar posts que geram debate, compartilhamentos e leads qualificados.

━━━━━━━━━━━━━━━━━━━━━━━━━━━
BRAND BRIEF — ${client.name.toUpperCase()}
━━━━━━━━━━━━━━━━━━━━━━━━━━━
Segmento:       ${client.segment}
Público-alvo:   ${client.target_audience}
Tom de voz:     ${client.tone_of_voice}
LinkedIn:       ${client.linkedin_handle || "não informado"}
${client.bio ? `Sobre a marca:  ${client.bio}` : ""}
${client.keywords.length ? `Keywords:       ${client.keywords.join(", ")}` : ""}
${client.avoid_words.length ? `NUNCA use:      ${client.avoid_words.join(", ")}` : ""}

━━━━━━━━━━━━━━━━━━━━━━━━━━━
TIPO DE HOOK: ${hookType}
━━━━━━━━━━━━━━━━━━━━━━━━━━━
${hookGuide}

━━━━━━━━━━━━━━━━━━━━━━━━━━━
FORMATO: ${format.toUpperCase()}
━━━━━━━━━━━━━━━━━━━━━━━━━━━
${formatGuide}

${strategy && (strategy.pilar || strategy.publico_especifico || strategy.dor_desejo) ? `━━━━━━━━━━━━━━━━━━━━━━━━━━━
BRIEFING DO ESTRATEGISTA
━━━━━━━━━━━━━━━━━━━━━━━━━━━
${strategy.pilar ? `Pilar LinkedIn:        ${strategy.pilar}` : ""}
${strategy.publico_especifico ? `Público específico:    ${strategy.publico_especifico}` : ""}
${strategy.dor_desejo ? `Dor/Desejo profissional: ${strategy.dor_desejo}` : ""}

O público específico e a dor/desejo devem ser reconhecíveis no post — o leitor deve pensar "isso é sobre mim".

` : ""}━━━━━━━━━━━━━━━━━━━━━━━━━━━
REGRAS DE OURO — NUNCA QUEBRE
━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Linha 1 + linha 2 (antes do "ver mais") = o post inteiro em miniatura. Devem ser irresistíveis.
2. Nunca comece com "Hoje quero falar sobre..." / "Venho compartilhar..." / "É com grande satisfação..." — são mortes instantâneas de alcance.
3. Escreva como pessoa, não como empresa. Voz ativa, primeira pessoa quando possível.
4. Zero jargão vazio: "ecossistema", "sinergia", "soluções inovadoras", "transformação digital" sem contexto real.
5. Cada parágrafo tem UMA ideia. Nunca misture dois pontos no mesmo bloco.
6. Hashtags: máximo 5, ultra-relevantes para o nicho. Nunca genéricas (#sucesso #negócios #vida).
7. CTA sempre gera debate ou reflexão — nunca é "clique no link". LinkedIn premia comentários.
8. visual_headline: versão ultra-curta para imagem de capa do carrossel ou thumbnail (máx 6 palavras, impacto máximo).
9. Números reais convencem. Se não houver dado real, use "estimativa" ou "experiência" — não invente.
10. O post deve ter uma TESE clara. O leitor deve conseguir resumir em 1 frase o que aprendeu.

━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT — JSON VÁLIDO APENAS (sem markdown, sem explicações)
━━━━━━━━━━━━━━━━━━━━━━━━━━━
${format === "linkedin_carousel" ? `{
  "visual_headline": "máximo 6 palavras — título do slide 1 / capa",
  "headline": "linha 1 da caption do post (o hook — máx 140 chars)",
  "caption": "caption do post que acompanha o carrossel: hook nas 2 primeiras linhas + resumo do que tem dentro + CTA para salvar",
  "hashtags": ["3 a 5 hashtags relevantes, sem #"],
  "framework_used": "HOOK_TIPO usado",
  "hook_type": "${hookType}",
  "slides": [
    { "headline": "Slide 1 — título/hook (max 8 palavras)", "subheadline": "subtítulo opcional (max 12 palavras)", "body": null },
    { "headline": "Slide 2 — primeiro ponto (max 8 palavras)", "subheadline": null, "body": "2-3 frases com o conteúdo deste slide" },
    { "headline": "Slide 3 — segundo ponto (max 8 palavras)", "subheadline": null, "body": "2-3 frases com o conteúdo deste slide" },
    { "headline": "Último slide — CTA (max 8 palavras)", "subheadline": "chamada para ação ou reflexão final", "body": null }
  ]
}

REGRA SLIDES: gere entre 4 e 8 slides. Slide 1 = capa/hook. Slides intermediários = 1 ponto cada. Último slide = CTA/reflexão. body pode ser null para slides de impacto visual.` : `{
  "visual_headline": "máximo 6 palavras para capa/thumbnail",
  "headline": "linha 1 do post — o hook completo (máx 140 chars, sem ponto final obrigatório)",
  "caption": "post completo no formato ${format}, seguindo as regras acima, com quebras de linha reais (\\n)",
  "hashtags": ["3 a 5 hashtags relevantes, sem #"],
  "framework_used": "HOOK_TIPO usado",
  "hook_type": "${hookType}"
}`}`;
}
