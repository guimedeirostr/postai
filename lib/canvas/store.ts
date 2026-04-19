'use client';

import { create } from 'zustand';
import type { PhaseId, PhaseStatus, ClientContext } from '@/types';
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
  clientId?: string;
  clientContext?: ClientContext;
  setStatus: (p: PhaseId, s: PhaseStatus) => void;
  setOutput: (p: PhaseId, out: unknown) => void;
  setInputHash: (p: PhaseId, hash: string) => void;
  markStaleDownstream: (p: PhaseId) => void;
  approve: (p: PhaseId) => void;
  setMode: (m: 'step' | 'checkpoint' | 'run-all') => void;
  setCheckpointAt: (p: PhaseId | undefined) => void;
  setRunId: (id: string | undefined) => void;
  reset: () => void;
  setClientId: (id: string) => Promise<void>;
  clearClient: () => void;
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
  clientId: undefined,
  clientContext: undefined,

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

  setClientId: async (id: string) => {
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('clientId', id);
      window.history.replaceState({}, '', url);
    }
    const prevClientId = get().clientId;
    const hasRunPhases = Object.values(get().phases).some(p => p.status !== 'idle');
    set({ clientId: id, clientContext: undefined });
    if (prevClientId && prevClientId !== id && hasRunPhases) {
      get().markStaleDownstream('briefing');
    }
    try {
      const ctx: ClientContext = await fetch(`/api/clients/${id}/context`).then(r => r.json());
      set({ clientContext: ctx });
    } catch {
      // context load failure is non-fatal — phases can still run
    }
  },

  clearClient: () => {
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.delete('clientId');
      window.history.replaceState({}, '', url);
    }
    set({ clientId: undefined, clientContext: undefined });
  },
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

export function canRun(phases: Record<PhaseId, PhaseState>, phaseId: PhaseId, clientId?: string): boolean {
  if (!clientId) return false;
  const upstreams = UPSTREAM[phaseId] ?? [];
  if (upstreams.length === 0) return true;
  return upstreams.some(u => phases[u].status === 'done' || phases[u].status === 'stale');
}
