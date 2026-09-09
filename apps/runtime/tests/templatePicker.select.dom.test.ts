// @vitest-environment jsdom
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FixedLayerBank, SourceAssignments, TemplateInfo } from '@cg/shared-ipc';
import {
  useTemplatePicker,
  type TemplateChoice,
} from '../src/renderer/features/fixedLayers/useTemplatePicker.js';
import {
  __resetSourcesForTest,
  initSources,
} from '../src/renderer/features/sources/sourceStore.js';
import { clearPortals } from './support/dialog.js';

/**
 * 🔴 `RUNTIME-REPAIR-05` §2A — SELECT, THEN COMMIT. The reversed contract, guarded.
 *
 * The owner reversed "one press on a row loads it" on 2026-09-09, after seeing the built
 * picker: a row is SELECTED, the aside reads the selection out, and the footer's primary
 * commits it. `design.md` §22 records the reversal and every place the old decision was
 * written down.
 *
 * ── WHAT THIS FILE IS FOR, AND WHAT IT IS NOT ───────────────────────────────
 *
 * It guards the CONTRACT — that clicking does not load, that committing does, that the three
 * commit gestures are one call, and that the ONE refusal condition still refuses. It asserts
 * no geometry: this is jsdom, which has no layout, so the boxes are
 * `picker-select-geometry.spec.ts`'s in a real engine (golden rule 12c).
 *
 * ⚠ THE REFUSAL DID NOT MOVE, ITS PLACE DID. `requiredBankFor(template) !== accepts` is still
 * the only thing that stops a load, and it is still the predicate the bridge refuses on. What
 * changed is that the row is now selectable rather than disabled, so the operator can read
 * the whole reason instead of meeting a control that does nothing — with the commit refused
 * at every gesture that could reach it.
 */

/** A high-bank (operator-row) template: no live plates declared. */
const GRAPHIC: TemplateInfo = {
  templateId: 'tpl-graphic',
  name: 'lower third',
  templateType: 'lower-third',
  fields: [],
};

/** A low-bank (bed) template: it declares a live plate, so it belongs BELOW the plates. */
const BED: TemplateInfo = {
  templateId: 'tpl-bed',
  name: 'three box',
  templateType: 'lower-third',
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
  },
};

const BANK: FixedLayerBank = { channel: 1, start: 70, count: 30, low: { start: 1, count: 9 } };

let container: HTMLDivElement | null = null;
const loads: unknown[] = [];

function installBridge(): void {
  const stub = {
    link: {
      status: () => 'live' as const,
      onStatusChanged: () => () => undefined,
      resyncing: () => false,
      onResyncingChanged: () => () => undefined,
    },
    fixedLayers: {
      config: () => Promise.resolve(BANK),
      onConfigChanged: () => () => undefined,
      // The guard against the whole point of this session: nothing here may load a row.
      load: (req: unknown) => {
        loads.push(req);
        return Promise.resolve({ accepted: true });
      },
    },
    stack: {
      snapshot: () => Promise.resolve([]),
      onStateChanged: () => () => undefined,
      remove: () => Promise.resolve({ accepted: true }),
    },
    templates: {
      list: () => Promise.resolve([GRAPHIC, BED]),
      remove: () => Promise.resolve({ ok: true }),
    },
    sources: {
      config: () => Promise.resolve({ sources: [] }),
      onConfigChanged: () => () => undefined,
      setConfig: () => Promise.resolve({ ok: true }),
      assignments: () => Promise.resolve({ assignments: [] } as SourceAssignments),
      onAssignmentsChanged: () => () => undefined,
      setAssignments: () => Promise.resolve({ ok: true }),
    },
  };
  (window as unknown as { cg: typeof stub }).cg = stub;
}

/** Open the picker on an OPERATOR row (`accepts: 'high'`), and keep its promise. */
async function openPicker(accepts: 'low' | 'high' = 'high'): Promise<{
  dialog: HTMLElement;
  choice: Promise<TemplateChoice>;
}> {
  container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  let open: (() => Promise<TemplateChoice>) | null = null;
  function Host(): JSX.Element {
    const { pickTemplate, pickerDialog } = useTemplatePicker();
    open = () =>
      pickTemplate('Load onto Layer 3', accepts, {
        rowName: 'Layer 3',
        coord: '1-97',
        holding: null,
      });
    return createElement('div', null, pickerDialog);
  }
  await act(async () => {
    root.render(createElement(Host));
    await Promise.resolve();
  });
  let choice!: Promise<TemplateChoice>;
  await act(async () => {
    choice = open?.() ?? Promise.resolve(null);
    await Promise.resolve();
  });
  const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
  if (dialog === null) throw new Error('picker did not open');
  return { dialog, choice };
}

const row = (id: string): HTMLElement | null =>
  document.querySelector<HTMLElement>(`[data-template-id="${id}"] .cg-tpl-row__load`);

const commitButton = (): HTMLButtonElement | null =>
  document.querySelector<HTMLButtonElement>('[data-template-commit]');

async function click(el: Element | null): Promise<void> {
  if (el === null) throw new Error('nothing to click');
  await act(async () => {
    (el as HTMLElement).click();
    await Promise.resolve();
  });
}

beforeEach(() => {
  loads.length = 0;
  installBridge();
  initSources(window.cg);
});

afterEach(() => {
  if (container !== null) {
    container.remove();
    container = null;
  }
  clearPortals();
  __resetSourcesForTest();
});

