import { Timestamp } from "firebase/firestore";

export interface Agency {
  id: string;
  name: string;
  email: string;
  photo_url: string | null;
  created_at: Timestamp;
}

export interface BrandProfile {
  id: string;
  agency_id: string;
  name: string;
  logo_url: string | null;
  logo_white_url?: string | null; // Versão negativa/branca da logo (para fundos escuros)
  primary_color: string;
  secondary_color: string;
  fonts: string[];
  tone_of_voice: string;
  segment: string;
  target_audience: string;
  keywords: string[];
  avoid_words: string[];
  instagram_handle: string;
  bio: string;
  created_at: Timestamp;
}

export interface StrategyBriefing {
  pilar: string;
  tema: string;
  objetivo: string;
  publico_especifico: string;
  dor_desejo: string;
  formato_sugerido: "feed" | "stories" | "reels_cover";
  hook_type: string;
  rationale: string;
}

export interface BrandPhoto {
  id: string;
  agency_id: string;
  client_id: string;
  r2_key: string;
  url: string;
  filename: string;
  category: "produto" | "equipe" | "bastidores" | "cliente" | "ambiente" | "outro";
  tags: string[];
  description: string;
  created_at: Timestamp;
}

export interface DesignExample {
  id:                   string;
  agency_id:            string;
  client_id:            string;
  visual_prompt:        string;
  layout_prompt:        string;
  visual_headline_style: string;
  pilar:                string;
  format:               "feed" | "stories" | "reels_cover" | "carousel";
  description:          string;
  color_mood:           string;
  composition_zone:     "left" | "right" | "bottom" | "top" | "center";
  source_url?:          string;   // original Instagram URL
  image_url?:           string;   // og:image URL ou URL direta da imagem
  created_at:           Timestamp;

  // ── Campos ricos (extraídos pelo prompt completo de Reference DNA) ────────
  // Opcionais para manter compatibilidade com docs antigos (shape DesignExample básico).
  // Quando presentes, este doc funciona como um ReferenceDNA completo e pode
  // alimentar Stage 0 diretamente.
  text_zones?:           string;
  background_treatment?: string;
  headline_style?:       string;
  typography_hierarchy?: string;
  logo_placement?:       LogoPlacement;
  /** HTML/CSS template gerado pelo Claude Vision para replicar o design profissional */
  html_template?:        string;
  /** Fonte principal identificada pelo Claude (nome Google Font, ex: "Cormorant Garamond") */
  headline_font?:        string;
  /** Estilo da fonte: "normal" | "italic" */
  headline_font_style?:  string;
  /** Peso da fonte: "300" | "400" | "700" | "900" */
  headline_font_weight?: string;
  /**
   * Origem deste exemplo:
   *   "library"         — adicionado manualmente via DNA modal (padrão)
   *   "stage0"          — capturado no fluxo Stage 0 de geração
   */
  intent?:               "library" | "stage0";
}

export interface StrategyContext {
  pilar?: string;
  publico_especifico?: string;
  dor_desejo?: string;
  hook_type?: string;
}

export type LogoPlacement =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right"
  | "bottom-center"
  | "none";

export interface ArtDirection {
  visual_style:        string;
  lighting:            string;
  composition:         string;
  colors:              string;
  background:          string;
  typography:          string;
  texture:             string;
  image_type:          "photography" | "illustration" | "3d_render" | "graphic_design";
  lens:                string;
  depth_of_field:      string;
  emotion:             string;
  negative_prompt:     string;
  final_visual_prompt: string;
  final_layout_prompt: string;
  /** Onde o logo da marca deve ficar no post final (quando aplicável) */
  logo_placement?:     LogoPlacement;
}

