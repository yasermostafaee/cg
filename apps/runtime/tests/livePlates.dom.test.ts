// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StackItemState } from '@cg/shared-schema';
import type { SourceAssignments, SourceCatalog, TemplateInfo } from '@cg/shared-ipc';
import { Inspector } from '../src/renderer/features/inspector/Inspector.js';
import { SourcesModal } from '../src/renderer/features/sources/SourcesModal.js';
import {
  __resetDraftsForTest,
  clearDraft,
  isItemDirty,
  snapshotPlateDraft,
} from '../src/renderer/features/inspector/draftStore.js';
import {
  __resetSourcesForTest,
  initSources,
} from '../src/renderer/features/sources/sourceStore.js';
import { connectionsStub, linkFor } from './support/reachability.js';

/**
 * D-137 / C-015 — WHERE a plate is bound, after the 2026-08-10 correction.
 *
 * Defining the installation's sources stays in the Live sources modal; BINDING a
 * plate moved to the INSPECTOR, beside the template being bound. The three
 * properties worth a test are the three the move exists to produce:
 *
 *  1. the modal no longer carries any plate binding at all;
 *  2. the Inspector shows THIS template's plates, and shows nothing for a
 *     template that declares none;
 *  3. 🔴 the assignment is TEMPLATE-LEVEL — an APPLIED assignment made from one
 *     row is what a DIFFERENT row carrying the same template reads back. That is
 *     the test that pins the semantics rather than trusting the section's label.
 *
 * ⚠ **A8 — the picker STAGES, it does not commit.** Changing it reaches the draft
 * store and nothing else; `Update` is what writes it. The mechanism itself is
 * pinned in `livePlateDraft.test.ts`; what this file asserts is that the CONTROL
 * is wired to it — the dirty marker, the panel's commit bar, and the line that
 * says when the change takes effect.
 */

const CATALOG: SourceCatalog = {
  sources: [
    { id: 'src-aaa', name: 'Studio A', producer: { kind: 'route', channel: 2 } },
    { id: 'src-bbb', name: 'Baku', producer: { kind: 'route', channel: 3 } },
  ],
};

function plate(elementId: string, sourceId: string) {
  return {
    elementId,
    sourceId,
    rect: { x: 0, y: 0, width: 640, height: 360 },
    dynamic: false,
  };
}

const TWO_BOX: TemplateInfo = {
  templateId: 'tpl-two-box',
  templateType: 'lower-third',
  fields: [],
  liveSources: {
    resolution: { width: 1920, height: 1080 },
    defaultPosition: { anchor: 'center', dx: 0, dy: 0 },
    sources: [plate('el-1', 'guest-1'), plate('el-2', 'guest-2')],
  },
};

const NO_PLATES: TemplateInfo = {
  templateId: 'tpl-plain',
  templateType: 'lower-third',
  fields: [],
  liveSources: {
    resolution: { width: 1920, height: 1080 },
    defaultPosition: { anchor: 'center', dx: 0, dy: 0 },
    sources: [],
  },
};

let container: HTMLDivElement | null = null;
let stored: SourceAssignments = { assignments: [] };
const setCalls: SourceAssignments[] = [];

beforeEach(() => {
  __resetDraftsForTest();
  __resetSourcesForTest();
  stored = { assignments: [] };
  setCalls.length = 0;
});

afterEach(() => {
  container?.remove();
  container = null;
  vi.restoreAllMocks();
});

function bridgeStub(templates: readonly TemplateInfo[], info: TemplateInfo | null) {
  const stub = {
    link: {
      status: () => linkFor('both-up'),
      onStatusChanged: () => () => undefined,
      resyncing: () => false,
      onResyncingChanged: () => () => undefined,
    },
    connections: connectionsStub('both-up'),
    templates: {
      get: vi.fn(() => Promise.resolve(info)),
      list: vi.fn(() => Promise.resolve(templates)),
    },
    stack: { setPosition: vi.fn(() => Promise.resolve({ ok: true })) },
    sources: {
      config: () => Promise.resolve(CATALOG),
      onConfigChanged: () => () => undefined,
      setConfig: () => Promise.resolve({ ok: true }),
      assignments: () => Promise.resolve(stored),
      onAssignmentsChanged: () => () => undefined,
      setAssignments: (req: SourceAssignments) => {
        setCalls.push(req);
        stored = req;
        return Promise.resolve({ ok: true });
      },
    },
  };
  (window as unknown as { cg: typeof stub }).cg = stub;
  return stub;
}

