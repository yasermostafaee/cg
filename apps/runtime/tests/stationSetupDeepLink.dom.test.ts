// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { StrictMode, createElement, type FunctionComponent } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ConnectionHealth } from '@cg/shared-ipc';
import { StatusBar } from '../src/renderer/features/status/StatusBar.js';
import { StationSetupDialog } from '../src/renderer/features/stationSetup/StationSetupDialog.js';
import { STATION_SETUP_SECTIONS } from '../src/renderer/features/stationSetup/sections.js';
import {
  __resetStationSetupForTest,
  closeStationSetup,
  openStationSetup,
  useStationSetupRequest,
} from '../src/renderer/features/stationSetup/stationSetupStore.js';
import { clearPortals, openDialog } from './support/dialog.js';
import {
  renderStationSetup,
  stationSetupStub,
  unmountStationSetup,
} from './support/stationSetup.js';

/**
 * `STATION-SETUP-02` §2 — **every old entry point is a DEEP LINK into one dialog, never a
 * second surface.**
 *
 * Five surfaces used to open five dialogs. They open one now, AT A SECTION: the status
 * bar's SERVERS and SOURCES, the Layers panel's Configure, the Inspector's delimiter gear.
 * What a deep link must do: open the dialog AND SELECT THAT TAB. A request that arrives
 * while the dialog is already open switches the tab rather than being swallowed by a boolean
 * that is already true.
 *
 * ⭐ `STATION-CHROME-01` §2 CHANGED WHAT "LANDING" MEANS, and this file is where it is
 * measured. With one long scroll a deep link had to MARK its section and scroll to it, and
 * the mark had to carry focus so the operator knew where he had been taken. With a rail the
 * requested section is the ONLY one rendered, so there is nothing to hunt for and nothing to
 * scroll: the tab's `aria-selected` IS the landing, and focus stays where the modal's own
 * trap put it — which keeps the number of things that move focus at one (`B-230`).
 */

let container: HTMLDivElement | null = null;
let root: Root | null = null;

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
  await unmountStationSetup();
  clearPortals();
  __resetStationSetupForTest();
  vi.restoreAllMocks();
});

async function settle(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });
}

/** What `App` does: read the store, render the dialog from it. */
function Host(): JSX.Element {
  const request = useStationSetupRequest();
  return createElement(StationSetupDialog, {
    open: request.open,
    section: request.section,
    requestId: request.requestId,
    onClose: closeStationSetup,
  });
}

async function mountHost(): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const r = root;
  await act(async () => {
    r.render(createElement(StrictMode, null, createElement(Host)));
  });
  await settle();
}

/** Which section the dialog is actually SHOWING — the one rendered pane. */
const shown = (dialog: HTMLElement | null): string | null =>
  dialog?.querySelector('[data-station-section]')?.getAttribute('data-station-section') ?? null;

/** Which rail tab reads as selected. Landing means BOTH agree. */
const selectedTab = (dialog: HTMLElement | null): string | null =>
  dialog
    ?.querySelector('[role="tab"][aria-selected="true"]')
    ?.getAttribute('id')
    ?.replace(/^station-/, '') ?? null;

