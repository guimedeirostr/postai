'use client';

import { Check, MoreHorizontal } from 'lucide-react';
import { useState, useRef, useEffect, useMemo } from 'react';
import { cn } from '@/lib/utils';
import type { PhaseId, PhaseStatus } from '@/types';
import { useCanvasStore } from '@/lib/canvas/store';

const STATUS_BADGE: Record<PhaseStatus, { txt: string; cls: string }> = {
  idle:    { txt: 'Aguardando',    cls: 'bg-pi-surface-muted text-pi-text-muted' },
  queued:  { txt: 'Na fila',       cls: 'bg-blue-900 text-blue-200' },
  running: { txt: 'Rodando…',      cls: 'bg-violet-700 text-white animate-pulse' },
  done:    { txt: 'Pronto',        cls: 'bg-emerald-700 text-white' },
  stale:   { txt: 'Desatualizado', cls: 'bg-amber-700 text-amber-100' },
  error:   { txt: 'Erro',          cls: 'bg-red-800 text-red-100' },
  skipped: { txt: 'Pulado',        cls: 'bg-pi-surface-muted text-pi-text-muted/60' },
};

interface NodeHeaderProps {
  phaseId: PhaseId;
  status: PhaseStatus;
  onRunToHere: () => void;
  onRegenerate: () => void;
  onReset: () => void;
  onApprove: () => void;
  label: string;
  icon: React.ReactNode;
  accentColor?: string;
}

export function NodeHeader({
  phaseId, status, onRunToHere, onRegenerate, onReset, onApprove, label, icon, accentColor = '#a855f7',
}: NodeHeaderProps) {
  const badge = STATUS_BADGE[status];
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const allTraces = useCanvasStore(s => s.traces);
  const traces = useMemo(
    () => allTraces.filter(t => t.phaseId === phaseId),
    [allTraces, phaseId],
  );
  const startTs = traces.find(t => t.code === "start")?.ts;
  const doneTs  = traces.find(t => t.code === "done")?.ts;
  const durationMs = startTs && doneTs ? doneTs - startTs : undefined;
  const lastTrace  = status === "running" || status === "done" ? traces[traces.length - 1] : undefined;

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    if (menuOpen) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  return (
    <div className="border-b border-pi-border/30">
    <div className="flex items-center justify-between gap-2 px-3 py-2">
      {/* Left: icon + label + badge */}
      <div className="flex items-center gap-2 min-w-0">
        <div
          className="w-6 h-6 rounded-md flex items-center justify-center flex-none"
          style={{ backgroundColor: `${accentColor}25`, color: accentColor }}
        >
          {icon}
        </div>
        <span className="text-xs font-semibold text-pi-text truncate">{label}</span>
        <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full flex-none', badge.cls)}>
          {badge.txt}
        </span>
        {durationMs !== undefined && (
          <span className="text-[9px] text-pi-text-muted/70 flex-none">
            {(durationMs / 1000).toFixed(1)}s
          </span>
        )}
      </div>

      {/* Right: Approve + ⋯ menu */}
      <div className="flex items-center gap-1 flex-none">
        {status === 'done' && (
          <button
            onClick={onApprove}
            title="Aprovar (libera próxima fase)"
            className="p-1 rounded bg-emerald-700 hover:bg-emerald-600 transition-colors"
          >
            <Check className="h-3.5 w-3.5 text-white" />
          </button>
        )}

        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen(v => !v)}
            className="p-1 rounded hover:bg-pi-surface-muted transition-colors text-pi-text-muted"
            title="Mais opções"
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 w-44 bg-pi-surface border border-pi-border rounded-xl shadow-xl z-50 overflow-hidden">
              <div className="p-1">
                <button
                  onClick={() => { onRunToHere(); setMenuOpen(false); }}
                  className="w-full text-left px-3 py-1.5 text-xs text-pi-text hover:bg-pi-surface-muted rounded-lg transition-colors"
                >
                  ⏩ Rodar até aqui
                </button>
                <button
                  onClick={() => { onRegenerate(); setMenuOpen(false); }}
                  className="w-full text-left px-3 py-1.5 text-xs text-pi-text hover:bg-pi-surface-muted rounded-lg transition-colors"
                >
                  ↻ Regenerar
                </button>
                <div className="border-t border-pi-border my-1" />
                <button
                  onClick={() => { onReset(); setMenuOpen(false); }}
                  className="w-full text-left px-3 py-1.5 text-xs text-pi-danger hover:bg-pi-surface-muted rounded-lg transition-colors"
                >
                  ✕ Resetar fase
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
    {lastTrace && (
      <div className="px-3 pb-1.5 -mt-0.5">
        <p className="text-[9px] text-pi-text-muted/70 font-mono truncate">
          {lastTrace.message}
        </p>
      </div>
    )}
    </div>
  );
}
