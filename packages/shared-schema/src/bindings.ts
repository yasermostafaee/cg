import { z } from 'zod';
import { IdSchema } from './primitives.js';

/** Pure-function formatters applied at render time. */
export const BindingTransformSchema = z.enum([
  'identity',
  'uppercase',
  'lowercase',
  'truncate',
  'persian-digits',
  'latin-digits',
  'date-fa',
  'date-en',
]);
export type BindingTransform = z.infer<typeof BindingTransformSchema>;

const BindingTargetSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('text'),
    elementId: IdSchema,
    /** Optional placeholder marker; absent = replace full text. */
    placeholder: z.string().optional(),
  }),
  z.object({
    kind: z.literal('image'),
    elementId: IdSchema,
  }),
  z.object({
    kind: z.literal('color'),
    elementId: IdSchema,
    property: z.enum(['fill', 'stroke', 'text']),
  }),
  z.object({
    kind: z.literal('visible'),
    elementId: IdSchema,
  }),
  z.object({
    kind: z.literal('transform'),
    elementId: IdSchema,
    property: z.enum(['opacity', 'x', 'y', 'scale', 'rotation']),
  }),
  z.object({
    kind: z.literal('scene-background'),
  }),
  z.object({
    kind: z.literal('lottie-override'),
    elementId: IdSchema,
    layer: z.string(),
    prop: z.string(),
  }),
  /** D-028 — a `list` field drives a ticker element's items. */
  z.object({
    kind: z.literal('ticker-items'),
    elementId: IdSchema,
  }),
  /** D-029 — a `list` field drives a sequence element's items. */
  z.object({
    kind: z.literal('sequence-items'),
    elementId: IdSchema,
  }),
]);

/**
 * One-way wire: field → target. Operator UI is the only writer of field
 * values; renderer never writes back.
 */
export const FieldBindingSchema = z.object({
  fieldId: z.string().min(1),
  target: BindingTargetSchema,
  transform: BindingTransformSchema.optional(),
});
export type FieldBinding = z.infer<typeof FieldBindingSchema>;
