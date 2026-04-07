/**
 * POST /api/clients/[id]/analyze-reference
 *
 * Analisa uma imagem de referência visual usando o Analisador Visual Blueprint.
 * O Claude extrai o DNA visual completo da imagem e salva como design_example
 * no Firestore para ser usado como referência pelo Art Director Agent.
 *
 * Body (JSON):
 *   image_url:    string  — URL pública da imagem (Instagram og:image, R2, etc)
 *   source_url?:  string  — URL original do post no Instagram
 *   format?:      "feed" | "stories" | "reels_cover"  (hint opcional)
 *
 * Resposta:
 *   { id, visual_prompt, layout_prompt, pilar, format, description }
 */

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { adminDb } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/session";
import { FieldValue } from "firebase-admin/firestore";
import { buildReferenceDNAPrompt } from "@/lib/prompts/design-example-analysis";
import type { DesignExample, LogoPlacement } from "@/types";

// Claude Vision pode levar 20-40s — aumentar para evitar 504
export const maxDuration = 90;

// ── Anthropic client ─────────────────────────────────────────────────────────
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
// Visão requer Sonnet — Haiku não suporta imagens com schema estruturado
const MODEL = process.env.ANALYZER_MODEL ?? "claude-sonnet-4-6";

// ── Route handler ────────────────────────────────────────────────────────────
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id: client_id } = await params;

    // ── Verificar ownership do cliente ────────────────────────────────────────
    const clientDoc = await adminDb.collection("clients").doc(client_id).get();
    if (!clientDoc.exists || clientDoc.data()?.agency_id !== user.uid) {
      return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
    }

    // ── Ler body ──────────────────────────────────────────────────────────────
    const body = await req.json() as {
      image_url?:    string;
      source_url?:   string;
      image_base64?: string;  // upload direto do browser — preferido
      image_type?:   string;
      format?:       "feed" | "stories" | "reels_cover";
    };

    if (!body.image_base64 && !body.image_url && !body.source_url) {
      return NextResponse.json({ error: "image_base64, image_url ou source_url é obrigatório" }, { status: 400 });
    }

    // ── Resolver base64 da imagem ─────────────────────────────────────────────
    let base64Data: string;
    let mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
    let resolvedImageUrl = "";

    if (body.image_base64) {
      // Upload direto — sem fetch externo, sempre funciona
      base64Data    = body.image_base64;
      mediaType     = (body.image_type ?? "image/jpeg") as typeof mediaType;
      resolvedImageUrl = ""; // sem URL pública para retornar
    } else {
      // Fallback: buscar por URL
      let imageUrl = body.image_url ?? "";

      if (!imageUrl && body.source_url) {
        if (/instagram\.com/.test(body.source_url)) {
          return NextResponse.json(
            { error: "URLs do Instagram bloqueiam acesso server-side. Use o upload de imagem: salve o post como imagem e faça upload." },
            { status: 422 }
          );
        }
        imageUrl = body.source_url;
      }

      const imgResponse = await fetch(imageUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; PostAI/1.0)" },
        signal:  AbortSignal.timeout(15_000),
      });
      if (!imgResponse.ok) {
        return NextResponse.json(
          { error: `Não foi possível baixar a imagem: HTTP ${imgResponse.status}` },
          { status: 422 }
        );
      }

      const contentType = imgResponse.headers.get("content-type") ?? "image/jpeg";
      mediaType         = (contentType.split(";")[0].trim()) as typeof mediaType;
      const imgBuffer   = await imgResponse.arrayBuffer();
      base64Data        = Buffer.from(imgBuffer).toString("base64");
      resolvedImageUrl  = imageUrl;
    };

    // ── Chamar Claude Vision com prompt rico (ReferenceDNA completo) ──────────
    // Unifica os dois fluxos: agora este endpoint extrai TODOS os campos do DNA
    // (text_zones, background_treatment, headline_style, typography_hierarchy,
    // logo_placement) — antes estavam apenas em /api/posts/analyze-reference.
    const message = await anthropic.messages.create({
      model:      MODEL,
      max_tokens: 1600,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data: base64Data },
            },
            {
              type: "text",
              text: buildReferenceDNAPrompt()
                + (body.format ? `\n\nFormato inferido: ${body.format}` : ""),
            },
          ],
        },
      ],
    });

    // ── Parsear JSON retornado ────────────────────────────────────────────────
    const rawText = message.content
      .filter(b => b.type === "text")
      .map(b => (b as { type: "text"; text: string }).text)
      .join("");

    // Extrai JSON de forma robusta (remove markdown fences, tenta reparar truncamento)
    function extractJson(text: string): Record<string, string> | null {
      const stripped = text.replace(/^```(?:json)?\s*/im, "").replace(/\s*```\s*$/m, "").trim();
      try { return JSON.parse(stripped) as Record<string, string>; } catch { /* continua */ }
      const first = text.indexOf("{");
      const last  = text.lastIndexOf("}");
      if (first !== -1 && last > first) {
        try { return JSON.parse(text.slice(first, last + 1)) as Record<string, string>; } catch { /* continua */ }
      }
      return null;
    }

    const parsed = extractJson(rawText);
    if (!parsed) {
      console.error("[analyze-reference] JSON inválido:", rawText.slice(0, 400));
      return NextResponse.json({ error: "Claude retornou JSON inválido. Tente novamente." }, { status: 500 });
    }

    // ── Mapear campos (básicos + ricos do ReferenceDNA) ───────────────────────
    const visual_prompt         = parsed.visual_prompt ?? "";
    const layout_prompt         = parsed.layout_prompt ?? "";
    const visual_headline_style = parsed.visual_headline_style ?? "";
    const description           = parsed.description ?? "";
    const color_mood            = parsed.color_mood ?? "";
    const pilar                 = parsed.pilar ?? "Produto";
    const format                = (body.format ?? parsed.format ?? "feed") as "feed" | "stories" | "reels_cover";
    const composition_zone      = (parsed.composition_zone ?? "bottom") as DesignExample["composition_zone"];

    // Campos ricos — opcionais, podem faltar se Claude simplificar
    const text_zones            = parsed.text_zones;
    const background_treatment  = parsed.background_treatment;
    const headline_style        = parsed.headline_style;
    const typography_hierarchy  = parsed.typography_hierarchy;
    const logo_placement        = parsed.logo_placement as LogoPlacement | undefined;

    if (!visual_prompt || !layout_prompt) {
      return NextResponse.json(
        { error: "Análise incompleta: visual_prompt ou layout_prompt ausente. Tente com outra imagem." },
        { status: 500 }
      );
    }

    // ── Salvar no Firestore como design_example (rico) ────────────────────────
    const ref = adminDb
      .collection("clients").doc(client_id)
      .collection("design_examples").doc();

    const example: Omit<DesignExample, "id" | "created_at"> = {
      agency_id:            user.uid,
      client_id,
      visual_prompt,
      layout_prompt,
      visual_headline_style,
      pilar,
      format,
      description,
      color_mood,
      composition_zone,
      ...(body.source_url ? { source_url: body.source_url } : {}),
      image_url:            resolvedImageUrl,
      ...(text_zones           ? { text_zones }           : {}),
      ...(background_treatment ? { background_treatment } : {}),
      ...(headline_style       ? { headline_style }       : {}),
      ...(typography_hierarchy ? { typography_hierarchy } : {}),
      ...(logo_placement       ? { logo_placement }       : {}),
      intent:               "library",
    };

    await ref.set({
      id:         ref.id,
      ...example,
      created_at: FieldValue.serverTimestamp(),
    });

    // ── Resposta (inclui todos os campos ricos para a UI atualizar) ──────────
    return NextResponse.json({
      id:                    ref.id,
      visual_prompt,
      layout_prompt,
      visual_headline_style,
      pilar,
      format,
      description,
      color_mood,
      composition_zone,
      text_zones,
      background_treatment,
      headline_style,
      typography_hierarchy,
      logo_placement,
      image_url:             resolvedImageUrl,
    }, { status: 201 });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro interno";
    console.error("[POST /api/clients/[id]/analyze-reference]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
