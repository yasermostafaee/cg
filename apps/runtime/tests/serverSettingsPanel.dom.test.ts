// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { ConnectionConfig, ConnectionHealth } from '@cg/shared-ipc';
import type { StackItemState } from '@cg/shared-schema';
import { ServerSettingsPanel } from '../src/renderer/features/connections/ServerSettingsPanel.js';
import { clearPortals, openDialog } from './support/dialog.js';

/**
 * R-010 — the server settings panel: loads the current config, mirrors the
 * bridge's on-air gate to pre-disable Apply (with the reason shown), warns on
 * a non-loopback host, validates ports, and submits the parsed
 * ConnectionConfig via connections.setConfig.
 */

let container: HTMLDivElement | null = null;

afterEach(() => {
  container?.remove();
  container = null;
  // The panel is a `Modal` now, so it renders into a PORTAL on `document.body`
  // rather than into the container — a leaked scrim would be found by the next test.
  clearPortals();
});

function item(status: StackItemState['status'], pending = false): StackItemState {
  return { itemId: `i-${status}`, templateId: 't1', fields: {}, status, pending };
}

const CONFIG: ConnectionConfig = {
  servers: { A: { host: '127.0.0.1', amcpPort: 5250, oscPort: 6250 } },
  strategy: 'mirror-sync',
  autoFailoverEnabled: true,
};

/**
 * `C-024` — what `connections.template-serve` answers. Default: nothing masked, no candidates,
 * which is a fresh install with no flags — the state every pre-existing test in this file was
 * written against, so they keep asserting what they always did.
 */
const SERVE_INFO = {
  serveHost: '127.0.0.1',
  port: 0,
  exposed: false,
  unreachable: [] as string[],
  flagOverrides: {} as { serveHost?: string; port?: number },
  candidates: [] as string[],
};

function stubBridge(
  items: readonly StackItemState[],
  setConfigResult: {
    ok: boolean;
    reason?: 'on-air-block';
    message?: string;
    // B-162 — the bridge's own reachability verdict rides the apply response.
    templateServe?: { serveHost: string; port: number; exposed: boolean; unreachable?: string[] };
  } = { ok: true },
  serveInfo: typeof SERVE_INFO = SERVE_INFO,
  config: ConnectionConfig = CONFIG,
  health: ConnectionHealth | null = null,
): { setConfig: Mock } {
  const setConfig = vi.fn(() => Promise.resolve(setConfigResult));
  const stub = {
    connections: {
      config: () => Promise.resolve(config),
      onConfigChanged: () => () => undefined,
      setConfig,
      templateServe: () => Promise.resolve(serveInfo),
      // B-223 — the panel now carries the output check's technical section, which reads
      // connection health. The default here is "no reading yet"; `health` overrides it.
      health: () => Promise.resolve(health),
      onHealthChanged: () => () => undefined,
    },
    stack: {
      snapshot: () => Promise.resolve(items),
      onStateChanged: () => () => undefined,
    },
    // B-080 — the snapshot hooks pull against the LINK now (a disconnected bridge refuses
    // reads, so asking is wrong there). The panel reads the stack, so its bridge stub owes
    // a link like the real one: this suite is about the on-air gate, so it stays connected.
    link: {
      status: () => 'live' as const,
      onStatusChanged: () => () => undefined,
      resyncing: () => false,
      onResyncingChanged: () => () => undefined,
    },
  };
  (window as unknown as { cg: typeof stub }).cg = stub;
  return { setConfig };
}

async function renderPanel(): Promise<HTMLElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      createElement(
        StrictMode,
        null,
        createElement(ServerSettingsPanel, { open: true, onClose: () => undefined }),
      ),
    );
    await Promise.resolve();
  });
  // The DIALOG, not the mount container: this panel is built on the shared `Modal`
  // primitive now, which portals to `document.body`. Every query below is scoped to
  // the dialog, which is also what an operator can actually see and reach.
  const dialog = openDialog();
  if (dialog === null) throw new Error('the server settings dialog did not open');
  return dialog;
}

function applyButton(el: HTMLElement): HTMLButtonElement {
  const btn = el.querySelector<HTMLButtonElement>('button[aria-label="Apply server settings"]');
  if (btn === null) throw new Error('Apply button not rendered');
  return btn;
}

