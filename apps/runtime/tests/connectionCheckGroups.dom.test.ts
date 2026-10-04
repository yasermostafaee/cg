// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { versionMismatchRefusal } from '@cg/shared-ipc';
import { ConnectionCheckList } from '../src/renderer/features/firstRun/ConnectionCheckList.js';
import {
  consoleCheckLines,
  type ShownCheckLine,
} from '../src/renderer/features/firstRun/firstRunStation.js';

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
    expect(idsIn(groups[0] as Element)).toEqual(['proxy', 'route', 'api', 'bridge', 'ports']);
    expect(idsIn(groups[1] as Element)).toEqual(['cors', 'signin']);
    // The line that waits for a sign-in is AFTER the sign-in, never in the middle.
    expect(idsIn(groups[2] as Element)).toEqual(['amcp', 'topology']);
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
      { id: 'bridge-version', status: 'pass', text: 'CG Bridge 0.10.2 · this console 0.10.0.' },
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
});
