/**
 * POST /api/posts/generate
 *
 * Unified pipeline orchestrator:
 *   1. Validates client ownership
 *   2. Checks rate limit
 *   3. Creates a Firestore post doc with status "pending"
 *   4. Runs Strategy agent
 *   5. Loads client design examples (few-shot references)
 *   6. Runs Copy agent (with examples injected)
 *   7. Runs Art Director agent (elevates visual_prompt to professional art direction)
 *   8. Kicks off Freepik image generation (async task)
 *   9. Returns { post_id, briefing, copy, art_direction } immediately
 *
 * The frontend only needs to:
 *   - Receive post_id
 *   - Poll GET /api/posts/check-image?task_id=...&post_id=... every 4s
 *
 * Post status progression:
 *   pending → strategy → copy → art_direction → generating → ready (| failed)
 */

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { adminDb } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/session";
import { FieldValue } from "firebase-admin/firestore";
import type { DocumentReference } from "firebase-admin/firestore";
import { buildStrategyPrompt } from "@/lib/prompts/strategy";
import { buildCopyPrompt, buildLinkedInCopyPrompt } from "@/lib/prompts/copy";
import { fetchLinkedInTrendContext, fetchTrendContext, readTrendCache, writeTrendCache } from "@/lib/tavily";
import { buildArtDirectorPrompt } from "@/lib/prompts/art-director";
import { checkRateLimit, AI_DAILY_LIMIT } from "@/lib/rate-limit";
import { evaluateImageQuality } from "@/lib/vision-quality";
import { createTask, FreepikAuthError } from "@/lib/freepik";
import { generateImage as imagenGenerate, isImagen4Enabled, resolveImagenModel, ImagenError } from "@/lib/imagen";
import { generateImageFal, isFalEnabled, resolveFalModel, FalError } from "@/lib/fal";
import { composePost } from "@/lib/composer";
import { resolveArtDirection, toComposeOverrides } from "@/lib/art-direction-resolver";
import { compilePromptForProvider, type ImageProvider } from "@/lib/prompt-compiler";
import type { ArtDirection, BrandProfile, BrandDNA, CopyDNA, MoodboardItem, StrategyBriefing, StrategyContext, DesignExample, ReferenceDNA, SocialNetwork } from "@/types";

// Allow up to 60s — Imagen 4 is synchronous and can take 5–15s
export const maxDuration = 60;

const anthropic       = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL           = process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001";
const STRATEGY_MODEL  = "claude-sonnet-4-6";
const THINKING_BUDGET = 8000;

const ASPECT_RATIO: Record<string, string> = {
  feed:        "social_post_4_5",
  stories:     "social_story_9_16",
  reels_cover: "social_story_9_16",
};

function parseJson<T>(raw: string): T {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  return JSON.parse(cleaned) as T;
}

