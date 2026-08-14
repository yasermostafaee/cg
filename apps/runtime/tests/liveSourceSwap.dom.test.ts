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
  layerRange: { start: 30, end: 39 },
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
): Promise<void> {
  initSources({
    sources: {
      config: () => Promise.resolve(CATALOG),
      assignments: () => Promise.resolve(ASSIGNMENTS),
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

describe('6.9 — the dialog states the layering, and commits in ONE more action', () => {
  it('says the change is to THIS ROW ONLY and does not write back', async () => {
    await renderDialog(() => Promise.resolve({ ok: true }));
    const text = openDialog()?.textContent ?? '';
    expect(text).toContain('this row only');
    // The two things it must not silently change, named.
    expect(text).toMatch(/assignment/i);
    expect(text).toMatch(/source list|installation/i);
    expect(text).toMatch(/every other row/i);
  });

  it('shows the plate, its ASSIGNED source, and offers the catalog', async () => {
    await renderDialog(() => Promise.resolve({ ok: true }));
    const select = openDialog()?.querySelector('select');
    expect(openDialog()?.textContent).toContain('guest-1');
    expect(openDialog()?.textContent).toContain('Studio A');
    const options = [...(select?.options ?? [])].map((o) => o.textContent ?? '');
    // The empty option is REVERT, not "no source".
    expect(options[0]).toContain('Use template assignment');
    expect(options.some((o) => o.includes('Baku'))).toBe(true);
  });

  it('🔴 choosing a source COMMITS immediately — there is no Apply step', async () => {
    const onSwap = vi.fn(() => Promise.resolve({ ok: true }));
    await renderDialog(onSwap);
    const select = openDialog()?.querySelector('select');

    act(() => {
      if (select !== null && select !== undefined) {
        select.value = 'src-b';
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });

    // Two actions total: open the dialog, choose the source. An Apply would be a
    // third, and under pressure a third action is one that does not happen.
    expect(onSwap).toHaveBeenCalledWith('guest-1', 'src-b');
  });

  it('the empty option reverts the plate — it sends null, not an empty id', async () => {
    const onSwap = vi.fn(() => Promise.resolve({ ok: true }));
    await renderDialog(onSwap, { sourceOverride: { 'guest-1': 'src-b' } });
    const select = openDialog()?.querySelector('select');
    expect(select?.value).toBe('src-b');

    act(() => {
      if (select !== null && select !== undefined) {
        select.value = '';
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });

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
    const select = openDialog()?.querySelector('select');

    await act(async () => {
      if (select !== null && select !== undefined) {
        select.value = 'src-b';
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
      await Promise.resolve();
    });

    // The operator must be told the plate did NOT move. A silent refusal here
    // leaves them believing they patched around a dead feed when they did not.
    expect(openDialog()?.textContent).toContain('still on its previous source');
  });
});
