/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { DynamicField, Scene, TextElement, TickerElement } from '@cg/shared-schema';
import { MemoryKv, MemoryWorkspace } from '@cg/storage';
import { ProjectStore } from '../src/platform/ProjectStore.js';
import { designerStore, editSceneOf } from '../src/renderer/state/store.js';
import { defaultText, defaultTicker } from '../src/renderer/state/element-defaults.js';
import { defaultField } from '../src/renderer/features/fields/field-defaults.js';
import { DynamicDataSection } from '../src/renderer/features/inspector/DynamicDataSection.js';

/**
 * TEXT-FILE-OPT-01 — the author decides, per field, whether the Runtime operator may
 * point that field at a text file. The grant sits with the field's other authored
 * properties in **Dynamic / Data**, because that is where the author already sets the
 * things that describe what kind of content this field holds.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const GRANT_LABEL = 'Allow file source';

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

function elementById(id: string): TextElement | TickerElement {
  const el = projected().layers[0]?.children.find((c) => c.id === id);
  if (el === undefined || (el.type !== 'text' && el.type !== 'ticker')) {
    throw new Error(`no text/ticker element ${id}`);
  }
  return el;
}

function field(id: string): DynamicField {
  const f = projected().fields.find((x) => x.id === id);
  if (f === undefined) throw new Error(`no backing field ${id}`);
  return f;
}

/** The grant as STORED — `undefined` when the key is absent (the OFF default). */
function grantOf(id: string): boolean | undefined {
  return (field(id) as { allowFileSource?: boolean }).allowFileSource;
}

function freshScene(): void {
  const projects = new ProjectStore(new MemoryWorkspace(), new MemoryKv());
  const { scene } = projects.newScene('demo', 'lower-third');
  designerStore.setScene(scene, null);
}

function mount(): void {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
}

function render(elementId: string): void {
  act(() =>
    root?.render(
      createElement(DynamicDataSection, { element: elementById(elementId), scene: projected() }),
    ),
  );
}

function grantBox(): HTMLInputElement | null {
  return container?.querySelector<HTMLInputElement>(`input[aria-label="${GRANT_LABEL}"]`) ?? null;
}

describe('the grant is authored per field, and defaults OFF', () => {
  it('a newly created field grants nothing, for every kind', () => {
    for (const kind of ['text', 'multiline', 'list'] as const) {
      const f = defaultField('f', kind) as { allowFileSource?: boolean };
      expect(f.allowFileSource).toBeUndefined();
    }
  });

  it('a field created through the Data key convenience layer grants nothing', () => {
    freshScene();
    designerStore.addElement(defaultText('t1', 0, 0));
    designerStore.setElementDataKey('t1', 'headline');
    expect(grantOf('headline')).toBeUndefined();
  });

  it('setElementFieldMeta sets the grant, and clears it again', () => {
    freshScene();
    designerStore.addElement(defaultText('t1', 0, 0));
    designerStore.setElementDataKey('t1', 'headline');

    designerStore.setElementFieldMeta('t1', { allowFileSource: true });
    expect(grantOf('headline')).toBe(true);

    designerStore.setElementFieldMeta('t1', { allowFileSource: false });
    expect(grantOf('headline')).toBe(false);
  });

  /**
   * ⚠ `rebuildField` REBUILDS the field from scratch on every meta patch, so a key it
   * does not carry forward is lost the next time the author edits something unrelated.
   * That is the whole reason this test exists rather than trusting the setter.
   */
  it('an unrelated meta edit PRESERVES the grant', () => {
    freshScene();
    designerStore.addElement(defaultText('t1', 0, 0));
    designerStore.setElementDataKey('t1', 'headline');
    designerStore.setElementFieldMeta('t1', { allowFileSource: true });

    designerStore.setElementFieldMeta('t1', { title: 'Headline copy' });
    expect(field('headline').label).toBe('Headline copy');
    expect(grantOf('headline')).toBe(true);

    designerStore.setElementFieldMeta('t1', { multiline: true });
    expect(field('headline').type).toBe('multiline');
    expect(grantOf('headline')).toBe(true);
  });

  it('a ticker’s LIST field carries the grant too', () => {
    freshScene();
    designerStore.addElement(defaultTicker('k1', 0, 0));
    designerStore.setElementDataKey('k1', 'crawl');
    expect(field('crawl').type).toBe('list');

    designerStore.setElementFieldMeta('k1', { allowFileSource: true });
    expect(grantOf('crawl')).toBe(true);
    designerStore.setElementFieldMeta('k1', { title: 'Crawl copy' });
    expect(grantOf('crawl')).toBe(true);
  });
});

