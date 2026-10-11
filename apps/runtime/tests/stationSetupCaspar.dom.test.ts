// @vitest-environment jsdom
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ConnectionConfig, ConnectionHealth } from '@cg/shared-ipc';
import { signedInStub } from './support/authStub.js';
import { clearPortals } from './support/dialog.js';
import {
  SETUP_SERVE_INFO,
  renderStationSetup,
  setSetupInput,
  settleSetup,
  stationSetupStub,
  unmountStationSetup,
} from './support/stationSetup.js';

/**
 * 🔴 `SERVERS-SIMPLIFY-01` Part B — **CASPARCG IS NAMED, AND IN A PLAYOUT STATION IT IS DERIVED; THE GRAPHICS
 * ADDRESS IS NAMED FOR WHAT IT IS, AND AN ADDRESS ON ANOTHER MACHINE IS A FAILED LINE.**
 *
 * The owner's pictures 3 and 4: `Primary server` read as "where the bridge is", and `How those servers reach
 * this machine` read as his own PC — both ended up holding `192.168.21.93`.
 *
 *   - T2 — the cards are `CasparCG A` and `CasparCG B · backup`; in a Playout station (the bridge advertises
 *     `auth: playout`) A's values are facts beside `On the Playout machine` and its state; B stays editable;
 *   - T5 — every port's default is its placeholder;
 *   - T3 — the graphics address sits behind `Advanced` (collapsed in a Playout station) as `Where CasparCG
 *     fetches graphics`, and nothing calls CG Bridge's machine "this machine";
 *   - `B-326` — CG Bridge's verdict that the graphics host is another machine is the check's failed line, with
 *     `Detect automatically` beside it.
 */

afterEach(async () => {
  await unmountStationSetup();
  clearPortals();
  vi.restoreAllMocks();
});

const ADMIN = signedInStub('زهرا موسوی', [1], ['station-admin', 'operator', 'viewer']);
const HEALTH = {
  primary: { label: 'A', state: 'healthy', amcpAxisOk: true },
  currentPrimary: 'A',
  strategy: 'mirror-sync',
} as ConnectionHealth;

function input(dialog: HTMLElement, label: string): HTMLInputElement | null {
  return dialog.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
}

async function press(el: Element | null | undefined): Promise<void> {
  if (!(el instanceof HTMLElement)) throw new Error('nothing to press');
  await act(async () => {
    el.click();
    await Promise.resolve();
  });
  await settleSetup();
}

describe('T2 — the cards say CasparCG', () => {
  it('`CasparCG A`, `CasparCG B · backup`, and the rail’s foot', async () => {
    stationSetupStub();
    const dialog = await renderStationSetup({ section: 'servers' });
    expect(
      dialog.querySelector('section[aria-label="CasparCG A"] .cg-card__title')?.textContent,
    ).toBe('CasparCG A');
    expect(
      dialog.querySelector('section[aria-label="CasparCG B"] .cg-card__title')?.textContent,
    ).toBe('CasparCG B · backup');
    expect(dialog.querySelector('[data-rail-station] .cg-rail-station__name')?.textContent).toBe(
      'CasparCG',
    );
    // The redundancy ROLE keeps its word where it belongs: none of the card names says `server`.
    expect(dialog.textContent).not.toContain('Primary server');
    expect(dialog.textContent).not.toContain('Backup server');
  });

  it('🔴 a Playout station: CasparCG A is a fact — on the Playout machine, its state, nothing typed', async () => {
    stationSetupStub({ auth: ADMIN, health: HEALTH });
    const dialog = await renderStationSetup({ section: 'servers' });
    const a = dialog.querySelector('section[aria-label="CasparCG A"]');
    expect(a?.querySelector('input'), 'nothing to type').toBeNull();
    expect(a?.querySelector('[data-caspar-placement]')?.textContent).toBe('On the Playout machine');
    expect(a?.querySelector('[data-caspar-health]')?.textContent).toBe('HEALTHY');
    const values = [...(a?.querySelectorAll('[data-setup-readonly]') ?? [])].map(
      (n) => n.textContent,
    );
    expect(values).toEqual(['127.0.0.1', '5250', '6251']);
    // B stays the station admin's to add.
    expect(dialog.querySelector('button[aria-label="Add backup"]')).not.toBeNull();
  });

  it('CONTROL — with no Playout, CasparCG A is typed, with no placement tag', async () => {
    stationSetupStub();
    const dialog = await renderStationSetup({ section: 'servers' });
    expect(input(dialog, 'Primary host')).not.toBeNull();
    expect(dialog.querySelector('[data-caspar-placement]')).toBeNull();
  });
});

