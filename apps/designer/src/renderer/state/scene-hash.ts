import type { Scene } from '@cg/shared-schema';

/**
 * D-088 — content hash of the document model, for the dirty signal.
 *
 * `JSON.stringify` key order is NOT stable here: scenes are spread-built and re-parsed by
 * Zod, so two content-equal scenes can serialize with different key order. So we serialize
 * CANONICALLY — recursively sorted object keys (arrays keep order) — and hash that with
 * FNV-1a (32-bit). `metadata.updatedAt` is removed first: it is bumped by the act of saving,
 * not by user edits, so it must not move the hash. A collision only ever risks a missed
 * dirty flag, which is acceptable for this signal.
 */
function canonical(value: unknown): string {
  if (value === null) return 'null';
  const t = typeof value;
  if (t === 'number') return Number.isFinite(value as number) ? String(value) : 'null';
  if (t === 'boolean') return value === true ? 'true' : 'false';
  if (t === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (t === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj)
      .filter((k) => obj[k] !== undefined)
      .sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`).join(',')}}`;
  }
  // undefined / function / symbol — not part of a JSON scene.
  return 'null';
}

function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Canonical content hash of a `Scene`, EXCLUDING `metadata.updatedAt`. UI/transient state
 * is not part of `Scene`, so it is already excluded by construction.
 */
export function hashScene(scene: Scene): number {
  const { metadata, ...rest } = scene;
  // Defensive: some store-test fixtures build a partial Scene with no `metadata`.
  const meta = metadata as typeof metadata | undefined;
  if (meta === undefined) return fnv1a(canonical(rest));
  const { updatedAt: _ignored, ...metaRest } = meta;
  return fnv1a(canonical({ ...rest, metadata: metaRest }));
}
