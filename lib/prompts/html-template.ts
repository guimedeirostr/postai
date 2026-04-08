/**
 * lib/prompts/html-template.ts
 *
 * Prompt para Claude Vision analisar uma imagem de referência e gerar
 * um template HTML/CSS completo que replica o design profissional.
 *
 * O template usa placeholders {{variavel}} substituídos em runtime.
 *
 * Placeholders disponíveis:
 *   {{photo_url}}         — URL da foto de fundo
 *   {{headline}}          — headline completo (string única)
 *   {{headline_line_1}}   — primeira parte do headline
 *   {{headline_line_2}}   — segunda parte (pode estar vazia)
 *   {{headline_line_3}}   — terceira parte (pode estar vazia)
 *   {{logo_url}}          — URL do logo da marca
 *   {{brand_color}}       — cor primária hex (#CC0000)
 *   {{secondary_color}}   — cor secundária hex (#FFD700)
 *   {{brand_name}}        — nome da marca
 *   {{instagram_handle}}  — @handle sem @
 *   {{canvas_width}}      — largura em px (1080)
 *   {{canvas_height}}     — altura em px (1350 feed / 1920 stories)
 */

export function buildHtmlTemplatePrompt(): string {
  return `You are a world-class senior digital art director and front-end engineer with 20+ years of experience creating professional Instagram posts for top Brazilian agencies.

Analyze this Instagram post image with extreme precision. Generate a complete, self-contained, production-ready HTML/CSS template that EXACTLY replicates this design style — so new posts with different brand photos and text will look identical in style.

═══════════════════════════════════════════════════════
CRITICAL OUTPUT RULES:
═══════════════════════════════════════════════════════
1. Output ONLY raw HTML — NO explanation, NO markdown, NO code fences, NO comments outside the code.
   Start immediately with <!DOCTYPE html> and end with </html>.
2. The canvas is ALWAYS exactly {{canvas_width}}px × {{canvas_height}}px. Use a fixed outer div with overflow:hidden.
3. ALL measurements must be in pixels (px) — no vw, vh, em, rem, % (except within calc() when pixel equivalent is also set).
4. Include Google Fonts via @import in a <style> tag.
5. NEVER hardcode any brand-specific text or colors — always use placeholders.

═══════════════════════════════════════════════════════
TEXT OVERFLOW PREVENTION (CRITICAL):
═══════════════════════════════════════════════════════
Every text container MUST have:
  overflow: hidden;
  word-break: break-word;
  hyphens: auto;

For headlines: use font-size that fits 15-20 characters per line comfortably.
Include this JavaScript at the end of <body> to auto-fit text:
<script>
(function() {
  document.querySelectorAll('.auto-fit-text').forEach(function(el) {
    var parent = el.parentElement;
    var maxW = parent.offsetWidth - (parseInt(getComputedStyle(parent).paddingLeft) || 0) * 2;
    var maxH = parent.offsetHeight;
    var size = parseInt(getComputedStyle(el).fontSize);
    while ((el.scrollWidth > maxW || el.scrollHeight > maxH) && size > 20) {
      size--;
      el.style.fontSize = size + 'px';
    }
  });
})();
</script>
Add class="auto-fit-text" to ALL headline/text elements.

═══════════════════════════════════════════════════════
PLACEHOLDER SYSTEM:
═══════════════════════════════════════════════════════
Background photo:   background: url('{{photo_url}}') center/cover no-repeat
Logo:               <img src="{{logo_url}}" class="logo" alt="logo">
Brand name text:    {{brand_name}}
Instagram handle:   @{{instagram_handle}}
Primary color:      {{brand_color}}
Secondary color:    {{secondary_color}}
Canvas size:        {{canvas_width}} × {{canvas_height}}

For headlines — use ALL three line placeholders in separate elements:
  <div class="headline-line" id="line1">{{headline_line_1}}</div>
  <div class="headline-line" id="line2">{{headline_line_2}}</div>
  <div class="headline-line" id="line3">{{headline_line_3}}</div>
Then in the auto-fit script, also hide empty lines:
  document.querySelectorAll('.headline-line').forEach(function(el) {
    if (!el.textContent.trim()) el.style.display = 'none';
  });

═══════════════════════════════════════════════════════
DESIGN ANALYSIS — REPLICATE EXACTLY:
═══════════════════════════════════════════════════════
□ Overall composition zone (top/center/bottom/left/right of frame)
□ Background treatment: direct photo / color overlay / gradient / dark band / frosted glass
□ Text hierarchy: how many levels, their relative size ratio (H1 vs H2 vs body)
□ Font: identify the exact typeface or closest Google Font match
□ Font weight: light(300) / regular(400) / semibold(600) / bold(700) / extrabold(800) / black(900)
□ Letter spacing: normal / tracking wide (letter-spacing: 2px-10px) / condensed
□ Text case: uppercase / title case / sentence case
□ Text color(s): exact hex
□ Text shadows or glows: text-shadow values
□ Background behind text: solid band / gradient / none — exact color, opacity, border-radius
□ Logo: position (corner/center/footer), size, any white/dark version treatment
□ Footer bar: present? solid color? height in px?
□ Any decorative elements: lines, icons, geometric shapes — replicate them in CSS/HTML

═══════════════════════════════════════════════════════
STRUCTURE TEMPLATE TO FOLLOW:
═══════════════════════════════════════════════════════
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=FONTNAME:wght@400;700;900&display=swap');
  * { margin:0; padding:0; box-sizing:border-box; }
  body { width:{{canvas_width}}px; height:{{canvas_height}}px; overflow:hidden; }
  .canvas {
    position:relative; width:{{canvas_width}}px; height:{{canvas_height}}px; overflow:hidden;
    background:url('{{photo_url}}') center/cover no-repeat;
  }
  /* ... all your styles ... */
</style>
</head>
<body>
<div class="canvas">
  <!-- background overlays, text zones, logo, footer — all positioned absolutely -->
</div>
<script>/* auto-fit script */</script>
</body>
</html>

Generate the complete HTML template now — start with <!DOCTYPE html>:`;
}

