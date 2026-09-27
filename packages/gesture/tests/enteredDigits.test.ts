// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import type { KeyboardLanguage } from '@cg/text-shaping';
import { enteredBy, writeDigitsInto, writeDigitsIntoEditable } from '../src/enteredDigits.js';

/**
 * `TEXT-DIGITS-01` — what a text box writes as text is entered: its choice, the caret kept. Keyboard
 * changes only TYPED text, in the keyboard's digits; a paste keeps its own.
 */

afterEach(() => {
  document.body.innerHTML = '';
});

const lang = (l: KeyboardLanguage) => (): KeyboardLanguage => l;

/** A box holding `value` with the caret at `caret`, as the browser leaves it after an input. */
function box(value: string, caret = value.length): HTMLInputElement {
  const el = document.createElement('input');
  document.body.appendChild(el);
  el.value = value;
  el.setSelectionRange(caret, caret);
  return el;
}
const typed = (data: string): InputEvent =>
  new InputEvent('input', { inputType: 'insertText', data });
const pasted = (): InputEvent => new InputEvent('input', { inputType: 'insertFromPaste' });

describe('writeDigitsInto — an input or a textarea', () => {
  it('a digit set writes the whole value, the caret kept', () => {
    const el = box('ساعت 12:30', 6);
    expect(writeDigitsInto(el, typed('2'), 'persian', lang('unknown'))).toBe('ساعت ۱۲:۳۰');
    expect(el.value).toBe('ساعت ۱۲:۳۰');
    expect(el.selectionStart).toBe(6);
  });

  it('a digit set writes a paste too (the control: Keyboard keeps it)', () => {
    expect(writeDigitsInto(box('۱۲ and 12'), pasted(), 'latin', lang('persian'))).toBe('12 and 12');
    expect(writeDigitsInto(box('۱۲ and 12'), pasted(), 'as-typed', lang('persian'))).toBe(
      '۱۲ and 12',
    );
  });

  it('Keyboard writes a typed digit in the keyboard language: persian ۱, arabic ١, latin 1, unknown 1', () => {
    expect(writeDigitsInto(box('1'), typed('1'), 'as-typed', lang('persian'))).toBe('۱');
    expect(writeDigitsInto(box('1'), typed('1'), 'as-typed', lang('arabic'))).toBe('١');
    expect(writeDigitsInto(box('1'), typed('1'), 'as-typed', lang('latin'))).toBe('1');
    expect(writeDigitsInto(box('1'), typed('1'), 'as-typed', lang('unknown'))).toBe('1');
  });

  it('Keyboard changes only what was just typed — 12 then, on Persian, 34 reads 12۳۴', () => {
    const el = box('12');
    writeDigitsInto(el, typed('2'), 'as-typed', lang('latin'));
    el.value = '123';
    el.setSelectionRange(3, 3);
    writeDigitsInto(el, typed('3'), 'as-typed', lang('persian'));
    el.value = `${el.value}4`;
    el.setSelectionRange(4, 4);
    expect(writeDigitsInto(el, typed('4'), 'as-typed', lang('persian'))).toBe('12۳۴');
  });

  it('a number keeps its decimal mark rule', () => {
    expect(writeDigitsInto(box('12.5'), typed('5'), 'persian', lang('unknown'), 'number')).toBe(
      '۱۲٫۵',
    );
  });

  it('an event that is not an input event is "other" (a React test change, a programmatic write)', () => {
    expect(enteredBy(new Event('change'), 3, 5)).toEqual({ how: 'other', start: 0, end: 5 });
    expect(enteredBy(undefined, 3, 5)).toEqual({ how: 'other', start: 0, end: 5 });
    expect(enteredBy(typed('ab'), 3, 5)).toEqual({ how: 'typed', start: 1, end: 3 });
  });
});

describe('writeDigitsIntoEditable — the canvas double-click edit', () => {
  function editable(text: string, caret: number): { root: HTMLDivElement; node: Text } {
    const root = document.createElement('div');
    root.contentEditable = 'true';
    const node = document.createTextNode(text);
    root.appendChild(node);
    document.body.appendChild(root);
    const selection = document.getSelection();
    selection?.setBaseAndExtent(node, caret, node, caret);
    return { root, node };
  }

  it('a Persian title typed 14 shows ۱۴ with the caret after it', () => {
    const { root, node } = editable('اخبار ساعت 14', 13);
    writeDigitsIntoEditable(root, typed('4'), 'persian', lang('unknown'));
    expect(root.textContent).toBe('اخبار ساعت ۱۴');
    const selection = document.getSelection();
    expect(selection?.focusNode).toBe(node);
    expect(selection?.focusOffset).toBe(13);
  });

  it('a Latin title keeps 14 (the control)', () => {
    const { root } = editable('اخبار ساعت 14', 13);
    writeDigitsIntoEditable(root, typed('4'), 'latin', lang('persian'));
    expect(root.textContent).toBe('اخبار ساعت 14');
  });

  it('Keyboard writes only the digit just typed, in the keyboard language', () => {
    const { root } = editable('12 34', 5);
    writeDigitsIntoEditable(root, typed('4'), 'as-typed', lang('persian'));
    expect(root.textContent).toBe('12 3۴');
    // A paste changes nothing (the control).
    const other = editable('12', 2);
    writeDigitsIntoEditable(other.root, pasted(), 'as-typed', lang('persian'));
    expect(other.root.textContent).toBe('12');
  });

  it('with no selection a digit set still writes the text (nothing to restore)', () => {
    const root = document.createElement('div');
    root.textContent = 'F-16';
    document.body.appendChild(root);
    document.getSelection()?.removeAllRanges();
    writeDigitsIntoEditable(root, undefined, 'arabic-indic', lang('unknown'));
    expect(root.textContent).toBe('F-١٦');
  });
});
