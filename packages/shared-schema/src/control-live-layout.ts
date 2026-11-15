import { z } from 'zod';
import { LiveSourceIdSchema } from './elements.js';
import {
  FRAME_TRANSITION_DEFAULT_MS,
  FRAME_TRANSITION_MAX_MS,
  FRAME_TRANSITION_MIN_MS,
  FrameTransitionSchema,
} from './frame-transition.js';
import {
  DEFAULT_INPUT_SLIDE_DIRECTION,
  InputTransitionDirectionSchema,
} from './input-transition.js';
import { calculateLiveSourceAutoLayout } from './live-source-auto-layout.js';
import type { LiveSourceRect } from './live-source.js';
import {
  FrameRateSchema,
  HexColorSchema,
  IdSchema,
  ResolutionSchema,
  type Resolution,
} from './primitives.js';

export const CONTROL_LIVE_LAYOUT_MAX_FRAMES = 4;

const isFieldNamespaceId = (id: string): boolean =>
  !Object.prototype.hasOwnProperty.call(Object.prototype, id);

const ControlLiveLayoutFrameIdSchema = LiveSourceIdSchema.max(64).refine(isFieldNamespaceId);

const ControlLiveLayoutFrameSchema = z.object({
  id: ControlLiveLayoutFrameIdSchema,
  /** Catalog id chosen by the operator. The logical frame id stays stable across all presets. */
  sourceId: z.string().min(1).max(64).optional(),
  title: z.string().max(120),
});
export type ControlLiveLayoutFrame = z.infer<typeof ControlLiveLayoutFrameSchema>;

const ControlLiveLayoutArrangementSchema = z.enum([
  'side-by-side',
  'top-and-bottom',
  'grid-top',
  'grid-bottom',
  'host-and-guests',
]);
export type ControlLiveLayoutArrangement = z.infer<typeof ControlLiveLayoutArrangementSchema>;

const ControlLiveLayoutPresetSchema = z.object({
  // Preset ids and frame ids exclude the separator used by the derived Focus ids.
  id: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-zA-Z0-9_-]+$/)
    .refine(isFieldNamespaceId),
  name: z.string().trim().min(1).max(80),
  frameIds: z.array(ControlLiveLayoutFrameIdSchema).min(1).max(CONTROL_LIVE_LAYOUT_MAX_FRAMES),
  arrangement: ControlLiveLayoutArrangementSchema,
  horizontalGap: z.number().finite().nonnegative(),
  verticalGap: z.number().finite().nonnegative(),
  reverse: z.boolean(),
  hiddenTitles: z.array(ControlLiveLayoutFrameIdSchema).max(CONTROL_LIVE_LAYOUT_MAX_FRAMES),
  hiddenFocusTitles: z.array(ControlLiveLayoutFrameIdSchema).max(CONTROL_LIVE_LAYOUT_MAX_FRAMES),
});
export type ControlLiveLayoutPreset = z.infer<typeof ControlLiveLayoutPresetSchema>;

const ControlLiveLayoutBackgroundSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('color'), color: HexColorSchema }),
  z.object({
    kind: z.literal('image'),
    name: z.string().min(1).max(255),
    mime: z.enum(['image/png', 'image/jpeg', 'image/webp', 'image/gif']),
  }),
  z.object({
    kind: z.literal('video'),
    name: z.string().min(1).max(255),
    mime: z.enum(['video/webm', 'video/mp4']),
    durationMs: z.number().finite().positive(),
  }),
]);
export type ControlLiveLayoutBackground = z.infer<typeof ControlLiveLayoutBackgroundSchema>;

const ControlLiveLayoutEffectsSchema = z.object({
  focus: FrameTransitionSchema,
  switch: z.object({
    mode: z.enum(['motion', 'push', 'slide-over']),
    direction: InputTransitionDirectionSchema,
    durationMs: z.number().int().min(FRAME_TRANSITION_MIN_MS).max(FRAME_TRANSITION_MAX_MS),
  }),
});
export type ControlLiveLayoutEffects = z.infer<typeof ControlLiveLayoutEffectsSchema>;

export const CONTROL_LIVE_LAYOUT_DEFAULT_EFFECTS: Readonly<ControlLiveLayoutEffects> = {
  focus: { motion: 'ease-in-out', fade: false, durationMs: FRAME_TRANSITION_DEFAULT_MS },
  switch: {
    mode: 'motion',
    direction: DEFAULT_INPUT_SLIDE_DIRECTION,
    durationMs: FRAME_TRANSITION_DEFAULT_MS,
  },
};

/** A saved CG Control authoring document. The optional background binary lives in its .vcg. */
export const ControlLiveLayoutSchema = z
  .object({
    id: IdSchema,
    name: z.string().trim().min(1).max(120),
    resolution: ResolutionSchema,
    frameRate: FrameRateSchema,
    frames: z.array(ControlLiveLayoutFrameSchema).min(1).max(CONTROL_LIVE_LAYOUT_MAX_FRAMES),
    presets: z.array(ControlLiveLayoutPresetSchema).min(1),
    defaultPresetId: z.string().min(1),
    background: ControlLiveLayoutBackgroundSchema,
    effects: ControlLiveLayoutEffectsSchema,
  })
  .superRefine((layout, ctx) => {
    const frameIds = new Set(layout.frames.map(({ id }) => id));
    const presetIds = new Set(layout.presets.map(({ id }) => id));
    const issue = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });

    if (frameIds.size !== layout.frames.length) issue(['frames'], 'Frames must have distinct ids.');
    if (presetIds.size !== layout.presets.length)
      issue(['presets'], 'Presets must have distinct ids.');
    if (!presetIds.has(layout.defaultPresetId))
      issue(['defaultPresetId'], 'Choose a default preset.');
    for (const [index, preset] of layout.presets.entries()) {
      for (const key of ['frameIds', 'hiddenTitles', 'hiddenFocusTitles'] as const) {
        if (new Set(preset[key]).size !== preset[key].length)
          issue(['presets', index, key], 'A frame can occur only once in this list.');
        if (preset[key].some((id) => !frameIds.has(id)))
          issue(['presets', index, key], 'This preset refers to a removed frame.');
      }
      if (Object.keys(controlLiveLayoutRects(layout, preset)).length !== preset.frameIds.length)
        issue(['presets', index], `There is no room for the gaps in “${preset.name}”.`);
    }
  });
