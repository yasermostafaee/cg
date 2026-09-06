import { StrictMode, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { vi, type Mock } from 'vitest';
import type {
  ChannelSettingsState,
  ConnectionConfig,
  ConnectionHealth,
  FixedLayerBank,
  FixedSlotState,
  LiveLayerState,
  PlayoutLayerState,
  SourceAssignments,
  SourceCatalog,
  TemplateInfo,
} from '@cg/shared-ipc';
import type { StackItemState } from '@cg/shared-schema';
import { StationSetupDialog } from '../../src/renderer/features/stationSetup/StationSetupDialog.js';
import {
  DEFAULT_STATION_SETUP_SECTION,
  type StationSetupSection,
} from '../../src/renderer/features/stationSetup/sections.js';
import { openDialog } from './dialog.js';

/**
 * `STATION-SETUP-02` — ONE bridge stub for the ONE settings dialog.
 *
 * Any section of Station setup may be the one on screen, so every dom spec that drives ANY
 * section needs the whole dialog's bridge surface: connections, the stack, the link, the
 * fixed bank, the raster, sources, delimiters and templates. Ten specs each hand-rolling that
 * surface is how two of them come to stub the same channel differently; this is the one place
 * it is written down, with every part overridable.
 *
 * ⭐ `STATION-CHROME-01` §2 — the dialog is TABBED now, so only ONE section is mounted at a
 * time. A spec therefore says which tab it is about, either by opening at it
 * (`renderStationSetup({ section })`) or by pressing its rail tab (`selectSetupTab`).
 * `sectionOf` looks only at what is on screen, deliberately: a helper that could find a
 * section the operator cannot see would let a spec assert something no operator can reach.
 *
 * The defaults are a QUIET station: nothing on air, one declared channel at the reference
 * raster whose server reading agrees, a two-row bank with nothing bound, no sources, the
 * shipped delimiters. A spec states only what it is about.
 */

export const SETUP_CONFIG: ConnectionConfig = {
  servers: { A: { host: '127.0.0.1', amcpPort: 5250, oscPort: 6250 } },
  strategy: 'mirror-sync',
  autoFailoverEnabled: true,
};

export const SETUP_SERVE_INFO = {
  serveHost: '127.0.0.1',
  port: 0,
  exposed: false,
  unreachable: [] as string[],
  flagOverrides: {} as { serveHost?: string; port?: number },
  candidates: [] as string[],
};

export const SETUP_BANK: FixedLayerBank = {
  channel: 1,
  low: { start: 1, count: 9 },
  start: 70,
  count: 2,
  aliases: { '70': 'CLOCK' },
};

export function setupSlot(
  layer: number,
  binding: FixedSlotState['binding'] = null,
): FixedSlotState {
  return { channel: 1, layer, observed: { kind: 'unknown' }, binding };
}

export const SETUP_RASTER: ChannelSettingsState = {
  settings: [{ channel: 1, raster: { width: 1920, height: 1080 } }],
  observed: [{ channel: 1, mode: '1080p5000', raster: { width: 1920, height: 1080 } }],
};

export interface StationSetupStubOptions {
  items?: readonly StackItemState[];
  config?: ConnectionConfig;
  serveInfo?: typeof SETUP_SERVE_INFO;
  health?: ConnectionHealth | null;
  setConfigResult?: {
    ok: boolean;
    reason?: 'on-air-block';
    message?: string;
    templateServe?: { serveHost: string; port: number; exposed: boolean; unreachable?: string[] };
  };
  bank?: FixedLayerBank | null;
  slots?: FixedSlotState[];
  fixedSetConfigResult?: { ok: boolean; reason?: string; message?: string };
  raster?: ChannelSettingsState;
  rasterSetResult?: { ok: boolean; reason?: string; message?: string };
  stationLayers?: PlayoutLayerState[];
  liveLayers?: LiveLayerState[];
  catalog?: SourceCatalog;
  /** Replaces the default `setConfig` for sources — e.g. to run the real validator. */
  sourcesSetConfig?: (next: SourceCatalog) => Promise<{
    ok: boolean;
    reason?: string;
    message?: string;
    droppedAssignments?: unknown[];
  }>;
  assignments?: SourceAssignments;
  templates?: readonly TemplateInfo[];
  delimitersSetResult?: { ok: boolean; message?: string };
}

export interface StationSetupStub {
  setConfig: Mock;
  fixedSetConfig: Mock;
  rasterSet: Mock;
  sourcesSetConfig: Mock;
  sourcesSetAssignments: Mock;
  delimitersSet: Mock;
  remove: Mock;
}

export function stationSetupStub(options: StationSetupStubOptions = {}): StationSetupStub {
  const setConfig = vi.fn(() => Promise.resolve(options.setConfigResult ?? { ok: true }));
  const fixedSetConfig = vi.fn(() => Promise.resolve(options.fixedSetConfigResult ?? { ok: true }));
  const rasterSet = vi.fn(() => Promise.resolve(options.rasterSetResult ?? { ok: true }));
  const sourcesSetConfig = vi.fn(options.sourcesSetConfig ?? (() => Promise.resolve({ ok: true })));
  const sourcesSetAssignments = vi.fn(() => Promise.resolve({ ok: true }));
  const delimitersSet = vi.fn(() => Promise.resolve(options.delimitersSetResult ?? { ok: true }));
  const remove = vi.fn(() => Promise.resolve({ accepted: true }));
  const stub = {
    link: {
      status: () => 'live' as const,
      onStatusChanged: () => () => undefined,
      resyncing: () => false,
      onResyncingChanged: () => () => undefined,
    },
    connections: {
      config: () => Promise.resolve(options.config ?? SETUP_CONFIG),
      onConfigChanged: () => () => undefined,
      setConfig,
      templateServe: () => Promise.resolve(options.serveInfo ?? SETUP_SERVE_INFO),
      health: () => Promise.resolve(options.health ?? null),
      onHealthChanged: () => () => undefined,
    },
    stack: {
      snapshot: () => Promise.resolve(options.items ?? []),
      onStateChanged: () => () => undefined,
      remove,
    },
    fixedLayers: {
      config: () => Promise.resolve(options.bank === undefined ? SETUP_BANK : options.bank),
      onConfigChanged: () => () => undefined,
      state: () => Promise.resolve(options.slots ?? [setupSlot(70), setupSlot(71)]),
      onStateChanged: () => () => undefined,
      setConfig: fixedSetConfig,
    },
    channelSettings: {
      get: () => Promise.resolve(options.raster ?? SETUP_RASTER),
      onChanged: () => () => undefined,
      set: rasterSet,
    },
    playoutLayers: {
      state: () => Promise.resolve(options.stationLayers ?? []),
      onStateChanged: () => () => undefined,
    },
    liveLayers: {
      state: () => Promise.resolve(options.liveLayers ?? []),
      onStateChanged: () => () => undefined,
    },
    sources: {
      config: () => Promise.resolve(options.catalog ?? { sources: [] }),
      onConfigChanged: () => () => undefined,
      setConfig: sourcesSetConfig,
      assignments: () => Promise.resolve(options.assignments ?? { assignments: [] }),
      onAssignmentsChanged: () => () => undefined,
      setAssignments: sourcesSetAssignments,
    },
    delimiters: {
      list: () => Promise.resolve([]),
      onChanged: () => () => undefined,
      set: delimitersSet,
    },
    templates: {
      list: () => Promise.resolve(options.templates ?? []),
      get: () => Promise.resolve(null),
      onChanged: () => () => undefined,
    },
  };
  (window as unknown as { cg: typeof stub }).cg = stub;
  return {
    setConfig,
    fixedSetConfig,
    rasterSet,
    sourcesSetConfig,
    sourcesSetAssignments,
    delimitersSet,
    remove,
  };
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;

/** Let the dialog's pulls resolve and its effects settle. */
export async function settleSetup(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });
}

