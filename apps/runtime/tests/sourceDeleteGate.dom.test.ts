// @vitest-environment jsdom
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SourceAssignments, SourceCatalog, TemplateInfo } from '@cg/shared-ipc';
import { clearPortals } from './support/dialog.js';
import {
  __resetSourcesForTest,
  initSources,
} from '../src/renderer/features/sources/sourceStore.js';
import {
  renderStationSetup,
  sectionOf,
  settleSetup,
  stationSetupStub,
  unmountStationSetup,
} from './support/stationSetup.js';

/**
 * 🔴 `B-237` — **A BOUND SOURCE WAS DELETED BY ONE PRESS, WITH NO QUESTION.**
 *
 * ── WHAT THIS IS NOT ────────────────────────────────────────────────────────
 *
 * It is not a refusal, and the first design for it was one. Deleting a bound source is
 * ALLOWED by written decision (`@cg/shared-ipc`'s `sources.ts`: _"an installation must be
 * able to retire a live"_), the deletion CASCADES rather than dangling, and — the fact that
 * settles it — **the cascade takes nothing off air**: level 2 is frozen at take, so what is up
 * stays up and only the next take refuses, with `live-source-unassigned`.
 *
 * So `R-017` does not apply here. The gap is that a destructive act with fallout across every
 * template in the station was never ASKED, and reported itself only afterwards.
 *
 * ── THE THREE CASES ─────────────────────────────────────────────────────────
 *
 *   1. bound to nothing            → a plain confirmation. Still destructive.
 *   2. bound to one or more plates → a confirmation NAMING them, with the count, and with
 *                                    HOW MANY BOXES a multi-box template binds.
 *   3. EDIT of a bound source      → the same question, because re-pointing a bound source
 *                                    silently redefines what every plate on it shows and
 *                                    removes nothing, so the post-hoc notice never fired.
 *
 * ⚠ **RED-FIRST, AND THE ORDER IS RECORDED HONESTLY.** Unlike `B-238`/`B-239`/`B-240`, whose
 * specs were written and watched fail before a line was changed, this file was written AFTER
 * `SourcesSection`'s guard. Its redness was therefore proved by reverting that one file and
 * re-running: **4 failed / 3 passed** — the four being every assertion that a question is
 * asked, and the three survivors the two controls plus "only on agreement does the catalogue
 * change", which passes weakly without a gate because the ungated delete also changes it.
 * That last one is the reason the DECLINE case is a separate spec: it is the only one that
 * cannot pass without a gate.
 */

afterEach(async () => {
  await unmountStationSetup();
  clearPortals();
  document.body.innerHTML = '';
  __resetSourcesForTest();
  vi.restoreAllMocks();
});

const CATALOG: SourceCatalog = {
  sources: [
    { id: 'src-a', name: 'Studio A', producer: { kind: 'decklink', device: 1 } },
    { id: 'src-b', name: 'Baku', producer: { kind: 'ndi', source: 'CG-INGEST' } },
  ],
};

/** A four-box template that binds `src-a` THREE times — §1's multi-box case. */
const ASSIGNMENTS: SourceAssignments = {
  assignments: [
    { templateId: 'tpl-debate', plateId: 'guest-1', sourceId: 'src-a' },
    { templateId: 'tpl-debate', plateId: 'guest-2', sourceId: 'src-a' },
    { templateId: 'tpl-debate', plateId: 'guest-3', sourceId: 'src-a' },
    { templateId: 'tpl-news', plateId: 'wide', sourceId: 'src-a' },
  ],
};

const TEMPLATES: readonly TemplateInfo[] = [
  { templateId: 'tpl-debate', name: 'Debate — 4 box' } as unknown as TemplateInfo,
  { templateId: 'tpl-news', name: 'News Composite' } as unknown as TemplateInfo,
];

async function open(
  options: { catalog?: SourceCatalog; assignments?: SourceAssignments } = {},
): Promise<{ dialog: HTMLElement; stub: ReturnType<typeof stationSetupStub> }> {
  const stub = stationSetupStub({
    catalog: options.catalog ?? CATALOG,
    assignments: options.assignments ?? ASSIGNMENTS,
    templates: TEMPLATES,
  });
  /*
    The SECTION reads the STORE, not the bridge — so the store has to be pulled through the
    stub, exactly as the app shell pulls it once at boot. Without this the catalogue renders
    empty and every assertion below fails on a missing button rather than on the guard.
  */
  __resetSourcesForTest();
  await act(async () => {
    initSources(window.cg as unknown as Parameters<typeof initSources>[0]);
    await Promise.resolve();
  });
  const dialog = await renderStationSetup({ section: 'sources' });
  await settleSetup();
  return { dialog, stub };
}

/** The confirm gate, which is the LAST portalled dialog when it is open. */
function gate(): HTMLElement | undefined {
  const all = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')];
  return all.length < 2 ? undefined : all[all.length - 1];
}

async function press(scope: HTMLElement, label: string): Promise<void> {
  const button = scope.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  if (button === null) throw new Error(`no button named “${label}”`);
  await act(async () => {
    button.click();
    await Promise.resolve();
  });
  await settleSetup();
}

