import { afterEach, describe, expect, it } from 'vitest';
import {
  ElementAnimationSchema,
  EntryPresetSchema,
  ExitPresetSchema,
  LoopPresetSchema,
} from '@cg/shared-schema';
import { ProjectService } from '../src/main/services/ProjectService.js';
import { designerStore } from '../src/renderer/state/store.js';
import { defaultText } from '../src/renderer/state/element-defaults.js';
import {
  defaultEntry,
  defaultExit,
  defaultLoop,
  presetDuration,
} from '../src/renderer/features/inspector/animation-defaults.js';

afterEach(() => {
  designerStore._reset();
});

function freshSceneWithText(): string {
  const projects = new ProjectService({
    recentFilePath: '/tmp/recent.json',
    randomId: () => 'scene-anim',
  });
  const { scene } = projects.newScene('anim', 'lower-third');
  designerStore.setScene(scene, null);
  const el = defaultText('el-anim', 0, 0);
  designerStore.addElement(el);
  return el.id;
}

describe('animation-defaults — schema-valid factories', () => {
  it('produces a parsable preset for every entry kind', () => {
    for (const kind of ['none', 'fade', 'slide', 'scale', 'blur'] as const) {
      expect(() => EntryPresetSchema.parse(defaultEntry(kind))).not.toThrow();
    }
  });

  it('produces a parsable preset for every exit kind', () => {
    for (const kind of ['none', 'fade-out', 'slide-out', 'scale-down', 'blur-out'] as const) {
      expect(() => ExitPresetSchema.parse(defaultExit(kind))).not.toThrow();
    }
  });

  it('produces a parsable preset for every loop kind', () => {
    for (const kind of ['none', 'ticker', 'pulse', 'breathing'] as const) {
      expect(() => LoopPresetSchema.parse(defaultLoop(kind))).not.toThrow();
    }
  });

  it('presetDuration counts duration+delay for non-none, else 0', () => {
    expect(presetDuration(undefined)).toBe(0);
    expect(presetDuration({ kind: 'none' })).toBe(0);
    expect(presetDuration(defaultEntry('fade'))).toBe(15); // 15 + 0
    expect(
      presetDuration({
        kind: 'fade',
        duration: 30,
        delay: 6,
        easing: 'power2.out',
      }),
    ).toBe(36);
  });
});

describe('AnimationSection — store integration', () => {
  it('writing element.animation through updateElement round-trips through the scene schema', () => {
    const id = freshSceneWithText();
    designerStore.updateElement(id, {
      animation: { entry: defaultEntry('slide'), loop: defaultLoop('pulse') },
    });
    const el = designerStore.get().scene!.layers[0]!.children[0]!;
    expect(() => ElementAnimationSchema.parse(el.animation)).not.toThrow();
    expect(el.animation?.entry?.kind).toBe('slide');
    expect(el.animation?.loop?.kind).toBe('pulse');
  });

  it('swapping entry kind replaces the sub-object, not merges', () => {
    const id = freshSceneWithText();
    designerStore.updateElement(id, { animation: { entry: defaultEntry('slide') } });
    // Slide had `direction` + `distance`; switching to `fade` must not leak them.
    designerStore.updateElement(id, { animation: { entry: defaultEntry('fade') } });
    const entry = designerStore.get().scene!.layers[0]!.children[0]!.animation?.entry;
    expect(entry?.kind).toBe('fade');
    expect(entry as object).not.toHaveProperty('direction');
    expect(entry as object).not.toHaveProperty('distance');
  });
});
