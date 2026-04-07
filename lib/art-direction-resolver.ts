/**
 * lib/art-direction-resolver.ts
 *
 * Resolve a "direção de arte efetiva" de um post combinando, em ordem de
 * prioridade decrescente:
 *
 *   1. post.art_direction       (Art Director Agent — JSON estruturado)
 *   2. reference_dna            (Stage 0 — DNA extraído da arte de referência)
 *   3. brand_dna                (Síntese de N posts da marca)
 *   4. defaults                 (zone "bottom", sem treatment)
 *
 * Centraliza a cascade que antes vivia inline em 4 rotas (generate, generate-image,
 * compose, check-image), evitando drift e simplificando a adição de novos campos.
 *
 * Uso típico:
 *
 *   const { refDna, brandDna } = await loadDnaSources(post_id, client_id);
 *   const ad = resolveArtDirection(post, refDna, brandDna);
 *   await composePost({ ...baseOpts, ...toComposeOptions(ad) });
 */

import { adminDb } from "@/lib/firebase-admin";
import type {
  ArtDirection,
  BrandDNA,
  DesignExample,
  GeneratedPost,
  LayerStack,
  LogoPlacement,
  ReferenceDNA,
} from "@/types";

// ── Resolved shape ───────────────────────────────────────────────────────────

export type CompositionZone = "left" | "right" | "bottom" | "top" | "center";

/**
 * Direção de arte efetiva — tudo o que o compositor (e a geração de imagem)
 * precisam saber para reproduzir o DNA visual desejado.
 */
export interface ResolvedArtDirection {
  /** Zona principal de texto na imagem */
  compositionZone:     CompositionZone;
  /** Tratamento de fundo atrás do texto (texto livre do DNA) */
  backgroundTreatment?: string;
  /** Estilo do headline para o resolver tipográfico do compositor */
  headlineStyle?:       string;
  /** Padrão tipográfico sintetizado da marca (fallback do anterior) */
  typographyPattern?:   string;
  /** Visual prompt final (para image gen) — já compilado pelo Art Director quando disponível */
  visualPrompt?:        string;
  /** Layout prompt final para img2img refine */
  layoutPrompt?:        string;
  /** Mood de cores dominante */
  colorMood?:           string;
  /** Negative prompt */
  negativePrompt?:      string;
  /** Placement do logo resolvido via cascade DNA */
  logoPlacement?:       LogoPlacement;
  /** LayerStack gerado pelo Art Direction Engine (quando disponível no post) */
  layer_stack?:         LayerStack;
}

// ── Loader ───────────────────────────────────────────────────────────────────

export interface DnaSources {
  refDna?:   ReferenceDNA;
  brandDna?: BrandDNA;
}

/**
 * Carrega ReferenceDNA do post + BrandDNA do cliente em paralelo.
 *
 * Cascade de fallback:
 *   1. post.reference_dna          — DNA inline no post (Stage 0 selecionou uma referência)
 *   2. design_examples mais recente — DNA extraído pelo usuário via biblioteca de referências
 *   3. brand_dna/current           — DNA sintetizado de N posts da marca
 */
