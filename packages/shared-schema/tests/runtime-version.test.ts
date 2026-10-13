import { describe, expect, it } from 'vitest';
import {
  CG_RUNTIME_VERSION,
  compareSemver,
  parseSemver,
  runtimeShortfall,
  runtimeShortfallMessage,
} from '../src/runtime-version.js';

/**
 * 🔴 **`B-196` — the comparison that turns an unreadable zod failure into a sentence.**
 *
 * What is pinned here is not the arithmetic (that is three integers) but the two DECISIONS the
 * arithmetic serves: which direction is guarded, and what an unreadable value means.
 */

describe('parseSemver', () => {
  it('reads three dot-separated integers and nothing else', () => {
    expect(parseSemver('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3 });
    expect(parseSemver(' 1.2.3 ')).toEqual({ major: 1, minor: 2, patch: 3 });
    expect(parseSemver('10.0.0')).toEqual({ major: 10, minor: 0, patch: 0 });
  });

  it('answers null for anything it cannot read, rather than guessing a zero', () => {
    // A guessed 0 would compare BELOW everything and silently pass every package — the exact
    // shape of the `'0.0.0'` this item is about.
    for (const bad of ['', '1', '1.2', '1.2.3.4', 'v1.2.3', '1.2.x', '1.2.3-rc1', 'latest']) {
      expect(parseSemver(bad), bad).toBeNull();
    }
  });
});

describe('compareSemver — major, then minor, then patch', () => {
  it('orders on each field in turn', () => {
    const v = (s: string) => parseSemver(s) as NonNullable<ReturnType<typeof parseSemver>>;
    expect(compareSemver(v('1.0.0'), v('2.0.0'))).toBe(-1);
    expect(compareSemver(v('2.0.0'), v('1.9.9'))).toBe(1);
    expect(compareSemver(v('1.2.0'), v('1.3.0'))).toBe(-1);
    expect(compareSemver(v('1.2.4'), v('1.2.3'))).toBe(1);
    expect(compareSemver(v('1.2.3'), v('1.2.3'))).toBe(0);
  });

  it('does not compare lexically — 10 is above 9', () => {
    const v = (s: string) => parseSemver(s) as NonNullable<ReturnType<typeof parseSemver>>;
    expect(compareSemver(v('0.10.0'), v('0.9.0'))).toBe(1);
  });
});

describe('runtimeShortfall — ONE direction is guarded', () => {
  it('🔴 refuses a package that needs MORE than this build has', () => {
    expect(runtimeShortfall('2.0.0', '1.0.0')).toEqual({ required: '2.0.0', available: '1.0.0' });
    expect(runtimeShortfall('1.0.1', '1.0.0')).toEqual({ required: '1.0.1', available: '1.0.0' });
  });

  it('🔴 does NOT refuse an older package — that direction needs no guard', () => {
    /*
      The Runtime app rebuilds the served HTML from the scene at import with its OWN runtime
      (`templateDelivery.ts`), so an old package is not old CODE, and `P-031`'s
      compatibility-floor policy covers the rest. Guarding it would refuse every package
      exported before this field meant anything.
    */
    expect(runtimeShortfall('0.0.0', '1.0.0')).toBeNull();
    expect(runtimeShortfall('1.0.0', '1.0.0')).toBeNull();
    expect(runtimeShortfall('1.0.0', '2.3.4')).toBeNull();
  });

  it('every package written before this field meant anything still imports', () => {
    // The literal the exporter wrote for the whole life of the format.
    expect(runtimeShortfall('0.0.0')).toBeNull();
  });

  it('🔴 FAILS OPEN on a value it cannot read, and that is deliberate', () => {
    // A malformed manifest is `verify`'s job. Refusing here would put two authorities on one
    // fact and turn a formatting slip into a station that imports nothing.
    expect(runtimeShortfall('not a version', '1.0.0')).toBeNull();
    expect(runtimeShortfall('2.0.0', 'not a version')).toBeNull();
  });

  it('defaults `available` to the build constant, so no caller passes it by hand', () => {
    // Two call sites passing two different "current versions" is the drift this avoids.
    expect(runtimeShortfall(CG_RUNTIME_VERSION)).toBeNull();
  });
});

describe('runtimeShortfallMessage', () => {
  it('names the package, BOTH versions and the action', () => {
    const message = runtimeShortfallMessage('lower third', {
      required: '2.0.0',
      available: '1.0.0',
    });
    expect(message).toContain('lower third');
    expect(message).toContain('2.0.0');
    expect(message).toContain('1.0.0');
    // The operator has two ways out and the message must not leave them guessing which.
    expect(message).toContain('Update this station');
    expect(message).toContain('re-export');
  });
});

describe('CG_RUNTIME_VERSION', () => {
  it('is a readable semver — the constant the exporter writes into every package', () => {
    expect(parseSemver(CG_RUNTIME_VERSION)).not.toBeNull();
  });

  it('🔴 is NOT the 0.0.0 this item exists to remove', () => {
    // A floor of zero parses, compares below everything, and could never refuse anything —
    // a gate that advertises itself and cannot fire.
    expect(CG_RUNTIME_VERSION).not.toBe('0.0.0');
  });
});
