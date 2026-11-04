/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Scene } from '@cg/shared-schema';
import {
  PreviewStatus,
  PreviewTransport,
  formatElapsed,
  formatFrameCounter,
} from '../src/renderer/features/fields/PreviewTransport.js';
import {
  canvasDisplayFrame,
  previewDisplayFrame,
  previewElapsedLimitMs,
  shouldDeferPreviewNaturalStop,
} from '../src/renderer/features/fields/preview-elapsed.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
let host: HTMLDivElement | null = null;
afterEach(() => {
  if (root !== null) act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});
const scene = (patch: Partial<Scene> = {}): Scene =>
  ({
    name: 'Preview',
    frameRate: 50,
    frameRange: { in: 0, out: 50 },
    layers: [],
    fields: [],
    bindings: [],
    playout: { mode: 'static' },
    ...patch,
  }) as Scene;

describe('Preview command workspace and authored display clock', () => {
  it('formats elapsed and frame values without ambiguous separators', () => {
    expect(formatElapsed(62_345)).toBe('01:02:34');
    expect(formatElapsed(0)).toBe('00:00:00');
    expect(formatFrameCounter(4, 50)).toBe('04 / 50');
    expect(formatFrameCounter(40, 100)).toBe('040 / 100');
  });
  it('exposes status and compact commands without an Out action', () => {
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    act(() =>
      root?.render(
        createElement(
          'div',
          {},
          createElement(PreviewStatus, {
            compositionName: 'آب و هوا',
            elapsedMs: 1000,
            currentFrame: 25,
            totalFrames: 50,
          }),
          createElement(PreviewTransport, {
            paused: false,
            canStep: false,
            onPlay: vi.fn(),
            onPause: vi.fn(),
            onStop: vi.fn(),
            onPrevious: vi.fn(),
            onNext: vi.fn(),
            onReset: vi.fn(),
          }),
        ),
      ),
    );
    expect(host.textContent).toContain('آب و هوا');
    expect(host.querySelector('[aria-label="Preview frame"]')?.textContent).toContain('25 / 50');
    expect(host.querySelector('[aria-label="Elapsed preview time"]')?.textContent).toContain(
      '00:01:00',
    );
    const buttons = [...host.querySelectorAll('button')];
    expect(buttons.some((button) => button.textContent?.trim() === 'Out')).toBe(false);
    expect(buttons.find((button) => button.textContent?.includes('Stop'))?.title).toBe(
      'Stop and clear',
    );
  });
  it('projects empty/static roots but never overwrites a real animated frame', () => {
    expect(previewDisplayFrame(scene(), 50, 500)).toBe(25);
    expect(previewElapsedLimitMs(scene())).toBe(1000);
    expect(shouldDeferPreviewNaturalStop(scene(), 200, 1000)).toBe(true);
    const animated = scene({
      layers: [
        {
          id: 'l',
          name: 'l',
          children: [{ animation: { tracks: { opacity: { keyframes: [{}] } } } }],
        },
      ],
    } as unknown as Partial<Scene>);
    expect(previewDisplayFrame(animated, 37, 500)).toBe(37);
    expect(shouldDeferPreviewNaturalStop(animated, 200, 1000)).toBe(false);
  });
  it('parks a manual hold and includes timed auto-out hold in display duration', () => {
    const manual = scene({ lifecycle: { outPoint: 30 }, playout: { mode: 'manual' } });
    expect(canvasDisplayFrame(manual, 50, 5000)).toBe(30);
    const auto = scene({
      lifecycle: { outPoint: 30 },
      playout: { mode: 'auto-out', holdSource: 'timed', holdMs: 200 },
    });
    expect(previewElapsedLimitMs(auto)).toBe(1200);
    expect(previewDisplayFrame(auto, 50, 700)).toBe(30);
    expect(previewDisplayFrame(auto, 50, 900)).toBe(35);
    expect(previewDisplayFrame(auto, 50, 1200)).toBe(50);
    expect(previewElapsedLimitMs(auto, { holdMs: 500 })).toBe(1500);
  });
  it('keeps content-driven and infinite-loop elapsed clocks open', () => {
    expect(
      previewElapsedLimitMs(scene({ playout: { mode: 'auto-out', holdSource: 'content-driven' } })),
    ).toBeNull();
    expect(
      previewElapsedLimitMs(scene({ playout: { mode: 'loop-cycle', repeat: 'infinite' } })),
    ).toBeNull();
  });
});
