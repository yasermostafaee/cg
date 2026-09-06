// @vitest-environment jsdom
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ConnectionHealth } from '@cg/shared-ipc';
import type { StackItemState } from '@cg/shared-schema';
import { clearPortals } from './support/dialog.js';
import {
  SETUP_CONFIG,
  SETUP_SERVE_INFO,
  renderStationSetup,
  setSetupInput,
  stationSetupStub,
  unmountStationSetup,
  type StationSetupStubOptions,
} from './support/stationSetup.js';

/**
 * R-010 — the SERVERS section of Station setup (the `Server connection` dialog until
 * `STATION-SETUP-02`): loads the current config, mirrors the bridge's on-air gate to
 * pre-disable APPLY SERVERS (with the reason shown, SCOPED to this section), warns on a
 * non-loopback host, validates ports, and submits the parsed ConnectionConfig via
 * connections.setConfig.
 */

afterEach(async () => {
  await unmountStationSetup();
  clearPortals();
  vi.restoreAllMocks();
});

function item(status: StackItemState['status'], pending = false): StackItemState {
  return { itemId: `i-${status}`, templateId: 't1', fields: {}, status, pending };
}

function stub(over: StationSetupStubOptions = {}): ReturnType<typeof stationSetupStub> {
  return stationSetupStub(over);
}

function applyButton(el: HTMLElement): HTMLButtonElement {
  const btn = el.querySelector<HTMLButtonElement>('button[aria-label="Apply server settings"]');
  if (btn === null) throw new Error('APPLY SERVERS not rendered');
  return btn;
}

