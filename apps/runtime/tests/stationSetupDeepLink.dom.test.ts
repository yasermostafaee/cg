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
 * What a deep link must do: open the dialog, mark the requested section, and put FOCUS on
 * it — through the modal's own trap (`data-modal-autofocus`), not a second focus mover
 * (`B-230`). A request that arrives while the dialog is already open moves to the new
 * section rather than being swallowed by a boolean that is already true.
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

const requested = (dialog: HTMLElement | null): string | null =>
  dialog?.querySelector('[data-station-section-requested]')?.getAttribute('data-station-section') ??
  null;

describe('a deep link opens ONE dialog at the named section', () => {
  it('renders every section, in the one declared order, whichever was asked for', async () => {
    stationSetupStub();
    const dialog = await renderStationSetup({ section: 'delimiters' });
    const ids = [...dialog.querySelectorAll('[data-station-section]')].map((el) =>
      el.getAttribute('data-station-section'),
    );
    expect(ids).toEqual(STATION_SETUP_SECTIONS.map((s) => s.id));
    // ONE dialog: nothing else with the dialog role is open beside it.
    expect(document.querySelectorAll('[role="dialog"]').length).toBe(1);
  });

  it('the requested section is marked, and holds FOCUS through the modal’s trap', async () => {
    stationSetupStub();
    const dialog = await renderStationSetup({ section: 'sources' });
    expect(requested(dialog)).toBe('sources');
    const section = dialog.querySelector<HTMLElement>('[data-station-section="sources"]');
    expect(section?.hasAttribute('data-modal-autofocus')).toBe(true);
    expect(document.activeElement).toBe(section);
  });

  it('SOURCES on the status bar lands on Live sources; SERVERS on Servers — the same dialog both times', async () => {
    const onOpenSettings = vi.fn();
    const onOpenSources = vi.fn();
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
      onOpenSources?: () => void;
    }>;
    await act(async () => {
      r.render(
        createElement(StrictMode, null, createElement(Bar, { onOpenSettings, onOpenSources })),
      );
    });
    await settle();
    const sources = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Open Station setup at Live sources"]',
    );
    const servers = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Open Station setup at Servers"]',
    );
    expect(sources?.textContent).toBe('SOURCES');
    expect(servers?.textContent).toBe('SERVERS');
    await act(async () => {
      sources?.click();
    });
    expect(onOpenSources).toHaveBeenCalledTimes(1);
    await act(async () => {
      servers?.click();
    });
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
    // …and `App` wires those two props to the store's deep links.
    const app = readFileSync(join(process.cwd(), 'src', 'renderer', 'App.tsx'), 'utf8');
    expect(app).toContain("onOpenSettings={() => openStationSetup('servers')}");
    expect(app).toContain("onOpenSources={() => openStationSetup('sources')}");
  });

  it('the store: a request opens the dialog at its section; a repeat while open MOVES the mark; close closes', async () => {
    stationSetupStub();
    await mountHost();
    expect(openDialog()).toBeNull();

    await act(async () => {
      openStationSetup('candidate-layers');
    });
    await settle();
    expect(requested(openDialog())).toBe('candidate-layers');
    expect(document.activeElement?.getAttribute('data-station-section')).toBe('candidate-layers');

    // SOURCES pressed while the dialog sits at Candidate layers: a new request, not a no-op.
    await act(async () => {
      openStationSetup('sources');
    });
    await settle();
    expect(document.querySelectorAll('[role="dialog"]').length).toBe(1);
    expect(requested(openDialog())).toBe('sources');
    expect(document.activeElement?.getAttribute('data-station-section')).toBe('sources');

    await act(async () => {
      closeStationSetup();
    });
    await settle();
    expect(openDialog()).toBeNull();
  });

  it('the Layers panel’s Configure and the Inspector’s delimiter gear deep-link, and render no dialog of their own', () => {
    const renderer = join(process.cwd(), 'src', 'renderer');
    const layers = readFileSync(join(renderer, 'features', 'layers', 'LayersPanel.tsx'), 'utf8');
    expect(layers).toContain("openStationSetup('candidate-layers')");
    expect(layers).not.toMatch(/FixedBankConfigModal|configOpen/);
    const fromFile = readFileSync(
      join(renderer, 'features', 'inspector', 'FromFileControl.tsx'),
      'utf8',
    );
    expect(fromFile).toContain("openStationSetup('delimiters')");
    expect(fromFile).not.toMatch(/DelimitersModal|managing/);
  });
});
