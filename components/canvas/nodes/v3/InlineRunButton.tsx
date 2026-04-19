'use client';

import { Play, Loader2, RotateCcw, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PhaseStatus } from '@/types';

type Props = {
  status: PhaseStatus;
  canRun: boolean;
  onRun: () => void;
  label?: string;
  doneLabel?: string;
  size?: 'sm' | 'md';
};

const ICON_MAP = {
  idle:    Play,
  queued:  Play,
  running: Loader2,
  done:    RotateCcw,
  stale:   AlertTriangle,
  error:   RotateCcw,
  skipped: Play,
} as const;

const CLASS_MAP: Record<PhaseStatus, string> = {
  idle:    'bg-violet-600 hover:bg-violet-500',
  queued:  'bg-slate-700',
  running: 'bg-violet-700 animate-pulse',
  done:    'bg-slate-700 hover:bg-slate-600',
  stale:   'bg-amber-600 hover:bg-amber-500 animate-pulse',
  error:   'bg-red-700 hover:bg-red-600',
  skipped: 'bg-slate-800',
};

export function InlineRunButton({ status, canRun, onRun, label, doneLabel, size = 'md' }: Props) {
  const Icon = ICON_MAP[status];
  const isDisabled = !canRun || status === 'running' || status === 'queued' || status === 'skipped';

  const text =
    status === 'done'  ? (doneLabel ?? 'Regerar') :
    status === 'stale' ? `${label ?? 'Rodar'} (desatualizado)` :
    status === 'error' ? 'Tentar de novo' :
    (label ?? 'Rodar');

  return (
    <button
      disabled={isDisabled}
      onClick={onRun}
      title={isDisabled && !canRun ? 'Fase anterior não concluída' : undefined}
      className={cn(
        'flex items-center gap-1.5 rounded-lg font-medium text-white transition-colors',
        size === 'sm' ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-xs',
        CLASS_MAP[status],
        isDisabled && 'opacity-40 cursor-not-allowed',
      )}
    >
      <Icon className={cn(
        size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5',
        status === 'running' && 'animate-spin',
      )} />
      <span>{text}</span>
    </button>
  );
}
