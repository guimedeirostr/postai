/**
 * POST /api/posts/refine-html
 *
 * Refina um template HTML de post Instagram usando Claude.
 * Recebe o HTML atual + contexto da marca e retorna um HTML melhorado.
 *
 * Body: {
 *   post_id:               string;
 *   current_html:          string;   — HTML atual gerado pelo compositor
 *   reference_image_url?:  string;   — data URL da imagem de referência (para análise visual)
 *   style_hint?:           string;   — instrução livre ("mais dark", "tipografia maior", etc.)
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { adminDb } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/session";
import type { GeneratedPost, BrandProfile } from "@/types";

export const maxDuration = 45;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json() as {
      post_id:              string;
      current_html:         string;
      reference_image_url?: string;
      style_hint?:          string;
    };

    const { post_id, current_html, reference_image_url, style_hint } = body;

    if (!post_id || !current_html) {
      return NextResponse.json({ error: "post_id e current_html são obrigatórios" }, { status: 400 });
    }

    // ── Carregar post + cliente ───────────────────────────────────────────────
    const postDoc = await adminDb.collection("posts").doc(post_id).get();
    if (!postDoc.exists) return NextResponse.json({ error: "Post não encontrado" }, { status: 404 });

    const post = postDoc.data() as GeneratedPost;
    if (post.agency_id !== user.uid) return NextResponse.json({ error: "Acesso negado" }, { status: 403 });

    const clientDoc = await adminDb.collection("clients").doc(post.client_id).get();
    const client = clientDoc.exists ? { id: clientDoc.id, ...clientDoc.data() } as BrandProfile : null;

    // ── Construir mensagem Claude ─────────────────────────────────────────────
    type ContentBlock = Anthropic.TextBlockParam | Anthropic.ImageBlockParam;
    const userContent: ContentBlock[] = [];

    // Se há imagem de referência, inclui para análise visual
    if (reference_image_url) {
      if (reference_image_url.startsWith("data:")) {
        const [header, base64data] = reference_image_url.split(",");
        const mimeMatch = header.match(/data:([^;]+)/);
        const mediaType = (mimeMatch?.[1] ?? "image/jpeg") as "image/jpeg" | "image/png" | "image/gif" | "image/webp";
        userContent.push({
          type: "image",
          source: { type: "base64", media_type: mediaType, data: base64data },
        });
        userContent.push({
          type: "text",
          text: "Imagem de referência de estilo (inspire-se nesta para refinar o layout):",
        });
      } else if (reference_image_url.startsWith("http")) {
        userContent.push({
          type: "image",
          source: { type: "url", url: reference_image_url },
        });
        userContent.push({
          type: "text",
          text: "Imagem de referência de estilo (inspire-se nesta para refinar o layout):",
        });
      }
    }

    const brandContext = client
      ? `Marca: ${client.name}
Cor primária: ${client.primary_color}
Cor secundária: ${client.secondary_color}
Segmento: ${(client as unknown as Record<string, unknown>).segment ?? "não especificado"}`
      : "";

    const styleInstruction = style_hint
      ? `\nInstrução de estilo do usuário: "${style_hint}"`
      : "";

    userContent.push({
      type: "text",
      text: `Você é um diretor de arte sênior especializado em posts para Instagram de agências brasileiras.

Refine o HTML/CSS abaixo para maximizar a qualidade visual profissional.

REGRAS:
- Mantenha a mesma estrutura HTML e os mesmos placeholders de texto
- Pode melhorar: gradientes, text-shadow, letter-spacing, hierarquia tipográfica, harmonia de cores
- Pode trocar: pesos de fonte, espaçamentos, transformações, sombras, opacidades de overlay
- NÃO altere: conteúdo de texto, URLs de imagem, estrutura de divs
- Use Google Fonts via CDN (já importadas)
- Saída: APENAS o HTML refinado completo, sem explicação ou markdown

${brandContext}${styleInstruction}

HTML ATUAL:
\`\`\`html
${current_html}
\`\`\``,
    });

    // ── Chamar Claude ─────────────────────────────────────────────────────────
    const model = process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001";

    const response = await anthropic.messages.create({
      model,
      max_tokens: 4096,
      system: "Você é um especialista em HTML/CSS para design de Instagram. Retorne APENAS o HTML completo refinado, sem markdown, sem explicações.",
      messages: [{ role: "user", content: userContent }],
    });

    const rawText = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map(b => b.text)
      .join("");

    // Extrai HTML de possíveis markdown fences
    const htmlMatch = rawText.match(/```html\s*([\s\S]+?)```/) ?? rawText.match(/```\s*([\s\S]+?)```/);
    const refined_html = htmlMatch ? htmlMatch[1].trim() : rawText.trim();

    if (!refined_html.includes("<html") && !refined_html.includes("<!DOCTYPE")) {
      return NextResponse.json({ error: "Claude não retornou HTML válido" }, { status: 500 });
    }

    return NextResponse.json({ refined_html, ok: true });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro interno";
    console.error("[POST /api/posts/refine-html]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
