/**
 * POST /api/clients/[id]/synthesize-dna
 *
 * Agente de Síntese de DNA da Marca — o "Machine Learning" do PostAI.
 *
 * Lê todos os DesignExamples do cliente, baixa as imagens reais (quando
 * disponíveis), e executa o agente de síntese com Claude Vision para
 * extrair o DNA visual CONSOLIDADO da marca.
 *
 * O resultado é armazenado em clients/{id}/brand_dna/current e será
 * usado pelo Art Director como lei primária em toda geração futura.
 *
 * Quanto mais posts analisados, mais preciso o DNA.
 * Mínimo recomendado: 5 posts. Ideal: 10–20 posts.
 *
 * GET  /api/clients/[id]/synthesize-dna → retorna BrandDNA atual (se existir)
 * POST /api/clients/[id]/synthesize-dna → executa síntese e salva BrandDNA
 */

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { adminDb } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/session";
import { FieldValue } from "firebase-admin/firestore";
import {
  buildSynthesisContent,
  SYNTHESIS_VISION_MODEL,
} from "@/lib/prompts/brand-dna";
import type { DesignExample, BrandDNA } from "@/types";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Máximo de imagens para incluir na síntese (custo x qualidade)
const MAX_IMAGES_FOR_SYNTHESIS = 10;

function parseJson<T>(raw: string): T {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  return JSON.parse(cleaned) as T;
}

// ── GET: retorna BrandDNA atual ───────────────────────────────────────────────

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

    // Busca DNA atual e contagem de exemplos em paralelo
    const [dnaDoc, exSnap] = await Promise.all([
      adminDb
        .collection("clients").doc(client_id)
        .collection("brand_dna").doc("current")
        .get(),
      adminDb
        .collection("clients").doc(client_id)
        .collection("design_examples")
        .count()
        .get(),
    ]);

    const examples_count = exSnap.data().count;

    if (!dnaDoc.exists) {
      return NextResponse.json({ dna: null, examples_count });
    }

    return NextResponse.json({
      dna: dnaDoc.data() as BrandDNA,
      examples_count,
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro interno";
    console.error("[GET /api/clients/[id]/synthesize-dna]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ── POST: executa síntese ─────────────────────────────────────────────────────

export async function POST(
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

    // ── Carregar todos os DesignExamples ──────────────────────────────────────
    const exSnap = await adminDb
      .collection("clients").doc(client_id)
      .collection("design_examples")
      .orderBy("created_at", "desc")
      .limit(20) // Top 20 mais recentes
      .get();

    const examples = exSnap.docs.map(d => ({ id: d.id, ...d.data() } as DesignExample));

    if (examples.length < 3) {
      return NextResponse.json(
        { error: "São necessários pelo menos 3 posts analisados para sintetizar o DNA. Adicione mais referências primeiro." },
        { status: 400 }
      );
    }

    // ── Baixar imagens reais para análise multimodal ──────────────────────────
    // Limita a MAX_IMAGES para controlar custo
    const imageData = new Map<string, { base64: string; mediaType: string }>();
    const examplesWithImages = examples.filter(e => e.image_url).slice(0, MAX_IMAGES_FOR_SYNTHESIS);

    await Promise.allSettled(
      examplesWithImages.map(async (ex) => {
        if (!ex.image_url) return;
        try {
          const res = await fetch(ex.image_url, { signal: AbortSignal.timeout(10_000) });
          if (!res.ok) return;

          const ct        = res.headers.get("content-type") ?? "image/jpeg";
          const mediaType = (["image/jpeg", "image/png", "image/webp"].includes(ct.split(";")[0].trim())
            ? ct.split(";")[0].trim()
            : "image/jpeg") as "image/jpeg" | "image/png" | "image/webp";

          const buf    = await res.arrayBuffer();
          const base64 = Buffer.from(buf).toString("base64");
          imageData.set(ex.image_url, { base64, mediaType });
        } catch {
          // Non-fatal: exemplo continua com metadados só
        }
      })
    );

    // ── Montar conteúdo multimodal ────────────────────────────────────────────
    const content = buildSynthesisContent(examples, imageData);

    // ── Rodar agente de síntese ───────────────────────────────────────────────
    const response = await anthropic.messages.create({
      model:      SYNTHESIS_VISION_MODEL,
      max_tokens: 2048,
      messages: [{
        role:    "user",
        content: content as unknown as Anthropic.MessageParam["content"],
      }],
    });

    const raw = response.content[0].type === "text" ? response.content[0].text : "";

    let synthesized: Omit<BrandDNA, "client_id" | "agency_id" | "examples_count" | "created_at" | "updated_at">;
    try {
      synthesized = parseJson(raw);
    } catch {
      return NextResponse.json(
        { error: "Falha ao parsear DNA sintetizado", raw },
        { status: 500 }
      );
    }

    // ── Salvar BrandDNA no Firestore ──────────────────────────────────────────
    const dnaRef = adminDb
      .collection("clients").doc(client_id)
      .collection("brand_dna").doc("current");

    const existing = await dnaRef.get();

    const dna: BrandDNA = {
      ...synthesized,
      client_id,
      agency_id:      user.uid,
      examples_count: examples.length,
      updated_at:     FieldValue.serverTimestamp() as unknown as import("firebase/firestore").Timestamp,
      created_at:     existing.exists
        ? (existing.data()?.created_at ?? FieldValue.serverTimestamp())
        : FieldValue.serverTimestamp() as unknown as import("firebase/firestore").Timestamp,
    };

    await dnaRef.set(dna);

    return NextResponse.json({
      dna,
      examples_analyzed: examples.length,
      images_used:       imageData.size,
      message: `DNA sintetizado de ${examples.length} posts (${imageData.size} com análise visual real).`,
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro interno";
    console.error("[POST /api/clients/[id]/synthesize-dna]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
