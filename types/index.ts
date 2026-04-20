import { Timestamp } from "firebase/firestore";

export type SocialNetwork = "instagram" | "linkedin";

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
  linkedin_handle?: string;
  social_networks?: SocialNetwork[];   // redes habilitadas para este cliente
  bio: string;
  created_at: Timestamp;
}

export interface StrategyBriefing {
  pilar: string;
  tema: string;
  objetivo: string;
  publico_especifico: string;
  dor_desejo: string;
  formato_sugerido: "feed" | "stories" | "reels_cover" | "linkedin_post" | "linkedin_article" | "linkedin_carousel";
  hook_type: string;
  rationale: string;
  /** Apenas no modo calendário (generate-calendar) — data sugerida de publicação */
  scheduled_date?: string;  // YYYY-MM-DD
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
  format: "feed" | "stories" | "reels_cover" | "linkedin_post" | "linkedin_article" | "linkedin_carousel";
  social_network?: SocialNetwork;
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
  /** Slides estruturados para linkedin_carousel (gerado pelo buildLinkedInCopyPrompt) */
  slides?: Array<{ headline: string; subheadline?: string | null; body?: string | null }>;
  /** URLs das imagens compostas dos slides (preenchido após generate-linkedin-images) */
  linkedin_slide_urls?: string[];
  status: "pending" | "strategy" | "copy" | "art_direction" | "generating" | "composing" | "ready" | "approved" | "rejected" | "failed";
  /** Motivo da falha, preenchido quando status === "failed" */
  failureReason?: string;
  /** Score de qualidade pós-geração (0–100) avaliado via Claude Vision */
  quality_score?: number;
  quality_notes?: string;
  /** Data agendada para publicação (gerado pelo Agente de Calendário) */
  scheduled_date?: string;  // YYYY-MM-DD
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

// ── MoodBoard ─────────────────────────────────────────────────────────────────
// Referências visuais externas por cliente. Diferente de design_examples
// (posts da própria marca), o MoodBoard é inspiração de estilo — Pinterest,
// Behance, fotos de referência. Alimenta o Art Director com contexto visual rico.

export interface MoodboardItem {
  id:                 string;
  agency_id:          string;
  client_id:          string;
  r2_key:             string;
  url:                string;
  filename:           string;
  // Análise Claude Vision
  style_notes:        string;   // estilo artístico, mood, paleta descrita
  composition_notes:  string;   // layout, zonas, espaço negativo
  color_palette:      string[]; // cores dominantes em hex
  inspiration_tags:   string[]; // ["minimal", "editorial", "warm", "bold"]
  applies_to_pillar:  string[]; // quais pilares este mood combina ["Produto", "Luxo"]
  created_at:         Timestamp;
}

// ── Copy DNA ──────────────────────────────────────────────────────────────────
// Padrões de escrita aprendidos dos posts APROVADOS de um cliente.
// Gerado automaticamente a cada aprovação. Alimenta o Copy Agent como lei.
// Armazenado em clients/{client_id}/copy_dna/current no Firestore.

export interface CopyDNA {
  client_id:             string;
  agency_id:             string;

  // Metadados de aprendizado
  approved_posts_count:  number;
  confidence_score:      number;  // 0–100

  // Padrões numéricos aprendidos
  avg_caption_length:    number;
  avg_emoji_density:     number;  // emojis por parágrafo
  dominant_frameworks:   string[]; // ["PASTOR", "AIDA"]
  dominant_hooks:        string[]; // ["Dor", "Número"]

  // Padrões qualitativos (escritos pelo Claude após análise do corpus)
  hook_patterns:         string;  // "Começa com dor direta, usa 'você' em 2ª pessoa"
  sentence_patterns:     string;  // "Frases curtas 10-15 palavras, quebra de linha a cada 2 frases"
  vocabulary_level:      "simple" | "technical" | "mixed";
  cta_patterns:          string;  // "Sempre termina com pergunta"
  emoji_style:           string;  // "Funcional apenas: ✅ ❌ → para estrutura"

