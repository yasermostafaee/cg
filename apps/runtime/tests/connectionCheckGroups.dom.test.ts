// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { CONNECTION_CHECK_GROUPS, versionMismatchRefusal } from '@cg/shared-ipc';
import { ConnectionCheckList } from '../src/renderer/features/firstRun/ConnectionCheckList.js';
import {
  consoleCheckLines,
  type ShownCheckLine,
} from '../src/renderer/features/firstRun/firstRunStation.js';
import { colors } from '../src/renderer/theme.js';

/**
 * 🔴 `R-081` (`CONSOLE-POLISH-01` §6) — **THE CHECK READS IN THE ORDER THINGS HAPPEN.** The owner's
 * first-run (2026-09-30): the "waiting for sign-in" line sat in the middle of the list. Now the lines
 * are shown in four headed groups — Reachable, Versions, Sign-in, After sign-in — and the console adds
 * the three lines only it can write: where it found CG Bridge, CG Bridge's release against its own,
 * and its own sign-in.
 */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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

async function render(lines: readonly ShownCheckLine[], grouped: boolean): Promise<HTMLElement> {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  const r = root;
  await act(async () => {
    r.render(
      createElement(StrictMode, null, createElement(ConnectionCheckList, { lines, grouped })),
    );
  });
  return container;
}

const line = (
  id: ShownCheckLine['id'],
  status: ShownCheckLine['status'] = 'pass',
): ShownCheckLine => ({
  id,
  status,
  text: id,
});

describe('R-081 — four groups, in the order things happen', () => {
  it('🔴 the groups and their lines in order, whatever order the lines arrived in; a group with no line is not shown', async () => {
    const c = await render(
      [
        line('topology', 'warn'),
        line('amcp', 'wait'),
        line('cors'),
        line('signin', 'wait'),
        line('ports'),
        line('api'),
        line('bridge-ports', 'fail'),
        line('route'),
        line('proxy'),
        line('bridge'),
      ],
      true,
    );
    const groups = [...c.querySelectorAll('[data-check-group]')];
    // No Versions line was given: that group is not drawn.
    expect(groups.map((g) => g.getAttribute('aria-label'))).toEqual([
      'Reachable',
      'Sign-in',
      'After sign-in',
    ]);
    expect(groups.map((g) => g.querySelector('h4')?.textContent)).toEqual([
      'Reachable',
      'Sign-in',
      'After sign-in',
    ]);
    const idsIn = (g: Element): (string | null)[] =>
      [...g.querySelectorAll('[data-check]')].map((li) => li.getAttribute('data-check'));
    expect(idsIn(groups[0] as Element)).toEqual([
      'proxy',
      'route',
      'api',
      'bridge',
      'bridge-ports',
    ]);
    expect(idsIn(groups[1] as Element)).toEqual(['cors', 'signin']);
    // The line that waits for a sign-in is AFTER the sign-in, never in the middle.
    expect(idsIn(groups[2] as Element)).toEqual(['amcp']);
    // 🔴 `R-090` — an older CG Bridge's `ports` and `topology` lines are in no group: never shown.
    expect(c.querySelector('[data-check="ports"]')).toBeNull();
    expect(c.querySelector('[data-check="topology"]')).toBeNull();
  });

  it('🔴 `R-084` — the Versions group: CG Bridge’s release, then the Playout’s version CG Bridge read', async () => {
    const c = await render(
      [
        { id: 'playout-version', status: 'pass', text: 'Playout 2.9.2.' },
        { id: 'bridge-version', status: 'pass', text: 'CG Bridge 0.11.1 · this console 0.11.1.' },
        line('api'),
      ],
      true,
    );
    const versions = c.querySelector('[data-check-group][aria-label="Versions"]');
    expect(
      [...(versions?.querySelectorAll('[data-check]') ?? [])].map((li) => li.textContent),
    ).toEqual(['CG Bridge 0.11.1 · this console 0.11.1.', 'Playout 2.9.2.']);
  });

  it('CONTROL — ungrouped (the sign-in gate’s one deciding line) is one plain list, as before', async () => {
    const c = await render([line('api', 'fail')], false);
    expect(c.querySelector('[data-check-group]')).toBeNull();
    expect(c.querySelectorAll('[data-check]')).toHaveLength(1);
  });

  it('shows the engine release without the core commit and build identifiers', async () => {
    const c = await render(
      [
        {
          id: 'amcp',
          status: 'pass',
          text: 'CasparCG on 192.0.2.1 answered VERSION: 2.19.0 4f57b1d ApasaiCIaB-CgRecovery1.',
        },
      ],
      false,
    );
    expect(c.textContent).toBe('APASAI Playout Engine on 192.0.2.1 answered VERSION: 2.19.0.');
  });

  it.each([
    ['1.2.11', 'warn'],
    ['1.3.1', 'fail'],
  ])(
    'shows a version mismatch with %s in amber even while passing checks are folded',
    async (bridgeVersion, status) => {
      const lines = consoleCheckLines({
        bridgeAddress: '192.0.2.20:5280',
        bridgeVersion,
        consoleVersion: '1.2.10',
        auth: { kind: 'off' },
      });
      const c = await render([...lines, line('playout-version')], true);
      const bridge = c.querySelector<HTMLElement>('[data-check="bridge-version"]');
      const expectedInk = document.createElement('span');
      expectedInk.style.color = colors.pending;
      expect(bridge?.dataset.status).toBe(status);
      expect(bridge?.hidden).toBe(false);
      expect(bridge?.querySelector('[data-check-icon]')).toHaveProperty(
        'style.color',
        expectedInk.style.color,
      );
      expect(bridge?.querySelector('span:nth-child(2)')).toHaveProperty(
        'style.color',
        expectedInk.style.color,
      );
      expect(c.querySelector<HTMLElement>('[data-check="playout-version"]')?.dataset.status).toBe(
        'pass',
      );
    },
  );
});

