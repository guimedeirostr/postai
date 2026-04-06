/**
 * GET /api/carousels/check-hook?task_id=X&carousel_id=Y
 *
 * Polling do status da imagem do slide hook (index 0) no Freepik.
 * Quando COMPLETED: dispara composição de todos os slides.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/session";
import { FieldValue } from "firebase-admin/firestore";
import { pollTask, pollSeedreamTask } from "@/lib/freepik";
import type { BrandProfile, CarouselSlide } from "@/types";
import { composeHookSlide, composeContentSlide } from "@/lib/carousel-composer";

export const maxDuration = 120;

async function composeAllSlides(
  carouselId: string,
  slides: CarouselSlide[],
  hookImageUrl: string,
  client: BrandProfile
): Promise<CarouselSlide[]> {
  const total = slides.length;
  const composed: CarouselSlide[] = [...slides];

  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];
    const slideNum = i + 1;
    let url: string;

    if (slide.type === "hook" || slide.index === 0) {
      url = await composeHookSlide({
        imageUrl:   hookImageUrl,
        slide,
        client,
        slideNum,
        total,
        carouselId,
      });
    } else {
      url = await composeContentSlide({
        slide,
        client,
        slideNum,
        total,
        carouselId,
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

    // Fetch carousel doc
    const carouselRef = adminDb.collection("carousels").doc(carousel_id);
    const carouselDoc = await carouselRef.get();
    if (!carouselDoc.exists || carouselDoc.data()?.agency_id !== user.uid) {
      return NextResponse.json({ error: "Carrossel não encontrado" }, { status: 404 });
    }

    const carouselData = carouselDoc.data()!;
    const imageProvider = carouselData.image_provider ?? "mystic";

    // Poll Freepik
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

    // COMPLETED — fetch client and compose all slides
    const clientDoc = await adminDb.collection("clients").doc(carouselData.client_id).get();
    const client = { id: carouselData.client_id, ...clientDoc.data() } as BrandProfile;

    await carouselRef.update({
      hook_image_url: result.image_url,
      status: "composing",
      updated_at: FieldValue.serverTimestamp(),
    });

    const slides = carouselData.slides as CarouselSlide[];
    const composed = await composeAllSlides(carousel_id, slides, result.image_url, client);

    await carouselRef.update({
      slides:   composed,
      status:   "ready",
      updated_at: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      status:          "COMPLETED",
      hook_image_url:  result.image_url,
      slides:          composed,
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro interno";
    console.error("[GET /api/carousels/check-hook]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
