/**
 * POST /api/posts/[id]/repurpose
 *
 * Gera variações de formato a partir de um post aprovado ou pronto.
 *
 * Body:  { target_formats: Array<"feed"|"stories"|"reels_cover"|"linkedin_post"|"linkedin_carousel"> }
 * Response: { repurposed_posts: Array<{ post_id: string; format: string; headline: string; error?: string }> }
 *
 * Regras de reaproveitamento de imagem (aspect ratio):
 *   Portrait 4:5  → "feed"
 *   Vertical 9:16 → "stories", "reels_cover"
 *   Text-only     → "linkedin_post", "linkedin_carousel"
 */

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { adminDb } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/session";
import { FieldValue } from "firebase-admin/firestore";
import type { BrandProfile, GeneratedPost } from "@/types";

export const maxDuration = 60;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL     = process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001";

// ── Aspect-ratio groups for image reuse ─────────────────────────────────────

const ASPECT_GROUP: Record<string, string> = {
  feed:               "portrait_4_5",
  stories:            "vertical_9_16",
  reels_cover:        "vertical_9_16",
  linkedin_post:      "text_only",
  linkedin_carousel:  "text_only",
};

function canReuseImage(originalFormat: string, targetFormat: string): boolean {
  const og = ASPECT_GROUP[originalFormat];
  const tg = ASPECT_GROUP[targetFormat];
  // Both groups must be defined and must match; text-only never reuses a real image
  if (!og || !tg) return false;
  if (tg === "text_only") return false;
  return og === tg;
}

// ── Format constraints injected into the system prompt ───────────────────────

const FORMAT_CONSTRAINTS: Record<string, string> = {
  feed: `FEED (1080×1350 — retrato 4:5):
- Legenda completa com estrutura de storytelling: Hook → Desenvolvimento → Prova/Benefício → CTA.
- Máximo 2200 chars. Quebras de linha duplas entre blocos.
- Primeiros 125 chars devem conter o hook (aparecem antes do "ver mais").
- CTA específico no final: verbo de ação + benefício claro.
- Emojis estratégicos: no máximo 1 por parágrafo.
- Hashtags: mix de nicho, médio alcance e alta relevância (até 30).`,

  stories: `STORIES (1080×1920 — vertical 9:16):
- Caption CURTÍSSIMA: máximo 3 frases.
- visual_headline = foco total — é o que aparece na arte.
- CTA urgente e direto: "Clique aqui", "Arraste pra cima", "Responda".
- Tom conversacional, como mensagem de amigo.
- Emojis: 1-2 no máximo.
- Hashtags: até 5, ultra-relevantes.`,

  reels_cover: `CAPA DE REELS (1080×1920 — vertical 9:16):
- visual_headline = razão do clique — é TUDO. Use número ou pergunta.
- Caption complementa, NÃO repete o headline.
- Tom provocador e intrigante: o espectador deve pensar "preciso ver isso".
- Caption máx 3 frases.
- Hashtags: até 10.`,

  linkedin_post: `POST LINKEDIN (até 3000 chars — texto corrido):
- Linhas 1 e 2 CRÍTICAS — aparecem antes do "ver mais". Devem gerar clique compulsório.
- Parágrafos curtos: 1 a 3 linhas. Linha em branco entre cada bloco.
- Tom profissional e humano — voz de pessoa, não de empresa.
- CTA final que gera debate: "O que você acha?", "Já passou por isso?".
- Hashtags: máximo 5, ultra-relevantes para o nicho.
- NUNCA comece com "Hoje quero falar sobre..." ou "Venho compartilhar...".`,

  linkedin_carousel: `CARROSSEL LINKEDIN:
- Caption: Hook forte nas 2 primeiras linhas + promessa do conteúdo + CTA para salvar.
- visual_headline = título do slide 1 / capa (impacto máximo, máx 6 palavras).
- Hashtags: máximo 5.
- Tom profissional, insights reais, sem jargão vazio.`,
};

// ── LinkedIn tone note ────────────────────────────────────────────────────────

function isLinkedInFormat(format: string): boolean {
  return format === "linkedin_post" || format === "linkedin_carousel";
}

