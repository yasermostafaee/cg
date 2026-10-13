/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { DynamicField, Scene, TextElement } from '@cg/shared-schema';
import { applyFieldValues } from '@cg/template-runtime';
import { buildScene } from '@cg/template-runtime/scene-builder';
import { MemoryKv, MemoryWorkspace } from '@cg/storage';
import { ProjectStore } from '../src/platform/ProjectStore.js';
import { designerStore, editSceneOf } from '../src/renderer/state/store.js';
import { withActiveFieldData } from '../src/renderer/state/scene-doc.js';
import { defaultText } from '../src/renderer/state/element-defaults.js';
import { DynamicDataSection } from '../src/renderer/features/inspector/DynamicDataSection.js';

/**
 * `FIELD-DIGITS-01` — the author says, per field, which digits its value is written in. A field
 * made through a Data key starts on Persian; a field authored before the setting existed carries
 * none and reads `as-typed` (text) or `latin` (number), which is what it always drew.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root !== null) act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  designerStore._reset();
});

function projected(): Scene {
  const st = designerStore.get();
  const scene = editSceneOf(st.scene, st.activeCompositionId);
  if (scene === null) throw new Error('no active composition');
  return scene;
}

function element(id: string): TextElement {
  const el = projected().layers[0]?.children.find((c) => c.id === id);
  if (el === undefined || el.type !== 'text') throw new Error(`no text element ${id}`);
  return el;
}

function field(id: string): DynamicField {
  const f = projected().fields.find((x) => x.id === id);
  if (f === undefined) throw new Error(`no field ${id}`);
  return f;
}

/** The digits as STORED — `undefined` when the key is absent. */
function storedDigits(id: string): string | undefined {
  return (field(id) as { digits?: string }).digits;
}

function freshScene(): void {
  const projects = new ProjectStore(new MemoryWorkspace(), new MemoryKv());
  const { scene } = projects.newScene('demo', 'lower-third');
  designerStore.setScene(scene, null);
}

/** A text element `t1` whose Data key is `headline`. */
function boundText(text = 'Text'): void {
  freshScene();
  designerStore.addElement({ ...defaultText('t1', 0, 0), text });
  designerStore.setElementDataKey('t1', 'headline');
}

function render(): void {
  if (container === null) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }
  act(() =>
    root?.render(createElement(DynamicDataSection, { element: element('t1'), scene: projected() })),
  );
}

function digitsSelect(): HTMLSelectElement {
  const select = container?.querySelector<HTMLSelectElement>('select[aria-label="digits"]');
  if (select === null || select === undefined) throw new Error('no digits control rendered');
  return select;
}

const optionsOf = (select: HTMLSelectElement): string[] => [...select.options].map((o) => o.value);

/** Pick a value the way the browser does: set it, fire `change`. */
function choose(select: HTMLSelectElement, value: string): void {
  act(() => {
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

describe('a new field starts on Persian', () => {
  it('a text field made through a Data key reads persian, with the four text choices', () => {
    boundText();
    expect(storedDigits('headline')).toBe('persian');
    render();
    expect(digitsSelect().value).toBe('persian');
    expect(optionsOf(digitsSelect())).toEqual(['as-typed', 'persian', 'latin', 'arabic-indic']);
  });

  it('switched to a number it stays persian, with the three number choices', () => {
    boundText();
    designerStore.setElementFieldMeta('t1', { fieldType: 'number' });
    expect(field('headline').type).toBe('number');
    expect(storedDigits('headline')).toBe('persian');
    render();
    expect(digitsSelect().value).toBe('persian');
    expect(optionsOf(digitsSelect())).toEqual(['persian', 'latin', 'arabic-indic']);
  });
});

describe('a document saved before the setting', () => {
  /** Re-open the document with the key stripped — the way an old document simply never had it. */
  function asOldDocument(): void {
    const whole = designerStore.get().scene;
    if (whole === null) throw new Error('no scene');
    const fields = projected().fields.map(
      (f) => Object.fromEntries(Object.entries(f).filter(([k]) => k !== 'digits')) as DynamicField,
    );
    designerStore.setScene(withActiveFieldData(whole, { fields }), null);
  }

  it('shows a text field as as-typed and a number field as latin, and writes no key', () => {
    boundText();
    asOldDocument();
    expect(storedDigits('headline')).toBeUndefined();
    render();
    expect(digitsSelect().value).toBe('as-typed');

    designerStore.setElementFieldMeta('t1', { fieldType: 'number' });
    render();
    expect(digitsSelect().value).toBe('latin');
    // Nothing was migrated: an unrelated edit leaves the key absent.
    designerStore.setElementFieldMeta('t1', { title: 'Score' });
    expect(storedDigits('headline')).toBeUndefined();
  });

  it('an as-typed text field becomes a number with no key: latin, what a number always drew', () => {
    boundText();
    designerStore.setElementFieldMeta('t1', { digits: 'as-typed' });
    designerStore.setElementFieldMeta('t1', { fieldType: 'number' });
    expect(storedDigits('headline')).toBeUndefined();
  });
});

describe('the author chooses, and the choice is kept', () => {
  it('the control writes the field, and an unrelated edit keeps it', () => {
    boundText();
    render();
    choose(digitsSelect(), 'latin');
    expect(storedDigits('headline')).toBe('latin');
    designerStore.setElementFieldMeta('t1', { title: 'Headline copy' });
    expect(storedDigits('headline')).toBe('latin');
    designerStore.setElementFieldMeta('t1', { multiline: true });
    expect(field('headline').type).toBe('multiline');
    expect(storedDigits('headline')).toBe('latin');
  });

  it('survives a save and re-open', async () => {
    const projects = new ProjectStore(new MemoryWorkspace(), new MemoryKv());
    const { scene } = projects.newScene('demo', 'lower-third');
    designerStore.setScene(scene, null);
    designerStore.addElement(defaultText('t1', 0, 0));
    designerStore.setElementDataKey('t1', 'headline');
    designerStore.setElementFieldMeta('t1', { digits: 'arabic-indic' });
    const { path } = await projects.save(designerStore.get().scene, 'digits-demo');
    const reopened = await projects.open(path);
    if (reopened.scene === null) throw new Error('the saved project did not re-open');
    designerStore.setScene(reopened.scene, path);
    expect(storedDigits('headline')).toBe('arabic-indic');
  });
});

describe('the preview draws what air draws', () => {
  /** The Designer's scene through the page the canvas, the preview and the export all run. */
  function drawn(value: string): string {
    const scene = projected();
    const { container: stage, elementMap, textOriginals } = buildScene(scene);
    applyFieldValues(scene, { headline: value }, elementMap, textOriginals, stage);
    return elementMap.get('t1')?.textContent ?? '';
  }

  it('follows the field: latin draws Latin, persian draws Persian', () => {
    boundText();
    designerStore.setElementFieldMeta('t1', { digits: 'latin' });
    expect(drawn('ساعت ۱۲:۳۰')).toBe('ساعت 12:30');
    designerStore.setElementFieldMeta('t1', { digits: 'persian' });
    expect(drawn('ساعت 12:30')).toBe('ساعت ۱۲:۳۰');
    // The control: as-typed draws the value exactly as sent.
    designerStore.setElementFieldMeta('t1', { digits: 'as-typed' });
    expect(drawn('ساعت 12:30')).toBe('ساعت 12:30');
  });
});
