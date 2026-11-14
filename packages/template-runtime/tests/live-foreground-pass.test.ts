import { beforeEach, describe, expect, it } from 'vitest';
import {
  withCgControl,
  type FrameTransitionPhase,
  type LiveFramePlacement,
} from '@cg/shared-schema';
import { createRuntime } from '../src/runtime.js';
import { lowerThirdScene } from './fixtures.js';

describe('D-201 — synchronized live-input foreground pass', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.body.className = '';
  });

  const markedScene = () => {
    const scene = structuredClone(lowerThirdScene);
    const title = scene.layers[0]?.children.find((element) => element.id === 'name');
    if (title === undefined) throw new Error('fixture drift');
    title.liveForeground = true;
    return scene;
  };

  it('background output removes the marked title and keeps ordinary furniture', () => {
    createRuntime(markedScene(), {
      mode: 'output',
      outputPass: 'background',
      skipFontLoad: true,
      installGlobals: false,
    });

    expect(document.querySelector('[data-cg-element-id="name"]')).toBeNull();
    expect(document.querySelector('[data-cg-element-id="bg"]')).not.toBeNull();
  });

  it('foreground output keeps the marked title and removes ordinary furniture', () => {
    createRuntime(markedScene(), {
      mode: 'output',
      outputPass: 'foreground',
      skipFontLoad: true,
      installGlobals: false,
    });

    expect(document.querySelector('[data-cg-element-id="name"]')).not.toBeNull();
    expect(document.querySelector('[data-cg-element-id="bg"]')).toBeNull();
  });

  it('full output preserves the historical single-page render', () => {
    createRuntime(markedScene(), {
      mode: 'output',
      outputPass: 'full',
      skipFontLoad: true,
      installGlobals: false,
    });

    expect(document.querySelector('[data-cg-element-id="name"]')).not.toBeNull();
    expect(document.querySelector('[data-cg-element-id="bg"]')).not.toBeNull();
  });

  it('promotes overlapping text and shapes above a live plate by default', () => {
    const scene = structuredClone(lowerThirdScene);
    const children = scene.layers[0]!.children;
    const title = children.find((element) => element.id === 'name')!;
    const shape = children.find((element) => element.id === 'bg')!;
    if (title.type !== 'text' || shape.type !== 'shape') throw new Error('fixture drift');
    shape.zIndex = -3;
    children.push(
      { ...title, id: 'below', zIndex: -2 },
      {
        id: 'plate',
        name: 'Plate',
        type: 'video-placeholder',
        routeKey: 'guest',
        zIndex: -1,
        visible: true,
        locked: false,
        opacity: 1,
        transform: title.transform,
      },
      { ...title, id: 'behind', liveForeground: false },
      { ...shape, id: 'circle', shape: 'ellipse', zIndex: 2, transform: title.transform },
      {
        ...title,
        id: 'away',
        transform: { ...title.transform, position: { x: 2000, y: 0 } },
      },
    );
    createRuntime(scene, {
      mode: 'output',
      outputPass: 'foreground',
      skipFontLoad: true,
      installGlobals: false,
    });
    expect(
      [...document.querySelectorAll<HTMLElement>('[data-cg-element-id]')].map(
        (node) => node.dataset['cgElementId'],
      ),
    ).toEqual(['name', 'circle']);
  });

  const movableFrameScene = () => {
    const scene = markedScene();
    const layer = scene.layers[0];
    const title = layer?.children.find((element) => element.id === 'name');
    if (layer === undefined || title?.type !== 'text') throw new Error('fixture drift');
    scene.compositions = [
      {
        id: 'frame-doc',
        name: 'Live frame',
        resolution: scene.resolution,
        frameRange: scene.frameRange,
        editorBackdrop: 'transparent',
        fields: scene.fields,
        bindings: scene.bindings,
        layers: [
          {
            ...layer,
            id: 'frame-layer',
            children: [
              {
                id: 'plate',
                name: 'Live input',
                type: 'video-placeholder',
                routeKey: 'guest',
                operatorMove: true,
                transform: title.transform,
                opacity: 1,
                visible: true,
                locked: false,
                zIndex: 0,
              },
              { ...title, padding: 12, backgroundColor: '#133358', zIndex: 1 },
            ],
          },
        ],
      },
    ];
    layer.children = [
      {
        id: 'box',
        name: 'box',
        type: 'composition',
        compositionId: 'frame-doc',
        transform: {
          ...title.transform,
          position: { x: 0, y: 0 },
          size: { w: scene.resolution.width, h: scene.resolution.height },
        },
        opacity: 1,
        visible: true,
        locked: false,
        zIndex: 0,
      },
    ];
    scene.fields = [];
    scene.bindings = [];
    return scene;
  };

  it('moves a move-only frame and its bound title as one artwork without resizing either', async () => {
    const scene = movableFrameScene();
    const runtime = createRuntime(scene, { skipFontLoad: true, installGlobals: false });
    const artwork = document.querySelector<HTMLElement>('[data-cg-frame-artwork="box"]');
    const plate = artwork?.querySelector<HTMLElement>('[data-cg-element-id="plate"]');
    const caption = artwork?.querySelector<HTMLElement>('[data-cg-element-id="name"]');
    if (artwork === null || plate == null || caption == null)
      throw new Error('missing frame artwork');
    expect(plate.style.width).toBe('760px');
    expect(caption.style.paddingLeft).toBe('12px');
    const background = caption.style.backgroundColor;
    expect(background).not.toBe('');

    await runtime.update(
      withCgControl(
        { box: { anchor: 'خبر تهران' } },
        {
          framePlacements: [
            { frameKey: 'box/plate', rect: { x: 210, y: 855, width: 760, height: 60 } },
          ],
        },
      ),
    );
    expect(artwork.style.transform).toBe('matrix(1,0,0,1,90,35)');
    expect(plate.style.width).toBe('760px');
    expect(caption.style.paddingLeft).toBe('12px');
    expect(caption.style.backgroundColor).toBe(background);
    expect(caption.textContent).toContain('خبر تهران');
  });

  it.each(['background', 'foreground'] as const)(
    'moves and fades the %s frame before committing a final placement',
    async (outputPass) => {
      let time = 0;
      let nextHandle = 0;
      const pending = new Map<number, FrameRequestCallback>();
      const timers = new Map<number, { callback: () => void; at: number }>();
      const advanceTo = (target: number): void => {
        time = target;
        for (const [handle, { callback, at }] of timers) {
          if (at > time) continue;
          timers.delete(handle);
          callback();
        }
        const round = [...pending.values()];
        pending.clear();
        for (const callback of round) callback(time);
      };
      const runtime = createRuntime(movableFrameScene(), {
        outputPass,
        skipFontLoad: true,
        installGlobals: false,
        clock: {
          now: () => time,
          raf: (callback) => {
            const handle = ++nextHandle;
            pending.set(handle, callback);
            return handle;
          },
          cancel: (handle) => {
            pending.delete(handle);
          },
          setTimeout: (callback, delay) => {
            const handle = ++nextHandle;
            timers.set(handle, { callback, at: time + delay });
            return handle;
          },
          clearTimeout: (handle) => {
            if (typeof handle === 'number') timers.delete(handle);
          },
        },
      });
      const artwork = document.querySelector<HTMLElement>('[data-cg-frame-artwork="box"]');
      if (artwork === null) throw new Error('Missing frame wrapper');
      const fallback = artwork.querySelector('[data-cg-live-fallback]');
      expect(fallback !== null).toBe(outputPass === 'background');
      const caption = artwork.querySelector('[data-cg-element-id="name"]');
      expect(caption !== null).toBe(outputPass === 'foreground');
      const from = { x: 120, y: 820, width: 760, height: 60 };
      const to = { ...from, x: 320 };
      const target: LiveFramePlacement = { frameKey: 'box/plate', rect: to };
      const phase: FrameTransitionPhase = {
        durationMs: 400,
        delayMs: 40,
        easing: 'easeinquad',
        frames: [{ frameKey: 'box/plate', from, to, fromOpacity: 1, toOpacity: 0 }],
        hideFallbackPlateIds: ['guest'],
      };
      const send = async (
        transition: FrameTransitionPhase | null,
        placements?: LiveFramePlacement[],
      ) =>
        runtime.update(
          withCgControl(
            {},
            {
              frameTransition: transition,
              ...(placements === undefined ? {} : { framePlacements: placements }),
            },
          ),
        );

      await runtime.play({});
      await send(phase);
      if (fallback !== null)
        expect(fallback.hasAttribute('data-cg-frame-transition-hidden')).toBe(true);
      advanceTo(20);
      expect(artwork.style.transform).toBe('matrix(1,0,0,1,0,0)');
      advanceTo(240);
      expect(artwork.style.transform).toBe('matrix(1,0,0,1,50,0)');
      expect(artwork.style.opacity).toBe('0.75');
      advanceTo(440);
      expect(artwork.style.transform).toBe('matrix(1,0,0,1,200,0)');
      expect(artwork.style.opacity).toBe('0');
      await send(null, [target]);
      expect(artwork.style.transform).toBe('matrix(1,0,0,1,200,0)');
      expect(artwork.style.opacity).toBe('');
      if (fallback !== null)
        expect(fallback.hasAttribute('data-cg-frame-transition-hidden')).toBe(false);

      await send({ ...phase, delayMs: 0, durationMs: 0 });
      expect(artwork.style.opacity).toBe('0');
      advanceTo(2_500);
      expect(artwork.style.opacity).toBe('');
      expect(artwork.style.transform).toBe('matrix(1,0,0,1,200,0)');
      await send(phase);
      await runtime.stop();
      expect(artwork.style.opacity).toBe('');
      if (fallback !== null)
        expect(fallback.hasAttribute('data-cg-frame-transition-hidden')).toBe(false);
      advanceTo(3_000);
      expect(artwork.style.transform).toBe('matrix(1,0,0,1,200,0)');
      runtime.remove();
    },
  );

  it.each([true, false])(
    'uses the full plate for foreground ordering with mask editing %s',
    (allowed) => {
      const scene = structuredClone(lowerThirdScene);
      const children = scene.layers[0]?.children;
      const title = children?.find((element) => element.id === 'name');
      if (children === undefined || title?.type !== 'text') throw new Error('Missing test title');
      children.push({
        id: 'plate',
        name: 'Plate',
        type: 'video-placeholder',
        routeKey: 'guest',
        zIndex: title.zIndex - 1,
        visible: true,
        locked: false,
        opacity: 1,
        transform: structuredClone(title.transform),
        allowOperatorMaskEdit: allowed,
        liveMask: { mode: 'inside', rects: [{ x: 0, y: 0, width: 0.25, height: 1 }] },
      });
      title.transform.position.x += 400;
      createRuntime(scene, { outputPass: 'foreground', skipFontLoad: true, installGlobals: false });
      expect(document.querySelector('[data-cg-element-id="name"]') !== null).toBe(allowed);
      expect(document.querySelector('[data-cg-live-fallback]')).toBeNull();
    },
  );

  it.each(['background', 'foreground'] as const)(
    'keeps the outgoing %s preset visible during an authored reframe, then commits its destination',
    async (outputPass) => {
      const scene = movableFrameScene();
      const baseLayer = scene.layers[0];
      const frameDoc = scene.compositions?.[0];
      const box = baseLayer?.children[0];
      const plate = frameDoc?.layers[0]?.children[0];
      if (
        baseLayer === undefined ||
        frameDoc === undefined ||
        box?.type !== 'composition' ||
        plate?.type !== 'video-placeholder'
      )
        throw new Error('Missing frame fixture');
      delete plate.operatorMove;
      const soloBox = { ...box };
      const duoBox = {
        ...box,
        transform: { ...box.transform, scale: { x: 0.5, y: 0.75 }, position: { x: 520, y: 60 } },
      };
      const presets = [
        { id: 'solo', instanceId: 'solo-root', name: 'Solo', frame: soloBox, second: [] },
        {
          id: 'duo',
          instanceId: 'duo-root',
          name: 'Duo',
          frame: duoBox,
          second: [{ ...plate, id: 'second', routeKey: 'second' }],
        },
      ];
      for (const { id, name, frame, second } of presets) {
        scene.compositions?.push({
          ...frameDoc,
          id,
          name,
          layers: [{ ...baseLayer, children: [frame, ...second] }],
        });
      }
      baseLayer.children = presets.map(({ id, instanceId }) => ({
        ...box,
        id: instanceId,
        name: instanceId,
        compositionId: id,
      }));
      scene.lookGroups = [
        {
          id: 'presets',
          defaultLookId: 'solo',
          looks: presets.map(({ id, instanceId, name }) => ({
            id,
            instanceId,
            name,
            entered: { mode: 'cut' },
          })),
        },
      ];

      let time = 0;
      let handle = 0;
      const pending = new Map<number, FrameRequestCallback>();
      const advanceTo = (target: number): void => {
        time = target;
        const round = [...pending.values()];
        pending.clear();
        for (const raf of round) raf(time);
      };
      const runtime = createRuntime(scene, {
        outputPass,
        skipFontLoad: true,
        installGlobals: false,
        clock: {
          now: () => time,
          raf: (cb) => {
            pending.set(++handle, cb);
            return handle;
          },
          cancel: (id) => {
            pending.delete(id);
          },
        },
      });
      const solo = document.querySelector<HTMLElement>('[data-cg-element-id="solo-root"]');
      const duo = document.querySelector<HTMLElement>('[data-cg-element-id="duo-root"]');
      const artwork = solo?.querySelector<HTMLElement>('[data-cg-frame-artwork="solo-root/box"]');
      const destination = duo?.querySelector<HTMLElement>('[data-cg-frame-artwork="duo-root/box"]');
      if (solo == null || duo == null || artwork == null || destination == null)
        throw new Error('Missing preset or frame artwork');
      const fallback = artwork.querySelector('[data-cg-live-fallback]');
      expect(fallback !== null).toBe(outputPass === 'background');
      expect(artwork.querySelector('[data-cg-element-id="name"]') !== null).toBe(
        outputPass === 'foreground',
      );

      const from = { x: 120, y: 820, width: 760, height: 60 };
      const to = { x: 580, y: 675, width: 380, height: 45 };
      const phase: FrameTransitionPhase = {
        durationMs: 400,
        easing: 'linear',
        hideFallbackPlateIds: ['guest'],
        frames: [
          {
            frameKey: 'solo-root/box/plate',
            lookId: 'solo',
            from,
            to,
            fromOpacity: 1,
            toOpacity: 0.6,
          },
        ],
      };
      await runtime.play({});
      await runtime.update(withCgControl({}, { frameTransition: phase }));
      advanceTo(200);
      expect(artwork.style.transform).toBe('');
      await runtime.update(
        withCgControl({}, { frameTransition: { ...phase, authoredPreset: true } }),
      );
      advanceTo(400);
      expect(runtime.activeLookId()).toBe('solo');
      expect(duo.style.display).toBe('none');
      expect(artwork.style.transform).toBe('matrix(0.75,0,0,0.875,260,30)');
      expect(artwork.style.opacity).toBe('0.8');
      if (fallback !== null)
        expect(fallback.hasAttribute('data-cg-frame-transition-hidden')).toBe(true);
      advanceTo(600);
      expect(artwork.style.transform).toBe('matrix(0.5,0,0,0.75,520,60)');

      await runtime.update(
        withCgControl(
          {},
          {
            look: 'duo',
            frameTransition: null,
            presetTransitionCommit: true,
          },
        ),
      );
      expect(runtime.activeLookId()).toBe('duo');
      expect(solo.style.display).toBe('none');
      expect(duo.style.display).not.toBe('none');
      expect(artwork.style.transform).toBe('');
      expect(artwork.style.opacity).toBe('');
      expect(destination.style.transform).toBe('');
      if (fallback !== null)
        expect(fallback.hasAttribute('data-cg-frame-transition-hidden')).toBe(false);
      runtime.remove();
    },
  );
});