/**
 * Render Station setup open at `section` and hand back the DIALOG element (it portals to
 * `document.body`). The stub must already be installed.
 */
export async function renderStationSetup(
  options: { section?: StationSetupSection; onClose?: () => void; requestId?: number } = {},
): Promise<HTMLElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const r = root;
  await act(async () => {
    r.render(
      createElement(
        StrictMode,
        null,
        createElement(StationSetupDialog, {
          open: true,
          section: options.section ?? DEFAULT_STATION_SETUP_SECTION,
          requestId: options.requestId ?? 1,
          onClose: options.onClose ?? ((): void => undefined),
        }),
      ),
    );
    await Promise.resolve();
    await Promise.resolve();
  });
  await settleSetup();
  const dialog = openDialog();
  if (dialog === null) throw new Error('Station setup did not open');
  return dialog;
}

/** Unmount and drop the portal, for `afterEach`. */
export async function unmountStationSetup(): Promise<void> {
  if (root !== null) {
    const r = root;
    await act(async () => {
      r.unmount();
    });
  }
  root = null;
  container?.remove();
  container = null;
}

/**
 * The section element for `id`, scoped to the dialog — and only if that tab is SHOWING.
 *
 * The error names the remedy because the failure is otherwise puzzling: the section exists in
 * the rail, it is simply not the mounted one.
 */
export function sectionOf(dialog: HTMLElement, id: StationSetupSection): HTMLElement {
  const el = dialog.querySelector<HTMLElement>(`[data-station-section="${id}"]`);
  if (el === null) {
    const showing =
      dialog.querySelector('[data-station-section]')?.getAttribute('data-station-section') ??
      '(none)';
    throw new Error(
      `Station setup is showing "${showing}", not "${id}" — open at it or call selectSetupTab()`,
    );
  }
  return el;
}

/** Press a rail tab and let the pane settle. */
export async function selectSetupTab(
  dialog: HTMLElement,
  id: StationSetupSection,
): Promise<HTMLElement> {
  const tab = dialog.querySelector<HTMLButtonElement>(`[role="tab"]#station-${id}`);
  if (tab === null) throw new Error(`no "${id}" tab in the Station setup rail`);
  await act(async () => {
    tab.click();
    await Promise.resolve();
  });
  await settleSetup();
  return sectionOf(dialog, id);
}

/** The rail tab element for `id` — for asserting its selected state or its status dot. */
export function tabOf(dialog: HTMLElement, id: StationSetupSection): HTMLButtonElement {
  const tab = dialog.querySelector<HTMLButtonElement>(`[role="tab"]#station-${id}`);
  if (tab === null) throw new Error(`no "${id}" tab in the Station setup rail`);
  return tab;
}

/** Click a button anywhere in the dialog by its exact visible label. */
export async function clickSetupButton(dialog: HTMLElement, label: string): Promise<void> {
  const button = [...dialog.querySelectorAll('button')].find((b) => b.textContent === label);
  if (button === undefined) throw new Error(`no “${label}” button in Station setup`);
  await act(async () => {
    button.click();
    await Promise.resolve();
  });
  await settleSetup();
}

/** Simulate typing/pasting: fires `input` with the input's full value. */
export async function setSetupInput(
  dialog: HTMLElement,
  ariaLabel: string,
  value: string,
): Promise<void> {
  const input = dialog.querySelector<HTMLInputElement>(`input[aria-label="${ariaLabel}"]`);
  if (input === null) throw new Error(`input "${ariaLabel}" not rendered`);
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  await act(async () => {
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await settleSetup();
}
