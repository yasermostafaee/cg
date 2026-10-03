// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import type { SourceAssignments, SourceCatalog } from '@cg/shared-ipc';
import { toMenuItems } from '../src/renderer/ui/rowAction.js';
import { layerRowActions } from '../src/renderer/features/layers/layerRowActions.js';
import { LiveSourceSwapDialog } from '../src/renderer/features/layers/LiveSourceSwapDialog.js';
import {
  __resetSourcesForTest,
  initSources,
} from '../src/renderer/features/sources/sourceStore.js';
import { bindingFor, itemWith, rowDeps, templateWith } from './support/layerRow.js';
import { clearPortals, openDialog } from './support/dialog.js';
import { choosePickerOption, openPicker, pickerValue } from './support/sourcePicker.js';

/**
 * R-048 / C-015 phase 6 (6.9 / 6.9e) — **the operator's route to a live-source
 * swap, and what the dialog has to tell them.**
 *
 * Two claims, and they are the ones the requirement actually makes:
 *
 *   1. **REACHABLE FROM THE ROW, IN TWO ACTIONS.** Open, choose. Used under
 *      pressure on air, so a third step — an Apply, a settings screen, a second
 *      dialog — is a step that does not happen.
 *   2. **THE LAYERING IS SAID OUT LOUD.** An operator who cannot tell a per-row
 *      substitution from an edit to the template's assignment cannot use this
 *      safely, and the failure is silent: every other row carrying the template
 *      would change, tomorrow, with nobody told.
 */

const CATALOG: SourceCatalog = {
  sources: [
    { id: 'src-a', name: 'Studio A', format: '1080i5000', producer: { kind: 'route', channel: 2 } },
    { id: 'src-b', name: 'Baku', format: '1080i5000', producer: { kind: 'route', channel: 3 } },
  ],
  layerRange: { start: 60, end: 79 },
};

const ASSIGNMENTS: SourceAssignments = {
  assignments: [{ templateId: 'tpl-1', plateId: 'guest-1', sourceId: 'src-a' }],
};

const TEMPLATE = templateWith({
  liveSources: {
    resolution: { width: 1920, height: 1080 },
    defaultPosition: { anchor: 'center', offset: { x: 0, y: 0 } },
    sources: [
      {
        elementId: 'el-1',
        sourceId: 'guest-1',
        rect: { x: 0, y: 0, width: 400, height: 225 },
        dynamic: false,
      },
    ],
  },
});

let root: Root | null = null;
let host: HTMLElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host?.remove();
  host = null;
  clearPortals();
  __resetSourcesForTest();
  vi.restoreAllMocks();
});

async function renderDialog(
  onSwap: (plateId: string, sourceId: string | null) => Promise<{ ok: boolean; message?: string }>,
  over: Parameters<typeof itemWith>[1] = {},
  channel = 1,
  assignments: SourceAssignments = ASSIGNMENTS,
): Promise<void> {
  initSources({
    sources: {
      config: () => Promise.resolve(CATALOG),
      assignments: () => Promise.resolve(assignments),
      onConfigChanged: () => () => undefined,
      onAssignmentsChanged: () => () => undefined,
      setConfig: () => Promise.resolve({ ok: true }),
      setAssignments: () => Promise.resolve({ ok: true }),
    },
  } as never);
  // `initSources` fetches asynchronously; without this flush the dialog renders
  // against an EMPTY catalog and every option assertion passes vacuously.
  await Promise.resolve();
  await Promise.resolve();
  host = document.createElement('div');
  document.body.append(host);
  const r = createRoot(host);
  root = r;
  act(() => {
    r.render(
      createElement(LiveSourceSwapDialog, {
        item: itemWith('on-air', over),
        template: TEMPLATE,
        channel,
        onSwap,
        onClose: () => undefined,
      }),
    );
  });
}

