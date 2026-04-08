/**
 * GET /api/carousels/check-hook?task_id=X&carousel_id=Y
 *
 * Polling do status da imagem do slide hook (index 0) no Freepik.
 * Quando COMPLETED:
 *   1. Baixa a imagem wide (16:9) gerada pelo Freepik
 *   2. Redimensiona para 2160×1350 (dois slides lado a lado)
 *   3. Slice esquerdo  (0..1080)    → hook slide (index 0)
 *   4. Slice direito   (1080..2160) → slide 1 (efeito panorâmico contínuo)
 *   5. Slides 2+: fotos da biblioteca da marca como fundo; fallback: cor sólida
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/session";
import { FieldValue } from "firebase-admin/firestore";
import sharp from "sharp";
import {
  pollTask, pollSeedreamTask,
  createSeedreamEditTask, pollSeedreamEditTask,
  freepikAspect,
} from "@/lib/freepik";
import type { BrandProfile, CarouselSlide } from "@/types";
import {
  composeHookSlide, composeContentSlide,
  SLIDE_W, SLIDE_H, PANORAMIC_W,
} from "@/lib/carousel-composer";

export const maxDuration = 120;

/** Baixa a imagem do Freepik e monta um Buffer da imagem panorâmica 2160×1350. */
async function downloadPanoramicBuffer(imageUrl: string): Promise<Buffer> {
  const res = await fetch(imageUrl, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`[check-hook] Falha ao baixar hook image: ${res.status}`);
  const raw = Buffer.from(await res.arrayBuffer());
  // Resize para exatamente PANORAMIC_W × SLIDE_H (2 slides lado a lado, portrait height)
  return sharp(raw)
    .resize(PANORAMIC_W, SLIDE_H, { fit: "cover", position: "attention" })
    .toBuffer();
}

/** Extrai uma fatia horizontal da imagem panorâmica. */
async function slicePanoramic(panoramic: Buffer, offsetX: number): Promise<Buffer> {
  return sharp(panoramic)
    .extract({ left: offsetX, top: 0, width: SLIDE_W, height: SLIDE_H })
    .toBuffer();
}

/** Baixa uma foto da marca e retorna um Buffer. */
async function downloadPhotoBuffer(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(12_000) });
    return res.ok ? Buffer.from(await res.arrayBuffer()) : null;
  } catch { return null; }
}

/**
 * Gera uma imagem de fundo para um slide via Seedream Edit (img2img).
 * Usa o hook como referência visual → coesão de estilo entre todos os slides.
 * Polling interno com até 35s; retorna null se falhar (fallback: cor sólida).
 */
async function generateSeedreamEditBackground(
  hookImageUrl: string,
  slidePrompt:  string,
  format:       "feed" | "stories" | "reels_cover" = "feed",
): Promise<Buffer | null> {
  try {
    const aspect = freepikAspect(format, "seedream");
    const { task_id } = await createSeedreamEditTask({
      prompt:           slidePrompt,
      aspect_ratio:     aspect,
      reference_images: [hookImageUrl],
    });

    const deadline = Date.now() + 35_000;
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 3_000));
      const poll = await pollSeedreamEditTask(task_id);
      if (poll.status === "COMPLETED" && poll.image_url) {
        const res = await fetch(poll.image_url, { signal: AbortSignal.timeout(12_000) });
        if (!res.ok) return null;
        return Buffer.from(await res.arrayBuffer());
      }
      if (poll.status === "FAILED") return null;
    }
    return null; // timeout
  } catch (e) {
    console.warn("[check-hook/seedream-edit] Falhou (non-fatal):", e);
    return null;
  }
}

