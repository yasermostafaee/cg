// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConnectionBanner } from '../src/renderer/features/status/ConnectionBanner.js';
import { fillBridgeStub, setupStub } from './support/authStub.js';
import { connectionsStub } from './support/reachability.js';

/**
 * 🔴 `CENTRAL-BRIDGE-01` §1 C (D8) — **A CONSOLE THAT CANNOT REACH CG BRIDGE SAYS WHERE IT LOOKED —
 * AND, INSIDE CG CONTROL, HAS A WAY BACK.**
 *
 * The line names the address it tried ("CG Bridge not reachable at <host>:<port>") and, once the
 * probe answers, why. A console pointed at a CG Bridge it cannot reach (a mistyped separate-server
 * address, a server that moved) cannot reach Station setup to fix it — that is behind a station
 * admin's sign-in, over that very bridge — so CG Control offers to forget its station and ask
 * again. A browser follows the page's host and has nothing to forget: no such control there.
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
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function stub(options: { insideCgControl: boolean; forget?: () => boolean }): {
  forgetStation: ReturnType<typeof vi.fn>;
} {
  // `R-093` — the banner probes nothing now; any `fetch` it made would be refused here, never dialled.
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.reject(new Error('refused'))),
  );
  const forgetStation = vi.fn(options.forget ?? (() => true));
  const cg = {
    link: {
      status: () => 'disconnected' as const,
      onStatusChanged: () => () => undefined,
      resyncing: () => false,
      onResyncingChanged: () => () => undefined,
      bridgeAddress: () => '192.0.2.50:5280',
    },
    connections: connectionsStub('bridge-down'),
    setup: {
      ...setupStub(),
      canSetPlayoutAddress: () => options.insideCgControl,
      forgetStation,
    },
  };
  (window as unknown as { cg: unknown }).cg = fillBridgeStub(cg);
  return { forgetStation };
}

async function render(reload: () => void): Promise<HTMLDivElement> {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  const r = root;
  await act(async () => {
    r.render(createElement(StrictMode, null, createElement(ConnectionBanner, { reload })));
    await Promise.resolve();
  });
  return container;
}

const button = (c: HTMLElement, name: string): HTMLButtonElement | undefined =>
  [...c.querySelectorAll('button')].find((b) => b.textContent?.trim() === name);

/**
 * 🔴 `R-093` (`RELEASE-0114-01` Part C) — **THE BANNER STATES, IT DOES NOT TEACH.** Pinned as an
 * ABSENCE, the direction the rule regresses in: the next person adds one helpful line and nothing else
 * fails. Every removed phrase, in a CG Control and in a browser; control: the facts are still there.
 */
const REMOVED = [
  /nothing is listening/i,
  /switched off/i,
  /a wrong address/i,
  /firewall/i,
  /answers, but not as CG Bridge/i,
  /reissue/i,
  /not queued/i,
  /once the connection is back/i,
];

describe('R-093 — no explanation on the NOT CONNECTED banner', () => {
  for (const insideCgControl of [true, false]) {
    it(`carries the state, the address and one fact — nothing more (${insideCgControl ? 'CG Control' : 'a browser'})`, async () => {
      stub({ insideCgControl });
      const c = await render(() => undefined);
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });
      const text = c.textContent ?? '';
      for (const re of REMOVED) expect(text, `${String(re)} came back`).not.toMatch(re);
      // Control — the facts the operator acts on are there.
      expect(text).toContain('NOT CONNECTED — NOTHING CAN REACH AIR.');
      expect(text).toContain('CG Bridge not reachable at 192.0.2.50:5280.');
      expect(text).toContain('Takes are refused until it is back.');
    });
  }
});

describe('CENTRAL-BRIDGE-01 — the disconnected banner', () => {
  it('names where it looked for CG Bridge, and the one fact to act on — never why nothing answered (R-093)', async () => {
    stub({ insideCgControl: true });
    const c = await render(() => undefined);
    const alert = c.querySelector('[role="alert"]');
    expect(alert?.getAttribute('aria-label')).toBe('Bridge disconnected');
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(alert?.querySelector('span span')?.textContent?.trim()).toBe(
      'CG Bridge not reachable at 192.0.2.50:5280. Takes are refused until it is back.',
    );
  });

  it('🔴 inside CG Control, Set up again forgets this console’s station and starts it again — on the question', async () => {
    const { forgetStation } = stub({ insideCgControl: true });
    const reload = vi.fn();
    const c = await render(reload);
    const again = button(c, 'Set up again');
    expect(again).toBeDefined();
    await act(async () => {
      again?.click();
    });
    expect(forgetStation).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('a store that will not forget does not restart into the same failure', async () => {
    stub({ insideCgControl: true, forget: () => false });
    const reload = vi.fn();
    const c = await render(reload);
    await act(async () => {
      button(c, 'Set up again')?.click();
    });
    expect(reload).not.toHaveBeenCalled();
  });

  it('CONTROL — in a browser there is no station to forget, and no such control', async () => {
    const { forgetStation } = stub({ insideCgControl: false });
    const c = await render(() => undefined);
    expect(button(c, 'Set up again')).toBeUndefined();
    // The banner itself is there — the absence is the control's, not the banner's.
    expect(button(c, 'Retry connection')).toBeDefined();
    expect(forgetStation).not.toHaveBeenCalled();
  });
});
