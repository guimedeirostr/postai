'use client';

import { FLAGS } from '@/lib/flags';
import { compilerStrings } from '@/lib/i18n/pt-br';
import type { PhaseId } from '@/types';

export const PHASE_INFO: { id: PhaseId; label: string; color: string }[] = [
  { id: 'briefing',   label: 'Briefing',                          color: '#60a5fa' },
  { id: 'plano',      label: 'Plano',                             color: '#a78bfa' },
  ...(FLAGS.COMPILER_ENABLED
    ? [{ id: 'compilacao' as PhaseId, label: compilerStrings.phaseName, color: '#8b5cf6' }]
    : []
  ),
  { id: 'prompt',     label: 'Prompt',                            color: '#f59e0b' },
  { id: 'copy',       label: 'Copy',                              color: '#34d399' },
  { id: 'critico',    label: 'Crítica',                           color: '#fb923c' },
  { id: 'output',     label: 'Output',                            color: '#22d3ee' },
  { id: 'memoria',    label: 'Memória',                           color: '#818cf8' },
];
