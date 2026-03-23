import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getSessionUser } from "@/lib/session";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL     = process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001";

export type CompositionZone = "left" | "right" | "bottom" | "top" | "center";

export interface CompositionResult {
  zone:                CompositionZone;
  subject_side:        "left" | "right" | "center" | "top" | "bottom";
  brightness:          "dark" | "medium" | "bright";
  subject_description: string;
  reasoning:           string;
}

/**
 * POST /api/posts/analyze-composition
 * Body: { image_url: string }
 *
 * Uses Claude Vision to detect the main subject position and returns the
 * optimal text-overlay zone (the area with most empty/safe space).
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { image_url } = (await req.json()) as { image_url?: string };
    if (!image_url) return NextResponse.json({ error: "image_url required" }, { status: 400 });

    // Fetch image server-side (no CORS issue)
    const imgRes = await fetch(image_url, {
      headers: { "User-Agent": "PostAI-Composer/1.0" },
    });
    if (!imgRes.ok) {
      return NextResponse.json({ error: `Could not fetch image: ${imgRes.status}` }, { status: 502 });
    }

    const buffer    = Buffer.from(await imgRes.arrayBuffer());
    const base64    = buffer.toString("base64");
    const rawType   = imgRes.headers.get("content-type") ?? "image/jpeg";
    // Claude only accepts these media types
    const mediaType = (["image/jpeg", "image/png", "image/gif", "image/webp"].includes(rawType)
      ? rawType
      : "image/jpeg") as "image/jpeg" | "image/png" | "image/gif" | "image/webp";

    const message = await anthropic.messages.create({
      model:      MODEL,
      max_tokens: 512,
      messages: [{
        role:    "user",
        content: [
          {
            type:   "image",
            source: { type: "base64", media_type: mediaType, data: base64 },
          },
          {
            type: "text",
            text: `Analyze this product/brand photo for Instagram post design. I need to place text overlays on this image.

Determine:
1. Where is the MAIN SUBJECT positioned? (left/right/center/top/bottom side of the image)
2. Which area has the most EMPTY SPACE safe for text overlays — the opposite of where the subject is? This is the "zone".
3. Is the overall image dark, medium, or bright? (affects text color choice)
4. Brief 1-sentence description of what's in the photo.

Rules:
- "zone" is where text should go (the EMPTY/SAFE area, NOT where the product is)
- If subject is centered, zone = "bottom"
- If subject is on the right, zone = "left"
- If subject is on the left, zone = "right"

Respond ONLY with valid JSON, no markdown:
{
  "zone": "left|right|bottom|top|center",
  "subject_side": "left|right|center|top|bottom",
  "brightness": "dark|medium|bright",
  "subject_description": "one sentence",
  "reasoning": "one sentence explaining your choice"
}`,
          },
        ],
      }],
    });

    const raw     = message.content[0].type === "text" ? message.content[0].text : "{}";
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();

    try {
      const result = JSON.parse(cleaned) as CompositionResult;
      return NextResponse.json(result);
    } catch {
      // Fallback — safe default
      return NextResponse.json<CompositionResult>({
        zone:                "bottom",
        subject_side:        "center",
        brightness:          "medium",
        subject_description: "",
        reasoning:           "Parse error — using default",
      });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro interno";
    console.error("[POST /api/posts/analyze-composition]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
