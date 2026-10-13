import { describe, expect, it } from 'vitest';
import type { Composition, CompositionElement, Scene } from '@cg/shared-schema';
import { buildScene } from '../src/scene-builder.js';
import { lowerThirdScene } from './fixtures.js';

/**
 * B-129 — the canvas backdrop is an EDITOR affordance and must never reach output.
 *
 * The defect: one field carried two different facts — "let me see my white text
 * while I work" and "this graphic paints a background on air" — and the render path
 * could not tell them apart, so an editing preference went to air as a full-frame
 * card over live video. A lower-third became a fullscreen graphic.
 *
 * These assert the RENDER side of the split. The schema side (the rename and the
 * parse-time normalization of the legacy key) lives in `@cg/shared-schema`'s
 * `scene.test.ts`; the artifact side is in each exporter's own suite.
 */

const TINTED = '#123456';

const withBackdrop = (backdrop: string): Scene =>
  ({ ...lowerThirdScene, editorBackdrop: backdrop }) as Scene;

/** The stage node's inline background, '' when nothing painted it. */
const stageBackground = (scene: Scene, mode: 'author' | 'output'): string =>
  buildScene(scene, document, mode).container.style.background;

describe('B-129 — the editor backdrop never reaches output', () => {
  it('🔴 paints NOTHING in output mode, even with a non-transparent backdrop', () => {
    // The bug, stated as an assertion: this used to paint `#123456` full-frame.
    expect(stageBackground(withBackdrop(TINTED), 'output')).toBe('');
  });

  it('paints the backdrop in author mode, so the editor still works', () => {
    // The affordance is not removed — it is confined. An author who set a backdrop
    // to see white text against something still sees it while editing.
    expect(stageBackground(withBackdrop(TINTED), 'author')).toBe(TINTED);
  });

  it("defaults to output mode, so a caller that forgets can't leak the backdrop", () => {
    // `buildScene`'s default is `'output'`. The safe direction is the default one.
    expect(buildScene(withBackdrop(TINTED)).container.style.background).toBe('');
  });

  it('paints nothing in either mode when the backdrop is transparent', () => {
    expect(stageBackground(withBackdrop('transparent'), 'author')).toBe('');
    expect(stageBackground(withBackdrop('transparent'), 'output')).toBe('');
  });
});

describe('B-129 — "the author wanted a background" stays expressible', () => {
  it('a deliberately placed full-frame shape still renders in OUTPUT', () => {
    // The second acceptance bullet, and the remedy the control now points authors at.
    // `lowerThirdScene` already carries a real solid-filled shape element (`bg`); a
    // full-frame background is that same thing sized to the frame. A real element with
    // a real entry in the scene renders exactly as before — the fix removes the
    // ACCIDENTAL paint, not the deliberate one.
    const { elementMap } = buildScene(withBackdrop('transparent'), document, 'output');
    const node = elementMap.get('bg');
    expect(node, 'the authored shape must be in the output element map').toBeTruthy();
    // #0EA5E9 — the fixture's solid fill, still painted with the backdrop gone.
    expect(node?.style.background).toBe('#0EA5E9');
  });
});

describe('B-129 — a nested composition cannot leak a backdrop either', () => {
  /**
   * A composition instance is the OTHER place a backdrop could reach air: it has its
   * own `editorBackdrop`, applied to the instance inner. THREE separate builders apply
   * it (`buildComposition`, `buildSequenceCompositionItem`, `buildRepeaterRows`), which
   * is why this is asserted rather than assumed — one site left unguarded is a leak
   * that only shows up on hardware.
   */
  const instance: CompositionElement = {
    id: 'inst-1',
    name: 'instance',
    type: 'composition',
    compositionId: 'child-comp',
    transform: {
      position: { x: 0, y: 0 },
      size: { w: 640, h: 360 },
      scale: { x: 1, y: 1 },
      rotation: 0,
      anchor: { x: 0, y: 0 },
    },
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 0,
  };

  const child: Composition = {
    id: 'child-comp',
    name: 'child',
    resolution: { width: 640, height: 360 },
    frameRange: { in: 0, out: 30 },
    editorBackdrop: TINTED,
    layers: [],
  };

  const nestedScene = (): Scene => ({
    ...lowerThirdScene,
    editorBackdrop: 'transparent',
    compositions: [child],
    layers: [
      {
        id: 'l-nested',
        name: 'nested',
        visible: true,
        locked: false,
        blendMode: 'normal',
        children: [instance],
      },
    ],
  });

  const innerBackground = (mode: 'author' | 'output'): string => {
    const { container } = buildScene(nestedScene(), document, mode);
    const inner = container.querySelector<HTMLElement>('.cg-comp-inner');
    expect(inner, 'the composition instance must have rendered').toBeTruthy();
    return inner?.style.background ?? '';
  };

  it("an instance's own backdrop paints NOTHING in output mode", () => {
    expect(innerBackground('output')).toBe('');
  });

  it("an instance's backdrop still paints in author mode", () => {
    expect(innerBackground('author')).toBe(TINTED);
  });
});