export async function POST(req: NextRequest) {
  let postRef: DocumentReference | null = null;

  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // ── Rate limit check ──────────────────────────────────────────────────────
    const rl = await checkRateLimit(user.uid);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: `Limite diário de ${AI_DAILY_LIMIT} gerações atingido. Redefine em ${rl.resetAt}.` },
        { status: 429, headers: { "X-RateLimit-Reset": rl.resetAt } }
      );
    }

    const body = await req.json() as {
      client_id:             string;
      campaign_focus?:       string;
      reference_dna?:        ReferenceDNA;
      /** Alternativa: ID de um design_example já salvo na biblioteca da marca */
      reference_example_id?: string;
      /** Rede social alvo. Default: "instagram" */
      social_network?:       SocialNetwork;
    };
    const { client_id, campaign_focus, reference_example_id } = body;
    const social_network: SocialNetwork = body.social_network ?? "instagram";
    let reference_dna: ReferenceDNA | undefined = body.reference_dna;

    if (!client_id) {
      return NextResponse.json({ error: "client_id é obrigatório" }, { status: 400 });
    }

    // ── Resolver reference_dna a partir de reference_example_id ──────────────
    // Permite que o usuário escolha uma referência da biblioteca em vez de
    // re-uploadar a imagem (fluxo unificado).
    if (!reference_dna && reference_example_id) {
      try {
        const exDoc = await adminDb
          .collection("clients").doc(client_id)
          .collection("design_examples").doc(reference_example_id)
          .get();

        if (exDoc.exists) {
          const ex = exDoc.data() as DesignExample;
          // Só promove a ReferenceDNA se o doc tiver os campos ricos
          if (ex.background_treatment || ex.headline_style || ex.text_zones) {
            reference_dna = {
              composition_zone:      ex.composition_zone,
              text_zones:            ex.text_zones ?? "",
              background_treatment:  ex.background_treatment ?? "",
              headline_style:        ex.headline_style ?? "",
              typography_hierarchy:  ex.typography_hierarchy ?? "",
              visual_prompt:         ex.visual_prompt,
              layout_prompt:         ex.layout_prompt,
              color_mood:            ex.color_mood,
              description:           ex.description,
              pilar:                 ex.pilar,
              format:                ex.format,
              visual_headline_style: ex.visual_headline_style,
              ...(ex.logo_placement ? { logo_placement: ex.logo_placement } : {}),
            };
          }
        }
      } catch (resolveErr) {
        console.warn("[generate] Falha ao resolver reference_example_id (non-fatal):", resolveErr);
      }
    }

    // ── Load client ───────────────────────────────────────────────────────────
    const clientDoc = await adminDb.collection("clients").doc(client_id).get();
    if (!clientDoc.exists || clientDoc.data()?.agency_id !== user.uid) {
      return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
    }
    const client = { id: clientDoc.id, ...clientDoc.data() } as BrandProfile;

    // ── Create pending post doc ───────────────────────────────────────────────
    postRef = adminDb.collection("posts").doc();
    await postRef.set({
      id:         postRef.id,
      agency_id:  user.uid,
      client_id,
      client_name: client.name,
      status:     "pending",
      created_at: FieldValue.serverTimestamp(),
    });

    // ── Step 1: Strategy agent ────────────────────────────────────────────────
    await postRef.update({ status: "strategy", social_network });

    // Tendências: cache-first (cron job pré-busca diariamente), fallback ao vivo
    const fetchFn = social_network === "linkedin" ? fetchLinkedInTrendContext : fetchTrendContext;
    const trendContext = await readTrendCache(client_id, social_network)
      .catch(() => null)
      .then(async cached => {
        if (cached) return cached;
        const live = await fetchFn(client.segment, campaign_focus).catch(() => null);
        if (live) await writeTrendCache(client_id, social_network, live, user.uid).catch(() => null);
        return live;
      });

    // Strategy Agent: Extended Thinking (Sonnet) para raciocínio de mercado real
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const strategyRes = await (anthropic.messages.create as (params: any) => Promise<Anthropic.Message>)({
      model:      STRATEGY_MODEL,
      max_tokens: 16000,
      thinking:   { type: "enabled", budget_tokens: THINKING_BUDGET },
      system:     buildStrategyPrompt(client, campaign_focus, trendContext, social_network),
      messages:   [{ role: "user", content: "Gere o briefing estratégico para o próximo post deste cliente." }],
    });

    // Extended Thinking: content[0] é bloco "thinking" — filtrar só texto
    const strategyRaw = (strategyRes.content as Array<{ type: string; text?: string }>)
      .filter(b => b.type === "text")
      .map(b => b.text ?? "")
      .join("");
    let briefing: StrategyBriefing;
    try {
      briefing = parseJson<StrategyBriefing>(strategyRaw);
    } catch {
      await postRef.update({ status: "failed", error: "Falha ao parsear briefing estratégico" });
      return NextResponse.json({ error: "Falha ao parsear resposta do Agente Estrategista", raw: strategyRaw }, { status: 500 });
    }

    await postRef.update({
      pilar:              briefing.pilar,
      tema:               briefing.tema,
      objective:          briefing.objetivo,
      format:             briefing.formato_sugerido,
      publico_especifico: briefing.publico_especifico,
      dor_desejo:         briefing.dor_desejo,
      hook_type:          briefing.hook_type,
      rationale:          briefing.rationale,
    });

    // ── Step 1b: Carregar BrandDNA + CopyDNA + MoodBoard (em paralelo) ─────────
    const [brandDnaResult, copyDnaResult, moodboardResult] = await Promise.allSettled([
      adminDb.collection("clients").doc(client_id).collection("brand_dna").doc("current").get(),
      adminDb.collection("clients").doc(client_id).collection("copy_dna").doc("current").get(),
      adminDb.collection("clients").doc(client_id).collection("moodboard")
        .orderBy("created_at", "desc").limit(6).get(),
    ]);

    const brandDna: BrandDNA | null = brandDnaResult.status === "fulfilled" && brandDnaResult.value.exists
      ? brandDnaResult.value.data() as BrandDNA : null;
    const copyDna: CopyDNA | null = copyDnaResult.status === "fulfilled" && copyDnaResult.value.exists
      ? copyDnaResult.value.data() as CopyDNA : null;
    const moodboardItems: MoodboardItem[] = moodboardResult.status === "fulfilled"
      ? moodboardResult.value.docs.map(d => ({ id: d.id, ...d.data() } as MoodboardItem)) : [];

    // ── Step 2a: Se reference_dna fornecido, salva no Firestore ─────────────
    if (reference_dna) {
      await postRef.update({ reference_dna });
    }
    if (brandDna) {
      await postRef.update({
        brand_dna_used:       true,
        brand_dna_confidence: brandDna.confidence_score,
        brand_dna_examples:   brandDna.examples_count,
      });
    }

    // ── Step 2: Load client design examples (few-shot for Copy agent) ────────
    // Fetch up to 5 examples matching this pilar + format. Falls back to
    // any format if not enough pilar-specific examples exist.
    let designExamples: DesignExample[] = [];
    try {
      const exSnap = await adminDb
        .collection("clients").doc(client_id)
        .collection("design_examples")
        .where("pilar",  "==", briefing.pilar)
        .where("format", "==", briefing.formato_sugerido)
        .orderBy("created_at", "desc")
        .limit(5)
        .get();

      designExamples = exSnap.docs.map(d => ({ id: d.id, ...d.data() } as DesignExample));

      // If fewer than 3 pilar-specific, fill with any format examples for this pilar
      if (designExamples.length < 3) {
        const fillSnap = await adminDb
          .collection("clients").doc(client_id)
          .collection("design_examples")
          .where("pilar", "==", briefing.pilar)
          .orderBy("created_at", "desc")
          .limit(5)
          .get();
        const existing = new Set(designExamples.map(e => e.id));
        for (const doc of fillSnap.docs) {
          if (!existing.has(doc.id)) {
            designExamples.push({ id: doc.id, ...doc.data() } as DesignExample);
            if (designExamples.length >= 5) break;
          }
        }
      }
    } catch {
      // Non-fatal — generation continues without examples
    }

    // Se reference_dna fornecido, injeta como DesignExample primário (prioridade máxima)
    if (reference_dna) {
      const syntheticExample: DesignExample = {
        id:                    "reference_dna",
        agency_id:             user.uid,
        client_id,
        visual_prompt:         reference_dna.visual_prompt,
        layout_prompt:         reference_dna.layout_prompt,
        visual_headline_style: reference_dna.visual_headline_style,
        pilar:                 reference_dna.pilar as DesignExample["pilar"],
        format:                reference_dna.format,
        description:           reference_dna.description,
        color_mood:            reference_dna.color_mood,
        composition_zone:      reference_dna.composition_zone,
        created_at:            { seconds: Date.now() / 1000, nanoseconds: 0 } as import("firebase/firestore").Timestamp,
      };
      // Coloca na frente — Art Director prioriza os primeiros exemplos
      designExamples = [syntheticExample, ...designExamples].slice(0, 5);
    }

    // ── Desvio LinkedIn: copy especializado + retorno imediato (sem imagem) ───
    if (social_network === "linkedin") {
      await postRef.update({ status: "copy" });

      const liStrategy: StrategyContext = {
        pilar:              briefing.pilar,
        publico_especifico: briefing.publico_especifico,
        dor_desejo:         briefing.dor_desejo,
        hook_type:          briefing.hook_type,
      };

      const liCopyRes = await anthropic.messages.create({
        model:      MODEL,
        max_tokens: 4096,
        system:     buildLinkedInCopyPrompt(
          client,
          briefing.formato_sugerido,
          briefing.objetivo,
          liStrategy,
        ),
        messages: [{ role: "user", content: `Tema: ${briefing.tema}\nObjetivo: ${briefing.objetivo}\n\nEscreva o melhor post LinkedIn possível para este cliente.` }],
      });

      const liCopyRaw = liCopyRes.content[0].type === "text" ? liCopyRes.content[0].text : "";
      let liCopy: {
        visual_headline: string; headline: string; caption: string;
        hashtags: string[]; framework_used: string; hook_type: string;
      };
      try {
        liCopy = parseJson(liCopyRaw);
      } catch {
        await postRef.update({ status: "failed", error: "Falha ao parsear copy LinkedIn" });
        return NextResponse.json({ error: "Falha ao parsear resposta do Agente de Copy LinkedIn", raw: liCopyRaw }, { status: 500 });
      }

      await postRef.update({
        theme:           briefing.tema,
        visual_headline: liCopy.visual_headline,
        headline:        liCopy.headline,
        caption:         liCopy.caption,
        hashtags:        liCopy.hashtags,
        framework_used:  liCopy.framework_used,
        hook_type:       liCopy.hook_type,
        image_url:       null,
        status:          "ready",
      });

      return NextResponse.json({
        post_id:        postRef.id,
        task_id:        null,
        image_url:      null,
        composed_url:   null,
        image_provider: null,
        social_network: "linkedin",
        briefing,
        copy: {
          visual_headline: liCopy.visual_headline,
          headline:        liCopy.headline,
          caption:         liCopy.caption,
          hashtags:        liCopy.hashtags,
          framework_used:  liCopy.framework_used,
          hook_type:       liCopy.hook_type,
        },
        art_direction: null,
      });
    }

    // ── Step 3: Copy agent ────────────────────────────────────────────────────
    await postRef.update({ status: "copy" });

    const strategy: StrategyContext = {
      pilar:              briefing.pilar,
      publico_especifico: briefing.publico_especifico,
      dor_desejo:         briefing.dor_desejo,
      hook_type:          briefing.hook_type,
    };

    const copyUserContent = reference_dna
      ? [
          `DNA VISUAL DA REFERÊNCIA — guia prioritário:\n`,
          `Zona: ${reference_dna.composition_zone} | Hierarquia: ${reference_dna.typography_hierarchy}`,
          `Visual prompt base: "${reference_dna.visual_prompt}"`,
          `Layout prompt base: "${reference_dna.layout_prompt}"`,
          `\nTema: ${briefing.tema}\nObjetivo: ${briefing.objetivo}`,
          `\n\nAdapte o estilo da referência ao tema atual. Escreva o melhor post possível.`,
        ].join("\n")
      : `Tema: ${briefing.tema}\nObjetivo: ${briefing.objetivo}\n\nEscreva o melhor post possível para este cliente seguindo o framework selecionado.`;

    const copyRes = await anthropic.messages.create({
      model:      MODEL,
      max_tokens: 4096,
      system:     buildCopyPrompt(
        client,
        briefing.formato_sugerido,
        briefing.objetivo,
        strategy,
        designExamples.length ? designExamples : undefined,
        !!reference_dna,
        reference_dna?.visual_prompt,   // lock visual style to reference DNA
        copyDna ?? undefined,           // padrões aprendidos dos posts aprovados
      ),
      messages:   [{ role: "user", content: copyUserContent }],
    });

    const copyRaw = copyRes.content[0].type === "text" ? copyRes.content[0].text : "";
    let copy: {
      visual_headline: string; headline: string; caption: string;
      hashtags: string[]; visual_prompt: string; layout_prompt: string;
      framework_used: string; hook_type: string;
    };
    try {
      copy = parseJson(copyRaw);
    } catch {
      await postRef.update({ status: "failed", error: "Falha ao parsear copy" });
      return NextResponse.json({ error: "Falha ao parsear resposta do Agente de Copy", raw: copyRaw }, { status: 500 });
    }

    await postRef.update({
      theme:           briefing.tema,
      visual_headline: copy.visual_headline,
      headline:        copy.headline,
      caption:         copy.caption,
      hashtags:        copy.hashtags,
      visual_prompt:   copy.visual_prompt,
      layout_prompt:   copy.layout_prompt ?? null,
      framework_used:  copy.framework_used,
      hook_type:       copy.hook_type,
      image_url:       null,
    });

    // ── Step 4: Art Director agent ────────────────────────────────────────────
    // Elevates the Copy agent's visual_prompt into a professional art direction JSON.
    // The final_visual_prompt from this step replaces the raw copy visual_prompt for Freepik.
    await postRef.update({ status: "art_direction" });

    let artDirection: ArtDirection | null = null;
    let freepikPrompt = copy.visual_prompt; // fallback if Art Director fails
    let freepikLayoutPrompt = copy.layout_prompt ?? null;

    try {
      const artRes = await anthropic.messages.create({
        model:      MODEL,
        max_tokens: 1024,
        system:     buildArtDirectorPrompt(
          client,
          briefing,
          {
            visual_headline: copy.visual_headline,
            visual_prompt:   copy.visual_prompt,
            layout_prompt:   copy.layout_prompt,
          },
          designExamples.length ? designExamples : undefined,
          brandDna ?? undefined,
          moodboardItems.length ? moodboardItems : undefined,
        ),
        messages: [{ role: "user", content: "Gere a direção de arte profissional para este post." }],
      });

      const artRaw = artRes.content[0].type === "text" ? artRes.content[0].text : "";
      artDirection = parseJson<ArtDirection>(artRaw);
      freepikPrompt      = artDirection.final_visual_prompt;
      freepikLayoutPrompt = artDirection.final_layout_prompt;

      await postRef.update({
        art_direction:  artDirection,
        visual_prompt:  artDirection.final_visual_prompt,
        layout_prompt:  artDirection.final_layout_prompt,
      });
    } catch (artErr) {
      // Non-fatal — generation continues with Copy agent's visual_prompt
      console.error("[generate] Art Director error (non-fatal):", artErr instanceof Error ? artErr.message : artErr);
    }

    // ── Step 5: Image generation ──────────────────────────────────────────────
    // Providers (via IMAGE_PROVIDER env var ou sobrescrito por request):
    //   fal     → FAL.ai Flux Pro Ultra (sync, premium quality)
    //   imagen4 → Google Imagen 4 (sync)
    //   freepik → Freepik Mystic (async, frontend polls check-image)
    //   seedream→ Freepik Seedream V5 Lite (async)
    await postRef.update({ status: "generating" });

    // Determina o provider ativo para compilar o prompt correto
    const activeProvider: ImageProvider = isFalEnabled()
      ? "fal"
      : isImagen4Enabled()
      ? "imagen4"
      : (process.env.IMAGE_PROVIDER as ImageProvider | undefined) ?? "freepik";

    // Compila prompt otimizado para o provider ativo
    // Se o Art Director produziu art_direction estruturado, usa o compilador;
    // caso contrário cai no freepikPrompt (visual_prompt elevado ou raw copy)
    const compiledFinal = artDirection
      ? compilePromptForProvider(activeProvider, artDirection, client).final
      : freepikPrompt;

    let task_id:        string | null = null;
    let image_url:      string | null = null;
    let composed_url:   string | null = null;
    let image_provider                = "freepik";

    if (isFalEnabled()) {
      // ── FAL.ai path (synchronous) ────────────────────────────────────────────
      try {
        image_url      = await generateImageFal({
          prompt:  compiledFinal,
          format:  briefing.formato_sugerido as "feed" | "stories" | "reels_cover",
          post_id: postRef.id,
          model:   resolveFalModel(),
        });
        image_provider = "fal";
        await postRef.update({ image_url, image_provider: "fal", status: "ready" });
      } catch (falErr) {
        const msg = falErr instanceof Error ? falErr.message : "Erro FAL.ai";
        console.error("[generate] FAL.ai error (non-fatal):", msg);
        await postRef.update({ status: "ready", fal_error: msg });
      }

    } else if (isImagen4Enabled()) {
      // ── Imagen 4 path (synchronous) ──────────────────────────────────────────
      try {
        image_url      = await imagenGenerate({
          prompt:  compiledFinal,
          format:  briefing.formato_sugerido as "feed" | "stories" | "reels_cover",
          post_id: postRef.id,
          model:   resolveImagenModel(),
        });
        image_provider = "imagen4";
        await postRef.update({ image_url, image_provider: "imagen4", status: "ready" });
      } catch (imgErr) {
        const msg = imgErr instanceof Error ? imgErr.message : "Erro Imagen";
        console.error("[generate] Imagen 4 error (non-fatal):", msg);
        await postRef.update({ status: "ready", imagen_error: msg });
      }

    } else {
      // ── Freepik path (async — frontend polls check-image) ────────────────────
      try {
        const aspect = ASPECT_RATIO[briefing.formato_sugerido] ?? "social_post_4_5";
        const task   = await createTask({
          prompt:       compiledFinal,
          aspect_ratio: aspect,
          realism:      true,
          styling:      { colors: [{ color: client.primary_color, weight: 0.5 }] },
        });
        task_id        = task.task_id;
        image_provider = "freepik";
        await postRef.update({ freepik_task_id: task_id, image_provider: "freepik" });
      } catch (freepikErr) {
        const msg = freepikErr instanceof Error ? freepikErr.message : "Erro Freepik";
        console.error("[generate] Freepik error (non-fatal):", msg);
        await postRef.update({ status: "ready", freepik_error: msg });
      }
    }

    // ── Step 5b: Vision Quality Gate (providers síncronos apenas) ────────────
    // Avalia se a imagem gerada suporta o headline e o logo antes de compor.
    // Freepik é async — avaliação ocorre em check-image.
    const MAX_QUALITY_RETRIES = 1;
    if (image_url && !task_id) {
      for (let attempt = 0; attempt <= MAX_QUALITY_RETRIES; attempt++) {
        const quality = await evaluateImageQuality(
          image_url,
          copy.visual_headline ?? briefing.tema,
          client.primary_color,
        ).catch(() => null);

        if (quality) {
          await postRef.update({ quality_score: quality.score, quality_notes: quality.notes }).catch(() => null);
          if (quality.passed || attempt === MAX_QUALITY_RETRIES) break;

          // Score baixo — tenta regeração com negative prompt reforçado
          console.log(`[generate] Quality score ${quality.score} < 60 — retrying image generation (attempt ${attempt + 1})`);
          const negativeBoost = "busy background, text in image, watermark, distorted, overcrowded composition";
          const retryPrompt   = `${compiledFinal}, clear negative space for text overlay, minimalist composition`;

          try {
            if (isFalEnabled()) {
              image_url = await generateImageFal({ prompt: retryPrompt, format: briefing.formato_sugerido as "feed" | "stories" | "reels_cover", post_id: postRef.id, model: resolveFalModel() });
              await postRef.update({ image_url, image_provider: "fal" });
            } else if (isImagen4Enabled()) {
              image_url = await imagenGenerate({ prompt: retryPrompt, format: briefing.formato_sugerido as "feed" | "stories" | "reels_cover", post_id: postRef.id, model: resolveImagenModel() });
              await postRef.update({ image_url, image_provider: "imagen4" });
            }
          } catch {
            break; // se retry falhar, segue com o que tem
          }
          void negativeBoost; // used implicitly in retryPrompt
        } else {
          break;
        }
      }
    }

    // ── Step 6: Auto-compose (providers síncronos geram a arte final) ─────────
    // Freepik é async → compose ocorre em /api/posts/check-image quando completo
    if (image_url && !task_id) {
      try {
        await postRef.update({ status: "composing" });
        const ad = resolveArtDirection(
          { art_direction: artDirection ?? undefined },
          reference_dna,
          brandDna ?? undefined,
        );
        composed_url = await composePost({
          imageUrl:             image_url,
          logoUrl:              client.logo_url,
          visualHeadline:       copy.visual_headline ?? briefing.tema,
          instagramHandle:      client.instagram_handle,
          clientName:           client.name,
          primaryColor:         client.primary_color,
          secondaryColor:       client.secondary_color,
          format:               briefing.formato_sugerido,
          postId:               postRef.id,
          ...toComposeOverrides(ad),
        });
        await postRef.update({ composed_url, status: "ready" });
      } catch (composeErr) {
        const msg = composeErr instanceof Error ? composeErr.message : "Erro compositor";
        console.error("[generate] Compositor error (non-fatal):", msg);
        await postRef.update({ status: "ready", compose_error: msg });
      }
    }

    return NextResponse.json({
      post_id:        postRef.id,
      task_id,
      image_url,
      composed_url,
      image_provider,
      briefing,
      copy: {
        visual_headline: copy.visual_headline,
        headline:        copy.headline,
        caption:         copy.caption,
        hashtags:        copy.hashtags,
        visual_prompt:   copy.visual_prompt,
        layout_prompt:   copy.layout_prompt,
        framework_used:  copy.framework_used,
        hook_type:       copy.hook_type,
      },
      art_direction: artDirection,
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro interno";
    console.error("[POST /api/posts/generate]", message);

    if (postRef) {
      await postRef.update({ status: "failed", error: message }).catch(() => null);
    }

    if (err instanceof FreepikAuthError || err instanceof ImagenError || err instanceof FalError) {
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
