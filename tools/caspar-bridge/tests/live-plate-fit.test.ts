import { describe, expect, it } from 'vitest';
import type { SourceDefinition } from '@cg/shared-ipc';
import type { LiveFitMode } from '@cg/shared-schema';
import {
  ASPECT_MATCH_TOLERANCE,
  LIVE_PLATE_ASPECT_MISMATCH,
  resolvePlateAspect,
  resolvePlateFitMode,
} from '../src/live-plate-fit.js';

/**
 * C-015 phase 6 (task 6.3) — the fit-aspect chain, its refusal, and the D-147
 * decision for "neither side states anything".
 *
 * `C-028` — plus the MODE chain, and the refusal's conditionality on it. Every call
 * below states a `fitMode` explicitly rather than leaning on a default: the whole point
 * of making the field required was that the compiler enumerate these sites, and a test
 * helper that filled one in would put the default back where it cannot be seen.
 */

const source = (over: Partial<SourceDefinition> = {}): SourceDefinition => ({
  id: 'src1',
  name: 'Studio A',
  producer: { kind: 'route', channel: 2 },
  ...over,
});

/** Both modes, for the assertions that must hold whichever is in force. */
const BOTH: readonly LiveFitMode[] = ['contain', 'cover'];

describe('§3a chain — the SOURCE outranks the author, and format outranks a typed number', () => {
  it('step 1: the format determines the aspect', () => {
    for (const fitMode of BOTH) {
      const out = resolvePlateAspect({
        plateId: 'guest-1',
        source: source({ format: '1080i5000' }),
        expectedAspect: undefined,
        fitMode,
      });
      // 🔴 `C-028` leaves this chain UNTOUCHED, so the answer must not depend on the
      // mode. Asserted across both rather than stated in a comment: the mode changes
      // the DISPOSITION of a disagreement, never which number the fit is driven by.
      expect(out, fitMode).toEqual({ ok: true, aspect: 16 / 9, assumed: false });
    }
  });

  it('step 1 BEATS step 2 — a typed `aspect` never overrides a format', () => {
    // A hand-entered aspect is a number that can be wrong on air while looking
    // entirely reasonable. `1080i5000` is 16:9 whatever anyone types beside it.
    const out = resolvePlateAspect({
      plateId: 'guest-1',
      source: source({ format: '1080i5000', aspect: 4 / 3 }),
      expectedAspect: undefined,
      fitMode: 'cover',
    });
    expect(out).toMatchObject({ ok: true, aspect: 16 / 9 });
  });

  it('step 2: the explicit aspect is used where the format determines none (AUTO)', () => {
    const out = resolvePlateAspect({
      plateId: 'guest-1',
      source: source({ format: 'AUTO', aspect: 2.35 }),
      expectedAspect: undefined,
      fitMode: 'cover',
    });
    expect(out).toEqual({ ok: true, aspect: 2.35, assumed: false });
  });

  it('step 3: the author’s expectedAspect is used LAST, for an undescribed source', () => {
    const out = resolvePlateAspect({
      plateId: 'guest-1',
      source: source(),
      expectedAspect: 4 / 3,
      fitMode: 'cover',
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
      fitMode: 'cover',
    });
    expect(out).toMatchObject({ aspect: 4 / 3 });
  });
});

describe('the expectedAspect VALIDATION — a different role from the fallback', () => {
  it('refuses under `cover`, when the author’s assertion and the source disagree', () => {
    const out = resolvePlateAspect({
      plateId: 'guest-1',
      source: source({ format: 'PAL', name: 'Baku' }),
      expectedAspect: 16 / 9,
      fitMode: 'cover',
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
      fitMode: 'cover',
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
      fitMode: 'cover',
    });
    expect(out).toMatchObject({ ok: true, aspect: 16 / 9 });
    // …and a tolerated rounding is not a WARNING either. `C-028`'s warning is for a
    // real disagreement; raising one here would put a notice on every rounded field.
    expect(out).not.toHaveProperty('warning');
  });

  it('…and 1.33 against 4:3, the other rounding operators actually type', () => {
    const out = resolvePlateAspect({
      plateId: 'guest-1',
      source: source({ format: 'PAL' }),
      expectedAspect: 1.33,
      fitMode: 'cover',
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
      fitMode: 'cover',
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
      fitMode: 'cover',
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
      fitMode: 'cover',
    });
    expect(out).toMatchObject({ ok: true, aspect: 16 / 9, assumed: false });
  });
});

