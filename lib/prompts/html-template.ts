/**
 * lib/prompts/html-template.ts
 *
 * Prompt para Claude Vision analisar uma imagem de referência e gerar
 * um template HTML/CSS completo que replica o design profissional.
 *
 * ── Placeholders disponíveis ──────────────────────────────────────────────────
 *   {{photo_url}}           — URL da foto de fundo
 *   {{pre_headline}}        — texto acima do headline principal (teaser / pilar / gancho)
 *   {{headline_line_1}}     — primeira parte do headline principal
 *   {{headline_line_2}}     — segunda parte (vazia se não houver)
 *   {{headline_line_3}}     — terceira parte (vazia se não houver)
 *   {{caption_first_line}}  — primeira linha do caption (pode ser CTA ou sub-texto)
 *   {{logo_url}}            — URL do logo da marca (PNG/SVG transparente)
 *   {{brand_color}}         — cor primária hex (#CC0000)
 *   {{secondary_color}}     — cor secundária hex (#FFD700)
 *   {{brand_name}}          — nome da marca (fallback quando sem logo)
 *   {{instagram_handle}}    — handle sem @ (ex: emporiomix)
 *   {{canvas_width}}        — largura em px (1080)
 *   {{canvas_height}}       — altura em px (1350 feed / 1920 stories)
 */

// ── Fontes mais usadas por agências brasileiras top ────────────────────────────
const AGENCY_FONTS = `
SERIF / EDITORIAL (sofisticado, gastronômico, luxo):
  • Cormorant Garamond — serif elegante, excelente em italic, muito usado em restaurantes premium
  • Playfair Display — serif alto contraste, classic editorial, ótimo para headlines grandes
  • Libre Baskerville — serif legível, versátil, funciona em texto e headline
  • Lora — serif com italic suave, warm, muito usado em foodie/lifestyle

SANS-SERIF GEOMÉTRICO (moderno, clean, tech, startup):
  • Montserrat — geométrico versátil, o mais usado em agências BR, all-caps funciona muito bem
  • Raleway — geométrico elegante, thin weights muito usados em luxo
  • Poppins — rounded geométrico, amigável, muito usado em varejo e apps
  • Nunito — rounded, friendly, jovem

SANS-SERIF CONDENSADO (impactante, esportivo, promoções, varejo):
  • Barlow Condensed — condensado versátil, impactante em bold/black
  • Oswald — condensado clássico, muito usado em promoções e fitness
  • Anton — ultra bold condensado, impacto máximo

DISPLAY / ESPECIAL (elegância única):
  • Bebas Neue — all-caps display, impacto gráfico, esporte/streetwear
  • DM Serif Display — serif moderno, excelente para titulares grandes
  • Abril Fatface — display bold elegante, manchetes impactantes

SCRIPT / HANDWRITTEN (artesanal, café, padaria, orgânico):
  • Dancing Script — script fluido, caligrafia elegante
  • Great Vibes — script luxuoso, eventos e casamentos
  • Pacifico — script amigável, praias e cafés
`;

