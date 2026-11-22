import {
  CONTROL_LIVE_LAYOUT_DEFAULT_EFFECTS,
  ControlLiveLayoutSchema,
  FrameTransitionPhaseSchema,
  controlLiveLayoutFocusLookId,
  type LiveSourceRect,
} from '@cg/shared-schema';
import type { TemplateLook } from '@cg/shared-ipc';
import { describe, expect, it } from 'vitest';
import { rehearsalPresetPlan } from '../src/renderer/features/monitors/rehearsalPresetEffects.js';

const raster = { width: 1920, height: 1080 };
const left = { x: 120, y: 60, width: 480, height: 270 };
const right = { x: 800, y: 120, width: 960, height: 540 };

function preset(id: string, rects: Record<string, LiveSourceRect>) {
  const routes = Object.keys(rects);
  const look: TemplateLook = {
    id,
    name: id,
    entered: { mode: 'cut' },
    rects,
    transitionFrames: Object.fromEntries(
      routes.map((route) => [
        route,
        {
          frameKey: `${id}/${route}/picture`,
          elementId: route,
          artworkId: `${route}/artwork`,
        },
      ]),
    ),
    transitionDepartureGroups: Object.fromEntries(
      routes.map((route) => [`${id}/${route}`, [route]]),
    ),
  };
  return { look, rects, plates: [] };
}

describe('PVW preset arrivals', () => {
  const before = preset('before', { departing: left, retained: right });
  const after = preset('after', { arriving: right, retained: left });
  const effect = { motion: 'linear', fade: false, durationMs: 240 } as const;

  it('prepares the entering artwork invisibly, then moves it from its own edge while fading', () => {
    const plan = rehearsalPresetPlan(
      before,
      after,
      { ...effect, exitDirection: 'up', enterDirection: 'right' },
      40,
      raster,
    );

    expect(plan?.prepareEnter).toMatchObject({
      durationMs: 0,
      frames: [],
      opacityArtwork: [
        {
          key: 'after/arriving',
          lookId: 'after',
          fromOpacity: 0,
          toOpacity: 0,
        },
      ],
    });
    expect(plan?.exit[0]?.frames).toContainEqual({
      frameKey: 'before/departing/picture',
      lookId: 'before',
      from: left,
      to: { ...left, y: left.y - raster.height },
      fromOpacity: 1,
      toOpacity: 1,
    });
    expect(plan?.enter).toMatchObject({
      frames: [
        {
          frameKey: 'after/arriving/picture',
          lookId: 'after',
          from: { ...right, x: right.x + raster.width },
          to: right,
          fromOpacity: 1,
          toOpacity: 1,
        },
      ],
      opacityArtwork: [
        {
          key: 'after/arriving',
          lookId: 'after',
          fromOpacity: 0,
          toOpacity: 1,
        },
      ],
    });
    for (const phase of [...plan!.exit, plan!.prepareEnter, plan!.enter]) {
      expect(FrameTransitionPhaseSchema.safeParse(phase).success).toBe(true);
      expect(phase?.hidePresetTitlePlateIds).toBeUndefined();
    }
  });

  it('keeps a fade-only arrival free of geometry changes and preparation updates', () => {
    const plan = rehearsalPresetPlan(before, after, effect, 40, raster);
    expect(plan?.prepareEnter).toBeUndefined();
    expect(plan?.enter).toMatchObject({
      frames: [],
      opacityArtwork: [
        {
          key: 'after/arriving',
          lookId: 'after',
          fromOpacity: 0,
          toOpacity: 1,
        },
      ],
    });
  });

  it('fades a retained title in while its border fades out on return from Focus', () => {
    const layout = ControlLiveLayoutSchema.parse({
      id: 'layout',
      name: 'Panel',
      resolution: raster,
      frameRate: 25,
      frames: [
        { id: 'host', title: 'Host' },
        { id: 'guest', title: 'Guest' },
      ],
      presets: [
        {
          id: 'panel',
          name: 'Panel',
          frameIds: ['host', 'guest'],
          arrangement: 'side-by-side',
          horizontalGap: 0,
          verticalGap: 0,
          reverse: false,
          hiddenTitles: [],
          hiddenFocusTitles: ['host'],
          hiddenBorders: ['host'],
        },
      ],
      defaultPresetId: 'panel',
      background: { kind: 'none' },
      effects: CONTROL_LIVE_LAYOUT_DEFAULT_EFFECTS,
    });
    const focus = preset(controlLiveLayoutFocusLookId('panel', 'host'), {
      host: { x: 0, y: 0, ...raster },
    });
    const panel = preset('panel', { host: left, guest: right });

    for (const [from, to, start, end] of [
      [focus, panel, 0, 1],
      [panel, focus, 1, 0],
    ] as const) {
      const plan = rehearsalPresetPlan(from, to, effect, 40, raster, layout);
      const movement = plan?.exit.filter(
        ({ decorationOpacity }) => decorationOpacity !== undefined,
      );
      expect(movement?.[0]?.decorationOpacity?.[0]).toMatchObject({
        plateId: 'host',
        title: { fromOpacity: start },
        border: { fromOpacity: 1 - start },
      });
      expect(movement?.at(-1)?.decorationOpacity?.[0]).toMatchObject({
        title: { toOpacity: end },
        border: { toOpacity: 1 - end },
      });
      expect(movement?.every((phase) => FrameTransitionPhaseSchema.safeParse(phase).success)).toBe(
        true,
      );
    }
  });
});
