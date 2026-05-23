import { describe, expect, it } from 'vitest';
import { FieldBindingSchema } from '../src/bindings.js';

describe('FieldBinding target variants', () => {
  it.each([
    { kind: 'text' as const, elementId: 'e1' },
    { kind: 'text' as const, elementId: 'e1', placeholder: '{{x}}' },
    { kind: 'image' as const, elementId: 'e1' },
    { kind: 'color' as const, elementId: 'e1', property: 'fill' as const },
    { kind: 'visible' as const, elementId: 'e1' },
    { kind: 'transform' as const, elementId: 'e1', property: 'opacity' as const },
    { kind: 'scene-background' as const },
    { kind: 'lottie-override' as const, elementId: 'e1', layer: 'L1', prop: 'color' },
  ])('accepts $kind target', (target) => {
    const b = { fieldId: 'headline', target };
    expect(FieldBindingSchema.parse(b)).toEqual(b);
  });

  it('accepts an optional transform', () => {
    const b = {
      fieldId: 'count',
      target: { kind: 'text' as const, elementId: 'e1' },
      transform: 'persian-digits' as const,
    };
    expect(FieldBindingSchema.parse(b).transform).toBe('persian-digits');
  });

  it('rejects unknown transform', () => {
    expect(() =>
      FieldBindingSchema.parse({
        fieldId: 'x',
        target: { kind: 'text', elementId: 'e1' },
        // @ts-expect-error — verifying runtime rejection
        transform: 'shout',
      }),
    ).toThrow();
  });
});
