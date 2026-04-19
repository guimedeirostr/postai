"use client";

import { useEffect, useState } from "react";
import { Loader2, Lock, ExternalLink } from "lucide-react";
import { PT_BR } from "@/lib/i18n/pt-br";
import type { BrandLock, BrandLockset, LockScope } from "@/types";

const SCOPE_ICON: Record<LockScope, string> = {
  typography:  "Aa",
  color:       "🎨",
  composition: "▦",
  signature:   "✒️",
  cta:         "🎯",
  tone:        "💬",
  forbidden:   "⚠️",
};

interface Props {
  clientId: string;
  clientName?: string;
}

export function LocksetPreview({ clientId, clientName }: Props) {
  const [lockset, setLockset] = useState<BrandLockset | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!clientId) return;
    fetch(`/api/locksets/${clientId}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setLockset(data); })
      .finally(() => setLoading(false));
  }, [clientId]);

  if (loading) return (
    <div className="flex justify-center py-6">
      <Loader2 className="w-4 h-4 animate-spin text-pi-accent" />
    </div>
  );

  const activeLocks = lockset?.locks.filter(l => l.active !== false) ?? [];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-pi-text">
          Locks ativos{clientName ? ` · ${clientName}` : ''}
          {lockset?.version ? ` · v${lockset.version}` : ''}
        </p>
        {activeLocks.length > 0 && (
          <a
            href={`/clients/${clientId}/lockset`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-pi-accent hover:underline"
          >
            Editar locks <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>

      {activeLocks.length === 0 ? (
        <div className="text-center py-4">
          <Lock className="w-5 h-5 text-pi-text-muted/40 mx-auto mb-2" />
          <p className="text-xs text-pi-text-muted/60">{PT_BR.lockset.emptyTitle}</p>
          <a
            href={`/clients/${clientId}/lockset`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-pi-accent hover:underline mt-1 inline-block"
          >
            Criar locks ↗
          </a>
        </div>
      ) : (
        <>
          <div className="space-y-1.5">
            {activeLocks.map(lock => (
              <LockRow key={lock.id} lock={lock} />
            ))}
          </div>

          <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-2.5">
            <p className="text-xs text-amber-300 leading-relaxed">
              🧪 Dry-run: {PT_BR.lockset.dryRunNotice}
            </p>
          </div>
        </>
      )}
    </div>
  );
}

function LockRow({ lock }: { lock: BrandLock }) {
  return (
    <div className="flex items-start gap-2 bg-pi-surface-muted/60 rounded-lg p-2">
      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded flex-none mt-0.5 ${
        lock.enforcement === 'hard' ? 'bg-red-900/30 text-red-400' : 'bg-slate-700/50 text-slate-400'
      }`}>
        {lock.enforcement === 'hard' ? 'hard' : 'soft'}
      </span>
      <span className="text-xs leading-none mt-0.5">{SCOPE_ICON[lock.scope]}</span>
      <p className="text-xs text-pi-text leading-relaxed">{lock.description}</p>
    </div>
  );
}