export async function loadDnaSources(
  post: GeneratedPost & { reference_dna?: ReferenceDNA },
): Promise<DnaSources> {
  // ── 1. DNA inline no post (prioridade máxima) ─────────────────────────────
  const refDna = post.reference_dna;
  if (refDna) {
    return { refDna, brandDna: undefined };
  }

  // ── 2. design_examples da biblioteca (mais recente com campos ricos) ──────
  try {
    const exSnap = await adminDb
      .collection("clients").doc(post.client_id)
      .collection("design_examples")
      .where("intent", "==", "library")
      .orderBy("created_at", "desc")
      .limit(5)
      .get();

    for (const doc of exSnap.docs) {
      const ex = doc.data() as DesignExample;
      // Usa somente se tiver os campos ricos extraídos pelo ReferenceDNA prompt
      if (ex.background_treatment && ex.text_zones && ex.typography_hierarchy) {
        const converted: ReferenceDNA = {
          composition_zone:    ex.composition_zone ?? "bottom",
          text_zones:          ex.text_zones,
          background_treatment: ex.background_treatment,
          headline_style:      ex.headline_style ?? ex.visual_headline_style,
          typography_hierarchy: ex.typography_hierarchy,
          visual_prompt:       ex.visual_prompt,
          layout_prompt:       ex.layout_prompt,
          color_mood:          ex.color_mood,
          description:         ex.description,
          pilar:               ex.pilar,
          format:              ex.format,
          visual_headline_style: ex.visual_headline_style,
          ...(ex.logo_placement ? { logo_placement: ex.logo_placement } : {}),
        };
        return { refDna: converted, brandDna: undefined };
      }
    }
  } catch {
    /* non-fatal */
  }

  // ── 3. BrandDNA sintetizado (fallback final) ──────────────────────────────
  let brandDna: BrandDNA | undefined;
  try {
    const dnaSnap = await adminDb
      .collection("clients").doc(post.client_id)
      .collection("brand_dna").doc("current")
      .get();
    if (dnaSnap.exists) brandDna = dnaSnap.data() as BrandDNA;
  } catch {
    /* non-fatal */
  }

  return { refDna: undefined, brandDna };
}

// ── Cascade resolver ─────────────────────────────────────────────────────────

/**
 * Combina art_direction (do post), reference_dna e brand_dna em um único
 * objeto pronto para consumo pelo compositor / image gen.
 *
 * A cascata é per-field — cada campo cai pro próximo nível só se o atual
 * estiver vazio. Isso permite, por exemplo, que art_direction defina apenas
 * a zona enquanto o tratamento vem do reference_dna.
 */
export function resolveArtDirection(
  post: Partial<GeneratedPost> & { art_direction?: ArtDirection },
  refDna?: ReferenceDNA,
  brandDna?: BrandDNA,
): ResolvedArtDirection {
  const ad = post.art_direction;

  return {
    compositionZone:
      (refDna?.composition_zone
        ?? brandDna?.dominant_composition_zone
        ?? "bottom") as CompositionZone,

    backgroundTreatment:
      ad?.background
      ?? refDna?.background_treatment
      ?? brandDna?.background_treatment,

    headlineStyle:
      refDna?.visual_headline_style
      ?? ad?.typography,

    typographyPattern:
      brandDna?.typography_pattern,

    visualPrompt:
      ad?.final_visual_prompt
      ?? refDna?.visual_prompt
      ?? brandDna?.visual_prompt_template,

    layoutPrompt:
      ad?.final_layout_prompt
      ?? refDna?.layout_prompt
      ?? brandDna?.layout_prompt_template,

    colorMood:
      refDna?.color_mood
      ?? ad?.colors
      ?? brandDna?.color_treatment,

    negativePrompt: ad?.negative_prompt,

    logoPlacement:
      ad?.logo_placement
      ?? refDna?.logo_placement
      ?? brandDna?.dominant_logo_placement,

    layer_stack: (post as Record<string, unknown>).layer_stack as import("@/types").LayerStack | undefined,
  };
}

// ── Adapter para ComposeOptions ──────────────────────────────────────────────

/**
 * Extrai apenas os campos relevantes para composePost(), prontos para
 * spread no objeto de opções.
 */
export function toComposeOverrides(ad: ResolvedArtDirection) {
  return {
    compositionZone:     ad.compositionZone,
    backgroundTreatment: ad.backgroundTreatment,
    headlineStyle:       ad.headlineStyle,
    typographyPattern:   ad.typographyPattern,
    logoPlacement:       ad.logoPlacement,
    colorMood:           ad.colorMood,
    layer_stack:         ad.layer_stack,
  };
}
