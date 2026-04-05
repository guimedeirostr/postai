/**
 * POST /api/posts/generate-art-direction
 *
 * Standalone Art Director agent. Two usage modes:
 *
 * Mode A — regenerate for existing post:
 *   { post_id: string }
 *   Loads post + client from Firestore, runs Art Director, saves result back to post.
 *
 * Mode B — manual / debug:
 *   { client_id, briefing, copy }
 *   Runs Art Director with provided data, returns result without saving.
 *
 * Useful for:
 *   - Regenerating art direction without re-running the full pipeline
 *   - Debugging / comparing art direction outputs
 *   - Testing style variations for a post
 */

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { adminDb } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/session";
import { buildArtDirectorPrompt } from "@/lib/prompts/art-director";
import type { ArtDirection, BrandProfile, DesignExample, GeneratedPost, StrategyBriefing } from "@/types";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL     = process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001";

function parseJson<T>(raw: string): T {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  return JSON.parse(cleaned) as T;
}

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json() as {
      post_id?:   string;
      client_id?: string;
      briefing?:  StrategyBriefing;
      copy?: {
        visual_headline: string;
        visual_prompt:   string;
        layout_prompt?:  string;
      };
    };

    let client:   BrandProfile;
    let briefing: StrategyBriefing;
    let copy: { visual_headline: string; visual_prompt: string; layout_prompt?: string };
    let postRef = null;

    if (body.post_id) {
      // ── Mode A: load from existing post ──────────────────────────────────────
      const postDoc = await adminDb.collection("posts").doc(body.post_id).get();
      if (!postDoc.exists || postDoc.data()?.agency_id !== user.uid) {
        return NextResponse.json({ error: "Post não encontrado" }, { status: 404 });
      }
      const post = { id: postDoc.id, ...postDoc.data() } as GeneratedPost & {
        pilar?: string; tema?: string; objetivo?: string; publico_especifico?: string;
        dor_desejo?: string; hook_type?: string; rationale?: string;
      };

      const clientDoc = await adminDb.collection("clients").doc(post.client_id).get();
      if (!clientDoc.exists || clientDoc.data()?.agency_id !== user.uid) {
        return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
      }

      client = { id: clientDoc.id, ...clientDoc.data() } as BrandProfile;
      briefing = {
        pilar:               post.pilar ?? "",
        tema:                post.theme ?? "",
        objetivo:            post.objective ?? "",
        publico_especifico:  post.publico_especifico ?? "",
        dor_desejo:          post.dor_desejo ?? "",
        formato_sugerido:    post.format as StrategyBriefing["formato_sugerido"],
        hook_type:           post.hook_type ?? "",
        rationale:           (post as { rationale?: string }).rationale ?? "",
      };
      copy = {
        visual_headline: post.visual_headline ?? "",
        visual_prompt:   post.visual_prompt ?? "",
        layout_prompt:   post.layout_prompt,
      };
      postRef = adminDb.collection("posts").doc(body.post_id);

    } else if (body.client_id && body.briefing && body.copy) {
      // ── Mode B: manual / debug ────────────────────────────────────────────────
      const clientDoc = await adminDb.collection("clients").doc(body.client_id).get();
      if (!clientDoc.exists || clientDoc.data()?.agency_id !== user.uid) {
        return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
      }
      client   = { id: clientDoc.id, ...clientDoc.data() } as BrandProfile;
      briefing = body.briefing;
      copy     = body.copy;

    } else {
      return NextResponse.json(
        { error: "Forneça post_id OU (client_id + briefing + copy)" },
        { status: 400 }
      );
    }

    // ── Buscar design examples para enriquecer o Art Director ─────────────────
    let designExamples: DesignExample[] = [];
    try {
      const clientId = "client_id" in client ? client.id : (body as { client_id?: string }).client_id ?? "";
      const exSnap = await adminDb
        .collection("clients").doc(clientId)
        .collection("design_examples")
        .where("pilar", "==", briefing.pilar)
        .orderBy("created_at", "desc")
        .limit(3)
        .get();
      designExamples = exSnap.docs.map(d => ({ id: d.id, ...d.data() } as DesignExample));
    } catch {
      // non-fatal
    }

    // ── Run Art Director agent ────────────────────────────────────────────────
    const res = await anthropic.messages.create({
      model:      MODEL,
      max_tokens: 1024,
      system:     buildArtDirectorPrompt(client, briefing, copy, designExamples.length ? designExamples : undefined),
      messages:   [{ role: "user", content: "Gere a direção de arte profissional para este post." }],
    });

    const raw = res.content[0].type === "text" ? res.content[0].text : "";
    let artDirection: ArtDirection;
    try {
      artDirection = parseJson<ArtDirection>(raw);
    } catch {
      return NextResponse.json({ error: "Falha ao parsear resposta do Art Director", raw }, { status: 500 });
    }

    // ── Save back to post if Mode A ───────────────────────────────────────────
    if (postRef) {
      await postRef.update({
        art_direction:  artDirection,
        visual_prompt:  artDirection.final_visual_prompt,
        layout_prompt:  artDirection.final_layout_prompt,
      });
    }

    return NextResponse.json({ art_direction: artDirection });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro interno";
    console.error("[POST /api/posts/generate-art-direction]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
