/**
 * POST /api/clients/[id]/design-examples/import-images
 *
 * Accepts images as base64 directly from the browser (used when the
 * server-side Instagram scraping is blocked). The browser script runs
 * on instagram.com, extracts images client-side, and POSTs them here
 * with credentials: 'include' so the PostAI session cookie is forwarded.
 *
 * Body: {
 *   images: Array<{ base64: string; mediaType: string; source_url: string }>
 * }
 *
 * CORS is enabled for instagram.com so the script can call this endpoint
 * cross-origin while carrying the user's PostAI session cookie.
 */

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { adminDb } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/session";
import { FieldValue } from "firebase-admin/firestore";
import { DESIGN_EXAMPLE_ANALYSIS_PROMPT } from "@/lib/prompts/design-example-analysis";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL     = "claude-opus-4-6";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin":      "https://www.instagram.com",
  "Access-Control-Allow-Methods":     "POST, OPTIONS",
  "Access-Control-Allow-Headers":     "Content-Type",
  "Access-Control-Allow-Credentials": "true",
};

// Handle CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

interface IncomingImage {
  base64:     string;
  mediaType:  string;
  source_url: string;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return new NextResponse(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
    }

    const { id: client_id } = await params;

    const clientDoc = await adminDb.collection("clients").doc(client_id).get();
    if (!clientDoc.exists || clientDoc.data()?.agency_id !== user.uid) {
      return new NextResponse(JSON.stringify({ error: "Cliente não encontrado" }), {
        status: 404,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
    }

    const body   = await req.json() as { images?: IncomingImage[] };
    const images = body.images ?? [];

    if (!images.length) {
      return new NextResponse(JSON.stringify({ error: "Nenhuma imagem enviada" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
    }

    const examplesRef = adminDb
      .collection("clients").doc(client_id)
      .collection("design_examples");

    let imported = 0;
    let failed   = 0;
    const results: { source_url: string; status: string; example_id?: string; error?: string }[] = [];

    for (const img of images) {
      try {
        const mediaType = (
          img.mediaType?.startsWith("image/png")  ? "image/png"  :
          img.mediaType?.startsWith("image/webp") ? "image/webp" :
          "image/jpeg"
        ) as "image/jpeg" | "image/png" | "image/webp";

        // Claude Vision analysis
        const response = await anthropic.messages.create({
          model:      MODEL,
          max_tokens: 1024,
          messages: [{
            role:    "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mediaType, data: img.base64 } },
              { type: "text",  text: DESIGN_EXAMPLE_ANALYSIS_PROMPT },
            ],
          }],
        });

        const raw      = response.content[0].type === "text" ? response.content[0].text : "";
        const cleaned  = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
        const analysis = JSON.parse(cleaned) as Record<string, string>;

        const ref = examplesRef.doc();
        await ref.set({
          id:                    ref.id,
          agency_id:             user.uid,
          client_id,
          visual_prompt:         analysis.visual_prompt         ?? "",
          layout_prompt:         analysis.layout_prompt         ?? "",
          visual_headline_style: analysis.visual_headline_style ?? "",
          pilar:                 analysis.pilar                 ?? "Produto",
          format:                analysis.format                ?? "feed",
          description:           analysis.description           ?? "",
          color_mood:            analysis.color_mood            ?? "",
          composition_zone:      analysis.composition_zone      ?? "bottom",
          source_url:            img.source_url ?? null,
          image_url:             null,
          created_at:            FieldValue.serverTimestamp(),
        });

        results.push({ source_url: img.source_url, status: "success", example_id: ref.id });
        imported++;
      } catch (e) {
        const reason = e instanceof Error ? e.message : "erro desconhecido";
        results.push({ source_url: img.source_url, status: "failed", error: reason });
        failed++;
      }
    }

    return new NextResponse(
      JSON.stringify({ imported, failed, total: images.length, results }),
      { status: 200, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
    );

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro interno";
    console.error("[POST /api/clients/[id]/design-examples/import-images]", message);
    return new NextResponse(
      JSON.stringify({ error: message }),
      { status: 500, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
    );
  }
}