describe('T5 — every port’s default is its placeholder', () => {
  it('A: an empty AMCP and OSC port, `5250` and `6251` as placeholders, the defaults applied', async () => {
    const { setConfig } = stationSetupStub();
    const dialog = await renderStationSetup({ section: 'servers' });
    expect(input(dialog, 'Primary AMCP port')?.value).toBe('');
    expect(input(dialog, 'Primary AMCP port')?.getAttribute('placeholder')).toBe('5250');
    expect(input(dialog, 'Primary OSC port')?.getAttribute('placeholder')).toBe('6251');
    await setSetupInput(dialog, 'Primary host', '192.0.2.50');
    await press(dialog.querySelector('button[aria-label="Apply server settings"]'));
    expect(setConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        servers: { A: { host: '192.0.2.50', amcpPort: 5250, oscPort: 6251 } },
      }),
    );
  });

  it('B: the Add dialog’s ports are `5250` and `6252` placeholders, and empty adds the defaults', async () => {
    const { setConfig } = stationSetupStub();
    const dialog = await renderStationSetup({ section: 'servers' });
    await press(dialog.querySelector('button[aria-label="Add backup"]'));
    const sub = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].at(-1);
    if (sub === undefined) throw new Error('the Add backup dialog did not open');
    expect(input(sub, 'New backup AMCP port')?.getAttribute('placeholder')).toBe('5250');
    expect(input(sub, 'New backup OSC port')?.getAttribute('placeholder')).toBe('6252');
    await setSetupInput(sub, 'New backup host', '192.0.2.51');
    await press([...sub.querySelectorAll('button')].find((b) => b.textContent === 'Add to draft'));
    expect(input(dialog, 'Backup OSC port')?.getAttribute('placeholder')).toBe('6252');
    await press(dialog.querySelector('button[aria-label="Apply server settings"]'));
    expect(setConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        servers: expect.objectContaining({
          B: { host: '192.0.2.51', amcpPort: 5250, oscPort: 6252 },
        }) as unknown,
      }),
    );
  });

  it('a stored port that overrides its default shows as text', async () => {
    const config: ConnectionConfig = {
      servers: { A: { host: '127.0.0.1', amcpPort: 5260, oscPort: 6251 } },
      strategy: 'mirror-sync',
      autoFailoverEnabled: true,
    };
    stationSetupStub({ config });
    const dialog = await renderStationSetup({ section: 'servers' });
    expect(input(dialog, 'Primary AMCP port')?.value).toBe('5260');
    expect(input(dialog, 'Primary OSC port')?.value).toBe('');
  });
});

describe('T3 — the graphics address, behind Advanced, named for what it is', () => {
  it('collapsed in a Playout station; open with no Playout', async () => {
    stationSetupStub({ auth: ADMIN });
    let dialog = await renderStationSetup({ section: 'servers' });
    expect(dialog.querySelector<HTMLDetailsElement>('[data-setup-advanced]')?.open).toBe(false);
    await unmountStationSetup();
    clearPortals();
    stationSetupStub();
    dialog = await renderStationSetup({ section: 'servers' });
    expect(dialog.querySelector<HTMLDetailsElement>('[data-setup-advanced]')?.open).toBe(true);
  });

  it('`Where CasparCG fetches graphics`, Host and Port with their placeholders — and never "this machine"', async () => {
    stationSetupStub({ serveInfo: { ...SETUP_SERVE_INFO, candidates: ['192.168.21.32'] } });
    const dialog = await renderStationSetup({ section: 'servers' });
    const block = dialog.querySelector('section[aria-label="Where CasparCG fetches graphics"]');
    expect(block).not.toBeNull();
    expect(input(dialog, 'Graphics host')?.getAttribute('placeholder')).toBe(
      'Detect automatically',
    );
    expect(input(dialog, 'Graphics port')?.getAttribute('placeholder')).toBe(
      'Assign automatically',
    );
    expect(dialog.textContent?.toLowerCase()).not.toContain('this machine');
  });
});

