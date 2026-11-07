/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  PreviewStatus,
  PreviewTransport,
  formatElapsed,
  formatFrameCounter,
} from '../src/renderer/features/fields/PreviewTransport.js';
import {
  PreviewFieldForm,
  aggregateHasEditableFields,
} from '../src/renderer/features/fields/PreviewFieldForm.js';
import {
  canvasDisplayFrame,
  canvasDisplayLimitMs,
  hasAuthoredOutroMotion,
  previewDisplayFrame,
  previewElapsedLimitMs,
  shouldDeferPreviewNaturalStop,
} from '../src/renderer/features/fields/preview-elapsed.js';
import type { AggregatedFields, Element, Scene } from '@cg/shared-schema';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  if (root !== null) act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

function renderTransport(canStep = true): HTMLDivElement {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root?.render(
      createElement(
        'div',
        {},
        createElement(PreviewStatus, {
          compositionName: 'شبکه خبر',
          elapsedMs: 62_345,
          currentFrame: 40,
          totalFrames: 100,
        }),
        createElement(PreviewTransport, {
          ready: true,
          paused: false,
          canStep,
          onPlay: vi.fn(),
          onPause: vi.fn(),
          onStop: vi.fn(),
          onPrevious: vi.fn(),
          onNext: vi.fn(),
          onReset: vi.fn(),
        }),
      ),
    );
  });
  return host;
}

function timingScene(patch: Partial<Scene> = {}): Scene {
  return {
    name: 'Preview scene',
    frameRate: 50,
    frameRange: { in: 0, out: 100 },
    activeRange: { in: 10, out: 60 },
    layers: [],
    ...patch,
  } as Scene;
}