describe('§2A — a click SELECTS, and the footer COMMITS', () => {
  it('🔴 clicking a row does not resolve the pick, and does not load anything', async () => {
    const { choice } = await openPicker();

    await click(row('tpl-graphic'));

    // The dialog is still open, and nothing has been asked of the bridge.
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(loads, 'a selection is not a load').toEqual([]);
    let settled = false;
    void choice.then(() => (settled = true));
    await act(async () => {
      await Promise.resolve();
    });
    expect(settled).toBe(false);

    // …and the row SAYS it is the selection, for the operator and for the next assertion.
    expect(row('tpl-graphic')?.getAttribute('aria-pressed')).toBe('true');
    expect(
      document
        .querySelector('[data-template-id="tpl-graphic"]')
        ?.getAttribute('data-template-selected'),
    ).toBe('true');
  });

  it('🔴 the footer primary commits the selection, and resolves it', async () => {
    const { choice } = await openPicker();
    // Nothing selected: there is nothing to commit.
    expect(commitButton()?.disabled).toBe(true);

    await click(row('tpl-graphic'));
    expect(commitButton()?.disabled).toBe(false);
    // It names the ROW in the operator's word, not the layer number (golden rule 11).
    expect(commitButton()?.textContent).toContain('Layer 3');

    await click(commitButton());
    const chosen = await choice;
    expect(chosen).not.toBeNull();
    expect((chosen as TemplateInfo).templateId).toBe('tpl-graphic');
  });

  it('a DOUBLE-CLICK commits the same template through the same call', async () => {
    const { choice } = await openPicker();
    const target = row('tpl-graphic');
    if (target === null) throw new Error('no row');
    await act(async () => {
      target.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      await Promise.resolve();
    });
    expect(((await choice) as TemplateInfo).templateId).toBe('tpl-graphic');
  });

  it('ENTER commits the selection, from the list', async () => {
    const { choice } = await openPicker();
    await click(row('tpl-graphic'));
    const list = document.querySelector('[data-template-list]');
    await act(async () => {
      list?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await Promise.resolve();
    });
    expect(((await choice) as TemplateInfo).templateId).toBe('tpl-graphic');
  });
});

describe('§3 — the ONE refusal, unchanged, said where there is room for it', () => {
  it('🔴 a template the row cannot take is SELECTABLE but not committable', async () => {
    const { choice } = await openPicker('high'); // an operator row …

    // … and `tpl-bed` declares plates, so it belongs below them. It is listed and chipped.
    const bedRow = document.querySelector('[data-template-id="tpl-bed"]');
    expect(bedRow?.getAttribute('data-template-incompatible')).toBe('true');
    expect(bedRow?.hasAttribute('data-wrong-bank')).toBe(true);
    expect(bedRow?.textContent).toContain('Requires a bed row');

    // The row is NOT disabled — it can be selected, which is how the operator reads why.
    const control = row('tpl-bed') as HTMLButtonElement | null;
    expect(control?.disabled).not.toBe(true);
    await click(control);

    // The whole sentence is in the aside, and the primary refuses.
    const verdict = document.querySelector('[data-template-verdict]');
    expect(verdict?.getAttribute('data-template-verdict')).toBe('refused');
    expect(verdict?.textContent).toContain('bed rows');
    expect(commitButton()?.disabled).toBe(true);

    /*
      🔴 AND NO GESTURE GETS ROUND IT. The footer, `Enter` and a double-click all route
      through the same `commit`, so the refusal cannot be reached by picking another door —
      which is the property, not the button's `disabled` attribute.
    */
    await click(commitButton());
    const list = document.querySelector('[data-template-list]');
    await act(async () => {
      control?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      list?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await Promise.resolve();
    });
    let settled = false;
    void choice.then(() => (settled = true));
    await act(async () => {
      await Promise.resolve();
    });
    expect(settled, 'no gesture may commit a template this row cannot take').toBe(false);
    expect(loads).toEqual([]);
  });

  it('the same template on its OWN half of the bank is ready, and says so', async () => {
    await openPicker('low'); // a bed row
    await click(row('tpl-bed'));
    const verdict = document.querySelector('[data-template-verdict]');
    expect(verdict?.getAttribute('data-template-verdict')).toBe('ok');
    expect(commitButton()?.disabled).toBe(false);
    /*
      THE POSITIVE CONTROL for the case above: the SAME predicate, the same template, the
      other row — so "refused" there is a statement about the pair, not about this fixture
      never being able to produce a loadable row.
    */
    expect(row('tpl-graphic')).not.toBeNull();
  });

  it('the two CAUTIONS still warn and still do not block', async () => {
    /*
      `Re-import required` and `Needs a source: …` have never gated a load, and this session
      did not give them that power. Asserted because a reader of §3 could reasonably assume
      every chip on a row is a refusal — two of the three are not.
    */
    await openPicker('high');
    await click(row('tpl-graphic'));
    expect(commitButton()?.disabled).toBe(false);
    const carrier = document.querySelector('[data-template-id="tpl-graphic"] [data-live-sources]');
    expect(carrier, 'the carrier state is still stated on the row').not.toBeNull();
  });
});

describe('§2B — importing is reachable, and it is not the load', () => {
  it('the tools row offers Import beside Manage, and it opens a dialog of its own', async () => {
    await openPicker();
    const importOpen = document.querySelector<HTMLButtonElement>('[data-template-import-open]');
    expect(importOpen, 'Import moved out of the footer to the tools row').not.toBeNull();
    expect(document.querySelector('[data-import-drop]')).toBeNull();

    await click(importOpen);
    const zone = document.querySelector('[data-import-drop]');
    expect(zone, 'a dialog of its own, with the drop zone in it').not.toBeNull();
    // Audit row 111: `Choose file` is INSIDE the zone, as the reference paints it.
    expect(zone?.querySelector('button')?.textContent).toContain('Choose file');
    // And it says what it does not do.
    expect(document.querySelector('[data-import-foot-info]')?.textContent).toContain(
      'does not load a row',
    );
  });
});
