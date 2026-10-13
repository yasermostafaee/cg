import { describe, it, expect } from 'vitest';
import type { Scene } from '@cg/shared-schema';
import { buildScene } from '../src/scene-builder.js';

/**
 * B-134 — the editor backdrop paints on the editing CANVAS and nowhere else.
 *
 * B-129 established that the backdrop is an EDITOR affordance that must never reach
 * air, and gated it on `mode === 'author'`. That left one surface wrong: the Designer's
 * **Preview modal** also boots in `'author'` mode — deliberately, because it cannot
 * show real live video either, so a Live Source must still paint its SMPTE bars there.
 * The modal is a preview of AIR, so it was showing a backdrop air will never show.
 *
 * 🔴 The two facts therefore CANNOT share one flag, and that is the whole reason
 * `paintEditorBackdrop` exists as a second axis instead of a third `RenderMode`:
 * the modal needs `'author'` and "no backdrop" simultaneously.
 */

const BACKDROP = '#1a2b3c';

function sceneWith(backdrop: Scene['editorBackdrop']): Scene {
  return {
    schemaVersion: 1,
    id: 'scene-backdrop',
    name: 'backdrop',
    templateType: 'lower-third',
    resolution: { width: 1920, height: 1080 },
    frameRate: 50,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 50 },
    editorBackdrop: backdrop,
    layers: [],
    fields: [],
    bindings: [],
    fonts: [],
    compositions: [],
    metadata: { createdAt: '2026-08-11T00:00:00.000Z', updatedAt: '2026-08-11T00:00:00.000Z' },
  };
}

function stageBackground(mode: 'author' | 'output', paintEditorBackdrop?: boolean): string {
  const built =
    paintEditorBackdrop === undefined
      ? buildScene(sceneWith(BACKDROP), document, mode)
      : buildScene(sceneWith(BACKDROP), document, mode, paintEditorBackdrop);
  return built.container.style.background;
}

describe('B-134 — which surface paints the editor backdrop', () => {
  it('the editing canvas paints it — author mode, backdrop axis on', () => {
    expect(stageBackground('author', true)).toBe(BACKDROP);
  });

  it('the Preview modal does NOT — author mode, backdrop axis off', () => {
    // The modal keeps `'author'` (bars still paint) and suppresses only the backdrop.
    // This is the assertion the two-axis design exists to make possible.
    expect(stageBackground('author', false)).toBe('');
  });

  it('output paints nothing, with the axis either way (B-129 stands)', () => {
    expect(stageBackground('output', true)).toBe('');
    expect(stageBackground('output', false)).toBe('');
  });

  it('the axis defaults to ON, so no existing author-mode caller changes meaning', () => {
    expect(stageBackground('author')).toBe(BACKDROP);
  });

  it('a transparent backdrop paints nothing on any surface', () => {
    expect(
      buildScene(sceneWith('transparent'), document, 'author', true).container.style.background,
    ).toBe('');
  });
});
