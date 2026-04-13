/**
 * POST /api/posts/generate-variants
 *
 * Gera N variações de copy de um mesmo briefing estratégico, cada uma com
 * um hook type diferente. Útil para A/B test de anúncios em escala.
 *
 * Fluxo:
 *   1. Estratégia (Extended Thinking, 1 chamada)
 *   2. N copies em paralelo, cada uma com hook_type distinto
 *   3. Salva cada variante como post no Firestore
 *   4. Retorna array de variantes com copy + post_id
 *
 * Body:
 *   client_id       (obrigatório)
 *   count           2 | 4 | 6  (default 4)
 *   campaign_focus? string
 *   format?         "feed" | "stories" | "reels_cover" (default "feed")
 */

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { adminDb } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/session";
import { FieldValue } from "firebase-admin/firestore";
import { buildStrategyPrompt } from "@/lib/prompts/strategy";
import { buildCopyPrompt } from "@/lib/prompts/copy";
import { checkRateLimit, AI_DAILY_LIMIT } from "@/lib/rate-limit";
import { readTrendCache, fetchTrendContext, writeTrendCache } from "@/lib/tavily";
import type { BrandProfile, StrategyBriefing, StrategyContext } from "@/types";

export const maxDuration = 120;

const anthropic      = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL          = process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001";
const STRATEGY_MODEL = "claude-sonnet-4-6";
const THINKING_BUDGET = 8000;

// Hooks disponíveis — usados em rotação para cada variante
const ALL_HOOKS = ["Dor", "Curiosidade", "Pergunta", "Prova Social", "Controvérsia", "Número"] as const;
type HookType = typeof ALL_HOOKS[number];

function parseJsonSafe<T>(raw: string): T | null {
  try {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
    return JSON.parse(cleaned) as T;
  } catch {
    // Try extracting first {...} block
    const start = raw.indexOf("{");
    const end   = raw.lastIndexOf("}");
    if (start !== -1 && end > start) {
      try { return JSON.parse(raw.slice(start, end + 1)) as T; } catch { /* */ }
    }
    return null;
  }
}

export interface VariantCopy {
  post_id:        string;
  variant_number: number;
  hook_type:      HookType;
  framework_used: string;
  visual_headline: string;
  headline:        string;
  caption:         string;
  hashtags:        string[];
  visual_prompt:   string;
  layout_prompt:   string;
}