describe('R-081 — the lines only the console can write', () => {
  const SIGNED_OUT = { kind: 'signed-out' } as const;

  it('🔴 R-080 — where it found CG Bridge; the release pair on one line; not signed in yet waits', () => {
    const lines = consoleCheckLines({
      bridgeAddress: '192.0.2.20:5280',
      bridgeVersion: '0.10.2',
      consoleVersion: '0.10.0',
      auth: SIGNED_OUT,
    });
    expect(lines).toEqual([
      { id: 'bridge', status: 'pass', text: 'CG Bridge found at 192.0.2.20:5280.' },
      {
        id: 'bridge-version',
        status: 'warn',
        text: 'CG Bridge 0.10.2 · this console 0.10.0. Version mismatch.',
      },
      { id: 'signin', status: 'wait', text: "This console's sign-in: not signed in yet." },
    ]);
  });

  it('another release is the ONE mismatch sentence, a failure', () => {
    const [, version] = consoleCheckLines({
      bridgeAddress: '192.0.2.20:5280',
      bridgeVersion: '0.11.0',
      consoleVersion: '0.10.0',
      auth: SIGNED_OUT,
    });
    expect(version).toEqual({
      id: 'bridge-version',
      status: 'fail',
      text: versionMismatchRefusal('0.10.0', '0.11.0'),
    });
  });

  it('signed in names the user in an isolate; a fact not known yet is left out, never guessed', () => {
    const lines = consoleCheckLines({
      bridgeAddress: null,
      consoleVersion: '0.10.0',
      auth: {
        kind: 'signed-in',
        principal: {
          name: 'زهرا موسوی',
          sub: 'u-1',
          roles: ['station-admin'],
          channels: '*',
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          nameTruncated: false,
        },
        permittedChannels: [1],
      },
    });
    expect(lines.map((l) => l.id)).toEqual(['signin']);
    expect(lines[0]?.status).toBe('pass');
    expect(lines[0]?.text).toBe(
      `This console is signed in as ${String.fromCodePoint(0x2068)}زهرا موسوی${String.fromCodePoint(0x2069)}.`,
    );
    // Auth off: there is no sign-in on this station, so no line about one.
    expect(
      consoleCheckLines({ bridgeAddress: null, consoleVersion: '0.10.0', auth: { kind: 'off' } }),
    ).toEqual([]);
  });

  /*
    🔴 `RELEASE-0112-01` (`R-085`) — ONE LINE PER ENGINE in the Sign-in group: the backup engine's CG
    Bridge session beside the primary's, in the engine line's own words.
  */
  it('🔴 the backup engine’s line: waiting for a station admin, passed when signed in, failed otherwise — and none without a server B', () => {
    const backup = (state: 'needs-admin' | 'signed-in' | 'not-licensed') => ({
      engine: 'backup' as const,
      address: 'http://192.0.2.20:8080',
      state,
      ...(state === 'signed-in' ? { name: 'cg-admin' } : {}),
      version: '2.9.2',
    });
    const of = (b: ReturnType<typeof backup> | null) =>
      consoleCheckLines({
        bridgeAddress: null,
        consoleVersion: '0.11.2',
        auth: { kind: 'off' },
        backupEngine: b,
      });
    expect(of(backup('needs-admin'))).toEqual([
      {
        id: 'bridge-session-backup',
        status: 'wait',
        text: 'CG Bridge on the backup engine: Needs a station admin to sign in.',
      },
    ]);
    expect(of(backup('signed-in'))[0]).toMatchObject({ status: 'pass' });
    expect(of(backup('not-licensed'))[0]).toEqual({
      id: 'bridge-session-backup',
      status: 'fail',
      text: 'CG Bridge on the backup engine: CG not licensed on this engine.',
    });
    expect(of(null)).toEqual([]);
    // It sits in the Sign-in group, right after the primary's.
    const signIn = CONNECTION_CHECK_GROUPS.find((g) => g.id === 'sign-in');
    expect(signIn?.lines).toEqual(['cors', 'signin', 'bridge-session', 'bridge-session-backup']);
  });
});