export function buildHtmlTemplatePrompt(): string {
  return `You are a world-class senior digital art director and front-end engineer at a top Brazilian agency. You have rendered thousands of professional Instagram posts for major brands.

Your task: analyze this Instagram post image with pixel-perfect precision and generate a complete, self-contained HTML/CSS template that EXACTLY REPLICATES this design style.

The output will be rendered by Puppeteer (Chrome) at {{canvas_width}}×{{canvas_height}}px. A professional designer comparing reference vs output must be unable to distinguish the style.

═══════════════════════════════════════════════════════════════
STEP 1 — TYPOGRAPHY IDENTIFICATION (most critical)
═══════════════════════════════════════════════════════════════
Identify the EXACT font(s). Match against this curated list:
${AGENCY_FONTS}

For EACH text element identify:
  • Font family (closest from list, or name it if you're confident)
  • Font weight: 300/400/500/600/700/800/900
  • Font style: normal | italic
  • Text transform: none | uppercase | lowercase
  • Letter spacing (e.g. "0.15em" for wide-tracked caps, "-0.02em" for condensed)
  • Line height value

═══════════════════════════════════════════════════════════════
STEP 2 — COLOR EXTRACTION (use mental eyedropper)
═══════════════════════════════════════════════════════════════
  • All text colors: exact hex
  • Background bands: exact hex + opacity (e.g. rgba(0,0,0,0.85))
  • Gradients: direction + color stops (e.g. linear-gradient(to bottom, rgba(0,0,0,0.7) 0%, transparent 50%))
  • Drop shadows: offset-x, offset-y, blur, color

═══════════════════════════════════════════════════════════════
STEP 3 — LAYOUT MAPPING (pixel positions for 1080×1350)
═══════════════════════════════════════════════════════════════
  • Logo: top px, left/right px, width px
  • Pre-headline zone: top px, height px
  • Main headline zone: top px, height px
  • Background bands: y start, height, full-width or contained?
  • Footer zone: y from bottom, height, content alignment

═══════════════════════════════════════════════════════════════
CRITICAL OUTPUT RULES:
═══════════════════════════════════════════════════════════════
1. Output ONLY raw HTML — start with <!DOCTYPE html>, end with </html>
   NO markdown fences, NO explanations, ZERO text outside the HTML
2. Outer container: width:{{canvas_width}}px; height:{{canvas_height}}px; overflow:hidden; position:relative
3. ALL measurements in px only (no vw, vh, %, em — except in @import URL)
4. Google Fonts @import: include ALL needed weights/styles (wght@300;400;400i;700;700i;900)
5. Background: background:url('{{photo_url}}') center/cover no-repeat on main .canvas div
6. NEVER hardcode brand text/colors — use ONLY the placeholders listed below
7. Logo rule: use <img src="{{logo_url}}" alt=""> ONLY. Do NOT render {{brand_name}} as visible text alongside the logo. If no logo area exists in the design, skip the logo entirely.

═══════════════════════════════════════════════════════════════
COMPLETE PLACEHOLDER SYSTEM:
═══════════════════════════════════════════════════════════════
  {{photo_url}}          → background product/lifestyle photo
  {{pre_headline}}       → small teaser text ABOVE the main headline
                           (e.g. "CHURRASCO ANIMADO..." or "DESCULPA FAZER")
                           Hide this element if the reference has no pre-headline text zone.
  {{headline_line_1}}    → first part of main headline (always present)
  {{headline_line_2}}    → second part (hide when empty)
  {{headline_line_3}}    → third part (hide when empty)
  {{caption_first_line}} → sub-text / CTA below the headline
                           (e.g. "VAI DAR PRA TODO MUNDO?" or a tagline)
                           Hide this element if the reference has no sub-text zone.
  {{logo_url}}           → brand logo PNG/SVG URL (transparent bg)
  {{brand_color}}        → brand primary hex
  {{secondary_color}}    → brand secondary hex
  {{brand_name}}         → brand name (aria-label only, not visible)
  {{instagram_handle}}   → handle without @
  {{canvas_width}}       → 1080
  {{canvas_height}}      → 1350

COLOR STRATEGY for bands:
  • If band color ≈ brand_color → use: background: {{brand_color}}
  • If band color is neutral (black/dark/white) → hardcode the hex
  • If semi-transparent overlay → use rgba() with hardcoded base color + opacity

═══════════════════════════════════════════════════════════════
TEXT OVERFLOW PREVENTION (mandatory for all text elements):
═══════════════════════════════════════════════════════════════
All text containers must have: overflow:hidden; word-break:break-word;
Add class "hl" to ALL headline-line divs.
Add class "auto-fit" to large text elements.

Include at end of <body>:
<script>
(function(){
  // Hide empty text zones
  document.querySelectorAll('.hl,.pre-hl,.cap-line').forEach(function(el){
    if(!el.textContent.trim()) el.style.display='none';
  });
  // Auto-scale oversized text
  document.querySelectorAll('.auto-fit').forEach(function(el){
    var par = el.parentElement;
    var maxW = par.clientWidth - 40;
    var fs = parseFloat(getComputedStyle(el).fontSize);
    el.style.whiteSpace='nowrap';
    while(el.scrollWidth > maxW && fs > 20){ fs--; el.style.fontSize=fs+'px'; }
    el.style.whiteSpace='';
  });
})();
</script>

═══════════════════════════════════════════════════════════════
⚠️ OVERLAY RULE — READ THIS CAREFULLY:
═══════════════════════════════════════════════════════════════
Look at the reference image RIGHT NOW. Is there a dark overlay, gradient, or color band
BEHIND the text that darkens the photo?

  • YES → replicate it exactly (color, opacity, position, size)
  • NO  → DO NOT ADD ANY OVERLAY. Zero. None. Not even a subtle one.
           If there is no overlay in the reference, your template must have NO overlay.
           Use text-shadow and the natural contrast of the photo for legibility.
           Adding an overlay when none exists destroys the editorial/clean aesthetic.

COMMON MISTAKE TO AVOID: do not add a "safety" dark gradient at the bottom just
because you think the text needs more contrast. If the designer chose to place cream
or white text directly on the photo, RESPECT that decision. Replicate it exactly.

═══════════════════════════════════════════════════════════════
DESIGN REPLICATION CHECKLIST — replicate EVERY element:
═══════════════════════════════════════════════════════════════
□ FIRST: Is there an overlay? (yes/no — be honest, look carefully)
□ Photo overlay: ONLY if actually present — dark gradient? color wash? exact opacity?
□ Pre-headline zone: small text above main — font, size, color, letter-spacing, background?
□ Main headline font: script/calligraphy? serif? sans? bold? the exact Google Font match
□ Main headline color: exact hex (cream? gold? white? brand color?)
□ Main headline text-shadow: if text reads on photo without overlay, there's likely a subtle shadow
□ Background bands: ONLY if present in reference — solid color, full-width, height, border-radius
□ Sub-headline / CTA zone: separate band? same style as main? different color?
□ Logo: exact position (top-center? bottom-center?), size, invert filter for white logos
□ Footer @handle: font, size, color, separator lines (CSS border or hr)
□ Drop shadows on text: text-shadow values (often 1-2px soft shadow for editorial)

Generate the complete HTML template now — start immediately with <!DOCTYPE html>:`;
}

