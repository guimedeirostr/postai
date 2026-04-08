/**
 * lib/prompts/html-template.ts
 *
 * Prompt para Claude Vision analisar uma imagem de referência e gerar
 * um template HTML/CSS completo que replica o design profissional.
 *
 * Placeholders disponíveis:
 *   {{photo_url}}         — URL da foto de fundo
 *   {{headline_line_1}}   — primeira parte do headline
 *   {{headline_line_2}}   — segunda parte (vazia se não houver)
 *   {{headline_line_3}}   — terceira parte (vazia se não houver)
 *   {{logo_url}}          — URL do logo da marca (PNG/SVG transparente)
 *   {{brand_color}}       — cor primária hex (#CC0000)
 *   {{secondary_color}}   — cor secundária hex (#FFD700)
 *   {{brand_name}}        — nome da marca
 *   {{instagram_handle}}  — handle sem @ (ex: mocellingourmet)
 *   {{canvas_width}}      — largura em px (1080)
 *   {{canvas_height}}     — altura em px (1350 feed / 1920 stories)
 */

// ── Fontes mais usadas por agências brasileiras top ────────────────────────────
// Lista curada para Claude escolher a mais próxima ao que vê na imagem.
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

SANS-SERIF CONDENSADO (impactante, esportivo, promoções):
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
  return `You are a world-class senior digital art director and front-end engineer at a top Brazilian agency. You have rendered thousands of professional Instagram posts.

Your task: analyze this Instagram post image with pixel-perfect precision and generate a complete, self-contained HTML/CSS template that EXACTLY REPLICATES this design style.

The output will be rendered by Puppeteer (Chrome) at {{canvas_width}}×{{canvas_height}}px. It must look identical to the reference image — any professional designer comparing the two should be unable to distinguish the style.

═══════════════════════════════════════════════════════════════
STEP 1 — TYPOGRAPHY IDENTIFICATION (most critical)
═══════════════════════════════════════════════════════════════
Identify the EXACT font(s) used. Match against this curated list of agency fonts:
${AGENCY_FONTS}

For each text element, determine:
  • Font family (closest match from list above, or identify if you see something else)
  • Font weight: 100/200/300/400/500/600/700/800/900
  • Font style: normal | italic
  • Text transform: none | uppercase | lowercase
  • Letter spacing: exact value in px or em (e.g. "0.15em" for wide-tracked caps)
  • Line height: exact value

═══════════════════════════════════════════════════════════════
STEP 2 — COLOR EXTRACTION
═══════════════════════════════════════════════════════════════
Use your mental eyedropper. Extract:
  • All text colors (exact hex)
  • All background/band colors (exact hex + opacity if translucent)
  • Any gradient values (direction + stops)
  • Drop shadows (color, blur, offset)

═══════════════════════════════════════════════════════════════
STEP 3 — LAYOUT MAPPING
═══════════════════════════════════════════════════════════════
Map the exact pixel positions (relative to 1080×1350):
  • Where does the logo sit? (top/center px, left/right px, width px)
  • Where does the text zone start? (y px from top)
  • Background band: y position, height, full-width or contained?
  • Footer: y position from bottom, height, content

═══════════════════════════════════════════════════════════════
CRITICAL OUTPUT RULES:
═══════════════════════════════════════════════════════════════
1. Output ONLY raw HTML — start with <!DOCTYPE html>, end with </html>
   NO markdown fences, NO explanations, NO code comments outside the template
2. The outer container must be: width:{{canvas_width}}px; height:{{canvas_height}}px; overflow:hidden; position:relative
3. ALL measurements in px (no vw, vh, em, %, except in Google Fonts URL)
4. Use Google Fonts @import with ALL needed weights (e.g. wght@300;400;400i;700;700i;900)
5. Background photo: background:url('{{photo_url}}') center/cover no-repeat on the main container
6. NEVER hardcode brand text/colors — use ONLY placeholders (see below)
7. Logo: use <img src="{{logo_url}}" class="logo" alt=""> — do NOT also show {{brand_name}} as text if a logo image is provided. Show {{brand_name}} as text ONLY as a fallback inside CSS using display tricks, or use it as aria-label only.

═══════════════════════════════════════════════════════════════
PLACEHOLDER SYSTEM — use EXACTLY these strings:
═══════════════════════════════════════════════════════════════
  {{photo_url}}         → background photo URL
  {{headline_line_1}}   → first headline fragment
  {{headline_line_2}}   → second headline fragment (may be empty string — hide when empty)
  {{headline_line_3}}   → third headline fragment (may be empty string — hide when empty)
  {{logo_url}}          → brand logo PNG/SVG URL
  {{brand_color}}       → brand primary hex (e.g. #8B1A1A)
  {{secondary_color}}   → brand secondary hex (e.g. #C4956A)
  {{brand_name}}        → brand name text (fallback only)
  {{instagram_handle}}  → handle without @ (e.g. mocellingourmet)
  {{canvas_width}}      → 1080
  {{canvas_height}}     → 1350

For band/overlay colors: if the reference uses a solid color band, use the EXACT extracted hex.
If the band color matches or is close to the brand's color, use {{brand_color}} with opacity.
If it's a neutral (black, white, cream), hardcode the hex value.

═══════════════════════════════════════════════════════════════
TEXT OVERFLOW PREVENTION (mandatory):
═══════════════════════════════════════════════════════════════
Every text container must have:
  overflow: hidden;
  word-break: break-word;

Add class "auto-fit" to ALL headline elements. Include this script at end of body:
<script>
(function(){
  // Hide empty headline lines
  document.querySelectorAll('.hl').forEach(function(el){
    if(!el.textContent.trim()) el.style.display='none';
  });
  // Auto-fit text to container width
  document.querySelectorAll('.auto-fit').forEach(function(el){
    var par = el.parentElement;
    var maxW = par.clientWidth;
    var fs = parseFloat(getComputedStyle(el).fontSize);
    el.style.whiteSpace = 'nowrap';
    while(el.scrollWidth > maxW && fs > 18){ fs -= 1; el.style.fontSize = fs+'px'; }
    el.style.whiteSpace = '';
  });
})();
</script>
Add class "hl" to ALL .headline-line elements so empty ones are hidden.

═══════════════════════════════════════════════════════════════
REFERENCE DESIGN REPLICATION CHECKLIST:
═══════════════════════════════════════════════════════════════
□ Logo: position, size, any white/dark version treatment (filter: brightness(0) invert(1) for white logo)
□ Pre-headline small text: font, weight, color, letter-spacing, case
□ Main headline: font, weight, italic or not, color, size, letter-spacing
□ Background treatment behind text: band color, opacity, border-radius, full-width or contained
□ Footer: @handle style, separator lines/dashes, font, color
□ Any decorative elements: lines, dots, geometric shapes — replicate in CSS
□ Overlay on photo: gradient direction, colors, opacity — replicate exactly
□ Drop shadows on text: text-shadow values

Generate the complete HTML template now — start with <!DOCTYPE html>:`;
}

