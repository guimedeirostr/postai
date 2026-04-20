import type { PromptSlot, CompileInput, CompileWarning } from '@/types';

export function renderBrandIdentity(
  input: CompileInput,
  _ctx: { warnings: CompileWarning[]; maxSlotLength: number },
): PromptSlot {
  const { name, segment } = input.client;
  const handle = (input.client.handle ?? '').replace(/^@+/, '');
  const parts = [`Cliente: ${name}`];
  if (handle) parts.push(`(@${handle})`);
  if (segment) parts.push(`— segmento: ${segment}`);

  return {
    key: 'BRAND_IDENTITY',
    rendered: `IDENTIDADE:\n${parts.join(' ')}`,
    sources: [{ kind: 'brief', field: 'client.name' }],
  };
}
