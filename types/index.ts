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
  image_provider?: "freepik" | "imagen4" | "fal"; // which provider generated image_url
  freepik_task_id?: string;
  image_url: string | null;
  composed_url?: string | null;            // final branded post (compositor output)
  layout_prompt?: string;          // AI-generated composition description for img2img
  composition_zone?: "left" | "right" | "bottom" | "top" | "center"; // safe text area
  status: "pending" | "strategy" | "copy" | "art_direction" | "generating" | "composing" | "ready" | "approved" | "rejected" | "failed";
  created_at: Timestamp;
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
  dna_reference_url?:  string | null;
  status:              "pending" | "generating_hook" | "composing" | "ready" | "failed";
  created_at:          Timestamp;
  updated_at?:         Timestamp;
}
