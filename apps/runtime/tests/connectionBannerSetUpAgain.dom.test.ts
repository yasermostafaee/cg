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
  // The reachability probe is a real `fetch` of the address: refused here, never dialled.
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

describe('CENTRAL-BRIDGE-01 — the disconnected banner', () => {
  it('names where it looked for CG Bridge — and, once the probe answers, why nothing came back', async () => {
    stub({ insideCgControl: true });
    const c = await render(() => undefined);
    const alert = c.querySelector('[role="alert"]');
    expect(alert?.getAttribute('aria-label')).toBe('Bridge disconnected');
    expect(alert?.textContent).toContain('CG Bridge not reachable at 192.0.2.50:5280');
    // A refusal comes back at once: nothing is listening there.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(alert?.textContent).toContain('nothing is listening on port 5280 there');
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