describe('B-326 — a graphics host on another machine is the check’s failed line', () => {
  it('🔴 the owner’s `.32` serving from `.93`: the line names the host, and Detect automatically clears it', async () => {
    const { setConfig } = stationSetupStub({
      auth: ADMIN,
      config: {
        servers: { A: { host: '127.0.0.1', amcpPort: 5250, oscPort: 6251 } },
        strategy: 'mirror-sync',
        autoFailoverEnabled: true,
        templateServeHost: '192.168.21.93',
      },
      serveInfo: {
        ...SETUP_SERVE_INFO,
        serveHost: '192.168.21.93',
        exposed: true,
        unreachable: ['127.0.0.1'],
        candidates: ['192.168.21.32'],
        elsewhere: true,
      },
    });
    // The station's Playout, as its CG Bridge advertises it: the check runs on open, and the line joins it.
    const auth = (window.cg as unknown as { auth: { capabilities: () => object } }).auth;
    const caps = auth.capabilities();
    auth.capabilities = () => ({
      ...caps,
      signInUrl: 'http://192.168.21.32:8080/api/cg/auth/token',
    });
    const dialog = await renderStationSetup({ section: 'servers' });
    const line = dialog.querySelector('[data-check="graphics"]');
    expect(line?.getAttribute('data-status')).toBe('fail');
    expect(line?.textContent).toContain(
      "CasparCG would fetch graphics from 192.168.21.93, another machine than CG Bridge's.",
    );
    // Collapsed in a Playout station — the remedy opens it, so the cleared field is in view.
    expect(dialog.querySelector<HTMLDetailsElement>('[data-setup-advanced]')?.open).toBe(false);
    await press(dialog.querySelector('[data-detect-graphics]'));
    expect(input(dialog, 'Graphics host')?.value).toBe('');
    expect(dialog.querySelector<HTMLDetailsElement>('[data-setup-advanced]')?.open).toBe(true);
    // …and, like every edit here, Apply servers is what commits it.
    await press(dialog.querySelector('button[aria-label="Apply server settings"]'));
    expect(setConfig).toHaveBeenCalledWith(expect.objectContaining({ templateServeHost: '' }));
  });

  it('CONTROL — a graphics host CG Bridge does not judge elsewhere: no line, no remedy', async () => {
    stationSetupStub({
      auth: ADMIN,
      serveInfo: { ...SETUP_SERVE_INFO, candidates: ['192.168.21.32'] },
    });
    const dialog = await renderStationSetup({ section: 'servers' });
    expect(dialog.querySelector('[data-check="graphics"]')).toBeNull();
    expect(dialog.querySelector('[data-detect-graphics]')).toBeNull();
  });
});

/**
 * 🔴 `B-327` (`SERVERS-SIMPLIFY-01` T6) — **THE OWNER'S STATE: EVERY LINE GREEN, THE METER `— LUFS`.** Server A named
 * his own PC (`.93`); the Playout names `127.0.0.1`. CG Bridge now says whether A joins the Playout's, the line names
 * both hosts and the cost, and `Use the Playout's` writes the host CG Bridge derived — refused on air, as Apply is.
 */
