import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CONTROL_LIVE_LAYOUT_DEFAULT_EFFECTS,
  withCgControl,
  type FrameTransitionPhase,
  type LiveFramePlacement,
} from '@cg/shared-schema';
import { createRuntime } from '../src/runtime.js';
import { PLATE_EDGES_MOTION_RATIO } from '../src/frame-placement.js';
import { buildThumbnailScene } from '../src/thumbnail-scene.js';
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

  it('updates New live layout edge compensation through a plate resize', async () => {
    const scene = movableFrameScene();
    const child = scene.compositions?.[0];
    const layer = child?.layers[0];
    const plate = layer?.children[0];
    const box = scene.layers[0]?.children[0];
    if (
      child === undefined ||
      layer === undefined ||
      plate?.type !== 'video-placeholder' ||
      box?.type !== 'composition'
    ) {
      throw new Error('Missing plate fixture');
    }
    const { width, height } = scene.resolution;
    child.id = box.compositionId = 'layout-frame-guest';
    box.transform.size = { w: width / 4, h: height / 2 };
    plate.id = 'guest-plate';
    plate.operatorPlacement = 'free';
    plate.transform = {
      ...box.transform,
      size: { w: width, h: height },
    };
    layer.children.push({
      ...plate,
      id: 'guest-border',
      type: 'shape',
      shape: 'rect',
      stroke: { color: '#ffffff', width: 12 },
      cornerRadius: 36,
      liveForeground: true,
    });
    scene.controlLiveLayout = {
      id: scene.id,
      name: scene.name,
      resolution: scene.resolution,
      frameRate: scene.frameRate,
      frames: [{ id: 'guest', title: 'Guest', border: { color: '#ffffff', width: 12 } }],
      presets: [
        {
          id: 'default',
          name: 'Default',
          frameIds: ['guest'],
          arrangement: 'side-by-side',
          horizontalGap: 0,
          verticalGap: 0,
          reverse: false,
          hiddenTitles: [],
          hiddenFocusTitles: [],
        },
      ],
      defaultPresetId: 'default',
      background: { kind: 'color', color: '#000000' },
      effects: CONTROL_LIVE_LAYOUT_DEFAULT_EFFECTS,
    };
    const runtime = createRuntime(scene, { skipFontLoad: true, installGlobals: false });
    const wrap = document.querySelector<HTMLElement>('[data-cg-frame-artwork="box"]');
    const border = wrap?.querySelector<HTMLElement>('[data-cg-element-id="guest-border"]');
    const picture = wrap?.querySelector<HTMLElement>('[data-cg-live-source="guest"]');
    if (wrap == null || border == null || picture == null) throw new Error('Missing plate DOM');
    expect(border.hasAttribute('data-cg-layout-plate-edges')).toBe(true);
    expect(border.style.borderTopWidth).toBe('12px');
    expect(Number.parseFloat(border.style.borderRadius)).toBe(0);
    expect(picture.style.borderRadius).toBe('');
    expect(picture.style.overflow).toBe('hidden');

    await runtime.update(
      withCgControl(
        {},
        {
          framePlacements: [
            {
              frameKey: 'box/guest-plate',
              rect: { x: 0, y: 0, width: width / 2, height: height / 2 },
            },
          ],
        },
      ),
    );
    expect(wrap.style.getPropertyValue(PLATE_EDGES_MOTION_RATIO)).toBe('0.5');
    await runtime.update(withCgControl({}, { framePlacements: [] }));
    expect(wrap.style.getPropertyValue(PLATE_EDGES_MOTION_RATIO)).toBe('');
  });

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

  it.each(['scoped', 'legacy solo', 'shared graphic'] as const)(
    'hides a scoped title and keeps its data bound (%s)',
    async (mode) => {
      const legacySolo = mode === 'legacy solo';
      const sharedGraphic = mode === 'shared graphic';
      const scene = movableFrameScene();
      const layer = scene.layers[0];
      const box = layer?.children[0];
      const child = scene.compositions?.[0];
      if (layer === undefined || box?.type !== 'composition' || child === undefined)
        throw new Error('Missing frame fixture');

      const presets = [
        { id: 'title-on', name: 'Title on', frame: { ...box } },
        {
          id: 'title-off',
          name: 'Title off',
          frame: { ...box, ...(!legacySolo && { hiddenTextIds: ['name', 'plate'] }) },
        },
      ];
      for (const { id, name, frame } of presets) {
        scene.compositions?.push({ ...child, id, name, layers: [{ ...layer, children: [frame] }] });
      }
      layer.children = presets.map(({ id, name }) => ({
        ...box,
        id,
        name,
        compositionId: id,
        // A direct-text override on the preset root may not reach into its child frame.
        ...(id === 'title-on' && { hiddenTextIds: ['name'] }),
      }));
      scene.lookGroups = [
        {
          id: 'presets',
          defaultLookId: 'title-off',
          looks: presets.map(({ id, name }) => ({
            id,
            name,
            instanceId: id,
            entered: { mode: 'cut' },
          })),
        },
      ];
      if (sharedGraphic) {
        const shot = child.layers[0];
        const title = shot?.children.find((element) => element.type === 'text');
        if (shot === undefined || title === undefined || scene.compositions === undefined)
          throw new Error('Missing graphic fixture');
        scene.compositions.push({
          ...child,
          id: 'graphic-overlay',
          layers: [
            {
              ...shot,
              children: [{ ...title, id: 'graphic-caption', liveForeground: true }],
            },
          ],
        });
        shot.children.push({
          ...box,
          id: 'graphic-instance',
          compositionId: 'graphic-overlay',
          liveForeground: true,
        });
      }

      if (legacySolo || sharedGraphic) {
        scene.controlLiveLayout = {
          id: scene.id,
          name: scene.name,
          resolution: scene.resolution,
          frameRate: scene.frameRate,
          frames: [{ id: 'guest', title: 'Guest' }],
          ...(sharedGraphic && {
            frameAttachments: [
              {
                id: 'graphic',
                frameId: 'guest',
                sourceId: 'a'.repeat(64),
                name: 'Graphic',
                rect: { x: 0, y: 0, width: 1, height: 1 },
              },
            ],
          }),
          presets: presets.map(({ id, name }) => ({
            id,
            name,
            frameIds: ['guest'],
            arrangement: 'side-by-side',
            horizontalGap: 0,
            verticalGap: 0,
            reverse: false,
            hiddenTitles: [],
            hiddenFocusTitles: id === 'title-off' ? ['guest'] : [],
          })),
          defaultPresetId: 'title-off',
          background: { kind: 'color', color: '#000000' },
          effects: CONTROL_LIVE_LAYOUT_DEFAULT_EFFECTS,
        };
      }

      const thumbnail = buildThumbnailScene(scene, document);
      expect(
        thumbnail.querySelector<HTMLElement>('[data-cg-element-id="title-off"]')?.style.display,
      ).not.toBe('none');
      expect(
        thumbnail
          .querySelector('[data-cg-instance-hidden-text]')
          ?.getAttribute('data-cg-element-id'),
      ).toBe('name');
      expect(
        thumbnail
          .querySelector('[data-cg-element-id="plate"]')
          ?.hasAttribute('data-cg-instance-hidden-text'),
      ).toBe(false);

      const runtime = createRuntime(scene, {
        outputPass: 'foreground',
        skipFontLoad: true,
        installGlobals: false,
      });
      const title = (id: string) =>
        document.querySelector<HTMLElement>(
          `[data-cg-element-id="${id}"] [data-cg-element-id="name"]`,
        );
      const hidden = title('title-off');
      const visible = title('title-on');
      if (hidden === null || visible === null) throw new Error('Missing scoped titles');
      expect(hidden.getAttribute('data-cg-instance-hidden-text')).toBe('');
      expect(visible.hasAttribute('data-cg-instance-hidden-text')).toBe(false);
      await runtime.play({});
      expect(hidden.style.display).toBe('none');
      if (sharedGraphic) {
        const graphicCaption = document.querySelector<HTMLElement>(
          '[data-cg-element-id="title-off"] [data-cg-element-id="graphic-caption"]',
        );
        expect(graphicCaption).not.toBeNull();
        expect(graphicCaption?.hasAttribute('data-cg-instance-hidden-text')).toBe(false);
        expect(graphicCaption?.style.display).not.toBe('none');
        const oldView = document.querySelector<HTMLElement>('[data-cg-element-id="title-off"]')!;
        const newView = document.querySelector<HTMLElement>('[data-cg-element-id="title-on"]')!;
        const oldArt = oldView.querySelector<HTMLElement>('.cg-comp-inner')!;
        const newArt = newView.querySelector<HTMLElement>('.cg-comp-inner')!;
        const oldTransform = oldArt.style.transform;
        const newTransform = newArt.style.transform;
        for (const [mode, axis, sign, oldShift, newShift] of [
          ['push', 'x', 1, 'translateX(-960px)', 'translateX(960px)'],
          ['slide-over', 'y', -1, oldTransform, 'translateY(-540px)'],
        ] as const) {
          await runtime.update(
            withCgControl(
              {},
              {
                frameTransition: {
                  authoredPreset: true,
                  destinationLookId: 'title-on',
                  durationMs: 0,
                  easing: 'linear',
                  frames: [],
                  focusSlide: {
                    viewport: { x: 0, y: 0, width: 1920, height: 1080 },
                    axis,
                    sign,
                    mode,
                    fromProgress: 0.5,
                    toProgress: 0.5,
                  },
                },
              },
            ),
          );
          expect(oldArt.contains(graphicCaption)).toBe(true);
          if (mode === 'slide-over') expect(oldArt.style.transform).toBe(oldShift);
          else expect(oldArt.style.transform).toContain(oldShift);
          expect(newArt.style.transform).toContain(newShift);
          expect(newView.style.display).not.toBe('none');
          const edge = axis === 'x' ? '960px' : '540px';
          expect(oldView.style.clipPath).toContain(edge);
          expect(newView.style.clipPath).toContain(edge);
        }
        expect(runtime.setActiveLook('title-on')).toBe(true);
        expect(oldView.style.display).toBe('none');
        expect(newView.style.display).not.toBe('none');
        expect(oldView.style.clipPath).toBe('');
        expect(newView.style.clipPath).toBe('');
        expect(oldArt.style.transform).toBe(oldTransform);
        expect(newArt.style.transform).toBe(newTransform);
        expect(runtime.setActiveLook('title-off')).toBe(true);
      }
      await runtime.update({
        'Title off': { box: { anchor: 'مهمان' } },
        'Title on': { box: { anchor: 'مهمان' } },
      });
      expect(hidden.textContent).toContain('مهمان');
      expect(visible.textContent).toContain('مهمان');
      expect(runtime.setActiveLook('title-on')).toBe(true);
      expect(getComputedStyle(visible).display).not.toBe('none');
      expect(runtime.setActiveLook('title-off')).toBe(true);
      expect(getComputedStyle(hidden).display).toBe('none');
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
        hiddenTextIds: ['name'],
        transform: { ...box.transform, scale: { x: 0.5, y: 0.75 }, position: { x: 520, y: 60 } },
      };
      const departingBox = {
        ...box,
        id: 'departing-box',
        compositionId: 'departing-frame',
      };
      const departingLayer = frameDoc.layers[0];
      const departingTitle = departingLayer?.children.find(({ id }) => id === 'name');
      if (departingLayer === undefined || departingTitle?.type !== 'text')
        throw new Error('Missing title fixture');
      scene.compositions?.push({
        ...frameDoc,
        id: 'departing-frame',
        layers: [
          {
            ...departingLayer,
            children: [
              { ...plate, id: 'departing-a', routeKey: 'departing-a' },
              { ...plate, id: 'departing-b', routeKey: 'departing-b' },
              { ...departingTitle, id: 'departing-title' },
            ],
          },
        ],
      });
      const presets = [
        {
          id: 'solo',
          instanceId: 'solo-root',
          name: 'Solo',
          frame: soloBox,
          second: [departingBox],
        },
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
          layers: [
            {
              ...baseLayer,
              children: [frame, ...second, { ...departingTitle, id: 'standalone-title' }],
            },
          ],
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
      const departing = solo?.querySelector<HTMLElement>(
        '[data-cg-preset-departure-key="solo-root/departing-box"]',
      );
      if (
        solo == null ||
        duo == null ||
        artwork == null ||
        destination == null ||
        departing == null
      )
        throw new Error('Missing preset or frame artwork');
      const hiddenMarker = 'data-cg-frame-transition-hidden';
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
        hidePresetArtworkKeys: [
          'solo-root/departing-box',
          'solo-root/box',
          'solo-root',
          'duo-root/box',
        ],
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
      expect(departing.hasAttribute(hiddenMarker)).toBe(false);
      await runtime.update(
        withCgControl(
          {},
          {
            frameTransition: {
              ...phase,
              authoredPreset: true,
              destinationLookId: 'duo',
              frames: phase.frames.map((frame) => ({ ...frame, to: frame.from, toOpacity: 1 })),
              opacityArtwork: [
                {
                  key: 'solo-root/departing-box',
                  lookId: 'solo',
                  fromOpacity: 1,
                  toOpacity: 0,
                },
              ],
              hidePresetArtworkKeys: [],
            },
          },
        ),
      );
      advanceTo(400);
      expect(departing.style.opacity).toBe('0.5');
      const outgoingTitle = artwork.querySelector('[data-cg-element-id="name"]');
      expect(outgoingTitle?.hasAttribute(hiddenMarker) ?? outputPass === 'background').toBe(true);
      await runtime.update(
        withCgControl(
          {},
          {
            frameTransition: {
              ...phase,
              authoredPreset: true,
              durationMs: 0,
              frames: phase.frames.map((frame) => ({ ...frame, to: frame.from, toOpacity: 1 })),
            },
          },
        ),
      );
      expect(departing.hasAttribute(hiddenMarker)).toBe(true);
      expect(getComputedStyle(departing).display).toBe('none');
      expect(
        solo
          .querySelector('[data-cg-preset-departure-key="solo-root/box"]')
          ?.hasAttribute(hiddenMarker),
      ).toBe(false);
      expect(
        duo
          .querySelector('[data-cg-preset-departure-key="duo-root/box"]')
          ?.hasAttribute(hiddenMarker),
      ).toBe(false);
      expect(solo.hasAttribute(hiddenMarker)).toBe(false);
      await runtime.update(
        withCgControl({}, { frameTransition: { ...phase, authoredPreset: true } }),
      );
      advanceTo(600);
      expect(runtime.activeLookId()).toBe('solo');
      expect(duo.style.display).toBe('none');
      expect(artwork.style.transform).toBe('matrix(0.75,0,0,0.875,260,30)');
      expect(artwork.style.opacity).toBe('0.8');
      expect(departing.hasAttribute(hiddenMarker)).toBe(true);
      if (fallback !== null)
        expect(fallback.hasAttribute('data-cg-frame-transition-hidden')).toBe(true);
      advanceTo(800);
      expect(artwork.style.transform).toBe('matrix(0.5,0,0,0.75,520,60)');

      // An authored underlay omitted from the hold list moves with the artwork.
      // The foreground pass continues to contain no fallback that could cover the input.
      await runtime.update(
        withCgControl(
          {},
          {
            frameTransition: {
              ...phase,
              authoredPreset: true,
              hideFallbackPlateIds: [],
              frames: phase.frames.map((frame) => ({ ...frame, toOpacity: 1 })),
            },
          },
        ),
      );
      advanceTo(1_000);
      expect(artwork.style.transform).toBe('matrix(0.75,0,0,0.875,260,30)');
      expect(artwork.style.opacity).toBe('');
      if (fallback !== null) {
        expect(fallback.hasAttribute(hiddenMarker)).toBe(false);
        expect(getComputedStyle(fallback).display).not.toBe('none');
      }

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
      expect(departing.hasAttribute(hiddenMarker)).toBe(false);
      const incomingTitle = destination.querySelector('[data-cg-element-id="name"]');
      if (incomingTitle !== null) expect(getComputedStyle(incomingTitle).display).toBe('none');
      if (fallback !== null)
        expect(fallback.hasAttribute('data-cg-frame-transition-hidden')).toBe(false);

      const titleHold: FrameTransitionPhase = {
        authoredPreset: true,
        durationMs: 0,
        easing: 'linear',
        frames: [],
        hidePresetTitlePlateIds: ['guest'],
      };
      await runtime.update(
        withCgControl(
          {},
          { look: 'solo', frameTransition: titleHold, presetTransitionCommit: true },
        ),
      );
      expect(runtime.activeLookId()).toBe('solo');
      expect(outgoingTitle?.hasAttribute(hiddenMarker) ?? outputPass === 'background').toBe(true);
      expect(
        solo.querySelector('[data-cg-element-id="standalone-title"]')?.hasAttribute(hiddenMarker),
      ).not.toBe(true);
      const multiPlateTitle = departing.querySelector('[data-cg-element-id="departing-title"]');
      expect(multiPlateTitle?.hasAttribute(hiddenMarker)).not.toBe(true);
      await runtime.update(
        withCgControl(
          {},
          {
            frameTransition: {
              ...titleHold,
              hidePresetTitlePlateIds: ['departing-a', 'departing-b'],
            },
          },
        ),
      );
      expect(multiPlateTitle?.hasAttribute(hiddenMarker) ?? outputPass === 'background').toBe(true);
      expect(outgoingTitle?.hasAttribute(hiddenMarker)).not.toBe(true);
      await runtime.update(withCgControl({}, { frameTransition: titleHold }));
      await runtime.update(withCgControl({}, { frameTransition: null }));
      expect(outgoingTitle?.hasAttribute(hiddenMarker)).not.toBe(true);
      if (outgoingTitle !== null) expect(getComputedStyle(outgoingTitle).display).not.toBe('none');
      await runtime.update(
        withCgControl(
          {},
          { look: 'duo', frameTransition: titleHold, presetTransitionCommit: true },
        ),
      );
      await runtime.update(withCgControl({}, { frameTransition: null }));
      if (incomingTitle !== null) expect(getComputedStyle(incomingTitle).display).toBe('none');

      const update = vi.fn();
      runtime.on('update', update);
      const bind = async (presetEffectId: string): Promise<void> => {
        await runtime.update(withCgControl({}, { look: 'duo', presetEffectId }));
        update.mockClear();
      };
      const restore = (restorePresetEffectId: string) =>
        runtime.update(
          withCgControl(
            { ignored: 'value' },
            {
              restorePresetEffectId,
              restorePresetEffect: { look: 'solo', frameTransition: null },
            },
          ),
        );
      await bind('effect-1');
      await restore('other-effect');
      expect(update).not.toHaveBeenCalled();
      expect(runtime.activeLookId()).toBe('duo');
      await restore('effect-1');
      expect(update).toHaveBeenCalledTimes(1);
      expect(runtime.activeLookId()).toBe('solo');
      update.mockClear();
      await restore('effect-1');
      expect(update).not.toHaveBeenCalled();

      // A normal explicit preset, a Take, or a Stop supersedes a pending recovery.
      await bind('effect-2');
      await runtime.update(withCgControl({}, { look: 'duo' }));
      update.mockClear();
      await restore('effect-2');
      expect(runtime.activeLookId()).toBe('duo');
      expect(update).not.toHaveBeenCalled();
      await bind('effect-3');
      await runtime.play(withCgControl({}, { look: 'duo' }));
      await restore('effect-3');
      expect(runtime.activeLookId()).toBe('duo');
      expect(update).not.toHaveBeenCalled();
      await bind('effect-4');
      await runtime.stop();
      await restore('effect-4');
      expect(runtime.activeLookId()).toBe('duo');
      expect(update).not.toHaveBeenCalled();
      runtime.remove();
    },
  );
});
