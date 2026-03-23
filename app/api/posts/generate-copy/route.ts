import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { adminDb } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/session";
import { FieldValue } from "firebase-admin/firestore";
import type { BrandProfile } from "@/types";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL     = process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001";

interface CopyResult {
  visual_headline: string;
  headline:        string;
  caption:         string;
  hashtags:        string[];
  visual_prompt:   string;
  layout_prompt:   string;   // composition description for img2img
  framework_used:  string;
  hook_type:       string;
}

// Seleciona framework e tipo de hook com base no objetivo (ou usa hook_type do estrategista se fornecido)
function selectFramework(objective: string, hookTypeOverride?: string): { framework: string; hook: string; description: string } {
  // If strategy agent provided a hook_type, use it to influence framework selection
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
    return { framework: "PASTOR", hook: "Dor",       description: "Problem → Amplify → Story → Testimony → Offer → Response" };
  if (obj.match(/educ|inform|explic|aprend|ensin|dica|como/))
    return { framework: "AIDA",   hook: "Curiosidade", description: "Attention → Interest → Desire → Action" };
  if (obj.match(/engaj|curtiid|coment|compartilh|alcance|viral/))
    return { framework: "PAS",    hook: "Pergunta",   description: "Problem → Agitate → Solution" };
  if (obj.match(/confi|autor|credib|prova|result|depoim/))
    return { framework: "PPPP",   hook: "Prova Social", description: "Picture → Promise → Prove → Push" };
  if (obj.match(/lança|novo|novidad|exclusiv|anuncia/))
    return { framework: "AIDA",   hook: "Controvérsia", description: "Attention → Interest → Desire → Action" };

  return { framework: "PAS", hook: "Dor", description: "Problem → Agitate → Solution" };
}

const HOOK_GUIDE: Record<string, string> = {
  "Dor":          "Comece identificando a dor exata que o público sente. Seja cirúrgico. Ex: 'Cansado de...' / 'Você já chegou em...'",
  "Curiosidade":  "Crie uma lacuna de curiosidade irresistível. O leitor precisa continuar. Ex: 'O erro que...' / 'Por que todo...'",
  "Pergunta":     "Faça uma pergunta que o público responde mentalmente 'sim'. Técnica de comprometimento. Ex: 'Você sabia que...' / 'E se fosse possível...'",
  "Prova Social": "Comece com resultado, número ou transformação real. Ex: 'X pessoas já...' / 'Depois de Y...'",
  "Controvérsia": "Quebre uma crença comum do mercado. Ex: 'Esqueça tudo que...' / 'O que ninguém fala sobre...'",
  "Número":       "Use número específico no início. Específico = crível. Ex: '3 razões...' / 'Em 7 dias...'",
};

const FORMAT_GUIDE: Record<string, string> = {
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

interface StrategyContext {
  pilar?: string;
  publico_especifico?: string;
  dor_desejo?: string;
  hook_type?: string;
}

function buildSystemPrompt(client: BrandProfile, format: string, objective: string, strategy?: StrategyContext): string {
  const { framework, hook, description } = selectFramework(objective, strategy?.hook_type);
  const hookGuide    = HOOK_GUIDE[hook] ?? HOOK_GUIDE["Dor"];
  const formatGuide  = FORMAT_GUIDE[format] ?? FORMAT_GUIDE.feed;

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

${strategy && (strategy.pilar || strategy.publico_especifico || strategy.dor_desejo) ? `━━━━━━━━━━━━━━━━━━━━━━━━━━━
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
7. visual_prompt em inglês: descreva cena real, fotografia profissional, lighting, estilo. NÃO descreva textos, logos ou elementos gráficos na imagem.
8. layout_prompt em inglês: descreva a COMPOSIÇÃO DO DESIGN — onde o texto ficará posicionado, qual overlay será usado, o estilo do layout (glassmorphism, cards, gradiente), e como a imagem e o texto vão interagir. Este prompt é enviado para o gerador de imagens img2img para que ele entenda o contexto do design final.

━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT — JSON VÁLIDO APENAS (sem markdown, sem explicações)
━━━━━━━━━━━━━━━━━━━━━━━━━━━
{
  "visual_headline": "máximo 6 palavras para overlay",
  "headline": "headline completa para display (máx 12 palavras)",
  "caption": "legenda completa seguindo o framework ${framework}, com emojis estratégicos e quebras de linha",
  "hashtags": ["exatamente 30 hashtags sem #, estrategicamente selecionadas"],
  "visual_prompt": "detailed professional photography prompt in English with scene, lighting, mood, style, brand colors ${client.primary_color} and ${client.secondary_color}",
  "layout_prompt": "Instagram design composition in English: describe text overlay position (bottom third / left panel / right side), overlay style (glassmorphism frosted panel / solid brand color strip / dark gradient), typography weight (bold 900 / display), and how subject and text interact. Example: 'Product centered right, bold headline text panel on left third with brand primary color ${client.primary_color} glassmorphism overlay, white typography, brand strip at bottom with logo'",
  "framework_used": "${framework}",
  "hook_type": "${hook}"
}`;
}

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const {
      client_id,
      theme,
      objective,
      format,
      pilar,
      publico_especifico,
      dor_desejo,
      hook_type,
    } = await req.json() as {
      client_id: string;
      theme: string;
      objective: string;
      format: string;
      pilar?: string;
      publico_especifico?: string;
      dor_desejo?: string;
      hook_type?: string;
    };

    if (!client_id || !theme || !objective || !format) {
      return NextResponse.json({ error: "client_id, theme, objective e format são obrigatórios" }, { status: 400 });
    }

    const clientDoc = await adminDb.collection("clients").doc(client_id).get();
    if (!clientDoc.exists || clientDoc.data()?.agency_id !== user.uid) {
      return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
    }

    const client = { id: clientDoc.id, ...clientDoc.data() } as BrandProfile;

    const strategy: StrategyContext = {};
    if (pilar)             strategy.pilar             = pilar;
    if (publico_especifico) strategy.publico_especifico = publico_especifico;
    if (dor_desejo)        strategy.dor_desejo        = dor_desejo;
    if (hook_type)         strategy.hook_type         = hook_type;

    const response = await anthropic.messages.create({
      model:      MODEL,
      max_tokens: 2048,
      system:     buildSystemPrompt(client, format, objective, Object.keys(strategy).length ? strategy : undefined),
      messages: [{
        role:    "user",
        content: `Tema: ${theme}\nObjetivo: ${objective}\n\nEscreva o melhor post possível para este cliente seguindo o framework selecionado.`,
      }],
    });

    const raw     = response.content[0].type === "text" ? response.content[0].text : "";
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();

    let copy: CopyResult;
    try {
      copy = JSON.parse(cleaned) as CopyResult;
    } catch {
      return NextResponse.json({ error: "Falha ao parsear resposta da IA", raw }, { status: 500 });
    }

    const ref = adminDb.collection("posts").doc();
    await ref.set({
      id:              ref.id,
      agency_id:       user.uid,
      client_id,
      client_name:     client.name,
      theme,
      objective,
      format,
      visual_headline: copy.visual_headline,
      headline:        copy.headline,
      caption:         copy.caption,
      hashtags:        copy.hashtags,
      visual_prompt:   copy.visual_prompt,
      layout_prompt:   copy.layout_prompt ?? null,
      framework_used:  copy.framework_used,
      hook_type:       copy.hook_type,
      image_url:       null,
      status:          "ready",
      created_at:      FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ post_id: ref.id, ...copy });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro interno";
    console.error("[POST /api/posts/generate-copy]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
