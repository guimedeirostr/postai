import { createHash } from 'crypto';
import type { PhaseId, PhaseStatus } from '@/types';

export const CANVAS_GRAPH: Record<PhaseId, PhaseId[]> = {
  briefing:   ['plano'],
  memoria:    ['plano', 'prompt'],
  plano:      ['prompt', 'copy'],
  compilacao: [],
  prompt:     ['image'],
  image:      ['critico'],
  copy:       ['critico'],
  critico:    ['output'],
  output:     ['memoria'],
};

export function hashInput(input: unknown): string {
  const obj = input as object;
  const normalized = JSON.stringify(input, Object.keys(obj ?? {}).sort());
  return createHash('sha1').update(normalized).digest('hex');
}

export function propagateStale(
  phases: Record<PhaseId, { status: PhaseStatus; inputHash?: string }>,
  changedPhase: PhaseId,
  graph: Record<PhaseId, PhaseId[]> = CANVAS_GRAPH,
): Record<PhaseId, PhaseStatus> {
  const next = { ...phases };
  const visited = new Set<PhaseId>();
  const queue: PhaseId[] = [changedPhase];

  while (queue.length) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);

    for (const child of graph[current] ?? []) {
      const childStatus = next[child]?.status;
      if (childStatus === 'done' || childStatus === 'queued') {
        next[child] = { ...next[child], status: 'stale' };
        queue.push(child);
      }
    }
  }

  return Object.fromEntries(
    Object.entries(next).map(([k, v]) => [k, v.status]),
  ) as Record<PhaseId, PhaseStatus>;
}
