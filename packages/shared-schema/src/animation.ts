import { z } from 'zod';
import { DurationFramesSchema } from './primitives.js';

/** GSAP-compatible easing names. v1 set; extensible per Phase 3 §5. */
export const EasingSchema = z.enum([
  'linear',
  'power1.in',
  'power1.out',
  'power1.inOut',
  'power2.in',
  'power2.out',
  'power2.inOut',
  'power3.in',
  'power3.out',
  'power3.inOut',
  'back.in',
  'back.out',
  'back.inOut',
  'expo.in',
  'expo.out',
  'expo.inOut',
  'sine.in',
  'sine.out',
  'sine.inOut',
]);
export type Easing = z.infer<typeof EasingSchema>;

const SlideDirectionSchema = z.enum(['left', 'right', 'up', 'down']);

/** Entry animation preset. Frame-locked timing (see Phase 4 §6). */
export const EntryPresetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('none') }),
  z.object({
    kind: z.literal('fade'),
    duration: DurationFramesSchema,
    delay: DurationFramesSchema,
    easing: EasingSchema,
  }),
  z.object({
    kind: z.literal('slide'),
    duration: DurationFramesSchema,
    delay: DurationFramesSchema,
    easing: EasingSchema,
    direction: SlideDirectionSchema,
    distance: z.number(),
  }),
  z.object({
    kind: z.literal('scale'),
    duration: DurationFramesSchema,
    delay: DurationFramesSchema,
    easing: EasingSchema,
    from: z.number().nonnegative(),
  }),
  z.object({
    kind: z.literal('blur'),
    duration: DurationFramesSchema,
    delay: DurationFramesSchema,
    easing: EasingSchema,
    from: z.number().nonnegative(),
  }),
]);
export type EntryPreset = z.infer<typeof EntryPresetSchema>;

/** Exit animation preset. */
export const ExitPresetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('none') }),
  z.object({
    kind: z.literal('fade-out'),
    duration: DurationFramesSchema,
    delay: DurationFramesSchema,
    easing: EasingSchema,
  }),
  z.object({
    kind: z.literal('slide-out'),
    duration: DurationFramesSchema,
    delay: DurationFramesSchema,
    easing: EasingSchema,
    direction: SlideDirectionSchema,
    distance: z.number(),
  }),
  z.object({
    kind: z.literal('scale-down'),
    duration: DurationFramesSchema,
    delay: DurationFramesSchema,
    easing: EasingSchema,
    to: z.number().nonnegative(),
  }),
  z.object({
    kind: z.literal('blur-out'),
    duration: DurationFramesSchema,
    delay: DurationFramesSchema,
    easing: EasingSchema,
    to: z.number().nonnegative(),
  }),
]);
export type ExitPreset = z.infer<typeof ExitPresetSchema>;

/** Loop animation preset. Runs after entry, before exit. */
export const LoopPresetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('none') }),
  z.object({
    kind: z.literal('ticker'),
    /** px/s at the project's frame rate; executor converts to px/frame. */
    speed: z.number().positive(),
    direction: z.enum(['ltr', 'rtl']),
    pauseOnHover: z.boolean().optional(),
  }),
  z.object({
    kind: z.literal('pulse'),
    duration: DurationFramesSchema,
    minOpacity: z.number().min(0).max(1),
    maxOpacity: z.number().min(0).max(1),
  }),
  z.object({
    kind: z.literal('breathing'),
    duration: DurationFramesSchema,
    scaleMin: z.number().nonnegative(),
    scaleMax: z.number().nonnegative(),
  }),
]);
export type LoopPreset = z.infer<typeof LoopPresetSchema>;

/** All animation phases for an element. */
export const ElementAnimationSchema = z.object({
  entry: EntryPresetSchema.optional(),
  loop: LoopPresetSchema.optional(),
  exit: ExitPresetSchema.optional(),
});
export type ElementAnimation = z.infer<typeof ElementAnimationSchema>;
