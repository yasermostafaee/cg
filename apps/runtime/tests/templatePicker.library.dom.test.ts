// @vitest-environment jsdom
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TemplateInfo } from '@cg/shared-ipc';
import {
  useTemplatePicker,
  type TemplateChoice,
} from '../src/renderer/features/fixedLayers/useTemplatePicker.js';
import { onCommandError } from '../src/renderer/features/status/commandFeedback.js';
import {
  __resetSourcesForTest,
  initSources,
} from '../src/renderer/features/sources/sourceStore.js';
import { clearPortals, openDialog } from './support/dialog.js';
import { renderLayerRow, slotWith } from './support/layerRow.js';

/**
 * `RUNTIME-REDESIGN-01` Phase 8 — what the picker took from `01-template-picker.html` and
 * `02-template-import.html` beyond its look, and the one thing it must not have taken.
 *
 *   - `01`: a search and three KIND chips over the list, a footer sentence that is true of
 *     this product (a fixed-row LOAD is list-only; PLAY is the first wire contact), and a
 *     meta line per row from the carrier — never from the prototype's `t.looks`.
 *   - `02`: the DROP ZONE, and only that. A package dropped on the dialog resolves the pick
 *     with the File; the row then runs THE SAME chain the OS chooser feeds. 🔴 The last test
 *     proves it by the sentence the chain's own `verify` produces on bytes that are not a
 *     package — the prototype's "Review" step is theatre, and the product's is not.
 */

const PLAIN: TemplateInfo = {
  templateId: 'tpl-plain',
  name: 'Lower third',
  templateType: 'lower-third',
  fields: [{ path: 'title', kind: 'text', label: 'Title' }] as unknown as TemplateInfo['fields'],
};
/** Declares plates, so `requiredBankFor` puts it on a BED row — the reference's "Graphics bed". */
const BED: TemplateInfo = {
  templateId: 'tpl-bed',
  name: 'Two box',
  templateType: 'custom',
  fields: [],
  liveSources: {
    resolution: { width: 1920, height: 1080 },
    defaultPosition: { anchor: 'center', offset: { x: 0, y: 0 } },
    sources: [
      {
        elementId: 'el-1',
        sourceId: 'guest-1',
        rect: { x: 0, y: 0, width: 640, height: 360 },
        dynamic: false,
      },
    ],
    looks: [
      { id: 'solo', label: 'Solo', rects: { 'guest-1': { x: 0, y: 0, width: 640, height: 360 } } },
      { id: 'wide', label: 'Wide', rects: {} },
    ],
    defaultLookId: 'solo',
  } as unknown as TemplateInfo['liveSources'],
};

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function installBridge(templates: TemplateInfo[]): void {
  const stub = {
    link: {
      status: () => 'live' as const,
      onStatusChanged: () => () => undefined,
      resyncing: () => false,
      onResyncingChanged: () => () => undefined,
    },
    fixedLayers: { config: () => Promise.resolve(null), onConfigChanged: () => () => undefined },
    stack: { remove: () => Promise.resolve({ accepted: true }) },
    templates: {
      list: () => Promise.resolve(templates),
      remove: () => Promise.resolve({ ok: true }),
    },
    sources: {
      config: () => Promise.resolve({ sources: [] }),
      onConfigChanged: () => () => undefined,
      setConfig: () => Promise.resolve({ ok: true }),
      assignments: () => Promise.resolve({ assignments: [] }),
      onAssignmentsChanged: () => () => undefined,
      setAssignments: () => Promise.resolve({ ok: true }),
    },
  };
  (window as unknown as { cg: typeof stub }).cg = stub;
}

/** Mount the picker hook behind a trivial host, open it for a HIGH-bank (operator) row. */
async function openPicker(accepts: 'low' | 'high' = 'high'): Promise<{
  dialog: HTMLElement;
  choice: Promise<TemplateChoice>;
}> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  let open: (() => Promise<TemplateChoice>) | null = null;
  function Host(): JSX.Element {
    const { pickTemplate, pickerDialog } = useTemplatePicker();
    open = () => pickTemplate('Load onto Layer 1', accepts);
    return createElement('div', null, pickerDialog);
  }
  const r = root;
  await act(async () => {
    r.render(createElement(Host));
    await Promise.resolve();
  });
  let choice: Promise<TemplateChoice> | null = null;
  await act(async () => {
    choice = open?.() ?? null;
    await Promise.resolve();
    await Promise.resolve();
  });
  const dialog = openDialog();
  if (dialog === null || choice === null) throw new Error('picker did not open');
  return { dialog, choice };
}

