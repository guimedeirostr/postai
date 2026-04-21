"use client";

import { useState } from "react";
import { ImageOff } from "lucide-react";

export function ImageOutput({ output }: { output: Record<string, unknown> }) {
  const imageUrl = output.imageUrl as string | undefined;
  const [failed, setFailed] = useState(false);

  if (!imageUrl) return null;

  return (
    <div className="rounded-xl overflow-hidden bg-pi-surface-muted aspect-square w-full">
      {!failed ? (
        <img
          src={imageUrl}
          alt="Imagem gerada"
          className="w-full h-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center gap-1.5 text-pi-text-muted/50">
          <ImageOff className="w-6 h-6" />
          <p className="text-[10px]">Falha ao carregar</p>
        </div>
      )}
    </div>
  );
}
