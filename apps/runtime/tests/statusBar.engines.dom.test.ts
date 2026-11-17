// @vitest-environment jsdom
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import type { BackupChannelsState, EngineLine, EngineSessions } from '@cg/shared-ipc';
import { StatusBar } from '../src/renderer/features/status/StatusBar.js';
import { EngineNameContext, PLAYOUT_ENGINE_NAME } from '../src/renderer/ui/engineWording.js';

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

function stubBridge(link: 'live' | 'disconnected', currentPrimary: 'A' | 'B' = 'A'): void {
  const health = {
    primary: {
      label: currentPrimary,
      state: 'healthy',
      amcpAxisOk: true,
      oscFreshAt: new Date().toISOString(),
    },
    backup: {
      label: currentPrimary === 'A' ? 'B' : 'A',
      state: 'healthy',
      amcpAxisOk: true,
      oscFreshAt: new Date().toISOString(),
    },
    currentPrimary,
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

async function render(
  engines: EngineSessions | null,
  engineName = 'CasparCG',
  backupChannels?: BackupChannelsState,
): Promise<HTMLElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const r = root;
  await act(async () => {
    r.render(
      createElement(
        EngineNameContext.Provider,
        { value: engineName },
        createElement(StatusBar, {
          engines,
          ...(backupChannels === undefined ? {} : { backupChannels }),
        }),
      ),
    );
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
    expect(chips(el).map((c) => c.textContent?.trim())).toEqual(['Server B · CG license needed']);
    expect(chips(el)[0]?.getAttribute('title')).toBe('Server B: CG not licensed on this engine.');
    expect(el.textContent).toContain('Server A');
    expect(el.textContent).toContain('Server B');
  });

  it('each state that needs a person has its chip; the primary’s is keyed to A', async () => {
    stubBridge('live');
    const el = await render({
      primary: line('primary', 'needs-admin'),
      backup: line('backup', 'core-held'),
    });
    expect(chips(el).map((c) => c.textContent?.trim())).toEqual([
      'Server A · Bridge sign-in needed',
      'Server B · Controlled by another CG Bridge',
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

  it('keeps the server names in station order when B becomes the primary graphics target', async () => {
    stubBridge('live', 'B');
    const el = await render(null, PLAYOUT_ENGINE_NAME);
    const status = el.textContent ?? '';

    expect(status).toContain('Server A · CG standby · HEALTHY');
    expect(status).toContain('Server B · CG active · HEALTHY');
    expect(status.indexOf('Server A')).toBeLessThan(status.indexOf('Server B'));
    expect(el.querySelector('[title="CG Bridge command strategy"]')).toBeNull();
    expect(el.querySelector('button[aria-label="Manual CG failover"]')?.getAttribute('title')).toBe(
      'Switch graphics control to Server A. Apasai Playout switches programme separately.',
    );
  });

  it('names incomplete target setup before a switch while leaving acceptance to the Bridge', async () => {
    stubBridge('live');
    const el = await render(
      { primary: line('primary', 'signed-in'), backup: line('backup', 'needs-admin') },
      PLAYOUT_ENGINE_NAME,
      {
        backup: {
          backupHost: '192.0.2.20',
          channels: [{ channel: 1, state: 'not-mapped' }],
        },
      },
    );
    const failover = el.querySelector<HTMLButtonElement>('button[aria-label="Manual CG failover"]');
    expect(failover?.disabled).toBe(false);
    expect(failover?.title).toContain('Server B · Bridge sign-in needed');
    expect(failover?.title).toContain('Server B · 0/1 CG channels mapped');
  });

  it('disables the switch to a target controlled by another Bridge', async () => {
    stubBridge('live');
    const el = await render(
      { primary: line('primary', 'signed-in'), backup: line('backup', 'core-held') },
      PLAYOUT_ENGINE_NAME,
    );
    const failover = el.querySelector<HTMLButtonElement>('button[aria-label="Manual CG failover"]');
    expect(failover?.disabled).toBe(true);
    expect(failover?.title).toBe('Server B · Controlled by another CG Bridge');
  });

  it('shows a readable command transport policy for a station connected directly', async () => {
    stubBridge('live');
    const el = await render(null);
    expect(el.querySelector('[title="CG Bridge command strategy"]')?.textContent).toBe(
      'Synchronous mirroring',
    );
  });

  it('no engine lines (a bridge too old to know them): no chip', async () => {
    stubBridge('live');
    expect(chips(await render(null))).toEqual([]);
  });
});