async function composeAllSlides(
  carouselId:    string,
  slides:        CarouselSlide[],
  hookImageUrl:  string,
  client:        BrandProfile,
  isPanoramic:   boolean,
  brandPhotos:   string[],   // URLs das fotos da marca (já filtradas)
  imageProvider: string = "mystic",
): Promise<CarouselSlide[]> {

  const total    = slides.length;
  const composed: CarouselSlide[] = [...slides];

  // ── 1. Preparar imagem base ──────────────────────────────────────────────
  let panoramicBuffer: Buffer | null = null;
  let hookBuffer: Buffer;

  if (isPanoramic) {
    // Wide 16:9 → recortado em 2160×1350 para 2 slides
    panoramicBuffer = await downloadPanoramicBuffer(hookImageUrl);
    hookBuffer      = await slicePanoramic(panoramicBuffer, 0);
  } else {
    // Seedream gera portrait (3:4) — usa direto
    const res = await fetch(hookImageUrl, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`[check-hook] Falha ao baixar hook image: ${res.status}`);
    hookBuffer = Buffer.from(await res.arrayBuffer());
  }

  // ── 2. Pré-carregar fotos da marca (para slides 2+) ──────────────────────
  // Baixamos em paralelo para não serializar muitas requisições
  const photoBuffers: (Buffer | null)[] = await Promise.all(
    brandPhotos.slice(0, Math.max(0, total - 2)).map(downloadPhotoBuffer)
  );

  // ── 3. Compor slides sequencialmente ─────────────────────────────────────
  let photoIdx = 0;

  for (let i = 0; i < slides.length; i++) {
    const slide    = slides[i];
    const slideNum = i + 1;

    let url: string;

    if (slide.type === "hook" || slide.index === 0) {
      // Slide 0 — imagem AI (hook)
      url = await composeHookSlide({
        imageBuffer: hookBuffer,
        slide, client, slideNum, total, carouselId,
      });

    } else if (i === 1 && isPanoramic && panoramicBuffer) {
      // Slide 1 — continuação panorâmica (metade direita da imagem)
      const rightCrop = await slicePanoramic(panoramicBuffer, SLIDE_W);
      url = await composeContentSlide({
        bgImageBuffer: rightCrop,
        slide, client, slideNum, total, carouselId,
      });

    } else if (slide.type === "cta") {
      // Slide CTA — sempre cor sólida da marca
      url = await composeContentSlide({
        slide, client, slideNum, total, carouselId,
      });

    } else {
      // Slides de conteúdo — usa foto da marca se disponível
      // Quando não há foto E Seedream está ativo → gera fundo coeso via Seedream Edit
      let photoBuf = photoBuffers[photoIdx] ?? null;
      photoIdx++;

      if (!photoBuf && imageProvider === "seedream" && slide.visual_prompt) {
        console.log(`[check-hook/seedream-edit] Gerando fundo para slide ${i} via Seedream Edit`);
        photoBuf = await generateSeedreamEditBackground(hookImageUrl, slide.visual_prompt);
        if (photoBuf) {
          console.log(`[check-hook/seedream-edit] Slide ${i} — fundo gerado com sucesso`);
        }
      }

      url = await composeContentSlide({
        bgImageBuffer: photoBuf ?? undefined,
        slide, client, slideNum, total, carouselId,
      });
    }

    composed[i] = { ...slide, composed_url: url };
  }

  return composed;
}

export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const task_id     = searchParams.get("task_id");
    const carousel_id = searchParams.get("carousel_id");

    if (!task_id || !carousel_id) {
      return NextResponse.json({ error: "task_id e carousel_id são obrigatórios" }, { status: 400 });
    }

    // ── Buscar documento do carrossel ────────────────────────────────────────
    const carouselRef = adminDb.collection("carousels").doc(carousel_id);
    const carouselDoc = await carouselRef.get();
    if (!carouselDoc.exists || carouselDoc.data()?.agency_id !== user.uid) {
      return NextResponse.json({ error: "Carrossel não encontrado" }, { status: 404 });
    }

    const carouselData  = carouselDoc.data()!;
    const imageProvider = carouselData.image_provider ?? "mystic";
    const isPanoramic   = carouselData.is_panoramic === true;

    // ── Polling Freepik ──────────────────────────────────────────────────────
    const result = imageProvider === "seedream"
      ? await pollSeedreamTask(task_id)
      : await pollTask(task_id);

    if (result.status === "FAILED") {
      await carouselRef.update({ status: "failed", updated_at: FieldValue.serverTimestamp() });
      return NextResponse.json({ status: "FAILED" });
    }

    if (result.status !== "COMPLETED" || !result.image_url) {
      return NextResponse.json({ status: result.status });
    }

    // ── COMPLETED — buscar cliente e fotos da marca ──────────────────────────
    const [clientDoc, photosSnap] = await Promise.all([
      adminDb.collection("clients").doc(carouselData.client_id).get(),
      adminDb.collection("photos")
        .where("agency_id", "==", user.uid)
        .where("client_id", "==", carouselData.client_id)
        .limit(20)
        .get(),
    ]);

    const client      = { id: carouselData.client_id, ...clientDoc.data() } as BrandProfile;
    const brandPhotos = photosSnap.docs
      .map(d => d.data().url as string)
      .filter(Boolean);

    await carouselRef.update({
      hook_image_url: result.image_url,
      status:         "composing",
      updated_at:     FieldValue.serverTimestamp(),
    });

    // ── Compor todos os slides ───────────────────────────────────────────────
    const slides  = carouselData.slides as CarouselSlide[];
    const composed = await composeAllSlides(
      carousel_id, slides, result.image_url,
      client, isPanoramic, brandPhotos, imageProvider,
    );

    await carouselRef.update({
      slides:     composed,
      status:     "ready",
      updated_at: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      status:         "COMPLETED",
      hook_image_url: result.image_url,
      slides:         composed,
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro interno";
    console.error("[GET /api/carousels/check-hook]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
