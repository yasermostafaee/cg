import { describe, expect, it } from 'vitest';
import {
  ArrangementTransitionSchema,
  ArrangementsSchema,
  arrangementCount,
  defaultArrangementForCount,
  liveSourcesInStampedScopes,
  resolveVisibility,
  type Arrangement,
  type Element,
  type Scene,
} from '../src/index.js';

/**
 * `multibox-layout-switch` `tasks.md` 5.1 / 5.4 / 5.5 and 4.1 / 4.5 / 4.6 — the SCHEMA half
 * of stage C.
 */

const box = (x: number, y: number, w: number, h: number) => ({
  position: { x, y },
  size: { w, h },
  scale: { x: 1, y: 1 },
  rotation: 0,
  anchor: { x: 0, y: 0 },
});
const baseProps = { opacity: 1, visible: true, locked: false };

function el(type: string, id: string, t = box(0, 0, 100, 100), over = {}): Element {
  return {
    ...baseProps,
    id,
    name: id,
    type,
    transform: t,
    zIndex: 0,
    ...over,
  } as unknown as Element;
}
const plate = (id: string, t = box(200, 150, 640, 360), over = {}): Element =>
  el('video-placeholder', id, t, { routeKey: id, zIndex: 10, ...over });

function sceneWith(children: Element[], over: Partial<Scene> = {}): Scene {
  return {
    schemaVersion: 1,
    id: 's',
    name: 's',
    templateType: 'custom',
    resolution: { width: 1920, height: 1080 },
    frameRate: 50,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 50 },
    editorBackdrop: 'transparent',
    layers: [
      { id: 'L1', name: 'main', visible: true, locked: false, blendMode: 'normal', children },
    ],
    fonts: [],
    fields: [],
    bindings: [],
    ...over,
  } as unknown as Scene;
}

// ── 4.1 / D4 — the ONE resolved-visibility function ─────────────────────────

describe('4.1 — resolveVisibility: three inputs, and a PRECEDENCE rather than an AND', () => {
  const shown = { hideDuringTransition: false, active: false };

  it('with nothing else to say, the authored value stands (and so nothing pre-arrangement changes)', () => {
    expect(resolveVisibility({ authored: true, arrangement: undefined, transition: shown })).toBe(
      true,
    );
    expect(resolveVisibility({ authored: false, arrangement: undefined, transition: shown })).toBe(
      false,
    );
  });

  it('🔴 the arrangement OVERRIDES the authored value in BOTH directions', () => {
    // Not a conjunction: an arrangement that says "this backdrop belongs to me" must be able
    // to SHOW an element the scene authored hidden, or a per-arrangement background costs the
    // author one hide in every other arrangement and the first one missed puts two on air.
    expect(resolveVisibility({ authored: false, arrangement: true, transition: shown })).toBe(true);
    expect(resolveVisibility({ authored: true, arrangement: false, transition: shown })).toBe(
      false,
    );
  });

  it('`undefined` is NOT `false` — an arrangement with no opinion does not get a vote', () => {
    expect(resolveVisibility({ authored: true, arrangement: undefined, transition: shown })).toBe(
      true,
    );
  });

  it('🔴 the transition veto beats everything, and only while a transition is running', () => {
    const flagged = { hideDuringTransition: true, active: true };
    expect(resolveVisibility({ authored: true, arrangement: true, transition: flagged })).toBe(
      false,
    );
    // …and the same element is visible again the moment the transition ends.
    expect(
      resolveVisibility({
        authored: true,
        arrangement: true,
        transition: { hideDuringTransition: true, active: false },
      }),
    ).toBe(true);
  });

  it('an element WITHOUT the flag is untouched by a running transition (the logo case)', () => {
    expect(
      resolveVisibility({
        authored: true,
        arrangement: undefined,
        transition: { hideDuringTransition: false, active: true },
      }),
    ).toBe(true);
  });
});

/*
 * 🔴 **`single-clock-look-switch` — 4.5 Q1's block is GONE, and the FACT it tested is not.**
 *
 * It asked whether an invisible ANCESTOR suppresses a plate's punch — a hidden layer, a hidden
 * container, an arrangement that hides a box. The punch no longer exists, but the underlying
 * rule (a plate nothing can see is not on screen) still governs what the bridge SEATS, and
 * that is where it is now tested: `resolveVisibilityOf` is pinned directly in the 4.1 block
 * above, and `@cg/vcg-format`'s `hidden-look-suppression` covers the carrier's half.
 */

// ── 5.1 / 5.4 — the arrangement schema ──────────────────────────────────────

const cell = (x: number) => ({ x, y: 0, width: 960, height: 540 });
const arrangement = (over: Partial<Arrangement> = {}): unknown => ({
  id: 'a1',
  name: 'two-box',
  cells: [cell(0), cell(960)],
  isDefault: true,
  transition: { mode: 'cut' },
  ...over,
});

