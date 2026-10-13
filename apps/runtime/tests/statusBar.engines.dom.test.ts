// @vitest-environment jsdom
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import type { EngineLine, EngineSessions } from '@cg/shared-ipc';
import { StatusBar } from '../src/renderer/features/status/StatusBar.js';

/**
 * 🔴 `RELEASE-0112-01` (`R-085`) — **AN ENGINE'S CG BRIDGE SESSION, BESIDE ITS SERVER.** The bar carries
 * a chip only for an engine that needs a person — a sign-in, a license, an approval, an engine that does
 * not answer, a core another CG Bridge drives — keyed to its server label, the sentence on its title. A
 * signed-in engine is the absence of an alarm. While the link is down nothing is said.
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
});

function stubBridge(link: 'live' | 'disconnected'): void {
  const health = {
    primary: {
      label: 'A',
      state: 'healthy',
      amcpAxisOk: true,
      oscFreshAt: new Date().toISOString(),
    },
    backup: {
      label: 'B',
      state: 'healthy',
      amcpAxisOk: true,
      oscFreshAt: new Date().toISOString(),
    },
    currentPrimary: 'A',
    strategy: 'mirror-sync',
  };
  const stub = {
    link: {
      status: () => link,
      onStatusChanged: () => () => undefined,
      resyncing: () => false,
      onResyncingChanged: () => () => undefined,
    },
    connections: {
      health: () => Promise.resolve(health),
      onHealthChanged: () => () => undefined,
    },
    auth: {
      state: () => ({ kind: 'off' as const }),
      onStateChanged: () => () => undefined,
    },
    lock: {
      state: () => Promise.resolve({ engaged: false }),
      onStateChanged: () => () => undefined,
    },
  };
  (window as unknown as { cg: typeof stub }).cg = stub;
}

async function render(engines: EngineSessions | null): Promise<HTMLElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const r = root;
  await act(async () => {
    r.render(createElement(StatusBar, { engines }));
  });
  await act(async () => {
    await Promise.resolve();
  });
  return container;
}

const line = (engine: 'primary' | 'backup', state: EngineLine['state']): EngineLine => ({
  engine,
  address: engine === 'primary' ? 'http://192.0.2.10:8080' : 'http://192.0.2.20:8080',
  state,
  version: '2.9.2',
});
const chips = (el: HTMLElement): HTMLElement[] => [
  ...el.querySelectorAll<HTMLElement>('[data-engine-chip]'),
];

describe('RELEASE-0112-01 — the status bar’s engine chips', () => {
  it('🔴 the backup not licensed: one chip beside BACKUP B, in words — the pills unchanged', async () => {
    stubBridge('live');
    const el = await render({
      primary: line('primary', 'signed-in'),
      backup: line('backup', 'not-licensed'),
    });
    expect(chips(el).map((c) => c.textContent?.trim())).toEqual(['B: CG NOT LICENSED']);
    expect(chips(el)[0]?.getAttribute('title')).toBe(
      'Backup engine: CG not licensed on this engine.',
    );
    expect(el.textContent).toContain('PRIMARY A');
    expect(el.textContent).toContain('BACKUP B');
  });

  it('each state that needs a person has its chip; the primary’s is keyed to A', async () => {
    stubBridge('live');
    const el = await render({
      primary: line('primary', 'needs-admin'),
      backup: line('backup', 'core-held'),
    });
    expect(chips(el).map((c) => c.textContent?.trim())).toEqual([
      'A: SIGN IN CG BRIDGE',
      'B: HELD — ANOTHER CG BRIDGE',
    ]);
  });

  it('CONTROL — both signed in: no chip; and with the link down nothing is said', async () => {
    stubBridge('live');
    const signed = { primary: line('primary', 'signed-in'), backup: line('backup', 'signed-in') };
    expect(chips(await render(signed))).toEqual([]);
    await act(async () => {
      root?.unmount();
    });
    root = null;
    container?.remove();
    stubBridge('disconnected');
    const el = await render({
      primary: line('primary', 'needs-admin'),
      backup: line('backup', 'unreachable'),
    });
    expect(chips(el)).toEqual([]);
  });

  it('no engine lines (a bridge too old to know them): no chip', async () => {
    stubBridge('live');
    expect(chips(await render(null))).toEqual([]);
  });
});