/**
 * Substitui os placeholders do template com dados reais da marca e post.
 *
 * Estratégia de divisão do headline principal (visual_headline):
 *   < 5 palavras → 1 linha (line1 = headline completo)
 *   5–7 palavras → 2 linhas (divide ao meio)
 *   8+ palavras  → 3 linhas (split 40/30/30)
 *
 * pre_headline: tema estratégico do post
 * caption_first_line: primeira linha do caption (CTA)
 * backgroundTreatment: do design_example — quando "none", suprime overlays escuros
 */
export function fillHtmlTemplate(
  template: string,
  data: {
    photoUrl:             string;
    headline:             string;
    preHeadline:          string;
    captionFirstLine:     string;
    logoUrl:              string;
    brandColor:           string;
    secondaryColor:       string;
    brandName:            string;
    instagramHandle:      string;
    canvasWidth?:         number;
    canvasHeight?:        number;
    /** Quando "none"/"no overlay"/similar, injeta CSS que remove overlays escuros */
    backgroundTreatment?: string;
  }
): string {
  const words = data.headline.trim().split(/\s+/);
  const total = words.length;

  let line1 = data.headline;
  let line2 = "";
  let line3 = "";

  if (total >= 8) {
    const t1 = Math.ceil(total * 0.4);
    const t2 = Math.ceil((total - t1) / 2);
    line1 = words.slice(0, t1).join(" ");
    line2 = words.slice(t1, t1 + t2).join(" ");
    line3 = words.slice(t1 + t2).join(" ");
  } else if (total >= 5) {
    const mid = Math.floor(total / 2);
    line1 = words.slice(0, mid).join(" ");
    line2 = words.slice(mid).join(" ");
  }

  const handle = data.instagramHandle.replace(/^@/, "");
  const W      = data.canvasWidth  ?? 1080;
  const H      = data.canvasHeight ?? 1350;

  // Detecta se o design é editorial limpo (sem overlay)
  const isNoOverlay = /\bnone\b|no overlay|no gradient|directly on|no treatment|text on image/i
    .test(data.backgroundTreatment ?? "");

  // Script de limpeza injetado antes de </body>:
  // 1. Remove dark overlays quando background_treatment=none
  // 2. Oculta qualquer elemento que contenha APENAS o brand_name como texto
  //    (evita duplicação logo-imagem + nome-texto)
  const safeHandle = handle.replace(/'/g, "\\'");
  const safeBrand  = data.brandName.replace(/'/g, "\\'");
  const cleanupBlock = `
<!-- PostAI cleanup: logo dedup + overlay kill -->
<style id="postai-cleanup">
${isNoOverlay ? `
  /* background_treatment=none: remove overlays escuros */
  .overlay,.gradient-overlay,.dark-overlay,.text-overlay,
  .bg-overlay,.photo-overlay,.gradient,.bottom-gradient,
  [class*="overlay"],[class*="gradient"],[class*="shade"] {
    display: none !important;
  }
` : ""}
</style>
<script>
(function(){
  var bn = '${safeBrand}';
  var handle = '${safeHandle}';
  // Oculta texto igual ao brand_name quando há logo <img> no mesmo container
  document.querySelectorAll('*').forEach(function(el){
    if(el.childElementCount > 0) return;
    var t = (el.textContent || '').trim();
    if(t === bn || t === bn.toUpperCase()){
      var par = el.parentElement;
      if(par && par.querySelector('img[src*="logo_url"], img[alt=""], img.logo')){
        el.style.display = 'none';
      }
    }
  });
  // Oculta linhas de headline vazias
  document.querySelectorAll('.hl,.pre-hl,.cap-line,.headline-line').forEach(function(el){
    if(!el.textContent.trim()) el.style.display='none';
  });
  // Auto-fit: reduz font-size para caber no container
  document.querySelectorAll('.auto-fit').forEach(function(el){
    var par = el.parentElement;
    var maxW = (par ? par.clientWidth : ${W}) - 40;
    var fs = parseFloat(getComputedStyle(el).fontSize);
    el.style.whiteSpace='nowrap';
    while(el.scrollWidth > maxW && fs > 20){ fs--; el.style.fontSize=fs+'px'; }
    el.style.whiteSpace='';
  });
})();
</script>`;

  let result = template
    .replaceAll("{{photo_url}}",          data.photoUrl)
    .replaceAll("{{pre_headline}}",       data.preHeadline)
    .replaceAll("{{headline_line_1}}",    line1)
    .replaceAll("{{headline_line_2}}",    line2)
    .replaceAll("{{headline_line_3}}",    line3)
    .replaceAll("{{caption_first_line}}", data.captionFirstLine)
    .replaceAll("{{logo_url}}",           data.logoUrl ?? "")
    .replaceAll("{{brand_color}}",        data.brandColor ?? "#000000")
    .replaceAll("{{secondary_color}}",    data.secondaryColor ?? "#ffffff")
    .replaceAll("{{brand_name}}",         data.brandName)
    .replaceAll("{{instagram_handle}}",   handle)
    .replaceAll("{{canvas_width}}",       String(W))
    .replaceAll("{{canvas_height}}",      String(H));

  // Injeta bloco de cleanup antes de </body>
  result = result.replace("</body>", cleanupBlock + "\n</body>");

  return result;
}
