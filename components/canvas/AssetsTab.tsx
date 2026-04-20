"use client";

import { useEffect, useState } from "react";
import { Loader2, ImageIcon, ExternalLink } from "lucide-react";
import { PT_BR } from "@/lib/i18n/pt-br";
import type { LibraryAsset, AssetRole } from "@/types";

const ALL_ROLES: AssetRole[] = ['logo', 'product', 'person', 'background'];

const ROLE_LABEL: Record<AssetRole, string> = {
  logo:       PT_BR.assets.roles.logo,
  product:    PT_BR.assets.roles.product,
  person:     PT_BR.assets.roles.person,
  background: PT_BR.assets.roles.background,
};

interface Props {
  clientId: string;
}

export function AssetsTab({ clientId }: Props) {
  const [assets,  setAssets]  = useState<LibraryAsset[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!clientId) return;
    setLoading(true);
    fetch(`/api/clients/${clientId}/assets/library`)
      .then(r => r.ok ? r.json() : { assets: [] })
      .then(d => setAssets((d as { assets: LibraryAsset[] }).assets ?? []))
      .catch(() => setAssets([]))
      .finally(() => setLoading(false));
  }, [clientId]);

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="w-4 h-4 animate-spin text-pi-text-muted" />
      </div>
    );
  }

  const active = assets.filter(a => a.active);

  return (
    <div className="space-y-4">
      <div className="bg-amber-900/30 border border-amber-500/30 rounded-xl p-3">
        <p className="text-[10px] text-amber-300/80 leading-relaxed">
          Visualização somente leitura. Edite os assets em{" "}
          <a
            href={`/clients/${clientId}/assets`}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-amber-200 inline-flex items-center gap-0.5"
          >
            Biblioteca de Assets <ExternalLink className="w-2.5 h-2.5" />
          </a>
          .
        </p>
      </div>

      {active.length === 0 ? (
        <p className="text-xs text-pi-text-muted/60 text-center py-4">
          Nenhum asset cadastrado
        </p>
      ) : (
        ALL_ROLES.map(role => {
          const group = active.filter(a => a.role === role);
          if (group.length === 0) return null;
          return (
            <div key={role}>
              <p className="text-[10px] font-bold text-pi-text-muted uppercase tracking-widest mb-2">
                {ROLE_LABEL[role]} ({group.length})
              </p>
              <div className="grid grid-cols-3 gap-1.5">
                {group.map(a => (
                  <div
                    key={a.id}
                    title={`${a.slug}${a.preferred ? ' ★' : ''}`}
                    className="relative aspect-square bg-pi-surface-muted rounded-lg overflow-hidden border border-pi-border"
                  >
                    {a.downloadUrl ? (
                      <img
                        src={a.downloadUrl}
                        alt={a.label}
                        className="w-full h-full object-contain p-1"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <ImageIcon className="w-4 h-4 text-pi-text-muted/40" />
                      </div>
                    )}
                    {a.preferred && (
                      <div className="absolute top-1 left-1 w-3 h-3 bg-amber-400 rounded-full" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
