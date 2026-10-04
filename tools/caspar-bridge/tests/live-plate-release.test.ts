import { describe, expect, it } from 'vitest';
import type { SourceProducer } from '@cg/shared-ipc';
import { canHoldLivePlate, hiddenWhenHeld, releaseLivePlate } from '../src/live-plate-release.js';

/**
 * `multibox-layout-switch` §12.4 / `tasks.md` 6.5 — **the release policy as a pure
 * function, tested without a bridge.**
 *
 * The integration suite proves the reconcile ACTS on this; these prove the decision
 * itself, which is the part a future producer form would get wrong. Kept separate for the
 * same reason `live-plate-seating.test.ts` is: a total function deserves a test that needs
 * no socket, so the answer can be pinned line by line.
 *
 * `MEDIA-PLATES-01` — a clip now answers from its own `whenHidden`: `pause` and `continue` are
 * held, `restart` is torn down (what every clip did before the setting existed).
 */

const ROUTE: SourceProducer = { kind: 'route', channel: 2 };
const CLIP: SourceProducer = { kind: 'media', file: 'sting.mov' };
const DECK: SourceProducer = { kind: 'decklink', device: 1 };
const NDI: SourceProducer = { kind: 'ndi', source: 'STUDIO (Cam 1)' };
const STREAM: SourceProducer = { kind: 'stream', url: 'srt://10.0.0.20:9000' };

describe('canHoldLivePlate', () => {
  it('holds every CONTINUOUS live input — they carry no timeline to run out', () => {
    expect(canHoldLivePlate({ producer: ROUTE })).toBe(true);
    expect(canHoldLivePlate({ producer: DECK })).toBe(true);
    expect(canHoldLivePlate({ producer: NDI })).toBe(true);
    // C-025 — a stream is a continuous signal too: the picture on return is the
    // feed's NOW, which is what it would have been had the plate never left. That a
    // held stream can DROP meanwhile is B-086's axis and out of scope.
    expect(canHoldLivePlate({ producer: STREAM })).toBe(true);
  });

  it('🔴 a MEDIA clip answers from its own `whenHidden`: pause and continue hold, restart does not', () => {
    expect(canHoldLivePlate({ producer: CLIP, media: { whenHidden: 'pause' } })).toBe(true);
    expect(canHoldLivePlate({ producer: CLIP, media: { whenHidden: 'continue' } })).toBe(true);
    expect(canHoldLivePlate({ producer: CLIP, media: { whenHidden: 'restart' } })).toBe(false);
  });

  it('🔴 a clip with NO setting reads the default — `pause`, held — through the one reader', () => {
    // Every reference bound before the setting existed carries neither field.
    expect(canHoldLivePlate({ producer: CLIP })).toBe(true);
    expect(canHoldLivePlate({ producer: CLIP, media: {} })).toBe(true);
  });
});

describe('hiddenWhenHeld', () => {
  it('a Playout route and a CLIP are hidden when held; every other live input keeps today’s hold', () => {
    expect(hiddenWhenHeld({ origin: 'input', producer: '"route://9-12"' })).toBe(true);
    expect(hiddenWhenHeld({ producer: '"sting.mov"', transport: { loop: false } })).toBe(true);
    // Control: a hand-made route (no origin), a DeckLink and a clip-less record are not.
    expect(hiddenWhenHeld({ producer: '"route://2"' })).toBe(false);
    expect(hiddenWhenHeld({ producer: 'DECKLINK DEVICE 1' })).toBe(false);
    expect(hiddenWhenHeld({ origin: 'media', producer: '"sting.mov"' })).toBe(false);
  });
});

