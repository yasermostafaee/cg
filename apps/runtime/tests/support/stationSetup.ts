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
  StationStray,
  TemplateInfo,
} from '@cg/shared-ipc';
import type { StackItemState } from '@cg/shared-schema';
import type { AuthSessionState } from '../../src/shared/runtime-bridge.js';
import { authStub, setupStub } from './authStub.js';
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
  low: { start: 50, count: 9 },
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
  /** `C-038` — who is signed in. Default: auth OFF, the byte-identical baseline. */
  readonly auth?: AuthSessionState;
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
  /**
   * `MULTI-CHANNEL-01` — the station's banks, when a spec declares more than one. Absent, the
   * station's banks are `[bank]` (or `[]` for a `null` bank): the one bank the spec states.
   */
  banks?: readonly FixedLayerBank[];
  slots?: FixedSlotState[];
  fixedSetConfigResult?: { ok: boolean; reason?: string; message?: string };
  /** `MULTI-CHANNEL-01` — what `fixedLayers.set-banks` resolves with. */
  fixedSetBanksResult?: { ok: boolean; reason?: string; message?: string };
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
  /**
   * `B-238` — what `stack.remove` RESOLVES with. It resolves a refusal rather than throwing
   * (`{ accepted: false, errorCode: 'on-air' }`, measured against the real mock), and a
   * spec that cannot say so cannot test the case where the refusal arrives anyway.
   */
  removeResult?: { accepted: boolean; errorCode?: string; message?: string };
  /** `DESKTOP-APPS-01-D` j — items of ours on a channel this station does not declare. */
  strays?: readonly StationStray[];
  takeOffAirResult?: { ok: boolean; message?: string };
}

export interface StationSetupStub {
  setConfig: Mock;
  fixedSetConfig: Mock;
  /** `MULTI-CHANNEL-01` — the plural door's mock. */
  fixedSetBanks: Mock;
  rasterSet: Mock;
  sourcesSetConfig: Mock;
  sourcesSetAssignments: Mock;
  delimitersSet: Mock;
  remove: Mock;
  takeOffAir: Mock;
}

