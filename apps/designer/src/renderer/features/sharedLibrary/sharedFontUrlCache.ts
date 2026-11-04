import type { AssetMeta } from '@cg/shared-ipc';

const urls = new Map<string, string>();
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function getAll(): Record<string, string> {
  return Object.fromEntries(urls);
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function prime(font: AssetMeta): Promise<string | null> {
  const cached = urls.get(font.assetId);
  if (cached !== undefined) return cached;
  const api = window.cg.sharedFonts;
  if (api === undefined) return null;
  const url = await api.url(font.assetId);
  if (url === null) return null;
  urls.set(font.assetId, url);
  emit();
  return url;
}

export async function primeAll(): Promise<void> {
  const api = window.cg.sharedFonts;
  if (api === undefined) return;
  const fonts = await api.list();
  await Promise.all(fonts.map((font) => prime(font)));
}

export function revoke(assetId: string): void {
  if (urls.delete(assetId)) emit();
}