export interface GeneratedPost {
  id: string;
  agency_id: string;
  client_id: string;
  client_name: string;
  theme: string;
  objective: string;
  format: "feed" | "stories" | "reels_cover";
  visual_headline?: string;   // máx 6 palavras para overlay na imagem
  headline: string;
  caption: string;
  hashtags: string[];
  visual_prompt: string;
  art_direction?: ArtDirection; // structured output from Art Director Agent
  framework_used?: string;    // PAS | AIDA | PASTOR | PPPP
  hook_type?: string;         // Dor | Curiosidade | Pergunta | etc
  /**
   * Provider que gerou image_url.
   *   fal            → Flux Pro txt2img padrão
   *   fal_pulid      → Flux com PuLID (character/face lock)
   *   fal_canny      → Flux com ControlNet Canny (structure lock)
   *   fal_depth      → Flux com ControlNet Depth (volume/depth lock)
   *   freepik        → Freepik Mystic (async polling)
   *   seedream       → Freepik Seedream V5 Lite (async polling)
   *   seedream_edit  → Freepik Seedream Edit img2img (async polling) [DEPRECATED]
   *   imagen4        → Google Imagen 4 (sync)
   *   library_direct → Foto da biblioteca usada como background SEM geração de IA
   */
  image_provider?: "freepik" | "seedream" | "seedream_edit" | "imagen4" | "fal" | "fal_pulid" | "fal_canny" | "fal_depth" | "library_direct" | "replicate";
  freepik_task_id?: string;
  image_url: string | null;
  composed_url?: string | null;            // final branded post (compositor output)
  layout_prompt?: string;          // AI-generated composition description for img2img
  composition_zone?: "left" | "right" | "bottom" | "top" | "center"; // safe text area
  /** URL da foto de referência para character lock (PuLID) */
  character_lock_url?: string | null;
  /** URL da imagem de referência para ControlNet (Canny/Depth) */
  control_image_url?: string | null;
  /** Tipo de controle ControlNet utilizado */
  control_type?: "canny" | "depth" | null;
  status: "pending" | "strategy" | "copy" | "art_direction" | "generating" | "composing" | "ready" | "approved" | "rejected" | "failed";
  created_at: Timestamp;
}

// ── Brand DNA (sintetizado de N posts) ────────────────────────────────────────
// Gerado pelo agente de síntese após analisar múltiplos DesignExamples reais.
// Armazenado em clients/{client_id}/brand_dna/current no Firestore.
// O Art Director usa este DNA como lei primária em toda geração.

export interface BrandDNA {
  client_id:  string;
  agency_id:  string;

  // Aprendizado
  examples_count:   number;   // Quantos posts foram analisados
  confidence_score: number;   // 0–100: quão consistente é o padrão

  // Padrões visuais aprendidos
  dominant_composition_zone: "left" | "right" | "bottom" | "top" | "center";
  text_placement_pattern:    string;  // Como e onde o texto vive na imagem
  background_treatment:      string;  // O que existe atrás do texto (gradiente, faixa, nada)
  typography_pattern:        string;  // Peso, cor, caixa, hierarquia tipográfica
  photography_style:         string;  // Estilo fotográfico dominante
  color_treatment:           string;  // Como as cores são trabalhadas
  image_mood:                string;  // Mood visual que aparece consistentemente
  lighting_pattern:          string;  // Padrão de iluminação

  // Regras extraídas (o que a marca SEMPRE faz)
  design_rules: string[];

  // Placement do logo detectado consistentemente (quando aplicável)
  dominant_logo_placement?: LogoPlacement;

  // Templates prontos para injetar no Art Director
  visual_prompt_template: string;  // Prompt visual base desta marca (inglês)
  layout_prompt_template: string;  // Prompt de layout base desta marca (inglês)

  // Narrativa pt-BR da identidade visual da marca
  brand_visual_identity: string;

  updated_at: Timestamp;
  created_at: Timestamp;
}

// ── Reference DNA ─────────────────────────────────────────────────────────────
// Extraído via Claude Vision de uma arte de referência enviada pelo usuário.
// Alimenta o Art Director e o Compositor com o DNA visual exato da referência.