  // Melhores hooks aprovados (até 3 primeiros 100 chars)
  top_hooks:             string[];

  updated_at: Timestamp;
  created_at: Timestamp;
}

// ── Trend Cache ───────────────────────────────────────────────────────────────
// Cache de tendências buscadas pelo cron job diário para cada cliente.
// Evita chamadas Tavily on-demand durante geração.

export interface TrendCache {
  client_id:   string;
  agency_id:   string;
  date:        string;  // YYYY-MM-DD
  segment:     string;
  social:      "instagram" | "linkedin";
  query:       string;
  summary:     string;
  snippets:    string[];
  created_at:  Timestamp;
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

// ═══════════════════════════════════════════════════════════════════════════════
// V3 — Canvas node-based (PostAI v3 / POSTAI_V3_ROADMAP.md)
// Armazenados em users/{uid}/clients/{cid}/...  (não toca a estrutura antiga)
// ═══════════════════════════════════════════════════════════════════════════════

// ── Assets ────────────────────────────────────────────────────────────────────
export type AssetKind = "reference" | "avatar" | "logo" | "product" | "generated";

export interface Asset {
  id: string;
  clientId: string;
  kind: AssetKind;
  url: string;
  storagePath: string;
  slug: string;                   // @img1, @avatar2 — único por cliente
  prompt?: string;
  model?: string;
  seed?: number;
  expiresAt?: Timestamp | null;
  createdAt: Timestamp;
}

export interface AssetEmbedding {
  assetId: string;
  embedding: number[];            // text-embedding-3-small = 1536 dims
  createdAt: Timestamp;
}

// ── Brand Kit ─────────────────────────────────────────────────────────────────
export interface BrandKit {
  tone: string;
  palette: { primary: string; secondary: string; accents: string[] };
  typography: { headline: string; body: string; weights: number[] };
  logoUrl?: string;
  voiceGuidelines?: string;
  dosAndDonts?: { dos: string[]; donts: string[] };
  updatedAt: Timestamp;
}

// ── Client Memory ─────────────────────────────────────────────────────────────
export interface RejectedPattern {
  pattern: string;
  reason: string;
  at: Timestamp;
}

export interface ClientMemory {
  toneExamples:     string[];
  rejectedPatterns: RejectedPattern[];
  personas:         { name: string; description: string }[];
  productCatalog:   { name: string; description: string }[];
  stats:            { approved: number; rejected: number; avgCriticScore: number };
  // Prompt Compiler ML
  slotWeights?:     Partial<Record<PromptSlotKey, SlotWeightEntry>>;
  customModels?:    { promptWriter?: string };
  updatedAt:        Timestamp;
}

// ── Plan ──────────────────────────────────────────────────────────────────────
export interface SlideBriefing {
  n: number;
  intencao: string;
  visual: string;
  copy: string;
}

export interface PlanoDePost {
  bigIdea: string;
  publico: string;
  tomVoz: string[];
  estrutura: string;
  referenciasDecididas: string[];
  estiloVisual: string;
  paletaAplicada: string[];
  slidesBriefing: SlideBriefing[];
}

// ── Flow (Canvas React Flow) ──────────────────────────────────────────────────
export type NodeKind =
  | "briefing" | "clientMemory" | "plan"
  | "reference" | "avatar"
  | "prompt" | "copy" | "textOverlay"
  | "carousel" | "output" | "critic"
  | "list" | "organize";

export interface FlowNode {
  id: string;
  type: NodeKind;
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  animated?: boolean;
}

export interface Flow {
  id: string;
  clientId: string;
  title: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  updatedAt: Timestamp;
}

// ── Post V3 & Slide ───────────────────────────────────────────────────────────
export type PostV3Status =
  | "draft" | "planning" | "directing" | "executing"
  | "review" | "approved" | "failed";

export interface PostV3 {
  id: string;
  clientId: string;
  ownerUid?: string;
  flowId?: string;
  title: string;
  status: PostV3Status;
  failureReason?: string;
  failurePhase?: "planning" | "copy" | "direction" | "image" | "compose" | "unknown";
  failedAt?: Timestamp;
  coverUrl?: string;
  plan?: PlanoDePost;
  format: "feed" | "carousel" | "reels-cover" | "story";
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface SlideV3 {
  id: string;
  postId: string;
  order: number;
  assetId?: string;
  assetUrl?: string;
  copy?: string;
  prompt?: string;
  criticScore?: number;
  criticNotes?: string;
}

// ── Generation Jobs ───────────────────────────────────────────────────────────
export type JobStatus = "queued" | "running" | "succeeded" | "failed";

export interface GenerationJob {
  id: string;
  clientId: string;
  flowId?: string;
  nodeId: string;
  model: string;
  prompt: string;
  refs: string[];
  status: JobStatus;
  costCredits: number;
  output?: { assetId: string; url: string };
  error?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  attempts: number;
}

// ── PROMPT COMPILER V3 ────────────────────────────────────────────────────────

export type PromptSlotKey =
  | "FORMATO" | "ESTETICA_MAE" | "REF_ESTILO" | "IMAGEM_PRINCIPAL"
  | "ATMOSFERA" | "COMPOSICAO" | "PALETA" | "HIERARQUIA_TIPO"
  | "TEXTO_LITERAL" | "ELEMENTOS_GRAFICOS" | "ACABAMENTO";

export const PROMPT_SLOT_ORDER: PromptSlotKey[] = [
  "FORMATO", "ESTETICA_MAE", "REF_ESTILO", "IMAGEM_PRINCIPAL",
  "ATMOSFERA", "COMPOSICAO", "PALETA", "HIERARQUIA_TIPO",
  "TEXTO_LITERAL", "ELEMENTOS_GRAFICOS", "ACABAMENTO",
];

export interface LegacyPromptSlot {
  key: PromptSlotKey;
  required: boolean;
  value: string;
  confidence?: number;
  source: "brandkit" | "plan" | "recipe" | "ml" | "user";
}

export interface CompiledPromptV3 {
  postId: string;
  slideId: string;
  slots: LegacyPromptSlot[];
  finalText: string;
  modelTarget: "flux-1.1-pro" | "ideogram-3" | "nano-banana";
  refsResolved: { slug: string; url: string }[];
  version: number;
  compiledAt: Timestamp;
}

export interface PromptOutcome {
  id: string;
  compiledPromptId: string;
  clientId: string;
  slideId: string;
  slotsSnapshot: LegacyPromptSlot[];
  criticScore: number;
  humanDecision: "approved" | "rejected" | "regenerated";
  humanReason?: string;
  brandFitScore?: number;
  toneFitScore?: number;
  at: Timestamp;
  // V3 phase-granular ML fields
  phaseId?: PhaseId;
  runId?: string;
  phaseRunId?: string;
  slotsUsed?: Record<string, string>;
  approved?: boolean;
  editedByUser?: boolean;
  regenerationCount?: number;
  timeToApproveMs?: number;
  outputPreview?: string;
  createdAt?: number;
}

export interface SlotWeightEntry {
  approvals:  number;
  rejections: number;
  total:      number;
}

// ── Client Context (hidrataçao completa para o Canvas V3) ────────────────────
export interface ClientContextPost {
  id: string;
  coverUrl: string;
  copy: string;
}

export interface ClientContext {
  clientId: string;
  clientName: string;
  brandKit?: BrandKit;
  clientMemory?: ClientMemory;
  dnaVisual?: BrandDNA;
  recentApprovedPosts?: ClientContextPost[];
  loadedAt?: number;
}

export interface ClientPickerOption {
  id: string;
  name: string;
  initials: string;
  hasDnaVisual: boolean;
  dnaConfidence?: number;
  lastUsedAt: number;
  postCount: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// V3 — Canvas Execution Modes (POSTAI_V3_EXECUTION_MODES.md)
// ═══════════════════════════════════════════════════════════════════════════════

export type PhaseId =
  | 'briefing'
  | 'plano'
  | 'compilacao'
  | 'prompt'
  | 'copy'
  | 'critico'
  | 'output'
  | 'memoria';

export type PhaseStatus =
  | 'idle'      // nunca rodou neste canvas
  | 'queued'    // está na fila de um run-all
  | 'running'   // em execução
  | 'done'      // rodou e está fresco
  | 'stale'     // rodou, mas um upstream mudou após isso
  | 'error'     // última execução falhou
  | 'skipped';  // usuário pulou em run-all

export interface PhaseRun {
  id: string;
  clientId: string;
  phaseId: PhaseId;
  status: PhaseStatus;
  inputHash: string;
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  errorMessage?: string;
  startedAt: number;
  finishedAt?: number;
  latencyMs?: number;
  modelUsed?: string;
  tokensIn?: number;
  tokensOut?: number;
  costUsd?: number;
  triggeredBy: 'step' | 'run-to-here' | 'run-all' | 'regenerate';
  approvedByUser?: boolean;
  editedByUser?: boolean;
  editDiff?: Record<string, unknown>;
}

export interface BriefingInput {
  clientId: string;
  objetivo: string;
  formato: string;
}

export interface CanvasRun {
  id: string;
  clientId: string;
  postId?: string;
  briefingSnapshot: BriefingInput;
  mode: 'step' | 'checkpoint' | 'run-all';
  checkpointAt?: PhaseId;
  startedAt: number;
  finishedAt?: number;
  finalStatus: 'draft' | 'approved' | 'rejected' | 'abandoned';
  totalCostUsd?: number;
  createdBy: string;
}

// ── Recipe (template de fluxo) ────────────────────────────────────────────────

export interface Recipe {
  id:           string;
  name:         string;
  format:       string;
  slidesCount:  number;
  slotDefaults: Partial<Record<PromptSlotKey, string>>;
  slotHints:    Partial<Record<PromptSlotKey, string>>;
  description?: string;
  thumbnail?:   string;
}

// ── Canvas V3 Format System ────────────────────────────────────────────────────

export type FormatKey =
  | 'ig_feed'
  | 'ig_carousel'
  | 'ig_stories'
  | 'ig_reels_cover'
  | 'li_post_square'
  | 'li_post_horizontal'
  | 'li_carousel_pdf'
  | 'li_article';

export interface FormatSpec {
  key: FormatKey;
  platform: 'instagram' | 'linkedin';
  label: string;
  aspectRatio: '1:1' | '4:5' | '9:16' | '1.91:1';
  maxSlides?: number;
  copyStyle: 'ig-casual' | 'ig-storytelling' | 'li-professional' | 'li-thought-leadership';
  ctaStyle: 'link-in-bio' | 'direct-link' | 'comment' | 'dm';
  charLimit?: number;
}

// ── Asset Library (Ciclo 2) ───────────────────────────────────────────────────
// Armazenado em users/{uid}/clients/{cid}/libraryAssets/{assetId}
// NÃO confundir com Asset (canvas V3 acima) que usa kind+@slug para prompt refs.

export type AssetRole =
  | 'logo'        // marca, monograma, assinatura
  | 'product'     // produto / prato / item-hero
  | 'person'      // rosto / talento / fundador
  | 'background'; // textura / cenário / fundo neutro

export type AssetSlug = string; // kebab-case, 3-40 chars: /^[a-z0-9]+(-[a-z0-9]+)*$/

export interface LibraryAsset {
  id: string;
  clientId: string;
  role: AssetRole;
  slug: AssetSlug;
  label: string;
  description?: string;
  storagePath: string;        // postai-assets/{cid}/{assetId}.{ext}
  downloadUrl: string;        // URL pública (após finalize)
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
  width?: number;
  height?: number;
  bytes: number;
  preferred: boolean;         // 1 preferido por role por cliente (regra server-side)
  active: boolean;            // false = soft-delete
  createdAt: number;
  updatedAt: number;
  createdBy: string;
}

export interface AssetCreateInput {
  role: AssetRole;
  slug: AssetSlug;
  label: string;
  description?: string;
  mimeType: LibraryAsset['mimeType'];
  bytes: number;
  width?: number;
  height?: number;
}

export interface AssetUpdateInput {
  role?: AssetRole;
  slug?: AssetSlug;
  label?: string;
  description?: string;
  preferred?: boolean;
  active?: boolean;
}

// ── Brand Lockset ─────────────────────────────────────────────────────────────
// Ciclo 1: CRUD de travas de marca. Armazenado em
// users/{uid}/clients/{cid}/brandLocksets/current

export type LockScope =
  | 'typography'
  | 'color'
  | 'composition'
  | 'signature'
  | 'cta'
  | 'tone'
  | 'forbidden';

/** Tipos de slide para aplicação seletiva de locks (diferente do SlideType do carrossel legado) */
export type LockSlideType =
  | 'single'
  | 'carousel_opener'
  | 'carousel_middle'
  | 'carousel_cta'
  | 'stories'
  | 'reels_cover';

export interface BrandLock {
  id: string;
  scope: LockScope;
  description: string;
  enforcement: 'hard' | 'soft';
  promptHint: string;
  appliesTo?: {
    formats?: FormatKey[];
    slideTypes?: LockSlideType[];
  };
  source: 'manual' | 'dna_visual' | 'user_approved_pattern';
  createdAt: number;
  updatedAt: number;
  createdBy: string;
  active?: boolean;
}

export interface BrandLockset {
  id: string;
  clientId: string;
  locks: BrandLock[];
  version: number;
  lastModifiedAt: number;
}

export interface LockSuggestion {
  lock: Omit<BrandLock, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'>;
  reason: string;
  source: 'dna_visual' | 'repeated_pattern';
  confidence: number;
}

export const FORMATS: Record<FormatKey, FormatSpec> = {
  ig_feed:            { key: 'ig_feed',            platform: 'instagram', label: 'Feed',            aspectRatio: '1:1',    copyStyle: 'ig-casual',           ctaStyle: 'link-in-bio',  charLimit: 2200 },
  ig_carousel:        { key: 'ig_carousel',        platform: 'instagram', label: 'Carrossel',       aspectRatio: '1:1',    maxSlides: 10, copyStyle: 'ig-storytelling', ctaStyle: 'link-in-bio',  charLimit: 2200 },
  ig_stories:         { key: 'ig_stories',         platform: 'instagram', label: 'Stories',         aspectRatio: '9:16',   copyStyle: 'ig-casual',           ctaStyle: 'dm' },
  ig_reels_cover:     { key: 'ig_reels_cover',     platform: 'instagram', label: 'Capa de Reels',   aspectRatio: '9:16',   copyStyle: 'ig-casual',           ctaStyle: 'link-in-bio' },
  li_post_square:     { key: 'li_post_square',     platform: 'linkedin',  label: 'Post Quadrado',   aspectRatio: '1:1',    copyStyle: 'li-professional',     ctaStyle: 'direct-link',  charLimit: 3000 },
  li_post_horizontal: { key: 'li_post_horizontal', platform: 'linkedin',  label: 'Post Horizontal', aspectRatio: '1.91:1', copyStyle: 'li-professional',     ctaStyle: 'direct-link',  charLimit: 3000 },
  li_carousel_pdf:    { key: 'li_carousel_pdf',    platform: 'linkedin',  label: 'Carrossel PDF',   aspectRatio: '4:5',    maxSlides: 12, copyStyle: 'li-thought-leadership', ctaStyle: 'comment', charLimit: 3000 },
  li_article:         { key: 'li_article',         platform: 'linkedin',  label: 'Artigo',          aspectRatio: '1.91:1', copyStyle: 'li-thought-leadership', ctaStyle: 'direct-link' },
};

// ═══════════════════════════════════════════════════════════════════════════════
// Ciclo 3 — Prompt Compiler
// Tipos canônicos do compilador de prompts estruturados.
// ═══════════════════════════════════════════════════════════════════════════════

export type SlotKey =
  | 'BRAND_IDENTITY'
  | 'TONE_AND_VOICE'
  | 'PALETA'
  | 'TIPOGRAFIA'
  | 'LOGO'
  | 'PRODUTO'
  | 'PESSOA'
  | 'FUNDO'
  | 'BRIEFING'
  | 'RESTRICOES_DURAS'
  | 'CONTEXTO_CARROSSEL';

export const SLOT_ORDER: SlotKey[] = [
  'BRAND_IDENTITY',
  'TONE_AND_VOICE',
  'PALETA',
  'TIPOGRAFIA',
  'LOGO',
  'PRODUTO',
  'PESSOA',
  'FUNDO',
  'BRIEFING',
  'RESTRICOES_DURAS',
  'CONTEXTO_CARROSSEL',
];

export type SlotSource =
  | { kind: 'dna'; field: string }
  | { kind: 'lock'; lockId: string; scope: string }
  | { kind: 'asset'; assetId: string; role: string; slug: string }
  | { kind: 'brief'; field: string }
  | { kind: 'carousel'; slideIndex: number };

export interface PromptSlot {
  key: SlotKey;
  rendered: string;
  sources: SlotSource[];
  skipped?: boolean;
  skipReason?: string;
}

export interface CompileInput {
  client: {
    id: string;
    name: string;
    handle?: string;
    segment?: string;
  };
  dna?: unknown;
  locks?: unknown;
  assets?: unknown;
  brief: {
    objective: string;
    format: 'feed' | 'story' | 'carousel' | 'reels' | 'linkedin_post';
    phase: 'briefing' | 'plano' | 'prompt' | 'copy' | 'critica' | 'output' | 'memoria';
    extra?: Record<string, unknown>;
  };
  carousel?: {
    slides: Array<{
      index: number;
      compiledSummary?: string;
    }>;
    currentSlide?: {
      index: number;
      role: string;
      totalSlides: number;
    };
  };
  options?: {
    includeSoftLocks?: boolean;
    maxSlotLength?: number;
    language?: 'pt-BR';
  };
}

export interface CompileTrace {
  clientId: string;
  phase: CompileInput['brief']['phase'];
  format: CompileInput['brief']['format'];
  totalChars: number;
  slotsRendered: number;
  slotsSkipped: number;
  locksApplied: { hard: number; soft: number };
  assetsApplied: { role: string; assetId: string; slug: string }[];
  ms: number;
}

export interface CompileWarning {
  code:
    | 'missing_dna'
    | 'no_hard_locks'
    | 'asset_role_empty'
    | 'slot_truncated'
    | 'brief_empty'
    | 'unknown_format'
    | 'no_product_asset'
    | 'no_lockset'
    | 'slides_count_high'
    | 'custom_sequence_unusual';
  slot?: SlotKey;
  message: string;
  detail?: Record<string, unknown>;
}

export interface CompileOutput {
  compiled: string;
  slots: PromptSlot[];
  trace: CompileTrace;
  warnings: CompileWarning[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// Ciclo 4 — Carousel Compiler
// ═══════════════════════════════════════════════════════════════════════════════

export type SlideRole = 'hook' | 'context' | 'development' | 'proof' | 'product' | 'cta';

export interface SlideStoryboard {
  mode: 'auto' | 'custom';
  sequence: SlideRole[];
}

export interface CarouselSlideCompile {
  index: number;
  role: SlideRole;
  compiled: string;
  slots: PromptSlot[];
  chars: number;
  slotsRendered: number;
}

export interface CarouselCompileMeta {
  slides_count: number;
  storyboard_mode: 'auto' | 'custom';
  locksApplied: { hard: number; soft: number };
  assetsApplied: { role: string; assetId: string; slug: string }[];
  totalChars: number;
  compiledAt: number;
}

export interface CarouselCompileOutput {
  slides: CarouselSlideCompile[];
  meta: CarouselCompileMeta;
  sharedBase: Partial<Record<SlotKey, PromptSlot>>;
  globalWarnings: CompileWarning[];
}
