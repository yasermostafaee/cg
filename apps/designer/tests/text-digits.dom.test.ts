/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type {
  DynamicField,
  Element,
  FieldDigits,
  FieldValue,
  NestedFieldValues,
  Scene,
  TextElement,
} from '@cg/shared-schema';
import { MemoryKv, MemoryWorkspace } from '@cg/storage';
import { ProjectStore } from '../src/platform/ProjectStore.js';
import { designerStore, editSceneOf } from '../src/renderer/state/store.js';
import {
  defaultClock,
  defaultSequence,
  defaultText,
  defaultTicker,
} from '../src/renderer/state/element-defaults.js';
import { StyleSection } from '../src/renderer/features/inspector/StyleSection.js';
import { DynamicDataSection } from '../src/renderer/features/inspector/DynamicDataSection.js';
import { TextEditor } from '../src/renderer/features/canvas/TextEditor.js';
import { PreviewFieldForm } from '../src/renderer/features/fields/PreviewFieldForm.js';
import { startKeyboardLanguage } from '../src/renderer/keyboardLanguage.js';

/**
 * `TEXT-DIGITS-01` — the Designer: every new element and field starts on Persian, an old document
 * reads Keyboard and gains no key, the one Digits control speaks the owner's words, and every editing
 * surface shows the choice as it is typed with the caret kept — each case beside its control.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// The ticker's separator picker lists the project's and the shared images (as `border-radius-layout`).
const noUnsub = (): void => {
  /* nothing to unsubscribe in a test */
};
(window as unknown as { cg: unknown }).cg = {
  assets: {
    list: () => Promise.resolve([]),
    url: () => Promise.resolve(null),
    onImported: () => noUnsub,
    onCleared: () => noUnsub,
  },
  sharedImages: {
    list: () => Promise.resolve([]),
    url: () => Promise.resolve(null),
    onImported: () => noUnsub,
  },
};

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let stopKeyboard: (() => void) | null = null;

afterEach(() => {
  if (root !== null) act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  designerStore._reset();
  stopKeyboard?.();
  // Leave a fresh detector that knows nothing (`unknown`), its listeners already gone.
  stopKeyboard = startKeyboardLanguage(document, null);
  stopKeyboard();
  stopKeyboard = null;
});

function freshScene(): void {
  const projects = new ProjectStore(new MemoryWorkspace(), new MemoryKv());
  const { scene } = projects.newScene('demo', 'lower-third');
  designerStore.setScene(scene, null);
}

function projected(): Scene {
  const st = designerStore.get();
  const scene = editSceneOf(st.scene, st.activeCompositionId);
  if (scene === null) throw new Error('no active composition');
  return scene;
}

function elementById(id: string): Element {
  const el = projected().layers[0]?.children.find((c) => c.id === id);
  if (el === undefined) throw new Error(`no element ${id}`);
  return el;
}

function fieldById(id: string): DynamicField {
  const f = projected().fields.find((x) => x.id === id);
  if (f === undefined) throw new Error(`no field ${id}`);
  return f;
}

/** A text element as a document saved before the setting holds it: no `digits` key at all. */
function withoutDigits(el: TextElement): TextElement {
  return Object.fromEntries(Object.entries(el).filter(([k]) => k !== 'digits')) as TextElement;
}

function mount(node: ReturnType<typeof createElement>): HTMLDivElement {
  if (container === null) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }
  act(() => root?.render(node));
  return container;
}

function digitsSelect(host: HTMLElement): HTMLSelectElement {
  const found = host.querySelectorAll<HTMLSelectElement>('select[aria-label="digits"]');
  const [select] = found;
  if (found.length !== 1 || select === undefined) {
    throw new Error(`expected one digits control, found ${String(found.length)}`);
  }
  return select;
}

const words = (select: HTMLSelectElement): string[] =>
  [...select.options].map((o) => o.textContent ?? '');
const values = (select: HTMLSelectElement): string[] => [...select.options].map((o) => o.value);

/** A text box's value typed the way a browser types it: the new value, then `input`. */
function typeInto(el: HTMLInputElement | HTMLTextAreaElement, value: string, data: string): void {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement : HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(proto.prototype, 'value')?.set;
  act(() => {
    setter?.call(el, value);
    el.setSelectionRange(value.length, value.length);
    el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data }));
  });
}