describe('a deep link opens ONE dialog at the named section', () => {
  it('the RAIL carries every section, in the one declared order, and only the asked-for one renders', async () => {
    stationSetupStub();
    const dialog = await renderStationSetup({ section: 'delimiters' });
    // Every section is REACHABLE from every tab — the rail is what replaces the scroll's
    // "nothing is hidden" promise, and it has to be complete for that to hold.
    const railIds = [...dialog.querySelectorAll('[role="tab"]')].map((el) =>
      (el.getAttribute('id') ?? '').replace(/^station-/, ''),
    );
    expect(railIds).toEqual(STATION_SETUP_SECTIONS.map((s) => s.id));
    // …and exactly ONE section body is on screen: the one asked for.
    const bodies = [...dialog.querySelectorAll('[data-station-section]')].map((el) =>
      el.getAttribute('data-station-section'),
    );
    expect(bodies).toEqual(['delimiters']);
    // ONE dialog: nothing else with the dialog role is open beside it.
    expect(document.querySelectorAll('[role="dialog"]').length).toBe(1);
  });

  it('🔴 EVERY deep link lands on ITS TAB — the tab is selected AND its pane is the one rendered', async () => {
    stationSetupStub();
    // The three real deep links (SOURCES, the delimiters gear, Configure) plus the two the
    // rail can reach. Each is checked on BOTH halves, because a selected tab whose pane did
    // not follow is exactly the defect §2 predicted.
    for (const id of STATION_SETUP_SECTIONS.map((sec) => sec.id)) {
      const dialog = await renderStationSetup({ section: id });
      expect(selectedTab(dialog), `${id}: the rail did not select it`).toBe(id);
      expect(shown(dialog), `${id}: the pane did not follow the tab`).toBe(id);
      await unmountStationSetup();
    }
  });

  it('a bare "open settings" lands on CHANNEL — the tab that asks nothing of the operator', async () => {
    stationSetupStub();
    const dialog = await renderStationSetup();
    expect(selectedTab(dialog)).toBe('channel');
    expect(shown(dialog)).toBe('channel');
  });

  /**
   * 🔴 `STATION-CHROME-02` §1 — **ONE DOOR.** This spec used to assert that SETTINGS and
   * SOURCES both stood on the bar and opened the same dialog one tab apart. The owner's
   * decision is one entry point, so the assertion inverts: SETTINGS is there, SOURCES is
   * NOT, and the DEEP-LINK MECHANISM the removed button used is untouched (the next two
   * specs drive it from the store and from the two surfaces that still carry it).
   */
  it('the status bar has ONE settings door — SETTINGS, and no SOURCES beside it', async () => {
    const onOpenSettings = vi.fn();
    const health: ConnectionHealth = {
      primary: { label: 'A', state: 'healthy', amcpAxisOk: true },
      currentPrimary: 'A',
      strategy: 'mirror-sync',
    };
    const stub = {
      connections: {
        health: () => Promise.resolve(health),
        onHealthChanged: () => () => undefined,
        failover: () => Promise.resolve({ ok: false, newPrimary: 'A' as const }),
      },
      lock: {
        state: () => Promise.resolve({ engaged: false }),
        onStateChanged: () => () => undefined,
      },
      link: {
        status: () => 'live' as const,
        onStatusChanged: () => () => undefined,
        resyncing: () => false,
        onResyncingChanged: () => () => undefined,
      },
    };
    (window as unknown as { cg: typeof stub }).cg = stub;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    const r = root;
    // `StatusBar` declares its props with a default (`Props = {}`), which makes React's
    // `createElement` overloads resolve to the props-less form; name the props type here.
    const Bar = StatusBar as FunctionComponent<{
      onOpenSettings?: () => void;
    }>;
    await act(async () => {
      r.render(createElement(StrictMode, null, createElement(Bar, { onOpenSettings })));
    });
    await settle();
    const settings = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Open Station setup"]',
    );
    /*
      ⭐ `STATION-CHROME-01` §2 — RENAMED from SERVERS, and the rename is a correction. This
      button opens the dialog at its DEFAULT tab, which is Channel now, so "SERVERS" would
      name a section the press does not land on.
    */
    expect(settings?.textContent).toBe('SETTINGS');
    await act(async () => {
      settings?.click();
    });
    expect(onOpenSettings).toHaveBeenCalledTimes(1);

    // §1 — and nothing else on this bar opens the settings dialog. Asserted on BOTH the
    // accessible name and the visible word, because either could have survived the other.
    expect(
      container.querySelector('button[aria-label="Open Station setup at Live sources"]'),
    ).toBeNull();
    expect([...container.querySelectorAll('button')].map((b) => b.textContent)).not.toContain(
      'SOURCES',
    );

    // …and `App` wires the one prop to the store's deep link, taking the DEFAULT (Channel)
    // rather than naming a section — §2's "Settings opens on Channel". The `onOpenSources`
    // wiring is gone with the button; the STORE's deep link is not (next spec).
    const app = readFileSync(join(process.cwd(), 'src', 'renderer', 'App.tsx'), 'utf8');
    expect(app).toContain('onOpenSettings={() => openStationSetup()}');
    // Matched on the PROP being passed, not on the word: `App`'s own comment names the prop
    // it dropped, and a guard that forbade the name would forbid the explanation.
    expect(app).not.toContain('onOpenSources={');
  });

  it('the store: a request opens the dialog at its section; a repeat while open MOVES the mark; close closes', async () => {
    stationSetupStub();
    await mountHost();
    expect(openDialog()).toBeNull();

    await act(async () => {
      openStationSetup('candidate-layers');
    });
    await settle();
    expect(selectedTab(openDialog())).toBe('candidate-layers');
    expect(shown(openDialog())).toBe('candidate-layers');

    // SOURCES pressed while the dialog sits at Layers: a new request, not a no-op. This is
    // the case `requestId` exists for — the section prop alone would be a re-render with a
    // value the dialog's own tab state already overrode.
    await act(async () => {
      openStationSetup('sources');
    });
    await settle();
    expect(document.querySelectorAll('[role="dialog"]').length).toBe(1);
    expect(selectedTab(openDialog())).toBe('sources');
    expect(shown(openDialog())).toBe('sources');

    await act(async () => {
      closeStationSetup();
    });
    await settle();
    expect(openDialog()).toBeNull();
  });

  /**
   * §1 — **WHAT STILL DEEP-LINKS, AND WHY THOSE TWO AND NOT THE THIRD.**
   *
   * The mechanism is kept and only the duplicate BUTTONS went. What survives are the two
   * entry points that sit BESIDE the thing they configure, where a bar button could not:
   *
   *   · the Inspector's delimiter gear — discovered at the moment a from-file field needs a
   *     delimiter that does not exist yet;
   *   · the Layers panel's EMPTY STATE — a list with no declared bank cannot explain itself,
   *     so that screen must carry its own way to the explanation.
   *
   * The Layers panel's bar button (`Configure`) was neither: it stood beside thirty
   * populated rows offering a door the status bar already had.
   */
  it('the delimiter gear and the empty Layers list still deep-link; Configure is gone', () => {
    const renderer = join(process.cwd(), 'src', 'renderer');
    const layers = readFileSync(join(renderer, 'features', 'layers', 'LayersPanel.tsx'), 'utf8');
    expect(layers).toContain("openStationSetup('candidate-layers')");
    expect(layers).not.toMatch(/FixedBankConfigModal|configOpen/);
    // §1 — the bar button is gone, and so is the sentence that named it. A stale sentence
    // pointing at a removed control is the rule-9 failure this sweep exists to catch.
    expect(layers, 'the Layers panel bar must not offer a second settings door').not.toContain(
      '>\n            Configure\n          </Button>',
    );
    expect(layers).not.toMatch(/<strong>Configure<\/strong>/);
    expect(layers, 'the empty state names where the section actually is').toContain(
      'SETTINGS ▸ Layers',
    );

    const fromFile = readFileSync(
      join(renderer, 'features', 'inspector', 'FromFileControl.tsx'),
      'utf8',
    );
    expect(fromFile).toContain("openStationSetup('delimiters')");
    expect(fromFile).not.toMatch(/DelimitersModal|managing/);
  });
});