// ── JSON parse helper (same robust strategy used in generate-copy) ────────────

interface RepurposedCopy {
  visual_headline: string;
  headline:        string;
  caption:         string;
  hashtags:        string[];
}

function extractJson(text: string): RepurposedCopy | null {
  // 1. Strip markdown fences
  const stripped = text
    .replace(/^```(?:json)?\s*/im, "")
    .replace(/\s*```\s*$/m, "")
    .trim();
  try { return JSON.parse(stripped) as RepurposedCopy; } catch { /* continue */ }

  // 2. Extract from first { to last }
  const first = text.indexOf("{");
  const last  = text.lastIndexOf("}");
  if (first !== -1 && last > first) {
    try { return JSON.parse(text.slice(first, last + 1)) as RepurposedCopy; } catch { /* continue */ }
  }

  // 3. Last resort: try stripping directly
  try { return JSON.parse(text.trim()) as RepurposedCopy; } catch { /* give up */ }

  return null;
}

// ── Build system prompt for a given target format ────────────────────────────

function buildRepurposePrompt(
  client: BrandProfile,
  originalFormat: string,
  original: Pick<GeneratedPost, "visual_headline" | "headline" | "caption">,
  targetFormat: string,
): string {
  const constraints = FORMAT_CONSTRAINTS[targetFormat] ?? FORMAT_CONSTRAINTS.feed;
  const linkedinNote = isLinkedInFormat(targetFormat)
    ? "\nTOM LINKEDIN: profissional, pensamento de liderança, voz humana. Nunca corporativo genérico.\n"
    : "";

  const captionPreview = (original.caption ?? "").slice(0, 500);

  return `Você é um especialista em adaptação de conteúdo para redes sociais.
Adapte o post aprovado abaixo para o novo formato, mantendo a mensagem central.
Marca: ${client.name} | Tom: ${client.tone_of_voice}
${linkedinNote}
━━━━━━━━━━━━━━━━━━━━━━━━━━━
POST ORIGINAL (${originalFormat}):
Headline visual: "${original.visual_headline ?? ""}"
Headline: "${original.headline ?? ""}"
Caption: "${captionPreview}${(original.caption ?? "").length > 500 ? "..." : ""}"

━━━━━━━━━━━━━━━━━━━━━━━━━━━
FORMATO ALVO: ${targetFormat}
${constraints}

━━━━━━━━━━━━━━━━━━━━━━━━━━━
REGRAS ABSOLUTAS:
1. visual_headline: MÁXIMO 6 PALAVRAS. Texto sobreposto na imagem — deve funcionar sozinho.
2. headline: máximo 12 palavras. Versão expandida para display.
3. Escreva como humano. Zero frases genéricas. Zero "no mundo atual".
4. caption e hashtags devem respeitar EXATAMENTE as restrições do formato alvo acima.
5. NUNCA use palavras proibidas: ${client.avoid_words.length ? client.avoid_words.join(", ") : "nenhuma"}.

━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT — JSON VÁLIDO APENAS (sem markdown, sem explicações)
{
  "visual_headline": "máx 6 palavras para overlay",
  "headline": "headline adaptada ao formato (máx 12 palavras)",
  "caption": "legenda adaptada ao formato alvo, com quebras de linha reais (\\n)",
  "hashtags": ["hashtags sem #, adequadas ao formato"]
}`;
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;

    // ── Load and validate original post ──────────────────────────────────────

    const postDoc = await adminDb.collection("posts").doc(id).get();
    if (!postDoc.exists) {
      return NextResponse.json({ error: "Post não encontrado" }, { status: 404 });
    }

    const postData = postDoc.data() ?? {};
    const post = { id: postDoc.id, ...postData } as GeneratedPost;
    // pilar and tema are written by generate-copy/generate but are not in the shared type
    const postPilar = (postData.pilar as string | undefined) ?? null;
    const postTema  = (postData.tema  as string | undefined) ?? null;

    if (post.agency_id !== user.uid) {
      return NextResponse.json({ error: "Post não encontrado" }, { status: 404 });
    }

    if (post.status !== "approved" && post.status !== "ready") {
      return NextResponse.json(
        { error: "O post precisa ter status 'approved' ou 'ready' para ser repurposed." },
        { status: 400 },
      );
    }

    if (!post.caption || !post.visual_headline) {
      return NextResponse.json(
        { error: "O post precisa ter caption e visual_headline para ser repurposed." },
        { status: 400 },
      );
    }

    // ── Load brand profile ────────────────────────────────────────────────────

    const clientDoc = await adminDb.collection("clients").doc(post.client_id).get();
    if (!clientDoc.exists || clientDoc.data()?.agency_id !== user.uid) {
      return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
    }

    const client = { id: clientDoc.id, ...clientDoc.data() } as BrandProfile;

    // ── Validate target_formats ───────────────────────────────────────────────

    const VALID_FORMATS = ["feed", "stories", "reels_cover", "linkedin_post", "linkedin_carousel"] as const;
    type ValidFormat = typeof VALID_FORMATS[number];

    const body = await req.json() as { target_formats?: unknown };

    if (!Array.isArray(body.target_formats) || body.target_formats.length === 0) {
      return NextResponse.json(
        { error: "target_formats é obrigatório e deve ser um array não-vazio." },
        { status: 400 },
      );
    }

    // Filter: remove invalid values, remove original format, cap at 4
    const sanitized: ValidFormat[] = (body.target_formats as string[])
      .filter((f): f is ValidFormat => VALID_FORMATS.includes(f as ValidFormat))
      .filter(f => f !== post.format)
      .slice(0, 4);

    if (sanitized.length === 0) {
      return NextResponse.json(
        { error: "Nenhum formato alvo válido (ou todos iguais ao formato original)." },
        { status: 400 },
      );
    }

    // ── Process each format sequentially ─────────────────────────────────────

    const repurposed_posts: Array<{
      post_id?: string;
      format: string;
      headline?: string;
      error?: string;
    }> = [];

    for (const targetFormat of sanitized) {
      try {
        // Call Claude to adapt the copy
        const response = await anthropic.messages.create({
          model:      MODEL,
          max_tokens: 2048,
          system:     buildRepurposePrompt(client, post.format, post, targetFormat),
          messages:   [{ role: "user", content: `Adapte para ${targetFormat}` }],
        });

        const raw  = response.content[0].type === "text" ? response.content[0].text : "";
        const copy = extractJson(raw);

        if (!copy) {
          console.error(`[repurpose] JSON inválido para formato ${targetFormat}:`, raw.slice(0, 300));
          repurposed_posts.push({
            format: targetFormat,
            error:  "Falha ao parsear resposta da IA para este formato.",
          });
          continue;
        }

        // Determine whether the original image can be reused
        const reuseImage = canReuseImage(post.format, targetFormat);

        // Persist new post document
        const ref = adminDb.collection("posts").doc();
        await ref.set({
          id:               ref.id,
          agency_id:        user.uid,
          client_id:        post.client_id,
          client_name:      post.client_name,
          pilar:            postPilar,
          tema:             postTema,
          objective:        post.objective        ?? null,
          format:           targetFormat,
          visual_headline:  copy.visual_headline,
          headline:         copy.headline,
          caption:          copy.caption,
          hashtags:         copy.hashtags,
          visual_prompt:    post.visual_prompt    ?? null,
          image_url:        reuseImage ? (post.image_url ?? null) : null,
          status:           "ready",
          repurposed_from:  id,
          created_at:       FieldValue.serverTimestamp(),
        });

        repurposed_posts.push({
          post_id:  ref.id,
          format:   targetFormat,
          headline: copy.headline,
        });

      } catch (formatErr: unknown) {
        const message = formatErr instanceof Error ? formatErr.message : "Erro interno";
        console.error(`[repurpose] Erro ao processar formato ${targetFormat}:`, message);
        repurposed_posts.push({
          format: targetFormat,
          error:  message,
        });
      }
    }

    return NextResponse.json({ repurposed_posts });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro interno";
    console.error("[POST /api/posts/[id]/repurpose]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
