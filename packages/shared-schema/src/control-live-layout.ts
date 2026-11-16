import { z } from 'zod';
import {
  FontWeightSchema,
  LivePlateMaskSchema,
  LiveRevealRectSchema,
  LiveSourceIdSchema,
} from './elements.js';
import { FieldDigitsSchema } from './fields.js';
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
import { LiveFitModeSchema, LiveFrameResizeSchema } from './live-fit.js';
import { calculateLiveSourceAutoLayout } from './live-source-auto-layout.js';
import type { LiveSourceRect } from './live-source.js';
import {
  FrameRateSchema,
  HexColorSchema,
  IdSchema,
  ResolutionSchema,
  ShadowSchema,
  StrokeSchema,
  type Resolution,
} from './primitives.js';

export const CONTROL_LIVE_LAYOUT_MAX_FRAMES = 4;
export const CONTROL_LIVE_LAYOUT_FOCUS_ALIAS_MAX_LENGTH = 24;
export const CONTROL_LIVE_LAYOUT_TITLE_FONTS = ['Vazirmatn', 'Tahoma', 'Arial', 'Exo 2'] as const;
export const CONTROL_LIVE_LAYOUT_TITLE_SIZE_MIN_PERCENT = 1;
export const CONTROL_LIVE_LAYOUT_TITLE_SIZE_MAX_PERCENT = 20;
export const CONTROL_LIVE_LAYOUT_TITLE_SIZE_DEFAULT_PERCENT = 4.2;

const isFieldNamespaceId = (id: string): boolean =>
  !Object.prototype.hasOwnProperty.call(Object.prototype, id);

const ControlLiveLayoutFrameIdSchema = LiveSourceIdSchema.max(64).refine(isFieldNamespaceId);
const ControlLiveLayoutFontIdSchema = z.string().regex(/^[a-f0-9]{64}$/);
const ControlLiveLayoutFontSchema = z.object({
  id: ControlLiveLayoutFontIdSchema,
  name: z.string().min(1).max(255),
  mime: z.enum(['font/ttf', 'font/otf', 'font/woff', 'font/woff2']),
});
export type ControlLiveLayoutFont = z.infer<typeof ControlLiveLayoutFontSchema>;

/** Same asset family namespace as Designer's packaged and single-file templates. */
export function controlLiveLayoutFontFamily(id: string): string {
  return 'asset-' + id;
}

export const ControlLiveLayoutTitleStyleSchema = z.object({
  // Position percentages span the available travel of the entire title box.
  xPercent: z.number().min(0).max(100).optional(),
  yPercent: z.number().min(0).max(100).optional(),
  sizePercent: z
    .number()
    .min(CONTROL_LIVE_LAYOUT_TITLE_SIZE_MIN_PERCENT)
    .max(CONTROL_LIVE_LAYOUT_TITLE_SIZE_MAX_PERCENT)
    .optional(),
  widthPercent: z.number().min(1).max(100).optional(),
  heightPercent: z.number().min(1).max(100).optional(),
  padding: z.number().finite().nonnegative().optional(),
  textOffsetY: z.number().finite().optional(),
  align: z.enum(['start', 'end', 'center', 'justify']).optional(),
  verticalAlign: z.enum(['top', 'middle', 'bottom']).optional(),
  color: HexColorSchema.optional(),
  fontFamily: z
    .union([z.enum(CONTROL_LIVE_LAYOUT_TITLE_FONTS), z.string().regex(/^asset-[a-f0-9]{64}$/)])
    .optional(),
  fontWeight: FontWeightSchema.optional(),
  fontStyle: z.enum(['normal', 'italic']).optional(),
  digits: FieldDigitsSchema.optional(),
  backgroundColor: HexColorSchema.optional(),
  // Null explicitly disables a style inherited from the layout.
  stroke: StrokeSchema.nullable().optional(),
  textShadow: ShadowSchema.nullable().optional(),
  boxShadow: ShadowSchema.nullable().optional(),
  borderRadius: z.number().finite().nonnegative().optional(),
  wrap: z.boolean().optional(),
});
export type ControlLiveLayoutTitleStyle = z.infer<typeof ControlLiveLayoutTitleStyleSchema>;

