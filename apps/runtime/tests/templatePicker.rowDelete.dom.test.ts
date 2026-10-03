// @vitest-environment jsdom
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FixedLayerBank, SourceAssignments, TemplateInfo } from '@cg/shared-ipc';
import type { StackItemState } from '@cg/shared-schema';
import { useTemplatePicker } from '../src/renderer/features/fixedLayers/useTemplatePicker.js';
import {
  __resetSourcesForTest,
  initSources,
} from '../src/renderer/features/sources/sourceStore.js';
import { clearPortals } from './support/dialog.js';

/**
 * 🔴 `UI-POLISH-01` C — **`Manage` IS RETIRED; DELETE IS ON EACH ROW** (the owner, 2026-09-26).
 *
 * This file was `templatePicker.manage.dom.test.ts`, which pinned `RUNTIME-REPAIR-04`'s move of
 * `Delete from station` OFF the row and into `Manage`. The owner has reversed that: `Manage` was
 * one extra view whose only act was the delete, so the act comes back to the row as a small
 * NEUTRAL icon and the view goes.
 *
 * ── WHAT THIS FILE GUARDS, AND WHAT IT DELIBERATELY DOES NOT ────────────────
 *
 * The move is a change of ROUTE, never of DECISION — again. So this file asserts the route (no
 * `Manage`, a delete on each row that selecting and double-clicking can never reach, the usage
 * line in the aside) and that CONFIRM-FIRST is exactly what it was. What the refusal decides is
 * `templateRemoval.dom.test.ts`'s subject; its ten cases lost only their `Manage` press.
 *
 * ⚠ THE COUNT IS STILL INFORMATION, NOT A GATE: the BRIDGE refuses `in-use` and names the
 * places. A count read from a stack snapshot never disables the control (see the hook's note at
 * `usage`).
 *
 * 🔴 `CHANNEL-TEMPLATES-01` (the owner, 2026-09-28) — the picker is opened from a row on CH 2, as
 * the console always opens it: the icon reads `Remove <name> from CH 2`, the confirm names CH 2,
 * the removal carries channel 2, and the usage line counts CH 2's rows only.
 */

const PLAIN: TemplateInfo = {
  templateId: 'tpl-plain',
  name: 'plain',
  templateType: 'lower-third',
  fields: [],
};
const BOUND: TemplateInfo = {
  templateId: 'tpl-bound',
  name: 'two-box',
  templateType: 'lower-third',
  fields: [],
};

const BANK: FixedLayerBank = {
  channel: 1,
  start: 70,
  count: 30,
  low: { start: 50, count: 9 },
};

let container: HTMLDivElement | null = null;
let registry: TemplateInfo[] = [];
let stack: StackItemState[] = [];
const removeCalls: { templateId: string; channel?: number }[] = [];
const listCalls: ({ channel?: number } | undefined)[] = [];
let picked: unknown[] = [];

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
    },
    stack: {
      snapshot: () => Promise.resolve(stack),
      onStateChanged: () => () => undefined,
      remove: () => Promise.resolve({ accepted: true }),
    },
    templates: {
      list: (req?: { channel?: number }) => {
        listCalls.push(req);
        return Promise.resolve(registry);
      },
      remove: (req: { templateId: string; channel?: number }) => {
        removeCalls.push(req);
        registry = registry.filter((t) => t.templateId !== req.templateId);
        return Promise.resolve({ ok: true });
      },
      // `B-300` — an open picker follows CG Bridge's list.
      onChanged: () => () => undefined,
      onActed: () => () => undefined,
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

async function openPicker(): Promise<HTMLElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  let open: (() => void) | null = null;
  function Host(): JSX.Element {
    const { pickTemplate, pickerDialog } = useTemplatePicker();
    open = () => {
      void pickTemplate('Load onto Layer 99', 'high', {
        rowName: 'Layer 99',
        coord: '2-99',
        channel: 2,
        holding: null,
      }).then((choice) => picked.push(choice));
    };
    return createElement('div', null, pickerDialog);
  }
  await act(async () => {
    root.render(createElement(Host));
    await Promise.resolve();
  });
  await act(async () => {
    open?.();
    await Promise.resolve();
    await Promise.resolve();
  });
  const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
  if (dialog === null) throw new Error('picker did not open');
  return dialog;
}

/**
 * The LAST button with this name — a confirm renders after the picker, and the picker's own
 * `Cancel` is in its footer again now that `Manage` no longer hides it.
 */
function button(name: RegExp | string): HTMLButtonElement | null {
  return (
    [...document.querySelectorAll('button')]
      .filter((b) => {
        const label = b.getAttribute('aria-label') ?? b.textContent ?? '';
        return typeof name === 'string' ? label === name : name.test(label);
      })
      .at(-1) ?? null
  );
}

