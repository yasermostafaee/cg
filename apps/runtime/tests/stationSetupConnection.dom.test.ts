// @vitest-environment jsdom
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalisePlayoutAddress, type ConnectionConfig } from '@cg/shared-ipc';
import type { BridgeLinkStatus } from '../src/shared/runtime-bridge.js';
import { bridgeAddressFor } from '../src/platform/bridgeUrl.js';
import { clearPortals } from './support/dialog.js';
import {
  SETUP_CONFIG,
  renderStationSetup,
  reopenStationSetup,
  selectSetupTab,
  setSetupInput,
  settleSetup,
  stationSetupStub,
  tabOf,
  unmountStationSetup,
  type StationSetupStubOptions,
} from './support/stationSetup.js';

/**
 * 🔴 `SERVERS-SIMPLIFY-01` Part A — **THE CONNECTION CARD KEEPS WHAT WAS TYPED, AND A DRAFT NEVER CROSSES TO
 * ANOTHER CG BRIDGE.**
 *
 * `B-324` — the owner typed into the Playout card's CG Bridge field (picture 5), changed tab, and came back to
 * the card as it was before he typed: no draft, no mark on the rail, nothing said. The field lived inside the
 * card, and the card unmounts with its tab.
 *
 * `B-325` — the Servers draft is the dialog's, and the dialog stays mounted while the console is re-pointed at
 * another CG Bridge. A reconnect re-reads the stack, the health and the lock, never `connections.config`, so the
 * fields and their baseline kept the FIRST CG Bridge's values on the second one — no dirty mark, and `Apply
 * servers` sent them there. That is the suspected path by which the owner's own PC (`.93`) reached `.32`'s
 * server A and serve host.
 */

afterEach(async () => {
  await unmountStationSetup();
  clearPortals();
  vi.restoreAllMocks();
});

const PLAYOUT = 'http://192.168.21.32:8080';

/**
 * Station setup inside CG Control, for a station admin (auth off reads as one), with a Playout the bridge
 * advertises — the owner's card. The link is a handle the spec drives.
 */
function insideCgControl(over: StationSetupStubOptions = {}): {
  stub: ReturnType<typeof stationSetupStub>;
  link: { set: (status: BridgeLinkStatus, address?: string) => void };
  setPlayoutAddress: ReturnType<typeof vi.fn>;
  setConfigNext: (config: ConnectionConfig) => void;
} {
  const stub = stationSetupStub(over);
  const cg = window.cg as unknown as Record<string, Record<string, unknown>>;
  let status: BridgeLinkStatus = 'live';
  let address = '192.168.21.32:5280';
  const handlers = new Set<(s: BridgeLinkStatus) => void>();
  cg['link'] = {
    ...cg['link'],
    status: () => status,
    onStatusChanged: (h: (s: BridgeLinkStatus) => void) => {
      handlers.add(h);
      return () => handlers.delete(h);
    },
    bridgeAddress: () => address,
  };
  let config = over.config ?? SETUP_CONFIG;
  cg['connections'] = { ...cg['connections'], config: () => Promise.resolve(config) };
  const caps = (cg['auth'] as { capabilities: () => Record<string, unknown> }).capabilities();
  cg['auth'] = {
    ...cg['auth'],
    capabilities: () => ({ ...caps, signInUrl: `${PLAYOUT}/api/cg/auth/token` }),
  };
  const setPlayoutAddress = vi.fn(() => Promise.resolve('saved'));
  cg['setup'] = {
    ...cg['setup'],
    canSetPlayoutAddress: () => true,
    setPlayoutAddress,
    bridgeAddressFor: (playout: string, bridge: string) => {
      const normal = normalisePlayoutAddress(playout);
      return normal === null ? null : bridgeAddressFor(normal, bridge);
    },
  };
  return {
    stub,
    setPlayoutAddress,
    setConfigNext: (next) => {
      config = next;
    },
    link: {
      set: (next, at) => {
        status = next;
        if (at !== undefined) address = at;
        for (const h of [...handlers]) h(next);
      },
    },
  };
}

async function press(dialog: HTMLElement, label: string): Promise<void> {
  const button = [...dialog.querySelectorAll<HTMLButtonElement>('button')].find(
    (b) => b.textContent?.trim() === label,
  );
  if (button === undefined) throw new Error(`no “${label}” button`);
  await act(async () => {
    button.click();
    await Promise.resolve();
  });
  await settleSetup();
}

/** The CG Bridge host field — by its id, which every version of the card has kept. */
function bridgeField(dialog: HTMLElement): HTMLInputElement | null {
  return dialog.querySelector<HTMLInputElement>('#cg-bridge-address');
}

