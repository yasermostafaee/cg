// @vitest-environment jsdom
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  LocalBridgeHelp,
  localBridgeLine,
  outcomeLine,
} from '../src/renderer/features/firstRun/LocalBridgeHelp.js';
import type { LocalBridgeOutcome, LocalBridgeState } from '../src/shared/runtime-bridge.js';
import { fillBridgeStub, setupStub } from './support/authStub.js';

/**
 * 🔴 `R-091` (`RELEASE-0114-01` A5) — **CG BRIDGE ON THIS MACHINE, NOT RUNNING: said, and the one step.**
 * Words and an app step, never a PowerShell line; `Free the port` only for a holder of ours.
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

const here = (
  service: Extract<LocalBridgeState, { kind: 'here' }>['service'],
  holder: { pid: number; name: string; ours: boolean } | null = null,
): LocalBridgeState => ({ kind: 'here', service, holder });

describe('R-091 — what is said, and what is offered', () => {
  it('installed and stopped: said, and Start CG Bridge', () => {
    expect(localBridgeLine(here('stopped'), '127.0.0.1:5280')).toEqual({
      text: 'CG Bridge is installed here but not running.',
      offer: { action: 'start' },
    });
  });
  it('not installed: said, nothing offered', () => {
    expect(localBridgeLine(here('not-installed'), '127.0.0.1:5280')).toEqual({
      text: 'CG Bridge is not installed here.',
      offer: null,
    });
  });
  it('🔴 a holder of OURS: named, and Free the port for its PID', () => {
    expect(
      localBridgeLine(here('stopped', { pid: 4120, name: 'cg-bridge.exe', ours: true }), 'x'),
    ).toEqual({
      text: 'TCP 5280 here is held by cg-bridge.exe (PID 4120).',
      offer: { action: 'free', pid: 4120 },
    });
  });
  it('🔴 a FOREIGN holder (the Playout engine, CasparCG, anything else): named, and NEVER offered a stop', () => {
    for (const name of ['casparcg.exe', 'Apasai.Playout.exe', 'node.exe']) {
      const line = localBridgeLine(here('stopped', { pid: 77, name, ours: false }), 'x');
      expect(line?.text).toBe(`TCP 5280 here is held by ${name} (PID 77).`);
      expect(line?.offer).toBeNull();
    }
  });
  it('another machine, or no Windows to read: nothing at all', () => {
    expect(localBridgeLine({ kind: 'elsewhere' }, 'x')).toBeNull();
    expect(localBridgeLine(null, 'x')).toBeNull();
    expect(localBridgeLine(here('unknown'), 'x')).toBeNull();
  });
  it('outcomes in words; none for one that worked', () => {
    const o = (x: LocalBridgeOutcome): string | null => outcomeLine(x);
    expect(o({ kind: 'done' })).toBeNull();
    expect(o({ kind: 'declined' })).toBe(
      'Administrator rights were declined. Nothing was changed.',
    );
    expect(o({ kind: 'refused', code: 5 })).toBe(
      'That program is not CG Bridge. Nothing was stopped.',
    );
    expect(o({ kind: 'refused', code: 4 })).toBe('CG Bridge did not start.');
  });
  it('no line carries a PowerShell command', () => {
    const all = [
      localBridgeLine(here('stopped'), 'x'),
      localBridgeLine(here('not-installed'), 'x'),
      localBridgeLine(here('running'), '127.0.0.1:5280'),
      localBridgeLine(here('stopped', { pid: 1, name: 'cg-bridge.exe', ours: true }), 'x'),
    ].map((l) => l?.text ?? '');
    for (const text of all)
      expect(text).not.toMatch(/PowerShell|Stop-Service|Start-Service|sc\.exe|netstat|taskkill/i);
  });
});

describe('R-091 — the step, from Set up', () => {
  it('🔴 Start CG Bridge asks the shell to start it, then the check runs again', async () => {
    let state: LocalBridgeState = here('stopped');
    const acts: unknown[][] = [];
    const stub = fillBridgeStub({
      setup: {
        ...setupStub(),
        localBridgeState: vi.fn(() => Promise.resolve(state)),
        localBridgeAct: vi.fn((...args: unknown[]) => {
          acts.push(args);
          state = here('running');
          return Promise.resolve({ kind: 'done' as const });
        }),
      },
    });
    (window as unknown as { cg: typeof stub }).cg = stub;
    const onFixed = vi.fn();
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    const r = root;
    await act(async () => {
      r.render(
        createElement(LocalBridgeHelp, { host: '127.0.0.1', address: '127.0.0.1:5280', onFixed }),
      );
    });
    await act(async () => {
      await Promise.resolve();
    });
    const c = container;
    expect(c.textContent).toContain('CG Bridge is installed here but not running.');
    const start = [...c.querySelectorAll('button')].find(
      (b) => b.textContent === 'Start CG Bridge',
    );
    expect(start).toBeDefined();
    await act(async () => {
      start?.click();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(acts).toEqual([['start', undefined]]);
    expect(onFixed).toHaveBeenCalledTimes(1);
  });

  it('declined: said, nothing changed, and no re-check', async () => {
    const stub = fillBridgeStub({
      setup: {
        ...setupStub(),
        localBridgeState: () => Promise.resolve(here('stopped')),
        localBridgeAct: () => Promise.resolve({ kind: 'declined' as const }),
      },
    });
    (window as unknown as { cg: typeof stub }).cg = stub;
    const onFixed = vi.fn();
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    const r = root;
    await act(async () => {
      r.render(
        createElement(LocalBridgeHelp, { host: '127.0.0.1', address: '127.0.0.1:5280', onFixed }),
      );
    });
    await act(async () => {
      await Promise.resolve();
    });
    const c = container;
    await act(async () => {
      [...c.querySelectorAll('button')].find((b) => b.textContent === 'Start CG Bridge')?.click();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(c.querySelector('[data-local-bridge-outcome]')?.textContent).toBe(
      'Administrator rights were declined. Nothing was changed.',
    );
    expect(onFixed).not.toHaveBeenCalled();
  });
});
