import { describe, expect, it } from 'vitest';
import type { DynamicField, FieldDigits, Scene, TextElement } from '@cg/shared-schema';
import { applyFieldValues } from '../src/bindings.js';
import { buildScene } from '../src/scene-builder.js';
import { lowerThirdScene } from './fixtures.js';

/**
 * `TEXT-DIGITS-01` — the page draws each text by ITS OWN Digits choice: the text an author typed
 * into an element by the element's, a value bound from a field by the field's, and a date binding's
 * output by its field's — each with its control beside it, and an old template exactly as before.
 */

/** The fixture with its one text element's authored text, and its Digits (absent when undefined). */
function sceneWith(text: string, digits?: FieldDigits): Scene {
  const scene = structuredClone(lowerThirdScene);
  const el = scene.layers[0]?.children.find((e) => e.id === 'name');
  if (el === undefined || el.type !== 'text') throw new Error('fixture changed');
  const typed = el as TextElement;
  typed.text = text;
  if (digits === undefined) delete typed.digits;
  else typed.digits = digits;
  return scene;
}

/** The glyphs of the fixture's text element, built with no field values applied. */
function built(scene: Scene): { text: string; node: HTMLElement } {
  const { elementMap } = buildScene(scene);
  const node = elementMap.get('name');
  if (node === undefined) throw new Error('not built');
  return { text: node.textContent ?? '', node };
}

describe('a static title draws in its element’s Digits (TEXT-DIGITS-01)', () => {
  it('each choice: Persian ۱۴, Arabic-Indic ١٤, Latin 14, Keyboard as stored', () => {
    const typed = 'اخبار ساعت 14';
    expect(built(sceneWith(typed, 'persian')).text).toBe('اخبار ساعت ۱۴');
    expect(built(sceneWith(typed, 'arabic-indic')).text).toBe('اخبار ساعت ١٤');
    expect(built(sceneWith('اخبار ساعت ۱۴', 'latin')).text).toBe('اخبار ساعت 14');
    expect(built(sceneWith('اخبار ساعت ۱۴', 'as-typed')).text).toBe('اخبار ساعت ۱۴');
  });

  it('an old template — no Digits key — draws exactly as stored, and its DOM carries no stamp', () => {
    for (const text of ['Score 12', '۱۲۳', '١٢٣', 'ساعت 12:30']) {
      const { text: drawn, node } = built(sceneWith(text));
      expect(drawn).toBe(text);
      expect(node.hasAttribute('data-cg-digits')).toBe(false);
    }
    // The control: a real choice IS stamped (the placeholder path reads it).
    expect(built(sceneWith('x 1', 'persian')).node.getAttribute('data-cg-digits')).toBe('persian');
  });

  it('a gradient title draws the same digits in its inner glyph node', () => {
    const scene = sceneWith('F-16', 'persian');
    const el = scene.layers[0]?.children.find((e) => e.id === 'name') as TextElement;
    el.colorFill = {
      kind: 'linear',
      angle: 90,
      stops: [
        { at: 0, color: '#FF0000' },
        { at: 1, color: '#0000FF' },
      ],
    };
    const { node } = built(scene);
    expect(node.querySelector('[data-cg-text]')?.textContent).toBe('F-۱۶');
  });
});

