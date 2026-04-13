/**
 * POST /api/posts/[id]/approve
 *
 * Aprova um post e dispara atualização incremental do CopyDNA.
 *
 * Fluxo:
 *   1. Valida autenticação e ownership do post
 *   2. Atualiza status → "approved"
 *   3. Carrega os últimos 20 posts aprovados do cliente
 *   4. Se ≥ 3 posts: roda Claude haiku para sintetizar CopyDNA
 *   5. Salva em clients/{client_id}/copy_dna/current
 *
 * Returns: { ok: true, copy_dna_updated: boolean }
 */

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { adminDb } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/session";
import { FieldValue } from "firebase-admin/firestore";
import type { GeneratedPost, CopyDNA } from "@/types";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL     = process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001";

const MIN_POSTS_FOR_DNA = 3;

function parseJson<T>(raw: string): T {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
  return JSON.parse(cleaned) as T;
}

/** Conta emojis em uma string */
function countEmojis(text: string): number {
  const emojiRegex = /\p{Emoji_Presentation}|\p{Extended_Pictographic}/gu;
  return (text.match(emojiRegex) ?? []).length;
}

/** Retorna a contagem de parágrafos (linhas não-vazias) de uma string */
function countParagraphs(text: string): number {
  return text.split("\n").filter(l => l.trim().length > 0).length;
}

/** Moda de um array de strings */
function topValues(arr: string[], n = 2): string[] {
  const freq = new Map<string, number>();
  for (const v of arr) if (v) freq.set(v, (freq.get(v) ?? 0) + 1);
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k]) => k);
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;

    // ── Carregar e validar post ───────────────────────────────────────────────
    const postDoc = await adminDb.collection("posts").doc(id).get();
    if (!postDoc.exists) {
      return NextResponse.json({ error: "Post não encontrado" }, { status: 404 });
    }
    const post = { id: postDoc.id, ...postDoc.data() } as GeneratedPost;
    if (post.agency_id !== user.uid) {
      return NextResponse.json({ error: "Post não encontrado" }, { status: 404 });
    }

    // ── Aprovar post ──────────────────────────────────────────────────────────
    await adminDb.collection("posts").doc(id).update({
      status:      "approved",
      approved_at: FieldValue.serverTimestamp(),
    });

    // ── Carregar posts aprovados recentes para síntese de CopyDNA ─────────────
    const approvedSnap = await adminDb
      .collection("posts")
      .where("client_id", "==", post.client_id)
      .where("status",    "==", "approved")
      .orderBy("created_at", "desc")
      .limit(20)
      .get();

    const approvedPosts = approvedSnap.docs.map(
      d => ({ id: d.id, ...d.data() } as GeneratedPost)
    );

    if (approvedPosts.length < MIN_POSTS_FOR_DNA) {
      return NextResponse.json({ ok: true, copy_dna_updated: false });
    }

    // ── Síntese do CopyDNA ────────────────────────────────────────────────────
    const corpus = approvedPosts
      .map(
        (p, i) =>
          `Post ${i + 1}: hook: "${p.caption?.slice(0, 100) ?? ""}" | framework: ${p.framework_used ?? "N/A"} | hook_type: ${p.hook_type ?? "N/A"}`
      )
      .join("\n");

    const response = await anthropic.messages.create({
      model:      MODEL,
      max_tokens: 1024,
      system:
        "Analise os seguintes posts aprovados de uma marca e extraia padrões de escrita. " +
        "Retorne JSON com: hook_patterns, sentence_patterns, vocabulary_level (simple|technical|mixed), " +
        "cta_patterns, emoji_style, top_hooks (array dos 3 melhores primeiros 100 chars de caption). " +
        "Retorne apenas JSON puro, sem markdown.",
      messages: [{ role: "user", content: corpus }],
    });

    const raw = response.content[0].type === "text" ? response.content[0].text : "";

    let synthesized: Pick<
      CopyDNA,
      "hook_patterns" | "sentence_patterns" | "vocabulary_level" | "cta_patterns" | "emoji_style" | "top_hooks"
    >;
    try {
      synthesized = parseJson(raw);
    } catch {
      // Síntese falhou — post já foi aprovado, retorna sem DNA update
      console.error("[approve] Falha ao parsear CopyDNA sintetizado:", raw);
      return NextResponse.json({ ok: true, copy_dna_updated: false });
    }

    // ── Calcular métricas numéricas ───────────────────────────────────────────
    const captionLengths = approvedPosts
      .map(p => p.caption?.length ?? 0)
      .filter(n => n > 0);
    const avg_caption_length = captionLengths.length
      ? Math.round(captionLengths.reduce((a, b) => a + b, 0) / captionLengths.length)
      : 0;

    const emojiDensities = approvedPosts.map(p => {
      if (!p.caption) return 0;
      const paras = countParagraphs(p.caption);
      return paras > 0 ? countEmojis(p.caption) / paras : 0;
    });
    const avg_emoji_density =
      emojiDensities.length
        ? Math.round(
            (emojiDensities.reduce((a, b) => a + b, 0) / emojiDensities.length) * 100
          ) / 100
        : 0;

    const dominant_frameworks = topValues(
      approvedPosts.map(p => p.framework_used ?? "")
    );
    const dominant_hooks = topValues(
      approvedPosts.map(p => p.hook_type ?? "")
    );

    const confidence_score = Math.min(
      100,
      Math.round(50 + (approvedPosts.length / 20) * 50)
    );

    // ── Salvar CopyDNA no Firestore ───────────────────────────────────────────
    const dnaRef = adminDb
      .collection("clients")
      .doc(post.client_id)
      .collection("copy_dna")
      .doc("current");

    const existing = await dnaRef.get();

    const copyDna: CopyDNA = {
      ...synthesized,
      client_id:            post.client_id,
      agency_id:            user.uid,
      approved_posts_count: approvedPosts.length,
      confidence_score,
      avg_caption_length,
      avg_emoji_density,
      dominant_frameworks,
      dominant_hooks,
      updated_at: FieldValue.serverTimestamp() as unknown as import("firebase/firestore").Timestamp,
      created_at: existing.exists
        ? (existing.data()?.created_at ?? FieldValue.serverTimestamp())
        : FieldValue.serverTimestamp() as unknown as import("firebase/firestore").Timestamp,
    };

    await dnaRef.set(copyDna);

    return NextResponse.json({ ok: true, copy_dna_updated: true });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro interno";
    console.error("[POST /api/posts/[id]/approve]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
