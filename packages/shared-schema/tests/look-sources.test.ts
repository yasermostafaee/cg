import { describe, expect, it } from 'vitest';
import type { Element, Scene } from '../src/index.js';
import { deriveLookSources } from '../src/look-sources.js';

/**
 * 🔴 **`B-188` — the multi-frame group's source list, DERIVED from the plates.**
 *
 * The group used to declare its sources and the preflight refused any plate referencing
 * something else. The declaration stored what the plates already carried; this function is what
 * replaced it, and these tests pin the two things a derivation has to get right: the SET, and
 * the ORDER (condition (b) — stable under append, not under deletion).
 *
 * ⚠ **Every fixture writes the RETIRED `sources` array anyway**, because that is what a scene
 * stored before this change looks like on disk. A fixture without it cannot tell "derived" from
 * "read a declaration that happens to agree".
 */

const baseElProps = { opacity: 1, visible: true, locked: false, zIndex: 0 };

const tf = (x: number, y: number) => ({
  position: { x, y },
  size: { w: 640, h: 360 },
  scale: { x: 1, y: 1 },
  rotation: 0,
  anchor: { x: 0, y: 0 },
});

/** A plate. `routeKey: null` means UNASSIGNED — the `B-183` state, which contributes nothing. */
const plate = (id: string, routeKey: string | null, x = 0, y = 0): Element =>
  ({
    ...baseElProps,
    id,
    name: id,
    type: 'video-placeholder',
    transform: tf(x, y),
    ...(routeKey === null ? {} : { routeKey }),
  }) as unknown as Element;

const instance = (id: string, compId: string): Element =>
  ({
    ...baseElProps,
    id,
    name: id,
    type: 'composition',
    compositionId: compId,
    transform: { ...tf(0, 0), size: { w: 1920, h: 1080 } },
  }) as unknown as Element;

const comp = (id: string, children: Element[]) => ({
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
});

function scene(
  rootChildren: Element[],
  compositions: unknown[] = [],
  staleSources?: unknown[],
): Scene {
  return {
    schemaVersion: 1,
    id: 'scene-1',
    name: 's',
    templateType: 'custom',
    resolution: { width: 1920, height: 1080 },
    frameRate: 50,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 50 },
    editorBackdrop: 'transparent',
    layers: [
      {
        id: 'L1',
        name: 'main',
        visible: true,
        locked: false,
        blendMode: 'normal',
        children: rootChildren,
      },
    ],
    compositions,
    fonts: [],
    fields: [],
    bindings: [],
    ...(staleSources === undefined
      ? {}
      : { lookGroups: [{ id: 'g1', sources: staleSources, looks: [] }] }),
  } as unknown as Scene;
}

