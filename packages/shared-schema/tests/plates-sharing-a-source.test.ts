import { describe, expect, it } from 'vitest';
import { platesSharingASource, type Element, type Scene } from '../src/index.js';

/**
 * 🔴 `B-148` — the predicate the export refusal reads: every source id that more than one
 * RENDERED plate names. Copies, not authored elements, are what the carrier declares.
 */

const box = (x: number, y: number, w: number, h: number) => ({
  position: { x, y },
  size: { w, h },
  scale: { x: 1, y: 1 },
  rotation: 0,
  anchor: { x: 0, y: 0 },
});
const baseProps = { opacity: 1, visible: true, locked: false, zIndex: 0 };

const plate = (id: string, routeKey: string | undefined, x = 0, y = 0): Element =>
  ({
    ...baseProps,
    id,
    name: id,
    type: 'video-placeholder',
    transform: box(x, y, 640, 360),
    ...(routeKey !== undefined ? { routeKey } : {}),
  }) as unknown as Element;

const instance = (id: string, compositionId: string, x: number): Element =>
  ({
    ...baseProps,
    id,
    name: id,
    type: 'composition',
    compositionId,
    transform: box(x, 0, 960, 540),
  }) as unknown as Element;

const composition = (id: string, children: Element[]) => ({
  id,
  name: id,
  resolution: { width: 960, height: 540 },
  frameRange: { in: 0, out: 50 },
  editorBackdrop: 'transparent',
  layers: [
    { id: `${id}-l`, name: 'l', visible: true, locked: false, blendMode: 'normal', children },
  ],
  fields: [],
  bindings: [],
});

function sceneWith(children: Element[], compositions: unknown[] = []): Scene {
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
    compositions,
    fonts: [],
    fields: [],
    bindings: [],
  } as unknown as Scene;
}

describe('B-148 — platesSharingASource', () => {
  it('🔴 one box composition instanced TWICE is one authored plate and TWO copies on one source', () => {
    const s = sceneWith(
      [instance('box-left', 'guest-box', 0), instance('box-right', 'guest-box', 960)],
      [composition('guest-box', [plate('plate', 'guest-1')])],
    );
    const shared = platesSharingASource(s);
    expect(shared.map((g) => g.sourceId)).toEqual(['guest-1']);
    // Two copies of ONE authored element — the keys tell them apart, the element id does not.
    expect(shared[0]?.plates.map((p) => p.element.id)).toEqual(['plate', 'plate']);
    expect(shared[0]?.plates.map((p) => p.key)).toEqual(['box-left/plate', 'box-right/plate']);
  });

  it('two separate plates on one source are the same collision through the other door', () => {
    const s = sceneWith([plate('p-1', 'guest-1', 0), plate('p-2', 'guest-1', 960)]);
    expect(platesSharingASource(s).map((g) => g.plates.map((p) => p.key))).toEqual([
      ['p-1', 'p-2'],
    ]);
  });

  it('ONE instance of a box composition shares nothing', () => {
    const s = sceneWith(
      [instance('box-left', 'guest-box', 0)],
      [composition('guest-box', [plate('plate', 'guest-1')])],
    );
    expect(platesSharingASource(s)).toEqual([]);
  });

  it('two DIFFERENT compositions, each with its own source, share nothing — the right shape', () => {
    const s = sceneWith(
      [instance('box-left', 'box-a', 0), instance('box-right', 'box-b', 960)],
      [
        composition('box-a', [plate('plate-a', 'guest-1')]),
        composition('box-b', [plate('plate-b', 'guest-2')]),
      ],
    );
    expect(platesSharingASource(s)).toEqual([]);
  });

  it('plates with no source are not grouped (`live-source-unset` refuses each by name)', () => {
    const s = sceneWith([plate('p-1', undefined, 0), plate('p-2', undefined, 960)]);
    expect(platesSharingASource(s)).toEqual([]);
  });
});