export type ControlLiveLayout = z.infer<typeof ControlLiveLayoutSchema>;

const FOCUS_LOOK_PREFIX = 'control-focus:';

/** Internal registered look. A return target is the exact originating preset. */
export function controlLiveLayoutFocusLookId(presetId: string, frameId: string): string {
  return FOCUS_LOOK_PREFIX + presetId + ':' + frameId;
}

export function controlLiveLayoutFocusTarget(
  layout: ControlLiveLayout,
  lookId: string | undefined,
): { presetId: string; frameId: string } | undefined {
  if (!lookId?.startsWith(FOCUS_LOOK_PREFIX)) return undefined;
  const [presetId = '', frameId = '', ...rest] = lookId.slice(FOCUS_LOOK_PREFIX.length).split(':');
  if (
    rest.length > 0 ||
    !layout.presets.some(({ id }) => id === presetId) ||
    !layout.frames.some(({ id }) => id === frameId)
  )
    return undefined;
  return { presetId, frameId };
}

/** A single displayed frame, whether selected through Focus or authored as a preset. */
export function controlLiveLayoutSoloTarget(
  layout: ControlLiveLayout,
  lookId: string | undefined,
): { presetId: string; frameId: string } | undefined {
  const focus = controlLiveLayoutFocusTarget(layout, lookId);
  if (focus !== undefined) return focus;
  const preset = layout.presets.find(({ id }) => id === lookId);
  const frameId = preset?.frameIds[0];
  return preset?.frameIds.length === 1 && frameId !== undefined
    ? { presetId: preset.id, frameId }
    : undefined;
}

/** Output-pixel rectangles. The compiler and authoring preview share this calculation. */
export function controlLiveLayoutRects(
  { resolution }: { resolution: Resolution },
  preset: ControlLiveLayoutPreset,
): Record<string, LiveSourceRect> {
  const { width, height } = resolution;
  const { frameIds, horizontalGap, verticalGap, arrangement, reverse } = preset;
  const aspect = width / height;
  const ids = reverse ? [...frameIds].reverse() : frameIds;
  const count = ids.length;
  const [first, ...guests] = ids;
  const rects = Object.create(null) as Record<string, LiveSourceRect>;
  if (first === undefined) return rects;
  if (count === 1) {
    rects[first] = { x: 0, y: 0, width, height };
    return rects;
  }

  if (arrangement === 'grid-top' || arrangement === 'grid-bottom') {
    const cells = calculateLiveSourceAutoLayout(
      ids.map((id) => ({ id, aspect })),
      resolution,
      arrangement === 'grid-bottom' ? 'more-bottom' : 'more-top',
      { horizontalGap, verticalGap },
    );
    for (const { id, ...rect } of cells) rects[id] = rect;
    return rects;
  }

  const margin = Math.min(width, height) * 0.05;
  const availableWidth = width - margin * 2;
  const availableHeight = height - margin * 2;
  if (arrangement === 'host-and-guests' && guests.length > 1) {
    const gapBudget = verticalGap * (guests.length - 1);
    const hostHeight = Math.min(
      availableHeight,
      ((availableWidth - horizontalGap) / aspect + gapBudget / guests.length) /
        (1 + 1 / guests.length),
    );
    const guestHeight = (hostHeight - gapBudget) / guests.length;
    if (guestHeight <= 0) return rects;
    const hostWidth = hostHeight * aspect;
    const guestWidth = guestHeight * aspect;
    const x = (width - hostWidth - guestWidth - horizontalGap) / 2;
    const y = (height - hostHeight) / 2;
    rects[first] = { x, y, width: hostWidth, height: hostHeight };
    guests.forEach((id, index) => {
      rects[id] = {
        x: x + hostWidth + horizontalGap,
        y: y + index * (guestHeight + verticalGap),
        width: guestWidth,
        height: guestHeight,
      };
    });
    return rects;
  }

  const vertical = arrangement === 'top-and-bottom' && count === 2;
  const frameHeight = vertical
    ? Math.min(availableWidth / aspect, (availableHeight - verticalGap * (count - 1)) / count)
    : Math.min(availableHeight, (availableWidth - horizontalGap * (count - 1)) / (count * aspect));
  if (frameHeight <= 0) return rects;
  const frameWidth = frameHeight * aspect;
  const groupWidth = vertical ? frameWidth : frameWidth * count + horizontalGap * (count - 1);
  const groupHeight = vertical ? frameHeight * count + verticalGap * (count - 1) : frameHeight;
  ids.forEach((id, index) => {
    rects[id] = {
      x: (width - groupWidth) / 2 + (vertical ? 0 : index * (frameWidth + horizontalGap)),
      y: (height - groupHeight) / 2 + (vertical ? index * (frameHeight + verticalGap) : 0),
      width: frameWidth,
      height: frameHeight,
    };
  });
  return rects;
}
