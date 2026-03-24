/**
 * POST /api/posts/generate
 *
 * Unified pipeline orchestrator:
 *   1. Validates client ownership
 *   2. Checks rate limit
 *   3. Creates a Firestore post doc with status "pending"
 *   4. Runs Strategy agent
 *   5. Loads client design examples (few-shot references)
 *   6. Runs Copy agent (with examples injected)
 *   7. Kicks off Freepik image generation (async task)
 *   8. Returns { post_id, briefing, copy } immediately
 *
 * The frontend only needs to:
 *   - Receive post_id
 *   - Poll GET /api/posts/check-image?task_id=...&post_id=... every 4s
 *
 * Post status progression:
 *   pending → strategy → copy → generating → ready (| failed)
 */

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { adminDb } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/session";
import { FieldValue } from "firebase-admin/firestore";
import { buildStrategyPrompt } from "@/lib/prompts/strategy";
import { buildCopyPrompt } from "@/lib/prompts/copy";
import { checkRateLimit, AI_DAILY_LIMIT } from "@/lib/rate-limit";
import { createTask, FreepikAuthError } from "@/lib/freepik";
import type { BrandProfile, StrategyBriefing, StrategyContext, DesignExample } from "@/types";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL     = process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001";

const ASPECT_RATIO: Record<string, string> = {
  feed:        "social_post_4_5",
  stories:     "social_story_9_16",
  reels_cover: "social_story_9_16",
};

function parseJson<T>(raw: string): T {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  return JSON.parse(cleaned) as T;
}