describe('new elements and fields start on Persian', () => {
  it('a new text, ticker and sequence element', () => {
    expect(defaultText('t', 0, 0).digits).toBe('persian');
    expect(defaultTicker('k', 0, 0).digits).toBe('persian');
    expect(defaultSequence('s', 0, 0).digits).toBe('persian');
  });

  it('a list field made through a ticker’s Data key, and a sequence item’s field', () => {
    freshScene();
    designerStore.addElement(defaultTicker('k1', 0, 0));
    designerStore.setElementDataKey('k1', 'headlines');
    expect(fieldById('headlines')).toMatchObject({ type: 'list', digits: 'persian' });

    designerStore.addElement(defaultSequence('s1', 0, 0));
    designerStore.setSequenceItemDataKey('s1', 'item-1', 'now');
    expect(fieldById('now')).toMatchObject({ type: 'text', digits: 'persian' });
  });
});

describe('the one Digits control speaks the owner’s words', () => {
  it('a text, a ticker and a sequence offer Keyboard · Persian · Latin · Arabic-Indic', () => {
    freshScene();
    for (const el of [
      defaultText('t1', 0, 0),
      defaultTicker('k1', 0, 0),
      defaultSequence('s1', 0, 0),
    ]) {
      designerStore.addElement(el);
      const host = mount(
        createElement(StyleSection, { element: elementById(el.id), selectedKeyframe: null }),
      );
      const select = digitsSelect(host);
      expect(words(select)).toEqual(['Keyboard', 'Persian', 'Latin', 'Arabic-Indic']);
      expect(values(select)).toEqual(['as-typed', 'persian', 'latin', 'arabic-indic']);
      expect(select.value).toBe('persian');
    }
  });

  it('a clock offers the three sets — a clock is a number, never Keyboard', () => {
    freshScene();
    designerStore.addElement(defaultClock('c1', 0, 0));
    const host = mount(
      createElement(StyleSection, { element: elementById('c1'), selectedKeyframe: null }),
    );
    expect(words(digitsSelect(host))).toEqual(['Persian', 'Latin', 'Arabic-Indic']);
  });

  it('the control writes the element; a Data key hands the choice to the field’s control', () => {
    freshScene();
    designerStore.addElement(defaultText('t1', 0, 0));
    const host = mount(
      createElement(StyleSection, { element: elementById('t1'), selectedKeyframe: null }),
    );
    act(() => {
      const select = digitsSelect(host);
      select.value = 'latin';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect((elementById('t1') as TextElement).digits).toBe('latin');

    designerStore.setElementDataKey('t1', 'headline');
    mount(createElement(StyleSection, { element: elementById('t1'), selectedKeyframe: null }));
    expect(host.querySelectorAll('select[aria-label="digits"]')).toHaveLength(0);
  });
});

describe('a document saved before the setting', () => {
  it('an element with no key reads Keyboard, and an unrelated edit writes none', () => {
    freshScene();
    designerStore.addElement(withoutDigits(defaultText('t1', 0, 0)));
    expect(elementById('t1')).not.toHaveProperty('digits');
    const host = mount(
      createElement(StyleSection, { element: elementById('t1'), selectedKeyframe: null }),
    );
    expect(digitsSelect(host).value).toBe('as-typed');
    expect(digitsSelect(host).selectedOptions[0]?.textContent).toBe('Keyboard');
    designerStore.updateElement('t1', { name: 'Headline' } as Partial<Element>);
    designerStore.setElementText('t1', 'ساعت 14');
    expect(elementById('t1')).not.toHaveProperty('digits');
  });
});

describe('the double-click edit shows the element’s digits as they are typed', () => {
  /** Open the inline editor on a text element `t1` holding `text` in `digits` (absent: none). */
  function openEditor(text: string, digits: FieldDigits | undefined): HTMLDivElement {
    freshScene();
    const base = withoutDigits(defaultText('t1', 0, 0));
    designerStore.addElement({ ...base, text, ...(digits === undefined ? {} : { digits }) });
    const host = mount(
      createElement(TextEditor, {
        element: elementById('t1') as TextElement,
        scale: 1,
        onCommit: () => undefined,
      }),
    );
    const editor = host.querySelector<HTMLDivElement>('[contenteditable]');
    if (editor === null) throw new Error('no editor');
    return editor;
  }

  /** The editor's one text node now reads `after`, the caret at `caret`: what typing `data` does. */
  function typeAt(editor: HTMLDivElement, after: string, caret: number, data: string): void {
    const node = editor.firstChild;
    if (!(node instanceof Text)) throw new Error('the editor holds no text node');
    act(() => {
      node.data = after;
      document.getSelection()?.setBaseAndExtent(node, caret, node, caret);
      editor.dispatchEvent(
        new InputEvent('input', { bubbles: true, inputType: 'insertText', data }),
      );
    });
  }

  it('a Persian title: `14` typed shows `۱۴`, the caret where it was', () => {
    const editor = openEditor('اخبار ساعت', 'persian');
    typeAt(editor, 'اخبار ساعت 1', 12, '1');
    typeAt(editor, 'اخبار ساعت ۱4', 13, '4');
    expect(editor.textContent).toBe('اخبار ساعت ۱۴');
    const selection = document.getSelection();
    expect(selection?.focusNode).toBe(editor.firstChild);
    expect(selection?.focusOffset).toBe(13);
  });

  it('the caret stays mid-text when the digit is typed in the middle', () => {
    const editor = openEditor('ساعت  امروز', 'persian');
    typeAt(editor, 'ساعت 9 امروز', 6, '9');
    expect(editor.textContent).toBe('ساعت ۹ امروز');
    expect(document.getSelection()?.focusOffset).toBe(6);
  });

  it('opens showing a stored Latin digit in the element’s Persian', () => {
    expect(openEditor('ساعت 14', 'persian').textContent).toBe('ساعت ۱۴');
  });

  it('a Latin title keeps `14`, and writes a Persian `۱۴` Latin (the control)', () => {
    const editor = openEditor('Score', 'latin');
    typeAt(editor, 'Score 14', 8, '4');
    expect(editor.textContent).toBe('Score 14');
    typeAt(editor, 'Score ۱۴', 8, '۴');
    expect(editor.textContent).toBe('Score 14');
  });

  it('an old title — no key — keeps every digit as typed (the control)', () => {
    const editor = openEditor('ساعت', undefined);
    typeAt(editor, 'ساعت 14', 7, '4');
    expect(editor.textContent).toBe('ساعت 14');
  });

  it('Keyboard: a digit follows the keyboard language as it is typed; a paste keeps its own', () => {
    stopKeyboard = startKeyboardLanguage(document, null);
    const editor = openEditor('پ', 'as-typed');
    // A letter only a Persian layout types proves Persian.
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'پ', bubbles: true }));
    });
    typeAt(editor, 'پ 1', 3, '1');
    expect(editor.textContent).toBe('پ ۱');
    // A paste is not typing: its digits are kept.
    const node = editor.firstChild;
    if (!(node instanceof Text)) throw new Error('the editor holds no text node');
    act(() => {
      node.data = 'پ ۱ 22';
      document.getSelection()?.setBaseAndExtent(node, 6, node, 6);
      editor.dispatchEvent(
        new InputEvent('input', { bubbles: true, inputType: 'insertFromPaste' }),
      );
    });
    expect(editor.textContent).toBe('پ ۱ 22');
  });

  it('Keyboard with nothing known leaves the digit exactly as the key sent it (the control)', () => {
    const editor = openEditor('x', 'as-typed');
    typeAt(editor, 'x 1', 3, '1');
    expect(editor.textContent).toBe('x 1');
  });
});