export interface ReferenceDNA {
  /** Zona principal onde o texto vive na imagem */
  composition_zone:     "left" | "right" | "bottom" | "top" | "center";
  /** Descrição precisa das zonas de texto: posição, tamanho relativo, sobreposição */
  text_zones:           string;
  /** Tratamento de fundo atrás do texto: "dark gradient", "solid band", "glassmorphism", "none" */
  background_treatment: string;
  /** Estilo do headline principal: peso, cor, caixa alta, tamanho relativo, posição */
  headline_style:       string;
  /** Hierarquia tipográfica completa: relação H1 > H2 > body, alinhamento */
  typography_hierarchy: string;
  /** Prompt visual em inglês (cena, sujeito, luz, câmera) — sem texto/gráficos */
  visual_prompt:        string;
  /** Composição do design em inglês para o Art Director */
  layout_prompt:        string;
  /** Mood de cores dominante */
  color_mood:           string;
  /** Descrição em pt-BR do que torna esta arte uma boa referência */
  description:          string;
  pilar:                string;
  format:               "feed" | "stories" | "reels_cover" | "carousel";
  visual_headline_style: string;
  /** Onde o logo da marca aparece nesta referência (extraído via Claude Vision) */
  logo_placement?:       LogoPlacement;
}

// ── Art Direction Engine types ────────────────────────────────────────────────
// BackgroundAnalysis: Claude extrai da cena/imagem de referência (percepção).
// ToneProfile:        Claude decide com base na personalidade da marca (criatividade).
// O motor TypeScript deriva LayerStack completo dessas duas entradas — sem depender
// de texto livre gerado pela IA para decisões mecânicas de composição.

/**
 * Ponto focal detectado via Google Cloud Vision API.
 * Todas as coordenadas são normalizadas (0.0–1.0).
 */
export interface FocalPoint {
  type:       "face" | "object";
  label:      string;           // "face" | nome do objeto (ex: "Person", "Cup")
  confidence: number;           // 0.0–1.0
  bounds: {
    x:      number;             // left normalizado
    y:      number;             // top normalizado
    width:  number;
    height: number;
  };
  center: {
    x: number;                  // centro horizontal normalizado
    y: number;                  // centro vertical normalizado
  };
}

export interface BackgroundAnalysis {
  /** 0.0–1.0: quão visualmente poluído/ocupado é o fundo (0 = liso; 1 = caótico) */
  entropy_level:    number;
  /** Onde o sujeito principal está posicionado no frame */
  subject_position: "left" | "center" | "right" | "top" | "bottom" | "full";
  /** Qualidade de profundidade de campo */
  depth_of_field:   "shallow" | "deep" | "mixed";
  /** Leitura de luminosidade por quadrante */
  brightness_zones: {
    top:    "light" | "dark" | "neutral";
    bottom: "light" | "dark" | "neutral";
    left:   "light" | "dark" | "neutral";
    right:  "light" | "dark" | "neutral";
  };
  /** Temperatura de cor dominante da cena */
  color_temperature: "warm" | "cool" | "neutral";
  /** Quadrantes seguros para texto (sem sujeito principal) */
  safe_areas: Array<"top-left" | "top-right" | "bottom-left" | "bottom-right" | "top-full" | "bottom-full">;
  /** Cores dominantes aproximadas da cena (hex) */
  dominant_colors: string[];
  /**
   * Faces e objetos detectados via Google Cloud Vision API.
   * Quando presente, tem prioridade sobre o proxy Sharp para subject_position e safe_areas.
   * Ausente quando Vision API não está configurada ou a imagem é gerada por IA (sem referência).
   */
  focal_points?: FocalPoint[];
}

