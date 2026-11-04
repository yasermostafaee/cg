import { afterEach, describe, expect, it } from 'vitest';
import { MemoryKv, MemoryWorkspace } from '@cg/storage';
import type { Element } from '@cg/shared-schema';
import { buildTemplateLiveSources } from '@cg/vcg-format';
import { ProjectStore } from '../src/platform/ProjectStore.js';
import { designerStore, editSceneOf } from '../src/renderer/state/store.js';
import {
  detachedLookCompositions,
  projectLookGroup,
  registeredLookForComposition,
} from '../src/renderer/state/slices/looks.js';
import { activeLayersOf } from '../src/renderer/state/scene-doc.js';
import { defaultLiveSource } from '../src/renderer/state/element-defaults.js';

/**
 * A registered Look is one authored object with three representations: its registry row,
 * full-frame instance in the group home, and backing composition. The Compositions panel is
 * the single management surface, so deleting through either store door must keep all three in
 * sync. Ordinary full-frame compositions may still be explicitly promoted to Looks.
 */

afterEach(() => {
  designerStore._reset();
});

const scene = () => designerStore.get().scene;
const comps = () => scene()?.compositions ?? [];
const looks = () => projectLookGroup(scene())?.looks ?? [];

function fresh(): string | null {
  const projects = new ProjectStore(new MemoryWorkspace(), new MemoryKv());
  const { scene } = projects.newScene('looks', 'custom');
  designerStore.setScene(scene, null);
  return designerStore.get().activeCompositionId;
}

function compositionIdOfLook(lookId: string): string {
  const look = looks().find((candidate) => candidate.id === lookId);
  if (look === undefined || scene() === null) throw new Error(`no ${lookId}`);
  for (const doc of [scene()!, ...(scene()!.compositions ?? [])]) {
    for (const layer of doc.layers) {
      const instance = layer.children.find((element) => element.id === look.instanceId);
      if (instance?.type === 'composition') return instance.compositionId;
    }
  }
  throw new Error(`no composition for ${lookId}`);
}

describe('registered Look identity and lifecycle', () => {
  it('renaming a Look also renames its composition and exported operator label', () => {
    const home = fresh();
    designerStore.createLookGroup();
    designerStore.addLook();

    designerStore.renameLook('look-1', 'دو قاب مهمان');

    expect(looks()[0]?.name).toBe('دو قاب مهمان');
    expect(comps().find((composition) => composition.name === 'دو قاب مهمان')).toBeDefined();
    const projected = editSceneOf(scene(), home);
    if (projected === null) throw new Error('no projected home composition');
    expect(buildTemplateLiveSources(projected).looks?.[0]?.name).toBe('دو قاب مهمان');
  });

  it('renaming a registered Look composition also changes the exported Look label', () => {
    const home = fresh();
    designerStore.createLookGroup();
    designerStore.addLook();
    const compositionId = compositionIdOfLook('look-1');

    designerStore.renameComposition(compositionId, 'سه قاب استودیو');

    expect(looks()[0]?.name).toBe('سه قاب استودیو');
    const projected = editSceneOf(scene(), home);
    if (projected === null) throw new Error('no projected home composition');
    expect(buildTemplateLiveSources(projected).looks?.[0]?.name).toBe('سه قاب استودیو');
  });

  it('renaming an open Look composition in the Scene Inspector updates the Look', () => {
    const home = fresh();
    designerStore.createLookGroup();
    designerStore.addLook();
    designerStore.editLookContents('look-1');

    designerStore.updateScene({ name: 'دو قاب از اینسپکتور' });
    designerStore.setActiveComposition(home);

    expect(looks()[0]?.name).toBe('دو قاب از اینسپکتور');
    const projected = editSceneOf(scene(), home);
    if (projected === null) throw new Error('no projected home composition');
    expect(buildTemplateLiveSources(projected).looks?.[0]?.name).toBe('دو قاب از اینسپکتور');
  });

  it('deleting from the Look action removes registration, instance, composition and content', () => {
    const home = fresh();
    designerStore.createLookGroup();
    designerStore.addLook();
    const look = looks()[0];
    const compositionId = compositionIdOfLook('look-1');
    designerStore.editLookContents('look-1');
    designerStore.addElement({
      ...defaultLiveSource('plate-1', 100, 100),
      routeKey: 'guest-1',
    } as unknown as Element);
    designerStore.setActiveComposition(home);

    designerStore.removeLook('look-1');

    expect(looks()).toEqual([]);
    expect(comps().some((composition) => composition.id === compositionId)).toBe(false);
    expect(
      activeLayersOf(scene()!)
        .flatMap((layer) => layer.children)
        .some((element) => element.id === look?.instanceId),
    ).toBe(false);
    expect(designerStore.get().notice).toMatch(
      /Preset “preset-1”.*composition “preset-1”.*deleted/i,
    );
  });

  it('deleting the backing composition removes the Look and promotes the next default', () => {
    fresh();
    designerStore.createLookGroup();
    designerStore.addLook();
    designerStore.addLook();
    const first = looks()[0];
    const firstCompositionId = compositionIdOfLook('look-1');

    designerStore.deleteComposition(firstCompositionId);

    expect(looks().map((look) => look.id)).toEqual(['look-2']);
    expect(projectLookGroup(scene())?.defaultLookId).toBe('look-2');
    expect(comps().some((composition) => composition.id === firstCompositionId)).toBe(false);
    expect(
      activeLayersOf(scene()!)
        .flatMap((layer) => layer.children)
        .some((element) => element.id === first?.instanceId),
    ).toBe(false);
  });

  it('Undo restores all three Look representations after a synchronized delete', () => {
    fresh();
    designerStore.createLookGroup();
    designerStore.addLook();
    const compositionId = compositionIdOfLook('look-1');
    designerStore.markHistoryBoundary();

    designerStore.removeLook('look-1');
    designerStore.undo();

    expect(looks().map((look) => look.id)).toEqual(['look-1']);
    expect(comps().some((composition) => composition.id === compositionId)).toBe(true);
    expect(registeredLookForComposition(scene(), compositionId)?.id).toBe('look-1');
  });

  it('an ordinary eligible composition can be promoted from the Compositions panel', () => {
    const home = fresh();
    designerStore.createLookGroup();
    const compositionId = designerStore.addComposition();
    if (compositionId === null) throw new Error('no composition');
    designerStore.setActiveComposition(home);
    expect(detachedLookCompositions(scene()).map((composition) => composition.id)).toContain(
      compositionId,
    );

    const lookId = designerStore.addLookFromComposition(compositionId);

    expect(lookId).toBe('look-1');
    expect(registeredLookForComposition(scene(), compositionId)?.id).toBe('look-1');
  });

  it('Add Look targets the group home even while another Look composition is open', () => {
    const home = fresh();
    designerStore.createLookGroup();
    designerStore.addLook();
    designerStore.editLookContents('look-1');
    const openLookComposition = designerStore.get().activeCompositionId;

    const added = designerStore.addLook();

    expect(added).toBe('look-2');
    expect(designerStore.get().activeCompositionId).toBe(openLookComposition);
    expect(looks().map((look) => look.id)).toEqual(['look-1', 'look-2']);
    designerStore.setActiveComposition(home);
    const homeIds = new Set(
      activeLayersOf(scene()!)
        .flatMap((layer) => layer.children)
        .map((element) => element.id),
    );
    expect(looks().every((look) => homeIds.has(look.instanceId))).toBe(true);
  });
});