export function stationSetupStub(options: StationSetupStubOptions = {}): StationSetupStub {
  const setConfig = vi.fn(() => Promise.resolve(options.setConfigResult ?? { ok: true }));
  const fixedSetConfig = vi.fn(() => Promise.resolve(options.fixedSetConfigResult ?? { ok: true }));
  const fixedSetBanks = vi.fn(() => Promise.resolve(options.fixedSetBanksResult ?? { ok: true }));
  const bank = options.bank === undefined ? SETUP_BANK : options.bank;
  const banks: readonly FixedLayerBank[] = options.banks ?? (bank === null ? [] : [bank]);
  const rasterSet = vi.fn(() => Promise.resolve(options.rasterSetResult ?? { ok: true }));
  const sourcesSetConfig = vi.fn(options.sourcesSetConfig ?? (() => Promise.resolve({ ok: true })));
  const sourcesSetAssignments = vi.fn(() => Promise.resolve({ ok: true }));
  const delimitersSet = vi.fn(() => Promise.resolve(options.delimitersSetResult ?? { ok: true }));
  const remove = vi.fn(() => Promise.resolve(options.removeResult ?? { accepted: true }));
  const takeOffAir = vi.fn(() => Promise.resolve(options.takeOffAirResult ?? { ok: true }));
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
      config: () =>
        Promise.resolve(options.banks !== undefined ? (options.banks[0] ?? null) : bank),
      onConfigChanged: () => () => undefined,
      // `MULTI-CHANNEL-01` — the station's banks, which the console reads for every channel.
      banks: () => Promise.resolve([...banks]),
      onBanksChanged: () => () => undefined,
      setBanks: fixedSetBanks,
      state: () => Promise.resolve(options.slots ?? [setupSlot(70), setupSlot(71)]),
      onStateChanged: () => () => undefined,
      setConfig: fixedSetConfig,
    },
    channelSettings: {
      get: () => Promise.resolve(options.raster ?? SETUP_RASTER),
      onChanged: () => () => undefined,
      set: rasterSet,
    },
    // `R-062` gap 2 — the discovery answer. Empty: the channel list falls back to the bank and
    // settings above, which is what every spec written against this stub measures.
    stationChannels: {
      list: () => Promise.resolve({ channels: [] }),
      onChanged: () => () => undefined,
    },
    playoutLayers: {
      state: () => Promise.resolve(options.stationLayers ?? []),
      onStateChanged: () => () => undefined,
    },
    liveLayers: {
      state: () => Promise.resolve(options.liveLayers ?? []),
      onStateChanged: () => () => undefined,
      // `B-247` — the release reason. Never fired here; the subscription must exist.
      onPlateReleased: () => () => undefined,
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
    // `C-038` — the channel list is scoped to the principal, so every stub needs one.
    auth: authStub(options.auth),
    // `DESKTOP-APPS-01` — Servers carries the Playout card and its connection check.
    setup: setupStub(),
    // `DESKTOP-APPS-01-D` j — the strays Station setup shows to a station-admin.
    strays: {
      list: () => Promise.resolve(options.strays ?? []),
      onChanged: () => () => undefined,
      takeOffAir,
    },
    // `B-257` — the channel strip reads how much of the console a lock covers.
    lock: {
      state: () => Promise.resolve({ engaged: false }),
      onStateChanged: () => () => undefined,
    },
  };
  (window as unknown as { cg: typeof stub }).cg = stub;
  return {
    setConfig,
    fixedSetConfig,
    fixedSetBanks,
    rasterSet,
    sourcesSetConfig,
    sourcesSetAssignments,
    delimitersSet,
    remove,
    takeOffAir,
  };
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;
/** The props the last `renderStationSetup` used, so `setSetupOpen` can re-render with them. */
let lastProps: {
  section: StationSetupSection;
  requestId: number;
  onClose: () => void;
} | null = null;

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
  lastProps = {
    section: options.section ?? DEFAULT_STATION_SETUP_SECTION,
    requestId: options.requestId ?? 1,
    onClose: options.onClose ?? ((): void => undefined),
  };
  await renderWithOpen(true);
  const dialog = openDialog();
  if (dialog === null) throw new Error('Station setup did not open');
  return dialog;
}

async function renderWithOpen(open: boolean): Promise<void> {
  const r = root;
  const props = lastProps;
  if (r === null || props === null) throw new Error('renderStationSetup() has not run');
  await act(async () => {
    r.render(
      createElement(StrictMode, null, createElement(StationSetupDialog, { open, ...props })),
    );
    await Promise.resolve();
    await Promise.resolve();
  });
  await settleSetup();
}

/**
 * `MODAL-TRUTH-01` — DISMISS AND RE-OPEN THE SAME MOUNTED DIALOG.
 *
 * `App` keeps `StationSetupDialog` mounted and toggles its `open` prop, so a spec that
 * unmounts and re-renders would be testing a case the operator cannot reach: React would
 * drop the component state the defect is about. This re-renders the SAME root with a new
 * `open`, which is exactly what the store's `closeStationSetup` / `openStationSetup` do.
 *
 * `requestId` advances on re-open, as it does in the app: every open request is a new one.
 */
export async function reopenStationSetup(
  options: { section?: StationSetupSection } = {},
): Promise<HTMLElement> {
  const props = lastProps;
  if (props === null) throw new Error('renderStationSetup() has not run');
  await renderWithOpen(false);
  lastProps = {
    ...props,
    ...(options.section === undefined ? {} : { section: options.section }),
    requestId: props.requestId + 1,
  };
  await renderWithOpen(true);
  const dialog = openDialog();
  if (dialog === null) throw new Error('Station setup did not re-open');
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
  lastProps = null;
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
