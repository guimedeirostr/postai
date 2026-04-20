import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { getBrandKit, getClientMemory } from "@/lib/firestore/queries";
import { runDirectorPlan } from "@/lib/director/plan";
import { checkRateLimit, AI_DAILY_LIMIT } from "@/lib/rate-limit";
import { adminDb } from "@/lib/firebase-admin";
import { paths } from "@/lib/firestore/paths";
import { FieldValue } from "firebase-admin/firestore";

export const maxDuration = 60;

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
      objetivo: string;
      formato?: string;
      clientName?: string;
      postId?: string;
    } = await req.json();

    const { clientId, objetivo, formato = "feed", clientName, postId } = body;

    if (!clientId || !objetivo) {
      return NextResponse.json({ error: "clientId e objetivo são obrigatórios" }, { status: 400 });
    }

    const [brandKit, clientMemory] = await Promise.all([
      getBrandKit(user.uid, clientId),
      getClientMemory(user.uid, clientId),
    ]);

    const plan = await runDirectorPlan({ objetivo, formato, clientName, brandKit, clientMemory });

    if (postId) {
      await adminDb.doc(paths.post(user.uid, clientId, postId)).set({
        plan,
        status:    "directing",
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    return NextResponse.json({ plan });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro interno";
    console.error("[director/plan]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
