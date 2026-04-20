import type { LibraryAsset, BrandLock, LockScope } from '@/types';

export function selectPreferredAsset(assets: unknown, role: string): LibraryAsset | undefined {
  if (!Array.isArray(assets)) return undefined;
  const active = (assets as LibraryAsset[]).filter(a =>
    a?.active !== false && a?.role === role && typeof a?.slug === 'string'
  );
  if (active.length === 0) return undefined;
  const preferred = active.find(a => a.preferred === true);
  if (preferred) return preferred;
  return active.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))[0];
}

export function selectLocks(locks: unknown, scope: LockScope): BrandLock[] {
  if (!Array.isArray(locks)) return [];
  return (locks as BrandLock[]).filter(l =>
    l?.active !== false && l?.scope === scope
  );
}

export function extractHexFromPromptHint(hint: unknown): string | null {
  if (typeof hint !== 'string') return null;
  const m = hint.match(/#[0-9a-f]{3,8}\b/i);
  return m ? m[0].toLowerCase() : null;
}