describe('6.9e — the swap is reachable FROM THE ROW', () => {
  it('a row whose template declares plates offers SOURCE', () => {
    const actions = layerRowActions(
      rowDeps({ binding: bindingFor(itemWith('on-air')), hasLivePlates: true }),
    );
    const source = actions.find((a) => a.key === 'swap-source');
    expect(source, 'the SOURCE verb must be offered').toBeDefined();
    expect(source?.disabled).toBe(false);
    // Menu-placed: seven verbs across thirty rows is already 210 controls, and
    // this one is reached in an emergency the operator is looking straight at.
    expect(source?.surface).toBe('menu');
    expect(toMenuItems(actions).some((i) => i.label === 'SOURCE')).toBe(true);
  });

  it('🔴 it is offered ON AIR — that is the only situation it exists for', () => {
    // Patching around a dead feed on a live graphic is the entire use of the verb.
    // A gate on `onAir` would disable it exactly when it is needed.
    const actions = layerRowActions(
      rowDeps({ binding: bindingFor(itemWith('on-air')), hasLivePlates: true }),
    );
    expect(actions.find((a) => a.key === 'swap-source')?.disabled).toBe(false);
  });

  it('a template with NO live plates does not offer it at all', () => {
    // Not a permanently-disabled entry: thirty rows of dead furniture teach the
    // operator to stop reading the menu.
    const actions = layerRowActions(
      rowDeps({ binding: bindingFor(itemWith('on-air')), hasLivePlates: false }),
    );
    expect(actions.some((a) => a.key === 'swap-source')).toBe(false);
  });

  it('it is refused with the playout server unreachable — the swap emits a PLAY', () => {
    const actions = layerRowActions(
      rowDeps({
        binding: bindingFor(itemWith('on-air')),
        hasLivePlates: true,
        casparReach: 'unreachable',
      }),
    );
    expect(actions.find((a) => a.key === 'swap-source')?.disabled).toBe(true);
  });
});