describe('deriveLookSources — the SET', () => {
  it('the distinct routeKeys the plates carry, deduped', () => {
    const s = scene([plate('p1', 'l1'), plate('p2', 'l2'), plate('p3', 'l1')]);
    expect(deriveLookSources(s)).toEqual(['l1', 'l2']);
  });

  it('🔴 an UNASSIGNED plate contributes NOTHING — it has no key to contribute (`B-183`)', () => {
    const s = scene([plate('p1', 'l1'), plate('p2', null), plate('p3', 'l2')]);
    expect(deriveLookSources(s)).toEqual(['l1', 'l2']);
  });

  it('non-plate elements contribute nothing', () => {
    const s = scene([
      {
        ...baseElProps,
        id: 't1',
        name: 't1',
        type: 'text',
        transform: tf(0, 0),
      } as unknown as Element,
      plate('p1', 'l1'),
    ]);
    expect(deriveLookSources(s)).toEqual(['l1']);
  });

  it('reaches EVERY document — a look’s plates live in the look’s own composition', () => {
    const s = scene(
      [instance('inst-a', 'comp-a'), instance('inst-b', 'comp-b')],
      [comp('comp-a', [plate('a1', 'l1')]), comp('comp-b', [plate('b1', 'l2'), plate('b2', 'l1')])],
    );
    expect(deriveLookSources(s)).toEqual(['l1', 'l2']);
  });

  it('a plate inside a CONTAINER is reached', () => {
    const s = scene([
      {
        ...baseElProps,
        id: 'c1',
        name: 'c1',
        type: 'container',
        transform: tf(0, 0),
        children: [plate('p1', 'l1')],
      } as unknown as Element,
    ]);
    expect(deriveLookSources(s)).toEqual(['l1']);
  });

  /**
   * 🔴 **EVERY DOCUMENT, not only the instanced ones — and this is deliberate.**
   *
   * The Designer must answer this from whichever document is open: drill into a look and the
   * edit projection roots at that look's composition, so an instance-following walk would hide
   * every sister look's sources exactly when the author reached for one.
   *
   * ⚠ It cannot leak into the export: `collectLookCarrier` drops any key with no rect in any
   * look, and an uninstanced composition's plate has no rect anywhere.
   */
  it('🔴 a composition INSTANCED NOWHERE still contributes its keys — the walk is per DOCUMENT', () => {
    const s = scene(
      [instance('inst-a', 'comp-a')],
      [comp('comp-a', [plate('a1', 'l1')]), comp('comp-orphan', [plate('o1', 'off-stage')])],
    );
    expect(deriveLookSources(s)).toEqual(['l1', 'off-stage']);
  });

  it('⚠ a plate inside a REPEATER is NOT walked — a stamped plate has no static rect to declare', () => {
    const s = scene([
      {
        ...baseElProps,
        id: 'r1',
        name: 'r1',
        type: 'repeater',
        transform: tf(0, 0),
        children: [plate('p1', 'stamped')],
      } as unknown as Element,
      plate('p2', 'l1'),
    ]);
    expect(deriveLookSources(s)).toEqual(['l1']);
  });

  it('🔴 THE DISCRIMINATING FIXTURE — a plate whose key the stale declaration OMITS is an ordinary source', () => {
    // Under the old model this was `look-source-undeclared`, an export-blocking error.
    const s = scene(
      [plate('p1', 'l1'), plate('p2', 'l2')],
      [],
      [{ routeKey: 'l1', dynamic: false }],
    );
    expect(deriveLookSources(s)).toEqual(['l1', 'l2']);
  });

  it('🔴 a stale declaration naming a source NO PLATE USES contributes nothing', () => {
    const s = scene(
      [plate('p1', 'l1')],
      [],
      [
        { routeKey: 'l1', dynamic: false },
        { routeKey: 'never-placed', dynamic: false },
      ],
    );
    expect(deriveLookSources(s)).toEqual(['l1']);
  });
});

describe('deriveLookSources — the ORDER (`B-188` condition (b))', () => {
  it('🔴 document order of FIRST USE, not sorted and not the stale declaration’s order', () => {
    const s = scene(
      [plate('p1', 'zulu'), plate('p2', 'alpha'), plate('p3', 'zulu'), plate('p4', 'mike')],
      [],
      // The opposite order, so a surviving reader of the retired field would flip the result.
      [{ routeKey: 'alpha' }, { routeKey: 'mike' }, { routeKey: 'zulu' }],
    );
    expect(deriveLookSources(s)).toEqual(['zulu', 'alpha', 'mike']);
  });

  it('STABLE UNDER APPEND — a new plate with a new key lands at the END, disturbing nothing', () => {
    const before = deriveLookSources(scene([plate('p1', 'l1'), plate('p2', 'l2')]));
    const after = deriveLookSources(
      scene([plate('p1', 'l1'), plate('p2', 'l2'), plate('p3', 'l3')]),
    );
    expect(before).toEqual(['l1', 'l2']);
    expect(after).toEqual(['l1', 'l2', 'l3']);
    expect(after.slice(0, before.length)).toEqual(before);
  });

  it('a new plate on an EXISTING key changes nothing at all', () => {
    const s = scene([plate('p1', 'l1'), plate('p2', 'l2'), plate('p3', 'l1')]);
    expect(deriveLookSources(s)).toEqual(['l1', 'l2']);
  });

  /**
   * 🔴 **NOT stable under deletion, stated as a test rather than left to be discovered.**
   *
   * Deleting the plate that FIRST used a key moves that key to wherever it is next used. The
   * operator's list visibly reorders; NO mapping is lost, because CG Control keys assignments on
   * `{templateId, plateId}` and `plateId` IS the source id, never an index. That is condition
   * (b)'s whole accepted cost, and it is pinned here so a later reader meets it deliberately.
   */
  it('🔴 NOT stable under deletion — removing the first user of a key moves that key later', () => {
    const before = deriveLookSources(
      scene([plate('p1', 'l1'), plate('p2', 'l2'), plate('p3', 'l1')]),
    );
    const after = deriveLookSources(scene([plate('p2', 'l2'), plate('p3', 'l1')]));
    expect(before).toEqual(['l1', 'l2']);
    expect(after).toEqual(['l2', 'l1']);
  });

  it('the LAST plate using a key leaving removes the key entirely', () => {
    expect(deriveLookSources(scene([plate('p2', 'l2')]))).toEqual(['l2']);
  });
});
