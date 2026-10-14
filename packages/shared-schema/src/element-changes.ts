import { z } from 'zod';
import { HexColorSchema, IdSchema } from './primitives.js';
import type { Element } from './elements.js';

/**
 * 🔴 `DELTA-RUN-NEXT-VERSION-01-A` §2 — **ONE CHANGE TO ONE ELEMENT: "this element → this property →
 * this value".**
 *
 * The record knows NOTHING about what triggers it. A countdown step holds a list of these today
 * (`CountdownStepsSchema`); `D-139`'s field-value ranges will hold the same list tomorrow — so the
 * shape, the property vocabulary and the runtime that applies it are written once.
 *
 * The properties are the v1 set the owner asked for. A property the target element's KIND does not
 * own is INERT at runtime (never an error) and is never offered by the Designer:
 *
 * - `visible` — show (`true`) or hide (`false`); composes with lifespans and visibility bindings
 *   rather than overriding them (a step never shows an element outside its own lifespan).
 * - `opacity` — 0…1, multiplying the element's own (animated) opacity, so an intro or an exit fade
 *   still runs on top of it.
 * - `textColor` / `backgroundColor` / `fill` / `stroke` — the SAME CSS property the `color` binding
 *   writes for that kind, so an element recolours identically whichever mechanism drove it.
 * - `blink` — the whole element blinks (on) or stops blinking (off).
 * - `image` — an `image` element shows another picture of the project or the shared library.
 */
export const ELEMENT_CHANGE_PROPERTIES = [
  'visible',
  'opacity',
  'textColor',
  'backgroundColor',
  'fill',
  'stroke',
  'blink',
  'image',
] as const;
export type ElementChangeProperty = (typeof ELEMENT_CHANGE_PROPERTIES)[number];

/** The four colour properties — one CSS property per element kind (`zoneColorTargets`). */
export const COLOR_CHANGE_PROPERTIES = ['textColor', 'backgroundColor', 'fill', 'stroke'] as const;
export type ColorChangeProperty = (typeof COLOR_CHANGE_PROPERTIES)[number];

/** A picture an `image` change swaps in: the same reference an image element carries. */
export const ImageChangeValueSchema = z.object({
  assetId: IdSchema,
  source: z.enum(['project', 'shared']),
});
export type ImageChangeValue = z.infer<typeof ImageChangeValueSchema>;

export const ElementChangeSchema = z.discriminatedUnion('property', [
  z.object({ elementId: IdSchema, property: z.literal('visible'), value: z.boolean() }),
  z.object({
    elementId: IdSchema,
    property: z.literal('opacity'),
    value: z.number().min(0).max(1),
  }),
  z.object({ elementId: IdSchema, property: z.literal('textColor'), value: HexColorSchema }),
  z.object({ elementId: IdSchema, property: z.literal('backgroundColor'), value: HexColorSchema }),
  z.object({ elementId: IdSchema, property: z.literal('fill'), value: HexColorSchema }),
  z.object({ elementId: IdSchema, property: z.literal('stroke'), value: HexColorSchema }),
  z.object({ elementId: IdSchema, property: z.literal('blink'), value: z.boolean() }),
  z.object({ elementId: IdSchema, property: z.literal('image'), value: ImageChangeValueSchema }),
]);
export type ElementChange = z.infer<typeof ElementChangeSchema>;

/**
 * How a set of changes arrives: a `cut`, or a `fade` over `ms`. It belongs to the set being
 * ENTERED — leaving one step for the next uses the next step's transition, so every property a step
 * releases returns to its authored value with the same timing the new step's own changes use.
 * Absent ⇒ {@link DEFAULT_CHANGE_TRANSITION}.
 */
export const ChangeTransitionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('cut') }),
  z.object({ kind: z.literal('fade'), ms: z.number().int().min(1).max(10_000) }),
]);
export type ChangeTransition = z.infer<typeof ChangeTransitionSchema>;

/** A fade of 300 ms — the owner's default for a new step. */
export const DEFAULT_CHANGE_TRANSITION: ChangeTransition = { kind: 'fade', ms: 300 };

/** A transition's duration in ms — 0 for a cut. */
export function transitionMs(t: ChangeTransition | undefined): number {
  const resolved = t ?? DEFAULT_CHANGE_TRANSITION;
  return resolved.kind === 'cut' ? 0 : resolved.ms;
}

/**
 * 🔴 **THE COLOUR PROPERTIES AN ELEMENT'S KIND OWNS** — one answer for the Designer's picker, the
 * zone migration and the runtime's stylesheet (`@cg/template-runtime`'s `colorChangeTargets`, which
 * adds the CSS property each one writes). A slot a kind does not own is INERT and never offered.
 *
 * - `text` owns its text colour and its box background — unless that colour is a GRADIENT, which a
 *   flat colour cannot reach without destroying it.
 * - `ticker` / `clock` / `sequence` own only their text colour (D-056 removed their box styling).
 * - `shape` / `path` own their fill (unless a gradient) and their stroke.
 * - every other visual kind owns a box tint (`backgroundColor`), authored as nothing.
 */
export function colorPropertiesOf(element: Element): ColorChangeProperty[] {
  const solidGlyphs = (): boolean => {
    const fill = 'colorFill' in element ? element.colorFill : undefined;
    return fill === undefined || fill.kind === 'solid';
  };
  switch (element.type) {
    case 'text': {
      const out: ColorChangeProperty[] = solidGlyphs() ? ['textColor'] : [];
      if (element.backgroundFill === undefined) out.push('backgroundColor');
      return out;
    }
    case 'ticker':
    case 'clock':
    case 'sequence':
      return solidGlyphs() ? ['textColor'] : [];
    case 'shape':
    case 'path':
      return element.fill === undefined || element.fill.kind === 'solid'
        ? ['fill', 'stroke']
        : ['stroke'];
    default:
      return ['backgroundColor'];
  }
}

/**
 * Every property a change may set on `element`, in the order an editor offers them. A Live Source
 * offers NOTHING: its picture is a separate CasparCG layer a page change cannot reach (`-F`), and
 * painting its hole would put a lid over the guest's face (D-137 §9). A sound offers nothing — it
 * is never painted.
 */
export function changePropertiesOf(element: Element): ElementChangeProperty[] {
  if (element.type === 'video-placeholder' || element.type === 'audio') return [];
  const out: ElementChangeProperty[] = [
    'visible',
    'opacity',
    ...colorPropertiesOf(element),
    'blink',
  ];
  if (element.type === 'image') out.push('image');
  return out;
}

/**
 * Within ONE set, at most one change per (element, property): two values for one property have no
 * winner. The offending change is named by its index, so an editor marks that row.
 */
export function refineChangeList(
  changes: readonly ElementChange[],
  ctx: z.RefinementCtx,
  path: (string | number)[],
): void {
  const seen = new Set<string>();
  changes.forEach((change, i) => {
    const key = JSON.stringify([change.elementId, change.property]);
    if (seen.has(key)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [...path, i, 'property'],
        message: `two changes set ${change.property} on one element`,
      });
    }
    seen.add(key);
  });
}
