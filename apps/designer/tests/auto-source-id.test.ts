import { describe, expect, it } from 'vitest';
import type { Element, Scene } from '@cg/shared-schema';
import { nextAutoSourceId } from '../src/renderer/state/auto-source-id.js';
import { liveSourceIssues } from '../src/renderer/state/live-source-preflight.js';
import { editSceneOf } from '../src/renderer/state/scene-doc.js';

/**
 * 🔴 `B-187` (owner, 2026-10-14, Q2 (c)) — the automatic name a drawn plate gets: the next free
 * `live-N` IN ITS LOOK. "Free" is judged where one source is one seat, so the name can never trip
 * `look-source-duplicate` or `live-source-repeated` — pinned below by running the real preflight.
 */

const baseElProps = { opacity: 1, visible: true, locked: false, zIndex: 0 };
const tf = (x: number, y: number, w = 640, h = 360) => ({
  position: { x, y },
  size: { w, h },
  scale: { x: 1, y: 1 },
  rotation: 0,
  anchor: { x: 0, y: 0 },
});

const plate = (id: string, routeKey: string | undefined, x = 0, y = 0): Element =>
  ({
    ...baseElProps,
    id,
    name: id,
    type: 'video-placeholder',
    transform: tf(x, y),
    ...(routeKey !== undefined ? { routeKey } : {}),
  }) as unknown as Element;

const instance = (id: string, compositionId: string): Element =>
  ({
    ...baseElProps,
    id,
    name: id,
    type: 'composition',
    compositionId,
    transform: tf(0, 0, 1920, 1080),
  }) as unknown as Element;

const comp = (id: string, children: Element[], extra: Record<string, unknown> = {}) => ({
  id,
  name: id,
  resolution: { width: 1920, height: 1080 },
  frameRange: { in: 0, out: 50 },
  editorBackdrop: 'transparent',
  layers: [
    { id: `${id}-l`, name: 'l', visible: true, locked: false, blendMode: 'normal', children },
  ],
  fields: [],
  bindings: [],
  ...extra,
});

function project(compositions: unknown[]): Scene {
  return {
    schemaVersion: 1,
    id: 'p',
    name: 'p',
    templateType: 'custom',
    resolution: { width: 1920, height: 1080 },
    frameRate: 50,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 50 },
    editorBackdrop: 'transparent',
    layers: [],
    compositions,
    fonts: [],
    fields: [],
    bindings: [],
  } as unknown as Scene;
}

describe('B-187 — no look in scope: the next free live-N in the whole project', () => {
  it('an empty template starts at live-1', () => {
    expect(nextAutoSourceId(project([comp('main', [])]), 'main')).toBe('live-1');
  });

  it('takes the first GAP — live-1 and live-3 in use ⇒ live-2', () => {
    const s = project([comp('main', [plate('a', 'live-1'), plate('b', 'live-3', 700)])]);
    expect(nextAutoSourceId(s, 'main')).toBe('live-2');
  });

  it('a plate in ANOTHER composition counts — every plate may be on air with this one', () => {
    const s = project([
      comp('main', [instance('box', 'boxc')]),
      comp('boxc', [plate('a', 'live-1')]),
    ]);
    expect(nextAutoSourceId(s, 'main')).toBe('live-2');
  });

  it('author ids and unassigned plates take nothing from the sequence', () => {
    const s = project([comp('main', [plate('a', 'guest-1'), plate('b', undefined, 700)])]);
    expect(nextAutoSourceId(s, 'main')).toBe('live-1');
  });
});

describe('B-187 — inside a LOOK: free in THAT look (the owner’s l1 / l1,l2 / l1,l2,l3)', () => {
  // Main holds a root plate `presenter` (on screen in every look) and two looks: A (2 plates)
  // and B (1 plate). The looks' own compositions are where the author draws.
  const looks = (aKeys: string[], bKeys: string[], rootKey = 'presenter') =>
    project([
      comp(
        'main',
        [
          instance('inst-a', 'look-a-c'),
          instance('inst-b', 'look-b-c'),
          plate('root', rootKey, 0, 720),
        ],
        {
          lookGroups: [
            {
              id: 'g1',
              looks: [
                { id: 'look-a', name: 'A', instanceId: 'inst-a', entered: { mode: 'cut' } },
                { id: 'look-b', name: 'B', instanceId: 'inst-b', entered: { mode: 'cut' } },
              ],
              defaultLookId: 'look-a',
            },
          ],
        },
      ),
      comp(
        'look-a-c',
        aKeys.map((k, i) => plate(`a${String(i)}`, k, i * 700)),
      ),
      comp(
        'look-b-c',
        bKeys.map((k, i) => plate(`b${String(i)}`, k, i * 700)),
      ),
    ]);

  it('🔴 a plate drawn in look B reuses a name look A holds — different looks never share a seat', () => {
    expect(nextAutoSourceId(looks(['live-1', 'live-2'], ['live-1']), 'look-b-c')).toBe('live-2');
  });

  it('a plate drawn in look A takes the next after ITS OWN', () => {
    expect(nextAutoSourceId(looks(['live-1', 'live-2'], ['live-1']), 'look-a-c')).toBe('live-3');
  });

  it('a ROOT plate is in every look, so its key is never handed out inside one', () => {
    expect(nextAutoSourceId(looks([], [], 'live-1'), 'look-b-c')).toBe('live-2');
  });

  it('drawing in the group’s own root counts every look — that plate shows with all of them', () => {
    expect(nextAutoSourceId(looks(['live-1', 'live-2'], ['live-1']), 'main')).toBe('live-3');
  });

  it('🔴 the generated name trips no one-seat refusal — the real preflight agrees', () => {
    const s = looks(['live-1', 'live-2'], ['live-1']);
    const key = nextAutoSourceId(s, 'look-b-c');
    const lookB = s.compositions?.find((c) => c.id === 'look-b-c');
    lookB?.layers[0]?.children.push(plate('b-new', key, 0, 400));
    const view = editSceneOf(s, 'main');
    if (view === null) throw new Error('main projects');
    const codes = liveSourceIssues(view).map((i) => i.code);
    expect(codes).not.toContain('look-source-duplicate');
    expect(codes).not.toContain('live-source-repeated');
  });
});
