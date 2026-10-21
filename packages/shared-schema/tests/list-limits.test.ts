import { describe, expect, it } from 'vitest';
import { listFieldMaxItems, withListLimits, type DynamicField, type Scene } from '../src/index.js';

/**
 * 🔴 `RUN-NEXT-VERSION-02` Q3 / Q4 — the most items a list field takes is the row limit of the
 * repeater it drives: one derivation for the Designer's preview, the GDD and CG Control's import.
 */

const T = {
  position: { x: 0, y: 0 },
  size: { w: 400, h: 400 },
  scale: { x: 1, y: 1 },
  rotation: 0,
  anchor: { x: 0, y: 0 },
};
const repeater = (id: string, maxItems?: number) => ({
  id,
  name: id,
  type: 'repeater',
  transform: T,
  opacity: 1,
  visible: true,
  locked: false,
  zIndex: 0,
  compositionId: 'row',
  items: [],
  ...(maxItems !== undefined ? { maxItems } : {}),
});
const list = (id: string, extra: Record<string, unknown> = {}): DynamicField =>
  ({ id, label: id, required: false, type: 'list', default: [], ...extra }) as DynamicField;
const doc = (children: unknown[], fields: DynamicField[], bindings: unknown[]) =>
  ({
    layers: [{ id: 'L', name: 'L', visible: true, locked: false, children }],
    fields,
    bindings,
    compositions: [],
  }) as unknown as Scene;
const drives = (fieldId: string, elementId: string) => ({
  fieldId,
  target: { kind: 'repeater-items', elementId },
});

describe('listFieldMaxItems', () => {
  it('a list driving a repeater with max items 4 takes 4; with none, no limit', () => {
    const d = doc(
      [repeater('r', 4), repeater('free')],
      [],
      [drives('a', 'r'), drives('b', 'free')],
    );
    expect(listFieldMaxItems(d, 'a')).toBe(4);
    expect(listFieldMaxItems(d, 'b')).toBeUndefined();
    expect(listFieldMaxItems(d, 'nobody')).toBeUndefined();
  });

  it('a list driving two repeaters takes the smaller limit', () => {
    const d = doc(
      [repeater('r1', 4), repeater('r2', 2)],
      [],
      [drives('a', 'r1'), drives('a', 'r2')],
    );
    expect(listFieldMaxItems(d, 'a')).toBe(2);
  });
});

describe('withListLimits', () => {
  it('stamps the limit, and drops one nothing justifies', () => {
    const d = doc([repeater('r', 3)], [], [drives('a', 'r')]);
    const out = withListLimits(d, d, {
      fields: [list('a'), list('b', { maxItems: 9 })],
      groups: [],
    });
    expect(out.fields[0]).toMatchObject({ id: 'a', maxItems: 3 });
    expect(out.fields[1]).not.toHaveProperty('maxItems');
  });
});
