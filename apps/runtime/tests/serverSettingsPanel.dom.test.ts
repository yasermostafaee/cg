// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { ConnectionConfig } from '@cg/shared-ipc';
import type { StackItemState } from '@cg/shared-schema';
import { ServerSettingsPanel } from '../src/renderer/features/connections/ServerSettingsPanel.js';

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
});

function item(status: StackItemState['status'], pending = false): StackItemState {
  return { itemId: `i-${status}`, templateId: 't1', fields: {}, status, pending };
}

const CONFIG: ConnectionConfig = {
  servers: { A: { host: '127.0.0.1', amcpPort: 5250, oscPort: 6250 } },
  strategy: 'mirror-sync',
  autoFailoverEnabled: true,
};

function stubBridge(
  items: readonly StackItemState[],
  setConfigResult: { ok: boolean; reason?: 'on-air-block'; message?: string } = { ok: true },
): { setConfig: Mock } {
  const setConfig = vi.fn(() => Promise.resolve(setConfigResult));
  const stub = {
    connections: {
      config: () => Promise.resolve(CONFIG),
      onConfigChanged: () => () => undefined,
      setConfig,
    },
    stack: {
      snapshot: () => Promise.resolve(items),
      onStateChanged: () => () => undefined,
    },
  };
  (window as unknown as { cg: typeof stub }).cg = stub;
  return { setConfig };
}

async function renderPanel(): Promise<HTMLDivElement> {
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
  return container;
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
    });
  });

  it('validates ports and disables Apply on garbage', async () => {
    stubBridge([]);
    const el = await renderPanel();
    await setInput(el, 'Primary AMCP port', 'abc');
    expect(el.textContent).toContain('AMCP port must be an integer');
    expect(applyButton(el).disabled).toBe(true);
  });

  it('adding a backup submits servers.B; the bridge refusal message is surfaced', async () => {
    const { setConfig } = stubBridge([], {
      ok: false,
      reason: 'on-air-block',
      message: '1 item(s) are on air or unsettled — Remove All (or Out each item) first.',
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
    expect(el.textContent).toContain('Remove All (or Out each item) first');
  });
});