describe('5.1 — the arrangement, and the count it does NOT store', () => {
  it('the count is derived from the cells, so the two cannot disagree', () => {
    expect(arrangementCount({ cells: [cell(0), cell(960)] })).toBe(2);
    expect(arrangementCount({ cells: [] })).toBe(0);
  });

  it('🔴 the EMPTY arrangement is valid — count 0 is the background alone, not a special case', () => {
    const parsed = ArrangementsSchema.safeParse([arrangement({ cells: [] })]);
    expect(parsed.success).toBe(true);
  });

  it('exactly one default per count is required — none is refused', () => {
    const parsed = ArrangementsSchema.safeParse([arrangement({ isDefault: false })]);
    expect(parsed.success).toBe(false);
    expect(JSON.stringify(parsed.error?.issues)).toContain('no default arrangement');
  });

  it('…and TWO defaults for one count is refused, because array order would decide it', () => {
    const parsed = ArrangementsSchema.safeParse([
      arrangement({ id: 'a1', name: 'wide' }),
      arrangement({ id: 'a2', name: 'tall' }),
    ]);
    expect(parsed.success).toBe(false);
    expect(JSON.stringify(parsed.error?.issues)).toContain('2 default arrangements');
  });

  it('two counts, each with its own default, is fine', () => {
    const parsed = ArrangementsSchema.safeParse([
      arrangement({ id: 'a1', name: 'two', cells: [cell(0), cell(960)] }),
      arrangement({ id: 'a2', name: 'one', cells: [cell(480)] }),
    ]);
    expect(parsed.success).toBe(true);
  });

  it('a count with NO arrangement is a legitimate authoring choice, not an error', () => {
    const list = [arrangement()] as unknown as Arrangement[];
    expect(defaultArrangementForCount(list, 2)?.name).toBe('two-box');
    expect(defaultArrangementForCount(list, 3)).toBeNull();
  });
});

describe('5.4 — the transition union makes the two measured rules unrepresentable', () => {
  it('a CUT carries no duration and no easing — a stale one is NORMALISED AWAY, not refused', () => {
    expect(ArrangementTransitionSchema.safeParse({ mode: 'cut' }).success).toBe(true);
    // Measured, and it is the wanted behaviour rather than a gap: an author switching
    // move→cut can leave a stale `durationMs` in the file, and refusing the whole template
    // over a field nothing reads would take a working graphic off air to correct nothing.
    // What matters is that it cannot REACH the runtime, and it does not.
    const parsed = ArrangementTransitionSchema.safeParse({ mode: 'cut', durationMs: 400 });
    expect(parsed.success).toBe(true);
    expect(parsed.data).toEqual({ mode: 'cut' });
  });

  it('🔴 a MOVE cannot be authored with anything but `linear` (§12.2, 0.0 px vs 4–10 px)', () => {
    expect(
      ArrangementTransitionSchema.safeParse({ mode: 'move', durationMs: 400, easing: 'linear' })
        .success,
    ).toBe(true);
    expect(
      ArrangementTransitionSchema.safeParse({ mode: 'move', durationMs: 400, easing: 'ease-in' })
        .success,
    ).toBe(false);
  });

  it('a FADE may use any easing — §13.5a took it off the server side entirely', () => {
    expect(
      ArrangementTransitionSchema.safeParse({
        mode: 'fade',
        durationMs: 400,
        easing: 'ease-in-out',
      }).success,
    ).toBe(true);
  });

  it('🔴 an OMITTED timing function cannot be expressed — the default `ease` measured 580–835 px out', () => {
    expect(ArrangementTransitionSchema.safeParse({ mode: 'fade', durationMs: 400 }).success).toBe(
      false,
    );
    expect(ArrangementTransitionSchema.safeParse({ mode: 'move', durationMs: 400 }).success).toBe(
      false,
    );
  });

  it('a 0 ms fade is refused, so a cut has exactly ONE spelling', () => {
    expect(
      ArrangementTransitionSchema.safeParse({ mode: 'fade', durationMs: 0, easing: 'linear' })
        .success,
    ).toBe(false);
  });
});

// ── 4.6 — a plate inside a STAMPED scope ────────────────────────────────────

describe('4.6 — a Live Source plate inside a stamped scope is detected', () => {
  const boxComp = {
    id: 'comp-box',
    name: 'box',
    resolution: { width: 960, height: 540 },
    frameRange: { in: 0, out: 50 },
    editorBackdrop: 'transparent',
    layers: [
      {
        id: 'cl',
        name: 'l',
        visible: true,
        locked: false,
        blendMode: 'normal',
        children: [plate('guest-1')],
      },
    ],
    fields: [],
    bindings: [],
  };

  it('POSITIVE CONTROL — an ordinary nested composition is NOT flagged', () => {
    const scene = sceneWith(
      [el('composition', 'inst-1', box(0, 0, 960, 540), { compositionId: 'comp-box' })],
      {
        compositions: [boxComp],
      } as unknown as Partial<Scene>,
    );
    expect(liveSourcesInStampedScopes(scene)).toEqual([]);
  });

  it('🔴 a plate inside a `sequence` composition item is flagged', () => {
    const sequence = el('sequence', 'seq-1', box(0, 0, 960, 540), {
      items: [{ kind: 'composition', id: 'i1', compositionId: 'comp-box' }],
    });
    const scene = sceneWith([sequence], { compositions: [boxComp] } as unknown as Partial<Scene>);
    const found = liveSourcesInStampedScopes(scene);
    expect(found).toHaveLength(1);
    expect(found[0]?.scope).toBe('sequence');
    expect(found[0]?.element.id).toBe('guest-1');
    expect(found[0]?.scopeElementId).toBe('seq-1');
  });

  it('🔴 a plate inside a `repeater` is flagged', () => {
    const repeater = el('repeater', 'rep-1', box(0, 0, 960, 540), {
      compositionId: 'comp-box',
      items: [],
    });
    const scene = sceneWith([repeater], { compositions: [boxComp] } as unknown as Partial<Scene>);
    const found = liveSourcesInStampedScopes(scene);
    expect(found).toHaveLength(1);
    expect(found[0]?.scope).toBe('repeater');
  });

  // ⚠ `single-clock-look-switch` — the "AND punches nothing" half of this pair went with the
  // punch. The half that matters is the one above: a stamped plate DECLARES nothing, so the
  // bridge seats nothing for it, which is what makes the template broken rather than merely
  // unmasked.
});
