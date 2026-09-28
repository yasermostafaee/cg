// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { authStub, fillBridgeStub } from './support/authStub.js';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StackItemState } from '@cg/shared-schema';
import type { SourceAssignments, SourceCatalog, TemplateInfo } from '@cg/shared-ipc';
import { Inspector } from '../src/renderer/features/inspector/Inspector.js';
import { StationSetupDialog } from '../src/renderer/features/stationSetup/StationSetupDialog.js';
import {
  __resetDraftsForTest,
  isItemDirty,
  snapshotPlateDraft,
} from '../src/renderer/features/inspector/draftStore.js';
import {
  __resetSourcesForTest,
  initSources,
} from '../src/renderer/features/sources/sourceStore.js';
import { connectionsStub, linkFor } from './support/reachability.js';
import {
  choosePickerOption,
  closePicker,
  openPicker,
  pickerValue,
} from './support/sourcePicker.js';

/**
 * D-137 / C-015 — WHERE a plate is bound, after the 2026-08-10 correction.
 *
 * Defining the installation's sources stays in the Live sources section of Station
 * setup (the `Live sources` modal until `STATION-SETUP-02`); BINDING a plate moved to
 * the INSPECTOR, beside the template being bound. The three
 * properties worth a test are the three the move exists to produce:
 *
 *  1. the modal no longer carries any plate binding at all;
 *  2. the Inspector shows THIS template's plates, and shows nothing for a
 *     template that declares none;
 *  3. 🔴 the assignment is TEMPLATE-LEVEL — an APPLIED assignment made from one
 *     row is what a DIFFERENT row carrying the same template reads back. That is
 *     the test that pins the semantics rather than trusting the section's label.
 *     `CHANNEL-SOURCES-01`: template-level ON ONE CHANNEL — a row on another channel
 *     reads that channel's own (the last case in that block).
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
    defaultPosition: { anchor: 'center', offset: { x: 0, y: 0 } },
    sources: [plate('el-1', 'guest-1'), plate('el-2', 'guest-2')],
  },
};

const NO_PLATES: TemplateInfo = {
  templateId: 'tpl-plain',
  templateType: 'lower-third',
  fields: [],
  liveSources: {
    resolution: { width: 1920, height: 1080 },
    defaultPosition: { anchor: 'center', offset: { x: 0, y: 0 } },
    sources: [],
  },
};

let container: HTMLDivElement | null = null;
let stored: SourceAssignments = { assignments: [] };
const setCalls: SourceAssignments[] = [];
/** §6 — set by a case that wants `sources.set-assignments` refused; reset between cases. */
let refuse: { ok: false; reason?: string; message?: string } | null = null;

beforeEach(() => {
  __resetDraftsForTest();
  __resetSourcesForTest();
  stored = { assignments: [] };
  setCalls.length = 0;
  refuse = null;
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
      onChanged: () => () => undefined,
    },
    // Phase 6 — the Inspector names the ROW (`useOperatorNames`), so it reads the bank too.
    fixedLayers: {
      config: () => Promise.resolve(null),
      onConfigChanged: () => () => undefined,
      state: () => Promise.resolve([]),
      onStateChanged: () => () => undefined,
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
        /*
          §6 — a REFUSAL the bridge can give, so the dialog's refusal path is exercised
          against the real return shape rather than a hand-made one. `stored` is left ALONE on
          a refusal, which is what makes "rewrites nothing" a real assertion.
        */
        if (refuse !== null) return Promise.resolve(refuse);
        stored = req;
        return Promise.resolve({ ok: true });
      },
    },
  };
  // `C-038` — the channel list is scoped to the principal, so every stub needs one.
  (stub as { auth?: unknown }).auth = authStub();
  (window as unknown as { cg: typeof stub }).cg = fillBridgeStub(stub);
  return stub;
}

/** Drive one plate's picker the way an operator does. */
/**
 * 🔴 **`SOURCE-DEFAULTS-20` — THE EDITOR IS BEHIND A LINK NOW.**
 *
 * The per-plate selects were inline in the Inspector's LIVE PLATES section; they are in a
 * dialog the section head opens. These specs are RE-POINTED at it rather than relaxed: every
 * one still asserts the same values, the same options and the same wire traffic — what changed
 * is that reaching the control is an act the operator performs, so the tests perform it.
 */
