/**
 * GET  /api/clients/[id]/synthesize-copy-dna → retorna CopyDNA atual (se existir)
 * POST /api/clients/[id]/synthesize-copy-dna → força re-síntese do CopyDNA
 *
 * O CopyDNA captura os padrões de escrita dos posts APROVADOS de um cliente.
 * Mínimo 3 posts aprovados. Ideal: 10–20 posts.
 *
 * Na prática, o CopyDNA é atualizado automaticamente a cada aprovação via
 * POST /api/posts/[id]/approve. Esta rota existe para forçar re-síntese manual
 * (ex: após bulk-import de posts históricos).
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

/** Top N valores mais frequentes de um array de strings */
function topValues(arr: string[], n = 2): string[] {
  const freq = new Map<string, number>();
  for (const v of arr) if (v) freq.set(v, (freq.get(v) ?? 0) + 1);
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k]) => k);
}

// ── GET: retorna CopyDNA atual ────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
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

    const dnaDoc = await adminDb
      .collection("clients").doc(client_id)
      .collection("copy_dna").doc("current")
      .get();

    if (!dnaDoc.exists) {
      return NextResponse.json({ copy_dna: null });
    }

    return NextResponse.json({ copy_dna: dnaDoc.data() as CopyDNA });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro interno";
    console.error("[GET /api/clients/[id]/synthesize-copy-dna]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ── POST: força re-síntese do CopyDNA ────────────────────────────────────────

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id: client_id } = await params;

    // ── Validar ownership do cliente ─────────────────────────────────────────
    const clientDoc = await adminDb.collection("clients").doc(client_id).get();
    if (!clientDoc.exists || clientDoc.data()?.agency_id !== user.uid) {
      return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
    }

    // ── Carregar posts aprovados ──────────────────────────────────────────────
    const approvedSnap = await adminDb
      .collection("posts")
      .where("client_id", "==", client_id)
      .where("status",    "==", "approved")
      .orderBy("created_at", "desc")
      .limit(20)
      .get();

    const approvedPosts = approvedSnap.docs.map(
      d => ({ id: d.id, ...d.data() } as GeneratedPost)
    );

    if (approvedPosts.length < MIN_POSTS_FOR_DNA) {
      return NextResponse.json(
        { error: "Mínimo 3 posts aprovados necessários" },
        { status: 400 }
      );
    }

    // ── Montar corpus para síntese ────────────────────────────────────────────
    const corpus = approvedPosts
      .map(
        (p, i) =>
          `Post ${i + 1}: hook: "${p.caption?.slice(0, 100) ?? ""}" | framework: ${p.framework_used ?? "N/A"} | hook_type: ${p.hook_type ?? "N/A"}`
      )
      .join("\n");

    // ── Rodar agente de síntese ───────────────────────────────────────────────
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
      return NextResponse.json(
        { error: "Falha ao parsear DNA sintetizado", raw },
        { status: 500 }
      );
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
      .doc(client_id)
      .collection("copy_dna")
      .doc("current");

    const existing = await dnaRef.get();

    const copyDna: CopyDNA = {
      ...synthesized,
      client_id,
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

    return NextResponse.json({ copy_dna: copyDna });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro interno";
    console.error("[POST /api/clients/[id]/synthesize-copy-dna]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
