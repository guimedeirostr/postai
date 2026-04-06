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
  format:               "feed" | "stories" | "reels_cover";
  description:          string;
  color_mood:           string;
  composition_zone:     "left" | "right" | "bottom" | "top" | "center";
  source_url?:          string;   // original Instagram URL
  image_url?:           string;   // og:image URL at import time
  created_at:           Timestamp;
}

export interface StrategyContext {
  pilar?: string;
  publico_especifico?: string;
  dor_desejo?: string;
  hook_type?: string;
}

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
   *   seedream_edit  → Freepik Seedream Edit img2img (async polling)
   *   imagen4        → Google Imagen 4 (sync)
   */
  image_provider?: "freepik" | "seedream" | "seedream_edit" | "imagen4" | "fal" | "fal_pulid" | "fal_canny" | "fal_depth";
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
  format:               "feed" | "stories" | "reels_cover";
  visual_headline_style: string;
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