async function openDefaults(el: HTMLElement): Promise<HTMLElement> {
  const link = el.querySelector<HTMLButtonElement>('[data-open-template-defaults]');
  if (link === null) throw new Error('no Source defaults link in the section head');
  await act(async () => {
    link.click();
    await Promise.resolve();
  });
  const dialog = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].at(-1);
  if (dialog === undefined) throw new Error('the defaults dialog did not open');
  return dialog;
}

/**
 * The dialog's picker field for one plate. `PLAYOUT-SOURCES-01` §2.A — the ONE source picker
 * replaced the native select; its field carries the plate's value as `data-picker-value`.
 */
function defaultsSelect(dialog: HTMLElement, plateId: string): HTMLElement {
  const field = dialog.querySelector<HTMLElement>(`[aria-label="Default source for ${plateId}"]`);
  if (field === null) throw new Error(`no picker for ${plateId}`);
  return field;
}

/** Open the dialog, choose a source for a plate, and leave the dialog open. */
async function pick(el: HTMLElement, plateId: string, sourceId: string): Promise<HTMLElement> {
  const dialog = await openDefaults(el);
  await choosePickerOption(defaultsSelect(dialog, plateId), sourceId);
  return dialog;
}

/** …and press its commit, which is what now writes the assignment. */
async function saveDefaults(dialog: HTMLElement): Promise<void> {
  const save = dialog.querySelector<HTMLButtonElement>('[data-defaults-save]');
  if (save === null) throw new Error('no Save defaults button');
  await act(async () => {
    save.click();
    await Promise.resolve();
  });
  await act(async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
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

describe('the Live sources section of Station setup defines sources and binds nothing (§6)', () => {
  it('renders no plate binding at all, and never touches the assignments channel', async () => {
    /*
      `STATION-SETUP-02` §6 — THE TWO SHAPES THAT LOOK LIKE ONE. The CATALOG (installation-
      wide, `sources.set-config`) and the plate→source ASSIGNMENTS (per template,
      `sources.set-assignments`) share a name and are two things in two files. Merging their
      SURFACES into one dialog is fine; merging their SHAPE would make an assignment
      installation-wide — the exact bug `LiveSourceSwapDialog`'s own intro exists to prevent.
      So this asserts, on the merged surface: no plate control, and NO write to the
      assignments channel however the catalog is edited.
    */
    const stub = bridgeStub([TWO_BOX], TWO_BOX);
    // The whole dialog renders, so the rest of its bridge surface is stubbed too.
    Object.assign(stub, {
      fixedLayers: {
        config: () => Promise.resolve(null),
        onConfigChanged: () => () => undefined,
        state: () => Promise.resolve([]),
        onStateChanged: () => () => undefined,
        setConfig: () => Promise.resolve({ ok: true }),
      },
      channelSettings: {
        get: () => Promise.resolve({ settings: [], observed: [] }),
        onChanged: () => () => undefined,
        set: () => Promise.resolve({ ok: true }),
      },
      // `R-062` gap 2 — the discovery answer; empty means the channel list falls back.
      stationChannels: {
        list: () => Promise.resolve({ channels: [] }),
        onChanged: () => () => undefined,
      },
      playoutLayers: { state: () => Promise.resolve([]), onStateChanged: () => () => undefined },
      liveLayers: {
        state: () => Promise.resolve([]),
        onStateChanged: () => () => undefined,
        onPlateReleased: () => () => undefined,
      },
      delimiters: {
        list: () => Promise.resolve([]),
        onChanged: () => () => undefined,
        set: () => Promise.resolve({ ok: true }),
      },
    });
    Object.assign(stub.connections, {
      config: () =>
        Promise.resolve({
          servers: { A: { host: '127.0.0.1', amcpPort: 5250, oscPort: 6250 } },
          strategy: 'mirror-sync',
          autoFailoverEnabled: true,
        }),
      onConfigChanged: () => () => undefined,
      setConfig: () => Promise.resolve({ ok: true }),
      templateServe: () =>
        Promise.resolve({
          serveHost: '127.0.0.1',
          port: 0,
          exposed: false,
          unreachable: [],
          flagOverrides: {},
          candidates: [],
        }),
    });
    Object.assign(stub.stack, {
      snapshot: () => Promise.resolve([]),
      onStateChanged: () => () => undefined,
    });
    // `MULTI-CHANNEL-01` — the `fixedLayers` swapped in above states its bank singly; derive the
    // plural read from it again, as the install did for the one it replaced.
    fillBridgeStub(stub);
    container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      initSources(window.cg);
      root.render(
        createElement(StationSetupDialog, {
          open: true,
          section: 'sources',
          onClose: () => undefined,
        }),
      );
      await Promise.resolve();
    });
    await act(async () => {
      for (let i = 0; i < 8; i++) await Promise.resolve();
    });
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    const section = dialog?.querySelector('[data-station-section="sources"]');
    expect(section).not.toBeNull();
    /*
      🔴 `PLAYOUT-SOURCES-01` §2.C — it LISTS the station's sources, read-only: they are the
      Playout's now, and this section no longer defines any (the editor went with §1.F). The claim
      this case makes is unchanged in its point — the settings home lists sources and binds none.
    */
    expect(
      [...(section?.querySelectorAll<HTMLElement>('[data-source-input] bdi') ?? [])]
        .map((el) => el.textContent)
        .filter((t) => t === 'Studio A' || t === 'Baku'),
    ).toEqual(['Studio A', 'Baku']);
    // …and carries no trace of the binding job it briefly held. Asserted on the WHOLE
    // dialog, the plate ids AND the control, because any one of them surviving anywhere in
    // Station setup would put the settings home to doing the Inspector's job.
    expect(dialog?.textContent).not.toContain('TEMPLATE PLATES');
    expect(dialog?.textContent).not.toContain('guest-1');
    expect(dialog?.querySelector('[data-plate-unassigned]')).toBeNull();
    expect(dialog?.querySelector('select[aria-label^="Source for"]')).toBeNull();
    // …and no picker either: binding a plate is the Inspector's job, never the settings home's.
    expect(dialog?.querySelector('[data-picker-value]')).toBeNull();
    // `PLAYOUT-SOURCES-01` — nothing in the section can edit a source now (the rename this case
    // used to drive went with the editor), so the assignments channel is never written.
    expect(setCalls, 'the settings home must not write the assignments').toEqual([]);
    await act(async () => {
      root.unmount();
    });
  });
});

