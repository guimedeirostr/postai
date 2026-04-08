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
import { buildHtmlTemplatePrompt } from "@/lib/prompts/html-template";
import { uploadToR2 } from "@/lib/r2";
import type { DesignExample, LogoPlacement } from "@/types";

// 2x Claude Vision em paralelo: DNA + HTML template — até 40s cada
export const maxDuration = 120;

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
      image_url?:       string;
      source_url?:      string;
      image_base64?:    string;
      image_type?:      string;
      format?:          "feed" | "stories" | "reels_cover" | "carousel";
      // Carrossel: array de slides (até 20)
      carousel_slides?: { b64: string; mime: string }[];
    };

    const isCarousel    = body.format === "carousel";
    const carouselSlides = body.carousel_slides ?? [];

    if (isCarousel) {
      if (carouselSlides.length === 0) {
        return NextResponse.json({ error: "Envie pelo menos 1 slide para analisar o carrossel." }, { status: 400 });
      }
    } else if (!body.image_base64 && !body.image_url && !body.source_url) {
      return NextResponse.json({ error: "image_base64, image_url ou source_url é obrigatório" }, { status: 400 });
    }

    // ── Resolver imagem(ns) ────────────────────────────────────────────────────
    type MediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

    // Constrói content blocks de imagem para o Claude
    let imageBlocks: Anthropic.ImageBlockParam[];
    let resolvedImageUrl = "";
    // Para o html_template usamos só a primeira imagem (ou a única)
    let firstB64: string;
    let firstMime: MediaType;

    if (isCarousel) {
      // Limita a 20 slides para controlar custo/latência
      const limited = carouselSlides.slice(0, 20);
      imageBlocks = limited.map(s => ({
        type: "image" as const,
        source: {
          type:       "base64" as const,
          media_type: (s.mime || "image/jpeg") as MediaType,
          data:       s.b64,
        },
      }));
      firstB64  = limited[0].b64;
      firstMime = (limited[0].mime || "image/jpeg") as MediaType;
    } else if (body.image_base64) {
      firstB64  = body.image_base64;
      firstMime = (body.image_type ?? "image/jpeg") as MediaType;
      imageBlocks = [{ type: "image", source: { type: "base64", media_type: firstMime, data: firstB64 } }];
    } else {
      let imageUrl = body.image_url ?? "";
      if (!imageUrl && body.source_url) {
        if (/instagram\.com/.test(body.source_url)) {
          return NextResponse.json(
            { error: "URLs do Instagram bloqueiam acesso server-side. Use o upload de imagem." },
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
        return NextResponse.json({ error: `Não foi possível baixar a imagem: HTTP ${imgResponse.status}` }, { status: 422 });
      }
      const contentType = imgResponse.headers.get("content-type") ?? "image/jpeg";
      firstMime         = (contentType.split(";")[0].trim()) as MediaType;
      firstB64          = Buffer.from(await imgResponse.arrayBuffer()).toString("base64");
      resolvedImageUrl  = imageUrl;
      imageBlocks       = [{ type: "image", source: { type: "base64", media_type: firstMime, data: firstB64 } }];
    }

    // ── Salvar imagem em R2 se não tiver URL pública ──────────────────────────
    // Uploads via base64 não têm URL — persistimos a thumb para a biblioteca.
    if (!resolvedImageUrl && firstB64) {
      try {
        const ext        = firstMime === "image/png" ? "png" : "jpg";
        const r2Key      = `design-examples/${user.uid}/${client_id}/${Date.now()}.${ext}`;
        const imgBuffer  = Buffer.from(firstB64, "base64");
        resolvedImageUrl = await uploadToR2(r2Key, imgBuffer, firstMime);
      } catch (uploadErr) {
        // Não fatal — a análise continua mesmo sem thumbnail
        console.warn("[analyze-reference] Falha ao salvar imagem em R2:", uploadErr);
      }
    }

    // Prefixo de contexto para carrossel
    const formatHint = body.format
      ? `\n\nFormato: ${body.format}${isCarousel && carouselSlides.length > 1 ? ` (${Math.min(carouselSlides.length, 20)} slides do mesmo carrossel — analise a sequência completa e extraia o padrão visual consistente entre os slides)` : ""}`
      : "";

    // ── Chamar Claude Vision em paralelo: DNA + HTML template ─────────────────
    const [message, htmlMessage] = await Promise.all([
      anthropic.messages.create({
        model:      MODEL,
        max_tokens: 1600,
        messages: [{
          role: "user",
          content: [
            ...imageBlocks,
            { type: "text", text: buildReferenceDNAPrompt() + formatHint },
          ],
        }],
      }),
      anthropic.messages.create({
        model:      MODEL,
        max_tokens: 4096,
        messages: [{
          role: "user",
          content: [
            // HTML template: só a primeira imagem (ou slide de capa)
            { type: "image", source: { type: "base64", media_type: firstMime, data: firstB64 } },
            { type: "text", text: buildHtmlTemplatePrompt() },
          ],
        }],
      }),
    ]);

    // ── Extrair HTML template ─────────────────────────────────────────────────
    const rawHtml = htmlMessage.content[0]?.type === "text" ? htmlMessage.content[0].text : "";
    const html_template = rawHtml
      .replace(/^```(?:html)?\s*/im, "")
      .replace(/\s*```\s*$/m, "")
      .trim();
    console.log(`[clients/analyze-reference] html_template gerado: ${html_template.length} chars`);

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
    const format                = (body.format ?? parsed.format ?? "feed") as "feed" | "stories" | "reels_cover" | "carousel";
    const composition_zone      = (parsed.composition_zone ?? "bottom") as DesignExample["composition_zone"];

    // Campos ricos — opcionais, podem faltar se Claude simplificar
    const text_zones            = parsed.text_zones;
    const background_treatment  = parsed.background_treatment;
    const headline_style        = parsed.headline_style;
    const typography_hierarchy  = parsed.typography_hierarchy;
    const logo_placement        = parsed.logo_placement as LogoPlacement | undefined;
    const headline_font         = parsed.headline_font;
    const headline_font_style   = parsed.headline_font_style;
    const headline_font_weight  = parsed.headline_font_weight;

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
      ...(logo_placement        ? { logo_placement }        : {}),
      ...(headline_font         ? { headline_font }         : {}),
      ...(headline_font_style   ? { headline_font_style }   : {}),
      ...(headline_font_weight  ? { headline_font_weight }  : {}),
      ...(html_template && html_template.length > 100 ? { html_template } : {}),
      intent:               "library",
    };

    await ref.set({
      id:         ref.id,
      ...example,
      created_at: FieldValue.serverTimestamp(),
    });
    console.log(`[clients/analyze-reference] design_example salvo: id=${ref.id}, html_template=${html_template.length} chars`);

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
