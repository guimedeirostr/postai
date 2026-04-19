"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Palette, Loader2, ArrowRight } from "lucide-react";
import type { BrandProfile } from "@/types";

function PalettePreview({ primary, secondary }: { primary: string; secondary: string }) {
  return (
    <div className="flex gap-1">
      <div className="w-5 h-5 rounded-full border-2 border-white shadow-sm" style={{ backgroundColor: primary }} />
      <div className="w-5 h-5 rounded-full border-2 border-white shadow-sm" style={{ backgroundColor: secondary }} />
    </div>
  );
}

export default function BrandKitsPage() {
  const [clients, setClients] = useState<BrandProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/clients")
      .then(r => r.json())
      .then(d => { setClients(d.clients ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Brand Kits</h1>
        <p className="text-slate-500 mt-1">Paleta, tipografia e identidade de cada cliente</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-violet-400" />
        </div>
      ) : clients.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center text-slate-400">
          <Palette className="w-10 h-10 mb-3 text-slate-300" />
          <p className="font-medium text-slate-600">Nenhum cliente ainda</p>
          <p className="text-sm mt-1">Crie um cliente para configurar seu Brand Kit</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {clients.map(client => (
            <Link
              key={client.id}
              href={`/clients/${client.id}/brand`}
              className="group block bg-white rounded-2xl shadow-sm hover:shadow-md border border-slate-100 transition-all overflow-hidden"
            >
              {/* Color bar */}
              <div
                className="h-2 w-full"
                style={{
                  background: `linear-gradient(to right, ${client.primary_color} 50%, ${client.secondary_color} 50%)`,
                }}
              />

              <div className="p-5">
                {/* Header */}
                <div className="flex items-center gap-3 mb-4">
                  {client.logo_url ? (
                    <img
                      src={client.logo_url}
                      alt={client.name}
                      className="w-10 h-10 rounded-lg object-cover border border-slate-100"
                    />
                  ) : (
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center text-white text-sm font-bold"
                      style={{ backgroundColor: client.primary_color }}
                    >
                      {client.name[0]}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-900 truncate">{client.name}</p>
                    <p className="text-xs text-slate-400 truncate">{client.segment}</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-violet-500 transition-colors" />
                </div>

                {/* Palette */}
                <div className="flex items-center gap-2 mb-3">
                  <PalettePreview primary={client.primary_color} secondary={client.secondary_color} />
                  <span className="text-xs text-slate-400 font-mono">
                    {client.primary_color} / {client.secondary_color}
                  </span>
                </div>

                {/* Tom de voz snippet */}
                {client.tone_of_voice && (
                  <p className="text-xs text-slate-500 line-clamp-2 italic">
                    &ldquo;{client.tone_of_voice}&rdquo;
                  </p>
                )}

                {/* Social badges */}
                {(client.social_networks ?? []).length > 0 && (
                  <div className="flex gap-1 mt-3">
                    {(client.social_networks ?? []).map(n => (
                      <span
                        key={n}
                        className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium capitalize"
                      >
                        {n}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