/**
 * Substitui os placeholders do template com os dados reais da marca e post.
 *
 * Estratégia de divisão:
 * - 1-2 palavras  → 1 linha
 * - 3-4 palavras  → 1 linha (curto o suficiente)
 * - 5-7 palavras  → 2 linhas
 * - 8+ palavras   → 3 linhas
 *
 * Prioriza linhas curtas e equilibradas para evitar overflow.
 */
export function fillHtmlTemplate(
  template:  string,
  data: {
    photoUrl:         string;
    headline:         string;
    logoUrl:          string;
    brandColor:       string;
    secondaryColor:   string;
    brandName:        string;
    instagramHandle:  string;
    canvasWidth?:     number;
    canvasHeight?:    number;
  }
): string {
  const words = data.headline.trim().split(/\s+/);
  const total = words.length;

  let line1 = data.headline;
  let line2 = "";
  let line3 = "";

  if (total >= 8) {
    // 3 linhas: tenta equilibrar (40/30/30 split aproximado)
    const t1 = Math.ceil(total * 0.4);
    const t2 = Math.ceil((total - t1) / 2);
    line1 = words.slice(0, t1).join(" ");
    line2 = words.slice(t1, t1 + t2).join(" ");
    line3 = words.slice(t1 + t2).join(" ");
  } else if (total >= 5) {
    // 2 linhas: divide próximo ao meio (prioriza linha 1 mais curta)
    const mid = Math.floor(total / 2);
    line1 = words.slice(0, mid).join(" ");
    line2 = words.slice(mid).join(" ");
  }
  // < 5 palavras: 1 linha apenas (line1 = headline completo, line2/3 = "")

  const handle = data.instagramHandle.replace(/^@/, "");
  const W      = data.canvasWidth  ?? 1080;
  const H      = data.canvasHeight ?? 1350;

  return template
    .replaceAll("{{photo_url}}",        data.photoUrl)
    .replaceAll("{{headline}}",         data.headline)
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
