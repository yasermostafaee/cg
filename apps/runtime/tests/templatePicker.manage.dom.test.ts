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
 * 🔴 `RUNTIME-REPAIR-04` §3.3 — `Delete from station` MOVES OFF THE ROW, INTO `Manage`.
 *
 * The owner decided the move in `design.md` §18.4 and bound its destination to the reference's
 * `Manage` view (audit row 101): _"A red destructive control on every row of a picker is what
 * gets pressed by accident under pressure on an on-air console"_ — and the reference has no
 * destructive control on a row at all.
 *
 * ── WHAT THIS FILE GUARDS, AND WHAT IT DELIBERATELY DOES NOT ────────────────
 *
 * The relocation is a change of ROUTE, never of DECISION. So this file asserts the route —
 * the row is clean, the door exists, the control is behind it — and asserts that the
 * CONFIRM-FIRST and the CASCADE are still exactly what they were. What the refusal decides
 * is `templateRemoval.dom.test.ts`'s subject and stays there, byte for byte: ten cases that
 * were written against the control's old home and now press `Manage` first. If the two files
 * ever disagree about what a deletion does, that file is right.
 *
 * ⚠ THE COUNT IS INFORMATION, NOT A GATE — and that is the one place this console
 * deliberately does NOT follow the drawing. The reference DISABLES its Delete whenever a
 * template is in use (every one of the six it ships is disabled, and its own footer says
 * _"Templates in use are protected in this demo"_). Here the BRIDGE decides: it refuses
 * `in-use` and names the places, and `B-212` turns each into a remedy. A count read from a
 * stack snapshot must never gate a destructive control's AVAILABILITY — during the `B-092`
 * bootstrap window that snapshot can be empty, and a disabled-on-count Delete would then
 * refuse a legitimate deletion with no reason the operator can act on.
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
  low: { start: 1, count: 9 },
};

let container: HTMLDivElement | null = null;
let registry: TemplateInfo[] = [];
let stack: StackItemState[] = [];
const removeCalls: string[] = [];

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
      list: () => Promise.resolve(registry),
      remove: (req: { templateId: string }) => {
        removeCalls.push(req.templateId);
        registry = registry.filter((t) => t.templateId !== req.templateId);
        return Promise.resolve({ ok: true });
      },
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
    open = () => void pickTemplate('Load onto Layer 99', 'high');
    return createElement('div', null, pickerDialog);
  }
  await act(async () => {
    root.render(createElement(Host));
    await Promise.resolve();
  });
  await act(async () => {
    open?.();
    await Promise.resolve();
  });
  const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
  if (dialog === null) throw new Error('picker did not open');
  return dialog;
}

function button(name: RegExp | string): HTMLButtonElement | null {
  return (
    [...document.querySelectorAll('button')].find((b) => {
      const label = b.getAttribute('aria-label') ?? b.textContent ?? '';
      return typeof name === 'string' ? label === name : name.test(label);
    }) ?? null
  );
}

async function press(name: RegExp | string): Promise<void> {
  const target = button(name);
  if (target === null) throw new Error(`no button matching ${String(name)}`);
  await act(async () => {
    target.click();
    await Promise.resolve();
  });
}

beforeEach(() => {
  registry = [PLAIN, BOUND];
  stack = [];
  removeCalls.length = 0;
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

describe('§3.3 — the destructive control is off the row', () => {
  it('🔴 no picker ROW offers a deletion, and the door to one is named', async () => {
    const dialog = await openPicker();

    // The rows are there …
    expect(dialog.querySelectorAll('[data-template-id]').length).toBe(2);
    // … and NOT ONE of them carries a delete. This is the whole of the move.
    expect(dialog.querySelector('[data-template-id] .cg-tpl-delete')).toBeNull();
    expect(button(/Delete .* from this station/)).toBeNull();

    // The door is a control the operator can find, in the tools row beside the search.
    const manage = button('Manage');
    expect(manage, 'the picker offers a Manage view').not.toBeNull();
    expect(dialog.contains(manage)).toBe(true);
  });

  it('🔴 Manage opens a list whose rows CAN delete, and closes back to the picker', async () => {
    await openPicker();
    expect(document.querySelector('[data-template-manage]')).toBeNull();

    await press('Manage');
    const manage = document.querySelector('[data-template-manage]');
    expect(manage, 'the management list replaced the selection list').not.toBeNull();
    // The selection half is GONE, not merely scrolled past — one surface at a time.
    expect(document.querySelector('[data-template-list]')).toBeNull();
    expect(manage?.querySelectorAll('[data-manage-template]').length).toBe(2);
    expect(button(/Delete two-box from this station/)).not.toBeNull();

    await press('Back to selection');
    expect(document.querySelector('[data-template-manage]')).toBeNull();
    expect(document.querySelector('[data-template-list]')).not.toBeNull();
  });

  it('names how many rows hold a template, from the stack the console already has', async () => {
    stack = [
      { itemId: 'i1', templateId: 'tpl-bound', fields: {}, status: 'loaded', pending: false },
      { itemId: 'i2', templateId: 'tpl-bound', fields: {}, status: 'loaded', pending: false },
    ] as unknown as StackItemState[];
    await openPicker();
    await press('Manage');

    const bound = document.querySelector('[data-manage-template="tpl-bound"]');
    const plain = document.querySelector('[data-manage-template="tpl-plain"]');
    expect(bound?.textContent).toContain('Used by 2 rows');
    expect(plain?.textContent).toContain('Not on any row');

    /*
      ⚠ AND THE COUNT DOES NOT DISABLE THE CONTROL — see the file header. The reference
      disables every Delete it ships; here the bridge is the authority and a stale snapshot
      may not stand in front of it.
    */
    expect(button(/Delete two-box from this station/)?.disabled).toBe(false);
  });
});

describe('§3.3 — the move changed the ROUTE and nothing the deletion DECIDES', () => {
  it('🔴 still CONFIRMS FIRST, and the confirm still names the fallout', async () => {
    await openPicker();
    await press('Manage');
    await press(/Delete two-box from this station/);

    // Nothing has been asked of the bridge yet: the confirm stands between.
    expect(removeCalls).toEqual([]);
    const confirm = [...document.querySelectorAll('[role="dialog"]')].at(-1);
    expect(confirm?.textContent).toContain('every browser');
    expect(confirm?.textContent).toContain('cannot be undone');

    await press(/^Delete from station$/);
    expect(removeCalls).toEqual(['tpl-bound']);
  });

  it('🔴 a cancelled confirm still deletes nothing', async () => {
    await openPicker();
    await press('Manage');
    await press(/Delete two-box from this station/);
    await press(/^Cancel$/);
    expect(removeCalls).toEqual([]);
    expect(document.querySelector('[data-manage-template="tpl-bound"]')).not.toBeNull();
  });
});
