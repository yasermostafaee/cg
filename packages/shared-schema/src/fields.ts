import { z } from 'zod';
import { HexColorSchema, IdSchema } from './primitives.js';

const DynamicFieldBaseSchema = z.object({
  id: z.string().min(1),
  label: z.string(),
  group: z.string().optional(),
  required: z.boolean(),
  description: z.string().optional(),
});

const TextFieldSchema = DynamicFieldBaseSchema.extend({
  type: z.literal('text'),
  default: z.string(),
  maxLength: z.number().int().positive().optional(),
  direction: z.enum(['auto', 'ltr', 'rtl']).optional(),
});

const MultilineFieldSchema = DynamicFieldBaseSchema.extend({
  type: z.literal('multiline'),
  default: z.string(),
  maxLines: z.number().int().positive().optional(),
});

const ImageFieldSchema = DynamicFieldBaseSchema.extend({
  type: z.literal('image'),
  defaultAssetId: IdSchema.optional(),
  accept: z.array(z.enum(['png', 'jpg', 'webp', 'svg'])).min(1),
});

const ColorFieldSchema = DynamicFieldBaseSchema.extend({
  type: z.literal('color'),
  default: HexColorSchema,
});

const BooleanFieldSchema = DynamicFieldBaseSchema.extend({
  type: z.literal('boolean'),
  default: z.boolean(),
});

const NumberFieldSchema = DynamicFieldBaseSchema.extend({
  type: z.literal('number'),
  default: z.number(),
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().positive().optional(),
  unit: z.string().optional(),
});

const SelectFieldSchema = DynamicFieldBaseSchema.extend({
  type: z.literal('select'),
  default: z.string(),
  options: z.array(z.object({ value: z.string(), label: z.string() })).min(1),
});

/** Discriminated union of declared dynamic-field types. */
export const DynamicFieldSchema = z.discriminatedUnion('type', [
  TextFieldSchema,
  MultilineFieldSchema,
  ImageFieldSchema,
  ColorFieldSchema,
  BooleanFieldSchema,
  NumberFieldSchema,
  SelectFieldSchema,
]);
export type DynamicField = z.infer<typeof DynamicFieldSchema>;

/** Runtime field-value payload. Image fields ship as { assetId }. */
export const FieldValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.object({ assetId: IdSchema }),
  HexColorSchema,
]);
export type FieldValue = z.infer<typeof FieldValueSchema>;

/** Map of field id → value. Operator-side `fields` payload. */
export const FieldValuesSchema = z.record(z.string(), FieldValueSchema);
export type FieldValues = z.infer<typeof FieldValuesSchema>;
