import { afterEach, describe, expect, it } from 'vitest';
import { MemoryKv, MemoryWorkspace } from '@cg/storage';
import { SceneSchema, type Element } from '@cg/shared-schema';
import { ProjectStore } from '../src/platform/ProjectStore.js';
import { designerStore, editSceneOf } from '../src/renderer/state/store.js';
import {
  defaultLottie,
  defaultTicker,
  defaultVideo,
} from '../src/renderer/state/element-defaults.js';
import { contentHoldElementsOf } from '../src/renderer/features/inspector/PlayoutSection.js';

/**
 * Q — `drivesHold` has ONE writer, and it reaches every kind that carries the flag.
 *
 * The defect: D-128 extended the READ side — `contentHoldElementsOf` LISTS a `video` /
 * `lottie` in "Which content closes the graphic?" — while `patchDrivesHold` kept a
 * three-kind filter (ticker / sequence / clock). So the checkbox on a media row clicked,
 * wrote nothing, and React re-rendered from unchanged state: an inert control that looked
 * like a rendering bug. The mutator's own doc comment documented the restriction
 * accurately; the UI was changed to contradict a documented contract.
 *
 * 🔴 The DEFAULT is inverted between the two groups, and the writer must not care:
 * absent ⇒ PARTICIPATES for ticker / sequence / clock, absent ⇒ does NOT participate for
 * media (`=== true` is the opt-in). So the writer always stores an explicit boolean —
 * deleting the key would read back as participating for the first group.
 */

afterEach(() => designerStore._reset());

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

function lottie(id: string): Element {
  return defaultLottie(id, 0, 0, 'asset-a') as unknown as Element;
}

function video(id: string): Element {
  return defaultVideo(id, 0, 0, 'asset-v', 4000) as unknown as Element;
}

function ticker(id: string): Element {
  return defaultTicker(id, 0, 0) as unknown as Element;
}

function container(id: string, children: Element[]): Element {
  return { ...T, id, name: id, type: 'container', clip: false, children } as unknown as Element;
}

function freshScene(): void {
  const projects = new ProjectStore(new MemoryWorkspace(), new MemoryKv());
  const { scene } = projects.newScene('demo', 'lower-third');
  designerStore.setScene(scene, null);
}

function layerChildren(): readonly Element[] {
  const st = designerStore.get();
  return editSceneOf(st.scene, st.activeCompositionId)!.layers[0]!.children;
}

/** Find an element anywhere in the tree — the point is that nesting must not hide it. */
function findDeep(els: readonly Element[], id: string): Element | undefined {
  for (const el of els) {
    if (el.id === id) return el;
    if (el.type === 'container') {
      const hit = findDeep(el.children, id);
      if (hit !== undefined) return hit;
    }
  }
  return undefined;
}

const flagOf = (id: string): boolean | undefined =>
  (findDeep(layerChildren(), id) as { drivesHold?: boolean } | undefined)?.drivesHold;

describe('Q — the drivesHold writer covers every kind that carries the flag', () => {
  it('a LOTTIE row is writable: ticking stores `true`, unticking stores `false`', () => {
    freshScene();
    designerStore.addElement(lottie('lot'));
    // Absent ⇒ media does NOT participate. This is the state the inert checkbox was stuck in.
    expect(flagOf('lot')).toBeUndefined();

    designerStore.setElementDrivesHold('lot', true);
    expect(flagOf('lot')).toBe(true);

    // …and the checklist READ side now agrees, which is what makes the box stay ticked.
    const st = designerStore.get();
    const scene = editSceneOf(st.scene, st.activeCompositionId)!;
    expect(contentHoldElementsOf(scene).find((i) => i.id === 'lot')?.drivesHold).toBe(true);

    designerStore.setElementDrivesHold('lot', false);
    expect(flagOf('lot')).toBe(false);
  });

  it('a VIDEO row is writable the same way', () => {
    freshScene();
    designerStore.addElement(video('vid'));
    designerStore.setElementDrivesHold('vid', true);
    expect(flagOf('vid')).toBe(true);
    designerStore.setElementDrivesHold('vid', false);
    expect(flagOf('vid')).toBe(false);
  });

  it('a TICKER is unchanged — and its absent-⇒-participates default is preserved', () => {
    freshScene();
    designerStore.addElement(ticker('tick'));
    // Absent ⇒ PARTICIPATES for this group. The writer must never express that by
    // DELETING the key; it stores an explicit boolean in both directions.
    expect(flagOf('tick')).toBeUndefined();

    designerStore.setElementDrivesHold('tick', false);
    expect(flagOf('tick')).toBe(false);

    designerStore.setElementDrivesHold('tick', true);
    expect(flagOf('tick')).toBe(true);
    // `true` and absent mean the same thing HERE and opposite things for media — which is
    // why the writer stores the boolean rather than reasoning about defaults.
  });

  it('an element NESTED in a container is reachable — the flag is not lost to grouping', () => {
    freshScene();
    designerStore.addElement(container('grp', [lottie('deep'), ticker('deepTick')]));
    designerStore.setElementDrivesHold('deep', true);
    designerStore.setElementDrivesHold('deepTick', false);
    expect(flagOf('deep')).toBe(true);
    expect(flagOf('deepTick')).toBe(false);
    // The container itself is untouched — only the matching child changes.
    const grp = findDeep(layerChildren(), 'grp') as { drivesHold?: boolean };
    expect(grp.drivesHold).toBeUndefined();
  });

  it('a non-flag kind is left alone even on an id match', () => {
    freshScene();
    designerStore.addElement(container('grp', []));
    designerStore.setElementDrivesHold('grp', true);
    expect(
      (findDeep(layerChildren(), 'grp') as { drivesHold?: boolean }).drivesHold,
    ).toBeUndefined();
  });

  it('ROUND-TRIP: the flag survives the schema, so a saved scene reloads still ticked', () => {
    freshScene();
    designerStore.addElement(container('grp', [lottie('deep')]));
    designerStore.setElementDrivesHold('deep', true);
    const st = designerStore.get();
    const parsed = SceneSchema.parse(JSON.parse(JSON.stringify(st.scene)));
    // The starter drops you INSIDE a composition, so the element lives there, not in the
    // scene's own layers — search both, because where it lives is not what is under test.
    const everywhere = [
      ...parsed.layers.flatMap((l) => l.children),
      ...(parsed.compositions ?? []).flatMap((c) => c.layers.flatMap((l) => l.children)),
    ];
    const reloaded = findDeep(everywhere, 'deep') as { drivesHold?: boolean };
    expect(reloaded.drivesHold).toBe(true);
  });
});
