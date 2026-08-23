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

/**
 * TEXT-FILE-OPT-01 — the AUTHORED grant: may the Runtime operator source this
 * field's value from a text file?
 *
 * It is named for what it GRANTS, not for the control it reveals. The Runtime's
 * "From file…" affordance is one consequence of the grant; the grant itself is a
 * statement about the FIELD — this one holds long copy that a typist prepares
 * elsewhere, rather than a label typed in the Inspector.
 *
 * ⚠ IT IS DEFINED ON THREE VARIANTS AND NO OTHERS, and that placement is the
 * feature, not a shortcut. R-018 gated the affordance on FIELD KIND alone, so it
 * rendered under every text / multiline / list field ever authored — the owner's
 * complaint, and `FromFileControl.tsx`'s own comment admits the propagation. The
 * fix is an authored per-field decision, and "un-settable rather than silently
 * ignored" is only true if a `number` field CANNOT CARRY THE KEY: TypeScript
 * refuses to write it and Zod strips it on the way in, so there is no state in
 * which a set grant is being ignored. Do not lift this onto
 * `DynamicFieldBaseSchema` for tidiness — that would recreate exactly the
 * settable-and-ignored state this shape exists to make unreachable.
 *
 * ABSENT IS OFF, and absent is what every field authored before this existed
 * carries. That is deliberate under `P-031`'s compatibility floor (nothing has
 * shipped, so no backward compatibility is owed) and it matches the direction
 * `TemplateInfo.hasNext` already chose for an authored capability bit: an
 * affordance that is not offered costs less than one that is offered everywhere.
 */
const FileSourceGrant = { allowFileSource: z.boolean().optional() } as const;

const TextFieldSchema = DynamicFieldBaseSchema.extend({
  type: z.literal('text'),
  default: z.string(),
  minLength: z.number().int().nonnegative().optional(),
  maxLength: z.number().int().positive().optional(),
  pattern: RegexSourceSchema.optional(),
  direction: z.enum(['auto', 'ltr', 'rtl']).optional(),
  ...FileSourceGrant,
});

const MultilineFieldSchema = DynamicFieldBaseSchema.extend({
  type: z.literal('multiline'),
  default: z.string(),
  minLength: z.number().int().nonnegative().optional(),
  pattern: RegexSourceSchema.optional(),
  maxLines: z.number().int().positive().optional(),
  ...FileSourceGrant,
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
  ...FileSourceGrant,
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

/**
 * The field variants that can carry file content — and so the only ones on which
 * {@link fieldAllowsFileSource} can ever be true. Derived from the union rather
 * than re-listed, so the type and the schema cannot disagree about which three.
 */
export type FileSourceCapableField = Extract<DynamicField, { type: 'text' | 'multiline' | 'list' }>;

/**
 * TEXT-FILE-OPT-01 — THE OUTER GATE: can a field of this KIND take file content at
 * all? A file yields text, so the answer is the three text-carrying kinds and
 * nothing else.
 *
 * 🔴 This is the ONE place that list is spelled for this purpose (golden rule 6).
 * It was previously inline in `Inspector.tsx` as
 * `kind === 'text' || kind === 'multiline' || kind === 'list'`, and
 * `fromFileContent.ts` held a second copy as `FromFileFieldKind`. Both now derive
 * from here. A third local copy is how the outer gate comes to admit a kind the
 * inner one refuses.
 */
export function fieldTypeTakesFileSource(
  type: DynamicField['type'],
): type is FileSourceCapableField['type'] {
  return type === 'text' || type === 'multiline' || type === 'list';
}

/**
 * The same question asked of a FIELD, so the union narrows with it.
 *
 * It exists because a guard on `field.type` narrows the DISCRIMINANT and not the
 * object: after `fieldTypeTakesFileSource(field.type)`, `field` is still the whole
 * union and `field.allowFileSource` does not typecheck (an `image` field has no such
 * key). Delegating to the one predicate above keeps the kind list spelled exactly
 * once while giving callers the narrowing they actually need.
 */
export function fieldTakesFileSource(field: DynamicField): field is FileSourceCapableField {
  return fieldTypeTakesFileSource(field.type);
}

/**
 * TEXT-FILE-OPT-01 — THE ANSWER: did the template's author grant this field a file
 * source? Kind first (a grant on a kind that cannot hold file content is not a
 * grant), then the authored bit.
 *
 * 🔴 `null` / `undefined` grants NOTHING, and this arm is load-bearing rather than
 * defensive. The Runtime Inspector renders inferred rows with `field: null` whenever
 * the template schema has not resolved — so a caller that skipped this predicate and
 * read the flag directly off an optional field would be reading ABSENCE OF A SCHEMA
 * as ABSENCE OF A GRANT. That is fine for deciding whether to RENDER the affordance
 * (not offering it is the safe direction) and catastrophic for deciding whether to
 * DELETE an attachment — see `detachUngrantedSources`, which refuses to be called
 * without a positively resolved schema. Golden rule 8, one axis over.
 */
export function fieldAllowsFileSource(field: DynamicField | null | undefined): boolean {
  if (field === null || field === undefined) return false;
  return fieldTakesFileSource(field) && field.allowFileSource === true;
}

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

/**
 * Operator-side `fields` payload: field id → value, PLUS a sub-object per nested
 * composition instance, keyed by that instance's stable namespace name.
 *
 * B-067 — this used to be a flat `z.record(string, FieldValue)`, which silently made
 * nested-composition fields unreachable: the address they already have EVERYWHERE else
 * (the GDD advertises `{ instanceName: { fieldId } }`, and `@cg/template-runtime`
 * resolves a binding via `values[child.name]`) could not even be expressed here, so a
 * nested payload was REJECTED by Zod at the IPC boundary. Widening is a strict
 * SUPERSET — every existing flat payload still validates unchanged.
 *
 * A namespace is disambiguated from an image value the same way the template runtime
 * does it: an image is `{ assetId }`, and `FieldValueSchema` is tried first, so only
 * objects that are NOT a field value fall through to the namespace branch.
 */
export interface FieldValues {
  [key: string]: FieldValue | FieldValues;
}
export const FieldValuesSchema: z.ZodType<FieldValues> = z.lazy(() =>
  z.record(z.string(), z.union([FieldValueSchema, FieldValuesSchema])),
);
