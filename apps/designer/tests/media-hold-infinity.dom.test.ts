/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Element, Scene } from '@cg/shared-schema';
import { designerStore } from '../src/renderer/state/store.js';
import { PlayoutSection } from '../src/renderer/features/inspector/PlayoutSection.js';

/**
 * media-phases-follow-composition — `mediaHoldItem.infinite` must answer "does this
 * element's hold ever complete" the way the DRIVERS answer it, or the never-closes alert
 * lies (the session-R class: a banner that keeps rendering something plausible).
 *
 * The driver facts it mirrors, per kind:
 *  - a video `loop` hold NEVER resolves (its loop branch has no completion) — even on a
 *    zero-length range — EXCEPT under follow with no authored idle, where the runtime
 *    resolves the hold to a FREEZE at `H` (which completes);
 *  - a Lottie `idle-loop` loops only a NON-EMPTY span (`idleOut > idleIn`); a zero span
 *    falls back to freeze in `clipPositionAt` and RESOLVES `whenComplete`. A marker-less
 *    clip's span is zero (`idleIn = idleOut = op`), so it COMPLETES — the found-beside
 *    fix: it was listed infinite while the runtime auto-closes on it.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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

function lottie(id: string, over: Record<string, unknown> = {}): Element {
  return {
    ...T,
    id,
    name: id,
    type: 'lottie',
    assetId: 'asset-a',
    speed: 1,
    loopMode: 'none',
    holdBehavior: 'idle-loop',
    drivesHold: true,
    ...over,
  } as unknown as Element;
}

function video(id: string, over: Record<string, unknown> = {}): Element {
  return {
    ...T,
    id,
    name: id,
    type: 'video',
    assetId: 'asset-v',
    durationMs: 5000,
    holdBehavior: 'loop',
    drivesHold: true,
    ...over,
  } as unknown as Element;
}

function scene(children: Element[]): Scene {
  return {
    schemaVersion: 1,
    id: 'scene-inf',
    name: 'inf',
    templateType: 'custom',
    resolution: { width: 1920, height: 1080 },
    frameRate: 25,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 100 },
    editorBackdrop: 'transparent',
    lifecycle: { outPoint: 60 },
    playout: { mode: 'auto-out', holdSource: 'content-driven' },
    layers: [{ id: 'L1', name: 'l', visible: true, locked: false, blendMode: 'normal', children }],
    fields: [],
    bindings: [],
    fonts: [],
    metadata: { createdAt: '2026-08-13T00:00:00.000Z', updatedAt: '2026-08-13T00:00:00.000Z' },
  } as unknown as Scene;
}

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  designerStore._reset();
});

function render(s: Scene): void {
  act(() => {
    root.render(createElement(PlayoutSection, { scene: s }));
  });
}

const alertEl = (): HTMLElement | null => host.querySelector('[role="alert"]');

describe('Lottie idle-loop — infinite ONLY with a non-empty effective idle span', () => {
  it('a MARKER-LESS idle-loop Lottie is FINITE — the driver freezes on a zero span and resolves', () => {
    // The found-beside fix: this exact shape was listed infinite (no phases at all), while
    // `clipPositionAt` falls back to freeze (`idleOut > idleIn` fails at op/op) and the
    // graphic auto-closes. The alert must NOT claim it won't.
    render(scene([lottie('Loop')]));
    expect(alertEl()).toBeNull();
  });

  it('an idle-loop Lottie with a REAL idle span is infinite', () => {
    render(
      scene([
        lottie('Loop', {
          phases: { introEnd: 10, outroStart: 40, idle: [10, 30], source: 'manual' },
        }),
      ]),
    );
    expect(alertEl()).not.toBeNull();
    expect(alertEl()!.textContent).toContain('Loop');
  });

  it('an idle-loop Lottie with phases but NO idle pair loops the hold window [introEnd, outroStart]', () => {
    // idleIn/idleOut default to introEnd/outroStart — a non-empty hold window DOES loop.
    render(scene([lottie('Loop', { phases: { introEnd: 10, outroStart: 40, source: 'manual' } })]));
    expect(alertEl()).not.toBeNull();
  });

  it('a FOLLOW-source idle-loop Lottie is infinite only with an AUTHORED idle span', () => {
    // Under follow the stored introEnd/outroStart are IGNORED — they must not smuggle a
    // loop range in. Absent idle ⇒ freeze at H ⇒ completes.
    render(
      scene([
        lottie('Follow', {
          phases: { introEnd: 10, outroStart: 40, source: 'composition', holdAt: 20 },
        }),
      ]),
    );
    expect(alertEl()).toBeNull();
    render(
      scene([
        lottie('Follow', {
          phases: {
            introEnd: 10,
            outroStart: 40,
            source: 'composition',
            holdAt: 20,
            idle: [15, 25],
          },
        }),
      ]),
    );
    expect(alertEl()).not.toBeNull();
  });
});

describe('video loop — infinite always, EXCEPT under follow with no authored idle', () => {
  it('a loop video (any phases shape) is infinite — its loop branch never resolves', () => {
    render(scene([video('Bed')]));
    expect(alertEl()).not.toBeNull();
    render(scene([video('Bed', { phases: { introEnd: 1000, outroStart: 4000 } })]));
    expect(alertEl()).not.toBeNull();
  });

  it('a FOLLOW-source loop video with NO idle is FINITE — the runtime freezes it at H', () => {
    render(
      scene([
        video('Bed', {
          phases: { introEnd: 1000, outroStart: 4000, source: 'composition', holdAt: 3000 },
        }),
      ]),
    );
    expect(alertEl()).toBeNull();
  });

  it('a FOLLOW-source loop video WITH an authored idle range loops it — infinite', () => {
    render(
      scene([
        video('Bed', {
          phases: {
            introEnd: 1000,
            outroStart: 4000,
            source: 'composition',
            holdAt: 3000,
            idle: { start: 2500, end: 3500 },
          },
        }),
      ]),
    );
    expect(alertEl()).not.toBeNull();
    expect(alertEl()!.textContent).toContain('Bed');
  });

  it('a freeze video completes regardless of source', () => {
    render(scene([video('Bed', { holdBehavior: 'freeze' })]));
    expect(alertEl()).toBeNull();
  });
});
