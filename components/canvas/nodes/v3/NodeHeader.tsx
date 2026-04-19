'use client';

import { Play, FastForward, RotateCcw, Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PhaseId, PhaseStatus } from '@/types';

const STATUS_BADGE: Record<PhaseStatus, { txt: string; cls: string }> = {
  idle:    { txt: 'Aguardando',      cls: 'bg-slate-700 text-slate-300' },
  queued:  { txt: 'Na fila',         cls: 'bg-blue-900 text-blue-200' },
  running: { txt: 'Rodando…',        cls: 'bg-violet-700 text-white animate-pulse' },
  done:    { txt: 'Pronto',          cls: 'bg-emerald-700 text-white' },
  stale:   { txt: 'Desatualizado',   cls: 'bg-amber-700 text-amber-100' },
  error:   { txt: 'Erro',            cls: 'bg-red-800 text-red-100' },
  skipped: { txt: 'Pulado',          cls: 'bg-slate-800 text-slate-400' },
};

interface NodeHeaderProps {
  phaseId: PhaseId;
  status: PhaseStatus;
  canRun: boolean;
  onRun: () => void;
  onRunToHere: () => void;
  onRegenerate: () => void;
  onApprove: () => void;
  label: string;
  icon: React.ReactNode;
  accentColor?: string;
}

export function NodeHeader({
  status, canRun, onRun, onRunToHere, onRegenerate, onApprove, label, icon, accentColor = '#a855f7',
}: NodeHeaderProps) {
  const badge = STATUS_BADGE[status];
  const isRunning = status === 'running';
  const canRegenerate = status === 'done' || status === 'stale' || status === 'error';
  const canApprove = status === 'done';

  return (
    <div className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
      <div className="flex items-center gap-2 min-w-0">
        <div
          className="w-6 h-6 rounded-md flex items-center justify-center flex-none"
          style={{ backgroundColor: `${accentColor}25`, color: accentColor }}
        >
          {icon}
        </div>
        <span className="text-xs font-semibold text-slate-200 truncate">{label}</span>
        <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full flex-none', badge.cls)}>
          {badge.txt}
        </span>
      </div>

      <div className="flex items-center gap-0.5 flex-none">
        {isRunning ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-400" />
        ) : (
          <>
            <button
              disabled={!canRun}
              onClick={onRun}
              title={canRun ? 'Rodar este nó' : 'Upstream não concluído'}
              className="p-1 rounded hover:bg-white/10 disabled:opacity-30 transition-colors"
            >
              <Play className="h-3.5 w-3.5" />
            </button>
            <button
              disabled={!canRun}
              onClick={onRunToHere}
              title="Rodar do início até aqui"
              className="p-1 rounded hover:bg-white/10 disabled:opacity-30 transition-colors"
            >
              <FastForward className="h-3.5 w-3.5" />
            </button>
            {canRegenerate && (
              <button
                onClick={onRegenerate}
                title="Regenerar"
                className="p-1 rounded hover:bg-white/10 transition-colors"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            )}
            {canApprove && (
              <button
                onClick={onApprove}
                title="Aprovar (libera próxima fase)"
                className="p-1 rounded bg-emerald-700 hover:bg-emerald-600 transition-colors"
              >
                <Check className="h-3.5 w-3.5" />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