async function typeInto(input: HTMLInputElement, value: string): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  await act(async () => {
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await settleSetup();
}

describe('B-324 — a typed CG Bridge address survives a tab switch, and says it is not connected', () => {
  it('🔴 the owner’s picture 5: typed, Channel, back — the value is there and the rail marks the tab', async () => {
    insideCgControl();
    const dialog = await renderStationSetup({ section: 'servers' });
    await press(dialog, 'Change');
    const field = bridgeField(dialog);
    if (field === null) throw new Error('the CG Bridge field did not open');
    await typeInto(field, '192.0.2.93');

    await selectSetupTab(dialog, 'channel');
    await selectSetupTab(dialog, 'servers');

    expect(bridgeField(dialog)?.value, 'the typed address is still in its field').toBe(
      '192.0.2.93',
    );
    expect(
      tabOf(dialog, 'servers').querySelector('[data-tab-badge="edited"]'),
      'the rail says the tab holds an unapplied change',
    ).not.toBeNull();
    expect(dialog.textContent).toContain('Not connected yet');
  });

  it('closing discards it, as it discards every unapplied draft', async () => {
    insideCgControl();
    const dialog = await renderStationSetup({ section: 'servers' });
    await press(dialog, 'Change');
    const field = bridgeField(dialog);
    if (field === null) throw new Error('the CG Bridge field did not open');
    await typeInto(field, '192.0.2.93');

    const again = await reopenStationSetup({ section: 'servers' });
    expect(bridgeField(again), 'the card is back to the station as it is').toBeNull();
    expect(tabOf(again, 'servers').querySelector('[data-tab-badge="edited"]')).toBeNull();
  });
});

describe('T1 — the card states the two addresses as facts', () => {
  it('`host : port`, and CG Bridge’s place: on the Playout machine, or a separate server', async () => {
    const h = insideCgControl();
    const dialog = await renderStationSetup({ section: 'servers' });
    expect(dialog.querySelector('[data-playout-address]')?.textContent).toBe(
      '192.168.21.32 : 8080',
    );
    expect(dialog.querySelector('[data-bridge-address]')?.textContent).toBe('192.168.21.32 : 5280');
    expect(dialog.querySelector('[data-bridge-placement]')?.textContent).toBe(
      'On the Playout machine',
    );
    // The console on a CG Bridge on another host than its Playout: a separate server, said as a fact.
    await act(async () => {
      h.link.set('live', '192.0.2.40:5280');
      await Promise.resolve();
    });
    await reopenStationSetup({ section: 'servers' });
    expect(document.querySelector('[data-bridge-placement]')?.textContent).toBe('Separate server');
    expect(document.querySelector('[data-bridge-address]')?.textContent).toBe('192.0.2.40 : 5280');
  });
});

describe('B-325 — a Servers draft never crosses to another CG Bridge', () => {
  const X: ConnectionConfig = {
    servers: { A: { host: '192.168.21.93', amcpPort: 5250, oscPort: 6251 } },
    strategy: 'mirror-sync',
    autoFailoverEnabled: true,
    templateServeHost: '192.168.21.93',
  };
  const Y: ConnectionConfig = {
    servers: { A: { host: '127.0.0.1', amcpPort: 5250, oscPort: 6251 } },
    strategy: 'mirror-sync',
    autoFailoverEnabled: true,
  };

  it('🔴 open on X, re-pointed at Y: the fields read Y, and Apply sends none of X', async () => {
    const h = insideCgControl({ config: X });
    const dialog = await renderStationSetup({ section: 'servers' });
    const host = (): string | undefined =>
      dialog.querySelector<HTMLInputElement>('input[aria-label="Primary host"]')?.value;
    expect(host(), 'loaded from X').toBe('192.168.21.93');

    // The console is re-pointed at Y (Connect): the socket drops and comes back, elsewhere.
    h.setConfigNext(Y);
    await act(async () => {
      h.link.set('disconnected');
      await Promise.resolve();
    });
    await act(async () => {
      h.link.set('live', '127.0.0.1:5280');
      await Promise.resolve();
    });
    await settleSetup();

    // The owner's harm first: what `Apply servers` sends to Y.
    await press(dialog, 'Apply servers');
    const sent = h.stub.setConfig.mock.calls.at(-1)?.[0] as ConnectionConfig | undefined;
    expect(sent?.servers.A.host, 'nothing of X reaches Y').toBe('127.0.0.1');
    expect(sent?.templateServeHost ?? '', 'nor X’s serve host').toBe('');
    expect(host(), 'the fields read the CG Bridge the console is on now').toBe('127.0.0.1');
  });

  it('a link blink back to the SAME CG Bridge keeps the draft being typed', async () => {
    const h = insideCgControl();
    const dialog = await renderStationSetup({ section: 'servers' });
    await setSetupInput(dialog, 'Primary host', '192.0.2.50');
    await act(async () => {
      h.link.set('disconnected');
      await Promise.resolve();
    });
    await act(async () => {
      h.link.set('live');
      await Promise.resolve();
    });
    await settleSetup();
    expect(dialog.querySelector<HTMLInputElement>('input[aria-label="Primary host"]')?.value).toBe(
      '192.0.2.50',
    );
  });
});
