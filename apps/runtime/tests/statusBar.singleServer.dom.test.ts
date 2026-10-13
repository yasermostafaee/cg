// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import type { ConnectionHealth } from '@cg/shared-ipc';
import { StatusBar } from '../src/renderer/features/status/StatusBar.js';

/**
 * B-046 — the StatusBar under a DECLARED single-server config:
 * `ConnectionHealth.backup` is absent, so the bar must render an explicit
 * "no backup" state (not a phantom backup card) and disable the manual
 * failover control (the bridge refuses it — there is nothing to switch to).
 *
 * jsdom is the honest instrument here: the Playwright harness pins a dead
 * bridge URL and drives the two-server MockRuntime, so the single-server
 * state is only reachable through a real bridge connection.
 */

let container: HTMLDivElement | null = null;

afterEach(() => {
  container?.remove();
  container = null;
});

function singleServerHealth(): ConnectionHealth {
  return {
    primary: { label: 'A', state: 'healthy', amcpAxisOk: true },
    currentPrimary: 'A',
    strategy: 'mirror-sync',
  };
}

function twoServerHealth(): ConnectionHealth {
  return {
    primary: { label: 'A', state: 'healthy', amcpAxisOk: true },
    backup: { label: 'B', state: 'healthy', amcpAxisOk: true },
    currentPrimary: 'A',
    strategy: 'mirror-sync',
  };
}

function stubBridge(health: ConnectionHealth): void {
  const stub = {
    connections: {
      health: () => Promise.resolve(health),
      onHealthChanged: () => () => undefined,
      failover: () => Promise.resolve({ ok: false, newPrimary: 'A' as const }),
    },
    /*
      `R-066` — the status bar now carries the sign-in state, so a stub that claims to be a
      bridge has to answer for it. `off` is what this stub means: these specs are about the
      LINK and the servers, and a console that does not authenticate is the state in which
      every assertion below was written.

      ⚠ Added rather than defended against in `useAuthSession`. A hook that read an absent
      `auth` member as "off" would also read a PRODUCTION bridge missing it as "off" — and
      `B-153`'s doctrine is that a bridge which cannot answer is the LOUDEST match, never a
      quiet default.
    */
    auth: {
      state: () => ({ kind: 'off' as const }),
      onStateChanged: () => () => undefined,
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
}

async function renderStatusBar(health: ConnectionHealth): Promise<HTMLDivElement> {
  stubBridge(health);
  container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(createElement(StrictMode, null, createElement(StatusBar)));
    // Let the health()/lock.state() promises resolve into state.
    await Promise.resolve();
  });
  return container;
}

function failoverButton(el: HTMLElement): HTMLButtonElement {
  const btn = el.querySelector<HTMLButtonElement>('button[aria-label="Manual failover"]');
  if (btn === null) throw new Error('failover button not rendered');
  return btn;
}

describe('StatusBar — B-046 single-server state', () => {
  it('renders NO BACKUP and disables manual failover when health has no backup', async () => {
    const el = await renderStatusBar(singleServerHealth());
    expect(el.textContent).toContain('NO BACKUP');
    expect(el.textContent).not.toContain('BACKUP B');
    const btn = failoverButton(el);
    expect(btn.disabled).toBe(true);
    expect(btn.title).toBe('No backup configured');
  });

  it('renders the backup card and enables manual failover when a backup is declared', async () => {
    const el = await renderStatusBar(twoServerHealth());
    expect(el.textContent).toContain('BACKUP B');
    expect(el.textContent).not.toContain('NO BACKUP');
    const btn = failoverButton(el);
    expect(btn.disabled).toBe(false);
    expect(btn.title).toBe('Switch primary to B');
  });
});
