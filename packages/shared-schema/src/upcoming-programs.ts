import { z } from 'zod';
import type { UpcomingProgramsElement } from './elements.js';
import { FieldDigitsSchema, type FieldDigits } from './fields.js';
import { HexColorSchema } from './primitives.js';

/** Fractions of the card's own width and height, measured from its top left. */
export const UpcomingProgramsRectSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().positive().max(1),
  height: z.number().positive().max(1),
});
export type UpcomingProgramsRect = z.infer<typeof UpcomingProgramsRectSchema>;

export const UpcomingProgramsTextStyleSchema = z.object({
  rect: UpcomingProgramsRectSchema.optional(),
  fontFamily: z.string().trim().min(1).optional(),
  fontSize: z.number().finite().positive().nullable().optional(),
  fontWeight: z.number().int().min(100).max(900).optional(),
  color: HexColorSchema.optional(),
  align: z.enum(['start', 'center', 'end', 'left', 'right']).optional(),
  direction: z.enum(['auto', 'rtl', 'ltr']).optional(),
  digits: FieldDigitsSchema.optional(),
});
export type UpcomingProgramsTextStyle = z.infer<typeof UpcomingProgramsTextStyleSchema>;

export const UpcomingProgramsCarouselStyleSchema = z.object({
  focusPosition: z.enum(['start', 'center', 'end']).optional(),
  focusMovement: z.enum(['fixed', 'across']).optional(),
  allowOverlap: z.boolean().optional(),
  focusMotionMs: z.number().finite().int().nonnegative().safe().optional(),
  focusedScale: z.number().finite().positive().optional(),
  unfocusedScale: z.number().finite().positive().optional(),
  focusedOpacity: z.number().min(0).max(1).optional(),
  unfocusedOpacity: z.number().min(0).max(1).optional(),
});
export type UpcomingProgramsCarouselStyle = z.infer<typeof UpcomingProgramsCarouselStyleSchema>;

export const UpcomingProgramsCardStyleSchema = z.object({
  width: z.number().finite().positive().optional(),
  height: z.number().finite().positive().optional(),
  gap: z.number().finite().nonnegative().optional(),
  verticalAlign: z.enum(['top', 'center', 'bottom']).optional(),
  background: HexColorSchema.optional(),
  focusedBackground: HexColorSchema.optional(),
  borderColor: HexColorSchema.optional(),
  focusedBorderColor: HexColorSchema.optional(),
  borderWidth: z.number().finite().nonnegative().optional(),
  cornerRadius: z.number().finite().nonnegative().optional(),
  title: UpcomingProgramsTextStyleSchema.optional(),
  airtime: UpcomingProgramsTextStyleSchema.optional(),
  focusedTitle: UpcomingProgramsTextStyleSchema.optional(),
  focusedAirtime: UpcomingProgramsTextStyleSchema.optional(),
  carousel: UpcomingProgramsCarouselStyleSchema.optional(),
  media: z
    .object({
      visible: z.boolean().optional(),
      rect: UpcomingProgramsRectSchema.optional(),
      fit: z.enum(['contain', 'cover']).optional(),
      borderWidth: z.number().finite().nonnegative().optional(),
      borderColor: HexColorSchema.optional(),
      cornerRadius: z.number().finite().nonnegative().optional(),
      backgroundColor: HexColorSchema.optional(),
    })
    .optional(),
});
export type UpcomingProgramsCardStyle = z.infer<typeof UpcomingProgramsCardStyleSchema>;

export interface UpcomingProgramsResolvedTextStyle {
  rect: UpcomingProgramsRect;
  fontFamily: string;
  fontSize: number | undefined;
  fontWeight: number;
  color: string;
  align: 'start' | 'center' | 'end' | 'left' | 'right';
  direction: 'auto' | 'rtl' | 'ltr';
  digits: FieldDigits;
}