export async function POST(req: NextRequest) {
  let postRef: FirebaseFirestore.DocumentReference | null = null;

  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // ── Rate limit check ──────────────────────────────────────────────────────
    const rl = await checkRateLimit(user.uid);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: `Limite diário de ${AI_DAILY_LIMIT} gerações atingido. Redefine em ${rl.resetAt}.` },
        { status: 429, headers: { "X-RateLimit-Reset": rl.resetAt } }
      );
    }

    const { client_id, campaign_focus } = await req.json() as {
      client_id:       string;
      campaign_focus?: string;
    };

    if (!client_id) {
      return NextResponse.json({ error: "client_id é obrigatório" }, { status: 400 });
    }

    // ── Load client ───────────────────────────────────────────────────────────
    const clientDoc = await adminDb.collection("clients").doc(client_id).get();
    if (!clientDoc.exists || clientDoc.data()?.agency_id !== user.uid) {
      return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
    }
    const client = { id: clientDoc.id, ...clientDoc.data() } as BrandProfile;

    // ── Create pending post doc ───────────────────────────────────────────────
    postRef = adminDb.collection("posts").doc();
    await postRef.set({
      id:         postRef.id,
      agency_id:  user.uid,
      client_id,
      client_name: client.name,
      status:     "pending",
      created_at: FieldValue.serverTimestamp(),
    });

    // ── Step 1: Strategy agent ────────────────────────────────────────────────
    await postRef.update({ status: "strategy" });

    const strategyRes = await anthropic.messages.create({
      model:      MODEL,
      max_tokens: 1024,
      system:     buildStrategyPrompt(client, campaign_focus),
      messages:   [{ role: "user", content: "Gere o briefing estratégico para o próximo post deste cliente." }],
    });

    const strategyRaw = strategyRes.content[0].type === "text" ? strategyRes.content[0].text : "";
    let briefing: StrategyBriefing;
    try {
      briefing = parseJson<StrategyBriefing>(strategyRaw);
    } catch {
      await postRef.update({ status: "failed", error: "Falha ao parsear briefing estratégico" });
      return NextResponse.json({ error: "Falha ao parsear resposta do Agente Estrategista", raw: strategyRaw }, { status: 500 });
    }

    await postRef.update({
      pilar:              briefing.pilar,
      tema:               briefing.tema,
      objective:          briefing.objetivo,
      format:             briefing.formato_sugerido,
      publico_especifico: briefing.publico_especifico,
      dor_desejo:         briefing.dor_desejo,
      hook_type:          briefing.hook_type,
      rationale:          briefing.rationale,
    });

    // ── Step 2: Load client design examples (few-shot for Copy agent) ────────
    // Fetch up to 5 examples matching this pilar + format. Falls back to
    // any format if not enough pilar-specific examples exist.
    let designExamples: DesignExample[] = [];
    try {
      const exSnap = await adminDb
        .collection("clients").doc(client_id)
        .collection("design_examples")
        .where("pilar",  "==", briefing.pilar)
        .where("format", "==", briefing.formato_sugerido)
        .orderBy("created_at", "desc")
        .limit(5)
        .get();

      designExamples = exSnap.docs.map(d => ({ id: d.id, ...d.data() } as DesignExample));

      // If fewer than 3 pilar-specific, fill with any format examples for this pilar
      if (designExamples.length < 3) {
        const fillSnap = await adminDb
          .collection("clients").doc(client_id)
          .collection("design_examples")
          .where("pilar", "==", briefing.pilar)
          .orderBy("created_at", "desc")
          .limit(5)
          .get();
        const existing = new Set(designExamples.map(e => e.id));
        for (const doc of fillSnap.docs) {
          if (!existing.has(doc.id)) {
            designExamples.push({ id: doc.id, ...doc.data() } as DesignExample);
            if (designExamples.length >= 5) break;
          }
        }
      }
    } catch {
      // Non-fatal — generation continues without examples
    }

    // ── Step 3: Copy agent ────────────────────────────────────────────────────
    await postRef.update({ status: "copy" });

    const strategy: StrategyContext = {
      pilar:              briefing.pilar,
      publico_especifico: briefing.publico_especifico,
      dor_desejo:         briefing.dor_desejo,
      hook_type:          briefing.hook_type,
    };

    const copyRes = await anthropic.messages.create({
      model:      MODEL,
      max_tokens: 2048,
      system:     buildCopyPrompt(client, briefing.formato_sugerido, briefing.objetivo, strategy, designExamples.length ? designExamples : undefined),
      messages:   [{
        role:    "user",
        content: `Tema: ${briefing.tema}\nObjetivo: ${briefing.objetivo}\n\nEscreva o melhor post possível para este cliente seguindo o framework selecionado.`,
      }],
    });

    const copyRaw = copyRes.content[0].type === "text" ? copyRes.content[0].text : "";
    let copy: {
      visual_headline: string; headline: string; caption: string;
      hashtags: string[]; visual_prompt: string; layout_prompt: string;
      framework_used: string; hook_type: string;
    };
    try {
      copy = parseJson(copyRaw);
    } catch {
      await postRef.update({ status: "failed", error: "Falha ao parsear copy" });
      return NextResponse.json({ error: "Falha ao parsear resposta do Agente de Copy", raw: copyRaw }, { status: 500 });
    }

    await postRef.update({
      theme:           briefing.tema,
      visual_headline: copy.visual_headline,
      headline:        copy.headline,
      caption:         copy.caption,
      hashtags:        copy.hashtags,
      visual_prompt:   copy.visual_prompt,
      layout_prompt:   copy.layout_prompt ?? null,
      framework_used:  copy.framework_used,
      hook_type:       copy.hook_type,
      image_url:       null,
    });

    // ── Step 3: Kick off Freepik image generation ─────────────────────────────
    await postRef.update({ status: "generating" });

    let task_id: string | null = null;
    try {
      const aspect = ASPECT_RATIO[briefing.formato_sugerido] ?? "social_post_4_5";
      const task   = await createTask({
        prompt:       copy.visual_prompt,
        aspect_ratio: aspect,
        realism:      true,
        styling:      { colors: [{ color: client.primary_color, weight: 0.5 }] },
      });
      task_id = task.task_id;
      await postRef.update({ freepik_task_id: task_id });
    } catch (freepikErr) {
      // Image generation failed, but copy is ready — degrade gracefully
      const freepikMsg = freepikErr instanceof Error ? freepikErr.message : "Erro Freepik";
      console.error("[generate] Freepik error (non-fatal):", freepikMsg);
      await postRef.update({ status: "ready", freepik_error: freepikMsg });
    }

    return NextResponse.json({
      post_id:  postRef.id,
      task_id,
      briefing,
      copy: {
        visual_headline: copy.visual_headline,
        headline:        copy.headline,
        caption:         copy.caption,
        hashtags:        copy.hashtags,
        visual_prompt:   copy.visual_prompt,
        layout_prompt:   copy.layout_prompt,
        framework_used:  copy.framework_used,
        hook_type:       copy.hook_type,
      },
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro interno";
    console.error("[POST /api/posts/generate]", message);

    if (postRef) {
      await postRef.update({ status: "failed", error: message }).catch(() => null);
    }

    if (err instanceof FreepikAuthError) {
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
