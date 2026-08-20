import { describe, expect, it } from 'vitest';
import type { SourceProducer } from '@cg/shared-ipc';
import { canHoldLivePlate, releaseLivePlate } from '../src/live-plate-release.js';

/**
 * `multibox-layout-switch` §12.4 / `tasks.md` 6.5 — **the release policy as a pure
 * function, tested without a bridge.**
 *
 * The integration suite proves the reconcile ACTS on this; these prove the decision
 * itself, which is the part a future producer form would get wrong. Kept separate for the
 * same reason `live-plate-seating.test.ts` is: a total function deserves a test that needs
 * no socket, so the answer can be pinned line by line.
 */

const ROUTE: SourceProducer = { kind: 'route', channel: 2 };
const CLIP: SourceProducer = { kind: 'media', file: 'sting.mov' };
const DECK: SourceProducer = { kind: 'decklink', device: 1 };
const NDI: SourceProducer = { kind: 'ndi', source: 'STUDIO (Cam 1)' };

describe('canHoldLivePlate', () => {
  it('holds every CONTINUOUS live input — they carry no timeline to run out', () => {
    expect(canHoldLivePlate(ROUTE)).toBe(true);
    expect(canHoldLivePlate(DECK)).toBe(true);
    expect(canHoldLivePlate(NDI)).toBe(true);
  });

  it('🔴 refuses to hold a MEDIA clip — held, it runs to its end and comes back black', () => {
    expect(canHoldLivePlate(CLIP)).toBe(false);
  });
});

describe('releaseLivePlate', () => {
  it('the DEFAULT is held, and the sentence says why switching back is a cut', () => {
    const r = releaseLivePlate({
      itemId: 'item-1',
      plateId: 'live-2',
      producer: ROUTE,
      stillDeclared: true,
    });
    expect(r.disposition).toBe('held');
    expect(r.reason).toContain('no rect in the active look');
    // It NAMES the plate. A release an operator cannot attribute is a release they cannot act on.
    expect(r.reason).toContain('live-2');
  });

  it('a MEDIA clip falls back to teardown, and the fallback SAYS SO', () => {
    const r = releaseLivePlate({
      itemId: 'item-1',
      plateId: 'sting',
      producer: CLIP,
      stillDeclared: true,
    });
    expect(r.disposition).toBe('torn-down');
    expect(r.reason).toContain('media clip');
  });

  it('🔴 a plate the template NO LONGER DECLARES is torn down, whatever it could hold', () => {
    // The two axes are independent: this producer is perfectly holdable, and there is
    // still no look that could ever bring the plate back, so holding it would strand a
    // producer on a band layer that nothing will reclaim — it is not an orphan; it is ours.
    const r = releaseLivePlate({
      itemId: 'item-1',
      plateId: 'live-6',
      producer: ROUTE,
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
      producer: undefined,
      stillDeclared: true,
    });
    expect(r.disposition).toBe('held');
    expect(r.reason).toContain('could not be resolved');
  });

  it('OFF-FRAME is still HELD, but gets its own sentence — the row moved, not the look', () => {
    const r = releaseLivePlate({
      itemId: 'item-1',
      plateId: 'live-1',
      producer: ROUTE,
      stillDeclared: true,
      offFrame: true,
    });
    expect(r.disposition).toBe('held');
    // An operator told "this look does not show it" would go looking in the wrong place.
    expect(r.reason).toContain('outside the frame');
    expect(r.reason).not.toContain('no rect in the active look');
  });
});
