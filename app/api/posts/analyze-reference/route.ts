/**
 * POST /api/posts/analyze-reference
 *
 * Recebe uma imagem de referência (base64) e extrai o DNA visual completo
 * usando Claude Vision. Retorna um ReferenceDNA estruturado que alimenta
 * todo o pipeline de geração: Copy → Art Director → Compositor.
 *
 * Este é o Stage 0 do novo fluxo por etapas — o usuário sobe uma arte que
 * quer "copiar o estilo" e o sistema lê o DNA exato dela antes de qualquer
 * geração de conteúdo.
 *
 * Body: { image_base64: string, image_mime?: string }
 * Response: ReferenceDNA
 */

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { adminDb } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/session";
import { FieldValue } from "firebase-admin/firestore";
import { buildReferenceDNAPrompt } from "@/lib/prompts/design-example-analysis";
import { uploadToR2 } from "@/lib/r2";
import type { DesignExample, ReferenceDNA } from "@/types";

// Claude Vision pode levar 20-40s — sem maxDuration default é 10s (504 no Vercel)
export const maxDuration = 60;

// Visão requer Sonnet — Haiku não suporta imagens
const VISION_MODEL = "claude-sonnet-4-6";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function parseJson<T>(raw: string): T {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  return JSON.parse(cleaned) as T;
}

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { image_base64, image_mime, client_id, save } = await req.json() as {
      image_base64: string;
      image_mime?:  string;
      /** Quando fornecido, o DNA também é salvo em design_examples automaticamente */
      client_id?:   string;
      /** Default: true quando client_id estiver presente */
      save?:        boolean;
    };

    if (!image_base64) {
      return NextResponse.json({ error: "image_base64 é obrigatório" }, { status: 400 });
    }

    // ── Ownership: se client_id foi fornecido, valida antes de gastar tokens ──
    if (client_id) {
      const clientDoc = await adminDb.collection("clients").doc(client_id).get();
      if (!clientDoc.exists || clientDoc.data()?.agency_id !== user.uid) {
        return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
      }
    }

    const mediaType = (image_mime ?? "image/jpeg") as
      | "image/jpeg"
      | "image/png"
      | "image/webp"
      | "image/gif";

    const response = await anthropic.messages.create({
      model:      VISION_MODEL,
      max_tokens: 1600,
      messages: [{
        role:    "user",
        content: [
          {
            type:   "image",
            source: { type: "base64", media_type: mediaType, data: image_base64 },
          },
          { type: "text", text: buildReferenceDNAPrompt() },
        ],
      }],
    });

    const raw = response.content[0].type === "text" ? response.content[0].text : "";

    let dna: ReferenceDNA;
    try {
      dna = parseJson<ReferenceDNA>(raw);
    } catch {
      return NextResponse.json(
        { error: "Falha ao parsear DNA da referência", raw },
        { status: 500 }
      );
    }

    // ── Auto-save em design_examples quando client_id presente ───────────────
    // Garante que o Stage 0 sempre alimenta a biblioteca da marca — nada se
    // perde, e o usuário pode reaproveitar a mesma referência depois.
    let design_example_id: string | undefined;
    const shouldSave = client_id && (save !== false);

    if (shouldSave) {
      try {
        const ref = adminDb
          .collection("clients").doc(client_id!)
          .collection("design_examples").doc();

        // ── Upload da imagem original pro R2 (best-effort) ─────────────────
        // Sem isso o thumbnail no library picker fica vazio. Como o Stage 0
        // recebe a imagem como base64 do browser, é a única chance de persistir.
        let image_url: string | undefined;
        try {
          const buf = Buffer.from(image_base64, "base64");
          const ext = mediaType.split("/")[1] ?? "jpg";
          const key = `design-examples/${client_id}/${ref.id}.${ext}`;
          image_url = await uploadToR2(key, buf, mediaType);
        } catch (uploadErr) {
          console.warn("[posts/analyze-reference] R2 upload falhou (non-fatal):", uploadErr);
        }

        const example: Omit<DesignExample, "id" | "created_at"> = {
          agency_id:            user.uid,
          client_id:            client_id!,
          visual_prompt:        dna.visual_prompt,
          layout_prompt:        dna.layout_prompt,
          visual_headline_style: dna.visual_headline_style,
          pilar:                dna.pilar,
          format:               dna.format,
          description:          dna.description,
          color_mood:           dna.color_mood,
          composition_zone:     dna.composition_zone,
          text_zones:           dna.text_zones,
          background_treatment: dna.background_treatment,
          headline_style:       dna.headline_style,
          typography_hierarchy: dna.typography_hierarchy,
          ...(dna.logo_placement ? { logo_placement: dna.logo_placement } : {}),
          ...(image_url ? { image_url } : {}),
          intent:               "stage0",
        };

        await ref.set({
          id:         ref.id,
          ...example,
          created_at: FieldValue.serverTimestamp(),
        });

        design_example_id = ref.id;
      } catch (saveErr) {
        // Salvar é best-effort — não bloqueia o Stage 0 se falhar
        console.warn("[posts/analyze-reference] auto-save falhou (non-fatal):", saveErr);
      }
    }

    return NextResponse.json({ ...dna, design_example_id });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro interno";
    console.error("[POST /api/posts/analyze-reference]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