describe('Station setup — Servers (R-010)', () => {
  it('loads the current config into the fields', async () => {
    stub({ items: [item('idle')] });
    const el = await renderStationSetup({ section: 'servers' });
    const host = el.querySelector<HTMLInputElement>('input[aria-label="Primary host"]');
    expect(host?.value).toBe('127.0.0.1');
    expect(el.textContent).toContain('No backup declared');
  });

  it('B-223 — carries the output check’s technical section, fed from connection health', async () => {
    const health: ConnectionHealth = {
      primary: {
        label: 'A',
        state: 'healthy',
        amcpAxisOk: true,
        outputs: [
          {
            channel: 1,
            declared: [{ kind: 'decklink', device: '23487013' }, { kind: 'screen' }],
            running: [{ port: 23487313, kind: 'decklink' }],
            missing: [{ kind: 'screen', declared: 1, running: 0, devices: [] }],
            observedAt: '2026-09-05T14:08:44.000Z',
          },
        ],
      },
      currentPrimary: 'A',
      strategy: 'mirror-sync',
    } as ConnectionHealth;
    stub({ items: [item('idle')], health });
    /*
      ⭐ `STATION-CHROME-01` §4 MOVED THIS TAB. Outputs is on CHANNEL now, beside the raster,
      because the two answer one question — what the channel is, and what it is coming out of
      — and neither is set here. It is still fed from the same connection health.
    */
    const el = await renderStationSetup({ section: 'channel' });
    const section = el.querySelector('section[aria-label="Program outputs"]');
    expect(section).not.toBeNull();
    expect(section?.textContent).toContain('Channel 1 on server A');
    expect(section?.querySelector('[data-severity="local"]')?.textContent).toContain('screen');
    // Read-only, and now provably so: the tab carries NO commit action at all — not a
    // disabled one, none — and its footer says there is nothing to apply.
    expect([...el.querySelectorAll('[data-modal-role="primary"]')]).toEqual([]);
    expect(el.querySelector('[data-section-footer="channel"]')?.textContent).toContain(
      'Nothing to apply',
    );
  });

  it('mirrors the on-air gate: APPLY SERVERS disabled with the reason, and the reason names its scope', async () => {
    stub({ items: [item('on-air'), item('idle'), item('unconfirmed')] });
    const el = await renderStationSetup({ section: 'servers' });
    expect(applyButton(el).disabled).toBe(true);
    expect(el.textContent).toContain('2 item(s) are on air or unsettled');
    // `STATION-SETUP-02` §1 — the guard did NOT widen with the dialog, and the message says so.
    expect(el.textContent).toContain('Apply is blocked for Servers');
    expect(el.textContent).toContain('Every other section stays editable');
  });

  it('idle/loaded items do not block APPLY SERVERS', async () => {
    stub({ items: [item('idle'), item('loaded')] });
    const el = await renderStationSetup({ section: 'servers' });
    expect(applyButton(el).disabled).toBe(false);
  });

  it('warns about LAN exposure for a non-loopback host, and confirms post-apply', async () => {
    const { setConfig } = stub();
    const el = await renderStationSetup({ section: 'servers' });
    expect(el.textContent).not.toContain('Remote server');
    await setSetupInput(el, 'Primary host', '192.168.1.50');
    expect(el.textContent).toContain('Remote server (192.168.1.50)');
    expect(el.textContent).toContain('control connection stays on 127.0.0.1');
    await act(async () => {
      applyButton(el).click();
      await Promise.resolve();
    });
    expect(setConfig).toHaveBeenCalledWith({
      servers: { A: { host: '192.168.1.50', amcpPort: 5250, oscPort: 6250 } },
      strategy: 'mirror-sync',
      autoFailoverEnabled: true,
      // `C-024` — AN EMPTY SERVE HOST IS SENT, NOT OMITTED: the field has to be clearable.
      templateServeHost: '',
    });
  });

  /*
    🔴 B-162 §2a — THE APPLY THAT SUCCEEDS AND STILL COSTS A SERVER ITS GRAPHICS. This is the
    only surface on which an operator can learn about it.
  */
  it('B-162: an apply that leaves a server unable to fetch templates says so, and does NOT print the reassuring line', async () => {
    stub({
      setConfigResult: {
        ok: true,
        templateServe: {
          serveHost: '127.0.0.1',
          port: 7911,
          exposed: false,
          unreachable: ['192.168.21.50'],
        },
      },
    });
    const el = await renderStationSetup({ section: 'servers' });
    await act(async () => {
      applyButton(el).click();
      await Promise.resolve();
    });
    expect(el.textContent).toContain('192.168.21.50');
    expect(el.textContent).toContain('NO TEMPLATE');
    // `C-024` — the remedy is the field the operator is already looking at, never a restart.
    expect(el.textContent).toContain('Serve host');
    expect(el.textContent).toContain('does not need restarting');
    expect(el.textContent).not.toContain('Restart the bridge');
    // The false reassurance must be GONE, not merely accompanied.
    expect(el.textContent).not.toContain('All listeners remain loopback-only');
  });

  it('B-162: an apply with nothing unreachable still reports the plain loopback success', async () => {
    stub({
      setConfigResult: {
        ok: true,
        templateServe: { serveHost: '127.0.0.1', port: 7911, exposed: false, unreachable: [] },
      },
    });
    const el = await renderStationSetup({ section: 'servers' });
    await act(async () => {
      applyButton(el).click();
      await Promise.resolve();
    });
    expect(el.textContent).toContain('All listeners remain loopback-only');
    expect(el.textContent).not.toContain('NO TEMPLATE');
  });

  it('validates ports and disables APPLY SERVERS on garbage', async () => {
    stub();
    const el = await renderStationSetup({ section: 'servers' });
    await setSetupInput(el, 'Primary AMCP port', 'abc');
    expect(el.textContent).toContain('AMCP port must be an integer');
    expect(applyButton(el).disabled).toBe(true);
  });

  /**
   * CANCEL SENDS NOTHING — the Servers section is a FORM. Edited fields, then Cancel: no
   * `setConfig` call at all, and the dialog closes by the same path as the ✕, Escape and
   * the backdrop.
   */
  it('Cancel leaves the bridge config byte-identical — nothing is sent', async () => {
    const { setConfig } = stub();
    let closed = false;
    const el = await renderStationSetup({
      section: 'servers',
      onClose: () => {
        closed = true;
      },
    });

    // Edit the draft, so there is genuinely something that COULD have been sent.
    await setSetupInput(el, 'Primary host', '192.168.1.99');

    const cancel = [...el.querySelectorAll<HTMLButtonElement>('.cg-modal-footer button')].find(
      (b) => b.textContent === 'Cancel',
    );
    if (cancel === undefined) throw new Error('Cancel not rendered in the action row');
    await act(async () => {
      cancel.click();
      await Promise.resolve();
    });

    expect(setConfig, 'Cancel must not reach the bridge').not.toHaveBeenCalled();
    expect(closed, 'Cancel takes the same path out as the ✕ and Escape').toBe(true);
  });

  it('adding a backup submits servers.B; the bridge refusal message is surfaced', async () => {
    const { setConfig } = stub({
      setConfigResult: {
        ok: false,
        reason: 'on-air-block',
        message:
          '1 item(s) are on air or unsettled — Clear All takes them off air and keeps the rows.',
      },
    });
    const el = await renderStationSetup({ section: 'servers' });
    const addBackup = el.querySelector<HTMLButtonElement>('button[aria-label="Add backup"]');
    await act(async () => {
      addBackup?.click();
    });
    await setSetupInput(el, 'Backup host', '192.168.1.51');
    await act(async () => {
      applyButton(el).click();
      await Promise.resolve();
    });
    expect(setConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        servers: expect.objectContaining({
          B: { host: '192.168.1.51', amcpPort: 5251, oscPort: 6251 },
        }) as unknown,
      }),
    );
    // The race case: the bridge (authoritative) refused — its reason shows.
    expect(el.textContent).toContain('Clear All takes them off air and keeps the rows');
  });

  /*
    ═══════════════════════════════════════════════════════════════════════════════════════════
    `C-024` — THE SERVE ADDRESS IS SET HERE, AND A MASKED FIELD SAYS SO.
    ═══════════════════════════════════════════════════════════════════════════════════════════
  */

  it('C-024: the serve host and a pinned port are submitted; an empty port is omitted', async () => {
    const { setConfig } = stub();
    const el = await renderStationSetup({ section: 'servers' });
    await setSetupInput(el, 'Template serve host', '192.168.21.93');
    await setSetupInput(el, 'Template serve port', '7911');
    await act(async () => {
      applyButton(el).click();
      await Promise.resolve();
    });
    expect(setConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        templateServeHost: '192.168.21.93',
        templateServePort: 7911,
      }),
    );
  });

  it('C-024: an EMPTY port is absent from the payload, an empty HOST is present as an empty string', async () => {
    /*
      🔴 THE TWO EMPTIES ARE SPELLED DIFFERENTLY ON PURPOSE. The HOST must be clearable — a
      cleared field has to reach the store as `''` — so it is always sent. The PORT has no such
      problem and `0` already means something specific, so an empty port field is omitted.
    */
    const { setConfig } = stub();
    const el = await renderStationSetup({ section: 'servers' });
    await act(async () => {
      applyButton(el).click();
      await Promise.resolve();
    });
    const payload = setConfig.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload['templateServeHost']).toBe('');
    expect('templateServePort' in payload).toBe(false);
  });

  it('C-024: a flag in force is NAMED on the field it masks, the stored value is struck through, and the input stays EDITABLE', async () => {
    stub({
      serveInfo: {
        ...SETUP_SERVE_INFO,
        serveHost: '10.0.0.7',
        flagOverrides: { serveHost: '10.0.0.7' },
      },
      config: { ...SETUP_CONFIG, templateServeHost: '192.168.21.93' },
    });
    const el = await renderStationSetup({ section: 'servers' });
    const masked = el.querySelector('[data-testid="serve-host-masked"]');
    expect(masked).not.toBeNull();
    expect(masked?.textContent).toContain('10.0.0.7');
    expect(masked?.textContent).toContain('--template-serve-host');
    expect(masked?.textContent).toContain('not in force');
    // The STORED value is the one struck through — never the one in force.
    const struck = el.querySelector<HTMLElement>(
      '[data-testid="serve-host-masked"] span:nth-child(3)',
    );
    expect(struck?.textContent).toBe('192.168.21.93');
    expect(struck?.style.textDecoration).toContain('line-through');

    const input = el.querySelector<HTMLInputElement>('input[aria-label="Template serve host"]');
    expect(input).not.toBeNull();
    expect(input?.disabled).toBe(false);
    expect(input?.value).toBe('192.168.21.93');
  });

  it('C-024: with NO flag set, nothing is masked — a derived host is not an override', async () => {
    stub({ serveInfo: { ...SETUP_SERVE_INFO, serveHost: '127.0.0.1' } });
    const el = await renderStationSetup({ section: 'servers' });
    expect(el.querySelector('[data-testid="serve-host-masked"]')).toBeNull();
    expect(el.querySelector('[data-testid="serve-port-masked"]')).toBeNull();
  });

  it('C-024: candidates are offered as CANDIDATES, and picking one fills the field', async () => {
    stub({ serveInfo: { ...SETUP_SERVE_INFO, candidates: ['192.168.21.93', '172.17.0.1'] } });
    const el = await renderStationSetup({ section: 'servers' });
    // ⚠ The wording is the point: this list must never read as a verdict about which
    // interface the plant can reach. That is exactly `guessLanHost()`'s failure.
    expect(el.textContent).toContain('not a verdict');
    const pick = el.querySelector<HTMLButtonElement>(
      'button[aria-label="Use serve host 172.17.0.1"]',
    );
    expect(pick).not.toBeNull();
    await act(async () => {
      pick?.click();
      await Promise.resolve();
    });
    const input = el.querySelector<HTMLInputElement>('input[aria-label="Template serve host"]');
    expect(input?.value).toBe('172.17.0.1');
  });

  it('C-024: a non-integer serve port blocks APPLY SERVERS with a stated reason', async () => {
    stub();
    const el = await renderStationSetup({ section: 'servers' });
    await setSetupInput(el, 'Template serve port', '79x11');
    expect(applyButton(el).disabled).toBe(true);
    expect(el.textContent).toContain('Template serve port must be an integer');
  });
});
