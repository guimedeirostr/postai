'use client';

import { create } from 'zustand';
import type { PhaseId, PhaseStatus } from '@/types';
import { propagateStale, CANVAS_GRAPH } from './staleness';

export type PhaseState = {
  status: PhaseStatus;
  output?: unknown;
  inputHash?: string;
};

export type CanvasPhases = Record<PhaseId, PhaseState>;

type CanvasStoreState = {
  phases: CanvasPhases;
  mode: 'step' | 'checkpoint' | 'run-all';
  checkpointAt?: PhaseId;
  runId?: string;
  setStatus: (p: PhaseId, s: PhaseStatus) => void;
  setOutput: (p: PhaseId, out: unknown) => void;
  setInputHash: (p: PhaseId, hash: string) => void;
  markStaleDownstream: (p: PhaseId) => void;
  approve: (p: PhaseId) => void;
  setMode: (m: 'step' | 'checkpoint' | 'run-all') => void;
  setCheckpointAt: (p: PhaseId | undefined) => void;
  setRunId: (id: string | undefined) => void;
  reset: () => void;
};

const INITIAL_PHASES: Record<PhaseId, PhaseState> = {
  briefing: { status: 'idle' },
  memoria:  { status: 'idle' },
  plano:    { status: 'idle' },
  prompt:   { status: 'idle' },
  copy:     { status: 'idle' },
  critico:  { status: 'idle' },
  output:   { status: 'idle' },
};

export const useCanvasStore = create<CanvasStoreState>((set, get) => ({
  phases: { ...INITIAL_PHASES },
  mode: 'step',
  checkpointAt: 'prompt',
  runId: undefined,

  setStatus: (p, s) =>
    set(st => ({ phases: { ...st.phases, [p]: { ...st.phases[p], status: s } } })),

  setOutput: (p, out) =>
    set(st => ({ phases: { ...st.phases, [p]: { ...st.phases[p], output: out, status: 'done' } } })),

  setInputHash: (p, hash) =>
    set(st => ({ phases: { ...st.phases, [p]: { ...st.phases[p], inputHash: hash } } })),

  markStaleDownstream: (p) => {
    const nextStatuses = propagateStale(get().phases, p, CANVAS_GRAPH);
    set(st => ({
      phases: Object.fromEntries(
        Object.entries(st.phases).map(([k, v]) => [k, { ...v, status: nextStatuses[k as PhaseId] }]),
      ) as Record<PhaseId, PhaseState>,
    }));
  },

  approve: (p) =>
    set(st => ({ phases: { ...st.phases, [p]: { ...st.phases[p], status: 'done' } } })),

  setMode: (m) => set({ mode: m }),
  setCheckpointAt: (p) => set({ checkpointAt: p }),
  setRunId: (id) => set({ runId: id }),

  reset: () => set({ phases: { ...INITIAL_PHASES }, runId: undefined }),
}));

// ── Derived selectors ─────────────────────────────────────────────────────────

/** Returns upstream PhaseIds for a given phase (reverse of CANVAS_GRAPH) */
const UPSTREAM: Record<PhaseId, PhaseId[]> = (() => {
  const up: Partial<Record<PhaseId, PhaseId[]>> = {};
  for (const [src, dsts] of Object.entries(CANVAS_GRAPH) as [PhaseId, PhaseId[]][]) {
    for (const dst of dsts) {
      (up[dst] ??= []).push(src);
    }
  }
  return up as Record<PhaseId, PhaseId[]>;
})();

export function canRun(phases: Record<PhaseId, PhaseState>, phaseId: PhaseId): boolean {
  const upstreams = UPSTREAM[phaseId] ?? [];
  if (upstreams.length === 0) return true;
  return upstreams.some(u => phases[u].status === 'done' || phases[u].status === 'stale');
}
