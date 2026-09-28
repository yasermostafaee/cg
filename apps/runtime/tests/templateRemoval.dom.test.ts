// @vitest-environment jsdom
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  FixedLayerBank,
  SourceAssignments,
  TemplateInfo,
  TemplateReference,
} from '@cg/shared-ipc';
import { useTemplatePicker } from '../src/renderer/features/fixedLayers/useTemplatePicker.js';
import { onRowFocus } from '../src/renderer/features/layers/rowFocus.js';
import {
  __resetSourcesForTest,
  currentSourceAssignments,
  initSources,
} from '../src/renderer/features/sources/sourceStore.js';
import { clearPortals } from './support/dialog.js';
import { fillBridgeStub } from './support/authStub.js';

/**
 * A9 — REMOVING A TEMPLATE FROM THE LIBRARY.
 *
 * ⭐ THE CONTROL MOVED TWICE, AND NOTHING BELOW THIS LINE DID. `RUNTIME-REPAIR-04` §3.3 moved
 * `Delete from station` off the picker's ROW into `Manage`, and every case here gained a
 * `Manage` press; 🔴 `UI-POLISH-01` C (the owner, 2026-09-26) retired `Manage` and put the delete
 * back on each row as an icon with the same accessible name — so every case lost that press
 * again. That press is the whole of both diffs: not an assertion, not a wording, not an
 * expectation about what a deletion decides. If a later change needs to weaken one of these, it
 * is re-deciding the deletion rather than relocating it.
 *
 * The reported bug: a template that declares live sources could not be removed —
 * pressing Remove did nothing and said nothing, while other entries in the same
 * list removed normally.
 *
 * The first test below is the REGRESSION, and it is written to fail against the
 * code that had the bug: the removal must behave identically whether or not the
 * template declares plates.
 *
 * 🔴 `CHANNEL-TEMPLATES-01` (the owner, 2026-09-28) — the removal is FROM THE ROW'S CHANNEL: the
 * icon reads `Remove <name> from CH n`, its confirm names the channel, and the call carries it.
 * And a removal NO LONGER DELETES SOURCE DEFAULTS — it used to wipe the template's bindings on
 * every channel in a station-wide write; they now stay where they are (nothing reads a channel's
 * defaults for a template it does not list). Those two cases were re-decided, not relocated.
 */

const PLAIN: TemplateInfo = {
  templateId: 'tpl-plain',
  name: 'plain',
  templateType: 'lower-third',
  fields: [],
};

const WITH_PLATES: TemplateInfo = {
  templateId: 'tpl-two-box',
  name: 'two-box',
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

let container: HTMLDivElement | null = null;
let registry: TemplateInfo[] = [];
let assignments: SourceAssignments = { assignments: [] };
let removeResult: {
  ok: boolean;
  reason?: string;
  message?: string;
  references?: TemplateReference[];
} = { ok: true };
const removeCalls: { templateId: string; channel?: number }[] = [];
const setAssignmentCalls: SourceAssignments[] = [];
/** `B-212` — the item removals the picker's per-reference remedy issues. */
const stackRemoveCalls: string[] = [];
/** `B-212` — the bank the picker names rows against; the incident's own shape. */
const BANK: FixedLayerBank = {
  channel: 1,
  start: 70,
  count: 30,
  aliases: { '99': 'لوگوی اصلی' },
  low: { start: 50, count: 9 },
};

function installBridge(): void {
  const stub = {
    // `B-212` — the picker reads the bank (through `useBridgeSnapshot`, which asks the
    // link first), and the remedy for an item no row shows is `stack.remove`.
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
      // The picker reads this for the selected template's `Used by N rows` line (`UI-POLISH-01` C).
      // It is INFORMATION: nothing here gates on it, which is why an empty stack is fine.
      snapshot: () => Promise.resolve([]),
      remove: (req: { itemId: string }) => {
        stackRemoveCalls.push(req.itemId);
        return Promise.resolve({ accepted: true });
      },
    },
    templates: {
      list: () => Promise.resolve(registry),
      remove: (req: { templateId: string; channel?: number }) => {
        removeCalls.push(req);
        if (removeResult.ok) registry = registry.filter((t) => t.templateId !== req.templateId);
        return Promise.resolve(removeResult);
      },
    },
    sources: {
      config: () => Promise.resolve({ sources: [] }),
      onConfigChanged: () => () => undefined,
      setConfig: () => Promise.resolve({ ok: true }),
      assignments: () => Promise.resolve(assignments),
      onAssignmentsChanged: () => () => undefined,
      setAssignments: (req: SourceAssignments) => {
        setAssignmentCalls.push(req);
        assignments = req;
        return Promise.resolve({ ok: true });
      },
    },
  };
  (window as unknown as { cg: typeof stub }).cg = fillBridgeStub(stub);
}

