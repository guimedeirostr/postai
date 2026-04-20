export const FLAGS = {
  LOCKSET_ENABLED: process.env.NEXT_PUBLIC_FLAG_LOCKSET === '1',
  ASSETS_ENABLED:  process.env.NEXT_PUBLIC_FLAG_ASSETS  === '1',
} as const;
