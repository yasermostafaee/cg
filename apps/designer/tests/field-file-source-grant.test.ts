/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { DynamicField, Scene, TextElement, TickerElement } from '@cg/shared-schema';
import { MemoryKv, MemoryWorkspace } from '@cg/storage';
import { ProjectStore } from '../src/platform/ProjectStore.js';
import { designerStore, editSceneOf } from '../src/renderer/state/store.js';
import { defaultText, defaultTicker } from '../src/renderer/state/element-defaults.js';
import { defaultField } from '../src/renderer/features/fields/field-defaults.js';
import {
  DynamicDataSection,
  FixedFileSourceSection,
} from '../src/renderer/features/inspector/DynamicDataSection.js';
import {
  __resetDesignerDelimitersForTest,
  addDesignerDelimiter,
} from '../src/renderer/features/settings/designerDelimiterStore.js';
import {
  fixedFileFieldId,
  isFixedFileFieldId,
} from '../src/renderer/features/fields/fixedFileField.js';
import { resetDesignerFileSourcePreviewsForTest } from '../src/renderer/features/fields/fileSourcePreviewStore.js';

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
  __resetDesignerDelimitersForTest();
  resetDesignerFileSourcePreviewsForTest();
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

function fieldDefault(id: string): unknown {
  const value = field(id);
  if (!('default' in value)) throw new Error(`field ${id} has no authored default`);
  return value.default;
}

/** The grant as STORED — `undefined` when the key is absent (the OFF default). */
function grantOf(id: string): boolean | undefined {
  return (field(id) as { allowFileSource?: boolean }).allowFileSource;
}

function filePolicyOf(id: string): unknown {
  const value = field(id);
  return 'fileSource' in value ? value.fileSource : undefined;
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
  const element = elementById(elementId);
  const scene = projected();
  act(() =>
    root?.render(
      createElement(
        'div',
        null,
        createElement(FixedFileSourceSection, { element, scene }),
        createElement(DynamicDataSection, { element, scene }),
      ),
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

    const saved = designerStore.get().scene;
    if (saved === null) throw new Error('no scene to save');
    const { path } = await projects.save(saved, 'grant-demo');
    const reopened = await projects.open(path);
    if (reopened.scene === null) throw new Error('the saved project did not re-open');

    // Re-seat it exactly as opening a project does, then read the field through the
    // SAME projection the inspector uses — fields are per-composition (D-025), so
    // reading `scene.fields` off the root would silently look in the wrong place.
    designerStore.setScene(reopened.scene, path);
    expect(grantOf('headline')).toBe(true);
  });
});

