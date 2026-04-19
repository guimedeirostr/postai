// lib/data/recipes.ts
// 6 receitas iniciais do PostAI V3 — seeds para a coleção global `recipes`.

import type { Recipe } from "@/types";

export const RECIPES: Recipe[] = [
  {
    id:          "educational-carousel-7",
    name:        "Carrossel Educativo 7 Slides",
    format:      "carousel",
    slidesCount: 7,
    description: "Framework passo-a-passo que educa e converte. Ideal para autoridade de nicho.",
    slotDefaults: {
      FORMATO:          "vertical Instagram carousel 4:5 ratio",
      ESTETICA_MAE:     "clean editorial educational, professional, trustworthy",
      COMPOSICAO:       "bold headline top-left, body text center, progress indicator top-right, subtle gradient overlay at base",
      HIERARQUIA_TIPO:  "large sans-serif headline in uppercase bold, smaller body text in regular weight",
      ACABAMENTO:       "modern educational campaign, high readability, premium feel",
    },
    slotHints: {
      ATMOSFERA:        "knowledge authority, approachable expertise",
      PALETA:           "derive from BrandKit keeping high contrast for text readability",
      ELEMENTOS_GRAFICOS: "numbered step indicator, thin accent line under headline",
    },
  },
  {
    id:          "product-launch",
    name:        "Lançamento de Produto",
    format:      "feed",
    slidesCount: 1,
    description: "Feed + Stories para lançamento. Urgência, benefício e CTA claro.",
    slotDefaults: {
      FORMATO:          "square Instagram feed post 1:1 ratio",
      ESTETICA_MAE:     "product launch campaign, bold, contemporary, desire-driven",
      COMPOSICAO:       "product hero center-frame, brand color background, price or benefit badge top corner",
      HIERARQUIA_TIPO:  "bold display font in uppercase, benefit in headline, CTA in contrasting color",
      ACABAMENTO:       "launch campaign energy, immediate desire, premium product photography feel",
    },
    slotHints: {
      ATMOSFERA:        "excitement, exclusivity, urgency",
      ELEMENTOS_GRAFICOS: "launch badge or tag, accent shape behind product",
    },
  },
  {
    id:          "social-proof",
    name:        "Prova Social",
    format:      "carousel",
    slidesCount: 5,
    description: "Depoimentos e resultados em carrossel editorial. Credibilidade máxima.",
    slotDefaults: {
      FORMATO:          "vertical Instagram carousel 4:5 ratio",
      ESTETICA_MAE:     "testimonial editorial, documentary photography style, authentic and warm",
      COMPOSICAO:       "client photo or result image full-bleed, quote overlay with subtle dark gradient, client name and title at bottom",
      HIERARQUIA_TIPO:  "large italic quote in serif or display font, name in small caps below",
      ACABAMENTO:       "authentic social proof, emotional resonance, before-after credibility",
    },
    slotHints: {
      ATMOSFERA:        "trust, transformation, community belonging",
      ELEMENTOS_GRAFICOS: "quotation mark accent, subtle brand color strip at side",
    },
  },
  {
    id:          "medical-editorial-carousel",
    name:        "Campanha Médica Premium (estilo IAGen)",
    format:      "carousel",
    slidesCount: 6,
    description: "Estética médica editorial de alto padrão. Autoridade clínica com beleza visual.",
    slotDefaults: {
      FORMATO:          "arte vertical para Instagram no formato 4:5",
      ESTETICA_MAE:     "estética médica premium, sofisticada, clean e editorial, fotografia de alta qualidade",
      COMPOSICAO:       "overlay escuro suave em degradê na base esquerda para dar contraste ao texto, imagem principal no lado direito ou topo, espaço negativo estratégico",
      HIERARQUIA_TIPO:  "tipografia sans-serif grande, caixa alta, bold em branco ou cor da marca, corpo em peso regular",
      ACABAMENTO:       "campanha médica contemporânea, forte apelo visual e credibilidade científica, iluminação profissional de studio",
    },
    slotHints: {
      PALETA:           "derivar do BrandKit.palette mantendo contraste editorial — fundo escuro ou neutro premium",
      ATMOSFERA:        "autoridade clínica, elegância, cuidado integral, confiança",
      ELEMENTOS_GRAFICOS: "linha fina horizontal como separador, ícone médico sutil, badge de credencial",
    },
  },
  {
    id:          "reels-storyboard-9",
    name:        "Reels Storyboard 9 Frames",
    format:      "reels-cover",
    slidesCount: 9,
    description: "Sequência visual para Reels. Cada frame é uma cena distinta com ritmo cinematográfico.",
    slotDefaults: {
      FORMATO:          "vertical 9:16 Reels cover frame",
      ESTETICA_MAE:     "cinematic reels frame, dynamic, scroll-stopping visual energy",
      COMPOSICAO:       "rule-of-thirds framing, motion blur or action freeze, text overlay bottom third",
      HIERARQUIA_TIPO:  "bold condensed font for hook text, high contrast against background",
      ACABAMENTO:       "social-native cinematic quality, viral visual energy, mobile-first impact",
    },
    slotHints: {
      ATMOSFERA:        "energy, motion, immediacy",
      ELEMENTOS_GRAFICOS: "frame counter or scene indicator, motion lines or light trails",
    },
  },
  {
    id:          "stories-series-5",
    name:        "Stories em Série — 5 Frames",
    format:      "story",
    slidesCount: 5,
    description: "Sequência de stories que narra uma história completa. Cada frame puxa o próximo.",
    slotDefaults: {
      FORMATO:          "vertical Instagram Story 9:16 ratio",
      ESTETICA_MAE:     "story-native design, immersive, intimate, swipe-through narrative",
      COMPOSICAO:       "full-bleed background image, text centered with semi-transparent pill background, progress bar visual top",
      HIERARQUIA_TIPO:  "conversational text size, mid-weight, high legibility on any background",
      ACABAMENTO:       "native story feel, authentic and engaging, designed for completion rate",
    },
    slotHints: {
      ATMOSFERA:        "intimacy, curiosity, narrative tension",
      ELEMENTOS_GRAFICOS: "swipe-up arrow or tap indicator, story frame number",
    },
  },
];