function resolveTextStyle(
  style: UpcomingProgramsTextStyle | undefined,
  defaults: UpcomingProgramsResolvedTextStyle,
): UpcomingProgramsResolvedTextStyle {
  return {
    rect: style?.rect ?? defaults.rect,
    fontFamily: style?.fontFamily ?? defaults.fontFamily,
    fontSize: style?.fontSize === null ? undefined : (style?.fontSize ?? defaults.fontSize),
    fontWeight: style?.fontWeight ?? defaults.fontWeight,
    color: style?.color ?? defaults.color,
    align: style?.align ?? defaults.align,
    direction: style?.direction ?? defaults.direction,
    digits: style?.digits ?? defaults.digits,
  };
}

/** One interpretation of absent card styling for the renderer and Inspector. */
export function upcomingProgramsCardStyleOf(element: {
  layout?: UpcomingProgramsElement['layout'] | undefined;
  cardStyle?: UpcomingProgramsCardStyle | undefined;
}) {
  const { cardStyle } = element;
  const media = cardStyle?.media;
  const mediaVisible = media?.visible ?? false;
  const textColumn = mediaVisible ? { x: 0.49, width: 0.455 } : { x: 0.055, width: 0.89 };
  const title = resolveTextStyle(cardStyle?.title, {
    rect: { ...textColumn, y: 0.345, height: 0.24 },
    fontFamily: 'Vazirmatn',
    fontSize: undefined,
    fontWeight: 700,
    color: '#F3F8F8',
    align: 'start',
    direction: 'auto',
    digits: 'as-typed',
  });
  const airtime = resolveTextStyle(cardStyle?.airtime, {
    rect: { ...textColumn, y: 0.6, height: 0.19 },
    fontFamily: 'Vazirmatn',
    fontSize: undefined,
    fontWeight: 600,
    color: '#C2D2DA',
    align: 'start',
    direction: 'auto',
    digits: 'as-typed',
  });
  return {
    width: cardStyle?.width,
    height: cardStyle?.height,
    gap: cardStyle?.gap,
    // Older fixed-height Grid tracks start at the top of the graphic.
    verticalAlign:
      cardStyle?.verticalAlign ??
      (element.layout === 'grid' && cardStyle?.height !== undefined ? 'top' : 'center'),
    background: cardStyle?.background ?? '#172732',
    focusedBackground: cardStyle?.focusedBackground ?? '#103D45',
    borderColor: cardStyle?.borderColor ?? '#415666',
    focusedBorderColor: cardStyle?.focusedBorderColor ?? '#6EE7D0',
    borderWidth: cardStyle?.borderWidth ?? 1,
    focusedBorderWidth: cardStyle?.borderWidth ?? 2,
    cornerRadius: cardStyle?.cornerRadius ?? 12,
    title,
    airtime,
    focusedTitle: resolveTextStyle(cardStyle?.focusedTitle, title),
    focusedAirtime: resolveTextStyle(cardStyle?.focusedAirtime, airtime),
    carousel: {
      focusPosition: cardStyle?.carousel?.focusPosition ?? 'center',
      focusMovement: cardStyle?.carousel?.focusMovement ?? 'fixed',
      allowOverlap: cardStyle?.carousel?.allowOverlap ?? false,
      focusMotionMs: cardStyle?.carousel?.focusMotionMs ?? 250,
      focusedScale: cardStyle?.carousel?.focusedScale ?? 1,
      unfocusedScale: cardStyle?.carousel?.unfocusedScale ?? 1,
      focusedOpacity: cardStyle?.carousel?.focusedOpacity ?? 1,
      unfocusedOpacity: cardStyle?.carousel?.unfocusedOpacity ?? 1,
    },
    media: {
      visible: mediaVisible,
      rect: media?.rect ?? { x: 0.055, y: 0.08, width: 0.38, height: 0.84 },
      fit: media?.fit ?? 'cover',
      borderWidth: media?.borderWidth ?? 0,
      borderColor: media?.borderColor ?? '#8294A0',
      cornerRadius: media?.cornerRadius ?? 0,
      backgroundColor: media?.backgroundColor ?? '#18252D',
    },
  };
}