/**
 * ⭐ `C-028` — THE REFUSAL IS CONDITIONAL ON THE MODE.
 *
 * Its stated justification is that cropping would cut a part of the picture the author
 * never saw. Under `contain` nothing is cropped, so that harm cannot occur — and a take
 * blocked on air for an impossible harm is a refusal that teaches operators to stop
 * stating the field at all.
 */
describe('C-028 — the aspect-mismatch refusal, per mode', () => {
  const MISMATCH = {
    plateId: 'guest-2',
    source: source({ format: 'PAL', name: 'Baku' }),
    expectedAspect: 16 / 9,
  } as const;

  it('`contain` does NOT refuse — it resolves the aspect and warns', () => {
    const out = resolvePlateAspect({ ...MISMATCH, fitMode: 'contain' });
    expect(out.ok).toBe(true);
    // 🔴 And it resolves to the SOURCE's aspect, not the author's. `C-028` changes the
    // DISPOSITION of the disagreement; `D-147`'s ordering is untouched.
    expect(out).toMatchObject({ ok: true, aspect: 4 / 3, assumed: false });
  });

  it('🔴 the WARNING KEEPS THE REASON — the same facts the refusal names', () => {
    // A refusal that loses its reason is a worse defect than the one it prevents, and
    // so is a warning that loses it. The operator must still be able to see WHICH plate
    // disagrees with WHICH source, and by how much.
    const out = resolvePlateAspect({ ...MISMATCH, fitMode: 'contain' });
    if (!out.ok) throw new Error('expected contain not to refuse');
    expect(out.warning?.errorCode).toBe(LIVE_PLATE_ASPECT_MISMATCH);
    expect(out.warning?.message).toContain('guest-2');
    expect(out.warning?.message).toContain('Baku');
    expect(out.warning?.message).toContain('16:9');
    expect(out.warning?.message).toContain('4:3');
  });

  it('…and states the consequence that is TRUE under `contain`, not the crop one', () => {
    // ⚠ The shipped sentence — "Cropping it would cut a part of the picture the author
    // never saw" — is FALSE where nothing is cropped. Repeating it verbatim would hand
    // the operator a reason that does not apply to what they are looking at, which is a
    // way of losing the reason rather than keeping it.
    const contain = resolvePlateAspect({ ...MISMATCH, fitMode: 'contain' });
    if (!contain.ok) throw new Error('expected contain not to refuse');
    expect(contain.warning?.message).not.toMatch(/cropping/i);
    expect(contain.warning?.message).toMatch(/not fill the box/i);

    const cover = resolvePlateAspect({ ...MISMATCH, fitMode: 'cover' });
    if (cover.ok) throw new Error('expected cover to refuse');
    // …while `cover`'s wording is untouched.
    expect(cover.message).toMatch(/Cropping it would cut a part of the picture/);
  });

  it('`cover` still refuses, with the SAME code', () => {
    const out = resolvePlateAspect({ ...MISMATCH, fitMode: 'cover' });
    expect(out).toMatchObject({ ok: false, errorCode: LIVE_PLATE_ASPECT_MISMATCH });
  });

  it('🔴 the refusal is NOT deleted — the two modes genuinely differ on ONE input', () => {
    // The regression this pins is "somebody removed the refusal while making it
    // conditional". Both arms are asserted against the same input, so a `cover` path
    // that stopped refusing could not pass by agreeing with `contain`.
    const contain = resolvePlateAspect({ ...MISMATCH, fitMode: 'contain' });
    const cover = resolvePlateAspect({ ...MISMATCH, fitMode: 'cover' });
    expect(contain.ok).toBe(true);
    expect(cover.ok).toBe(false);
  });

  it('no disagreement ⇒ no warning in either mode', () => {
    for (const fitMode of BOTH) {
      const out = resolvePlateAspect({
        plateId: 'guest-1',
        source: source({ format: '1080i5000' }),
        expectedAspect: 16 / 9,
        fitMode,
      });
      expect(out, fitMode).toEqual({ ok: true, aspect: 16 / 9, assumed: false });
    }
  });
});