describe('D-173 — Preview command workspace', () => {
  it('shows the composition name above the Preview picture', () => {
    const rendered = renderTransport();
    expect(rendered.textContent).toContain('Composition');
    expect(rendered.textContent).toContain('شبکه خبر');
  });

  it('formats elapsed rehearsal time compactly and safely', () => {
    expect(formatElapsed(0)).toBe('00:00:00');
    expect(formatElapsed(62_345)).toBe('01:02:34');
    expect(formatElapsed(3_661_999)).toBe('01:01:01:99');
    expect(formatElapsed(-10)).toBe('00:00:00');
    expect(formatFrameCounter(4, 50)).toBe('04 / 50');
    expect(formatFrameCounter(40, 100)).toBe('040 / 100');
  });

  it.each([
    ['static / timed', { mode: 'static', holdSource: 'timed' }, 1_000],
    ['manual / timed', { mode: 'manual', holdSource: 'timed' }, 1_000],
    ['manual / Middle loop', { mode: 'manual', holdSource: 'timed', holdBehavior: 'loop' }, null],
    ['auto-out / timed', { mode: 'auto-out', holdSource: 'timed' }, 1_000],
    ['static / content-driven', { mode: 'static', holdSource: 'content-driven' }, null],
    ['manual / content-driven', { mode: 'manual', holdSource: 'content-driven' }, null],
    ['auto-out / content-driven', { mode: 'auto-out', holdSource: 'content-driven' }, null],
    ['loop-cycle / timed / finite', { mode: 'loop-cycle', holdSource: 'timed', repeat: 2 }, 2_000],
    [
      'loop-cycle / timed / infinite',
      { mode: 'loop-cycle', holdSource: 'timed', repeat: 'infinite' },
      null,
    ],
    [
      'loop-cycle / content-driven',
      { mode: 'loop-cycle', holdSource: 'content-driven', repeat: 2 },
      null,
    ],
  ] as const)('uses the correct elapsed limit for %s', (_label, playout, expected) => {
    // Empty/static roots have an authored display clock. Plain/Freeze stays finite, a manual
    // Middle loop stays open, and a finite full-cycle loop includes every pass.
    const lifecycle = playout.mode === 'static' ? {} : { lifecycle: { outPoint: 40 } };
    expect(previewElapsedLimitMs(timingScene({ ...lifecycle, playout } as Partial<Scene>))).toBe(
      expected,
    );
  });

  it('B-382 gives truly empty Preview the Canvas Static, Freeze, Middle-loop and Auto-out projection', () => {
    const staticScene = timingScene({
      activeRange: { in: 0, out: 50 },
      frameRange: { in: 0, out: 50 },
      layers: [],
      playout: { mode: 'static', holdSource: 'timed' },
    });
    expect(previewDisplayFrame(staticScene, 50, 0)).toBe(0);
    expect(previewDisplayFrame(staticScene, 50, 500)).toBe(25);
    expect(previewDisplayFrame(staticScene, 50, 1_000)).toBe(50);
    expect(previewElapsedLimitMs(staticScene)).toBe(1_000);

    const freezeScene = timingScene({
      activeRange: { in: 0, out: 50 },
      frameRange: { in: 0, out: 50 },
      lifecycle: { contentStart: 20, outPoint: 40 },
      layers: [],
      playout: { mode: 'manual', holdSource: 'timed', holdBehavior: 'freeze' },
    });
    expect(previewDisplayFrame(freezeScene, 50, 400)).toBe(20);
    expect(previewDisplayFrame(freezeScene, 50, 800)).toBe(40);
    expect(previewDisplayFrame(freezeScene, 50, 2_000)).toBe(40);
    expect(previewElapsedLimitMs(freezeScene)).toBe(1_000);

    const loopScene = timingScene({
      ...freezeScene,
      playout: { mode: 'manual', holdSource: 'timed', holdBehavior: 'loop' },
    });
    expect(previewDisplayFrame(loopScene, 40, 800)).toBe(20);
    expect(previewDisplayFrame(loopScene, 40, 1_180)).toBe(39);
    expect(previewDisplayFrame(loopScene, 40, 1_200)).toBe(20);
    expect(previewDisplayFrame(loopScene, 40, 1_220)).toBe(21);
    expect(previewElapsedLimitMs(loopScene)).toBeNull();

    const automaticFreezeScene = timingScene({
      ...freezeScene,
      lifecycle: { outPoint: 40 },
    });
    expect(previewDisplayFrame(automaticFreezeScene, 40, 2_000)).toBe(40);
    const automaticLoopScene = timingScene({
      ...automaticFreezeScene,
      playout: { mode: 'manual', holdSource: 'timed', holdBehavior: 'loop' },
    });
    // UI seeding does not rewrite runtime semantics: without an authored marker, Middle is empty.
    expect(previewDisplayFrame(automaticLoopScene, 40, 800)).toBe(40);
    expect(previewDisplayFrame(automaticLoopScene, 40, 820)).toBe(40);
    expect(previewDisplayFrame(automaticLoopScene, 40, 2_000)).toBe(40);

    const autoOutScene = timingScene({
      activeRange: { in: 0, out: 50 },
      frameRange: { in: 0, out: 50 },
      lifecycle: { outPoint: 30 },
      layers: [],
      playout: { mode: 'auto-out', holdSource: 'timed', holdMs: 200 },
    });
    expect(previewDisplayFrame(autoOutScene, 50, 700)).toBe(30);
    expect(previewDisplayFrame(autoOutScene, 50, 900)).toBe(35);
    expect(previewDisplayFrame(autoOutScene, 50, 1_200)).toBe(50);
    expect(previewElapsedLimitMs(autoOutScene)).toBe(1_200);
    expect(shouldDeferPreviewNaturalStop(autoOutScene, 250, 1_200)).toBe(true);
    expect(shouldDeferPreviewNaturalStop(autoOutScene, 1_200, 1_200)).toBe(false);

    const animated = timingScene({
      layers: [
        {
          id: 'layer-1',
          name: 'Layer',
          children: [{ animation: { tracks: { opacity: { keyframes: [{}] } } } }],
        },
      ],
    } as unknown as Partial<Scene>);
    expect(previewDisplayFrame(animated, 37, 500)).toBe(37);
    expect(shouldDeferPreviewNaturalStop(animated, 250, 1_000)).toBe(false);

    const animatedAutoOut = timingScene({
      ...animated,
      activeRange: { in: 0, out: 50 },
      frameRange: { in: 0, out: 50 },
      lifecycle: { outPoint: 30 },
      playout: { mode: 'auto-out', holdSource: 'timed', holdMs: 200 },
    });
    expect(previewDisplayFrame(animatedAutoOut, 37, 900)).toBe(37);
    expect(previewElapsedLimitMs(animatedAutoOut)).toBe(1_200);
    expect(
      previewElapsedLimitMs({
        ...animatedAutoOut,
        playout: { mode: 'manual', holdSource: 'timed', holdBehavior: 'loop' },
      }),
    ).toBeNull();
  });

  it('includes Preview session hold/repeat overrides in the authored projection', () => {
    const autoOutScene = timingScene({
      activeRange: { in: 0, out: 50 },
      frameRange: { in: 0, out: 50 },
      lifecycle: { outPoint: 30 },
      layers: [],
      playout: { mode: 'auto-out', holdSource: 'timed', holdMs: 100 },
    });
    expect(previewElapsedLimitMs(autoOutScene, { holdMs: 500 })).toBe(1_500);
    expect(previewDisplayFrame(autoOutScene, 50, 900, { holdMs: 500 })).toBe(30);

    const loopScene = timingScene({
      ...autoOutScene,
      playout: {
        mode: 'loop-cycle',
        holdSource: 'timed',
        holdMs: 0,
        delayMs: 100,
        repeat: 'infinite',
      },
    });
    expect(previewElapsedLimitMs(loopScene, { repeat: 2 })).toBe(2_100);
    expect(previewDisplayFrame(loopScene, 50, 1_050, { repeat: 2 })).toBe(50); // delay
    expect(previewDisplayFrame(loopScene, 50, 1_100, { repeat: 2 })).toBe(0); // pass 2
    expect(previewDisplayFrame(loopScene, 50, 2_100, { repeat: 2 })).toBe(50); // settled
  });

  it('B-380 projects an empty Canvas lifecycle through Intro, Hold and Outro', () => {
    const staticScene = timingScene({
      activeRange: { in: 0, out: 50 },
      frameRange: { in: 0, out: 50 },
      layers: [],
      playout: { mode: 'static', holdSource: 'timed' },
    });
    expect(canvasDisplayFrame(staticScene, 50, 0)).toBe(0);
    expect(canvasDisplayFrame(staticScene, 50, 500)).toBe(25);
    expect(canvasDisplayFrame(staticScene, 50, 1_000)).toBe(50);
    expect(canvasDisplayLimitMs(staticScene)).toBeNull();

    const freezeScene = timingScene({
      activeRange: { in: 0, out: 50 },
      frameRange: { in: 0, out: 50 },
      lifecycle: { contentStart: 20, outPoint: 40 },
      layers: [],
      playout: { mode: 'manual', holdSource: 'timed', holdBehavior: 'freeze' },
    });
    expect(canvasDisplayFrame(freezeScene, 40, 400)).toBe(20);
    expect(canvasDisplayFrame(freezeScene, 40, 800)).toBe(40);
    expect(canvasDisplayFrame(freezeScene, 40, 2_000)).toBe(40);

    const loopScene = timingScene({
      ...freezeScene,
      playout: { mode: 'manual', holdSource: 'timed', holdBehavior: 'loop' },
    });
    expect(canvasDisplayFrame(loopScene, 40, 800)).toBe(20);
    expect(canvasDisplayFrame(loopScene, 40, 820)).toBe(21);
    expect(canvasDisplayFrame(loopScene, 40, 1_180)).toBe(39);
    expect(canvasDisplayFrame(loopScene, 40, 1_200)).toBe(20);
    expect(canvasDisplayFrame(loopScene, 40, 1_220)).toBe(21);

    const automaticFreezeScene = timingScene({
      ...freezeScene,
      lifecycle: { outPoint: 40 },
    });
    expect(canvasDisplayFrame(automaticFreezeScene, 40, 2_000)).toBe(40);
    const automaticLoopScene = timingScene({
      ...automaticFreezeScene,
      playout: { mode: 'manual', holdSource: 'timed', holdBehavior: 'loop' },
    });
    // Canvas mirrors Preview/runtime: a marker-less Middle remains empty at Outro start.
    expect(canvasDisplayFrame(automaticLoopScene, 40, 800)).toBe(40);
    expect(canvasDisplayFrame(automaticLoopScene, 40, 2_000)).toBe(40);

    const autoOutScene = timingScene({
      activeRange: { in: 0, out: 50 },
      frameRange: { in: 0, out: 50 },
      lifecycle: { outPoint: 30 },
      layers: [],
      playout: { mode: 'auto-out', holdSource: 'timed', holdMs: 200 },
    });
    expect(canvasDisplayLimitMs(autoOutScene)).toBe(1_200);
    expect(canvasDisplayFrame(autoOutScene, 50, 700)).toBe(30);
    expect(canvasDisplayFrame(autoOutScene, 50, 900)).toBe(35);
    expect(canvasDisplayFrame(autoOutScene, 50, 1_200)).toBe(50);
  });

  it('D-199 distinguishes a real authored Outro from an immediate-clear picture Sequence', () => {
    const layer = (children: Element[]): Scene['layers'][number] => ({
      id: 'layer-1',
      name: 'Layer',
      visible: true,
      locked: false,
      blendMode: 'normal',
      children,
    });
    const pictureSequence = {
      id: 'pictures',
      type: 'sequence',
      animation: undefined,
    } as unknown as Element;
    const folderScene = timingScene({
      activeRange: { in: 0, out: 160 },
      frameRange: { in: 0, out: 160 },
      lifecycle: { outPoint: 100 },
      layers: [layer([pictureSequence])],
    });
    expect(hasAuthoredOutroMotion(folderScene)).toBe(false);

    const animatedFolderScene = timingScene({
      ...folderScene,
      layers: [
        layer([
          {
            ...pictureSequence,
            animation: {
              tracks: {
                opacity: {
                  keyframes: [
                    { frame: 100, value: 1, easing: 'linear' },
                    { frame: 160, value: 0, easing: 'linear' },
                  ],
                },
              },
            },
          } as Element,
        ]),
      ],
    });
    expect(hasAuthoredOutroMotion(animatedFolderScene)).toBe(true);
  });

  it('puts elapsed status before commands and exposes Stop but no Out', () => {
    const c = renderTransport();
    const elapsed = c.querySelector('output[aria-label="Elapsed preview time"]');
    const commands = c.querySelector('[role="group"][aria-label="Playout commands"]');
    expect(elapsed).not.toBeNull();
    expect(commands).not.toBeNull();
    expect(elapsed?.textContent).toContain('01:02:34');
    expect(c.querySelector('output[aria-label="Preview frame"]')?.textContent).toContain(
      '040 / 100',
    );
    expect(
      elapsed!.compareDocumentPosition(commands!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(c.querySelector('button[title^="Animate out"]')).toBeNull();
    expect([...c.querySelectorAll('button')].some((b) => b.textContent?.includes('Stop'))).toBe(
      true,
    );
  });

  it('keeps Preview command tooltips short and action-oriented', () => {
    const c = renderTransport(false);
    const button = (label: string): HTMLButtonElement | undefined =>
      [...c.querySelectorAll('button')].find((candidate) => candidate.textContent?.includes(label));
    expect(button('Stop')?.title).toBe('Stop and clear');
    expect(button('Previous')?.title).toBe('No previous item');
    expect(button('Next')?.title).toBe('No next item');
    expect(button('Reset')?.title).toBe('Reset preview values');
  });

  it('D-196 switches Presets from the fixed Preview controls', () => {
    const onLookChange = vi.fn();
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => {
      root?.render(
        createElement(PreviewTransport, {
          ready: true,
          lookChoices: [
            { value: 'look-1', label: 'Three boxes' },
            { value: 'look-2', label: 'Single box' },
          ],
          activeLookId: 'look-1',
          onLookChange,
          paused: false,
          canStep: false,
          onPlay: vi.fn(),
          onPause: vi.fn(),
          onStop: vi.fn(),
          onPrevious: vi.fn(),
          onNext: vi.fn(),
          onReset: vi.fn(),
        }),
      );
    });

    const commands = host.querySelector('[role="group"][aria-label="Playout commands"]');
    const picker = host.querySelector('[role="group"][aria-label="Preview preset"]');
    expect(commands).not.toBeNull();
    expect(picker).not.toBeNull();
    if (commands !== null && picker !== null) {
      expect(commands.compareDocumentPosition(picker) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(
        0,
      );
    }
    const first = host.querySelector<HTMLButtonElement>('button[title="Three boxes"]');
    const second = host.querySelector<HTMLButtonElement>('button[title="Single box"]');
    expect(first?.getAttribute('aria-pressed')).toBe('true');
    expect(second?.getAttribute('aria-pressed')).toBe('false');
    act(() => {
      second?.click();
    });
    expect(onLookChange).toHaveBeenCalledWith('look-2');
  });

  it('D-196 shows the selected Preset even when Preview has only one', () => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => {
      root?.render(
        createElement(PreviewTransport, {
          ready: true,
          lookChoices: [{ value: 'look-1', label: 'Only Preset' }],
          activeLookId: 'look-1',
          onLookChange: vi.fn(),
          paused: false,
          canStep: false,
          onPlay: vi.fn(),
          onPause: vi.fn(),
          onStop: vi.fn(),
          onPrevious: vi.fn(),
          onNext: vi.fn(),
          onReset: vi.fn(),
        }),
      );
    });

    const picker = host.querySelector('[role="group"][aria-label="Preview preset"]');
    const only = host.querySelector<HTMLButtonElement>('button[title="Only Preset"]');
    expect(picker).not.toBeNull();
    expect(only?.getAttribute('aria-pressed')).toBe('true');
  });

  it('D-196 omits empty composition and Preset namespaces from Variables', () => {
    const aggregate = {
      fields: [],
      groups: [
        {
          instanceId: 'empty-composition-instance',
          name: 'empty-composition',
          label: 'Empty composition',
          compositionId: 'empty-composition-id',
          aggregate: { fields: [], groups: [] },
        },
        {
          instanceId: 'empty-look-instance',
          name: 'look-empty',
          label: 'look-empty',
          compositionId: 'look-empty-id',
          aggregate: { fields: [], groups: [] },
        },
      ],
    } as AggregatedFields;
    expect(aggregateHasEditableFields(aggregate)).toBe(false);

    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => {
      root?.render(
        createElement(PreviewFieldForm, {
          aggregate,
          values: {},
          onChange: vi.fn(),
        }),
      );
    });

    expect(host.textContent).toContain('Variables');
    expect(host.textContent).toContain('No data fields yet');
    expect(host.textContent).not.toContain('Empty composition');
    expect(host.textContent).not.toContain('look-empty');
  });
});