/** Mount the picker hook behind a trivial host, and open it. */
async function openPicker(): Promise<HTMLElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  let open: (() => void) | null = null;
  function Host(): JSX.Element {
    const { pickTemplate, pickerDialog } = useTemplatePicker();
    // Opened from a row, as the console always opens it: channel 1's list (`CHANNEL-TEMPLATES-01`).
    open = () =>
      void pickTemplate('Load onto Layer 99', 'high', {
        rowName: 'Layer 99',
        coord: '1-99',
        channel: 1,
        holding: null,
      });
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

/** Press a button by its accessible name, anywhere in the document. */
async function press(name: RegExp | string): Promise<void> {
  const match = [...document.querySelectorAll<HTMLButtonElement>('button')].filter((b) => {
    const label = b.getAttribute('aria-label') ?? b.textContent ?? '';
    return typeof name === 'string' ? label === name : name.test(label);
  });
  const button = match.at(-1);
  if (button === undefined) throw new Error(`no button matching ${String(name)}`);
  await act(async () => {
    button.click();
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(async () => {
  registry = [PLAIN, WITH_PLATES];
  assignments = {
    assignments: [{ templateId: 'tpl-two-box', plateId: 'guest-1', sourceId: 'src-aaa' }],
  };
  removeResult = { ok: true };
  removeCalls.length = 0;
  setAssignmentCalls.length = 0;
  stackRemoveCalls.length = 0;
  __resetSourcesForTest();
  installBridge();
  initSources(window.cg);
  await Promise.resolve();
  await Promise.resolve();
});

afterEach(() => {
  container?.remove();
  container = null;
  clearPortals();
  vi.restoreAllMocks();
});

describe('a template that declares live sources removes exactly like one that does not', () => {
  it('🔴 REGRESSION — Remove takes it off the row’s channel, plates or no plates', async () => {
    const dialog = await openPicker();
    expect(dialog.querySelector('[data-template-id="tpl-two-box"]')).not.toBeNull();
    await press(/Remove two-box from CH 1/);
    await press(/^Remove from CH 1$/);

    expect(removeCalls).toEqual([{ templateId: 'tpl-two-box', channel: 1 }]);
    expect(registry.map((t) => t.templateId)).toEqual(['tpl-plain']);
  });

  it('🔴 CHANNEL-TEMPLATES-01 — its Source defaults are KEPT: a removal writes none', async () => {
    assignments = {
      assignments: [
        { channel: 1, templateId: 'tpl-two-box', plateId: 'guest-1', sourceId: 'src-aaa' },
        { channel: 2, templateId: 'tpl-two-box', plateId: 'guest-1', sourceId: 'src-aaa' },
        { channel: 1, templateId: 'tpl-other', plateId: 'guest-1', sourceId: 'src-bbb' },
      ],
    };
    __resetSourcesForTest();
    initSources(window.cg);
    await Promise.resolve();
    await Promise.resolve();

    await openPicker();
    await press(/Remove two-box from CH 1/);
    await press(/^Remove from CH 1$/);

    // The removal went through (the positive control) — and not one defaults write followed it,
    // on this channel or any other. They used to be wiped on EVERY channel at once, which is what
    // refused a channel's own operator the removal (`PLATE-BAND-01`'s found item).
    expect(removeCalls).toEqual([{ templateId: 'tpl-two-box', channel: 1 }]);
    expect(setAssignmentCalls).toEqual([]);
    expect(currentSourceAssignments().assignments).toHaveLength(3);
  });
});

describe('a refusal the operator cannot see is its own defect', () => {
  it('says WHY the removal did not happen, in the dialog itself', async () => {
    removeResult = {
      ok: false,
      reason: 'in-use',
      message:
        "1 row still holds this template — on the row “Layer 1” (layer 99). Clear it with the row's own REMOVE first.",
    };
    const dialog = await openPicker();
    await press(/Remove two-box from CH 1/);
    await press(/^Remove from CH 1$/);

    // In the PICKER's own pinned message region, not a toast behind the modal:
    // this dialog is on top of everything, so a refusal routed anywhere else is
    // a refusal the operator never reads.
    const message = dialog.querySelector('[data-modal-message]')?.textContent ?? '';
    expect(message).toMatch(/still holds this template/);
    /*
      …and the entry is still listed, because it is still there — in the picker's own list, the
      surface the refusal was raised on (`UI-POLISH-01` C: `Manage` is retired). The claim is
      unchanged: a refused deletion leaves the template on screen.
    */
    expect(
      dialog.querySelector('[data-template-list] [data-template-id="tpl-two-box"]'),
    ).not.toBeNull();
  });

  it('says so when the call THROWS, rather than swallowing it', async () => {
    const stub = window.cg as unknown as {
      templates: { remove: (req: { templateId: string }) => Promise<unknown> };
    };
    stub.templates.remove = () => Promise.reject(new Error('bridge is down'));

    const dialog = await openPicker();
    await press(/Remove two-box from CH 1/);
    await press(/^Remove from CH 1$/);

    expect(dialog.querySelector('[data-modal-message]')?.textContent ?? '').toMatch(
      /bridge is down/,
    );
  });

  it('does NOT delete the assignments when the removal was refused', async () => {
    removeResult = { ok: false, reason: 'in-use', message: 'still in use' };
    await openPicker();
    await press(/Remove two-box from CH 1/);
    await press(/^Remove from CH 1$/);

    // The entry survives, so its bindings must too — dropping them here would
    // silently un-bind a template the operator still has.
    expect(setAssignmentCalls).toEqual([]);
    expect(currentSourceAssignments().assignments).toHaveLength(1);
  });
});

/**
 * ⭐ **`B-212` — A REFUSAL THAT NAMES A COUNT BUT NOT A LOCATION IS HALF A REFUSAL.**
 *
 * _"2 stack item(s) still use this template — remove them (or Remove All) first."_ was
 * read on 2026-09-04 by an operator looking at rows that all said EMPTY: the two items
 * were on layers 60 and 61, dynamic layers no row shows. The sentence's one concrete
 * remedy was the sweeping one, and he reached for it. These pin the two remedies the
 * dialog now offers instead — the way to a row, and the removal of one hidden item —
 * and that the sweeping one is not mentioned.
 *
 * ⭐ **`MODAL-CHROME-10` ADDENDUM C §C4 — THE REMEDIES MOVED, AND THE CLAIM DID NOT.** They
 * were a block under the list (`[data-in-use-reference]`); the refusal therefore rendered on
 * TWO surfaces, the sentence pinned above and the remedies scrolled away below. They are now
 * inside the message that names them (`[data-notice-remedies]`), which is what these cases
 * read. What each remedy DOES is unchanged, and so is the refusal condition.
 */
describe('B-212 — the in-use refusal names where, and offers the way there', () => {
  it('a row-bound item gets "Show <row>", which closes the picker and asks the table to go there', async () => {
    removeResult = {
      ok: false,
      reason: 'in-use',
      message:
        "1 row still holds this template — on the row “لوگوی اصلی” (layer 99). Clear it with the row's own REMOVE first.",
      references: [{ itemId: 'i-row', slot: { channel: 1, layer: 99 } }],
    };
    const focused: number[] = [];
    const off = onRowFocus((layer) => focused.push(layer));
    try {
      const dialog = await openPicker();
      // Let the bank snapshot land (it is a round trip through the stub).
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      await press(/Remove two-box from CH 1/);
      await press(/^Remove from CH 1$/);

      /*
        ONE surface: the pinned message region, carrying the sentence AND the way out. There
        is no second block — the assertion below is what would fail if one came back.
      */
      const region = dialog.querySelector('[data-modal-message]');
      expect(region?.textContent).toContain('on the row “لوگوی اصلی” (layer 99)');
      expect(dialog.querySelectorAll('[data-in-use-reference]')).toHaveLength(0);

      const remedies = region?.querySelector('[data-notice-remedies]');
      expect(remedies, 'the way out is not inside the message that names it').not.toBeNull();
      const show = remedies?.querySelector('button');
      /*
        §C4(e) — the label says what the press DOES. `Show` alone left an operator guessing
        whether something was about to move on screen or on air. §C4(d) — the NAME is in its own
        `<bdi>`, so the parentheses and the layer number around it cannot be dragged into the
        Persian run; `textContent` is unaffected by that, which is exactly why the ISOLATION is
        asserted in the browser (`bidi-names.spec.ts`) and the WORDS are asserted here.
      */
      expect(show?.textContent).toBe('Go to لوگوی اصلی (layer 99)');
      expect(show?.querySelector('bdi')?.textContent).toBe('لوگوی اصلی');
      expect(dialog.textContent).not.toMatch(/remove all/i);

      await act(async () => {
        show?.click();
        await Promise.resolve();
      });
      // The picker is gone and the table was asked for layer 99 — by its stable identity.
      expect(document.querySelector('[role="dialog"]')).toBeNull();
      expect(focused).toEqual([99]);
      // Nothing was removed by "show me".
      expect(stackRemoveCalls).toEqual([]);
    } finally {
      off();
    }
  });

  it('an item NO row shows gets a confirm-gated removal of THAT item — the precise remedy, not Remove All', async () => {
    removeResult = {
      ok: false,
      reason: 'in-use',
      message:
        "1 layer still holds this template — on CasparCG layer 60, which is not one of this station's rows. Remove it first.",
      references: [{ itemId: 'i-hidden', slot: { channel: 1, layer: 60 } }],
    };
    const dialog = await openPicker();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    await press(/Remove two-box from CH 1/);
    await press(/^Remove from CH 1$/);

    const region = dialog.querySelector('[data-modal-message]');
    expect(region?.textContent).toContain(
      "CasparCG layer 60, which is not one of this station's rows",
    );
    expect(dialog.querySelectorAll('[data-in-use-reference]')).toHaveLength(0);
    const remedies = region?.querySelector('[data-notice-remedies]');
    expect(remedies?.querySelector('button')?.textContent).toBe('Remove that item');
    expect(dialog.textContent).not.toMatch(/remove all/i);

    // The remedy is gated: a confirm that names the layer and what removal does.
    await press(/^Remove the item on CasparCG layer 60/);
    const confirmText = document.body.textContent ?? '';
    expect(confirmText).toContain('Remove that item?');
    expect(confirmText).toContain('layer 60');
    expect(confirmText).toContain('if it is on air, it comes off');
    expect(stackRemoveCalls).toEqual([]);

    await press(/^Remove item$/);
    // ONE item, by id — never the stack.
    expect(stackRemoveCalls).toEqual(['i-hidden']);
    // The remedy is gone with the item it removed, and the operator is told the next step.
    expect(dialog.querySelector('[data-notice-remedies]')).toBeNull();
    expect(dialog.querySelector('[data-modal-message]')?.textContent).toContain(
      // The sentence quotes the control by the name it has: `Remove <name> from CH n`
      // (`CHANNEL-TEMPLATES-01`).
      'Press Remove again',
    );
  });

  it('cancelling the confirm removes nothing', async () => {
    removeResult = {
      ok: false,
      reason: 'in-use',
      message: 'x still holds this template',
      references: [{ itemId: 'i-hidden', slot: { channel: 1, layer: 60 } }],
    };
    await openPicker();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    await press(/Remove two-box from CH 1/);
    await press(/^Remove from CH 1$/);
    await press(/^Remove the item on CasparCG layer 60/);
    await press('Cancel');
    expect(stackRemoveCalls).toEqual([]);
  });
});

describe('the channel removal is named for what it does, and apart from the row’s REMOVE', () => {
  it('names its CHANNEL, and its confirm names the channel and the fallout', async () => {
    const dialog = await openPicker();
    /*
      The removal's WORDS are not on the list: the row carries an ICON whose long form is its
      accessible name (`UI-POLISH-01` C), so nothing the operator READS on the list can be taken
      for the row's REMOVE.
    */
    expect(dialog.textContent).not.toContain('Remove');
    /*
      🔴 `CHANNEL-TEMPLATES-01` — the owner named it `Remove <name> from CH n`. It shares the row's
      verb and not its object: the row's REMOVE takes a template off THAT ROW ("Remove “X” from
      Layer 95?"), this one takes it off the CHANNEL's list. The accessible name is where that is
      said, so it is what is asserted.
    */
    const wide = [...dialog.querySelectorAll('button')].map(
      (b) => b.getAttribute('aria-label') ?? '',
    );
    expect(wide.some((n) => /^Remove .* from CH 1$/.test(n))).toBe(true);
    expect(wide.some((n) => /from this station$/.test(n))).toBe(false);

    await press(/Remove two-box from CH 1/);
    const confirmText = document.body.textContent ?? '';
    expect(confirmText).toContain('Remove “two-box” from CH 1?');
    expect(confirmText).toMatch(/every browser/i);
    expect(confirmText).toMatch(/re-import/i);
    // The Source defaults are kept now, so the confirm no longer says they go.
    expect(confirmText).not.toMatch(/plate binding/i);
  });
});
