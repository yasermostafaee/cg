// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Element, Scene } from '@cg/shared-schema';

import { createRuntime } from '../src/runtime.js';

/**
 * B-137 — THE DRIVER FOLLOWS THE NODE, WHEN A HOST REPARENTS IT.
 *
 * The Designer preview pools a live `<video>` across a rebuild and transplants it
 * back over the freshly built one, so a transform-only edit never re-fetches the
 * media. Nothing told the NEW driver about that swap, so it went on commanding the
 * node it captured at build time — detached by then, and never given a `src`. The
 * node on screen was the one the OUTGOING driver paused during teardown, and no code
 * path played it again: a frozen picture with a healthy driver behind it.
 *
 * This is asserted HERE, in the engine, rather than only through the Designer's E2E,
 * because the fix is deliberately HOST-AGNOSTIC — it keys off `isConnected` and
 * `data-cg-element-id`, so ANY harness that reparents nodes is covered. A test that
 * could only reach it through the Designer would not say that.
 *
 * jsdom has no media stack, so `play`/`pause` are stubbed per node and the assertion
 * is simply WHICH node was commanded — which is the whole question.
 */

const baseTransform = {
  position: { x: 0, y: 0 },
  size: { w: 400, h: 200 },
  scale: { x: 1, y: 1 },
  rotation: 0,
  anchor: { x: 0, y: 0 },
};

function video(id: string): Element {
  return {
    id,
    name: id,
    type: 'video',
    transform: baseTransform,
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 0,
    assetId: `asset-${id}`,
    durationMs: 1000,
    holdBehavior: 'loop',
    phases: { introEnd: 200, outroStart: 800 },
  } as unknown as Element;
}

function scene(children: Element[]): Scene {
  return {
    schemaVersion: 1,
    id: 's',
    name: 's',
    templateType: 'custom',
    resolution: { width: 400, height: 200 },
    frameRate: 50,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 50 },
    editorBackdrop: 'transparent',
    layers: [{ id: 'l', name: 'l', children }],
    compositions: [],
  } as unknown as Scene;
}

/** Give a node inert media methods and count the play() calls it receives. */
function stubMedia(el: HTMLVideoElement): { plays: () => number } {
  const play = vi.fn(() => Promise.resolve());
  Object.defineProperty(el, 'play', { value: play, configurable: true });
  Object.defineProperty(el, 'pause', { value: () => undefined, configurable: true });
  return { plays: () => play.mock.calls.length };
}

const vidEl = (id: string): HTMLVideoElement =>
  document.querySelector<HTMLVideoElement>(`video[data-cg-element-id="${id}"]`)!;

beforeEach(() => {
  document.body.innerHTML = '';
  document.body.className = '';
});
afterEach(() => {
  document.body.innerHTML = '';
  document.body.className = '';
  vi.restoreAllMocks();
});

describe('B-137 — a reparented <video> is still the one the driver commands', () => {
  it('play() reaches the ATTACHED replacement, never the detached node built with the scene', async () => {
    const r = createRuntime(scene([video('v')]), { skipFontLoad: true, installGlobals: false });
    await r.ready;

    // The host's transplant, in miniature: an equivalent node carrying the SAME
    // `data-cg-element-id` takes the built node's place in the document.
    const built = vidEl('v');
    const replacement = built.cloneNode(false) as HTMLVideoElement;
    const builtSpy = stubMedia(built);
    const replacementSpy = stubMedia(replacement);
    built.replaceWith(replacement);
    expect(built.isConnected, 'the built node is now the orphan').toBe(false);
    expect(replacement.isConnected, 'the replacement is what a viewer sees').toBe(true);

    await r.play({});

    expect(replacementSpy.plays(), 'B-137 — the visible node was never played').toBeGreaterThan(0);
    expect(builtSpy.plays(), 'B-137 — the orphan was commanded instead of the visible node').toBe(
      0,
    );
    r.remove();
  });

  it('a node that is merely MOVED within the document is not re-resolved', async () => {
    const r = createRuntime(scene([video('v')]), { skipFontLoad: true, installGlobals: false });
    await r.ready;

    // Still connected, so the resolver must leave it alone — the cheap path stays cheap
    // and a host that reorders its tree does not get a surprise re-binding.
    const built = vidEl('v');
    const spy = stubMedia(built);
    const box = document.createElement('div');
    document.body.appendChild(box);
    box.appendChild(built);
    expect(built.isConnected).toBe(true);

    await r.play({});
    expect(spy.plays(), 'the same node is still the one commanded').toBeGreaterThan(0);
    r.remove();
  });
});

describe('B-137 — a rejected play() is reported ONCE per element', () => {
  it('logs the element id once, however many times play() is retried', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const r = createRuntime(scene([video('v')]), { skipFontLoad: true, installGlobals: false });
    await r.ready;

    const el = vidEl('v');
    Object.defineProperty(el, 'play', {
      value: () => Promise.reject(new Error('NotAllowedError')),
      configurable: true,
    });
    Object.defineProperty(el, 'pause', { value: () => undefined, configurable: true });

    await r.play({});
    // Drive several more lifecycle beats so play() is attempted again.
    for (let i = 0; i < 5; i += 1) {
      r.tick(i);
      await Promise.resolve();
    }
    await new Promise((resolve) => setTimeout(resolve, 0));

    const mine = warn.mock.calls.filter((c) => String(c[0]).includes('play() was rejected'));
    expect(mine.length, 'B-137 — the rejection must be reported, and not per frame').toBe(1);
    expect(String(mine[0]?.[0]), 'the log names the element').toContain('"v"');
    r.remove();
  });
});
