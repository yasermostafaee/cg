// @vitest-environment jsdom
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ConnectionCheckList } from '../src/renderer/features/firstRun/ConnectionCheckList.js';
import type { ShownCheckLine } from '../src/renderer/features/firstRun/firstRunStation.js';
import { installMemoryStorage } from './support/localStorage.js';

/**
 * 🔴 `R-092` (`RELEASE-0114-01` A6) — **WHAT NEEDS ATTENTION, IN FULL; THE PASSES, IN ONE LINE.** The
 * owner's check was a long list of ticks around the two lines that mattered. Each group shows its
 * failures, warnings and waits; its passes fold into `<group> · n OK`; a group of passes alone is that
 * line; `Show all` opens every line, remembered for this viewer.
 */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  installMemoryStorage();
});

afterEach(async () => {
  await unmount();
});

async function unmount(): Promise<void> {
  if (root !== null) {
    const r = root;
    await act(async () => {
      r.unmount();
    });
  }
  root = null;
  container?.remove();
  container = null;
}

const LINES: ShownCheckLine[] = [
  { id: 'proxy', status: 'warn', text: "On CG Bridge's machine, the tunnel singbox_tun is up." },
  { id: 'route', status: 'pass', text: "CG Bridge's route to 10.0.0.7 leaves through Ethernet." },
  { id: 'api', status: 'pass', text: 'The Playout answers and publishes 1 signing key.' },
  { id: 'bridge', status: 'pass', text: 'CG Bridge found at 10.0.0.7:5280.' },
  { id: 'bridge-version', status: 'pass', text: 'CG Bridge 0.11.4 · this console 0.11.4.' },
  { id: 'playout-version', status: 'pass', text: 'Playout 2.9.5.' },
  { id: 'cors', status: 'pass', text: 'Sign-in from this console: direct.' },
  { id: 'signin', status: 'wait', text: "This console's sign-in: not signed in yet." },
];

async function render(): Promise<HTMLDivElement> {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  const r = root;
  await act(async () => {
    r.render(createElement(ConnectionCheckList, { lines: LINES, grouped: true }));
  });
  return container;
}

const shown = (c: HTMLElement, group: string): string[] =>
  [...c.querySelectorAll(`[data-check-group="${group}"] li`)]
    .filter((li) => !(li as HTMLElement).hidden)
    .map((li) => li.textContent ?? '');
const head = (c: HTMLElement, group: string): string | null =>
  c.querySelector(`[data-check-group="${group}"] h4`)?.textContent ?? null;
const toggle = (c: HTMLElement): HTMLButtonElement | null =>
  c.querySelector<HTMLButtonElement>('[data-check-show-all]');

describe('R-092 — the check folds its passes', () => {
  it('🔴 a mixed group shows what needs attention and ONE line for its passes; a clean group is that line alone', async () => {
    const c = await render();
    expect(head(c, 'reach')).toBe('Reachable');
    expect(shown(c, 'reach')).toEqual([
      "On CG Bridge's machine, the tunnel singbox_tun is up.",
      'Reachable · 3 OK',
    ]);
    // Versions: passes only — one line, no heading over it.
    expect(head(c, 'versions')).toBeNull();
    expect(shown(c, 'versions')).toEqual(['Versions · 2 OK']);
    // Sign-in: the wait in full, its pass folded.
    expect(shown(c, 'sign-in')).toEqual([
      "This console's sign-in: not signed in yet.",
      'Sign-in · 1 OK',
    ]);
    // Every line is still THERE, its state readable — folded, never removed.
    expect(c.querySelector('[data-check="api"]')?.getAttribute('data-status')).toBe('pass');
    expect((c.querySelector('[data-check="api"]') as HTMLElement).hidden).toBe(true);
    expect(getComputedStyle(c.querySelector('[data-check="api"]') as HTMLElement).display).toBe(
      'none',
    );
    // The fold line is not a check line: no probe of `[data-check]` counts it.
    expect(c.querySelectorAll('[data-check]')).toHaveLength(LINES.length);
  });

  it('Show all opens every line, and THIS viewer’s choice survives a reload; Show less folds again', async () => {
    const c = await render();
    expect(toggle(c)?.textContent).toBe('Show all');
    await act(async () => {
      toggle(c)?.click();
    });
    expect(shown(c, 'reach')).toHaveLength(4);
    expect(head(c, 'versions')).toBe('Versions');
    expect(c.querySelector('[data-check-fold]')).toBeNull();
    expect(toggle(c)?.textContent).toBe('Show less');

    // A reload: the same viewer opens it as they left it.
    await unmount();
    const again = await render();
    expect(toggle(again)?.textContent).toBe('Show less');
    expect(shown(again, 'versions')).toEqual([
      'CG Bridge 0.11.4 · this console 0.11.4.',
      'Playout 2.9.5.',
    ]);

    await act(async () => {
      toggle(again)?.click();
    });
    expect(shown(again, 'versions')).toEqual(['Versions · 2 OK']);
    await unmount();
    const folded = await render();
    expect(toggle(folded)?.textContent).toBe('Show all');
  });

  it('CONTROL — nothing to fold (no pass at all): no fold line and no toggle', async () => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    const r = root;
    await act(async () => {
      r.render(
        createElement(ConnectionCheckList, {
          lines: LINES.filter((l) => l.status !== 'pass'),
          grouped: true,
        }),
      );
    });
    expect(container.querySelector('[data-check-fold]')).toBeNull();
    expect(toggle(container)).toBeNull();
  });
});
