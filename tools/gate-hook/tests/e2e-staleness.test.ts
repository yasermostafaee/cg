import { describe, expect, it } from 'vitest';
import { decideStaleness } from '../src/e2e-staleness.mjs';

/**
 * P-036 — the staleness verdict.
 *
 * The walk that collects mtimes is filesystem work; the DECISION is this pure
 * function, and it is the part that must not drift. That the guard actually stops
 * a real Playwright run is proven end-to-end and recorded in the change — four
 * runs with a rebuild between them, because a guard against stale artifacts must
 * not be validated by the very mistake it exists to prevent.
 */

const src = (ms: number) => ({ path: 'apps/runtime/src/x.tsx', ms });

describe('decideStaleness', () => {
  it('🔴 STALE when any input is newer than the build', () => {
    const v = decideStaleness({ distNewestMs: 1_000, inputNewest: src(1_500) });
    expect(v.stale).toBe(true);
    expect(v.reason).toBe('older-than-source');
    // The message names the offending file, so the reader is not left to guess
    // which edit made the bundle stale.
    expect(v.file).toBe('apps/runtime/src/x.tsx');
    expect(v.behindMs).toBe(500);
  });

  it('FRESH when the build is newer than every input', () => {
    expect(decideStaleness({ distNewestMs: 2_000, inputNewest: src(1_500) }).stale).toBe(false);
  });

  it('FRESH when the build and the newest input are the same age', () => {
    // Equal mtimes are the ordinary result of a build that immediately follows an
    // edit within the same filesystem tick. Treating equal as stale would refuse
    // legitimate runs, which is how a guard gets disabled.
    expect(decideStaleness({ distNewestMs: 1_000, inputNewest: src(1_000) }).stale).toBe(false);
  });

  it('🔴 STALE when there is no build at all', () => {
    // A missing bundle is not "nothing to check": `vite preview` would serve
    // whatever is there, or fail obscurely. Refusing early names the real cause.
    const v = decideStaleness({ distNewestMs: null, inputNewest: src(1_000) });
    expect(v.stale).toBe(true);
    expect(v.reason).toBe('missing');
  });

  it('FRESH when there are no inputs to compare against', () => {
    // A workspace with no source dirs configured must not be blocked by a guard
    // that has nothing to say about it.
    const v = decideStaleness({ distNewestMs: 1_000, inputNewest: null });
    expect(v.stale).toBe(false);
    expect(v.reason).toBe('no-inputs');
  });
});