/**
 * ⭐ `C-028` — THE MODE CHAIN, which runs the OPPOSITE way round from the aspect chain.
 *
 * The aspect is a measurable property of the feed, so the installation outranks the
 * author (`D-147`). The mode is a presentation choice about that feed, so the OPERATOR —
 * who is looking at the picture on the day — outranks the author. Two chains, opposite
 * orders, and this block exists so nobody "aligns" them later.
 */
describe('C-028 — resolvePlateFitMode: override → element → contain', () => {
  it('the operator’s override wins over the author’s', () => {
    expect(resolvePlateFitMode('cover', 'contain').mode).toBe('cover');
    expect(resolvePlateFitMode('contain', 'cover').mode).toBe('contain');
  });

  it('the author’s value stands where the operator has not overridden', () => {
    expect(resolvePlateFitMode(undefined, 'cover').mode).toBe('cover');
    expect(resolvePlateFitMode(undefined, 'contain').mode).toBe('contain');
  });

  it('🔴 absent at BOTH levels is `contain` — the C-028 default, never `cover`', () => {
    // The default is pinned BY VALUE at the one function that decides it. A chain that
    // fell through to `cover` would keep today's picture on air while every other test
    // in this change still passed.
    expect(resolvePlateFitMode(undefined, undefined).mode).toBe('contain');
  });
});

/**
 * ⭐ `B-178` — **THE PROVENANCE, which is the half that makes the mode READABLE.**
 *
 * `contain` is both the shipped default and a legitimate authored choice, so the mode alone is
 * not evidence that anything the author said arrived. The owner had to infer "nothing authored
 * reached me" from two plates agreeing when they had been set differently. That inference is
 * what `from` turns into a readout.
 */
describe('B-178 — resolvePlateFitMode reports WHERE the answer came from', () => {
  it('🔴 "nobody said" is `default`, and is NOT the same answer as an authored `contain`', () => {
    // The distinction the whole item is about. Both produce the same picture; only one of them
    // means the author was heard.
    expect(resolvePlateFitMode(undefined, undefined)).toEqual({ mode: 'contain', from: 'default' });
    expect(resolvePlateFitMode(undefined, 'contain')).toEqual({
      mode: 'contain',
      from: 'authored',
    });
  });

  it('an authored `contain` and a defaulted one agree on MODE and differ on PROVENANCE', () => {
    const authored = resolvePlateFitMode(undefined, 'contain');
    const defaulted = resolvePlateFitMode(undefined, undefined);
    expect(authored.mode).toBe(defaulted.mode);
    expect(authored.from).not.toBe(defaulted.from);
  });

  it('an operator override reports `override`, whatever the author said', () => {
    expect(resolvePlateFitMode('cover', 'contain')).toEqual({ mode: 'cover', from: 'override' });
    expect(resolvePlateFitMode('contain', undefined)).toEqual({
      mode: 'contain',
      from: 'override',
    });
  });

  it('the author reports `authored` for BOTH modes, not only the non-default one', () => {
    expect(resolvePlateFitMode(undefined, 'cover').from).toBe('authored');
    expect(resolvePlateFitMode(undefined, 'contain').from).toBe('authored');
  });
});

describe('⭐ the D-147 decision — neither side states an aspect', () => {
  it('does NOT refuse: it assumes the hole’s own shape and says it assumed', () => {
    for (const fitMode of BOTH) {
      const out = resolvePlateAspect({
        plateId: 'guest-1',
        source: source({ format: 'AUTO' }),
        expectedAspect: undefined,
        fitMode,
      });
      // `C-028`'s not-in-scope list: no aspect means no fit and no refusal in EITHER
      // mode, and the picture fills the box exactly as today.
      expect(out, fitMode).toEqual({ ok: true, aspect: null, assumed: true });
    }
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
      fitMode: 'cover',
    });
    expect(auto.ok).toBe(true);
    // Same for a source that states no format at all — the ordinary state of a
    // catalog entry somebody added quickly during a live show.
    const bare = resolvePlateAspect({
      plateId: 'guest-1',
      source: source(),
      expectedAspect: undefined,
      fitMode: 'cover',
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
      fitMode: 'cover',
    });
    const knownCase = resolvePlateAspect({
      plateId: 'guest-1',
      source: source({ format: '720p5000' }),
      expectedAspect: undefined,
      fitMode: 'cover',
    });
    expect(assumedCase).toMatchObject({ assumed: true });
    expect(knownCase).toMatchObject({ assumed: false });
  });
});
