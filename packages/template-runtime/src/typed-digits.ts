import { FieldDigitsSchema, type FieldDigits } from '@cg/shared-schema';
import { writeFieldDigits } from '@cg/text-shaping';

/**
 * `TEXT-DIGITS-01` — **TEXT AN AUTHOR TYPED, AND A LIST'S ITEMS, AS THE PAGE DRAWS THEM.**
 *
 * An element's own text — a title, a ticker's authored items and separator, a sequence's authored
 * items — is drawn in the ELEMENT's Digits choice; a list bound to it, in the LIST FIELD's. Each part
 * keeps its own rule. Every digit goes through `writeFieldDigits`, the one writer: `as-typed`
 * (Keyboard) is the identity, so a template made before the choice existed draws unchanged.
 */

/** Items whose `text` (where they have one) is drawn in `digits`; a composition item passes as is. */
export function itemsInDigits<T extends { readonly id: string; readonly text?: string }>(
  items: readonly T[],
  digits: FieldDigits,
): T[] {
  if (digits === 'as-typed') return [...items];
  return items.map((item) =>
    typeof item.text === 'string' ? { ...item, text: writeFieldDigits(item.text, digits) } : item,
  );
}

/**
 * A text element's node carries its Digits choice for the one path that draws its author text AFTER
 * the build — a placeholder binding's write (`bindings.ts`). Stamped only for a real choice, so an
 * old template's DOM is byte-for-byte what it was.
 */
const DIGITS_DATASET = 'cgDigits';

export function stampTypedDigits(node: HTMLElement, digits: FieldDigits): void {
  if (digits !== 'as-typed') node.dataset[DIGITS_DATASET] = digits;
}

/** The choice {@link stampTypedDigits} left on `node`; `as-typed` when none (or a stranger value). */
export function typedDigitsOf(node: HTMLElement): FieldDigits {
  const stamped = FieldDigitsSchema.safeParse(node.dataset[DIGITS_DATASET]);
  return stamped.success ? stamped.data : 'as-typed';
}
