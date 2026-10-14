import { describe, expect, it } from 'vitest';
import {
  AssetMetaSchema,
  AudioElementSchema,
  ElementSchema,
  hasSoundEffects,
  type Composition,
  type Scene,
} from '../src/index.js';

/**
 * `D-165` — the AUDIO element and asset: additive schema (an older scene parses unchanged, a new
 * element round-trips), the volume range, and THE ONE predicate CG Control's speaker mark reads.
 */

const T = {
  position: { x: 0, y: 0 },
  size: { w: 0, h: 0 },
  scale: { x: 1, y: 1 },
  rotation: 0,
  anchor: { x: 0.5, y: 0.5 },
};

function audio(id: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    name: id,
    type: 'audio',
    transform: T,
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 0,
    assetId: 'asset-whoosh',
    durationMs: 900,
    ...over,
  };
}

function scene(children: Record<string, unknown>[], compositions?: unknown[]): Scene {
  return {
    layers: [{ id: 'L', name: 'L', visible: true, locked: false, blendMode: 'normal', children }],
    ...(compositions !== undefined ? { compositions } : {}),
  } as unknown as Scene;
}

const comp = (id: string, children: Record<string, unknown>[]): unknown => ({
  id,
  name: id,
  layers: [
    { id: `${id}-L`, name: 'L', visible: true, locked: false, blendMode: 'normal', children },
  ],
});

describe('D-165 — the audio element schema', () => {
  it('parses with its defaults: start at the entrance, 0 dB, no fades', () => {
    const el = AudioElementSchema.parse(audio('a'));
    expect(el.start).toEqual({ at: 'entrance' });
    expect(el.volumeDb).toBe(0);
    expect('fadeInMs' in el).toBe(false);
  });

  it('round-trips through the element union, every start kind', () => {
    for (const start of [{ at: 'entrance' }, { at: 'exit' }, { at: 'time', ms: 1500 }]) {
      const el = ElementSchema.parse(
        audio('a', { start, volumeDb: -12, fadeInMs: 40, fadeOutMs: 200 }),
      );
      expect(el).toMatchObject({
        type: 'audio',
        start,
        volumeDb: -12,
        fadeInMs: 40,
        fadeOutMs: 200,
      });
      expect(ElementSchema.parse(JSON.parse(JSON.stringify(el)))).toEqual(el);
    }
  });

  it('🔴 the volume is −60…+6 dB; outside it is refused', () => {
    expect(AudioElementSchema.safeParse(audio('a', { volumeDb: -60 })).success).toBe(true);
    expect(AudioElementSchema.safeParse(audio('a', { volumeDb: 6 })).success).toBe(true);
    expect(AudioElementSchema.safeParse(audio('a', { volumeDb: 6.5 })).success).toBe(false);
    expect(AudioElementSchema.safeParse(audio('a', { volumeDb: -61 })).success).toBe(false);
    expect(
      AudioElementSchema.safeParse(audio('a', { start: { at: 'time', ms: -1 } })).success,
    ).toBe(false);
  });

  it('an asset of kind audio carries its measurements; an older asset parses unchanged', () => {
    const base = {
      assetId: 'x',
      filename: 'whoosh.wav',
      sha256: 'a'.repeat(64),
      byteSize: 10,
      workingPath: 'p',
    };
    const meta = AssetMetaSchema.parse({
      ...base,
      kind: 'audio',
      audio: {
        sourceFilename: 'whoosh.mp3',
        durationMs: 900,
        peakDbfs: -3.2,
        sampleRate: 48000,
        channels: 2,
      },
    });
    expect(meta.audio?.peakDbfs).toBe(-3.2);
    expect(AssetMetaSchema.parse({ ...base, kind: 'image' })).not.toHaveProperty('audio');
    // Digital silence is a floor, never −∞ (JSON has none).
    expect(
      AssetMetaSchema.safeParse({
        ...base,
        kind: 'audio',
        audio: {
          sourceFilename: 's',
          durationMs: 1,
          peakDbfs: -121,
          sampleRate: 48000,
          channels: 2,
        },
      }).success,
    ).toBe(false);
  });
});

describe('D-165 — hasSoundEffects, the one predicate', () => {
  it('🔴 a visible sound anywhere the runtime reaches is a sound; none is none', () => {
    expect(hasSoundEffects(scene([audio('a')]), undefined)).toBe(true);
    expect(hasSoundEffects(scene([]), undefined)).toBe(false);
  });

  it('B-034 — a hidden sound, or a sound under a hidden instance, is not', () => {
    expect(hasSoundEffects(scene([audio('a', { visible: false })]), undefined)).toBe(false);
    const comps = [comp('c', [audio('a')])] as Composition[];
    const hiddenInstance = {
      ...audio('i'),
      type: 'composition',
      compositionId: 'c',
      visible: false,
    };
    expect(hasSoundEffects(scene([hiddenInstance]), comps)).toBe(false);
  });

  it('reaches containers, composition instances, repeater rows and sequence composition items', () => {
    const comps = [comp('c', [audio('a')])] as Composition[];
    const container = { ...audio('box'), type: 'container', clip: false, children: [audio('a')] };
    expect(hasSoundEffects(scene([container]), undefined)).toBe(true);
    for (const type of ['composition', 'repeater']) {
      expect(hasSoundEffects(scene([{ ...audio('i'), type, compositionId: 'c' }]), comps)).toBe(
        true,
      );
    }
    const seq = {
      ...audio('s'),
      type: 'sequence',
      items: [{ kind: 'composition', id: 'it', compositionId: 'c' }],
    };
    expect(hasSoundEffects(scene([seq]), comps)).toBe(true);
  });

  it('a composition cycle terminates', () => {
    const comps = [
      comp('c', [{ ...audio('i'), type: 'composition', compositionId: 'd' }]),
      comp('d', [{ ...audio('j'), type: 'composition', compositionId: 'c' }]),
    ] as Composition[];
    expect(
      hasSoundEffects(scene([{ ...audio('r'), type: 'composition', compositionId: 'c' }]), comps),
    ).toBe(false);
  });
});