async function setInput(el: HTMLElement, ariaLabel: string, value: string): Promise<void> {
  const input = el.querySelector<HTMLInputElement>(`input[aria-label="${ariaLabel}"]`);
  if (input === null) throw new Error(`input ${ariaLabel} not rendered`);
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  await act(async () => {
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('ServerSettingsPanel — R-010', () => {
  it('loads the current config into the fields', async () => {
    stubBridge([item('idle')]);
    const el = await renderPanel();
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
    stubBridge([item('idle')], { ok: true }, SERVE_INFO, CONFIG, health);
    const el = await renderPanel();
    const section = el.querySelector('section[aria-label="Program outputs"]');
    expect(section).not.toBeNull();
    await act(async () => {
      await Promise.resolve();
    });
    expect(section?.textContent).toContain('Channel 1 on server A');
    expect(section?.querySelector('[data-severity="local"]')?.textContent).toContain('screen');
    // Read-only: the section gates nothing — Apply is exactly as enabled as before.
    expect(applyButton(el).disabled).toBe(false);
  });

  it('mirrors the on-air gate: Apply disabled with the reason while anything is on air/unsettled', async () => {
    stubBridge([item('on-air'), item('idle'), item('unconfirmed')]);
    const el = await renderPanel();
    expect(applyButton(el).disabled).toBe(true);
    expect(el.textContent).toContain('2 item(s) are on air or unsettled');
  });

  it('idle/loaded items do not block Apply', async () => {
    stubBridge([item('idle'), item('loaded')]);
    const el = await renderPanel();
    expect(applyButton(el).disabled).toBe(false);
  });

  it('warns about LAN exposure for a non-loopback host, and confirms post-apply', async () => {
    const { setConfig } = stubBridge([]);
    const el = await renderPanel();
    expect(el.textContent).not.toContain('Remote server');
    await setInput(el, 'Primary host', '192.168.1.50');
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
      /*
        `C-024` — AN EMPTY SERVE HOST IS SENT, NOT OMITTED, and that is the contract.

        The field has to be CLEARABLE, so a cleared field must round-trip through the store; if the
        panel omitted it the store could never be told to forget a host. `''` and absent both mean
        "derive it" — resolved by the bridge's one normalizer, never here.
      */
      templateServeHost: '',
    });
  });

  /*
    🔴 B-162 §2a — THE APPLY THAT SUCCEEDS AND STILL COSTS A SERVER ITS GRAPHICS.

    This is the only surface on which an operator can learn about it. `CG ADD`
    returns 200, the journal records success and health stays green, so there is
    no error anywhere to notice — and before this the panel actively reassured,
    printing "Applied. All listeners remain loopback-only." on exactly the
    configuration that had just cost the backup its template.
  */
  it('B-162: an apply that leaves a server unable to fetch templates says so, and does NOT print the reassuring line', async () => {
    stubBridge([], {
      ok: true,
      templateServe: {
        serveHost: '127.0.0.1',
        port: 7911,
        exposed: false,
        unreachable: ['192.168.21.50'],
      },
    });
    const el = await renderPanel();
    await act(async () => {
      applyButton(el).click();
      await Promise.resolve();
    });
    expect(el.textContent).toContain('192.168.21.50');
    expect(el.textContent).toContain('NO TEMPLATE');
    /*
      `C-024` — THE REMEDY MOVED, so the assertion moved with it.

      This asserted `--template-serve-host`, because a restart with that flag WAS the only fix.
      The address is now set in this dialog and applied to the running bridge, so the message points
      at the field the operator is already looking at. 🔴 And it must NOT suggest a restart: the
      bridge's lifetime is deliberately outside this console, and `set-config` already re-derived
      serving before this message was written.
    */
    expect(el.textContent).toContain('Serve host');
    expect(el.textContent).toContain('does not need restarting');
    expect(el.textContent).not.toContain('Restart the bridge');
    // The false reassurance must be GONE, not merely accompanied.
    expect(el.textContent).not.toContain('All listeners remain loopback-only');
  });

  it('B-162: an apply with nothing unreachable still reports the plain loopback success', async () => {
    stubBridge([], {
      ok: true,
      templateServe: { serveHost: '127.0.0.1', port: 7911, exposed: false, unreachable: [] },
    });
    const el = await renderPanel();
    await act(async () => {
      applyButton(el).click();
      await Promise.resolve();
    });
    expect(el.textContent).toContain('All listeners remain loopback-only');
    expect(el.textContent).not.toContain('NO TEMPLATE');
  });

  it('validates ports and disables Apply on garbage', async () => {
    stubBridge([]);
    const el = await renderPanel();
    await setInput(el, 'Primary AMCP port', 'abc');
    expect(el.textContent).toContain('AMCP port must be an integer');
    expect(applyButton(el).disabled).toBe(true);
  });

  /**
   * CANCEL SENDS NOTHING — the dialog is a FORM, and that is what makes this worth
   * asserting rather than assuming.
   *
   * The operator types hosts and ports into a DRAFT; until Apply lands, none of it
   * has reached the bridge. So leaving without applying is a real choice, and the
   * one thing it must never do is half-apply. Edited fields, then Cancel: no
   * `setConfig` call at all, and the dialog closes by the same path as the ✕,
   * Escape and the backdrop.
   */
  it('Cancel leaves the bridge config byte-identical — nothing is sent', async () => {
    const { setConfig } = stubBridge([]);
    let closed = false;
    container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        createElement(
          StrictMode,
          null,
          createElement(ServerSettingsPanel, {
            open: true,
            onClose: () => {
              closed = true;
            },
          }),
        ),
      );
      await Promise.resolve();
    });
    const el = openDialog();
    if (el === null) throw new Error('the server settings dialog did not open');

    // Edit the draft, so there is genuinely something that COULD have been sent.
    await setInput(el, 'Primary host', '192.168.1.99');

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
    const { setConfig } = stubBridge([], {
      ok: false,
      reason: 'on-air-block',
      message:
        '1 item(s) are on air or unsettled — Clear All takes them off air and keeps the rows.',
    });
    const el = await renderPanel();
    const addBackup = el.querySelector<HTMLButtonElement>('button[aria-label="Add backup"]');
    await act(async () => {
      addBackup?.click();
    });
    await setInput(el, 'Backup host', '192.168.1.51');
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
    const { setConfig } = stubBridge([]);
    const el = await renderPanel();
    await setInput(el, 'Template serve host', '192.168.21.93');
    await setInput(el, 'Template serve port', '7911');
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
      🔴 THE TWO EMPTIES ARE SPELLED DIFFERENTLY ON PURPOSE, and this test pins the difference so a
      later "consistency" tidy cannot quietly erase it.

      The HOST must be clearable — a cleared field has to reach the store as `''` or the clear can
      never be persisted — so it is always sent. The PORT has no such problem and `0` already means
      something specific (an explicit ephemeral bind), so an empty port field is simply omitted.
      Both resolve to "derive it" at the bridge's single normalizer, which is where that decision
      belongs.
    */
    const { setConfig } = stubBridge([]);
    const el = await renderPanel();
    await act(async () => {
      applyButton(el).click();
      await Promise.resolve();
    });
    const payload = setConfig.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload['templateServeHost']).toBe('');
    expect('templateServePort' in payload).toBe(false);
  });

  it('C-024: a flag in force is NAMED on the field it masks, the stored value is struck through, and the input stays EDITABLE', async () => {
    /*
      🔴 THE DEFECT THIS FORBIDS: a panel showing a value the bridge is not using. Precedence is
      flag > file and the file is what this panel edits, so a stored host can be masked at any time
      — and a confidently-wrong readout is this product's worst defect class.

      ⚠ NOT DISABLED AND NOT GREYED. Grey is this app's disabled signal, and disabling would be a
      lie: the stored value is exactly what takes over at the next start without the flag, so the
      operator must still be able to set it.
    */
    stubBridge(
      [],
      { ok: true },
      { ...SERVE_INFO, serveHost: '10.0.0.7', flagOverrides: { serveHost: '10.0.0.7' } },
      { ...CONFIG, templateServeHost: '192.168.21.93' },
    );
    const el = await renderPanel();
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
    /*
      The phantom-override guard. Inferring the mask by comparing the in-force host against the
      stored one would fire on every fresh install, where the store is empty and the derivation
      produced `127.0.0.1`. The mask comes from the bridge's flag layer or not at all.
    */
    stubBridge([], { ok: true }, { ...SERVE_INFO, serveHost: '127.0.0.1' }, CONFIG);
    const el = await renderPanel();
    expect(el.querySelector('[data-testid="serve-host-masked"]')).toBeNull();
    expect(el.querySelector('[data-testid="serve-port-masked"]')).toBeNull();
  });

  it('C-024: candidates are offered as CANDIDATES, and picking one fills the field', async () => {
    stubBridge([], { ok: true }, { ...SERVE_INFO, candidates: ['192.168.21.93', '172.17.0.1'] });
    const el = await renderPanel();
    // ⚠ The wording is the point: this list must never read as a verdict about which interface
    // the plant can reach. That is exactly `guessLanHost()`'s failure.
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

  it('C-024: a non-integer serve port blocks Apply with a stated reason', async () => {
    stubBridge([]);
    const el = await renderPanel();
    await setInput(el, 'Template serve port', '79x11');
    expect(applyButton(el).disabled).toBe(true);
    expect(el.textContent).toContain('Template serve port must be an integer');
  });
});