export interface ToneProfile {
  name: "editorial_clean" | "bold_aggressive" | "minimal_luxury" | "warm_organic" | "vibrant_pop";
  typography: {
    weight:     "light" | "regular" | "bold" | "black";
    spacing:    "tight" | "normal" | "wide";
    case_style: "uppercase" | "titlecase" | "sentence";
  };
  color_behavior: {
    contrast:   "low" | "medium" | "high";
    saturation: "muted" | "natural" | "vibrant";
  };
  composition: {
    density:   "minimal" | "balanced" | "dense";
    alignment: "centered" | "left" | "asymmetric";
  };
  /** Derivado do entropy_level: > 0.6 → strong; 0.3–0.6 → soft; < 0.3 → none */
  wash_preference: "none" | "soft" | "strong";
}

export interface WashDecision {
  type: "none" | "gradient" | "solid_band" | "vignette" | "frosted_panel";
  /** gradient */
  direction?:      "bottom-up" | "top-down" | "left-right";
  from_opacity?:   number;
  to_opacity?:     number;
  color?:          string;
  /** solid_band */
  position?:       "bottom" | "top";
  height_percent?: number;
  opacity?:        number;
  /** vignette */
  intensity?:      "soft" | "strong";
  /** frosted_panel */
  side?:           "left" | "right";
  width_percent?:  number;
  blur?:           number;
}

export interface TextZone {
  anchor:         "top-left" | "top-right" | "bottom-left" | "bottom-right" | "bottom-full" | "top-full" | "center";
  width_percent:  number;
  height_percent: number;
  padding:        number;
  safe_margin:    boolean;
}

export interface HeadlineParams {
  font_weight:        "400" | "700" | "800" | "900";
  color:              string;
  case_style:         "uppercase" | "titlecase" | "sentence";
  max_chars_per_line: number;
  estimated_lines:    1 | 2 | 3;
  contrast_ratio:     "AA" | "AAA";
  accent_color?:      string;
}

export interface BrandElementsPlacement {
  logo_position:       LogoPlacement;
  logo_size:           "small" | "medium" | "large";
  logo_contrast_boost: boolean;
  footer_bar: {
    enabled:   boolean;
    style:     "solid" | "transparent" | "gradient";
    color:     string;
    height_px: number;
  };
}

export interface ArtDirectionValidation {
  readability_score: number;   // 0–1
  overlap_score:     number;   // 0–1
  brand_consistency: number;   // 0–1
  visual_balance:    number;   // 0–1
  passes:            boolean;
  warnings:          string[];
}

export interface LayerStack {
  background_analysis: BackgroundAnalysis;
  tone_profile:        ToneProfile;
  wash:                WashDecision;
  text_zone:           TextZone;
  headline:            HeadlineParams;
  brand_elements:      BrandElementsPlacement;
  validation?:         ArtDirectionValidation;
}

// ── Carousel types ────────────────────────────────────────────────────────────

export type SlideType = "hook" | "content" | "cta";
export type SlideBgStyle = "brand" | "dark" | "accent" | "light";

export interface CarouselSlide {
  index:             number;
  type:              SlideType;
  headline:          string;
  subheadline?:      string;
  body_text?:        string;
  cta_text?:         string;
  visual_prompt?:    string;     // English — only for hook slide (index 0)
  bg_style:          SlideBgStyle;
  icon_emoji?:       string;
  number_highlight?: string;
  composed_url?:     string | null;
}

export interface GeneratedCarousel {
  id:                  string;
  agency_id:           string;
  client_id:           string;
  client_name:         string;
  theme:               string;
  objective:           string;
  topic:               string;
  caption:             string;
  hashtags:            string[];
  slides:              CarouselSlide[];
  slide_count:         number;
  hook_task_id?:       string | null;
  hook_image_url?:     string | null;
  image_provider?:     string;
  is_panoramic?:       boolean;   // true = hook wide 16:9, slides 0+1 compartilham imagem
  dna_reference_url?:  string | null;
  status:              "pending" | "generating_hook" | "composing" | "ready" | "failed";
  created_at:          Timestamp;
  updated_at?:         Timestamp;
}