describe('6.9 — the dialog names each plate’s assignment, and commits in ONE more action', () => {
  /*
    🔴 `CONSOLE-POLISH-01-A` (`B-306`) — THE PARAGRAPH IS GONE, AND ITS ABSENCE IS PINNED. It explained
    the layering in four lines ("This changes this row only, for this run. The template's own
    assignment and the installation's source list are left exactly as they are…"). An operator
    surface carries labels, values, state facts and refusals only (the owner's rule); the scope is in
    the title, and the assignment each plate returns to is named on its own line. This test asserted
    the paragraph's PRESENCE; it now asserts the absence, which is the direction the rule regresses in.
  */
  it('🔴 carries no explanatory paragraph — the scope is in the title, the assignment on each plate', async () => {
    await renderDialog(() => Promise.resolve({ ok: true }));
    const dialog = openDialog();
    const text = dialog?.textContent ?? '';
    expect(dialog?.querySelector('p')).toBeNull();
    expect(text).not.toMatch(/this row only|for this run|every other row|permanent configuration/i);
    expect(text).not.toMatch(/installation’s source list|installation's source list/i);
    // The facts that stayed: the scope, and the assignment a plate returns to.
    expect(text).toContain('Live source for this row');
    expect(text).toContain('Template assignment (Studio A)');
  });

  it('🔴 a plate is `Plate N`, its id on the label’s title and nowhere in the text (golden rule 11)', async () => {
    await renderDialog(() => Promise.resolve({ ok: true }));
    const dialog = openDialog();
    expect(dialog?.textContent).not.toContain('guest-1');
    const label = dialog?.querySelector<HTMLLabelElement>('[data-swap-plate="guest-1"] label');
    expect(label?.firstChild?.textContent).toBe('Plate 1');
    // RELOCATED, not deleted: an author correlates against it.
    expect(label?.getAttribute('title')).toBe('guest-1');
  });

  it('a plate with no assignment, or one naming a source not listed, says so in the shared words', async () => {
    await renderDialog(() => Promise.resolve({ ok: true }), {}, 1, { assignments: [] });
    expect(openDialog()?.querySelector('[data-swap-assigned]')?.textContent).toBe(
      'Template assignment (none set)',
    );
    act(() => root?.unmount());
    host?.remove();
    clearPortals();
    __resetSourcesForTest();
    await renderDialog(() => Promise.resolve({ ok: true }), {}, 1, {
      assignments: [{ templateId: 'tpl-1', plateId: 'guest-1', sourceId: 'src-gone' }],
    });
    const assigned = openDialog()?.querySelector('[data-swap-assigned]');
    expect(assigned?.textContent).toContain('Template assignment (Not listed)');
    expect(assigned?.textContent).toContain('Unavailable');
    // The unknown id is on the title, never in the text.
    expect(assigned?.textContent).not.toContain('src-gone');
    expect(assigned?.querySelector('[title="src-gone"]')).not.toBeNull();
  });

  /** `PLAYOUT-SOURCES-01` §2.A — the plate's picker field (the ONE source picker). */
  const field = (): HTMLElement => {
    const el = openDialog()?.querySelector<HTMLElement>('[data-picker-value]');
    if (el === null || el === undefined) throw new Error('no source picker in the swap dialog');
    return el;
  };

  it('shows the plate, its ASSIGNED source, and offers the sources', async () => {
    await renderDialog(() => Promise.resolve({ ok: true }));
    expect(openDialog()?.textContent).toContain('Plate 1');
    expect(openDialog()?.textContent).toContain('Studio A');
    const panel = await openPicker(field());
    // The call site's own choice is REVERT, not "no source".
    expect(panel.querySelector('[data-picker-choice=""]')?.textContent).toContain(
      'Use template assignment',
    );
    expect(
      [...panel.querySelectorAll('[data-picker-input]')].some((o) => o.textContent === 'Baku'),
    ).toBe(true);
  });

  it('🔴 the ASSIGNED source is the row’s own CHANNEL’s default (CHANNEL-SOURCES-01) — control: the other channel’s', async () => {
    const perChannel: SourceAssignments = {
      assignments: [
        { channel: 1, templateId: 'tpl-1', plateId: 'guest-1', sourceId: 'src-a' },
        { channel: 2, templateId: 'tpl-1', plateId: 'guest-1', sourceId: 'src-b' },
      ],
    };
    await renderDialog(() => Promise.resolve({ ok: true }), {}, 2, perChannel);
    expect(openDialog()?.textContent).toContain('Baku');
    expect(openDialog()?.textContent).not.toContain('Studio A');
    act(() => root?.unmount());
    host?.remove();
    clearPortals();
    __resetSourcesForTest();
    await renderDialog(() => Promise.resolve({ ok: true }), {}, 1, perChannel);
    expect(openDialog()?.textContent).toContain('Studio A');
    expect(openDialog()?.textContent).not.toContain('Baku');
  });

  it('🔴 choosing a source COMMITS immediately — there is no Apply step', async () => {
    const onSwap = vi.fn(() => Promise.resolve({ ok: true }));
    await renderDialog(onSwap);

    // Two actions total: open the row's swap, choose the source — pressing the field and an input
    // is the one "choose", exactly as the native select was. An Apply would be a third, and under
    // pressure a third action is one that does not happen.
    await choosePickerOption(field(), 'src-b');

    expect(onSwap).toHaveBeenCalledTimes(1);
    expect(onSwap).toHaveBeenCalledWith('guest-1', 'src-b');
  });

  it('the empty option reverts the plate — it sends null, not an empty id', async () => {
    const onSwap = vi.fn(() => Promise.resolve({ ok: true }));
    await renderDialog(onSwap, { sourceOverride: { 'guest-1': 'src-b' } });
    expect(pickerValue(field())).toBe('src-b');

    await choosePickerOption(field(), '');

    expect(onSwap).toHaveBeenCalledWith('guest-1', null);
  });

  it('a substituted plate SAYS SO — the row is not on its configured source', async () => {
    await renderDialog(() => Promise.resolve({ ok: true }), {
      sourceOverride: { 'guest-1': 'src-b' },
    });
    expect(openDialog()?.textContent).toContain('swapped for this row');
    // …and the ASSIGNED source is still named, so the operator can see what they
    // are departing from and what reverting would restore.
    expect(openDialog()?.textContent).toContain('Studio A');
  });

  it('🔴 a REFUSED swap is surfaced with the bridge’s own sentence', async () => {
    const message =
      'CasparCG refused the substitution, so plate "guest-1" is still on its previous source.';
    await renderDialog(() => Promise.resolve({ ok: false, message }));

    await choosePickerOption(field(), 'src-b');

    // The operator must be told the plate did NOT move. A silent refusal here
    // leaves them believing they patched around a dead feed when they did not.
    expect(openDialog()?.textContent).toContain('still on its previous source');
  });
});