/** Drive one plate's picker the way an operator does. */
async function pick(el: HTMLElement, plateId: string, sourceId: string): Promise<void> {
  const select = el.querySelector<HTMLSelectElement>(`select[aria-label="Source for ${plateId}"]`);
  if (select === null) throw new Error(`no picker for ${plateId}`);
  await act(async () => {
    select.value = sourceId;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await Promise.resolve();
  });
}

function item(itemId: string, templateId: string): StackItemState {
  return { itemId, templateId, fields: {}, status: 'loaded', pending: false };
}

async function renderInspector(
  stackItem: StackItemState,
  info: TemplateInfo | null,
  templates: readonly TemplateInfo[] = info === null ? [] : [info],
): Promise<HTMLDivElement> {
  bridgeStub(templates, info);
  container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    initSources(window.cg);
    root.render(
      createElement(
        StrictMode,
        null,
        createElement(Inspector, {
          item: stackItem,
          onApply: () => Promise.resolve({ accepted: true }),
          onDiscard: () => undefined,
        }),
      ),
    );
    await Promise.resolve();
  });
  await act(async () => {
    await Promise.resolve();
  });
  return container;
}

describe('the Live sources modal defines sources and binds nothing', () => {
  it('renders no plate binding at all', async () => {
    bridgeStub([TWO_BOX], TWO_BOX);
    container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      initSources(window.cg);
      root.render(createElement(SourcesModal, { onClose: () => undefined }));
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    // It still DEFINES sources…
    expect(dialog?.textContent).toContain('SOURCES');
    expect(
      [...(dialog?.querySelectorAll<HTMLInputElement>('input[aria-label^="Name of"]') ?? [])].map(
        (i) => i.value,
      ),
    ).toEqual(['Studio A', 'Baku']);
    // …and carries no trace of the binding job it briefly held. Asserted on the
    // section, the plate ids AND the control, because any one of them surviving
    // would put the dialog back to doing two jobs.
    expect(dialog?.textContent).not.toContain('TEMPLATE PLATES');
    expect(dialog?.textContent).not.toContain('guest-1');
    expect(dialog?.querySelector('[data-plate-unassigned]')).toBeNull();
    expect(dialog?.querySelector('select[aria-label^="Source for"]')).toBeNull();
  });
});