describe('B-327 — whether CasparCG A joins the Playout’s', () => {
  const OWNERS: ConnectionConfig = {
    servers: { A: { host: '192.168.21.93', amcpPort: 5250, oscPort: 6251 } },
    strategy: 'mirror-sync',
    autoFailoverEnabled: true,
  };
  const ON_AIR = { itemId: 'i-1', templateId: 't1', fields: {}, status: 'on-air', pending: false };

  /** This station's Playout, so the check runs on open; `join` is CG Bridge's verdict. */
  function answering(join: { casparHost: string; playoutCasparHost: string; joins: boolean }): {
    check: ReturnType<typeof vi.fn>;
  } {
    const cg = window.cg as unknown as {
      auth: { capabilities: () => object };
      setup: { check: (r: unknown) => Promise<unknown> };
    };
    const caps = cg.auth.capabilities();
    cg.auth.capabilities = () => ({
      ...caps,
      signInUrl: 'http://192.168.21.32:8080/api/cg/auth/token',
    });
    const check = vi.fn(() =>
      Promise.resolve({ lines: [], localAddress: null, bridge: null, casparJoin: join }),
    );
    cg.setup.check = check;
    return { check };
  }

  it('🔴 the owner’s state: the line FAILS naming both hosts and the cost; `Use the Playout’s` writes 127.0.0.1', async () => {
    const { setConfig } = stationSetupStub({ auth: ADMIN, config: OWNERS, health: HEALTH });
    const { check } = answering({
      casparHost: '192.168.21.93',
      playoutCasparHost: '127.0.0.1',
      joins: false,
    });
    const dialog = await renderStationSetup({ section: 'servers' });
    // The check asks about the CasparCG host this bridge drives.
    expect(check.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ casparHost: '192.168.21.93' }),
    );
    const line = dialog.querySelector('[data-check="caspar-join"]');
    expect(line?.getAttribute('data-status')).toBe('fail');
    expect(line?.textContent).toContain(
      'CasparCG A is 192.168.21.93; the Playout names 127.0.0.1: meters, sources and grants are dropped.',
    );
    const use = dialog.querySelector<HTMLButtonElement>('[data-use-playouts]');
    expect(use?.textContent).toBe('Use the Playout’s'.replace('’', "'"));
    await press(use);
    expect(setConfig).toHaveBeenCalledWith({
      ...OWNERS,
      servers: { A: { host: '127.0.0.1', amcpPort: 5250, oscPort: 6251 } },
    });
    // …and the line is asked again, so it says what is now in force.
    expect(check.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('placement 2 — CG Bridge on a separate server: the derived host is the Playout’s address', async () => {
    const { setConfig } = stationSetupStub({
      auth: ADMIN,
      config: { ...OWNERS, servers: { A: { host: '127.0.0.1', amcpPort: 5250, oscPort: 6251 } } },
    });
    answering({ casparHost: '127.0.0.1', playoutCasparHost: '192.168.21.32', joins: false });
    const dialog = await renderStationSetup({ section: 'servers' });
    expect(dialog.querySelector('[data-check="caspar-join"]')?.textContent).toContain(
      'the Playout names 192.168.21.32',
    );
    await press(dialog.querySelector('[data-use-playouts]'));
    expect(setConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        servers: { A: { host: '192.168.21.32', amcpPort: 5250, oscPort: 6251 } },
      }),
    );
  });

  it('CONTROL — A joins: the line passes, and there is nothing to use', async () => {
    stationSetupStub({ auth: ADMIN });
    answering({ casparHost: '127.0.0.1', playoutCasparHost: '127.0.0.1', joins: true });
    const dialog = await renderStationSetup({ section: 'servers' });
    const line = dialog.querySelector('[data-check="caspar-join"]');
    expect(line?.getAttribute('data-status')).toBe('pass');
    expect(line?.textContent).toContain("CasparCG A is the Playout's: 127.0.0.1.");
    expect(dialog.querySelector('[data-use-playouts]')).toBeNull();
  });

  it('🔴 on air: `Use the Playout’s` is refused like Apply — and a changed host reads `Not applied`', async () => {
    const { setConfig } = stationSetupStub({
      auth: ADMIN,
      config: OWNERS,
      items: [ON_AIR as never],
    });
    answering({ casparHost: '192.168.21.93', playoutCasparHost: '127.0.0.1', joins: false });
    const dialog = await renderStationSetup({ section: 'servers' });
    const use = dialog.querySelector<HTMLButtonElement>('[data-use-playouts]');
    expect(use?.disabled).toBe(true);
    expect(use?.getAttribute('title')).toBe('Refused while anything is on air.');
    // A backup typed during the show is a draft, and the card says so as a fact.
    const b = dialog.querySelector('section[aria-label="CasparCG B"]');
    expect(b?.querySelector('[data-not-applied]')).toBeNull();
    await press(dialog.querySelector('button[aria-label="Add backup"]'));
    const sub = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].at(-1);
    if (sub === undefined) throw new Error('the Add backup dialog did not open');
    await setSetupInput(sub, 'New backup host', '192.0.2.51');
    await press([...sub.querySelectorAll('button')].find((x) => x.textContent === 'Add to draft'));
    expect(b?.querySelector('[data-not-applied]')?.textContent).toBe('Not applied');
    expect(
      dialog.querySelector<HTMLButtonElement>('button[aria-label="Apply server settings"]')
        ?.disabled,
    ).toBe(true);
    expect(setConfig).not.toHaveBeenCalled();
  });

  it('`Not applied` on A’s typed host, with no Playout; CONTROL: the stored value reads as nothing', async () => {
    stationSetupStub({ items: [ON_AIR as never] });
    const dialog = await renderStationSetup({ section: 'servers' });
    const a = dialog.querySelector('section[aria-label="CasparCG A"]');
    expect(a?.querySelector('[data-not-applied]')).toBeNull();
    await setSetupInput(dialog, 'Primary host', '192.0.2.50');
    expect(a?.querySelector('[data-not-applied]')?.textContent).toBe('Not applied');
    await setSetupInput(dialog, 'Primary host', '127.0.0.1');
    expect(a?.querySelector('[data-not-applied]')).toBeNull();
  });
});