export interface GenerateVariantsResponse {
  variants:       VariantCopy[];
  total:          number;
  strategy_tema:  string;
  strategy_obj:   string;
}

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json() as {
      client_id:       string;
      count?:          number;
      campaign_focus?: string;
      format?:         string;
    };

    const { client_id, campaign_focus, format = "feed" } = body;
    const count = Math.min(Math.max(body.count ?? 4, 2), 6); // clamp 2–6

    if (!client_id) {
      return NextResponse.json({ error: "client_id é obrigatório" }, { status: 400 });
    }

    // Rate limit: 1 strategy + N copies
    const rl = await checkRateLimit(user.uid);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: `Limite diário de ${AI_DAILY_LIMIT} gerações atingido. Redefine em ${rl.resetAt}.` },
        { status: 429 }
      );
    }

    // Load client
    const clientDoc = await adminDb.collection("clients").doc(client_id).get();
    if (!clientDoc.exists || clientDoc.data()?.agency_id !== user.uid) {
      return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
    }
    const client = { id: clientDoc.id, ...clientDoc.data() } as BrandProfile;

    // ── Step 1: Strategy (Extended Thinking) ────────────────────────────────────
    const trendContext = await readTrendCache(client_id, "instagram")
      .catch(() => null)
      .then(async (cached) => {
        if (cached) return cached;
        const live = await fetchTrendContext(client.segment ?? "", campaign_focus).catch(() => null);
        if (live) await writeTrendCache(client_id, "instagram", live, user.uid).catch(() => null);
        return live;
      });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stratRes = await (anthropic.messages.create as (p: any) => Promise<Anthropic.Message>)({
      model:      STRATEGY_MODEL,
      max_tokens: 16000,
      thinking:   { type: "enabled", budget_tokens: THINKING_BUDGET },
      system:     buildStrategyPrompt(client, campaign_focus, trendContext ?? undefined, "instagram"),
      messages:   [{ role: "user", content: "Gere o briefing estratégico para o próximo post deste cliente." }],
    });

    const stratRaw = (stratRes.content as Array<{ type: string; text?: string }>)
      .filter(b => b.type === "text").map(b => b.text ?? "").join("");
    const briefing = parseJsonSafe<StrategyBriefing>(stratRaw);
    if (!briefing) {
      return NextResponse.json({ error: "Falha ao parsear estratégia" }, { status: 500 });
    }

    // ── Step 2: N copies in parallel with distinct hook types ───────────────────
    const hooks = ALL_HOOKS.slice(0, count) as HookType[];

    const strategy: StrategyContext = {
      pilar:              briefing.pilar,
      publico_especifico: briefing.publico_especifico,
      dor_desejo:         briefing.dor_desejo,
      hook_type:          briefing.hook_type,
    };

    const copyResults = await Promise.allSettled(
      hooks.map(async (hookType, idx) => {
        const systemPrompt = buildCopyPrompt(
          client,
          format,
          briefing.objetivo,
          { ...strategy, hook_type: hookType },
        );

        const res = await anthropic.messages.create({
          model:      MODEL,
          max_tokens: 8192,
          system:     systemPrompt,
          messages:   [{
            role:    "user",
            content: `Tema: ${briefing.tema}\nObjetivo: ${briefing.objetivo}\n\nEscreva o melhor post possível para este cliente com hook tipo "${hookType}".`,
          }],
        });

        const raw = (res.content as Array<{ type: string; text?: string }>)
          .filter(b => b.type === "text").map(b => b.text ?? "").join("");
        const copy = parseJsonSafe<{
          visual_headline: string; headline: string; caption: string;
          hashtags: string[]; visual_prompt: string; layout_prompt: string;
          framework_used: string; hook_type: string;
        }>(raw);

        if (!copy) throw new Error(`Falha ao parsear copy da variante ${idx + 1}`);

        // Save to Firestore
        const postRef = adminDb.collection("posts").doc();
        await postRef.set({
          id:              postRef.id,
          agency_id:       user.uid,
          client_id,
          client_name:     client.name,
          theme:           briefing.tema,
          objective:       briefing.objetivo,
          format,
          social_network:  "instagram",
          visual_headline: copy.visual_headline,
          headline:        copy.headline,
          caption:         copy.caption,
          hashtags:        copy.hashtags,
          visual_prompt:   copy.visual_prompt,
          layout_prompt:   copy.layout_prompt ?? null,
          framework_used:  copy.framework_used,
          hook_type:       hookType,
          variant_number:  idx + 1,
          is_variant:      true,
          image_url:       null,
          status:          "ready",
          created_at:      FieldValue.serverTimestamp(),
        });

        return {
          post_id:         postRef.id,
          variant_number:  idx + 1,
          hook_type:       hookType,
          framework_used:  copy.framework_used,
          visual_headline: copy.visual_headline,
          headline:        copy.headline,
          caption:         copy.caption,
          hashtags:        copy.hashtags,
          visual_prompt:   copy.visual_prompt,
          layout_prompt:   copy.layout_prompt ?? "",
        } satisfies VariantCopy;
      })
    );

    const variants: VariantCopy[] = copyResults
      .filter((r): r is PromiseFulfilledResult<VariantCopy> => r.status === "fulfilled")
      .map(r => r.value);

    const failed = copyResults.filter(r => r.status === "rejected").length;
    if (failed > 0) {
      console.warn(`[generate-variants] ${failed}/${count} variantes falharam`);
    }

    return NextResponse.json({
      variants,
      total:         variants.length,
      strategy_tema: briefing.tema,
      strategy_obj:  briefing.objetivo,
    } satisfies GenerateVariantsResponse);

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro interno";
    console.error("[POST /api/posts/generate-variants]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
