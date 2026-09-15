import type { Playout } from '@cg/shared-schema';
import type { PlayoutOverride } from './types.js';

/**
 * The keys of `o` whose value is actually SET, so `{ ...base, ...definedOnly(override) }` layers
 * an override without an explicit `undefined` punching a hole in the base. Under
 * `exactOptionalPropertyTypes` a present-but-undefined key is not the same as an absent one, and
 * spreading the first over a resolved base would drop a value the schema had just supplied.
 */
function definedOnly<T extends object>(o: T): { [K in keyof T]?: Exclude<T[K], undefined> } {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = v;
  return out as { [K in keyof T]?: Exclude<T[K], undefined> };
}

/**
 * 🔴 `TIMING-BUILD-21` §2(b) — layer a session override over a resolved playout.
 *
 * **SPREAD THE BASE; NEVER RE-LIST ITS KEYS.** This was an exhaustive four-key object literal
 * inside `effectivePlayoutFor`, and an exhaustive literal is a SILENT DROP SITE: a field added
 * to `Playout` is simply absent from the result — no compiler error, because every such field is
 * optional — on the path to air. `delayMs` would have been the second field eaten by this exact
 * shape; `fit` was the first, in the console's plate writer.
 *
 * `...base` carries every key the schema resolved, including ones written after today. The
 * override then layers ONLY the per-scope LIFECYCLE keys over it: the element maps (`tickers` /
 * `sequences` / `countdowns`) are destructured away because they are PER-ELEMENT timing, not part
 * of `Playout`, and spreading them would smuggle foreign keys into a playout object.
 *
 * ⚠ It is a named exported function rather than four lines inside the runtime so the guard in
 * `playout-field-survival.test.ts` can test the REAL merge instead of a re-derivation of it. A
 * guard that rebuilds the logic it is guarding tests only itself.
 */
export function mergePlayoutOverride(base: Playout, override?: PlayoutOverride): Playout {
  const { tickers: _t, sequences: _s, countdowns: _c, ...lifecycle } = override ?? {};
  return { ...base, ...definedOnly(lifecycle) };
}
