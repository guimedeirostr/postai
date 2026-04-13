import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/session";
import { buildStrategyPrompt } from "@/lib/prompts/strategy";
import { checkRateLimit, AI_DAILY_LIMIT } from "@/lib/rate-limit";
import { readTrendCache } from "@/lib/tavily";
import type { BrandProfile, StrategyBriefing } from "@/types";

// Calendar generation requires quality reasoning over many briefings
const CALENDAR_MODEL = "claude-sonnet-4-6";

// 30 briefings can be verbose — allow up to 2 minutes
export const maxDuration = 120;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface CalendarRequestBody {
  client_id:   string;
  month:       number;
  year:        number;
  post_count?: number;
}

interface CalendarPost {
  post_id:        string;
  briefing:       StrategyBriefing;
  scheduled_date: string;
}

interface CalendarResponse {
  calendar_id: string;
  month:       number;
  year:        number;
  posts:       CalendarPost[];
}

export async function POST(req: NextRequest) {
  try {
    // ── 1. Auth ───────────────────────────────────────────────────────────────
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ── 2. Rate limit (calendar counts as 1 slot) ─────────────────────────────
    const rl = await checkRateLimit(user.uid);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: `Limite diário de ${AI_DAILY_LIMIT} gerações atingido. Redefine em ${rl.resetAt}.` },
        { status: 429, headers: { "X-RateLimit-Reset": rl.resetAt } },
      );
    }

    // ── 3. Validate inputs ────────────────────────────────────────────────────
    const body = await req.json() as CalendarRequestBody;
    const { client_id, month, year, post_count: rawPostCount } = body;

    if (!client_id) {
      return NextResponse.json({ error: "client_id é obrigatório" }, { status: 400 });
    }

    if (!month || month < 1 || month > 12) {
      return NextResponse.json(
        { error: "month deve ser um número entre 1 e 12" },
        { status: 400 },
      );
    }

    if (!year || year < 2024) {
      return NextResponse.json(
        { error: "year deve ser >= 2024" },
        { status: 400 },
      );
    }

    // ── 4. Load client & verify ownership ────────────────────────────────────
    const clientDoc = await adminDb.collection("clients").doc(client_id).get();
    if (!clientDoc.exists || clientDoc.data()?.agency_id !== user.uid) {
      return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
    }

    const client = { id: clientDoc.id, ...clientDoc.data() } as BrandProfile;

    // ── 5. Clamp post_count ───────────────────────────────────────────────────
    const post_count = Math.min(30, Math.max(5, rawPostCount ?? 20));

    // ── 6. Load trend cache (non-fatal) ───────────────────────────────────────
    const trendContext = await readTrendCache(client_id, "instagram").catch(() => null);

    if (trendContext) {
      console.log(`[generate-calendar] Tendências injetadas: "${trendContext.query}"`);
    }

    // ── 7. Build prompt and call Claude ───────────────────────────────────────
    const systemPrompt = buildStrategyPrompt(
      client,
      undefined,
      trendContext,
      "instagram",
      { month, year, post_count, already_planned: [] },
    );

    const response = await anthropic.messages.create({
      model:      CALENDAR_MODEL,
      max_tokens: 8000,
      system:     systemPrompt,
      messages: [{
        role:    "user",
        content: `Gere o calendário editorial com ${post_count} posts para ${new Date(year, month - 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}.`,
      }],
    });

    // ── 8. Parse response ─────────────────────────────────────────────────────
    const raw = response.content
      .filter(b => b.type === "text")
      .map(b => (b as { type: "text"; text: string }).text)
      .join("");

    // Strip markdown fences if present
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/i, "")
      .trim();

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      console.error("[generate-calendar] JSON parse failed. Raw response:", raw);
      return NextResponse.json(
        { error: "Falha ao parsear resposta da IA", raw },
        { status: 500 },
      );
    }

    // Claude may return { briefings: [...] } or a plain array
    let briefings: StrategyBriefing[];
    if (Array.isArray(parsed)) {
      briefings = parsed as StrategyBriefing[];
    } else if (parsed !== null && typeof parsed === "object") {
      // Find the first array value in the object
      const firstArray = Object.values(parsed as Record<string, unknown>).find(v => Array.isArray(v));
      if (firstArray) {
        briefings = firstArray as StrategyBriefing[];
      } else {
        console.error("[generate-calendar] Resposta não contém um array. Parsed:", parsed);
        return NextResponse.json(
          { error: "Resposta da IA não contém array de briefings", raw },
          { status: 500 },
        );
      }
    } else {
      console.error("[generate-calendar] Resposta inesperada da IA. Parsed:", parsed);
      return NextResponse.json(
        { error: "Formato de resposta da IA inválido", raw },
        { status: 500 },
      );
    }

    if (!briefings.length) {
      return NextResponse.json(
        { error: "A IA retornou uma lista vazia de briefings", raw },
        { status: 500 },
      );
    }

    // ── 9–12. Batch-write posts to Firestore ──────────────────────────────────
    const batch    = adminDb.batch();
    const postIds: string[] = [];
    const calendarPosts: CalendarPost[] = [];

    for (const briefing of briefings) {
      const postRef = adminDb.collection("posts").doc();

      const scheduled_date = briefing.scheduled_date ?? "";

      batch.set(postRef, {
        id:             postRef.id,
        agency_id:      user.uid,
        client_id,
        client_name:    client.name,
        pilar:          briefing.pilar          ?? "",
        tema:           briefing.tema           ?? "",
        objective:      briefing.objetivo       ?? "",
        format:         briefing.formato_sugerido ?? "feed",
        hook_type:      briefing.hook_type      ?? "",
        scheduled_date,
        rationale:      briefing.rationale      ?? "",
        status:         "pending",
        // GeneratedPost requires headline, caption, hashtags, visual_prompt, image_url
        // but the calendar only seeds the strategy — copy will fill these later
        theme:          briefing.tema           ?? "",
        headline:       "",
        caption:        "",
        hashtags:       [],
        visual_prompt:  "",
        image_url:      null,
        created_at:     FieldValue.serverTimestamp(),
      });

      postIds.push(postRef.id);

      calendarPosts.push({
        post_id:        postRef.id,
        briefing,
        scheduled_date,
      });
    }

    // ── 13. Create calendar document ─────────────────────────────────────────
    const calendarRef = adminDb.collection("calendars").doc();

    batch.set(calendarRef, {
      agency_id:   user.uid,
      client_id,
      client_name: client.name,
      month,
      year,
      post_count:  briefings.length,
      post_ids:    postIds,
      created_at:  FieldValue.serverTimestamp(),
    });

    await batch.commit();

    console.log(
      `[generate-calendar] Calendário ${calendarRef.id} criado com ${briefings.length} posts` +
      ` para ${client.name} (${month}/${year})`,
    );

    // ── 14. Return response ───────────────────────────────────────────────────
    const result: CalendarResponse = {
      calendar_id: calendarRef.id,
      month,
      year,
      posts: calendarPosts,
    };

    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro interno";
    console.error("[POST /api/posts/generate-calendar]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
