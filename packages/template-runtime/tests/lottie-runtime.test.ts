import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Scene } from '@cg/shared-schema';

/**
 * D-125 Phase 1 — the runtime WIRING for a Lottie element: `createRuntime` mounts
 * the player from `lottieAssets`, paints the in-frame for the static preview, and on
 * `play()` the driver resets + starts advancing off the injected clock; `pause()`
 * freezes it and `stop()` halts it. The `@cg/lottie-bridge` player is mocked with a
 * recording handle so the wiring is deterministic (no real `lottie_light`).
 */

const { handles } = vi.hoisted(() => ({
  handles: [] as { frames: number[]; destroyed: boolean; el: HTMLElement }[],
}));

vi.mock('@cg/lottie-bridge', () => ({
  createLottiePlayer: (container: HTMLElement) => {
    const h = {
      element: container,
      el: container,
      frames: [] as number[],
      destroyed: false,
      play: () => undefined,
      pause: () => undefined,
      stop: () => undefined,
      destroy() {
        h.destroyed = true;
      },
      goToFrame(f: number) {
        h.frames.push(f);
      },
      get isAlive() {
        return !h.destroyed;
      },
    };
    handles.push(h);
    return h;
  },
}));

const { createRuntime } = await import('../src/runtime.js');

function makeClock() {
  let ms = 0;
  let rafQueue: ((ts: number) => void)[] = [];
  return {
    now: () => ms,
    raf: (cb: (ts: number) => void) => {
      rafQueue.push(cb);
      return rafQueue.length;
    },
    cancel: () => {
      rafQueue = [];
    },
    advance: (delta: number) => {
      ms += delta;
      const cbs = rafQueue;
      rafQueue = [];
      for (const cb of cbs) cb(ms);
    },
  };
}

const baseTransform = {
  position: { x: 0, y: 0 },
  size: { w: 400, h: 200 },
  scale: { x: 1, y: 1 },
  rotation: 0,
  anchor: { x: 0, y: 0 },
};

function lottieScene(): Scene {
  return {
    schemaVersion: 1,
    id: 'scene-lottie',
    name: 'lottie',
    templateType: 'custom',
    resolution: { width: 1920, height: 1080 },
    frameRate: 50,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 50 },
    background: 'transparent',
    layers: [
      {
        id: 'L1',
        name: 'furniture',
        visible: true,
        locked: false,
        blendMode: 'normal',
        children: [
          {
            id: 'lot',
            name: 'lower-third',
            type: 'lottie',
            transform: baseTransform,
            opacity: 1,
            visible: true,
            locked: false,
            zIndex: 0,
            assetId: 'a',
            speed: 1,
            loopMode: 'none',
            holdBehavior: 'freeze',
            phases: { introEnd: 5, outroStart: 80, source: 'markers' },
          },
        ],
      },
    ],
    fields: [],
    bindings: [],
    fonts: [],
    metadata: { createdAt: '2026-07-15T00:00:00.000Z', updatedAt: '2026-07-15T00:00:00.000Z' },
  };
}

// fr:100 → 1 frame every 10ms; op:100; introEnd:5 (freeze at 5).
const lottieAssets = { a: { ip: 0, op: 100, fr: 100, w: 400, h: 200, layers: [] } };

beforeEach(() => {
  document.body.innerHTML = '';
  document.body.className = '';
  handles.length = 0;
});

describe('createRuntime — Lottie element wiring (D-125 Phase 1)', () => {
  it('mounts the player from lottieAssets and paints the settled poster frame for the static canvas', () => {
    createRuntime(lottieScene(), { skipFontLoad: true, installGlobals: false, lottieAssets });
    expect(handles).toHaveLength(1);
    // D-125 — poster() at mount paints the HOLD frame (introEnd = 5), NOT `ip`: the
    // static editor canvas must show the settled graphic, not the invisible intro-start.
    expect(handles[0]?.frames.at(-1)).toBe(5);
    // The mount container is a real element node (not a placeholder).
    const node = document.querySelector<HTMLElement>('[data-cg-element-id="lot"]');
    expect(node).not.toBeNull();
    expect(node?.dataset['cgPlaceholderFor']).toBeUndefined();
  });

  it('an UNRESOLVED asset renders an empty container and no driver', () => {
    createRuntime(lottieScene(), {
      skipFontLoad: true,
      installGlobals: false /* no lottieAssets */,
    });
    expect(handles).toHaveLength(0);
    expect(document.querySelector('[data-cg-element-id="lot"]')).not.toBeNull();
  });

  it('play() starts the intro and it advances by the injected clock; pause freezes; freeze holds', async () => {
    const clock = makeClock();
    const runtime = createRuntime(lottieScene(), {
      skipFontLoad: true,
      installGlobals: false,
      lottieAssets,
      clock,
    });
    await runtime.ready;
    const h = handles[0];
    if (h === undefined) throw new Error('no handle');
    await runtime.play({});
    // reset()+start() painted the in-frame again.
    expect(h.frames.at(-1)).toBe(0);
    clock.advance(20); // +2 frames at 100fps
    expect(h.frames.at(-1)).toBe(2);
    runtime.pause();
    const atPause = h.frames.length;
    clock.advance(100); // paused — must not advance
    expect(h.frames).toHaveLength(atPause);
    runtime.resume();
    clock.advance(40); // resume: 2 → past introEnd 5 → freeze at 5
    expect(h.frames.at(-1)).toBe(5);
  });

  it('remove() destroys the lottie handle', async () => {
    const runtime = createRuntime(lottieScene(), {
      skipFontLoad: true,
      installGlobals: false,
      lottieAssets,
    });
    await runtime.ready;
    runtime.remove();
    expect(handles[0]?.destroyed).toBe(true);
  });
});
