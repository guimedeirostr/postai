/**
 * POST /api/posts/generate-image
 *
 * Dispara (ou executa) geração de imagem para um post que já tem
 * visual_prompt mas ainda não tem imagem.
 *
 * ── Prioridade de provider ────────────────────────────────────────────────────
 * A seleção segue a ordem:
 *   1. `provider` no body da requisição  (override explícito da UI)
 *   2. IMAGE_PROVIDER env var             (configuração de deployment)
 *   3. post.image_provider no Firestore   (salvo numa geração anterior)
 *   4. "freepik" (default)
 *
 * ── Modos de geração FAL.ai ───────────────────────────────────────────────────
 *   fal          → Flux Pro txt2img padrão
 *   fal_pulid    → Flux + PuLID: trava identidade/rosto via foto de referência
 *   fal_canny    → Flux + ControlNet Canny: trava estrutura/composição
 *   fal_depth    → Flux + ControlNet Depth: trava volume/perspectiva
 *
 * ── Body params ───────────────────────────────────────────────────────────────
 *   post_id              (obrigatório)
 *   provider?            fal | fal_pulid | fal_canny | fal_depth | freepik |
 *                        seedream | imagen4
 *   image_url?           URL de foto da biblioteca (dispara Seedream Edit)
 *   character_lock_url?  URL de foto de rosto para PuLID
 *   control_image_url?   URL de imagem de referência para ControlNet
 *   control_type?        "canny" | "depth"
 *   id_weight?           0.0–1.8  força do character lock (default 1.0)
 *   control_strength?    0.0–1.0  força do ControlNet     (default 0.7)
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/session";
import {
  createTask,
  createMystic2Task,
  createSeedreamTask,
  createSeedreamEditTask,
  freepikAspect,
  FreepikAuthError,
  extractPromptFromImage,
} from "@/lib/freepik";
import {
  generateImage as imagenGenerate,
  isImagen4Enabled,
  resolveImagenModel,
  ImagenError,
} from "@/lib/imagen";
import {
  generateImageFal,
  generateWithCharacterLock,
  generateWithCanny,
  generateWithDepth,
  isFalEnabled,
  resolveFalModel,
  FalError,
} from "@/lib/fal";
import {
  compilePromptForProvider,
  type ImageProvider,
} from "@/lib/prompt-compiler";
import {
  generateImageReplicate,
  generateWithIdeogramText,
  isReplicateEnabled,
  type ReplicateImageModel,
} from "@/lib/replicate";
import { buildIdeogramTextPrompt } from "@/lib/prompts/ideogram-text";
import { composePost } from "@/lib/composer";
import {
  loadDnaSources,
  resolveArtDirection,
  toComposeOverrides,
} from "@/lib/art-direction-resolver";
import { analyzeImage } from "@/lib/image-analysis";
import { composeLayerStack, layerStackToLayoutPrompt, TONE_PROFILES } from "@/lib/art-direction-engine";
import { renderHtml, isRendererEnabled } from "@/lib/chromium-renderer";
import { fillHtmlTemplate } from "@/lib/prompts/html-template";
import { buildGenericTemplate } from "@/lib/prompts/generic-template";
import { uploadToR2 } from "@/lib/r2";
import { checkTextLegibility, isVisionEnabled, getVisionApiKey } from "@/lib/vision";
import { getDepthMapUrl } from "@/lib/replicate";
import { applyDepthEffect } from "@/lib/depth-compositor";
import { runVisualPerception, applyPerceptionToLayerStack } from "@/lib/visual-perception";
import type { ArtDirection, BrandProfile, DesignExample, GeneratedPost, ReferenceDNA, BackgroundAnalysis, ToneProfile, LayerStack } from "@/types";

// Aguarda até 120s — PuLID e ControlNet podem ser mais lentos
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const {
      post_id,
      provider: providerOverride,
      image_url:            libraryImageUrl,
      character_lock_url:   characterLockUrl,
      control_image_url:    controlImageUrl,
      control_type,
      id_weight,
      control_strength,
      replicate_model,
      visual_prompt_override,
    } = await req.json() as {
      post_id:               string;
      provider?:             string;
      image_url?:            string;
      character_lock_url?:   string;
      control_image_url?:    string;
      control_type?:         "canny" | "depth";
      id_weight?:            number;
      control_strength?:     number;
      replicate_model?:      ReplicateImageModel;
      /** Prompt editado pelo usuário no frontend — substitui o gerado pela IA */
      visual_prompt_override?: string;
    };

    if (!post_id) {
      return NextResponse.json({ error: "post_id é obrigatório" }, { status: 400 });
    }

    // ── Carregar post ──────────────────────────────────────────────────────────
    const postDoc = await adminDb.collection("posts").doc(post_id).get();
    if (!postDoc.exists || postDoc.data()?.agency_id !== user.uid) {
      return NextResponse.json({ error: "Post não encontrado" }, { status: 404 });
    }

    const post = postDoc.data()!;
    if (!post.visual_prompt) {
      return NextResponse.json(
        { error: "Post sem visual_prompt — rode generate-copy primeiro" },
        { status: 400 }
      );
    }

    // ── Aplicar override do prompt (usuário editou no frontend) ───────────────
    if (visual_prompt_override?.trim() && visual_prompt_override !== post.visual_prompt) {
      await postDoc.ref.update({ visual_prompt: visual_prompt_override.trim() });
      post.visual_prompt = visual_prompt_override.trim();
      console.log(`[generate-image] visual_prompt substituído pelo usuário (${post.visual_prompt.length} chars)`);
    }

    await postDoc.ref.update({ status: "generating" });

    // ── Resolver provider final ────────────────────────────────────────────────
    // Lógica: override explícito > env > tone_profile auto > post salvo > default
    //
    // Auto-ativação Ideogram por tone_profile:
    // tone_profiles de alto impacto gráfico (bold_aggressive, vibrant_pop) se
    // beneficiam de tipografia nativa do Ideogram — ativado automaticamente
    // quando não há foto de biblioteca e não há override explícito.
    const toneProfileName = (post.layer_stack as LayerStack | undefined)?.tone_profile?.name
      ?? (post as Record<string, unknown>).tone_profile_name as string | undefined;

    // Ideogram ativo sempre que REPLICATE_API_KEY estiver configurada e não houver override.
    // Para posts sem foto de biblioteca: txt2img (gera cena + texto juntos).
    // Para posts com foto de biblioteca: img2img (mantém a foto, embute o texto).
    const shouldAutoIdeogram =
      !providerOverride &&
      !process.env.IMAGE_PROVIDER &&
      isReplicateEnabled();

    // Para posts SEM foto de biblioteca: Ideogram txt2img quando REPLICATE disponível.
    // Para posts COM foto de biblioteca: Ideogram img2img já é tratado inline no bloco library_direct.
    const resolvedProvider = (
      providerOverride
      ?? process.env.IMAGE_PROVIDER
      ?? (shouldAutoIdeogram && !libraryImageUrl ? "ideogram_text" : undefined)
      ?? (post.image_provider as string | undefined)
      ?? "freepik"
    ) as ImageProvider;

    if (shouldAutoIdeogram && !libraryImageUrl) {
      console.log(`[generate-image] Auto-ativando Ideogram txt2img (tone=${toneProfileName ?? "none"})`);
    }

    // ── Compilar prompt otimizado para o provider ──────────────────────────────
    // Se o post tem art_direction estruturado, usa o compilador.
    // Caso contrário, usa o visual_prompt bruto (fallback).
    const artDirection = post.art_direction as ArtDirection | undefined;
    const clientDoc    = await adminDb.collection("clients").doc(post.client_id).get();
    const client       = { id: clientDoc.id, ...clientDoc.data() } as BrandProfile;

    const basePrompt = artDirection
      ? compilePromptForProvider(resolvedProvider, artDirection, client).final
      : (post.visual_prompt as string);

    // ═══════════════════════════════════════════════════════════════════════════
    // Foto da biblioteca: composição DIRETA — sem geração de imagem
    // DEVE ficar antes de qualquer provider — não é geração, é composição pura.
    // A foto escolhida pelo usuário é o fundo final. Nenhuma IA toca nela.
    // ═══════════════════════════════════════════════════════════════════════════
    if (libraryImageUrl) {
      const dna = await loadDnaSources(post as GeneratedPost & { reference_dna?: ReferenceDNA });
      const ad  = resolveArtDirection(post, dna.refDna, dna.brandDna);

      // ── PATH 0: Ideogram img2img — tipografia nativa sobre foto real ───────
      // O Ideogram recebe a foto da biblioteca como referência (image_url) e
      // gera uma arte com o texto embutido nativamente — qualidade tipográfica
      // de agência, sem precisar do compositor.
      // image_weight=0.75 preserva 75% do visual original da foto.
      // Fallback: Chrome renderer (PATH A) se o Ideogram falhar.
      if (isReplicateEnabled()) {
        try {
          const headline = (post.visual_headline ?? post.headline ?? "") as string;
          const { prompt: ideogramPrompt, negative_prompt, style_type, magic_prompt_option } =
            buildIdeogramTextPrompt({
              client,
              headline,
              basePrompt,
              toneProfileName,
            });

          console.log(`[generate-image/ideogram-img2img] Iniciando com foto da biblioteca — style=${style_type} tone=${toneProfileName ?? "none"}`);

          const result = await generateWithIdeogramText({
            prompt:              ideogramPrompt,
            negative_prompt,
            style_type,
            magic_prompt_option,
            image_url:           libraryImageUrl,   // ← foto real como referência
            image_weight:        0.75,
            format:              (post.format ?? "feed") as "feed" | "stories" | "reels_cover",
            post_id,
          });

          if (result.done && result.image_url) {
            await postDoc.ref.update({
              image_url:      result.image_url,
              composed_url:   result.image_url,
              image_provider: "ideogram_img2img",
              status:         "ready",
            });
            console.log(`[generate-image/ideogram-img2img] Sucesso: ${result.image_url}`);
            return NextResponse.json({
              image_url:    result.image_url,
              composed_url: result.image_url,
              post_id,
              provider:     "ideogram_img2img",
            });
          }

          // Assíncrono — frontend faz polling em check-image
          if (result.task_id) {
            await postDoc.ref.update({
              image_url:       libraryImageUrl,
              freepik_task_id: result.task_id,
              image_provider:  "ideogram_img2img",
            });
            return NextResponse.json({
              task_id:  result.task_id,
              post_id,
              provider: "ideogram_img2img",
            });
          }
        } catch (ideogramErr) {
          console.warn("[generate-image/ideogram-img2img] Falhou, continuando para Chrome renderer:", ideogramErr);
        }
      }

      // ── PATH A: Chromium renderer (qualidade agência) ─────────────────────
      // Usa o HTML template gerado pelo Claude Vision a partir da referência.
      // Se o renderer estiver disponível E o design_example tiver template → usa.
      console.log(`[generate-image] library_direct: RENDERER_URL=${process.env.RENDERER_URL ? "SET" : "NOT SET"}, client_id=${post.client_id}`);
      if (isRendererEnabled()) {
        try {
          // Busca o design_example mais recente com html_template
          const exSnap = await adminDb
            .collection("clients").doc(post.client_id)
            .collection("design_examples")
            .orderBy("created_at", "desc")
            .limit(10)
            .get();

          const allExamples = exSnap.docs.map(d => d.data() as DesignExample);
          const withTemplate = allExamples.filter(e => e.html_template && e.html_template.length > 100);
          console.log(`[generate-image] design_examples encontrados: ${allExamples.length}, com html_template: ${withTemplate.length}`);
          if (allExamples.length > 0) {
            console.log(`[generate-image] IDs: ${allExamples.map(e => e.id).join(", ")}`);
            console.log(`[generate-image] Com template: ${withTemplate.map(e => e.id).join(", ") || "nenhum"}`);
          }

          const exWithTemplate = withTemplate[0] ?? null;

          // ── Dados comuns para ambos os caminhos (template de referência ou genérico)
          const headline = (post.visual_headline ?? post.headline ?? "") as string;
          const format   = (post.format ?? "feed") as "feed" | "stories" | "reels_cover";
          const H        = format === "feed" ? 1350 : 1920;
          const strategy = post.strategy as { tema?: string; pilar?: string } | undefined;
          const rawCaption = (post.caption ?? "") as string;
          const captionLines = rawCaption.split(/\n+/).map((l: string) => l.trim()).filter(Boolean);
          const preHeadline      = strategy?.tema ?? strategy?.pilar ?? "";
          const captionFirstLine = captionLines[0] ?? "";

          // Chrome é o caminho principal — usa template de referência se disponível,
          // senão usa o template genérico de alta qualidade (sempre melhor que Sharp).
          let htmlToRender: string;

          if (exWithTemplate?.html_template) {
            console.log(`[generate-image] Usando template de referência: ${exWithTemplate.id}`);
            htmlToRender = fillHtmlTemplate(exWithTemplate.html_template, {
              photoUrl:            libraryImageUrl,
              headline,
              preHeadline,
              captionFirstLine,
              logoUrl:             client.logo_url        ?? "",
              brandColor:          client.primary_color    ?? "#000000",
              secondaryColor:      client.secondary_color  ?? "#ffffff",
              brandName:           client.name,
              instagramHandle:     client.instagram_handle ?? "",
              canvasWidth:         1080,
              canvasHeight:        H,
              backgroundTreatment: exWithTemplate.background_treatment,
            });
          } else {
            // Sem template de referência → template genérico profissional
            console.log("[generate-image] Sem template de referência → usando template genérico");
            const currentLayerStack = (post.layer_stack ?? null) as LayerStack | null;
            htmlToRender = buildGenericTemplate({
              photoUrl:         libraryImageUrl,
              headline,
              preHeadline,
              captionFirstLine,
              logoUrl:          client.logo_url        ?? "",
              brandColor:       client.primary_color    ?? "#000000",
              secondaryColor:   client.secondary_color  ?? "#ffffff",
              brandName:        client.name,
              instagramHandle:  client.instagram_handle ?? "",
              format,
              layer_stack:      currentLayerStack ?? undefined,
            });
          }

          console.log("[generate-image] Renderizando com Chromium renderer");
          const jpegBuffer  = await renderHtml(htmlToRender, format);
          const key         = `posts/${post_id}/composed.jpg`;
          const composed_url = await uploadToR2(key, jpegBuffer, "image/jpeg");

          await postDoc.ref.update({
            image_url:      libraryImageUrl,
            composed_url,
            image_provider: "library_direct",
            status:         "ready",
          });

          return NextResponse.json({
            image_url:    libraryImageUrl,
            composed_url,
            post_id,
            provider:     "chromium",
          });

        } catch (renderErr) {
          // Renderer falhou → fallback para compositor Sharp abaixo
          console.warn("[generate-image] Chromium renderer falhou (fallback Sharp):", renderErr);
        }
      }

      // Análise real da foto da biblioteca via Sharp
      // Sempre gera um LayerStack — mesmo sem tone_profile no post (usa fallback warm_organic).
      // Após geração, aplica decisões explícitas do Reference DNA (wash, logo, footer).
      let library_layer_stack: LayerStack | null = null;
      try {
        const realBg = await analyzeImage(libraryImageUrl);
        const toneProf: ToneProfile =
          (post.layer_stack as LayerStack | undefined)?.tone_profile
          ?? (post as Record<string, unknown>).tone_profile as ToneProfile | undefined
          ?? TONE_PROFILES["warm_organic"];   // fallback para qualquer segmento

        library_layer_stack = composeLayerStack(realBg, toneProf, client);

        // ── Sobrescrever com decisões explícitas do Reference DNA ─────────────
        // O DNA diz "sem overlay" → zerar wash e footer bar (estilo editorial limpo)
        if (dna.refDna?.background_treatment) {
          const bt = dna.refDna.background_treatment.toLowerCase();
          const isNone = /\bnone\b|no overlay|no gradient|directly on|no treatment|text on image/.test(bt);
          if (isNone) {
            library_layer_stack.wash = { type: "none" };
            library_layer_stack.brand_elements.footer_bar.enabled = false;
            console.log("[generate-image] DNA background_treatment=none → wash desabilitado");
          }
        }
        // DNA define logo_placement → sobrescreve a decisão automática do engine
        if (dna.refDna?.logo_placement) {
          library_layer_stack.brand_elements.logo_position = dna.refDna.logo_placement;
          // Quando o logo é o elemento principal (bottom-center), usa tamanho grande
          if (dna.refDna.logo_placement === "bottom-center") {
            library_layer_stack.brand_elements.logo_size = "large";
          }
        }

        console.log("[generate-image] LayerStack gerado via Sharp para foto da biblioteca");
      } catch (analysisErr) {
        console.warn("[generate-image] analyzeImage (biblioteca) falhou (non-fatal):", analysisErr);
      }

      // ── Agente de Percepção Visual — raciocínio estético via Claude Vision ──
      // Substitui heurística de pixels por percepção contextual de diretor de arte.
      // Rodado em paralelo com o update de status para não adicionar latência.
      if (library_layer_stack) {
        try {
          const perception = await runVisualPerception(
            libraryImageUrl,
            (post.visual_headline ?? post.headline ?? client.name) as string,
            client,
          );
          if (perception) {
            library_layer_stack = applyPerceptionToLayerStack(library_layer_stack, perception, client);
            console.log("[generate-image] LayerStack atualizado com percepção visual do agente");
          }
        } catch (perceptionErr) {
          console.warn("[generate-image] Agente de percepção falhou (non-fatal):", perceptionErr);
        }
      }

      await postDoc.ref.update({
        status:    "composing",
        image_url: libraryImageUrl,
        ...(library_layer_stack ? { layer_stack: library_layer_stack } : {}),
      });

      // Merge: layer_stack recém-calculado tem prioridade sobre qualquer coisa no ad
      const adOverrides = toComposeOverrides(ad);
      const visualHeadlineSharp = (post.visual_headline ?? post.headline ?? client.name) as string;
      const composeArgs = {
        imageUrl:        libraryImageUrl,
        logoUrl:         client.logo_url,
        visualHeadline:  visualHeadlineSharp,
        instagramHandle: client.instagram_handle as string | undefined,
        clientName:      client.name,
        primaryColor:    client.primary_color,
        secondaryColor:  client.secondary_color,
        format:          (post.format ?? "feed") as "feed" | "stories" | "reels_cover",
        postId:          post_id,
        ...adOverrides,
        ...(library_layer_stack ? { layer_stack: library_layer_stack } : {}),
      };

      let composed_url = await composePost(composeArgs);

      // ── OCR legibility check — re-compõe com wash mais forte se texto ilegível ──
      if (isVisionEnabled()) {
        try {
          const visionKey = getVisionApiKey()!;
          const imgRes    = await fetch(composed_url);
          const imgBuf    = Buffer.from(await imgRes.arrayBuffer());
          const ocr       = await checkTextLegibility(imgBuf, visualHeadlineSharp, visionKey);

          console.log(`[generate-image/ocr] legible=${ocr.legible} confidence=${ocr.confidence.toFixed(2)} detected="${ocr.detectedText.slice(0, 60)}"`);

          if (!ocr.legible && library_layer_stack) {
            // Texto ilegível → reforça o wash e recompõe uma vez
            const wash = library_layer_stack.wash;
            if (wash.type === "none") {
              library_layer_stack.wash = { type: "gradient", direction: "bottom-up", from_opacity: 0, to_opacity: 0.65 };
            } else if (wash.type === "gradient") {
              wash.to_opacity = Math.min(0.9, (wash.to_opacity ?? 0.5) + 0.3);
            } else if (wash.type === "solid_band") {
              wash.opacity = Math.min(0.95, (wash.opacity ?? 0.8) + 0.15);
            } else if (wash.type === "vignette") {
              // Troca por gradient que garante contraste na zona de texto
              library_layer_stack.wash = { type: "gradient", direction: "bottom-up", from_opacity: 0, to_opacity: 0.7 };
            }

            console.log("[generate-image/ocr] Recompondo com wash reforçado:", library_layer_stack.wash);
            composed_url = await composePost({ ...composeArgs, layer_stack: library_layer_stack });
          }
        } catch (ocrErr) {
          console.warn("[generate-image/ocr] OCR check falhou (non-fatal):", ocrErr);
        }
      }

      // ── MiDaS Depth: efeito "texto atrás do sujeito" ─────────────────────────
      // Só roda se Replicate estiver configurado.
      // Corre em paralelo com o upload para minimizar latência adicional.
      // Se falhar (timeout, sem Replicate, etc.) → continua com a arte original.
      if (isReplicateEnabled()) {
        try {
          const depthMapUrl = await getDepthMapUrl(libraryImageUrl, 12_000);
          if (depthMapUrl) {
            console.log("[generate-image/depth] Depth map obtido — aplicando efeito 3D");
            const composedRes = await fetch(composed_url);
            const composedBuf = Buffer.from(await composedRes.arrayBuffer());
            const depthBuf    = await applyDepthEffect(composedBuf, libraryImageUrl, depthMapUrl);
            const depthKey    = `posts/${post_id}/composed_depth.jpg`;
            composed_url      = await uploadToR2(depthKey, depthBuf, "image/jpeg");
            console.log("[generate-image/depth] Efeito 3D aplicado e enviado ao R2");
          } else {
            console.log("[generate-image/depth] Depth map não disponível — efeito 3D ignorado");
          }
        } catch (depthErr) {
          console.warn("[generate-image/depth] Efeito de profundidade falhou (non-fatal):", depthErr);
        }
      }

      await postDoc.ref.update({
        image_url:      libraryImageUrl,
        composed_url,
        image_provider: "library_direct",
        status:         "ready",
      });

      return NextResponse.json({
        image_url:    libraryImageUrl,
        composed_url,
        post_id,
        provider:     "library_direct",
      });
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FAL.ai — paths avançados
    // ═══════════════════════════════════════════════════════════════════════════

    // ── FAL PuLID: Character / Face Identity Lock ──────────────────────────────
    // ═══════════════════════════════════════════════════════════════════════════
    // Ideogram v3 — tipografia NATIVA (texto embutido na arte pela IA)
    // Não usa compositor — o texto já sai renderizado na imagem gerada.
    // ═══════════════════════════════════════════════════════════════════════════
    if (resolvedProvider === "ideogram_text" || resolvedProvider === "ideogram") {
      const headline = (post.visual_headline ?? post.headline ?? "") as string;
      const { prompt: ideogramPrompt, negative_prompt, style_type, magic_prompt_option } =
        buildIdeogramTextPrompt({
          client,
          headline,
          basePrompt,
          toneProfileName,   // ← passa tone_profile para tipografia correta
        });

      console.log(`[generate-image/ideogram] style_type=${style_type} magic=${magic_prompt_option} tone=${toneProfileName ?? "none"}`);

      const result = await generateWithIdeogramText({
        prompt:              ideogramPrompt,
        negative_prompt,
        style_type,
        magic_prompt_option,  // ← OFF por padrão — garante texto exato
        format:              post.format as "feed" | "stories" | "reels_cover",
        post_id,
      });

      if (result.done && result.image_url) {
        // ── Pós-Ideogram: compositor adiciona logo + handle sem tocar no texto ──
        // O Ideogram já renderizou o visual_headline como tipografia nativa.
        // O compositor só adiciona elementos de marca (logo, @handle, footer bar)
        // sem sobrepor nenhum texto — usa layer_stack com wash=none.
        let composed_url: string | undefined;
        try {
          const existingStack = post.layer_stack as LayerStack | undefined;
          const ideogramLayerStack: LayerStack = {
            background_analysis: existingStack?.background_analysis ?? {
              entropy_level:    0.3,
              subject_position: "center",
              depth_of_field:   "shallow",
              brightness_zones: { top: "neutral", bottom: "dark", left: "neutral", right: "neutral" },
              color_temperature: "neutral",
              safe_areas:       ["bottom-full"],
              dominant_colors:  [client.primary_color ?? "#000000"],
            },
            tone_profile: existingStack?.tone_profile
              ?? { name: "editorial_clean", typography: { weight: "bold", spacing: "wide", case_style: "titlecase" }, color_behavior: { contrast: "medium", saturation: "muted" }, composition: { density: "minimal", alignment: "left" }, wash_preference: "none" },
            wash:       { type: "none" },          // sem overlay — Ideogram já tem contraste
            text_zone:  { anchor: "bottom-full", width_percent: 0, height_percent: 0, padding: 0, safe_margin: false },
            headline:   { font_weight: "900", color: "transparent", case_style: "uppercase", max_chars_per_line: 0, estimated_lines: 1, contrast_ratio: "AA" },
            brand_elements: {
              logo_position:       (client.logo_url ? "bottom-right" : "none") as import("@/types").LogoPlacement,
              logo_size:           "small",
              logo_contrast_boost: false,
              footer_bar: { enabled: true, height_px: 72, style: "solid" as const, color: client.primary_color ?? "#000000" },
            },
          };

          composed_url = await composePost({
            imageUrl:        result.image_url,
            logoUrl:         client.logo_url,
            visualHeadline:  "",   // vazio — Ideogram já renderizou o texto
            instagramHandle: client.instagram_handle as string | undefined,
            clientName:      client.name,
            primaryColor:    client.primary_color,
            secondaryColor:  client.secondary_color,
            format:          (post.format ?? "feed") as "feed" | "stories" | "reels_cover",
            postId:          post_id,
            layer_stack:     ideogramLayerStack,
          });
        } catch (composeErr) {
          console.warn("[generate-image/ideogram] Compositor pós-Ideogram falhou (non-fatal):", composeErr);
        }

        await postDoc.ref.update({
          image_url:      result.image_url,
          composed_url:   composed_url ?? result.image_url,
          image_provider: "ideogram_text",
          status:         "ready",
        });
        return NextResponse.json({
          image_url:    result.image_url,
          composed_url: composed_url ?? result.image_url,
          post_id,
          provider: "ideogram_text",
        });
      }

      // Assíncrono — frontend fará polling
      await postDoc.ref.update({ freepik_task_id: result.task_id, image_provider: "ideogram_text" });
      return NextResponse.json({ task_id: result.task_id, post_id, provider: "ideogram_text" });
    }

    // ── FAL PuLID: Character / Face Identity Lock ──────────────────────────────
    if (
      resolvedProvider === "fal_pulid" ||
      (isFalEnabled() && characterLockUrl)
    ) {
      if (!characterLockUrl) {
        return NextResponse.json(
          { error: "character_lock_url é obrigatório para fal_pulid" },
          { status: 400 }
        );
      }

      const compiledNeg = artDirection
        ? compilePromptForProvider("fal_pulid", artDirection, client).negative
        : undefined;

      const image_url = await generateWithCharacterLock({
        prompt:          basePrompt,
        reference_urls:  [characterLockUrl],
        format:          post.format as "feed" | "stories" | "reels_cover",
        post_id,
        id_weight:       id_weight   ?? 1.0,
        negative_prompt: compiledNeg,
      });

      await postDoc.ref.update({
        image_url,
        image_provider:     "fal_pulid",
        character_lock_url: characterLockUrl,
        status:             "ready",
      });

      return NextResponse.json({ image_url, post_id, provider: "fal_pulid" });
    }

    // ── FAL ControlNet Canny: Structure / Composition Lock ────────────────────
    if (
      resolvedProvider === "fal_canny" ||
      (isFalEnabled() && controlImageUrl && control_type === "canny")
    ) {
      if (!controlImageUrl) {
        return NextResponse.json(
          { error: "control_image_url é obrigatório para fal_canny" },
          { status: 400 }
        );
      }

      const image_url = await generateWithCanny({
        prompt:        basePrompt,
        control_image: controlImageUrl,
        format:        post.format as "feed" | "stories" | "reels_cover",
        post_id,
        strength:      control_strength ?? 0.7,
      });

      await postDoc.ref.update({
        image_url,
        image_provider:   "fal_canny",
        control_image_url: controlImageUrl,
        control_type:     "canny",
        status:           "ready",
      });

      return NextResponse.json({ image_url, post_id, provider: "fal_canny" });
    }

    // ── FAL ControlNet Depth: Volume / Perspective Lock ───────────────────────
    if (
      resolvedProvider === "fal_depth" ||
      (isFalEnabled() && controlImageUrl && control_type === "depth")
    ) {
      if (!controlImageUrl) {
        return NextResponse.json(
          { error: "control_image_url é obrigatório para fal_depth" },
          { status: 400 }
        );
      }

      const image_url = await generateWithDepth({
        prompt:        basePrompt,
        control_image: controlImageUrl,
        format:        post.format as "feed" | "stories" | "reels_cover",
        post_id,
        strength:      control_strength ?? 0.7,
      });

      await postDoc.ref.update({
        image_url,
        image_provider:    "fal_depth",
        control_image_url: controlImageUrl,
        control_type:      "depth",
        status:            "ready",
      });

      return NextResponse.json({ image_url, post_id, provider: "fal_depth" });
    }

    // ── FAL padrão txt2img ────────────────────────────────────────────────────
    if (resolvedProvider === "fal" || isFalEnabled()) {
      const image_url = await generateImageFal({
        prompt:  basePrompt,
        format:  post.format as "feed" | "stories" | "reels_cover",
        post_id,
        model:   resolveFalModel(),
      });

      await postDoc.ref.update({
        image_url,
        image_provider: "fal",
        status:         "ready",
      });

      return NextResponse.json({ image_url, post_id, provider: "fal" });
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Google Imagen 4 (síncrono)
    // ═══════════════════════════════════════════════════════════════════════════

    if (resolvedProvider === "imagen4" || isImagen4Enabled()) {
      const image_url = await imagenGenerate({
        prompt:  basePrompt,
        format:  post.format as "feed" | "stories" | "reels_cover",
        post_id,
        model:   resolveImagenModel(),
      });

      await postDoc.ref.update({
        image_url,
        image_provider: "imagen4",
        status:         "ready",
      });

      return NextResponse.json({ image_url, post_id, provider: "imagen4" });
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Replicate — hub de modelos externos (Imagen 4 grátis, Flux, Ideogram…)
    // ═══════════════════════════════════════════════════════════════════════════

    if (resolvedProvider === "replicate" || isReplicateEnabled()) {
      const model = replicate_model ?? "google/imagen-4";
      const result = await generateImageReplicate({
        prompt:  basePrompt,
        format:  post.format as "feed" | "stories" | "reels_cover",
        post_id,
        model,
      });

      if (result.done && result.image_url) {
        // Resposta síncrona — imagem já disponível, dispara compositor
        await postDoc.ref.update({
          image_url:      result.image_url,
          image_provider: "replicate",
          status:         "composing",
        });

        let composed_url: string | null = null;
        try {
          const dna = await loadDnaSources(post as GeneratedPost & { reference_dna?: ReferenceDNA });
          const ad  = resolveArtDirection(post, dna.refDna, dna.brandDna);

          composed_url = await composePost({
            imageUrl:         result.image_url,
            logoUrl:          client.logo_url,
            visualHeadline:   (post.visual_headline ?? post.headline ?? client.name) as string,
            instagramHandle:  client.instagram_handle as string | undefined,
            clientName:       client.name,
            primaryColor:     client.primary_color,
            secondaryColor:   client.secondary_color,
            format:           (post.format ?? "feed") as "feed" | "stories" | "reels_cover",
            postId:           post_id,
            ...toComposeOverrides(ad),
          });
          await postDoc.ref.update({ composed_url, status: "ready" });
        } catch (composeErr) {
          console.error("[generate-image/replicate] Compositor error (non-fatal):", composeErr);
          await postDoc.ref.update({ status: "ready" });
        }

        return NextResponse.json({
          image_url:    result.image_url,
          composed_url,
          post_id,
          provider:     "replicate",
        });
      }

      // Ainda processando — frontend fará polling em check-image
      await postDoc.ref.update({
        freepik_task_id: result.task_id,
        image_provider:  "replicate",
      });

      return NextResponse.json({ task_id: result.task_id, post_id, provider: "replicate" });
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Freepik — paths assíncronos (frontend faz polling em check-image)
    // ═══════════════════════════════════════════════════════════════════════════

    // ── Seedream V5 Lite (txt2img assíncrono) ─────────────────────────────────
    if (resolvedProvider === "seedream") {
      const aspect      = freepikAspect(post.format as string, "seedream");
      const { task_id } = await createSeedreamTask({
        prompt:       basePrompt,
        aspect_ratio: aspect,
      });

      await postDoc.ref.update({
        freepik_task_id: task_id,
        image_provider:  "seedream",
      });

      return NextResponse.json({ task_id, post_id, provider: "seedream" });
    }

    // ── Freepik Mystic 2 (assíncrono) ────────────────────────────────────────
    if (resolvedProvider === "mystic2") {
      const primaryColor2 = client.primary_color ?? "#6d28d9";
      const aspect2       = freepikAspect(post.format as string, "mystic");

      const { task_id } = await createMystic2Task({
        prompt:       basePrompt,
        aspect_ratio: aspect2,
        realism:      true,
        styling:      { colors: [{ color: primaryColor2, weight: 0.5 }] },
      });

      await postDoc.ref.update({
        freepik_task_id: task_id,
        image_provider:  "mystic2",
      });

      return NextResponse.json({ task_id, post_id, provider: "mystic2" });
    }

    // ── Freepik Mystic (default, assíncrono) ──────────────────────────────────
    const primaryColor = client.primary_color ?? "#6d28d9";
    const aspect       = freepikAspect(post.format as string, "mystic");

    const { task_id } = await createTask({
      prompt:       basePrompt,
      aspect_ratio: aspect,
      realism:      true,
      styling:      { colors: [{ color: primaryColor, weight: 0.5 }] },
    });

    await postDoc.ref.update({
      freepik_task_id: task_id,
      image_provider:  "freepik",
    });

    return NextResponse.json({ task_id, post_id, provider: "freepik" });

  } catch (err: unknown) {
    if (
      err instanceof FreepikAuthError ||
      err instanceof ImagenError      ||
      err instanceof FalError
    ) {
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
    const message = err instanceof Error ? err.message : "Erro interno";
    console.error("[POST /api/posts/generate-image]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
