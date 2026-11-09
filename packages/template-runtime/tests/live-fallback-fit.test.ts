/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { withCgControl, type FieldValues, type Scene } from '@cg/shared-schema';
import { createRuntime } from '../src/runtime.js';

const none = {} as FieldValues;

function scene(): Scene {
  return {
    schemaVersion: 1,
    id: 'live-fallback',
    name: 'Live fallback',
    templateType: 'custom',
    resolution: { width: 1920, height: 1080 },
    frameRate: 50,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 50 },
    editorBackdrop: 'transparent',
    layers: [
      {
        id: 'L1',
        name: 'main',
        visible: true,
        locked: false,
        blendMode: 'normal',
        children: [
          {
            id: 'plate-1',
            name: 'Plate 1',
            type: 'video-placeholder',
            visible: true,
            locked: false,
            opacity: 1,
            zIndex: 0,
            transform: {
              position: { x: 100, y: 100 },
              size: { w: 800, h: 600 },
              scale: { x: 1, y: 1 },
              rotation: 0,
              anchor: { x: 0, y: 0 },
            },
            routeKey: 'plate-1',
            fallbackKind: 'bars',
          },
        ],
      },
    ],
    fields: [],
    bindings: [],
    fonts: [],
    metadata: { createdAt: '2026-11-08T00:00:00.000Z', updatedAt: '2026-11-08T00:00:00.000Z' },
  } as unknown as Scene;
}

afterEach(() => {
  document.body.innerHTML = '';
});

const fallback = (): HTMLElement =>
  document.querySelector<HTMLElement>('[data-cg-live-fallback="plate-1"]') as HTMLElement;

describe('R-105 — the authored background covers the whole plate', () => {
  it('fills the space around a contained source before play reveals the page', async () => {
    const runtime = createRuntime(scene(), { skipFontLoad: true });
    await runtime.play(
      withCgControl(none, { plates: { 'plate-1': { aspect: 16 / 9, mode: 'contain' } } }),
    );
    expect(fallback().style.left).toBe('0px');
    expect(fallback().style.top).toBe('0px');
    expect(fallback().style.width).toBe('100%');
    expect(fallback().style.height).toBe('100%');
  });

  it('keeps the background when the Bridge changes fit or the operator updates fields', async () => {
    const runtime = createRuntime(scene(), { skipFontLoad: true });
    await runtime.play(
      withCgControl(none, { plates: { 'plate-1': { aspect: 16 / 9, mode: 'contain' } } }),
    );
    await runtime.update(
      withCgControl(none, { plates: { 'plate-1': { aspect: 16 / 9, mode: 'cover' } } }),
    );
    expect(fallback().style.left).toBe('0px');
    expect(fallback().style.top).toBe('0px');
    expect(fallback().style.width).toBe('100%');
    expect(fallback().style.height).toBe('100%');
    await runtime.update({ headline: 'unchanged fit' } as unknown as FieldValues);
    expect(fallback().style.height).toBe('100%');
  });
});
