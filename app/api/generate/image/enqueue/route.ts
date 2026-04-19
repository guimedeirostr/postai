/**
 * POST /api/generate/image/enqueue
 *
 * Enfileira um GenerationJob para o PromptNode.
 * O worker (/api/jobs/worker via Vercel Cron) vai processar e preencher o resultado.
 *
 * Body: { clientId, nodeId, prompt, model?, format?, postId?, slideId? }
 * Response: { jobId }
 */

import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { enqueueJob } from "@/lib/jobs/queue";
import { checkRateLimit, AI_DAILY_LIMIT } from "@/lib/rate-limit";

const CREDITS_BY_MODEL: Record<string, number> = {
  "flux-pro":     6,
  "flux-schnell": 2,
  "ideogram-3":   6,
};

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const rl = await checkRateLimit(user.uid);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: `Limite diário de ${AI_DAILY_LIMIT} gerações atingido. Redefine em ${rl.resetAt}.` },
        { status: 429, headers: { "X-RateLimit-Reset": rl.resetAt } },
      );
    }

    const body: {
      clientId: string;
      nodeId:   string;
      prompt:   string;
      model?:   string;
      format?:  string;
      postId?:  string;
      slideId?: string;
    } = await req.json();

    const { clientId, nodeId, prompt, model = "flux-pro", format = "feed", postId, slideId } = body;

    if (!clientId || !nodeId || !prompt) {
      return NextResponse.json({ error: "clientId, nodeId e prompt são obrigatórios" }, { status: 400 });
    }

    const jobId = await enqueueJob(user.uid, clientId, {
      nodeId,
      model,
      prompt,
      format,
      postId,
      slideId,
      costCredits: CREDITS_BY_MODEL[model] ?? 6,
    });

    return NextResponse.json({ jobId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro interno";
    console.error("[generate/image/enqueue]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