describe('releaseLivePlate', () => {
  it('the DEFAULT is held, and the sentence says why switching back is a cut', () => {
    const r = releaseLivePlate({
      itemId: 'item-1',
      plateId: 'live-2',
      source: { producer: ROUTE },
      stillDeclared: true,
    });
    expect(r.disposition).toBe('held');
    expect(r.reason).toContain('no rect in the active look');
  });

  it('🔴 `B-308` — EVERY sentence names the plate `Plate N`, and none carries its id', () => {
    // It NAMES the plate — a release an operator cannot attribute is one they cannot act on —
    // in the operator's words. The id is RELOCATED to the release's own `plateId`.
    const cases: readonly Parameters<typeof releaseLivePlate>[0][] = [
      { itemId: 'i', plateId: 'live-2', source: { producer: ROUTE }, stillDeclared: false },
      { itemId: 'i', plateId: 'live-2', source: undefined, stillDeclared: true },
      {
        itemId: 'i',
        plateId: 'live-2',
        source: { producer: CLIP, media: { whenHidden: 'restart' } },
        stillDeclared: true,
      },
      {
        itemId: 'i',
        plateId: 'live-2',
        source: { producer: ROUTE },
        stillDeclared: true,
        offFrame: true,
      },
      {
        itemId: 'i',
        plateId: 'live-2',
        source: { producer: CLIP, media: { whenHidden: 'pause' } },
        stillDeclared: true,
      },
      {
        itemId: 'i',
        plateId: 'live-2',
        source: { producer: CLIP, media: { whenHidden: 'continue' } },
        stillDeclared: true,
      },
      { itemId: 'i', plateId: 'live-2', source: { producer: ROUTE }, stillDeclared: true },
    ];
    const reasons = new Set<string>();
    for (const c of cases) {
      const r = releaseLivePlate({ ...c, plateLabel: 'Plate 2' });
      expect(r.reason).toMatch(/^Plate 2 /);
      expect(r.reason).not.toContain('live-2');
      expect(r.plateId).toBe('live-2');
      reasons.add(r.reason);
    }
    // Seven distinct sentences — every one of the function's branches was asked.
    expect(reasons.size).toBe(7);
    // A plate with no position (the template no longer declares it) is said in words.
    const undeclared = releaseLivePlate({ ...(cases[0] as (typeof cases)[number]) });
    expect(undeclared.reason).toMatch(/^This plate is no longer declared/);
  });

  it('a MEDIA clip set to `restart` falls back to teardown, and the fallback SAYS SO', () => {
    const r = releaseLivePlate({
      itemId: 'item-1',
      plateId: 'sting',
      source: { producer: CLIP, media: { whenHidden: 'restart' } },
      stillDeclared: true,
    });
    expect(r.disposition).toBe('torn-down');
    expect(r.reason).toContain('media clip set to restart when hidden');
    expect(r.reason).toContain('play from the beginning');
  });

  it('🔴 a MEDIA clip set to `pause` — the default — is HELD, and its sentence says it resumes', () => {
    for (const media of [{ whenHidden: 'pause' as const }, undefined]) {
      const r = releaseLivePlate({
        itemId: 'item-1',
        plateId: 'sting',
        source: { producer: CLIP, ...(media !== undefined && { media }) },
        stillDeclared: true,
      });
      expect(r.disposition).toBe('held');
      expect(r.reason).toContain('set to pause when hidden');
      expect(r.reason).toContain('resumes from the same frame');
    }
  });

  it('🔴 a MEDIA clip set to `continue` is HELD, and its sentence says it keeps playing', () => {
    const r = releaseLivePlate({
      itemId: 'item-1',
      plateId: 'sting',
      source: { producer: CLIP, media: { whenHidden: 'continue' } },
      stillDeclared: true,
    });
    expect(r.disposition).toBe('held');
    expect(r.reason).toContain('set to keep playing when hidden');
    // Control: the live-input sentence is not the clip's.
    expect(r.reason).not.toContain('no rect in the active look');
  });

  it('🔴 a plate the template NO LONGER DECLARES is torn down, whatever it could hold', () => {
    // The two axes are independent: this producer is perfectly holdable, and there is
    // still no look that could ever bring the plate back, so holding it would strand a
    // producer on a band layer that nothing will reclaim — it is not an orphan; it is ours.
    const r = releaseLivePlate({
      itemId: 'item-1',
      plateId: 'live-6',
      source: { producer: ROUTE },
      stillDeclared: false,
    });
    expect(r.disposition).toBe('torn-down');
    expect(r.reason).toContain('no longer declared');
  });

  it('🔴 an unresolvable producer that is STILL DECLARED is held, not destroyed', () => {
    /*
      CHANGED DELIBERATELY (session BC review). This asserted 'torn-down'.

      Holdability is a property of the producer FORM, and an unresolvable assignment leaves
      that unknown. Reading "unknown" as "tear it down" destroys a working picture over a
      MISSING FACT — and the fact is routinely missing for a healthy reason: a live switch or
      swap resolves only the plates going on screen, so a held plate is normally absent from
      the resolution. The two axes are independent, and `stillDeclared` is the one that
      answers "can any look bring this back".
    */
    const r = releaseLivePlate({
      itemId: 'item-1',
      plateId: 'live-6',
      source: undefined,
      stillDeclared: true,
    });
    expect(r.disposition).toBe('held');
    expect(r.reason).toContain('could not be resolved');
  });

  it('OFF-FRAME is still HELD, but gets its own sentence — the row moved, not the look', () => {
    const r = releaseLivePlate({
      itemId: 'item-1',
      plateId: 'live-1',
      source: { producer: ROUTE },
      stillDeclared: true,
      offFrame: true,
    });
    expect(r.disposition).toBe('held');
    // An operator told "this look does not show it" would go looking in the wrong place.
    expect(r.reason).toContain('outside the frame');
    expect(r.reason).not.toContain('no rect in the active look');
  });
});