describe('the Inspector binds THIS template plates', () => {
  it('renders one row per declared plate, unassigned to start', async () => {
    const el = await renderInspector(item('item-1', 'tpl-two-box'), TWO_BOX);
    const section = el.querySelector('[aria-label="Live plates"]');
    expect(section).not.toBeNull();
    expect(section?.querySelectorAll('select[aria-label^="Source for"]').length).toBe(2);
    // A freshly imported template has ALL of its plates unassigned, which is the
    // ordinary state and is named rather than left blank.
    expect(section?.querySelectorAll('[data-plate-unassigned]').length).toBe(2);
    /*
      The SCOPE is stated in the section, not hidden in a tooltip: this is the template's
      default, so editing it here changes every row using it.

      ⚠ REWORDED BY SESSION BM-2, and the old sentence is kept here because the change is a
      correction rather than a polish. It read _"Set for the template, not this row — every
      row using it takes the same sources."_ True of a flat map; a LIE about the four-level
      model, because it says "not this row" while two of the four levels ARE this row's. What
      is asserted is unchanged: that the section says which level its own control is on.
    */
    expect(section?.textContent).toContain('DEFAULT every row using this template starts from');
  });

  it('renders NO section for a template that declares no live plates', async () => {
    // An empty heading is a question the operator did not ask, on the panel they
    // use most.
    const el = await renderInspector(item('item-2', 'tpl-plain'), NO_PLATES);
    expect(el.querySelector('[aria-label="Live plates"]')).toBeNull();
  });

  it('offers every defined source by NAME, never by its internal id', async () => {
    const el = await renderInspector(item('item-1', 'tpl-two-box'), TWO_BOX);
    const select = el.querySelector<HTMLSelectElement>('select[aria-label="Source for guest-1"]');
    const labels = [...(select?.options ?? [])].map((o) => o.textContent);
    expect(labels).toEqual(['— not assigned —', 'Studio A', 'Baku']);
    // The id is the VALUE — stable across a rename — while the operator picks
    // the name.
    expect([...(select?.options ?? [])].map((o) => o.value)).toEqual(['', 'src-aaa', 'src-bbb']);
  });

  it('A8 — changing the picker STAGES a draft and reaches the bridge with nothing', async () => {
    const el = await renderInspector(item('item-1', 'tpl-two-box'), TWO_BOX);
    await pick(el, 'guest-1', 'src-aaa');

    // Nothing on the wire. The assignment is TEMPLATE-level, so a picker that
    // committed on change would change what other rows do with no moment to
    // notice — the draft IS the confirmation step.
    expect(setCalls).toEqual([]);
    expect(snapshotPlateDraft('item-1').get('guest-1')).toBe('src-aaa');

    // The control marks itself, and the panel's commit bar sees the same edit.
    const select = el.querySelector<HTMLSelectElement>('select[aria-label="Source for guest-1"]');
    expect(select?.className).toContain('is-dirty');
    expect(el.textContent).toContain('● draft');
    expect(
      el.querySelector<HTMLButtonElement>('button[aria-label="Discard staged edits"]')?.disabled,
    ).toBe(false);
    // WHEN it takes effect, said where the change is made.
    expect(el.querySelector('[data-plate-timing]')?.textContent).toContain('next take');
  });

  it('A8 — an ON-AIR item says the change lands at its NEXT take', async () => {
    const onAir: StackItemState = { ...item('item-1', 'tpl-two-box'), status: 'on-air' };
    const el = await renderInspector(onAir, TWO_BOX);
    await pick(el, 'guest-1', 'src-aaa');
    expect(el.querySelector('[data-plate-timing]')?.textContent).toContain('ON AIR');
  });

  it('A8 — Discard drops the plate draft, from the SAME call that drops the fields', async () => {
    const el = await renderInspector(item('item-1', 'tpl-two-box'), TWO_BOX);
    await pick(el, 'guest-1', 'src-aaa');
    await act(async () => {
      clearDraft('item-1');
      await Promise.resolve();
    });
    const select = el.querySelector<HTMLSelectElement>('select[aria-label="Source for guest-1"]');
    expect(select?.value).toBe('');
    expect(isItemDirty('item-1', {}, new Map([['guest-1', null]]))).toBe(false);
  });

  it('🔴 an APPLIED assignment is TEMPLATE-LEVEL: a SECOND row reads the same binding', async () => {
    // Applied bridge-side (what `Update` produces), not staged: a draft is the
    // operator's own and must NOT be visible from another row.
    stored = {
      assignments: [{ templateId: 'tpl-two-box', plateId: 'guest-1', sourceId: 'src-aaa' }],
    };
    const first = await renderInspector(item('item-1', 'tpl-two-box'), TWO_BOX);
    expect(
      first.querySelector<HTMLSelectElement>('select[aria-label="Source for guest-1"]')?.value,
    ).toBe('src-aaa');
    first.remove();

    // A DIFFERENT stack row, same template. It must read back the same binding —
    // that is what "template-level" means, and the label saying so is not
    // evidence that it is true.
    const second = await renderInspector(item('item-2', 'tpl-two-box'), TWO_BOX);
    expect(
      second.querySelector<HTMLSelectElement>('select[aria-label="Source for guest-1"]')?.value,
    ).toBe('src-aaa');
    // …and its OTHER plate is still owed one.
    expect(second.querySelectorAll('[data-plate-unassigned]').length).toBe(1);
  });
});

describe('two templates with the same name are told apart in the heading', () => {
  const TWIN_A: TemplateInfo = { ...TWO_BOX, templateId: 'aaaaaa11-1111', name: 'seghab' };
  const TWIN_B: TemplateInfo = { ...TWO_BOX, templateId: 'bbbbbb22-2222', name: 'seghab' };

  it('adds an id stub ONLY when another template answers to the same name', async () => {
    // R-040's class on a second surface: a display label derived from a
    // non-unique human name, with the unique key present but hidden.
    const el = await renderInspector(item('item-1', 'aaaaaa11-1111'), TWIN_A, [TWIN_A, TWIN_B]);
    const heading = el.querySelector('h3');
    expect(heading?.textContent).toContain('seghab');
    expect(heading?.querySelector('[data-template-stub="aaaaaa"]')).not.toBeNull();
  });

  it('leaves an unambiguous heading alone — a suffix on every one is noise', async () => {
    const el = await renderInspector(item('item-1', 'aaaaaa11-1111'), TWIN_A, [TWIN_A]);
    expect(el.querySelector('h3')?.querySelector('[data-template-stub]')).toBeNull();
  });
});

// ───────── SESSION BP — THE PICKER MUST NOT LIE ABOUT A ROW THAT FROZE ITS ASSIGNMENT ─────────

/**
 * 🔴 **THE FREEZE MAKES THE LIVE ASSIGNMENT STOP BEING WHAT AN ON-AIR ROW RESOLVES, AND THIS
 * SECTION SHOWS THE LIVE ASSIGNMENT.**
 *
 * A row pins level 2 at its take, so an edit made while it is on air changes the value in
 * this picker and changes NOTHING the row is resolving. Unsaid, that is the surface that is
 * confidently wrong: the operator edits the default, the panel agrees, air does not move, and
 * there is nothing anywhere to explain the gap — worse than the freeze not existing, because
 * they would have no reason to look.
 *
 * ⚠ **The picker itself deliberately keeps showing the LIVE value.** It is the control for
 * the TEMPLATE assignment, and it is also the baseline a staged draft is dirty against — an
 * on-air row would read as permanently dirty against its own template if it showed the pin.
 * So the pin is stated BESIDE it, per plate, and only where the two actually disagree.
 */
