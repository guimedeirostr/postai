/**
 * POST /api/clients/[id]/design-examples/import
 *
 * Imports Instagram posts as design examples for a client.
 * For each URL provided:
 *   1. Fetches the Instagram page and extracts og:image
 *   2. Downloads the image and converts to base64
 *   3. Sends to Claude Vision for structured analysis
 *   4. Saves the result as a design_example in Firestore
 *
 * Body: { urls: string[] }  — array of Instagram post URLs
 *
 * Returns per-URL results: { imported, failed, results[] }
 */

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { adminDb } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/session";
import { FieldValue } from "firebase-admin/firestore";
import { DESIGN_EXAMPLE_ANALYSIS_PROMPT } from "@/lib/prompts/design-example-analysis";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL     = "claude-opus-4-6"; // Vision requires a capable model

// Browser-like headers to get past Instagram's basic bot detection
const BROWSER_HEADERS = {
  "User-Agent":      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
  "Cache-Control":   "no-cache",
};

interface ImportResult {
  url:        string;
  status:     "success" | "failed";
  example_id?: string;
  image_url?:  string;
  error?:      string;
}

/** Fetches an Instagram page and extracts the og:image URL */
async function extractOgImage(postUrl: string): Promise<string | null> {
  try {
    const res = await fetch(postUrl, {
      headers: BROWSER_HEADERS,
      redirect: "follow",
    });

    if (!res.ok) return null;

    const html = await res.text();

    // Try og:image first
    const ogMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
                 ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    if (ogMatch?.[1]) return ogMatch[1];

    // Fallback: twitter:image
    const twMatch = html.match(/<meta[^>]+property=["']twitter:image["'][^>]+content=["']([^"']+)["']/i)
                 ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']twitter:image["']/i);
    if (twMatch?.[1]) return twMatch[1];

    return null;
  } catch {
    return null;
  }
}

/** Downloads an image URL and returns base64 + mediaType */
async function fetchImageAsBase64(
  url: string
): Promise<{ base64: string; mediaType: "image/jpeg" | "image/png" | "image/webp" } | null> {
  try {
    const res = await fetch(url, { headers: BROWSER_HEADERS });
    if (!res.ok) return null;

    const contentType = res.headers.get("content-type") ?? "image/jpeg";
    const mediaType   = contentType.startsWith("image/png")  ? "image/png"
                      : contentType.startsWith("image/webp") ? "image/webp"
                      : "image/jpeg";

    const buffer = await res.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    return { base64, mediaType };
  } catch {
    return null;
  }
}

/** Calls Claude Vision to analyze the Instagram image */
async function analyzeWithClaude(
  base64: string,
  mediaType: "image/jpeg" | "image/png" | "image/webp"
): Promise<Record<string, string> | null> {
  try {
    const response = await anthropic.messages.create({
      model:      MODEL,
      max_tokens: 1024,
      messages: [{
        role:    "user",
        content: [
          {
            type:   "image",
            source: { type: "base64", media_type: mediaType, data: base64 },
          },
          {
            type: "text",
            text: DESIGN_EXAMPLE_ANALYSIS_PROMPT,
          },
        ],
      }],
    });

    const raw     = response.content[0].type === "text" ? response.content[0].text : "";
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
    return JSON.parse(cleaned) as Record<string, string>;
  } catch {
    return null;
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id: client_id } = await params;

    const clientDoc = await adminDb.collection("clients").doc(client_id).get();
    if (!clientDoc.exists || clientDoc.data()?.agency_id !== user.uid) {
      return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
    }

    const body = await req.json() as { urls?: string[] };
    const urls = body.urls ?? [];

    if (!urls.length) {
      return NextResponse.json({ error: "Envie ao menos uma URL" }, { status: 400 });
    }
    if (urls.length > 60) {
      return NextResponse.json({ error: "Máximo 60 URLs por importação" }, { status: 400 });
    }

    const results: ImportResult[] = [];
    let imported = 0;
    let failed   = 0;

    const examplesRef = adminDb
      .collection("clients").doc(client_id)
      .collection("design_examples");

    for (const url of urls) {
      const trimmedUrl = url.trim();
      if (!trimmedUrl) continue;

      // ── Step 1: Extract og:image ────────────────────────────────────────────
      const imageUrl = await extractOgImage(trimmedUrl);
      if (!imageUrl) {
        results.push({
          url:    trimmedUrl,
          status: "failed",
          error:  "Não foi possível extrair a imagem. Instagram pode ter bloqueado ou a URL é privada.",
        });
        failed++;
        continue;
      }

      // ── Step 2: Download image ──────────────────────────────────────────────
      const imageData = await fetchImageAsBase64(imageUrl);
      if (!imageData) {
        results.push({
          url:    trimmedUrl,
          status: "failed",
          error:  "Imagem encontrada mas não foi possível baixá-la.",
        });
        failed++;
        continue;
      }

      // ── Step 3: Claude Vision analysis ─────────────────────────────────────
      const analysis = await analyzeWithClaude(imageData.base64, imageData.mediaType);
      if (!analysis) {
        results.push({
          url:    trimmedUrl,
          status: "failed",
          error:  "Falha na análise da imagem com Claude Vision.",
        });
        failed++;
        continue;
      }

      // ── Step 4: Save to Firestore ───────────────────────────────────────────
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
        source_url:            trimmedUrl,
        image_url:             imageUrl,
        created_at:            FieldValue.serverTimestamp(),
      });

      results.push({
        url:        trimmedUrl,
        status:     "success",
        example_id: ref.id,
        image_url:  imageUrl,
      });
      imported++;
    }

    return NextResponse.json({ imported, failed, total: urls.length, results });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro interno";
    console.error("[POST /api/clients/[id]/design-examples/import]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
