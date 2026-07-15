import type { Scene, Element } from '@cg/shared-schema';

/**
 * D-125 — module-level cache that resolves a Lottie assetId to its PARSED
 * animationData object (the full bodymovin JSON).
 *
 * The Designer preview iframe mounts a Lottie player at `createRuntime` time and
 * reads the parsed animation from `options.lottieAssets[assetId]`, so — mirroring
 * {@link assetUrlCache} for images — the host maintains one cache + subscribe model:
 *
 *   - `primeScene(scene)` reads + parses every Lottie asset the scene references.
 *   - `getAll()` returns the current snapshot; the canvas / preview attach it to
 *     every scene-replace + lottie-assets message so the iframe can mount players.
 *   - `subscribe(handler)` lets the canvas re-post when a new animation resolves
 *     after the initial mount.
 *
 * The parsed data is a plain JSON object, so it structured-clones across the
 * `postMessage` boundary unchanged.
 */

const data = new Map<string, unknown>();
type Handler = () => void;
const handlers = new Set<Handler>();

function notify(): void {
  for (const h of handlers) h();
}

export function getAll(): Readonly<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of data) out[k] = v;
  return out;
}

export function subscribe(handler: Handler): () => void {
  handlers.add(handler);
  return () => handlers.delete(handler);
}

/** Resolve + parse one Lottie asset's JSON and cache it. Idempotent. */
export async function prime(assetId: string): Promise<void> {
  if (data.has(assetId)) return;
  const url = await window.cg.assets.url(assetId);
  if (url === null) return;
  try {
    const parsed: unknown = JSON.parse(await (await fetch(url)).text());
    // Re-check after the async gap so a concurrent primer doesn't double-notify.
    if (data.has(assetId)) return;
    data.set(assetId, parsed);
    notify();
  } catch {
    /* unreadable / not JSON — leave unresolved (the player just won't mount) */
  }
}

/** Every Lottie element's assetId in a scene (main + comps, recursing containers). */
function collectLottieIds(scene: Scene): string[] {
  const ids = new Set<string>();
  const walk = (children: readonly Element[]): void => {
    for (const el of children) {
      if (el.type === 'lottie') ids.add(el.assetId);
      else if (el.type === 'container') walk(el.children);
    }
  };
  for (const layer of scene.layers) walk(layer.children);
  for (const comp of scene.compositions ?? [])
    for (const layer of comp.layers) walk(layer.children);
  return [...ids];
}

/** Prime every Lottie asset a scene references (no-op for the ones already cached). */
export async function primeScene(scene: Scene): Promise<void> {
  for (const id of collectLottieIds(scene)) await prime(id);
}

/**
 * Drop the whole cache. Called when the active project changes so a previous
 * project's animations never leak into the new project's preview.
 */
export function clearAll(): void {
  data.clear();
  notify();
}