async function press(name: RegExp | string): Promise<void> {
  const target = button(name);
  if (target === null) throw new Error(`no button matching ${String(name)}`);
  await act(async () => {
    target.click();
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  registry = [PLAIN, BOUND];
  stack = [];
  removeCalls.length = 0;
  listCalls.length = 0;
  picked = [];
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

describe('`UI-POLISH-01` C — the delete is on the row, and `Manage` is gone', () => {
  it('🔴 every row carries its own NEUTRAL delete, named in full; there is no `Manage`', async () => {
    const dialog = await openPicker();
    // `CHANNEL-TEMPLATES-01` — the list read is the row's channel's.
    expect(listCalls).toEqual([{ channel: 2 }]);
    expect(dialog.querySelectorAll('[data-template-list] [data-template-id]').length).toBe(2);
    for (const id of ['tpl-plain', 'tpl-bound']) {
      const del = dialog.querySelector<HTMLButtonElement>(`[data-template-delete="${id}"]`);
      expect(del, `row ${id} carries a delete`).not.toBeNull();
      // An ICON: no visible word, the long form on its accessible name — the owner's words.
      expect(del?.textContent?.trim()).toBe('');
      expect(del?.getAttribute('aria-label')).toMatch(/^Remove .* from CH 2$/);
      // Neutral at rest — never the `danger` variant on a row (red's home is §29.2).
      expect(del?.className).not.toContain('cg-btn--danger');
    }
    // The control: `Manage`, its view and its way back are gone.
    expect(button('Manage')).toBeNull();
    expect(button('Back to selection')).toBeNull();
    expect(dialog.querySelector('[data-template-manage]')).toBeNull();
  });

  it('🔴 selecting or double-clicking a row NEVER deletes', async () => {
    const dialog = await openPicker();
    const select = dialog.querySelector<HTMLButtonElement>(
      '[data-template-id="tpl-bound"] .cg-tpl-row__load',
    );
    if (select === null) throw new Error('no select control');
    await act(async () => {
      select.click();
      await Promise.resolve();
    });
    expect(removeCalls).toEqual([]);
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1); // no confirm opened
    await act(async () => {
      select.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      await Promise.resolve();
    });
    expect(removeCalls).toEqual([]);
    // The double-click did what it always did — it LOADED — and nothing else.
    expect(picked).toEqual([BOUND]);
  });

  it('the aside names how many of THIS channel’s rows hold the selected template — information, never a gate', async () => {
    const onChannel = (itemId: string, channel: number): StackItemState =>
      ({
        itemId,
        templateId: 'tpl-bound',
        fields: {},
        status: 'loaded',
        pending: false,
        slot: { channel, layer: 90, server: 'primary' },
      }) as unknown as StackItemState;
    // Two rows on CH 2 — and one on CH 1, which a removal from CH 2 does not answer to.
    stack = [onChannel('i1', 2), onChannel('i2', 2), onChannel('i3', 1)];
    const dialog = await openPicker();
    await press('Select two-box');
    expect(dialog.querySelector('[data-template-usage]')?.textContent).toBe('Used by 2 rows');
    await press('Select plain');
    expect(dialog.querySelector('[data-template-usage]')?.textContent).toBe('Not on any row');
    // AND THE COUNT DOES NOT DISABLE THE CONTROL.
    expect(button(/Remove two-box from CH 2/)?.disabled).toBe(false);
  });
});

describe('the move changed the ROUTE and nothing the deletion DECIDES', () => {
  it('🔴 still CONFIRMS FIRST, and the confirm names the channel and the fallout', async () => {
    await openPicker();
    await press(/Remove two-box from CH 2/);

    // Nothing has been asked of the bridge yet: the confirm stands between.
    expect(removeCalls).toEqual([]);
    const confirm = [...document.querySelectorAll('[role="dialog"]')].at(-1);
    expect(confirm?.textContent).toContain('Remove “two-box” from CH 2?');
    expect(confirm?.textContent).toContain('every browser');
    expect(confirm?.textContent).toContain('cannot be undone');

    await press(/^Remove from CH 2$/);
    // `CHANNEL-TEMPLATES-01` — the removal names the row's channel, and only it.
    expect(removeCalls).toEqual([{ templateId: 'tpl-bound', channel: 2 }]);
  });

  it('🔴 a cancelled confirm still deletes nothing', async () => {
    await openPicker();
    await press(/Remove two-box from CH 2/);
    await press(/^Cancel$/);
    expect(removeCalls).toEqual([]);
    expect(document.querySelector('[data-template-id="tpl-bound"]')).not.toBeNull();
  });
});