describe('the Inspector binds THIS template plates', () => {
  it('renders one row per declared plate, unassigned to start', async () => {
    const el = await renderInspector(item('item-1', 'tpl-two-box'), TWO_BOX);
    const section = el.querySelector('[aria-label="Live plates"]');
    expect(section).not.toBeNull();
    /*
      🔴 THE SECTION CARRIES THE DOOR, NOT THE EDITOR (`SOURCE-DEFAULTS-20`). The selects
      are in the dialog it opens; what must still be true HERE is that the door exists and
      that the section is not spending the panel on a list it no longer owns.
    */
    expect(section?.querySelector('[data-open-template-defaults]')).not.toBeNull();
    expect(section?.querySelectorAll('select').length).toBe(0);
    expect(section?.querySelectorAll('[data-picker-value]').length).toBe(0);

    const dialog = await openDefaults(el as HTMLElement);
    expect(dialog.querySelectorAll('[data-defaults-select]').length).toBe(2);
    // A freshly imported template has ALL of its plates unassigned, which is the ordinary
    // state — the blank option NAMES itself rather than leaving the box empty.
    expect(pickerValue(defaultsSelect(dialog, 'guest-1'))).toBe('');
    expect(pickerValue(defaultsSelect(dialog, 'guest-2'))).toBe('');
    /*
      The SCOPE is stated in the section, not hidden in a tooltip: this is the template's
      default, so editing it here changes every row using it.

      ⚠ REWORDED BY SESSION BM-2, and the old sentence is kept here because the change is a
      correction rather than a polish. It read _"Set for the template, not this row — every
      row using it takes the same sources."_ True of a flat map; a LIE about the four-level
      model, because it says "not this row" while two of the four levels ARE this row's. What
      is asserted is unchanged: that the section says which level its own control is on.
    */
    /*
      The SCOPE is stated in the section, not hidden in a tooltip: this is the template's
      default, so editing it changes every row using it.

      ⚠ REWORDED TWICE, and both old spellings are kept here because each change was a
      correction rather than a polish. BM-2 replaced _"Set for the template, not this row"_ —
      true of a flat map, a LIE about the four-level model. `SOURCE-DEFAULTS-20` replaced
      _"The DEFAULT every row using this template starts from"_, which was written to
      introduce the selects that sat under it; with those behind a link the sentence's job is
      to say what is behind it and at what LEVEL. What is asserted is unchanged: that the
      section says which level its own control is on.
    */
    /*
      🔴 THE SCOPE IS STATED WHERE THE CONTROL IS — and the control moved, so the sentence
      did too (`SOURCE-DEFAULTS-20`, gh3). It has been reworded twice and both old spellings
      are kept here because each change was a correction rather than a polish:

        BM-2  replaced _"Set for the template, not this row"_ — true of a flat map, a LIE
              about the four-level model, because it says "not this row" while two of the four
              levels ARE this row's.
        §1    moved the surviving sentence off the panel entirely. It existed to introduce the
              selects that sat under it; with those in a dialog the panel has nothing to
              introduce, and the owner's «نیاز به اون همه توضیحات هم نیست» is the
              instruction not to leave prose behind where the thing it described has gone.

      What is asserted is unchanged: that the operator is told which LEVEL this control is on,
      at the moment they can act on it. `CHANNEL-SOURCES-01` made that level a channel's, so the
      sentence names the channel, and so does the title.
    */
    expect(dialog.textContent).toContain('Source defaults · CH 1');
    expect(dialog.textContent).toContain('apply to every row on CH 1 using this template');
    expect(dialog.textContent).toContain('row overrides remain separate');
  });

  it('renders NO section for a template that declares no live plates', async () => {
    // An empty heading is a question the operator did not ask, on the panel they
    // use most.
    const el = await renderInspector(item('item-2', 'tpl-plain'), NO_PLATES);
    expect(el.querySelector('[aria-label="Live plates"]')).toBeNull();
  });

  it('offers every source by NAME, never by its internal id', async () => {
    const el = await renderInspector(item('item-1', 'tpl-two-box'), TWO_BOX);
    const dialog = await openDefaults(el as HTMLElement);
    // `PLAYOUT-SOURCES-01` §2.A — the ONE picker: the call site's own choice above the tabs, then
    // the inputs by name.
    const panel = await openPicker(defaultsSelect(dialog, 'guest-1'));
    expect([...panel.querySelectorAll('[data-picker-choice]')].map((c) => c.textContent)).toEqual([
      'None',
    ]);
    const inputs = [...panel.querySelectorAll<HTMLElement>('[data-picker-input]')];
    expect(inputs.map((o) => o.textContent)).toEqual(['Studio A', 'Baku']);
    // The id is the VALUE — stable across a rename — while the operator picks the name; it is
    // never on screen.
    expect(inputs.map((o) => o.dataset['pickerInput'])).toEqual(['src-aaa', 'src-bbb']);
    expect(panel.textContent).not.toContain('src-');
    // Escape closes the panel — and only the panel: the dialog it opened from stays.
    await closePicker();
    expect(document.querySelector('[data-popover]')).toBeNull();
    expect(dialog.isConnected).toBe(true);
  });

  /**
   * 🔴 **A8's CLAIM SURVIVES; ITS MECHANISM CHANGED — `SOURCE-DEFAULTS-20` §3.**
   *
   * A8's point is that a TEMPLATE-wide edit must not reach the bridge the instant a select
   * moves: the assignment changes what every row using the template does, so there has to be
   * a moment to notice before it lands. That is unchanged and is asserted below.
   *
   * What changed is WHERE the confirmation lives. It used to be the ROW's draft store — the
   * edit staged beside the row's field edits and rode the row's UPDATE — and §3 replaces that
   * with the dialog's own `Save defaults`. The scope confusion is the reason it is an
   * improvement rather than a lateral move: an installation-level value committed by one
   * ROW's Update was always the wrong shape, and the inline block's own header said so.
   *
   * ⚠ So the DISCARD case below is gone rather than re-pointed, and that is a deliberate
   * consequence: the row's DISCARD no longer has a plate edit to drop, because the dialog's
   * `Cancel` owns that now. It is asserted here, because a claim that quietly stops being
   * exercised is how a behaviour change hides.
   */
  it('§3 — changing the picker reaches the bridge with NOTHING until the dialog commits', async () => {
    const el = await renderInspector(item('item-1', 'tpl-two-box'), TWO_BOX);
    const dialog = await pick(el, 'guest-1', 'src-aaa');

    // Nothing on the wire yet — the dialog's own button IS the confirmation step.
    expect(setCalls).toEqual([]);
    // …and it is NOT staged in the row's draft store either: a template-wide value must not
    // ride a row's UPDATE.
    expect(snapshotPlateDraft('item-1').get('guest-1')).toBeUndefined();
    expect(isItemDirty('item-1', {}, new Map([['guest-1', null]]))).toBe(false);

    // The commit is enabled only once there is something to commit.
    expect(dialog.querySelector<HTMLButtonElement>('[data-defaults-save]')?.disabled).toBe(false);

    await saveDefaults(dialog);
    expect(setCalls).toHaveLength(1);
    // `CHANNEL-SOURCES-01` — written for the row's channel, and for no other.
    expect(setCalls[0]?.assignments).toEqual([
      { channel: 1, templateId: 'tpl-two-box', plateId: 'guest-1', sourceId: 'src-aaa' },
    ]);
  });

  it('§3 — CANCEL discards the edit, and writes nothing', async () => {
    const el = await renderInspector(item('item-1', 'tpl-two-box'), TWO_BOX);
    const dialog = await pick(el, 'guest-1', 'src-aaa');
    const cancel = [...dialog.querySelectorAll('button')].find((b) => b.textContent === 'Cancel');
    await act(async () => {
      cancel?.click();
      await Promise.resolve();
    });
    expect(setCalls, 'Cancel writes nothing').toEqual([]);
    // Reopening shows the APPLIED value, not the abandoned one — a discarded edit that came
    // back on the next open would be an edit the operator thought they had dropped.
    const again = await openDefaults(el as HTMLElement);
    expect(pickerValue(defaultsSelect(again, 'guest-1'))).toBe('');
  });

  it('§6 — a REFUSED commit says why, keeps the edit, and rewrites nothing', async () => {
    const el = await renderInspector(item('item-1', 'tpl-two-box'), TWO_BOX);
    refuse = { ok: false, reason: 'unknown-source', message: 'No such source: src-aaa.' };
    const dialog = await pick(el, 'guest-1', 'src-aaa');
    await saveDefaults(dialog);

    // The reason is ON the dialog — never swallowed, never shown optimistically — and it is the
    // RULE, in the operator's words: the bridge's own sentence is the record's, never this line's
    // (`DELTA-MULTI-CHANNEL-01-A` A5).
    // `PLAYOUT-SOURCES-01` — the rule's words changed with the sources' owner.
    expect(dialog.textContent).toContain('That source is not one the Playout offers');
    expect(dialog.textContent).not.toContain('No such source');
    // The operator's edit is exactly where they left it, and the dialog is still open for it.
    expect(pickerValue(defaultsSelect(dialog, 'guest-1'))).toBe('src-aaa');
  });

  it('🔴 an APPLIED assignment is TEMPLATE-LEVEL: a SECOND row reads the same binding', async () => {
    // Applied bridge-side (what `Update` produces), not staged: a draft is the
    // operator's own and must NOT be visible from another row.
    stored = {
      assignments: [{ templateId: 'tpl-two-box', plateId: 'guest-1', sourceId: 'src-aaa' }],
    };
    const first = await renderInspector(item('item-1', 'tpl-two-box'), TWO_BOX);
    expect(pickerValue(defaultsSelect(await openDefaults(first as HTMLElement), 'guest-1'))).toBe(
      'src-aaa',
    );
    first.remove();

    // A DIFFERENT stack row, same template. It must read back the same binding —
    // that is what "template-level" means, and the label saying so is not
    // evidence that it is true.
    const second = await renderInspector(item('item-2', 'tpl-two-box'), TWO_BOX);
    const secondDialog = await openDefaults(second as HTMLElement);
    expect(pickerValue(defaultsSelect(secondDialog, 'guest-1'))).toBe('src-aaa');
    // …and its OTHER plate is still owed one.
    expect(pickerValue(defaultsSelect(secondDialog, 'guest-2'))).toBe('');
  });

  it('🔴 CHANNEL-SOURCES-01 — a CH 2 row’s dialog edits CH 2’s defaults, and CH 1’s come back untouched', async () => {
    // CH 1 holds guest-1 → Studio A. The row below sits on CH 2.
    const onOne = {
      channel: 1,
      templateId: 'tpl-two-box',
      plateId: 'guest-1',
      sourceId: 'src-aaa',
    };
    stored = { assignments: [onOne] };
    const onTwo: StackItemState = {
      ...item('item-2', 'tpl-two-box'),
      slot: { channel: 2, layer: 71, server: 'primary' },
    };
    const el = await renderInspector(onTwo, TWO_BOX);
    const dialog = await openDefaults(el as HTMLElement);
    // The title names the channel the dialog edits, and CH 1's default does not show through.
    expect(dialog.textContent).toContain('Source defaults · CH 2');
    expect(pickerValue(defaultsSelect(dialog, 'guest-1'))).toBe('');

    await choosePickerOption(defaultsSelect(dialog, 'guest-1'), 'src-bbb');
    await saveDefaults(dialog);
    expect(setCalls).toHaveLength(1);
    // Control: the write carries CH 2's new entry — and CH 1's, byte for byte as it was.
    expect(setCalls[0]?.assignments).toEqual([
      onOne,
      { channel: 2, templateId: 'tpl-two-box', plateId: 'guest-1', sourceId: 'src-bbb' },
    ]);
  });
});