describe('B-237 — deleting a source ASKS, and names what goes with it', () => {
  it('🔴 a BOUND source: the question names every template, and how many BOXES', async () => {
    const { dialog, stub } = await open();
    await press(sectionOf(dialog, 'sources'), 'Remove Studio A');

    const confirm = gate();
    expect(confirm, 'one press must not delete a bound source').toBeDefined();
    expect(confirm?.textContent).toContain('Studio A');
    // FOUR plates across TWO templates — and the four-box template says so, because
    // "used by 2 templates" understates what leaves the screen by a factor of three.
    expect(confirm?.textContent).toContain('4 plates');
    expect(confirm?.textContent).toContain('2 templates');
    expect(confirm?.textContent).toContain('Debate — 4 box (3 boxes)');
    expect(confirm?.textContent).toContain('News Composite');
    // …and it says what actually happens, which is NOT that anything comes off air.
    expect(confirm?.textContent).toContain('already on air stays up');

    // NOTHING is sent while the question stands.
    expect(stub.sourcesSetConfig).not.toHaveBeenCalled();
  });

  it('🔴 …and only on agreement does the catalogue change', async () => {
    const { dialog, stub } = await open();
    await press(sectionOf(dialog, 'sources'), 'Remove Studio A');
    const go = [...(gate()?.querySelectorAll('button') ?? [])].find(
      // SETTINGS-MATCH-02 §8d — the verb NAMES THE ACT and matches the row's own button:
      // Remove source, not Delete source. One word for one act across the family.
      (b) => b.textContent === 'Remove source',
    );
    await act(async () => {
      go?.click();
      await Promise.resolve();
    });
    await settleSetup();
    expect(stub.sourcesSetConfig).toHaveBeenCalledTimes(1);
    const sent = stub.sourcesSetConfig.mock.calls[0]?.[0] as SourceCatalog;
    expect(sent.sources.map((s) => s.id)).toEqual(['src-b']);
  });

  it('🔴 declining sends nothing at all', async () => {
    const { dialog, stub } = await open();
    await press(sectionOf(dialog, 'sources'), 'Remove Studio A');
    const cancel = [...(gate()?.querySelectorAll('button') ?? [])].find(
      (b) => b.textContent === 'Cancel',
    );
    await act(async () => {
      cancel?.click();
      await Promise.resolve();
    });
    await settleSetup();
    expect(stub.sourcesSetConfig).not.toHaveBeenCalled();
  });

  it('🔴 an UNBOUND source still asks — it is destructive either way', async () => {
    const { dialog, stub } = await open({ assignments: { assignments: [] } });
    await press(sectionOf(dialog, 'sources'), 'Remove Studio A');
    const confirm = gate();
    expect(confirm, 'everything else destructive in this app asks').toBeDefined();
    expect(confirm?.textContent).toContain('Nothing is bound to it');
    expect(stub.sourcesSetConfig).not.toHaveBeenCalled();
  });

  it('🔴 EDIT of a BOUND source asks too — it removes nothing, so nothing announced it', async () => {
    /*
      P1, and it is the worse of the two: a delete at least reported itself afterwards through
      `describeDropped`. An edit removes nothing, so that notice never fired, while re-pointing
      the device index silently changed what four plates were showing.
    */
    const { dialog, stub } = await open();
    await press(sectionOf(dialog, 'sources'), 'Edit Studio A');
    const sub = gate();
    expect(sub?.textContent).toContain('Edit live source');
    const save = [...(sub?.querySelectorAll('button') ?? [])].find(
      (b) => b.textContent === 'Save source',
    );
    await act(async () => {
      save?.click();
      await Promise.resolve();
    });
    await settleSetup();

    const confirm = gate();
    expect(confirm?.textContent, 'a bound source may not be re-pointed silently').toContain(
      'while it is in use',
    );
    expect(confirm?.textContent).toContain('Debate — 4 box (3 boxes)');
    expect(stub.sourcesSetConfig).not.toHaveBeenCalled();
  });

  it('POSITIVE CONTROL: editing an UNBOUND source does not ask', async () => {
    /*
      Without this, "Edit asks" could be satisfied by a dialog that asks on every edit — and a
      question an operator meets for nothing is one he learns to click through, which is how a
      real question stops working.
    */
    const { dialog, stub } = await open({ assignments: { assignments: [] } });
    await press(sectionOf(dialog, 'sources'), 'Edit Studio A');
    const save = [...(gate()?.querySelectorAll('button') ?? [])].find(
      // §8b — Save source, never a bare Save: the primary's verb names the act.
      (b) => b.textContent === 'Save source',
    );
    await act(async () => {
      save?.click();
      await Promise.resolve();
    });
    await settleSetup();
    expect(stub.sourcesSetConfig).toHaveBeenCalledTimes(1);
  });

  it('POSITIVE CONTROL: ADDING a source does not ask', async () => {
    const { dialog, stub } = await open();
    await press(sectionOf(dialog, 'sources'), 'Add live source');
    const sub = gate();
    const name = sub?.querySelector<HTMLInputElement>('input[aria-label="Source name"]');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    await act(async () => {
      setter?.call(name, 'Studio C');
      name?.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const add = [...(sub?.querySelectorAll('button') ?? [])].find(
      (b) => b.textContent === 'Add source',
    );
    await act(async () => {
      add?.click();
      await Promise.resolve();
    });
    await settleSetup();
    expect(stub.sourcesSetConfig).toHaveBeenCalledTimes(1);
  });
});