const ControlLiveLayoutAdditionalTextSchema = z.object({
  id: ControlLiveLayoutFrameIdSchema,
  text: z.string(),
  style: ControlLiveLayoutTitleStyleSchema.optional(),
});
export type ControlLiveLayoutAdditionalText = z.infer<typeof ControlLiveLayoutAdditionalTextSchema>;

const ControlLiveLayoutFrameSchema = z.object({
  id: ControlLiveLayoutFrameIdSchema,
  /** Catalog id chosen by the operator. The logical frame id stays stable across all presets. */
  sourceId: z.string().min(1).max(64).optional(),
  title: z.string().max(120),
  /** A short button caption. An empty caption uses the layout's frame number. */
  focusAlias: z.string().trim().max(CONTROL_LIVE_LAYOUT_FOCUS_ALIAS_MAX_LENGTH).optional(),
  titleStyle: ControlLiveLayoutTitleStyleSchema.optional(),
  additionalTexts: z
    .array(ControlLiveLayoutAdditionalTextSchema)
    .refine((texts) => new Set(texts.map(({ id }) => id)).size === texts.length, {
      message: 'Text blocks on the same frame must have distinct ids.',
    })
    .optional(),
  fitMode: LiveFitModeSchema.optional(),
  operatorMove: z.boolean().optional(),
  operatorPlacement: z.union([z.literal('locked'), LiveFrameResizeSchema]).optional(),
  liveMask: LivePlateMaskSchema.optional(),
  allowOperatorMaskEdit: z.boolean().optional(),
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

const ControlLiveLayoutFrameAttachmentSchema = z.object({
  id: ControlLiveLayoutFrameIdSchema,
  frameId: ControlLiveLayoutFrameIdSchema,
  sourceId: z.string().regex(/^[a-f0-9]{64}$/),
  name: z.string().min(1).max(255),
  rect: LiveRevealRectSchema,
});
export type ControlLiveLayoutFrameAttachment = z.infer<
  typeof ControlLiveLayoutFrameAttachmentSchema
>;

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
  // Retained for packages that authored graphics separately for each preset.
  frameAttachments: z.array(ControlLiveLayoutFrameAttachmentSchema).optional(),
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

export const ControlLiveLayoutSwitchModeSchema = z.enum([
  'motion',
  'cut',
  'fade',
  'push',
  'slide-over',
]);
export type ControlLiveLayoutSwitchMode = z.infer<typeof ControlLiveLayoutSwitchModeSchema>;

const ControlLiveLayoutEffectsSchema = z.object({
  focus: FrameTransitionSchema,
  switch: z.object({
    mode: ControlLiveLayoutSwitchModeSchema,
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

/** A saved CG Control authoring document. Optional background and font assets live in its .vcg. */
export const ControlLiveLayoutSchema = z
  .object({
    id: IdSchema,
    name: z.string().trim().min(1).max(120),
    resolution: ResolutionSchema,
    frameRate: FrameRateSchema,
    frames: z.array(ControlLiveLayoutFrameSchema).min(1).max(CONTROL_LIVE_LAYOUT_MAX_FRAMES),
    frameAttachments: z.array(ControlLiveLayoutFrameAttachmentSchema).optional(),
    titleStyle: ControlLiveLayoutTitleStyleSchema.optional(),
    additionalTextStyles: z.array(ControlLiveLayoutTitleStyleSchema.nullable()).optional(),
    fonts: z.array(ControlLiveLayoutFontSchema).optional(),
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

    const fonts = layout.fonts ?? [];
    const families = new Set(fonts.map(({ id }) => controlLiveLayoutFontFamily(id)));
    if (families.size !== fonts.length) issue(['fonts'], 'Fonts must have distinct ids.');
    const validateFont = (
      style: ControlLiveLayoutTitleStyle | undefined,
      path: (string | number)[],
    ) => {
      const family = style?.fontFamily;
      if (family?.startsWith('asset-') && !families.has(family))
        issue([...path, 'fontFamily'], 'This title refers to a missing font.');
    };
    validateFont(layout.titleStyle, ['titleStyle']);
    layout.additionalTextStyles?.forEach((style, index) =>
      validateFont(style ?? undefined, ['additionalTextStyles', index]),
    );
    layout.frames.forEach((frame, index) => {
      validateFont(frame.titleStyle, ['frames', index, 'titleStyle']);
      frame.additionalTexts?.forEach((entry, textIndex) =>
        validateFont(entry.style, ['frames', index, 'additionalTexts', textIndex, 'style']),
      );
    });

    if (frameIds.size !== layout.frames.length) issue(['frames'], 'Frames must have distinct ids.');
    const sharedAttachments = layout.frameAttachments ?? [];
    if (new Set(sharedAttachments.map(({ id }) => id)).size !== sharedAttachments.length)
      issue(['frameAttachments'], 'Frame attachments must have distinct ids.');
    if (sharedAttachments.some(({ frameId }) => !frameIds.has(frameId)))
      issue(['frameAttachments'], 'Frame attachments must belong to a frame in this layout.');
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
      const attachments = preset.frameAttachments ?? [];
      if (new Set(attachments.map(({ id }) => id)).size !== attachments.length)
        issue(['presets', index, 'frameAttachments'], 'Frame attachments must have distinct ids.');
      if (attachments.some(({ frameId }) => !preset.frameIds.includes(frameId)))
        issue(
          ['presets', index, 'frameAttachments'],
          'Attach a template to a frame in this preset.',
        );
      if (Object.keys(controlLiveLayoutRects(layout, preset)).length !== preset.frameIds.length)
        issue(['presets', index], `There is no room for the gaps in “${preset.name}”.`);
    }
  });
export type ControlLiveLayout = z.infer<typeof ControlLiveLayoutSchema>;

export function controlLiveLayoutAttachments(
  layout: Pick<ControlLiveLayout, 'frameAttachments' | 'presets'>,
): ControlLiveLayoutFrameAttachment[] {
  return [
    ...(layout.frameAttachments ?? []),
    ...layout.presets.flatMap(({ frameAttachments }) => frameAttachments ?? []),
  ];
}

export function controlLiveLayoutFrameAttachments(
  layout: Pick<ControlLiveLayout, 'frameAttachments'>,
  preset: Pick<ControlLiveLayoutPreset, 'frameAttachments'> | undefined,
  frameId: string,
): ControlLiveLayoutFrameAttachment[] {
  return [...(layout.frameAttachments ?? []), ...(preset?.frameAttachments ?? [])].filter(
    (attachment) => attachment.frameId === frameId,
  );
}

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

/** A one-frame preset is already solo, and still respects its own title visibility. */
export function controlLiveLayoutTitleHidden(
  preset: ControlLiveLayoutPreset,
  frameId: string,
  focused: boolean,
): boolean {
  const hiddenInFocus = preset.hiddenFocusTitles.includes(frameId);
  if (focused) return hiddenInFocus;
  return preset.hiddenTitles.includes(frameId) || (preset.frameIds.length === 1 && hiddenInFocus);
}

/** Frame ids in effective on-screen arrangement order. */
export function controlLiveLayoutPresetFrameIds({
  frameIds,
  reverse,
}: Pick<ControlLiveLayoutPreset, 'frameIds' | 'reverse'>): string[] {
  const ids = [...frameIds];
  return reverse ? ids.reverse() : ids;
}

/** Swap the requested frame into a zero-based on-screen seat, keeping Reverse unchanged. */
export function controlLiveLayoutMovePresetFrame(
  preset: Pick<ControlLiveLayoutPreset, 'frameIds' | 'reverse'>,
  frameId: string,
  position: number,
): string[] | undefined {
  const ids = controlLiveLayoutPresetFrameIds(preset);
  const from = ids.indexOf(frameId);
  const displaced = ids[position];
  if (from < 0 || displaced === undefined) return undefined;
  ids[from] = displaced;
  ids[position] = frameId;
  return preset.reverse ? ids.reverse() : ids;
}

/** Output-pixel rectangles. The compiler and authoring preview share this calculation. */
export function controlLiveLayoutRects(
  { resolution }: { resolution: Resolution },
  preset: ControlLiveLayoutPreset,
): Record<string, LiveSourceRect> {
  const { width, height } = resolution;
  const { horizontalGap, verticalGap, arrangement } = preset;
  const aspect = width / height;
  const ids = controlLiveLayoutPresetFrameIds(preset);
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
