import { describe, expect, it } from 'vitest';
import type { SourceDefinition } from '@cg/shared-ipc';
import {
  ASPECT_MATCH_TOLERANCE,
  LIVE_PLATE_ASPECT_MISMATCH,
  resolvePlateAspect,
} from '../src/live-plate-fit.js';

/**
 * C-015 phase 6 (task 6.3) — the fit-aspect chain, its refusal, and the D-147
 * decision for "neither side states anything".
 */

const source = (over: Partial<SourceDefinition> = {}): SourceDefinition => ({
  id: 'src1',
  name: 'Studio A',
  producer: { kind: 'route', channel: 2 },
  ...over,
});

describe('§3a chain — the SOURCE outranks the author, and format outranks a typed number', () => {
  it('step 1: the format determines the aspect', () => {
    const out = resolvePlateAspect({
      plateId: 'guest-1',
      source: source({ format: '1080i5000' }),
      expectedAspect: undefined,
    });
    expect(out).toEqual({ ok: true, aspect: 16 / 9, assumed: false });
  });

  it('step 1 BEATS step 2 — a typed `aspect` never overrides a format', () => {
    // A hand-entered aspect is a number that can be wrong on air while looking
    // entirely reasonable. `1080i5000` is 16:9 whatever anyone types beside it.
    const out = resolvePlateAspect({
      plateId: 'guest-1',
      source: source({ format: '1080i5000', aspect: 4 / 3 }),
      expectedAspect: undefined,
    });
    expect(out).toMatchObject({ ok: true, aspect: 16 / 9 });
  });

  it('step 2: the explicit aspect is used where the format determines none (AUTO)', () => {
    const out = resolvePlateAspect({
      plateId: 'guest-1',
      source: source({ format: 'AUTO', aspect: 2.35 }),
      expectedAspect: undefined,
    });
    expect(out).toEqual({ ok: true, aspect: 2.35, assumed: false });
  });

  it('step 3: the author’s expectedAspect is used LAST, for an undescribed source', () => {
    const out = resolvePlateAspect({
      plateId: 'guest-1',
      source: source(),
      expectedAspect: 4 / 3,
    });
    // Not `assumed`: the author DID state something, so the fit is driven by a
    // stated number rather than by the hole's own shape.
    expect(out).toEqual({ ok: true, aspect: 4 / 3, assumed: false });
  });

  it('PAL is a DISPLAY aspect (4:3), not its 720×576 raster', () => {
    // Deriving 720/576 = 1.25 from the raster would crop a 4:3 feed as a shape no
    // display shows. Pinned here because the fit is the first real consumer.
    const out = resolvePlateAspect({
      plateId: 'guest-1',
      source: source({ format: 'PAL' }),
      expectedAspect: undefined,
    });
    expect(out).toMatchObject({ aspect: 4 / 3 });
  });
});

