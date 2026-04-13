import type { BrandProfile } from "@/types";
import type { TrendContext } from "@/lib/tavily";

export function buildStrategyPrompt(
  client:          BrandProfile,
  campaign_focus?: string,
  trendContext?:   TrendContext | null,
  social_network?: "instagram" | "linkedin",
  calendarMode?:   { month: number; year: number; post_count: number; already_planned: string[] },
): string {
  if (social_network === "linkedin") {
    return buildLinkedInStrategyPrompt(client, campaign_focus, trendContext, calendarMode);
  }
  const dayOfWeek = new Date().toLocaleDateString("pt-BR", { weekday: "long" });

  return `Você é um estrategista sênior de conteúdo para Instagram, especializado no mercado brasileiro, com 10+ anos de experiência construindo autoridade e conversão para marcas nas redes sociais.

━━━━━━━━━━━━━━━━━━━━━━━━━━━
PERFIL DA MARCA — ${client.name.toUpperCase()}
━━━━━━━━━━━━━━━━━━━━━━━━━━━
Segmento:       ${client.segment}
Público-alvo:   ${client.target_audience}
Tom de voz:     ${client.tone_of_voice}
${client.bio ? `Bio/Sobre:      ${client.bio}` : ""}
${client.keywords.length ? `Keywords:       ${client.keywords.join(", ")}` : ""}
Instagram:      ${client.instagram_handle || "não informado"}

━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONTEXTO TEMPORAL
━━━━━━━━━━━━━━━━━━━━━━━━━━━
Hoje é ${dayOfWeek}. Use isso para calibrar o pilar e o tom — segundas pedem motivação, sextas pedem leveza, fins de semana pedem engajamento pessoal, etc.
${campaign_focus ? `\nFoco de campanha indicado pelo usuário: "${campaign_focus}"` : ""}
${trendContext ? `
━━━━━━━━━━━━━━━━━━━━━━━━━━━
TENDÊNCIAS EM TEMPO REAL (Tavily)
━━━━━━━━━━━━━━━━━━━━━━━━━━━
Query: ${trendContext.query}
Resumo: ${trendContext.summary}
${trendContext.snippets.length ? trendContext.snippets.join("\n") : ""}
Use estas tendências para escolher um tema ATUAL e relevante. Se houver conflito com o foco de campanha, priorize o foco.` : ""}

━━━━━━━━━━━━━━━━━━━━━━━━━━━
PILARES DE CONTEÚDO DISPONÍVEIS
━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Produto: mostrar produto/serviço em uso, benefícios tangíveis
- Educação: ensinar algo valioso relacionado ao segmento
- Prova Social: depoimentos, resultados, cases, números
- Bastidores: humanizar a marca, processo, equipe
- Engajamento: perguntas, polls, interação, comunidade
- Promoção: ofertas, urgência, conversão direta
- Trend: aproveitar tendência cultural/comportamental atual

━━━━━━━━━━━━━━━━━━━━━━━━━━━
SUA MISSÃO
━━━━━━━━━━━━━━━━━━━━━━━━━━━
${calendarMode
  ? `Você está gerando um CALENDÁRIO EDITORIAL para ${calendarMode.post_count} posts de ${new Date(calendarMode.year, calendarMode.month - 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}.

REGRAS DO CALENDÁRIO:
- Distribua equilibrando TODOS os pilares (Produto, Educação, Prova Social, Bastidores, Engajamento, Promoção, Trend)
- Não repita o mesmo tema nos 7 dias seguintes
- scheduled_date: distribua ao longo do mês, segunda a sexta, formato YYYY-MM-DD
- Varie os formatos: feed, stories, reels_cover
${calendarMode.already_planned.length ? `- Temas JÁ planejados (não repita): ${calendarMode.already_planned.join(", ")}` : ""}

Retorne APENAS um JSON ARRAY de ${calendarMode.post_count} briefings (sem markdown):

[
  {
    "pilar": "Produto|Educação|Prova Social|Bastidores|Engajamento|Promoção|Trend",
    "tema": "tema específico — 1 frase",
    "objetivo": "objetivo — 1 frase com verbo de ação",
    "publico_especifico": "segmento específico",
    "dor_desejo": "dor ou desejo cirúrgico",
    "formato_sugerido": "feed|stories|reels_cover",
    "hook_type": "Dor|Curiosidade|Pergunta|Prova Social|Controvérsia|Número",
    "rationale": "Por que este tema neste dia — 1 frase",
    "scheduled_date": "YYYY-MM-DD"
  }
]`
  : `Analise o perfil da marca, o contexto temporal e o eventual foco de campanha. Selecione o pilar e tema mais estratégico para HOJE. Pense como um CMO que quer maximizar engajamento E conversão com um único post.

Retorne APENAS JSON válido (sem markdown, sem explicações, sem texto fora do JSON):

{
  "pilar": "Produto|Educação|Prova Social|Bastidores|Engajamento|Promoção|Trend",
  "tema": "tema específico e concreto sugerido — 1 frase clara",
  "objetivo": "objetivo claro de conversão/engajamento — 1 frase com verbo de ação",
  "publico_especifico": "segmento específico do público para esta postagem",
  "dor_desejo": "dor ou desejo específico a explorar — seja cirúrgico",
  "formato_sugerido": "feed|stories|reels_cover",
  "hook_type": "Dor|Curiosidade|Pergunta|Prova Social|Controvérsia|Número",
  "rationale": "Por que esta estratégia agora — 1-2 frases conectando o contexto temporal, o perfil da marca e o objetivo"
}`
}`;
}

// ── LinkedIn Strategy ─────────────────────────────────────────────────────────

function buildLinkedInStrategyPrompt(
  client:          BrandProfile,
  campaign_focus?: string,
  trendContext?:   TrendContext | null,
  calendarMode?:   { month: number; year: number; post_count: number; already_planned: string[] },
): string {
  const dayOfWeek = new Date().toLocaleDateString("pt-BR", { weekday: "long" });

  return `Você é um estrategista sênior de conteúdo para LinkedIn, especializado no mercado B2B brasileiro, com 10+ anos construindo autoridade de marca e geração de leads através de thought leadership.

Você conhece profundamente o algoritmo do LinkedIn:
- Posts que geram debate e comentários têm alcance 5–10x maior
- Terças, quartas e quintas são os melhores dias
- As primeiras 2 linhas do post são decisivas (aparecem antes do "ver mais")
- Carrosséis (PDFs) têm o maior alcance médio por impressão
- Artigos são indexados pelo Google e constroem autoridade de longo prazo
- Posts pessoais/narrativos superam posts institucionais no feed

━━━━━━━━━━━━━━━━━━━━━━━━━━━
PERFIL DA MARCA — ${client.name.toUpperCase()}
━━━━━━━━━━━━━━━━━━━━━━━━━━━
Segmento:       ${client.segment}
Público-alvo:   ${client.target_audience}
Tom de voz:     ${client.tone_of_voice}
${client.bio ? `Bio/Sobre:      ${client.bio}` : ""}
${client.keywords.length ? `Keywords:       ${client.keywords.join(", ")}` : ""}
LinkedIn:       ${client.linkedin_handle || "não informado"}

━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONTEXTO TEMPORAL
━━━━━━━━━━━━━━━━━━━━━━━━━━━
Hoje é ${dayOfWeek}. No LinkedIn: segundas são lentas, terças/quartas são pico, sextas caem rápido. Calibre o tipo de post para o dia.
${campaign_focus ? `\nFoco indicado: "${campaign_focus}"` : ""}
${trendContext ? `
━━━━━━━━━━━━━━━━━━━━━━━━━━━
TENDÊNCIAS DE MERCADO (Tavily)
━━━━━━━━━━━━━━━━━━━━━━━━━━━
Query: ${trendContext.query}
Resumo: ${trendContext.summary}
${trendContext.snippets.length ? trendContext.snippets.join("\n") : ""}
Use estas notícias/tendências para ancorar o post em algo ATUAL e relevante para o segmento.` : ""}

━━━━━━━━━━━━━━━━━━━━━━━━━━━
PILARES LINKEDIN DISPONÍVEIS
━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Thought Leadership: opinião forte, visão de mercado, perspectiva contra-intuitiva
- Educação: framework, processo, passo-a-passo, lista numerada com valor real
- Case / Resultado: história de transformação, prova social profissional com números
- Bastidores Profissionais: processo de decisão, erros e aprendizados, cultura
- Tendência de Mercado: análise de notícia, opinião sobre mudança do setor
- Reconhecimento: celebrar cliente, parceiro, conquista de equipe
- Debate: pergunta provocadora que convida respostas divergentes

━━━━━━━━━━━━━━━━━━━━━━━━━━━
FORMATOS DISPONÍVEIS
━━━━━━━━━━━━━━━━━━━━━━━━━━━
- linkedin_post: texto até 3000 chars — narrativa, lista, reflexão. Mais rápido de produzir, bom para frequência.
- linkedin_carousel: carrossel PDF de slides — maior alcance, educativo, visual. Ótimo para frameworks e listas.
- linkedin_article: artigo longo indexado pelo Google — para thought leadership profundo, 800–2000 palavras. Use apenas se o tema justificar.

━━━━━━━━━━━━━━━━━━━━━━━━━━━
SUA MISSÃO
━━━━━━━━━━━━━━━━━━━━━━━━━━━
Selecione o pilar e formato mais estratégico para HOJE neste perfil de marca. Priorize posts que gerem comentários e debate — não apenas curtidas. Pense como um CMO que quer posicionar a marca como referência no setor.

Retorne APENAS JSON válido (sem markdown, sem explicações):

{
  "pilar": "Thought Leadership|Educação|Case / Resultado|Bastidores Profissionais|Tendência de Mercado|Reconhecimento|Debate",
  "tema": "tema específico e concreto — 1 frase clara, ancorável numa notícia ou situação real",
  "objetivo": "objetivo claro — 1 frase com verbo de ação (ex: Posicionar a marca como, Gerar debate sobre, Demonstrar resultado de)",
  "publico_especifico": "cargo/perfil específico que deve se identificar com este post",
  "dor_desejo": "dor profissional ou aspiração de carreira/negócio a explorar — seja cirúrgico",
  "formato_sugerido": "linkedin_post|linkedin_carousel|linkedin_article",
  "hook_type": "Controvérsia|Número|Story Pessoal|Pergunta|Lista|Dado de Mercado",
  "rationale": "Por que esta estratégia agora — conecte o contexto temporal, o perfil e o objetivo. 1-2 frases."
}`;
}