beforeEach(async () => {
  __resetSourcesForTest();
  installBridge([PLAIN, BED]);
  initSources(window.cg);
  await Promise.resolve();
  await Promise.resolve();
});

afterEach(async () => {
  if (root !== null) {
    const r = root;
    await act(async () => {
      r.unmount();
    });
  }
  root = null;
  container?.remove();
  container = null;
  clearPortals();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

const rowsOf = (dialog: HTMLElement): string[] =>
  [...dialog.querySelectorAll('[data-template-id]')].map(
    (r) => r.getAttribute('data-template-id') ?? '',
  );

async function type(el: HTMLInputElement, value: string): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  await act(async () => {
    setter?.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    await Promise.resolve();
  });
}

async function press(dialog: HTMLElement, selector: string): Promise<void> {
  const button = dialog.querySelector<HTMLButtonElement>(selector);
  if (button === null) throw new Error(`no ${selector}`);
  await act(async () => {
    button.click();
    await Promise.resolve();
  });
}

describe('§8 — the picker follows `01`: search, kind chips, the meta line and the footer sentence', () => {
  it('lists every template, newest first, and the search narrows by the name the operator sees', async () => {
    const { dialog } = await openPicker();
    expect(rowsOf(dialog)).toEqual(['tpl-bed', 'tpl-plain']);
    const search = dialog.querySelector<HTMLInputElement>('input[type="search"]');
    expect(search?.getAttribute('aria-label')).toBe('Search templates');
    await type(search as HTMLInputElement, 'lower');
    expect(rowsOf(dialog)).toEqual(['tpl-plain']);
    await type(search as HTMLInputElement, 'zzz');
    expect(rowsOf(dialog)).toEqual([]);
    // The reference's own words for a search that found nothing — and never the panel's
    // "nothing imported yet" sentence, which would be false.
    expect(dialog.textContent).toContain('No templates found');
    expect(dialog.textContent).not.toContain('No templates in this browser yet');
  });

  it('the kind chips split beds from graphics by the SAME predicate the bridge refuses on', async () => {
    const { dialog } = await openPicker();
    const chips = [...dialog.querySelectorAll<HTMLButtonElement>('[data-template-filter]')];
    expect(chips.map((c) => c.textContent)).toEqual(['All templates', 'Graphics', 'Graphics beds']);
    expect(chips.map((c) => c.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false']);
    await press(dialog, '[data-template-filter="bed"]');
    expect(rowsOf(dialog)).toEqual(['tpl-bed']);
    expect(
      dialog.querySelector('[data-template-id="tpl-bed"]')?.getAttribute('data-template-kind'),
    ).toBe('bed');
    await press(dialog, '[data-template-filter="graphic"]');
    expect(rowsOf(dialog)).toEqual(['tpl-plain']);
    await press(dialog, '[data-template-filter="all"]');
    expect(rowsOf(dialog)).toHaveLength(2);
  });

  it('a row’s meta line counts fields, looks and plates from the CARRIER, and the load stays one press', async () => {
    const { dialog, choice } = await openPicker('low');
    const bed = dialog.querySelector('[data-template-id="tpl-bed"]');
    expect(bed?.querySelector('.cg-tpl-meta')?.textContent).toContain('Graphics bed');
    expect(bed?.querySelector('.cg-tpl-meta')?.textContent).toContain('0 fields');
    expect(bed?.querySelector('.cg-tpl-meta')?.textContent).toContain('2 looks');
    expect(bed?.querySelector('.cg-tpl-meta')?.textContent).toContain('1 plate');
    // The plain one, on a BED row, is refused by the same predicate the bridge uses — and the
    // reason is on the row, as a chip AND as the app's own sentence with the remedy.
    const plain = dialog.querySelector('[data-template-id="tpl-plain"]');
    expect(plain?.getAttribute('data-template-incompatible')).toBe('true');
    expect(plain?.querySelector('.cg-tag--warn')?.textContent).toBe('Requires an operator row');
    expect(plain?.querySelector('[data-wrong-bank]')?.textContent).toContain(
      'Load this one onto an operator row',
    );
    expect(plain?.querySelector<HTMLButtonElement>('button[aria-label^="Load "]')?.disabled).toBe(
      true,
    );
    // The name is the load control, the id on its title (golden rule 11), one press.
    const load = bed?.querySelector<HTMLButtonElement>(
      'button[aria-label="Load Two box onto this layer"]',
    );
    expect(load?.getAttribute('title')).toBe('tpl-bed');
    expect(load?.querySelector('bdi')?.textContent).toBe('Two box');
    await act(async () => {
      load?.click();
      await Promise.resolve();
    });
    expect(await choice).toEqual(BED);
  });

  it('the footer carries the reference’s sentence — true here, because a LOAD is list-only', async () => {
    const { dialog } = await openPicker();
    expect(dialog.querySelector('[data-template-foot-info]')?.textContent).toBe(
      'Loading prepares the row. Use Play when you’re ready to go on air.',
    );
    // …and the two actions are what they were: Cancel, then the one primary.
    const actions = [...dialog.querySelectorAll('[data-modal-role]')].map((b) => b.textContent);
    expect(actions).toEqual(['Cancel', 'Import a .vcg…']);
  });
});

describe('§8 — `02`’s drop zone feeds the SAME import chain', () => {
  function dropFileOn(target: Element, file: File): void {
    const event = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'dataTransfer', { value: { files: [file] } });
    target.dispatchEvent(event);
  }

  it('a package dropped on the dialog resolves the pick with that file', async () => {
    const { dialog, choice } = await openPicker();
    const body = dialog.querySelector('[data-template-body]');
    expect(body).not.toBeNull();
    expect(dialog.querySelector('[data-template-drop]')?.textContent).toContain(
      'Drop a .vcg package here',
    );
    const file = new File([new Uint8Array([1, 2, 3])], 'dropped.vcg');
    await act(async () => {
      dropFileOn(body as Element, file);
      await Promise.resolve();
    });
    const chosen = await choice;
    expect(chosen).not.toBeNull();
    expect(typeof chosen === 'object' && chosen !== null && 'importFile' in chosen).toBe(true);
    expect((chosen as { importFile: File }).importFile).toBe(file);
    // The dialog closed on the drop, as it does on a load.
    expect(openDialog()).toBeNull();
  });

  it('🔴 through the row, the dropped bytes meet the chain’s own verify — the refusal names the file', async () => {
    const errors: string[] = [];
    const off = onCommandError((m) => errors.push(m));
    const rendered = await renderLayerRow({
      item: null,
      template: null,
      slot: slotWith({ binding: null, observed: { kind: 'empty' } }),
    });
    try {
      const load = rendered.container.querySelector<HTMLButtonElement>('button[aria-label="LOAD"]');
      await act(async () => {
        load?.click();
        await Promise.resolve();
        await Promise.resolve();
      });
      const body = openDialog()?.querySelector('[data-template-body]');
      expect(body, 'LOAD opens the picker').not.toBeNull();
      // Not a package: three bytes. jsdom's File has no `arrayBuffer`, so the bytes are
      // handed over the way the chain reads them; nothing else about the chain is touched.
      const bytes = new Uint8Array([1, 2, 3]);
      const file = new File([bytes], 'garbage.vcg');
      Object.defineProperty(file, 'arrayBuffer', {
        value: () => Promise.resolve(bytes.buffer),
      });
      await act(async () => {
        dropFileOn(body as Element, file);
        await Promise.resolve();
      });
      // The chain is asynchronous (read → verify → refuse → the row's error channel).
      for (let i = 0; i < 20 && errors.length === 0; i++) {
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 5));
        });
      }
      expect(errors).toHaveLength(1);
      // `importVcgFile`'s own sentence: the FILE the operator dropped, then `verify`'s verdict.
      expect(errors[0]).toMatch(/^“garbage\.vcg” failed verification/);
      // …and nothing was registered: the picker's registry is the row's stub, untouched.
      expect(rendered.stubs.list).not.toHaveBeenCalledWith(
        expect.objectContaining({ html: expect.anything() }),
      );
    } finally {
      off();
      await rendered.unmount();
    }
  });
});
