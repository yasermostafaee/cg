// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { StatusBar } from '../src/renderer/features/status/StatusBar.js';
import { healthFor, linkFor, type Reachability } from './support/reachability.js';

/**
 * §7 — `● LIVE` SAT BESIDE `● PRIMARY A OFFLINE`.
 *
 * Asked whether the link read LIVE, the owner answered "yes, but primary:
 * offline" — he had read LIVE as connected and then corrected himself from a
 * SECOND indicator in the same row. That is B-081's and R-006's shape one pill
 * along: two contradictory claims, same size, same row, and the reassuring one
 * wins.
 *
 * THE THREE STATES ARE NOT COLLAPSED, and each is asserted here, because folding
 * "bridge down" into "CasparCG down" would take away the one distinction that
 * tells the operator which machine to walk to. `offline-mock` is a FOURTH thing
 * and must keep saying exactly what it says (R-006).
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

function stubBridge(reach: Reachability): void {
  const stub = {
    connections: {
      health: () => Promise.resolve(healthFor(reach)),
      onHealthChanged: () => () => undefined,
      failover: () => Promise.resolve({ ok: false, newPrimary: 'A' as const }),
    },
    lock: {
      state: () => Promise.resolve({ engaged: false }),
      onStateChanged: () => () => undefined,
    },
    link: {
      status: () => linkFor(reach),
      onStatusChanged: () => () => undefined,
      resyncing: () => false,
      onResyncingChanged: () => () => undefined,
    },
  };
  (window as unknown as { cg: typeof stub }).cg = stub;
}

async function renderStatusBar(reach: Reachability): Promise<HTMLDivElement> {
  stubBridge(reach);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const r = root;
  await act(async () => {
    r.render(createElement(StrictMode, null, createElement(StatusBar)));
    await Promise.resolve();
    await Promise.resolve();
  });
  return container;
}

const linkPill = (el: HTMLElement): HTMLElement | null =>
  el.querySelector<HTMLElement>('[aria-label="Bridge link"]');

describe('§7 — the status bar with the bridge UP and CasparCG DOWN', () => {
  it('nothing in the whole bar reads as connected', async () => {
    const el = await renderStatusBar('caspar-down');

    // The word that was being misread is gone from the bar entirely.
    expect(el.textContent).not.toContain('LIVE');
    // …as is every other claim of a working far end.
    expect(el.textContent).not.toContain('HEALTHY');
    // What it says instead names the hop it measures and the one it does not.
    expect(linkPill(el)?.textContent).toContain('BRIDGE ONLY');
    expect(linkPill(el)?.textContent).toContain('NO CASPARCG');
    // The server pill still carries the fault in its own words, unchanged.
    expect(el.textContent).toContain('PRIMARY A');
    expect(el.textContent).toContain('OFFLINE');
  });

  it('with both hops up it says BRIDGE LIVE — the subject, never a bare LIVE', async () => {
    const el = await renderStatusBar('both-up');
    expect(linkPill(el)?.textContent).toContain('BRIDGE LIVE');
    expect(el.textContent).toContain('HEALTHY');
  });

  it('the BRIDGE being down stays its own, louder state — the three are not collapsed', async () => {
    const el = await renderStatusBar('bridge-down');
    expect(linkPill(el)?.textContent).toContain('DISCONNECTED');
    expect(linkPill(el)?.textContent).not.toContain('BRIDGE ONLY');
    expect(el.textContent).not.toContain('LIVE');
  });

  it('test mode is the FOURTH thing and keeps saying exactly what it said', async () => {
    const el = await renderStatusBar('test-mode');
    // R-006 — unchanged wording, and it still refuses to claim a server.
    expect(linkPill(el)?.textContent).toContain('TEST MODE (mock)');
    expect(linkPill(el)?.textContent).toContain('nothing reaches CasparCG');
    expect(el.textContent).toContain('NO SERVER — SIMULATED');
    expect(el.textContent).not.toContain('HEALTHY');
    // …and it is NOT re-worded into the bridge-only state: the simulator IS a
    // working far end, which is the one thing that state exists to deny.
    expect(linkPill(el)?.textContent).not.toContain('BRIDGE ONLY');
  });

  /**
   * The boot window, one surface along from §2: the pill goes quiet, but it does
   * not name a playout server nothing has reported down.
   */
  it('while health has not arrived it says CHECKING, not NO CASPARCG', async () => {
    stubBridge('unknown');
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    const r = root;
    await act(async () => {
      r.render(createElement(StrictMode, null, createElement(StatusBar)));
    });
    expect(linkPill(container)?.textContent).toContain('CHECKING CASPARCG');
    expect(linkPill(container)?.textContent).not.toContain('NO CASPARCG');
  });
});