describe('the Value box follows its field', () => {
  function bound(fieldType: 'text' | 'number', digits: 'persian' | 'latin'): void {
    freshScene();
    designerStore.addElement(defaultText('t1', 0, 0));
    designerStore.setElementDataKey('t1', 'headline');
    if (fieldType === 'number') designerStore.setElementFieldMeta('t1', { fieldType: 'number' });
    designerStore.setElementFieldMeta('t1', { digits });
  }

  /** The Data section as the Inspector renders it now, and the input in its `Value` row. */
  function valueBox(): HTMLInputElement {
    const host = mount(
      createElement(DynamicDataSection, {
        element: elementById('t1') as TextElement,
        scene: projected(),
      }),
    );
    const label = [...host.querySelectorAll('span')].find((n) => n.textContent === 'Value');
    const input = label?.parentElement?.querySelector<HTMLInputElement>('input');
    if (input === null || input === undefined) throw new Error('no Value box');
    return input;
  }

  it('a Persian text field: `14` typed shows `۱۴`, and that is what is kept', () => {
    bound('text', 'persian');
    const box = valueBox();
    act(() => box.focus());
    typeInto(box, 'ساعت 14', '4');
    expect(box.value).toBe('ساعت ۱۴');
    act(() => box.blur());
    expect(fieldById('headline')).toMatchObject({ default: 'ساعت ۱۴' });
  });

  it('a Latin text field keeps `14`, and writes a Persian `۱۴` Latin (the control)', () => {
    bound('text', 'latin');
    const box = valueBox();
    typeInto(box, 'ساعت ۱4', '4');
    expect(box.value).toBe('ساعت 14');
  });

  it('focused and left with no edit writes nothing, though the stored digits differ', () => {
    bound('text', 'persian');
    designerStore.setElementFieldMeta('t1', { default: 'ساعت 14' });
    const box = valueBox();
    expect(box.value).toBe('ساعت ۱۴');
    act(() => box.focus());
    act(() => box.blur());
    expect(fieldById('headline')).toMatchObject({ default: 'ساعت 14' });
  });

  it('a Persian number field: `12` typed shows `۱۲` and commits the number 12', () => {
    bound('number', 'persian');
    const box = valueBox();
    expect(box.type).toBe('text');
    act(() => box.focus());
    typeInto(box, '12', '2');
    expect(box.value).toBe('۱۲');
    expect(fieldById('headline')).toMatchObject({ default: 12 });
  });

  it('a Latin number field shows `12` for a Persian `۱۲` (the control)', () => {
    bound('number', 'latin');
    const box = valueBox();
    act(() => box.focus());
    typeInto(box, '۱۲', '۲');
    expect(box.value).toBe('12');
    expect(fieldById('headline')).toMatchObject({ default: 12 });
  });
});

