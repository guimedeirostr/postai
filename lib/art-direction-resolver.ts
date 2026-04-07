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
  GeneratedPost,
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
}

// ── Loader ───────────────────────────────────────────────────────────────────

export interface DnaSources {
  refDna?:   ReferenceDNA;
  brandDna?: BrandDNA;
}

/**
 * Carrega ReferenceDNA do post + BrandDNA do cliente em paralelo.
 * BrandDNA só é buscado se o post não tiver reference_dna (fallback).
 */
export async function loadDnaSources(
  post: GeneratedPost & { reference_dna?: ReferenceDNA },
): Promise<DnaSources> {
  const refDna = post.reference_dna;

  if (refDna) {
    return { refDna, brandDna: undefined };
  }

  let brandDna: BrandDNA | undefined;
  try {
    const dnaSnap = await adminDb
      .collection("clients").doc(post.client_id)
      .collection("brand_dna").doc("current")
      .get();
    if (dnaSnap.exists) brandDna = dnaSnap.data() as BrandDNA;
  } catch {
    /* non-fatal — segue sem brand DNA */
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
  };
}