describe('the expectedAspect VALIDATION — a different role from the fallback', () => {
  it('refuses when the author’s assertion and the source disagree', () => {
    const out = resolvePlateAspect({
      plateId: 'guest-1',
      source: source({ format: 'PAL', name: 'Baku' }),
      expectedAspect: 16 / 9,
    });
    expect(out.ok).toBe(false);
    expect(out).toMatchObject({ errorCode: LIVE_PLATE_ASPECT_MISMATCH });
  });

  it('🔴 the refusal NAMES THE PLATE and BOTH numbers — never a bare code', () => {
    // Assert the CLAIM, not the presence of a refusal. "aspect mismatch" alone
    // sends the operator to guess which of several plates, and which side to fix.
    const out = resolvePlateAspect({
      plateId: 'guest-2',
      source: source({ format: 'PAL', name: 'Baku' }),
      expectedAspect: 16 / 9,
    });
    if (out.ok) throw new Error('expected a refusal');
    expect(out.message).toContain('guest-2');
    expect(out.message).toContain('Baku');
    expect(out.message).toContain('16:9');
    expect(out.message).toContain('4:3');
    // …and it says what to DO. A refusal with no next step reads as a broken console.
    expect(out.message).toMatch(/re-assign|correct the source/i);
  });

  it('TOLERATES an author’s rounded decimal — 1.78 is not a mismatch with 16:9', () => {
    // Refusing a take on air because somebody wrote two decimal places would teach
    // operators to stop stating the field at all.
    const out = resolvePlateAspect({
      plateId: 'guest-1',
      source: source({ format: '1080i5000' }),
      expectedAspect: 1.78,
    });
    expect(out).toMatchObject({ ok: true, aspect: 16 / 9 });
  });

  it('…and 1.33 against 4:3, the other rounding operators actually type', () => {
    const out = resolvePlateAspect({
      plateId: 'guest-1',
      source: source({ format: 'PAL' }),
      expectedAspect: 1.33,
    });
    expect(out).toMatchObject({ ok: true });
  });

  it('CATCHES the closest REAL difference in the vocabulary — 16:9 vs DCI 1080', () => {
    // 1.778 vs 1.896 is 6.6% apart, six times the tolerance. If this ever stops
    // failing, the tolerance has been widened past the point of usefulness.
    const out = resolvePlateAspect({
      plateId: 'guest-1',
      source: source({ format: 'dci1080p2500' }),
      expectedAspect: 16 / 9,
    });
    expect(out.ok).toBe(false);
  });

  it('the tolerance sits between the two, with room on both sides', () => {
    // The derivation, made executable: worst rounding well under it, smallest real
    // difference well over it.
    const worstRounding = Math.abs(4 / 3 - 1.33) / 1.33;
    const smallestRealDifference = Math.abs(2048 / 1080 - 16 / 9) / (16 / 9);
    expect(worstRounding).toBeLessThan(ASPECT_MATCH_TOLERANCE);
    expect(smallestRealDifference).toBeGreaterThan(ASPECT_MATCH_TOLERANCE);
  });

  it('an ABSENT expectedAspect is not a disagreement — it asserts nothing (D-147)', () => {
    const out = resolvePlateAspect({
      plateId: 'guest-1',
      source: source({ format: 'PAL' }),
      expectedAspect: undefined,
    });
    expect(out).toMatchObject({ ok: true, aspect: 4 / 3 });
  });

  it('a source stating NOTHING cannot disagree with the author either', () => {
    // The validation needs two facts. With only the author's, there is nothing to
    // check it against, and step 3 uses it as the fit input instead.
    const out = resolvePlateAspect({
      plateId: 'guest-1',
      source: source({ format: 'AUTO' }),
      expectedAspect: 16 / 9,
    });
    expect(out).toMatchObject({ ok: true, aspect: 16 / 9, assumed: false });
  });
});

describe('⭐ the D-147 decision — neither side states an aspect', () => {
  it('does NOT refuse: it assumes the hole’s own shape and says it assumed', () => {
    const out = resolvePlateAspect({
      plateId: 'guest-1',
      source: source({ format: 'AUTO' }),
      expectedAspect: undefined,
    });
    expect(out).toEqual({ ok: true, aspect: null, assumed: true });
  });

  it('🔴 the argument from the CODE — refusing would outlaw `AUTO`', () => {
    // This is the reason the decision went the way it did, made executable rather
    // than left in a docstring. `AUTO` is a supported catalog format whose whole
    // meaning is "the hardware decides" — an operator who picks it has configured
    // the system correctly. A refusal here would make a first-class value unusable,
    // with nothing in the UI saying why.
    const auto = resolvePlateAspect({
      plateId: 'guest-1',
      source: source({ format: 'AUTO' }),
      expectedAspect: undefined,
    });
    expect(auto.ok).toBe(true);
    // Same for a source that states no format at all — the ordinary state of a
    // catalog entry somebody added quickly during a live show.
    const bare = resolvePlateAspect({
      plateId: 'guest-1',
      source: source(),
      expectedAspect: undefined,
    });
    expect(bare.ok).toBe(true);
  });

  it('`assumed` is its OWN field, not `aspect === null` — they answer different questions', () => {
    // `aspect` says what the geometry does; `assumed` says how much we know. A
    // consumer needs both to say "fitted, unverified" instead of claiming a
    // verified fit — the honesty half of a decision that deliberately does not
    // refuse, and the seam the owner would flip if they weigh the two on-air
    // failures differently.
    const assumedCase = resolvePlateAspect({
      plateId: 'guest-1',
      source: source(),
      expectedAspect: undefined,
    });
    const knownCase = resolvePlateAspect({
      plateId: 'guest-1',
      source: source({ format: '720p5000' }),
      expectedAspect: undefined,
    });
    expect(assumedCase).toMatchObject({ assumed: true });
    expect(knownCase).toMatchObject({ assumed: false });
  });
});