describe('one element, two rules: the author’s text and a bound value (TEXT-DIGITS-01)', () => {
  function mixed(
    elementDigits: FieldDigits | undefined,
    fieldDigits: FieldDigits,
    typed = 'ساعت 10 — {v}',
  ): string {
    const scene = sceneWith(typed, elementDigits);
    scene.fields[0] = {
      id: 'anchor',
      label: 'x',
      required: false,
      type: 'text',
      default: '',
      digits: fieldDigits,
    } satisfies DynamicField;
    scene.bindings[0] = {
      fieldId: 'anchor',
      target: { kind: 'text', elementId: 'name', placeholder: '{v}' },
    };
    const { container, elementMap, textOriginals } = buildScene(scene);
    applyFieldValues(scene, { anchor: '25' }, elementMap, textOriginals, container);
    return elementMap.get('name')?.textContent ?? '';
  }

  it('the author’s text in the element’s Persian, the value in its field’s Latin', () => {
    expect(mixed('persian', 'latin')).toBe('ساعت ۱۰ — 25');
  });

  it('and the other way round: Latin author text, a Persian value', () => {
    // Typed in Persian digits, so a missing author mapping would show.
    expect(mixed('latin', 'persian', 'ساعت ۱۰ — {v}')).toBe('ساعت 10 — ۲۵');
  });

  it('an old element (no Digits) keeps its author text as typed (the control)', () => {
    expect(mixed(undefined, 'persian')).toBe('ساعت 10 — ۲۵');
  });

  it('a marker that holds a digit still matches — the split is on the typed text', () => {
    const scene = sceneWith('گل {1}', 'persian');
    scene.bindings[0] = {
      fieldId: 'anchor',
      target: { kind: 'text', elementId: 'name', placeholder: '{1}' },
    };
    const { container, elementMap, textOriginals } = buildScene(scene);
    applyFieldValues(scene, { anchor: 'رضا' }, elementMap, textOriginals, container);
    expect(elementMap.get('name')?.textContent).toBe('گل رضا');
  });
});

describe('a date draws in its field’s Digits, and reads any (TEXT-DIGITS-01)', () => {
  // Noon LOCAL time (a date-time with no offset is local), so the day is the 19th in every
  // timezone — a bare `2026-05-19` is UTC midnight and reads as the 18th west of Greenwich.
  const PERSIAN_NOON = '۲۰۲۶-۰۵-۱۹T۱۲:۰۰';
  const LATIN_NOON = '2026-05-19T12:00';

  function date(transform: 'date-fa' | 'date-en', digits: FieldDigits | undefined, value: string) {
    const scene = sceneWith('{{anchor}}');
    scene.fields[0] = {
      id: 'anchor',
      label: 'x',
      required: false,
      type: 'text',
      default: '',
      ...(digits === undefined ? {} : { digits }),
    } satisfies DynamicField;
    scene.bindings[0] = {
      fieldId: 'anchor',
      target: { kind: 'text', elementId: 'name' },
      transform,
    };
    const { container, elementMap, textOriginals } = buildScene(scene);
    applyFieldValues(scene, { anchor: value }, elementMap, textOriginals, container);
    return elementMap.get('name')?.textContent ?? '';
  }

  it('a Latin field draws the Jalali date in Latin, a Persian one in Persian — from Persian input', () => {
    expect(date('date-fa', 'latin', PERSIAN_NOON)).toBe('1405/02/29');
    expect(date('date-fa', 'persian', PERSIAN_NOON)).toBe('۱۴۰۵/۰۲/۲۹');
    expect(date('date-fa', 'arabic-indic', LATIN_NOON)).toBe('١٤٠٥/٠٢/٢٩');
    expect(date('date-en', 'persian', LATIN_NOON)).toBe('۲۰۲۶-۰۵-۱۹');
  });

  it('no choice, or Keyboard, keeps the transform’s own digits — today’s behaviour (the control)', () => {
    expect(date('date-fa', undefined, LATIN_NOON)).toBe('۱۴۰۵/۰۲/۲۹');
    expect(date('date-fa', 'as-typed', LATIN_NOON)).toBe('۱۴۰۵/۰۲/۲۹');
    expect(date('date-en', undefined, LATIN_NOON)).toBe('2026-05-19');
    expect(date('date-en', 'as-typed', LATIN_NOON)).toBe('2026-05-19');
  });

  it('a Persian field no longer hands the date its own digits to choke on (the latent throw)', () => {
    // The value arrives in the field's digits — what CG Control now stages for a Persian field.
    expect(() => date('date-fa', 'persian', PERSIAN_NOON)).not.toThrow();
    expect(date('date-en', 'persian', PERSIAN_NOON)).toBe('۲۰۲۶-۰۵-۱۹');
  });
});