/**
 * Substitui os placeholders do template com os dados reais da marca e post.
 *
 * Divisão de headline:
 *   < 5 palavras → 1 linha
 *   5–7 palavras → 2 linhas (divide ao meio)
 *   8+ palavras  → 3 linhas (split 40/30/30)
 */
export function fillHtmlTemplate(
  template: string,
  data: {
    photoUrl:        string;
    headline:        string;
    logoUrl:         string;
    brandColor:      string;
    secondaryColor:  string;
    brandName:       string;
    instagramHandle: string;
    canvasWidth?:    number;
    canvasHeight?:   number;
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

  return template
    .replaceAll("{{photo_url}}",        data.photoUrl)
    .replaceAll("{{headline_line_1}}",  line1)
    .replaceAll("{{headline_line_2}}",  line2)
    .replaceAll("{{headline_line_3}}",  line3)
    .replaceAll("{{logo_url}}",         data.logoUrl ?? "")
    .replaceAll("{{brand_color}}",      data.brandColor ?? "#000000")
    .replaceAll("{{secondary_color}}",  data.secondaryColor ?? "#ffffff")
    .replaceAll("{{brand_name}}",       data.brandName)
    .replaceAll("{{instagram_handle}}", handle)
    .replaceAll("{{canvas_width}}",     String(W))
    .replaceAll("{{canvas_height}}",    String(H));
}
