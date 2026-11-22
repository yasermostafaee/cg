// @vitest-environment jsdom
import { CONTROL_LIVE_LAYOUT_DEFAULT_EFFECTS, type ControlLiveLayout } from '@cg/shared-schema';
import type { TemplateLook } from '@cg/shared-ipc';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { previewFocusSwitch } from '../src/renderer/features/monitors/previewFocusSwitch.js';
import { paintPvwPlatePictures } from '../src/renderer/features/monitors/pvwPlatePictures.js';

const canvas = { x: 0, y: 0, width: 1920, height: 1080 };

function frame(id: string, titleHidden: boolean) {
  const authoredParent = document.createElement('section');
  authoredParent.dataset['cgPresetDepartureKey'] = id + '/plate';
  const material = document.createElement('div');
  material.dataset['cgElementId'] = id + '-artwork';
  material.style.transform = 'translate(9px, 3px)';
  Object.defineProperties(material, {
    offsetWidth: { value: 1920 },
    offsetHeight: { value: 1080 },
  });
  vi.spyOn(material, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 1920, 1080));
  const picture = document.createElement('div');
  picture.dataset['cgLiveSource'] = id;
  const pixels = document.createElement('div');
  pixels.dataset['cgPvwPicturePart'] = id;
  picture.append(pixels);
  const title = document.createElement('span');
  title.textContent = 'Main title ' + id;
  title.hidden = titleHidden;
  const caption = document.createElement('span');
  caption.textContent = 'Second title ' + id;
  const graphic = document.createElement('canvas');
  graphic.dataset['cgElementId'] = id + '-imported-graphic';
  material.append(picture, title, caption, graphic);
  authoredParent.append(material);
  document.body.append(authoredParent);
  const look: TemplateLook = {
    id,
    name: id,
    entered: { mode: 'cut' },
    rects: { [id]: canvas },
    transitionFrames: {
      [id]: { frameKey: id + '/plate/picture', elementId: id, artworkId: id + '-artwork' },
    },
  };
  return {
    authoredParent,
    material,
    title,
    caption,
    graphic,
    picture,
    pixels,
    side: { look, frameId: id, anchor: canvas },
  };
}

const layout: ControlLiveLayout = {
  id: 'focus-layout',
  name: 'Focus layout',
  resolution: canvas,
  frameRate: 25,
  frames: [],
  presets: [],
  defaultPresetId: 'before',
  background: { kind: 'color', color: '#000000' },
  effects: {
    ...CONTROL_LIVE_LAYOUT_DEFAULT_EFFECTS,
    switch: { mode: 'push', direction: 'left', durationMs: 160 },
  },
};

let previousAnimate: PropertyDescriptor | undefined;
let complete: (() => void)[];
let animate: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  previousAnimate = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate');
  complete = [];
  animate = vi.fn(() => ({
    cancel: vi.fn(),
    finished: new Promise<void>((resolve) => complete.push(resolve)),
  }));
  Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: animate });
});

afterEach(() => {
  document.body.replaceChildren();
  if (previousAnimate === undefined) Reflect.deleteProperty(HTMLElement.prototype, 'animate');
  else Object.defineProperty(HTMLElement.prototype, 'animate', previousAnimate);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('PVW direct Focus artwork', () => {
  it('moves both titles, mounted pixels and the live imported graphic in the same animated unit', async () => {
    const before = frame('before', true);
    const after = frame('after', false);
    after.authoredParent.hidden = true;
    const settled = vi.fn();
    previewFocusSwitch({
      doc: document,
      before: before.side,
      after: after.side,
      layout,
      period: 40,
      pictureReady: () => true,
      commit: () => {
        before.authoredParent.hidden = true;
        after.authoredParent.hidden = false;
        paintPvwPlatePictures(document, [], new Map());
        after.picture.append(after.pixels);
      },
      settled,
    });
    vi.advanceTimersByTime(0);
    const outgoing = document.querySelector('[data-cg-pvw-focus-plane="outgoing"]')!;
    const incoming = document.querySelector('[data-cg-pvw-focus-plane="incoming"]')!;
    expect(outgoing.contains(before.title)).toBe(true);
    expect(outgoing.contains(before.caption)).toBe(true);
    expect(outgoing.contains(before.pixels)).toBe(true);
    expect(before.title.hidden).toBe(true);
    expect(incoming.contains(after.title)).toBe(true);
    expect(incoming.contains(after.caption)).toBe(true);
    expect(incoming.contains(after.graphic)).toBe(true);
    paintPvwPlatePictures(document, [], new Map());
    expect(incoming.contains(after.pixels)).toBe(true);
    expect(outgoing.contains(before.pixels)).toBe(true);
    expect(after.title.hidden).toBe(false);
    after.graphic.dataset['paintTick'] = '2';
    expect(incoming.querySelector('canvas')?.dataset['paintTick']).toBe('2');
    expect(animate).toHaveBeenCalledTimes(2);
    for (const finish of complete) finish();
    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toHaveBeenCalledWith(true);
    expect(before.material.parentElement).toBe(before.authoredParent);
    expect(after.material.parentElement).toBe(after.authoredParent);
    expect(after.material.style.transform).toBe('translate(9px, 3px)');
    expect(document.querySelector('[data-cg-pvw-focus-switch]')).toBeNull();
  });

  it('restores the original node and its animation state on a superseding look', () => {
    const before = frame('before', false);
    const after = frame('after', false);
    const settled = vi.fn();
    const cancel = previewFocusSwitch({
      doc: document,
      before: before.side,
      after: after.side,
      layout,
      period: 40,
      pictureReady: () => true,
      commit: vi.fn(),
      settled,
    });
    vi.advanceTimersByTime(0);
    expect(after.graphic.closest('[data-cg-pvw-focus-plane]')).not.toBeNull();
    cancel();
    expect(settled).toHaveBeenCalledWith(false);
    expect(before.graphic.closest('section')).toBe(before.authoredParent);
    expect(after.graphic.closest('section')).toBe(after.authoredParent);
    expect(document.querySelector('[data-cg-pvw-focus-switch]')).toBeNull();
  });
});