describe('R-102 — file-only and locked Bridge file authoring', () => {
  it('converts an existing Data key to one fixed-file field instead of leaving an orphan', async () => {
    freshScene();
    designerStore.addElement(defaultTicker('k1', 0, 0));
    designerStore.setElementDataKey('k1', 'headlines');
    mount();
    render('k1');
    Object.defineProperty(window, 'cg', {
      configurable: true,
      value: {
        textSources: {
          pick: vi.fn(() =>
            Promise.resolve({
              name: 'fixed.txt',
              bridgePath: 'fixed.txt',
              sourcePath: String.raw`\\newsroom\shared\fixed.txt`,
              content: 'one\ntwo',
            }),
          ),
        },
        preview: { update: vi.fn(() => Promise.resolve({ ok: true })) },
      },
    });

    const fixedToggle = container?.querySelector<HTMLInputElement>(
      'input[aria-label="Use fixed file"]',
    );
    expect(fixedToggle).not.toBeNull();
    act(() => fixedToggle?.click());
    const choose = [...(container?.querySelectorAll('button') ?? [])].find((button) =>
      button.textContent?.includes('Browse shared file'),
    );
    await act(async () => {
      choose?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    const data = projected();
    expect(data.fields.map((candidate) => candidate.id)).toEqual([fixedFileFieldId('k1')]);
    expect(data.bindings).toEqual([
      { fieldId: fixedFileFieldId('k1'), target: { kind: 'ticker-items', elementId: 'k1' } },
    ]);
  });

  it('creates a locked fixed-file connection without asking the author for a Data key', async () => {
    freshScene();
    designerStore.addElement(defaultTicker('k1', 0, 0));
    mount();
    render('k1');
    const updatePreview = vi.fn(() => Promise.resolve({ ok: true }));
    Object.defineProperty(window, 'cg', {
      configurable: true,
      value: {
        textSources: {
          pick: vi.fn(() =>
            Promise.resolve({
              name: 'fixed.txt',
              bridgePath: 'fixed.txt',
              sourcePath: String.raw`\\newsroom\shared\fixed.txt`,
              content: 'one|two',
            }),
          ),
        },
        preview: { update: updatePreview },
      },
    });

    const fixedToggle = container?.querySelector<HTMLInputElement>(
      'input[aria-label="Use fixed file"]',
    );
    act(() => fixedToggle?.click());
    const choose = [...(container?.querySelectorAll('button') ?? [])].find((button) =>
      button.textContent?.includes('Browse shared file'),
    );
    await act(async () => {
      choose?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    render('k1');

    const internal = projected().fields.find((candidate) => isFixedFileFieldId(candidate.id));
    expect(internal).toMatchObject({
      type: 'list',
      allowFileSource: true,
      fileSource: {
        inputMode: 'file-only',
        bridgePath: 'fixed.txt',
        lockFile: true,
      },
    });
    expect(container?.querySelector('input[aria-label="Data key"]')).toBeNull();
    expect(container?.textContent).toContain('no Data key required');
    expect(container?.textContent).toContain(String.raw`\\newsroom\shared\fixed.txt`);
    expect(updatePreview).toHaveBeenLastCalledWith({
      fields: { [internal?.id ?? 'missing']: [{ id: 'file-1', text: 'one|two' }] },
    });

    const enabledToggle = container?.querySelector<HTMLInputElement>(
      'input[aria-label="Use fixed file"]',
    );
    act(() => enabledToggle?.click());
    expect(projected().fields.some((candidate) => isFixedFileFieldId(candidate.id))).toBe(false);
  });

  it('stores both independent policies and preserves them across unrelated edits', () => {
    freshScene();
    designerStore.addElement(defaultText('t1', 0, 0));
    designerStore.setElementDataKey('t1', 'headline');
    designerStore.setElementFieldMeta('t1', {
      allowFileSource: true,
      fileSource: {
        inputMode: 'file-only',
        bridgePath: 'newsroom/headline.txt',
        lockFile: true,
      },
    });
    designerStore.setElementFieldMeta('t1', { title: 'Locked headline' });
    expect(field('headline')).toMatchObject({
      label: 'Locked headline',
      fileSource: {
        inputMode: 'file-only',
        bridgePath: 'newsroom/headline.txt',
        lockFile: true,
      },
    });
  });

  it('drops the policy with the grant when switching to number', () => {
    freshScene();
    designerStore.addElement(defaultText('t1', 0, 0));
    designerStore.setElementDataKey('t1', 'headline');
    designerStore.setElementFieldMeta('t1', {
      fileSource: { inputMode: 'file-only' },
    });
    designerStore.setElementFieldMeta('t1', { fieldType: 'number' });
    expect('fileSource' in field('headline')).toBe(false);
  });

  it('chooses one shared file, stores its relative name and previews current content', async () => {
    freshScene();
    designerStore.addElement(defaultText('t1', 0, 0));
    designerStore.setElementDataKey('t1', 'headline');
    designerStore.setElementFieldMeta('t1', { allowFileSource: true });
    const authoredDefault = fieldDefault('headline');
    mount();
    render('t1');
    expect(
      container?.querySelector<HTMLInputElement>('input[aria-label="File only"]'),
    ).not.toBeNull();
    expect(
      container?.querySelector<HTMLInputElement>('input[aria-label="Lock file"]')?.disabled,
    ).toBe(true);
    expect(container?.querySelector('input[aria-label="CG Bridge text file path"]')).toBeNull();

    const picked = new File(['headline'], 'headline.txt', { type: 'text/plain' });
    Object.defineProperty(picked, 'text', {
      value: vi.fn(() => Promise.resolve('headline')),
    });
    const updatePreview = vi.fn(() => Promise.resolve({ ok: true }));
    Object.defineProperty(window, 'cg', {
      configurable: true,
      value: {
        assets: { pick: vi.fn(() => Promise.resolve([picked])) },
        preview: { update: updatePreview },
      },
    });
    const browse = [...(container?.querySelectorAll('button') ?? [])].find((button) =>
      button.textContent?.includes('Browse shared file'),
    );
    await act(async () => {
      browse?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(filePolicyOf('headline')).toEqual({ bridgePath: 'headline.txt' });
    expect(updatePreview).toHaveBeenCalledWith({ fields: { headline: 'headline' } });
    expect(field('headline')).toMatchObject({ default: authoredDefault });
    render('t1');
    expect(
      document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Current file content"]')
        ?.value,
    ).toBe('headline');
    const lock = container?.querySelector<HTMLInputElement>('input[aria-label="Lock file"]');
    expect(lock?.disabled).toBe(false);
    act(() => lock?.click());
    expect(filePolicyOf('headline')).toEqual({
      bridgePath: 'headline.txt',
      lockFile: true,
    });
  });

  it('authors a list-file delimiter from the managed Designer catalogue', async () => {
    expect(addDesignerDelimiter('double colon', '::')).toBeNull();
    freshScene();
    designerStore.addElement(defaultTicker('k1', 0, 0));
    designerStore.setElementDataKey('k1', 'headlines');
    designerStore.setElementFieldMeta('k1', { allowFileSource: true });
    mount();
    render('k1');
    const picked = new File(['one::two'], 'headlines.txt', { type: 'text/plain' });
    Object.defineProperty(picked, 'text', {
      value: vi.fn(() => Promise.resolve('one::two')),
    });
    Object.defineProperty(window, 'cg', {
      configurable: true,
      value: {
        assets: { pick: vi.fn(() => Promise.resolve([picked])) },
        preview: { update: vi.fn(() => Promise.resolve({ ok: true })) },
      },
    });
    const browse = [...(container?.querySelectorAll('button') ?? [])].find((button) =>
      button.textContent?.includes('Browse shared file'),
    );
    await act(async () => {
      browse?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    const delimiter = document.querySelector<HTMLSelectElement>(
      'select[aria-label="File delimiter"]',
    );
    if (delimiter === null || delimiter === undefined) throw new Error('missing delimiter select');
    expect([...delimiter.options].some((option) => option.text === 'double colon')).toBe(true);
    act(() => {
      delimiter.value = '::';
      delimiter.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(filePolicyOf('headlines')).toEqual({ delimiter: '::' });
  });

  it('shows the selected file as the field preview and re-splits it when delimiter changes', async () => {
    freshScene();
    designerStore.addElement(defaultTicker('k1', 0, 0));
    designerStore.setElementDataKey('k1', 'headlines');
    designerStore.setElementFieldMeta('k1', { allowFileSource: true });
    const authoredDefault = fieldDefault('headlines');
    mount();
    render('k1');

    const picked = new File(['one|two'], 'headlines.txt', { type: 'text/plain' });
    Object.defineProperty(picked, 'text', {
      value: vi.fn(() => Promise.resolve('one|two')),
    });
    const updatePreview = vi.fn(() => Promise.resolve({ ok: true }));
    const reload = vi.fn(() => Promise.resolve('fresh|copy'));
    Object.defineProperty(window, 'cg', {
      configurable: true,
      value: {
        textSources: { reload },
        assets: { pick: vi.fn(() => Promise.resolve([picked])) },
        preview: { update: updatePreview },
      },
    });

    const browse = [...(container?.querySelectorAll('button') ?? [])].find((button) =>
      button.textContent?.includes('Browse shared file'),
    );
    await act(async () => {
      browse?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    const delimiter = document.querySelector<HTMLSelectElement>(
      'select[aria-label="File delimiter"]',
    );
    act(() => {
      if (delimiter !== null && delimiter !== undefined) {
        delimiter.value = '|';
        delimiter.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    render('k1');

    expect(updatePreview).toHaveBeenLastCalledWith({
      fields: {
        headlines: [
          { id: 'file-1', text: 'one' },
          { id: 'file-2', text: 'two' },
        ],
      },
    });
    expect(document.querySelector('[aria-label="Field preview"]')?.textContent).toContain('one');
    expect(document.querySelector('[aria-label="Field preview"]')?.textContent).toContain('two');
    expect(fieldDefault('headlines')).toEqual(authoredDefault);

    const reloadButton = document.querySelector<HTMLButtonElement>(
      'button[aria-label="Reload selected file"]',
    );
    await act(async () => {
      reloadButton?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(reload).toHaveBeenCalledWith('headlines.txt');
    expect(updatePreview).toHaveBeenLastCalledWith({
      fields: {
        headlines: [
          { id: 'file-1', text: 'fresh' },
          { id: 'file-2', text: 'copy' },
        ],
      },
    });
  });

  it('persists both policies through the Designer project save and re-open path', async () => {
    const projects = new ProjectStore(new MemoryWorkspace(), new MemoryKv());
    const { scene } = projects.newScene('demo', 'lower-third');
    designerStore.setScene(scene, null);
    designerStore.addElement(defaultText('t1', 0, 0));
    designerStore.setElementDataKey('t1', 'headline');
    designerStore.setElementFieldMeta('t1', {
      fileSource: {
        inputMode: 'file-only',
        bridgePath: 'newsroom/headline.txt',
        lockFile: true,
      },
    });
    const current = designerStore.get().scene;
    if (current === null) throw new Error('no scene to save');
    const { path } = await projects.save(current, 'locked-source');
    const reopened = await projects.open(path);
    if (reopened.scene === null) throw new Error('saved scene did not reopen');
    designerStore.setScene(reopened.scene, path);
    expect(filePolicyOf('headline')).toEqual({
      inputMode: 'file-only',
      bridgePath: 'newsroom/headline.txt',
      lockFile: true,
    });
  });
});
