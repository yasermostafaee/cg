import { describe, expect, it } from 'vitest';
import type { DynamicField, FieldDigits } from '@cg/shared-schema';
import { applyFieldValues } from '../src/bindings.js';
import { buildScene } from '../src/scene-builder.js';
import { lowerThirdScene } from './fixtures.js';

describe('applyFieldValues', () => {
  it('substitutes a placeholder with a field value', () => {
    const { container, elementMap, textOriginals } = buildScene(lowerThirdScene);
    applyFieldValues(
      lowerThirdScene,
      { anchor: 'دکتر سارا نادری' },
      elementMap,
      textOriginals,
      container,
    );
    expect(elementMap.get('name')?.textContent).toBe('دکتر سارا نادری');
  });

  it('B-016/B-017 — a text binding writes the INNER gradient node, preserving its clip', () => {
    const sceneCopy = structuredClone(lowerThirdScene);
    const txt = sceneCopy.layers[0]?.children.find((e) => e.id === 'name');
    if (txt === undefined || txt.type !== 'text') throw new Error('fixture changed');
    txt.colorFill = {
      kind: 'linear',
      angle: 90,
      stops: [
        { at: 0, color: '#FF0000' },
        { at: 1, color: '#0000FF' },
      ],
    };
    const { container, elementMap, textOriginals } = buildScene(sceneCopy);
    applyFieldValues(
      sceneCopy,
      { anchor: 'دکتر سارا نادری' },
      elementMap,
      textOriginals,
      container,
    );
    const host = elementMap.get('name')!;
    const inner = host.querySelector<HTMLElement>('[data-cg-text]')!;
    expect(inner.textContent).toBe('دکتر سارا نادری');
    // Only textContent changed — the gradient clip survives the binding update.
    expect(inner.style.getPropertyValue('background-clip')).toBe('text');
    // The host has no stray direct text node; its text comes from the inner node.
    expect(host.childNodes.length).toBe(1);
    expect(host.firstChild).toBe(inner);
  });

  it('falls back to the field default when no value is supplied', () => {
    const { container, elementMap, textOriginals } = buildScene(lowerThirdScene);
    applyFieldValues(lowerThirdScene, {}, elementMap, textOriginals, container);
    expect(elementMap.get('name')?.textContent).toBe('سارا نادری');
  });

  it('replaces the whole text when placeholder is absent', () => {
    const sceneCopy = structuredClone(lowerThirdScene);
    sceneCopy.bindings[0]!.target = { kind: 'text', elementId: 'name' };
    const { container, elementMap, textOriginals } = buildScene(sceneCopy);
    applyFieldValues(sceneCopy, { anchor: 'replaced' }, elementMap, textOriginals, container);
    expect(elementMap.get('name')?.textContent).toBe('replaced');
  });

  it('truncates a text value to the field maxLength (code-point safe)', () => {
    const sceneCopy = structuredClone(lowerThirdScene);
    sceneCopy.bindings[0]!.target = { kind: 'text', elementId: 'name' }; // full-text replace
    const anchor = sceneCopy.fields.find((f) => f.id === 'anchor');
    if (anchor !== undefined && anchor.type === 'text') anchor.maxLength = 5;
    const { container, elementMap, textOriginals } = buildScene(sceneCopy);

    applyFieldValues(sceneCopy, { anchor: 'Hello World' }, elementMap, textOriginals, container);
    expect(elementMap.get('name')?.textContent).toBe('Hello');

    // Surrogate-pair chars count as one code point and are never split.
    applyFieldValues(sceneCopy, { anchor: '👍👍👍👍👍👍' }, elementMap, textOriginals, container);
    expect(elementMap.get('name')?.textContent).toBe('👍👍👍👍👍');
  });

  it('writes a color binding to a shape fill', () => {
    const sceneCopy = structuredClone(lowerThirdScene);
    sceneCopy.fields.push({
      id: 'themeColor',
      label: 'Theme',
      required: false,
      type: 'color',
      default: '#FFFFFF',
    });
    sceneCopy.bindings.push({
      fieldId: 'themeColor',
      target: { kind: 'color', elementId: 'bg', property: 'fill' },
    });
    const { container, elementMap, textOriginals } = buildScene(sceneCopy);
    applyFieldValues(sceneCopy, { themeColor: '#E11D48' }, elementMap, textOriginals, container);
    expect(elementMap.get('bg')?.style.background).toMatch(/#e11d48/i);
  });

  it('toggles visibility', () => {
    const sceneCopy = structuredClone(lowerThirdScene);
    sceneCopy.fields.push({
      id: 'showLogo',
      label: 'Show logo',
      required: false,
      type: 'boolean',
      default: true,
    });
    sceneCopy.bindings.push({
      fieldId: 'showLogo',
      target: { kind: 'visible', elementId: 'bg' },
    });
    const { container, elementMap, textOriginals } = buildScene(sceneCopy);
    applyFieldValues(sceneCopy, { showLogo: false }, elementMap, textOriginals, container);
    expect(elementMap.get('bg')?.style.display).toBe('none');
  });

  it('writes to scene-background target', () => {
    const sceneCopy = structuredClone(lowerThirdScene);
    sceneCopy.fields.push({
      id: 'bgColor',
      label: 'BG',
      required: false,
      type: 'color',
      default: '#000000',
    });
    sceneCopy.bindings.push({
      fieldId: 'bgColor',
      target: { kind: 'scene-background' },
    });
    const { container, elementMap, textOriginals } = buildScene(sceneCopy);
    applyFieldValues(sceneCopy, { bgColor: '#0F172A' }, elementMap, textOriginals, container);
    expect(container.style.background).toMatch(/#0f172a/i);
  });

  it('applies the persian-digits transform', () => {
    const sceneCopy = structuredClone(lowerThirdScene);
    sceneCopy.fields[0] = {
      id: 'anchor',
      label: 'x',
      required: false,
      type: 'text',
      default: '',
    };
    sceneCopy.bindings[0]!.transform = 'persian-digits';
    const { container, elementMap, textOriginals } = buildScene(sceneCopy);
    applyFieldValues(sceneCopy, { anchor: 'Episode 12' }, elementMap, textOriginals, container);
    expect(elementMap.get('name')?.textContent).toBe('Episode ۱۲');
  });

  /*
    `PERSIAN-DIGITS-01` §2 B — a `transform` target reads its value as a NUMBER. `Number('۰٫۵')` is
    NaN, so a value typed on a Persian keyboard was dropped without a word. The Latin value and
    the not-a-number value are the controls.
  */
  it('a transform target reads a number typed in Persian digits', () => {
    const sceneCopy = structuredClone(lowerThirdScene);
    sceneCopy.fields.push({
      id: 'fade',
      label: 'Fade',
      required: false,
      type: 'text',
      default: '',
    });
    sceneCopy.bindings.push({
      fieldId: 'fade',
      target: { kind: 'transform', elementId: 'bg', property: 'opacity' },
    });
    const { container, elementMap, textOriginals } = buildScene(sceneCopy);
    const opacity = (value: string): string => {
      applyFieldValues(sceneCopy, { fade: value }, elementMap, textOriginals, container);
      return elementMap.get('bg')?.style.opacity ?? '';
    };
    expect(opacity('۰٫۵')).toBe('0.5');
    expect(opacity('٠٫٢٥')).toBe('0.25');
    expect(opacity('0.75')).toBe('0.75');
    // Not a number in any set: the element keeps what it had.
    expect(opacity('نیم')).toBe('0.75');
  });

  it('a text binding renders a Persian, an Arabic-Indic and a Latin number exactly as sent', () => {
    const sceneCopy = structuredClone(lowerThirdScene);
    sceneCopy.bindings[0]!.target = { kind: 'text', elementId: 'name' };
    const { container, elementMap, textOriginals } = buildScene(sceneCopy);
    for (const v of ['۱۲۳', '١٢٣', '123', 'ساعت ۱۲:۳۰']) {
      applyFieldValues(sceneCopy, { anchor: v }, elementMap, textOriginals, container);
      expect(elementMap.get('name')?.textContent).toBe(v);
    }
  });

  /*
    `FIELD-DIGITS-01` — the page draws a value in its FIELD's digits. A text field keeps its
    punctuation; a number field's JSON number gets its set's decimal mark and no grouping. A field
    with no setting — every template made before it existed — draws exactly as before.
  */
  describe('a value draws in its field digits (FIELD-DIGITS-01)', () => {
    const base = { id: 'anchor', label: 'x', required: false } as const;
    const text = (digits?: FieldDigits): DynamicField => ({
      ...base,
      type: 'text',
      default: '',
      ...(digits === undefined ? {} : { digits }),
    });
    const number = (digits?: Exclude<FieldDigits, 'as-typed'>): DynamicField => ({
      ...base,
      type: 'number',
      default: 0,
      ...(digits === undefined ? {} : { digits }),
    });
    const drawn = (
      field: DynamicField,
      value: string | number,
      transform?: 'latin-digits',
    ): string => {
      const sceneCopy = structuredClone(lowerThirdScene);
      sceneCopy.fields[0] = field;
      sceneCopy.bindings[0]!.target = { kind: 'text', elementId: 'name' };
      if (transform !== undefined) sceneCopy.bindings[0]!.transform = transform;
      const { container, elementMap, textOriginals } = buildScene(sceneCopy);
      applyFieldValues(sceneCopy, { anchor: value }, elementMap, textOriginals, container);
      return elementMap.get('name')?.textContent ?? '';
    };

    it('a Persian text field draws 12:30 as ۱۲:۳۰; a Latin one draws 12:30 (the control)', () => {
      expect(drawn(text('persian'), '12:30')).toBe('۱۲:۳۰');
      expect(drawn(text('persian'), 'F-16')).toBe('F-۱۶');
      expect(drawn(text('arabic-indic'), 'ساعت 12:30')).toBe('ساعت ١٢:٣٠');
      expect(drawn(text('latin'), '۱۲:۳۰')).toBe('12:30');
      expect(drawn(text('latin'), '12:30')).toBe('12:30');
    });

    it('a Persian number field draws the number 12.5 as ۱۲٫۵, with no grouping', () => {
      expect(drawn(number('persian'), 12.5)).toBe('۱۲٫۵');
      expect(drawn(number('persian'), 1234567)).toBe('۱۲۳۴۵۶۷');
      expect(drawn(number('persian'), -3)).toBe('-۳');
      expect(drawn(number('arabic-indic'), 12.5)).toBe('١٢٫٥');
      expect(drawn(number('latin'), 12.5)).toBe('12.5');
    });

    it('an old template renders unchanged: text as typed, a number through String(n)', () => {
      for (const v of ['۱۲۳', '١٢٣', '123', 'ساعت ۱۲:۳۰', '12:30']) {
        expect(drawn(text(), v)).toBe(v);
      }
      expect(drawn(number(), 12.5)).toBe('12.5');
      expect(drawn(number(), 1234567)).toBe('1234567');
    });

    it('the binding transform still applies after the field digits', () => {
      expect(drawn(text('persian'), '12:30', 'latin-digits')).toBe('12:30');
    });

    it('a value already written in the field digits draws the same (idempotent)', () => {
      expect(drawn(text('persian'), '۱۲:۳۰')).toBe('۱۲:۳۰');
      expect(drawn(number('persian'), '۱۲٫۵')).toBe('۱۲٫۵');
    });
  });

  it('ignores bindings targeting unknown elements', () => {
    const sceneCopy = structuredClone(lowerThirdScene);
    sceneCopy.bindings.push({
      fieldId: 'anchor',
      target: { kind: 'text', elementId: 'nonexistent' },
    });
    const { container, elementMap, textOriginals } = buildScene(sceneCopy);
    expect(() =>
      applyFieldValues(sceneCopy, { anchor: 'x' }, elementMap, textOriginals, container),
    ).not.toThrow();
  });
});
