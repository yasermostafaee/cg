import { describe, expect, it } from 'vitest';
import { migrateGlobalFieldsToCompositions, SceneSchema } from '@cg/shared-schema';
import { anim, EASE, kf, kfLinear, track } from './anim.js';
import { logoBugScene } from './logo-bug.js';

/** Owner project saved 2026-11-04T17:50:58.576Z; its image and font bytes are unchanged. */
describe('logo-bug owner-authored revision', () => {
  const mark = logoBugScene.compositions?.find(
    (composition) => composition.id === 'comp-logo-mark',
  );
  const root = logoBugScene.compositions?.find((composition) => composition.id === 'comp-logo-bug');

  it('keeps only the replaceable image and lower wordmark, without separator or sub-tag', () => {
    expect(SceneSchema.safeParse(logoBugScene).success).toBe(true);
    expect(mark?.layers.flatMap((layer) => layer.children).map((element) => element.id)).toEqual([
      'lb-mark',
      'lb-word',
    ]);
    const word = mark?.layers[0]?.children.find((element) => element.id === 'lb-word');
    expect(word).toMatchObject({
      type: 'text',
      text: 'شبکه جدید',
      transform: { position: { x: 28, y: 50 }, size: { w: 274, h: 44 } },
    });
    expect(word?.animation?.tracks['position.x']).toEqual(
      track(
        kf(32, 44, EASE.outExpo),
        kfLinear(44, 28),
        kf(54, 28, EASE.outExpo),
        kf(74, 28, EASE.inCubic),
        kf(92, 44, EASE.inCubic),
      ),
    );
    expect(word?.animation?.tracks.opacity).toEqual(
      track(kf(32, 0), kf(52, 1), kf(74, 1), kf(92, 0)),
    );
  });

  it('preserves the image sting, parent placement and independent eight-second timed loop', () => {
    const image = mark?.layers[0]?.children.find((element) => element.id === 'lb-mark');
    expect(image).toMatchObject({
      type: 'image',
      assetId: 'apasai-logo',
      fit: 'contain',
      transform: { position: { x: 346, y: 26 }, size: { w: 76, h: 76 } },
    });
    expect(image?.animation).toEqual(
      anim({
        rotation: track(
          kf(8, -18, EASE.outExpo),
          kf(58, 0, EASE.outExpo),
          kf(74, 0, EASE.inCubic),
          kf(112, 18, EASE.inCubic),
        ),
        'scale.x': track(kf(8, 0.35, EASE.outBack), kf(34, 1, EASE.outBack)),
        'scale.y': track(kf(8, 0.35, EASE.outBack), kf(34, 1, EASE.outBack)),
        opacity: track(kf(8, 0), kf(20, 1), kf(100, 1), kf(114, 0)),
      }),
    );
    expect(mark).toMatchObject({
      resolution: { width: 448, height: 144 },
      frameRange: { in: 0, out: 120 },
      lifecycle: { outPoint: 70, contentStart: 5 },
      playout: { mode: 'loop-cycle', holdSource: 'timed', holdMs: 8000, repeat: 'infinite' },
    });
    expect(root).toMatchObject({
      resolution: { width: 1920, height: 1080 },
      frameRange: { in: 0, out: 132 },
      lifecycle: { outPoint: 70, contentStart: 5 },
      playout: { mode: 'manual' },
    });
    expect(root?.layers[0]?.children[0]).toMatchObject({
      id: 'lb-inst',
      transform: { position: { x: 1392, y: 40 }, size: { w: 448, h: 144 } },
    });
  });

  it('retains the ordinary channel data key and removes the deleted tag field and binding', () => {
    const loaded = migrateGlobalFieldsToCompositions(logoBugScene);
    const scoped = loaded.compositions?.find((composition) => composition.id === 'comp-logo-mark');
    expect(scoped?.fields).toEqual([
      {
        id: 'channel',
        label: 'Channel (نام شبکه)',
        required: true,
        type: 'text',
        direction: 'rtl',
        default: 'شبکه جدید',
      },
    ]);
    expect(scoped?.bindings).toEqual([
      { fieldId: 'channel', target: { kind: 'text', elementId: 'lb-word' } },
    ]);
    expect(loaded.fields).toEqual([]);
    expect(loaded.bindings).toEqual([]);
  });
});