describe('BP — a frozen row says what it is on', () => {
  const onAirItem = (frozen?: Record<string, string>): StackItemState =>
    ({
      itemId: 'item-1',
      templateId: 'tpl-two-box',
      fields: {},
      status: 'on-air',
      pending: false,
      ...(frozen !== undefined && { frozenAssignment: frozen }),
    }) as StackItemState;

  it('🔴 names the FROZEN source on a plate whose live default has since been edited', async () => {
    stored = {
      assignments: [{ templateId: 'tpl-two-box', plateId: 'guest-1', sourceId: 'src-bbb' }],
    };
    // The row was taken while `guest-1` was Studio A; the default is now Baku.
    const el = await renderInspector(onAirItem({ 'guest-1': 'src-aaa' }), TWO_BOX);

    const said = el.querySelector('[data-plate-frozen="guest-1"]');
    expect(said, 'the divergence must be stated').not.toBeNull();
    expect(said?.textContent).toContain('Studio A');
    expect(said?.textContent).toContain('frozen at take');
    // …and the picker still shows the TEMPLATE's current value, which is what it edits.
    expect(
      el.querySelector<HTMLSelectElement>('select[aria-label="Source for guest-1"]')?.value,
    ).toBe('src-bbb');
  });

  it('says NOTHING when the pin and the default agree — silence is the common case', async () => {
    stored = {
      assignments: [{ templateId: 'tpl-two-box', plateId: 'guest-1', sourceId: 'src-aaa' }],
    };
    const el = await renderInspector(onAirItem({ 'guest-1': 'src-aaa' }), TWO_BOX);
    expect(el.querySelector('[data-plate-frozen="guest-1"]')).toBeNull();
  });

  it('says nothing on an OFF-AIR row, which has no pin and no picture to protect', async () => {
    stored = {
      assignments: [{ templateId: 'tpl-two-box', plateId: 'guest-1', sourceId: 'src-bbb' }],
    };
    // No `frozenAssignment` — the bridge publishes none for a row that is not on air.
    const el = await renderInspector(item('item-1', 'tpl-two-box'), TWO_BOX);
    expect(el.querySelector('[data-plate-frozen="guest-1"]')).toBeNull();
  });

  it('🔴 an `R-048` PATCH suppresses it: two answers to one question would be worse than none', async () => {
    /*
      Level 4 outranks level 2 entirely, so a plate carrying an emergency patch is not on its
      frozen source. Naming both would put two "what is this plate on" claims side by side and
      make the operator supply the precedence rule to read the panel.
    */
    stored = {
      assignments: [{ templateId: 'tpl-two-box', plateId: 'guest-1', sourceId: 'src-bbb' }],
    };
    const patched = {
      ...onAirItem({ 'guest-1': 'src-aaa' }),
      sourceOverride: { 'guest-1': 'src-aaa' },
    } as StackItemState;
    const el = await renderInspector(patched, TWO_BOX);
    expect(el.querySelector('[data-plate-overridden="guest-1"]')).not.toBeNull();
    expect(el.querySelector('[data-plate-frozen="guest-1"]')).toBeNull();
  });

  it('🔴 …including a patch that happens to EQUAL the live default, which reads as no divergence', async () => {
    /*
      🔴 **THE CASE THAT CAUGHT A FALSE SENTENCE.** `onAirPlateSource.overridden` means "the
      patch diverges from the PICKER", and it is FALSE here — the patch and the live default
      are the same value. But the patch is still in force and still outranks the pin, so a
      frozen line gated on `overridden` would have announced Studio A as what this row is on
      while the patch had it on Baku. Gating on `patched` is what makes the panel silent, and
      silence is right: the picker already shows what is composited.
    */
    stored = {
      assignments: [{ templateId: 'tpl-two-box', plateId: 'guest-1', sourceId: 'src-bbb' }],
    };
    const patched = {
      ...onAirItem({ 'guest-1': 'src-aaa' }),
      sourceOverride: { 'guest-1': 'src-bbb' },
    } as StackItemState;
    const el = await renderInspector(patched, TWO_BOX);
    expect(el.querySelector('[data-plate-frozen="guest-1"]'), 'no false claim').toBeNull();
    expect(el.querySelector('[data-plate-overridden="guest-1"]'), 'and no noise').toBeNull();
  });
});
