/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { DynamicField, Scene, TextElement } from '@cg/shared-schema';
import { MemoryKv, MemoryWorkspace } from '@cg/storage';
import { ProjectStore } from '../src/platform/ProjectStore.js';
import { designerStore, editSceneOf } from '../src/renderer/state/store.js';
import { defaultText } from '../src/renderer/state/element-defaults.js';
import { DynamicDataSection } from '../src/renderer/features/inspector/DynamicDataSection.js';
import { PATTERN_PRESETS } from '../src/renderer/features/inspector/pattern-presets.js';

/**
 * D-059 — the Dynamic / Data section's `pattern` control is a named-preset
 * dropdown over the SAME stored regex: a preset writes its vetted anchored
 * source, a stored pattern shows the preset it spells, anything else shows
 * "Custom (advanced)" with the raw regex box (today's UI).
 */

// React's act() needs this flag set for createRoot rendering under Vitest.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root !== null) act(() => root!.unmount());
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

function textEl(): TextElement {
  const el = projected().layers[0]?.children.find((c) => c.id === 't1');
  if (el === undefined || el.type !== 'text') throw new Error('no text element t1');
  return el;
}

/** The dynamic field backing the element's Data key. */
function field(): DynamicField {
  const f = projected().fields.find((x) => x.id === 'headline');
  if (f === undefined) throw new Error('no backing field');
  return f;
}

function patternOf(): string | undefined {
  const f = field();
  return f.type === 'text' || f.type === 'multiline' ? f.pattern : undefined;
}

/** A text element with a Data key — so the section shows the field meta editor. */
function setup(): void {
  const projects = new ProjectStore(new MemoryWorkspace(), new MemoryKv());
  const { scene } = projects.newScene('demo', 'lower-third');
  designerStore.setScene(scene, null);
  designerStore.addElement(defaultText('t1', 0, 0));
  designerStore.setElementDataKey('t1', 'headline');
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
}

/** (Re-)render the section against the CURRENT store state, as the inspector does. */
function render(): void {
  act(() =>
    root!.render(createElement(DynamicDataSection, { element: textEl(), scene: projected() })),
  );
}

function presetSelect(): HTMLSelectElement {
  const el = container!.querySelector<HTMLSelectElement>('select[aria-label="Pattern"]');
  if (el === null) throw new Error('Pattern preset select not in the DOM');
  return el;
}

/** The raw regex box — only rendered under the Custom escape. */
function regexBox(): HTMLInputElement | null {
  return container!.querySelector<HTMLInputElement>('input[aria-label="Custom pattern regex"]');
}

function pick(key: string): void {
  const select = presetSelect();
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
    setter?.call(select, key);
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  render(); // the real inspector re-renders from the store after a commit
}

/** Type a raw regex and commit it the way a blur does. */
function typeRegex(value: string): void {
  const input = regexBox();
  if (input === null) throw new Error('raw regex box not in the DOM');
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
  });
  render();
}

describe('D-059 — validation presets over a dynamic text field’s pattern', () => {
  it('a field with no pattern shows None, and no raw regex box', () => {
    setup();
    render();
    expect(patternOf()).toBeUndefined();
    expect(presetSelect().value).toBe('none');
    expect(regexBox()).toBeNull();
  });

  it('picking a preset writes its exact anchored regex to the field', () => {
    setup();
    render();
    pick('email');

    expect(patternOf()).toBe(PATTERN_PRESETS['email']!.pattern);
    expect(patternOf()!.startsWith('^')).toBe(true);
    expect(patternOf()!.endsWith('$')).toBe(true);
    // The preset shows as selected, with the raw regex box hidden.
    expect(presetSelect().value).toBe('email');
    expect(regexBox()).toBeNull();
    // Its example is surfaced so the operator sees the shape it accepts.
    expect(container!.textContent).toContain(PATTERN_PRESETS['email']!.example);
  });

  it('a stored pattern equal to a preset loads as that preset (round trip)', () => {
    setup();
    designerStore.setElementFieldMeta('t1', { pattern: PATTERN_PRESETS['time']!.pattern });
    render();

    expect(presetSelect().value).toBe('time');
    expect(regexBox()).toBeNull();
  });

  it('an existing hand-written regex loads as Custom with the raw box populated', () => {
    setup();
    designerStore.setElementFieldMeta('t1', { pattern: '^[A-Z]{3}-[0-9]{4}$' });
    render();

    expect(presetSelect().value).toBe('custom');
    expect(regexBox()?.value).toBe('^[A-Z]{3}-[0-9]{4}$');
    expect(patternOf()).toBe('^[A-Z]{3}-[0-9]{4}$'); // non-breaking: the stored value is untouched
  });

  it('switching to Custom reveals the raw input, pre-filled, and edits commit through it', () => {
    setup();
    render();
    pick('digits');
    expect(regexBox()).toBeNull();

    pick('custom');
    // Custom is a display state: it reveals the box over the CURRENT regex
    // rather than clearing or rewriting the stored pattern.
    expect(presetSelect().value).toBe('custom');
    expect(regexBox()?.value).toBe(PATTERN_PRESETS['digits']!.pattern);
    expect(patternOf()).toBe(PATTERN_PRESETS['digits']!.pattern);

    typeRegex('^SN[0-9]{6}$');
    expect(patternOf()).toBe('^SN[0-9]{6}$');
    expect(presetSelect().value).toBe('custom');
  });

  it('picking None clears the stored pattern', () => {
    setup();
    render();
    pick('url');
    expect(patternOf()).toBe(PATTERN_PRESETS['url']!.pattern);

    pick('none');
    expect(patternOf()).toBeUndefined();
    expect(presetSelect().value).toBe('none');
    expect(regexBox()).toBeNull();
  });

  it('the presets apply to a multiline field too', () => {
    setup();
    designerStore.setElementFieldMeta('t1', { multiline: true });
    render();
    expect(field().type).toBe('multiline');

    pick('letters');
    expect(patternOf()).toBe(PATTERN_PRESETS['letters']!.pattern);
    expect(presetSelect().value).toBe('letters');
  });
});