describe('a kind that cannot carry file content cannot be granted', () => {
  it('switching to number DROPS the grant, and switching back leaves it un-granted', () => {
    freshScene();
    designerStore.addElement(defaultText('t1', 0, 0));
    designerStore.setElementDataKey('t1', 'headline');
    designerStore.setElementFieldMeta('t1', { allowFileSource: true });
    expect(grantOf('headline')).toBe(true);

    designerStore.setElementFieldMeta('t1', { fieldType: 'number' });
    expect(field('headline').type).toBe('number');
    expect(grantOf('headline')).toBeUndefined();

    // Coming back does NOT resurrect it — a dropped grant is dropped, not parked.
    designerStore.setElementFieldMeta('t1', { fieldType: 'text' });
    expect(field('headline').type).toBe('text');
    expect(grantOf('headline')).toBeUndefined();
  });
});

describe('the Dynamic / Data section offers the grant where it can exist', () => {
  it('shows the control for a text field and writes the grant when ticked', () => {
    freshScene();
    designerStore.addElement(defaultText('t1', 0, 0));
    designerStore.setElementDataKey('t1', 'headline');
    mount();
    render('t1');

    const box = grantBox();
    expect(box).not.toBeNull();
    expect(box?.checked).toBe(false);

    act(() => {
      box?.click();
    });
    expect(grantOf('headline')).toBe(true);

    render('t1');
    expect(grantBox()?.checked).toBe(true);
  });

  it('shows the control for a ticker’s LIST field', () => {
    freshScene();
    designerStore.addElement(defaultTicker('k1', 0, 0));
    designerStore.setElementDataKey('k1', 'crawl');
    mount();
    render('k1');

    expect(grantBox()).not.toBeNull();
    act(() => {
      grantBox()?.click();
    });
    expect(grantOf('crawl')).toBe(true);
  });

  it('offers NO control once the field is a number', () => {
    freshScene();
    designerStore.addElement(defaultText('t1', 0, 0));
    designerStore.setElementDataKey('t1', 'headline');
    designerStore.setElementFieldMeta('t1', { fieldType: 'number' });
    mount();
    render('t1');

    expect(grantBox()).toBeNull();
  });
});

describe('the grant survives the Designer’s own save / load', () => {
  it('is still set after a save and re-open through ProjectStore', async () => {
    const projects = new ProjectStore(new MemoryWorkspace(), new MemoryKv());
    const { scene } = projects.newScene('demo', 'lower-third');
    designerStore.setScene(scene, null);
    designerStore.addElement(defaultText('t1', 0, 0));
    designerStore.setElementDataKey('t1', 'headline');
    designerStore.setElementFieldMeta('t1', { allowFileSource: true });

    const { path } = await projects.save(designerStore.get().scene, 'grant-demo');
    const reopened = await projects.open(path);
    if (reopened.scene === null) throw new Error('the saved project did not re-open');

    // Re-seat it exactly as opening a project does, then read the field through the
    // SAME projection the inspector uses — fields are per-composition (D-025), so
    // reading `scene.fields` off the root would silently look in the wrong place.
    designerStore.setScene(reopened.scene, path);
    expect(grantOf('headline')).toBe(true);
  });
});
