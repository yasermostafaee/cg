import { z } from 'zod';
import { HexColorSchema, IdSchema } from './primitives.js';

const DynamicFieldBaseSchema = z.object({
  id: z.string().min(1),
  label: z.string(),
  group: z.string().optional(),
  required: z.boolean(),
  description: z.string().optional(),
});

/**
 * A regular-expression *source* string (no slashes/flags), validated to compile.
 * Used for the optional `pattern` constraint on text fields (D-018). A bad
 * pattern is rejected at the schema boundary rather than throwing at render time.
 */
const RegexSourceSchema = z.string().refine(
  (p) => {
    try {
      new RegExp(p);
      return true;
    } catch {
      return false;
    }
  },
  { message: 'pattern must be a valid regular expression' },
);

const TextFieldSchema = DynamicFieldBaseSchema.extend({
  type: z.literal('text'),
  default: z.string(),
  minLength: z.number().int().nonnegative().optional(),
  maxLength: z.number().int().positive().optional(),
  pattern: RegexSourceSchema.optional(),
  direction: z.enum(['auto', 'ltr', 'rtl']).optional(),
});

const MultilineFieldSchema = DynamicFieldBaseSchema.extend({
  type: z.literal('multiline'),
  default: z.string(),
  minLength: z.number().int().nonnegative().optional(),
  pattern: RegexSourceSchema.optional(),
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

/**
 * One item of a `list` field value. DELIBERATELY extensible: a required
 * stable `id` (the reconcile key) plus open additional fields — each consumer
 * reads the fields it knows (the ticker reads `text`; the sequence (D-029)
 * reads `text`/`dwellMs`; the repeater (D-030) will read `name`/`number`/…).
 * Don't narrow this shape to one consumer's fields.
 */
export const ListItemSchema = z.object({ id: z.string().min(1) }).passthrough();
export type ListItem = z.infer<typeof ListItemSchema>;

/**
 * List field (D-028) — an ordered array of extensible items. Values travel as
 * JSON only: the legacy CasparCG XML payload path (flat string map) cannot
 * carry a list.
 */
const ListFieldSchema = DynamicFieldBaseSchema.extend({
  type: z.literal('list'),
  default: z.array(ListItemSchema),
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
  ListFieldSchema,
]);
export type DynamicField = z.infer<typeof DynamicFieldSchema>;

/** Runtime field-value payload. Image fields ship as { assetId }. */
export const FieldValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.object({ assetId: IdSchema }),
  HexColorSchema,
  z.array(ListItemSchema),
]);
export type FieldValue = z.infer<typeof FieldValueSchema>;

/** Map of field id → value. Operator-side `fields` payload. */
export const FieldValuesSchema = z.record(z.string(), FieldValueSchema);
export type FieldValues = z.infer<typeof FieldValuesSchema>;
