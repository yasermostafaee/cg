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
    // RUNTIME-REPAIR-05 — the destination is what the footer's primary names, so the
    // helper supplies one: a picker opened from a row always knows which row.
    open = () =>
      pickTemplate('Load onto Bed 1', accepts, { rowName: 'Bed 1', coord: '1-9', holding: null });
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

  it('a row’s meta line counts fields, looks and plates from the CARRIER; the load is the FOOTER’s', async () => {
    const { dialog, choice } = await openPicker('low');
    const bed = dialog.querySelector('[data-template-id="tpl-bed"]');
    expect(bed?.querySelector('.cg-tpl-meta')?.textContent).toContain('Graphics bed');
    expect(bed?.querySelector('.cg-tpl-meta')?.textContent).toContain('0 fields');
    expect(bed?.querySelector('.cg-tpl-meta')?.textContent).toContain('2 looks');
    expect(bed?.querySelector('.cg-tpl-meta')?.textContent).toContain('1 plate');
    /*
      The plain one, on a BED row, is refused by the SAME predicate the bridge uses. The
      refusal is unchanged; `RUNTIME-REPAIR-05` §3 moved where it is SAID. The chip stays on
      the row (four words, the state); the sentence that used to sit under it as a two-line
      paragraph is now on the row's `title` and in the aside when the row is selected — one
      source, `REFUSAL`, read by all three.
    */
    const plain = dialog.querySelector('[data-template-id="tpl-plain"]');
    expect(plain?.getAttribute('data-template-incompatible')).toBe('true');
    expect(plain?.hasAttribute('data-wrong-bank')).toBe(true);
    expect(plain?.querySelector('.cg-tag--warn')?.textContent).toBe('Requires an operator row');
    // The whole sentence, with its remedy, one hover away.
    expect(
      plain?.querySelector<HTMLButtonElement>('.cg-tpl-row__load')?.getAttribute('title'),
    ).toContain('Load this one onto an operator row');
    // …and there is no PROSE left on the row saying it a second time.
    expect(plain?.querySelector('.cg-tpl-reason')).toBeNull();

    /*
      The row SELECTS — the id on its title (golden rule 11) — and the FOOTER loads. The old
      shape had the row's press resolve the pick; the owner reversed that on 2026-09-09.
    */
    const select = bed?.querySelector<HTMLButtonElement>('button[aria-label="Select Two box"]');
    expect(select?.getAttribute('title')).toBe('tpl-bed');
    expect(select?.querySelector('bdi')?.textContent).toBe('Two box');
    await act(async () => {
      select?.click();
      await Promise.resolve();
    });
    const commit = document.querySelector<HTMLButtonElement>('[data-template-commit]');
    expect(commit?.disabled, 'a bed template on a bed row is loadable').toBe(false);
    await act(async () => {
      commit?.click();
      await Promise.resolve();
    });
    expect(await choice).toEqual(BED);
  });

  it('the footer carries the reference’s sentence — true here, because a LOAD is list-only', async () => {
    const { dialog } = await openPicker();
    expect(dialog.querySelector('[data-template-foot-info]')?.textContent).toBe(
      'Loading prepares the row. Use Play when you’re ready to go on air.',
    );
    /*
      …and the action row is Cancel then ONE primary, which is what it has always been — but
      the primary is the LOAD now, not the import. `RUNTIME-REPAIR-05`: the owner split the
      picker in two, so `Import a .vcg…` moved to the tools row beside `Manage` (both are
      station-level and neither is about the row this dialog was opened from), and the footer
      carries the act this dialog exists to perform.
    */
    const actions = [...dialog.querySelectorAll('[data-modal-role]')].map((b) => b.textContent);
    expect(actions).toEqual(['Cancel', 'Load onto Bed 1']);
    // It starts DISABLED: there is nothing selected to load.
    expect(dialog.querySelector<HTMLButtonElement>('[data-template-commit]')?.disabled).toBe(true);
    // And import is still one press away, off the footer.
    expect(dialog.querySelector('[data-template-import-open]')).not.toBeNull();
  });
});

describe('§8 — a dropped package feeds the SAME import chain', () => {
  function dropFileOn(target: Element, file: File): void {
    const event = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'dataTransfer', { value: { files: [file] } });
    target.dispatchEvent(event);
  }

  it('🔴 a dropped package OPENS IMPORT with it staged, and resolves no pick', async () => {
    /*
      `RUNTIME-REPAIR-05` — the gesture changed and the claim did not. A drop used to
      resolve the pick with the file, so the ROW imported it and bound itself in one act.
      Importing is a station act now: the drop stages the package in the Import dialog, the
      operator confirms it, and the load stays a separate press. What is asserted here is
      the same thing it always was — that the dropped file reaches the import path — plus
      the new invariant that it does NOT reach a row on its own.
    */
    const { dialog, choice } = await openPicker();
    const body = dialog.querySelector('[data-template-body]');
    expect(body).not.toBeNull();

    const file = new File([new Uint8Array([1, 2, 3])], 'dropped.vcg');
    await act(async () => {
      dropFileOn(body as Element, file);
      await Promise.resolve();
    });

    // The Import dialog is up, and it names the package it is holding.
    const staged = document.querySelector('[data-import-drop]');
    expect(staged, 'the drop opened the Import dialog').not.toBeNull();
    expect(staged?.textContent).toContain('dropped.vcg');
    // …and the picker has NOT resolved: no row has been asked to load anything.
    let settled = false;
    void choice.then(() => (settled = true));
    await act(async () => {
      await Promise.resolve();
    });
    expect(settled, 'a drop is not a load').toBe(false);
    expect(openDialog(), 'the Templates dialog is still open behind it').not.toBeNull();
  });

  it('🔴 through the row, the dropped bytes meet the chain’s own verify — the refusal names the file', async () => {
    // `RUNTIME-REPAIR-05` — one press further along (confirm the staged import), and the
    // refusal lands in the IMPORT dialog rather than the command toast. Same bytes, same
    // `verify`, same sentence: only where the operator reads it moved.
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

      // Confirm the staged import — the press that actually runs the chain.
      const go = [...document.querySelectorAll('button')].find((b) =>
        /^Import “garbage\.vcg”$/.test(b.textContent ?? ''),
      );
      expect(go, 'the Import dialog offers the staged package').not.toBeUndefined();
      await act(async () => {
        go?.click();
        await Promise.resolve();
      });

      // The chain is asynchronous (read → verify → refuse → the dialog's message region).
      const refusal = (): string =>
        document.querySelector('[data-modal-message]')?.textContent ?? '';
      for (let i = 0; i < 20 && refusal() === ''; i++) {
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 5));
        });
      }
      /*
        🔴 THE REFUSAL IS UNCHANGED, AND IT IS NOW WHERE IT CAN BE READ. `importVcgFile`'s
        own sentence — the FILE the operator dropped, then `verify`'s verdict — in the Import
        dialog's pinned region. It used to go to the command toast, which is `zIndex: 50`
        under a modal backdrop at 1000: the A9 defect, one surface over.
      */
      expect(refusal()).toMatch(/“garbage\.vcg” failed verification/);
      expect(errors, 'no refusal was routed under the backdrop').toEqual([]);
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