describe('two templates with the same name are told apart on the template line', () => {
  const TWIN_A: TemplateInfo = { ...TWO_BOX, templateId: 'aaaaaa11-1111', name: 'seghab' };
  const TWIN_B: TemplateInfo = { ...TWO_BOX, templateId: 'bbbbbb22-2222', name: 'seghab' };

  /*
    `RUNTIME-REDESIGN-01` Phase 6 (`R-061` (a)) — the heading is the ROW's name now, and the
    template's name lives on the line beneath. This harness publishes NO bank, so the row has
    no place to be named by and the template IS the heading (`operatorRowName`'s fallback
    order); the stub rule is unchanged either way, which is why these two look for the stub
    wherever the template's name is rendered rather than on one element.
  */
  it('adds an id stub ONLY when another template answers to the same name', async () => {
    // R-040's class on a second surface: a display label derived from a
    // non-unique human name, with the unique key present but hidden.
    const el = await renderInspector(item('item-1', 'aaaaaa11-1111'), TWIN_A, [TWIN_A, TWIN_B]);
    const named = el.querySelector('[data-inspector-template], [data-inspector-heading]');
    expect(named?.textContent).toContain('seghab');
    expect(named?.querySelector('[data-template-stub="aaaaaa"]')).not.toBeNull();
  });

  it('leaves an unambiguous template name alone — a suffix on every one is noise', async () => {
    const el = await renderInspector(item('item-1', 'aaaaaa11-1111'), TWIN_A, [TWIN_A]);
    expect(el.textContent).toContain('seghab');
    expect(el.querySelector('[data-template-stub]')).toBeNull();
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
    /*
      …and the EDITOR still shows the TEMPLATE's current value, which is what it edits — now
      one click away rather than inline. The pairing is the point of the case: the row says
      what it is frozen on, the editor says what the template is set to, and the two differ.
    */
    const dialog = await openDefaults(el as HTMLElement);
    expect(pickerValue(defaultsSelect(dialog, 'guest-1'))).toBe('src-bbb');
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
