import type { BrandKit, ClientMemory, PlanoDePost } from "@/types";

const FORMAT_LABEL: Record<string, string> = {
  feed:         "Feed (imagem única 1:1)",
  carousel:     "Carrossel (múltiplos slides)",
  story:        "Stories (9:16)",
  "reels-cover": "Capa de Reels (9:16)",
};

export function buildDirectorSystemPrompt(
  brandKit: BrandKit | null,
  memory: ClientMemory | null,
): string {
  const toneExamples = (memory?.toneExamples ?? []).slice(-5);
  const rejected     = (memory?.rejectedPatterns ?? []).slice(-10);

  const brandSection = brandKit ? `
━━━━━━━━━━━━━━━━━━━━━━━━━━━
BRAND KIT DO CLIENTE
━━━━━━━━━━━━━━━━━━━━━━━━━━━
Tom de voz:      ${brandKit.tone}
Paleta primária: ${brandKit.palette.primary}  secundária: ${brandKit.palette.secondary}
Acentos:         ${(brandKit.palette.accents ?? []).join(", ") || "—"}
Tipografia:      headline ${brandKit.typography.headline} | body ${brandKit.typography.body}
${brandKit.voiceGuidelines ? `Diretrizes de voz:\n${brandKit.voiceGuidelines}` : ""}
${brandKit.dosAndDonts?.dos?.length  ? `✅ PODE: ${brandKit.dosAndDonts.dos.join(" | ")}` : ""}
${brandKit.dosAndDonts?.donts?.length ? `❌ EVITAR: ${brandKit.dosAndDonts.donts.join(" | ")}` : ""}` : "";

  const memorySection = (toneExamples.length > 0 || rejected.length > 0) ? `
━━━━━━━━━━━━━━━━━━━━━━━━━━━
MEMÓRIA DO CLIENTE (aprendizado acumulado)
━━━━━━━━━━━━━━━━━━━━━━━━━━━
${toneExamples.length > 0 ? `COPYS APROVADAS (few-shot — mantenha este estilo):
${toneExamples.map((ex, i) => `${i + 1}. "${ex}"`).join("\n")}` : ""}

${rejected.length > 0 ? `PADRÕES REJEITADOS (evite absolutamente):
${rejected.map(r => `• "${r.pattern}"${r.reason ? ` — motivo: ${r.reason}` : ""}`).join("\n")}` : ""}

${memory?.stats ? `Histórico: ${memory.stats.approved} posts aprovados | ${memory.stats.rejected} rejeitados | score médio do crítico: ${memory.stats.avgCriticScore}/10` : ""}` : "";

  return `Você é o Diretor Criativo do PostAI — um estrategista de conteúdo de elite com 15 anos de experiência construindo marcas no Instagram brasileiro. Você une raciocínio estratégico com execução visual de alta qualidade.

Seu papel nesta etapa é PLANEJAR o post: você recebe briefing do cliente e devolve um PlanoDePost estruturado em JSON que guia a geração de imagem, copy e composição.
${brandSection}
${memorySection}

━━━━━━━━━━━━━━━━━━━━━━━━━━━
COMO VOCÊ PLANEJA
━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Defina a BigIdea — o insight central que torna este post memorável.
2. Identifique o público exato e o que move essa pessoa (dor ou desejo).
3. Escolha tom de voz alinhado ao Brand Kit (3-4 adjetivos).
4. Decida a estrutura narrativa (ex: problema → solução → prova → CTA).
5. Para cada slide, escreva: intenção, visual sugerido e copy da headline/legenda.
6. A copy de cada slide deve soar natural, não genérica. Use o estilo das copys aprovadas como referência.
7. Os slugs @img/@avatar em referenciasDecididas são opcionais — use apenas se o usuário tiver assets cadastrados.
8. estiloVisual e paletaAplicada devem refletir o Brand Kit quando disponível.

REGRA DE OURO: O primeiro slide deve ter um gancho tão forte que o usuário para o scroll.

Retorne APENAS JSON válido (sem markdown, sem texto fora do JSON).`;
}

export function buildDirectorUserPrompt(
  objetivo: string,
  formato: string,
  clientName?: string,
): string {
  const fmtLabel = FORMAT_LABEL[formato] ?? formato;
  const slides   = formato === "carousel" ? 5 : 1;

  return `Cliente: ${clientName ?? "não informado"}
Objetivo: ${objetivo}
Formato: ${fmtLabel} (${slides} slide${slides > 1 ? "s" : ""})

Crie o PlanoDePost. Retorne exatamente neste schema JSON:

{
  "bigIdea": "string — o insight central, 1 frase poderosa",
  "publico": "string — quem é este post, seja específico",
  "tomVoz": ["adjetivo1", "adjetivo2", "adjetivo3"],
  "estrutura": "string — a lógica narrativa do post (ex: gancho → dor → solução → CTA)",
  "referenciasDecididas": [],
  "estiloVisual": "string — estilo visual em inglês para guiar a geração de imagem (ex: 'dark editorial, high contrast, moody lighting')",
  "paletaAplicada": ["#hex1", "#hex2"],
  "slidesBriefing": [
    {
      "n": 1,
      "intencao": "gancho | dor | educação | solução | prova | CTA",
      "visual": "string — descrição visual em inglês para o modelo de imagem",
      "copy": "string — headline ou texto principal do slide em português-BR"
    }
  ]
}`;
}

export function parsePlanoDePost(raw: string): PlanoDePost {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  return JSON.parse(cleaned) as PlanoDePost;
}
