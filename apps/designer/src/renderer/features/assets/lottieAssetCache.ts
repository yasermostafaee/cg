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

/**
 * B-137 — THE MAP A PREVIEW IS HANDED, SCOPED TO THE SCENE THAT ASKED FOR IT.
 *
 * {@link getAll} returns this MODULE-LEVEL cache in full — every Lottie parsed since
 * the project opened, including assets whose elements have since been deleted. Only
 * {@link clearAll} (a project change) ever empties it.
 *
 * That is what made B-137's freeze STICKY. The preview iframe rebuilds the scene
 * whenever it is handed a non-empty Lottie map, and a rebuild is what strands the
 * video driver on a reparented node. Because the map stayed non-empty after the
 * Lottie ELEMENT was deleted, the rebuild-forcing condition stayed true for the rest
 * of the session — so undoing the change that caused the freeze could not undo the
 * freeze. The stickiness lived in module state, not in the engine, which is also why
 * reopening the preview cured it.
 *
 * The CANVAS deliberately still uses {@link getAll}: it never plays media, so a stale
 * entry there costs a redundant rebuild and cannot freeze anything. The asymmetry is
 * intentional rather than drift — scoping it too is a safe, separate improvement.
 *
 * Scoping the map to the scene's OWN ids kills that at source: delete the Lottie and
 * the map goes empty, so the condition goes false and no rebuild is forced. Nothing
 * about which players MOUNT changes — an id the scene does not reference could never
 * have mounted a player, so this only ever removes entries that were dead weight.
 */
export function getForScene(scene: Scene): Readonly<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  for (const id of collectLottieIds(scene)) {
    const parsed = data.get(id);
    if (parsed !== undefined) out[id] = parsed;
  }
  return out;
}

/**
 * D-125 Phase 3a — one asset's parsed animation, or `undefined` while it is still
 * resolving. The Lottie Inspector reads `fr` / `ip` / `op` off this (via `lottieTiming`)
 * to show the clip's timing in the composition's frame space.
 */
export function get(assetId: string): unknown {
  return data.get(assetId);
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
