import { describe, expect, it } from 'vitest';
import type { Element, Scene } from '@cg/shared-schema';
import {
  contentHoldElementsOf,
  hasContentElement,
} from '../src/renderer/features/inspector/PlayoutSection.js';

/**
 * D-128 — the Playout panel's "Which content closes the graphic?" enumeration MUST
 * include a `video`/`lottie` whose `drivesHold` is on. The owner's bug: a video with
 * `drivesHold: Yes` was ABSENT from the closer list and from the "every driver
 * repeats forever" warning, which was therefore computed from a driver set that
 * excluded the video. Media `drivesHold` is OPT-IN (`=== true`), the INVERSE of a
 * ticker/sequence, and a `loop` hold is the infinite (never-completes) case.
 */

const T = {
  transform: {
    position: { x: 0, y: 0 },
    size: { w: 10, h: 10 },
    scale: { x: 1, y: 1 },
    rotation: 0,
    anchor: { x: 0, y: 0 },
  },
  opacity: 1,
  visible: true,
  locked: false,
  zIndex: 0,
} as const;

function video(
  id: string,
  o: { drivesHold?: boolean; holdBehavior?: 'loop' | 'freeze'; visible?: boolean } = {},
): Element {
  return {
    ...T,
    id,
    name: id,
    type: 'video',
    visible: o.visible ?? true,
    holdBehavior: o.holdBehavior ?? 'loop',
    ...(o.drivesHold !== undefined ? { drivesHold: o.drivesHold } : {}),
  } as unknown as Element;
}
function lottie(
  id: string,
  // A Lottie's never-completing hold is `idle-loop` (the schema enum is
  // `['freeze','idle-loop']` — `loop` is the VIDEO spelling; an earlier fixture here used
  // it and only matched the coarse pre-follow predicate by accident).
  o: { drivesHold?: boolean; holdBehavior?: 'idle-loop' | 'freeze' } = {},
): Element {
  return {
    ...T,
    id,
    name: id,
    type: 'lottie',
    holdBehavior: o.holdBehavior ?? 'freeze',
    // The runtime loops only a NON-EMPTY idle span — give an idle-loop fixture a real one.
    ...(o.holdBehavior === 'idle-loop'
      ? { phases: { introEnd: 10, outroStart: 40, idle: [10, 30], source: 'manual' } }
      : {}),
    ...(o.drivesHold !== undefined ? { drivesHold: o.drivesHold } : {}),
  } as unknown as Element;
}
function ticker(id: string, o: { repeat?: 'once' | 'infinite' } = {}): Element {
  return {
    ...T,
    id,
    name: id,
    type: 'ticker',
    repeat: o.repeat ?? 'infinite',
  } as unknown as Element;
}

function scene(children: Element[]): Scene {
  return {
    layers: [{ id: 'pl', name: 'main', visible: true, locked: false, children }],
    compositions: [],
  } as unknown as Scene;
}

describe('D-128 — media joins the content-driven hold closer list', () => {
  it('lists a drivesHold FREEZE video as a FINITE closer (opt-in reading, not !== false)', () => {
    const items = contentHoldElementsOf(
      scene([video('v', { drivesHold: true, holdBehavior: 'freeze' })]),
    );
    expect(items).toEqual([
      { id: 'v', name: 'v', type: 'video', drivesHold: true, infinite: false },
    ]);
  });

  it('lists a drivesHold LOOP video as an INFINITE (never-completes) driver', () => {
    const items = contentHoldElementsOf(
      scene([video('v', { drivesHold: true, holdBehavior: 'loop' })]),
    );
    expect(items[0]).toMatchObject({ type: 'video', drivesHold: true, infinite: true });
  });

  it('a video with drivesHold ABSENT/false is listed but NOT driving (opt-in default)', () => {
    for (const el of [video('a'), video('b', { drivesHold: false })]) {
      const [item] = contentHoldElementsOf(scene([el]));
      expect(item?.drivesHold).toBe(false); // === true, never !== false
    }
  });

  it('lists a drivesHold lottie too (media parity)', () => {
    const items = contentHoldElementsOf(
      scene([lottie('l', { drivesHold: true, holdBehavior: 'idle-loop' })]),
    );
    expect(items[0]).toMatchObject({ type: 'lottie', drivesHold: true, infinite: true });
  });

  it('a HIDDEN drivesHold video is inert (B-034) — never listed', () => {
    expect(
      contentHoldElementsOf(scene([video('v', { drivesHold: true, visible: false })])),
    ).toEqual([]);
  });

  it("THE OWNER'S CASE: infinite ticker + freeze video (drivesHold) ⇒ BOTH listed, not JUST the ticker", () => {
    const items = contentHoldElementsOf(
      scene([
        ticker('crawl', { repeat: 'infinite' }),
        video('v', { drivesHold: true, holdBehavior: 'freeze' }),
      ]),
    );
    expect(items.map((i) => i.id)).toEqual(['crawl', 'v']);
    const drivers = items.filter((i) => i.drivesHold);
    // both drive; the ticker is infinite, the video is finite ⇒ NOT all-infinite,
    // so the "every driver repeats forever" alert must NOT fire (it wrongly did when
    // the video was absent and the ticker was the sole listed driver).
    expect(drivers).toHaveLength(2);
    expect(drivers.every((d) => d.infinite)).toBe(false);
    // excluding the ticker leaves the finite video as the sole closer
    const afterExclude = drivers.filter((d) => d.id !== 'crawl');
    expect(afterExclude).toEqual([
      { id: 'v', name: 'v', type: 'video', drivesHold: true, infinite: false },
    ]);
  });
});

describe('D-128 — hasContentElement offers content-driven hold for opted-in media', () => {
  it('a lone drivesHold:true video makes content-driven available', () => {
    expect(hasContentElement(scene([video('v', { drivesHold: true })]))).toBe(true);
  });
  it('a lone video that is NOT opted in does not (nothing would drive the hold)', () => {
    expect(hasContentElement(scene([video('v')]))).toBe(false);
    expect(hasContentElement(scene([video('v', { drivesHold: false })]))).toBe(false);
  });
  it('a ticker still offers it regardless (unchanged)', () => {
    expect(hasContentElement(scene([ticker('t')]))).toBe(true);
  });
});
