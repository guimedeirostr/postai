"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Download, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { BrandProfile, GeneratedPost } from "@/types";

const FORMAT_PX: Record<string, { w: number; h: number }> = {
  feed:        { w: 1080, h: 1350 },
  stories:     { w: 1080, h: 1920 },
  reels_cover: { w: 1080, h: 1920 },
};

interface Props {
  post:   GeneratedPost;
  client: BrandProfile;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) }
    : { r: 109, g: 40, b: 217 };
}

function getLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

export function PostComposer({ post, client }: Props) {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const [rendered, setRendered] = useState(false);
  const [overlayOpacity, setOverlayOpacity] = useState(35);
  const [showHook, setShowHook]   = useState(true);
  const [showLogo, setShowLogo]   = useState(!!client.logo_url);

  const dim = FORMAT_PX[post.format] ?? FORMAT_PX.feed;
  const textColor = getLuminance(client.primary_color) > 0.5 ? "#1a1a1a" : "#ffffff";

  const draw = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas || !post.image_url) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width  = dim.w;
    canvas.height = dim.h;

    // 1. Imagem de fundo
    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = reject;
      img.src = post.image_url!;
    });

    // Cover fit
    const imgRatio    = img.width / img.height;
    const canvasRatio = dim.w / dim.h;
    let sx = 0, sy = 0, sw = img.width, sh = img.height;
    if (imgRatio > canvasRatio) {
      sw = img.height * canvasRatio;
      sx = (img.width - sw) / 2;
    } else {
      sh = img.width / canvasRatio;
      sy = (img.height - sh) / 2;
    }
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, dim.w, dim.h);

    // 2. Overlay de cor da marca
    if (overlayOpacity > 0) {
      const { r, g, b } = hexToRgb(client.primary_color);
      ctx.fillStyle = `rgba(${r},${g},${b},${overlayOpacity / 100})`;
      ctx.fillRect(0, 0, dim.w, dim.h);
    }

    // 3. Gradiente inferior para leitura do texto
    if (showHook) {
      const grad = ctx.createLinearGradient(0, dim.h * 0.55, 0, dim.h);
      grad.addColorStop(0, "rgba(0,0,0,0)");
      grad.addColorStop(1, "rgba(0,0,0,0.72)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, dim.w, dim.h);

      // 4. Hook/Headline
      const fontSize   = Math.round(dim.w * 0.072);
      const padding    = Math.round(dim.w * 0.07);
      const maxWidth   = dim.w - padding * 2;
      const lineHeight = fontSize * 1.25;

      ctx.font         = `800 ${fontSize}px 'Arial', sans-serif`;
      ctx.fillStyle    = "#ffffff";
      ctx.textBaseline = "bottom";
      ctx.shadowColor  = "rgba(0,0,0,0.6)";
      ctx.shadowBlur   = 12;

      // Usa visual_headline (overlay curto) se disponível, fallback para headline
      const overlayText = (post as Record<string, unknown>).visual_headline as string || post.headline;
      const words = overlayText.split(" ");
      const lines: string[] = [];
      let current = "";
      for (const word of words) {
        const test = current ? `${current} ${word}` : word;
        if (ctx.measureText(test).width > maxWidth) { lines.push(current); current = word; }
        else current = test;
      }
      if (current) lines.push(current);

      const totalH = lines.length * lineHeight;
      let y = dim.h - padding - (showLogo && client.logo_url ? 160 : 0);

      for (let i = lines.length - 1; i >= 0; i--) {
        ctx.fillText(lines[i], padding, y, maxWidth);
        y -= lineHeight;
      }
      ctx.shadowBlur = 0;
    }

    // 5. Logo
    if (showLogo && client.logo_url) {
      try {
        const logo = new Image();
        logo.crossOrigin = "anonymous";
        await new Promise<void>((resolve) => {
          logo.onload  = () => resolve();
          logo.onerror = () => resolve(); // silently skip if logo fails
          logo.src = client.logo_url!;
        });
        if (logo.complete && logo.naturalWidth > 0) {
          const maxLogoH  = Math.round(dim.h * 0.065);
          const logoRatio = logo.width / logo.height;
          const logoH     = maxLogoH;
          const logoW     = logoH * logoRatio;
          const padding   = Math.round(dim.w * 0.07);
          ctx.drawImage(logo, padding, dim.h - padding - logoH, logoW, logoH);
        }
      } catch { /* logo falhou, ignora */ }
    }

    setRendered(true);
  }, [post, client, dim, overlayOpacity, showHook, showLogo]);

  useEffect(() => { if (post.image_url) { setRendered(false); draw(); } }, [draw, post.image_url]);

  function handleDownload() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `${client.name.toLowerCase().replace(/\s+/g, "-")}-${post.format}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  if (!post.image_url) return null;

  const previewRatio = dim.h / dim.w;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-700">Arte Final</p>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => { setRendered(false); draw(); }}>
            <RefreshCw className="w-3.5 h-3.5 mr-1" /> Atualizar
          </Button>
          <Button size="sm" onClick={handleDownload} disabled={!rendered}
            className="bg-violet-600 hover:bg-violet-700 text-white">
            <Download className="w-3.5 h-3.5 mr-1.5" /> Download PNG
          </Button>
        </div>
      </div>

      {/* Controles */}
      <div className="flex flex-wrap gap-4 text-xs text-slate-600 bg-slate-50 rounded-xl p-3">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={showHook} onChange={e => setShowHook(e.target.checked)} className="accent-violet-600" />
          Mostrar headline
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={showLogo && !!client.logo_url} disabled={!client.logo_url}
            onChange={e => setShowLogo(e.target.checked)} className="accent-violet-600" />
          {client.logo_url ? "Mostrar logo" : "Logo (carregue no perfil)"}
        </label>
        <label className="flex items-center gap-2">
          Overlay da marca:
          <input type="range" min={0} max={70} value={overlayOpacity}
            onChange={e => setOverlayOpacity(Number(e.target.value))}
            className="w-20 accent-violet-600" />
          <span>{overlayOpacity}%</span>
        </label>
      </div>

      {/* Preview do canvas */}
      <div className="w-full rounded-xl overflow-hidden border shadow-sm bg-slate-100"
        style={{ aspectRatio: `${dim.w}/${dim.h}` }}>
        <canvas ref={canvasRef}
          className="w-full h-full"
          style={{ display: "block" }} />
      </div>
    </div>
  );
}