describe('the preview form follows its field', () => {
  function Harness({
    field,
    onChange,
  }: {
    field: DynamicField;
    onChange: (v: FieldValue) => void;
  }): JSX.Element {
    const [vals, setVals] = useState<NestedFieldValues>({ [field.id]: '' });
    return createElement(PreviewFieldForm, {
      aggregate: { fields: [field], groups: [] },
      values: vals,
      onChange: (path: string[], v: FieldValue) => {
        onChange(v);
        setVals((prev) => ({ ...prev, [path[0] ?? '']: v }));
      },
    });
  }

  const headline = (digits: FieldDigits): DynamicField => ({
    id: 'headline',
    label: 'headline',
    required: false,
    type: 'text',
    default: '',
    digits,
  });

  function box(host: HTMLElement): HTMLTextAreaElement {
    const found = host.querySelector<HTMLTextAreaElement>('textarea[aria-label="headline"]');
    if (found === null) throw new Error('no preview box');
    return found;
  }

  it('a Persian field: `14` typed shows `۱۴` and previews `۱۴`', () => {
    const onChange = vi.fn();
    const host = mount(createElement(Harness, { field: headline('persian'), onChange }));
    typeInto(box(host), 'ساعت 14', '4');
    expect(box(host).value).toBe('ساعت ۱۴');
    expect(onChange).toHaveBeenLastCalledWith('ساعت ۱۴');
  });

  it('a Keyboard field with nothing known keeps `14` (the control)', () => {
    const onChange = vi.fn();
    const host = mount(createElement(Harness, { field: headline('as-typed'), onChange }));
    typeInto(box(host), 'ساعت 14', '4');
    expect(box(host).value).toBe('ساعت 14');
    expect(onChange).toHaveBeenLastCalledWith('ساعت 14');
  });
});
