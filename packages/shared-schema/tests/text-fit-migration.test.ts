import { describe, expect, it } from 'vitest';
import {
  SCENE_MIGRATIONS,
  migrateScene,
  migrateScenePaths,
  migrateTextFit,
  SceneSchema,
  type Element,
  type Scene,
  type TextElement,
} from '../src/index.js';

/**
 * 🔴 `TEXT-FIT-01` (`B-147`) — three spellings of "make the text fit" become ONE (`fitMode:
 * 'shrink-to-fit'`), by a REGISTERED migration that every load runs. Old files open with the same
 * intent; a text that did not ask for fit is the same object afterwards.
 */

function text(over: Record<string, unknown> = {}): TextElement {
  return {
    id: 't',
    name: 't',
    type: 'text',
    text: 'سارا نادری',
    transform: {
      position: { x: 0, y: 0 },
      size: { w: 400, h: 70 },
      scale: { x: 1, y: 1 },
      rotation: 0,
      anchor: { x: 0, y: 0 },
    },
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 0,
    font: {
      family: 'Vazirmatn',
      weight: 700,
      style: 'normal',
      size: 50,
      lineHeight: 1.2,
      letterSpacing: 0,
    },
    color: '#ffffff',
    align: 'start',
    direction: 'rtl',
    fitMode: 'fixed',
    overflow: 'clip',
    ...over,
  } as TextElement;
}

function scene(children: Element[], compositions?: Scene['compositions']): Scene {
  return {
    schemaVersion: 1,
    id: 's',
    name: 's',
    templateType: 'lower-third',
    resolution: { width: 1920, height: 1080 },
    frameRate: 50,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 50 },
    editorBackdrop: 'transparent',
    layers: [{ id: 'l', name: 'l', visible: true, locked: false, blendMode: 'normal', children }],
    ...(compositions === undefined ? {} : { compositions }),
    fields: [],
    bindings: [],
    fonts: [],
    metadata: { createdAt: '2026-10-15T00:00:00.000Z', updatedAt: '2026-10-15T00:00:00.000Z' },
  } as unknown as Scene;
}

const only = (s: Scene): TextElement => s.layers[0]?.children[0] as TextElement;

describe('TEXT-FIT-01 — the one spelling, and intent preserved', () => {
  it('autoSqueeze: true on a fixed box → shrink-to-fit, the legacy key gone', () => {
    const out = only(migrateTextFit(scene([text({ autoSqueeze: true })])));
    expect(out.fitMode).toBe('shrink-to-fit');
    expect(out.overflow).toBe('clip');
    expect('autoSqueeze' in out).toBe(false);
  });

  it('overflow: shrink on a fixed box → shrink-to-fit, clipping past the minimum', () => {
    const out = only(migrateTextFit(scene([text({ overflow: 'shrink' })])));
    expect(out.fitMode).toBe('shrink-to-fit');
    expect(out.overflow).toBe('clip');
  });

  it('on an AUTOSIZE box both are moot: the box keeps growing, only the legacy spelling goes', () => {
    const out = only(
      migrateTextFit(scene([text({ fitMode: 'autosize', autoSqueeze: true, overflow: 'shrink' })])),
    );
    expect(out.fitMode).toBe('autosize');
    expect(out.overflow).toBe('clip');
    expect('autoSqueeze' in out).toBe(false);
  });

  it('autoSqueeze: false asked for nothing — its look is unchanged, the key dropped', () => {
    const out = only(migrateTextFit(scene([text({ autoSqueeze: false, overflow: 'ellipsis' })])));
    expect(out.fitMode).toBe('fixed');
    expect(out.overflow).toBe('ellipsis');
    expect('autoSqueeze' in out).toBe(false);
  });

  it('🔴 a text that asked for none of it is the SAME object — and so is the whole scene', () => {
    const plain = scene([
      text(),
      text({ id: 't2', fitMode: 'shrink-to-fit', overflow: 'ellipsis' }),
    ]);
    expect(migrateTextFit(plain)).toBe(plain);
    expect(migrateScene(plain)).toBe(plain);
  });

  it('reaches containers and compositions, and is idempotent', () => {
    const container = {
      id: 'c',
      name: 'c',
      type: 'container',
      transform: text().transform,
      opacity: 1,
      visible: true,
      locked: false,
      zIndex: 0,
      children: [text({ id: 'inner', autoSqueeze: true })],
    } as unknown as Element;
    const s = scene([container], [
      {
        id: 'comp',
        name: 'Comp',
        layers: [
          {
            id: 'cl',
            name: 'cl',
            visible: true,
            locked: false,
            blendMode: 'normal',
            children: [text({ id: 'nested', overflow: 'shrink' })],
          },
        ],
        fields: [],
        bindings: [],
      },
    ] as unknown as Scene['compositions']);
    const once = migrateTextFit(s);
    const inner = (once.layers[0]?.children[0] as { children: TextElement[] }).children[0];
    const nested = once.compositions?.[0]?.layers[0]?.children[0] as TextElement;
    expect(inner?.fitMode).toBe('shrink-to-fit');
    expect(nested.fitMode).toBe('shrink-to-fit');
    expect(migrateTextFit(once)).toBe(once);
  });

  it('a migrated scene still parses, and nothing in it spells fit the old way', () => {
    const out = migrateScene(
      scene([text({ autoSqueeze: true }), text({ id: 't2', overflow: 'shrink' })]),
    );
    expect(SceneSchema.safeParse(out).success).toBe(true);
    const json = JSON.stringify(out);
    expect(json).not.toContain('autoSqueeze');
    expect(json).not.toContain('"overflow":"shrink"');
  });

  it('the registry runs the path migration FIRST and the text-fit migration after it', () => {
    expect(SCENE_MIGRATIONS).toEqual([migrateScenePaths, migrateTextFit]);
  });
});
