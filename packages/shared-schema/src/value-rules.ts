import { z } from 'zod';
import { ImageChangeValueSchema } from './element-changes.js';
import { HexColorSchema, IdSchema } from './primitives.js';

/** The scalar values D-139 compares. Lists, booleans and image objects are deliberately excluded. */
export const ValueRuleScalarSchema = z.union([z.string(), z.number()]);
export type ValueRuleScalar = z.infer<typeof ValueRuleScalarSchema>;

export const VALUE_RULE_COMPARATORS = ['=', '!=', '<', '<=', '>', '>=', 'between'] as const;
export type ValueRuleComparator = (typeof VALUE_RULE_COMPARATORS)[number];

const ValueRuleSingleConditionSchema = z.object({
  comparator: z.enum(['=', '!=', '<', '<=', '>', '>=']),
  value: ValueRuleScalarSchema,
});

const ValueRuleBetweenConditionSchema = z
  .object({
    comparator: z.literal('between'),
    min: ValueRuleScalarSchema,
    max: ValueRuleScalarSchema,
  })
  .superRefine((condition, ctx) => {
    if (typeof condition.min !== typeof condition.max) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['max'],
        message: 'between bounds must use the same value type',
      });
      return;
    }
    if (compareRuleScalars(condition.min, condition.max) > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['max'],
        message: 'between max must be greater than or equal to min',
      });
    }
  });

export const ValueRuleConditionSchema = z.union([
  ValueRuleSingleConditionSchema,
  ValueRuleBetweenConditionSchema,
]);
export type ValueRuleCondition = z.infer<typeof ValueRuleConditionSchema>;

/** D-139 v1 effects: one picture, one colour/fill slot, or visibility. */
export const ValueRuleEffectSchema = z.discriminatedUnion('property', [
  z.object({ elementId: IdSchema, property: z.literal('visible'), value: z.boolean() }),
  z.object({ elementId: IdSchema, property: z.literal('textColor'), value: HexColorSchema }),
  z.object({ elementId: IdSchema, property: z.literal('backgroundColor'), value: HexColorSchema }),
  z.object({ elementId: IdSchema, property: z.literal('fill'), value: HexColorSchema }),
  z.object({ elementId: IdSchema, property: z.literal('stroke'), value: HexColorSchema }),
  z.object({ elementId: IdSchema, property: z.literal('image'), value: ImageChangeValueSchema }),
]);
export type ValueRuleEffect = z.infer<typeof ValueRuleEffectSchema>;

export const ValueRuleSchema = z.object({
  condition: ValueRuleConditionSchema,
  /** Exactly one effect by construction. */
  effect: ValueRuleEffectSchema,
});
export type ValueRule = z.infer<typeof ValueRuleSchema>;

/**
 * One authored-order rule list. The input object is intentionally a union-shaped seam: D-180 uses
 * a current-scope field; D-139 can later add countdown time without changing the rule records.
 */
export const ValueRuleSetSchema = z.object({
  input: z.object({ kind: z.literal('field'), fieldId: z.string().min(1) }),
  rules: z.array(ValueRuleSchema),
});
export type ValueRuleSet = z.infer<typeof ValueRuleSetSchema>;

/** Stable scalar ordering: numeric for numbers, UTF-16 code-unit ordering for strings. */
function compareRuleScalars(left: ValueRuleScalar, right: ValueRuleScalar): number {
  if (typeof left === 'number' && typeof right === 'number') {
    if (left === right) return 0;
    return left < right ? -1 : 1;
  }
  if (typeof left === 'string' && typeof right === 'string') {
    if (left === right) return 0;
    return left < right ? -1 : 1;
  }
  return Number.NaN;
}

/** The one comparator implementation used by Designer preview and template runtime. */
export function valueRuleMatches(condition: ValueRuleCondition, raw: unknown): boolean {
  if (
    (typeof raw !== 'string' && typeof raw !== 'number') ||
    (typeof raw === 'number' && !Number.isFinite(raw))
  ) {
    return false;
  }
  if (condition.comparator === 'between') {
    if (typeof raw !== typeof condition.min || typeof condition.min !== typeof condition.max) {
      return false;
    }
    return (
      compareRuleScalars(condition.min, raw) <= 0 && compareRuleScalars(raw, condition.max) <= 0
    );
  }
  if (typeof raw !== typeof condition.value) return false;
  const order = compareRuleScalars(raw, condition.value);
  switch (condition.comparator) {
    case '=':
      return order === 0;
    case '!=':
      return order !== 0;
    case '<':
      return order < 0;
    case '<=':
      return order <= 0;
    case '>':
      return order > 0;
    case '>=':
      return order >= 0;
  }
}

/** Authored-order, first-match-wins across the whole rule list (legacy helper). */
export function firstMatchingValueRule(
  set: ValueRuleSet,
  raw: unknown,
): { rule: ValueRule; index: number } | undefined {
  for (let index = 0; index < set.rules.length; index += 1) {
    const rule = set.rules[index];
    if (rule !== undefined && valueRuleMatches(rule.condition, raw)) return { rule, index };
  }
  return undefined;
}

function valueRuleEffectKey(effect: ValueRuleEffect): string {
  return `${effect.elementId}\0${effect.property}`;
}

/**
 * Authored-order winners, one per target property. Two matching rules may therefore change (for
 * example) a text colour and a background colour together, while two text-colour rules still use
 * the first authored match.
 */
export function matchingValueRules(
  set: ValueRuleSet,
  raw: unknown,
): { rule: ValueRule; index: number }[] {
  const claimed = new Set<string>();
  const matches: { rule: ValueRule; index: number }[] = [];
  for (let index = 0; index < set.rules.length; index += 1) {
    const rule = set.rules[index];
    if (rule === undefined || !valueRuleMatches(rule.condition, raw)) continue;
    const key = valueRuleEffectKey(rule.effect);
    if (claimed.has(key)) continue;
    claimed.add(key);
    matches.push({ rule, index });
  }
  return matches;
}
