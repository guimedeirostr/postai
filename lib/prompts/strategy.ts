import type { BrandProfile } from "@/types";
import type { TrendContext } from "@/lib/tavily";

export function buildStrategyPrompt(
  client:          BrandProfile,
  campaign_focus?: string,
  trendContext?:   TrendContext | null,
): string {
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
Analise o perfil da marca, o contexto temporal e o eventual foco de campanha. Selecione o pilar e tema mais estratégico para HOJE. Pense como um CMO que quer maximizar engajamento E conversão com um único post.

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
}`;
}
