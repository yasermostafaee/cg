// @vitest-environment jsdom
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { StatusBar } from '../src/renderer/features/status/StatusBar.js';

/**
 * B-094 — a CasparCG can answer AMCP perfectly while none of its OSC reaches the
 * bridge (wrong `predefined-client` port, a malformed
 * `<disable-send-to-amcp-clients>`, a closed UDP port). The operator's install had
 * exactly that and nothing in the UI pointed at it: the pill read a confident green
 * PRIMARY A HEALTHY, and when the session eventually degraded on the silence,
 * DEGRADED read as "CasparCG is down" — the opposite remedy from the truth.
 *
 * These pin the indicator that ends the mis-attribution: it appears only when the
 * server is genuinely answering AMCP and we have heard NO OSC from it, and it never
 * fires on the cases that merely look similar.
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

type Link = 'live' | 'disconnected' | 'offline-mock';

interface ServerHealth {
  label: string;
  state: string;
  amcpAxisOk: boolean;
  oscFreshAt?: string;
}

function stubBridge(link: Link, primary: ServerHealth, backup?: ServerHealth): void {
  const health = {
    primary,
    ...(backup !== undefined ? { backup } : {}),
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
    lock: {
      state: () => Promise.resolve({ engaged: false }),
      onStateChanged: () => () => undefined,
    },
  };
  (window as unknown as { cg: typeof stub }).cg = stub;
}

async function render(): Promise<HTMLElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const r = root;
  await act(async () => {
    r.render(createElement(StatusBar, {}));
  });
  await act(async () => {
    await Promise.resolve();
  });
  return container;
}

const heard = (): string => new Date().toISOString();
const indicator = (el: HTMLElement, label = 'A'): HTMLElement | null =>
  el.querySelector<HTMLElement>(`[aria-label="No OSC from server ${label}"]`);
/** The pill's own state word element, so we can assert its CONFIDENCE, not just its text. */
const pillTone = (el: HTMLElement, word: string): string | null => {
  for (const span of el.querySelectorAll<HTMLElement>('span')) {
    if (span.textContent?.trim() === word) return span.style.color;
  }
  return null;
};

describe('StatusBar — the NO OSC indicator', () => {
  it('OSC flowing: no indicator', async () => {
    stubBridge('live', { label: 'A', state: 'healthy', amcpAxisOk: true, oscFreshAt: heard() });
    const el = await render();
    expect(indicator(el)).toBeNull();
    expect(el.textContent).toContain('HEALTHY'); // the pill is untouched
  });

  it('AMCP answering, no OSC ever heard: the indicator shows, beside a HEALTHY pill', async () => {
    // The exact shape of the owner's install. Both facts are true at once and the
    // bar must say both — "it is up, but I am deaf to it".
    stubBridge('live', { label: 'A', state: 'healthy', amcpAxisOk: true });
    const el = await render();
    const badge = indicator(el);
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toContain('NO OSC FROM A');
    expect(el.textContent).toContain('HEALTHY');
  });

  it('the deaf pill STOPS ASSERTING — no confident green beside the warning', async () => {
    // The failure shape this repo has diagnosed twice (B-081, R-006): two
    // contradictory claims, same size, same row, and the reassuring one wins. A
    // green HEALTHY next to an amber NO OSC would be exactly that. The state WORD
    // stays (it is the FSM's, and true on the AMCP axis); its confidence is withdrawn.
    stubBridge('live', { label: 'A', state: 'healthy', amcpAxisOk: true });
    const deaf = await render();
    const mutedTone = pillTone(deaf, 'HEALTHY');
    expect(indicator(deaf)).not.toBeNull();

    await act(async () => {
      root?.unmount();
    });
    root = null;
    container?.remove();
    container = null;

    stubBridge('live', { label: 'A', state: 'healthy', amcpAxisOk: true, oscFreshAt: heard() });
    const hearing = await render();
    const confidentTone = pillTone(hearing, 'HEALTHY');

    expect(confidentTone).not.toBeNull();
    expect(mutedTone).not.toBe(confidentTone); // muted while deaf, confident while heard
  });

  it('flags the DEAF server specifically in a mirror pair, not the healthy one', async () => {
    // A and B are independent sessions with independent taps and independent bound
    // UDP ports — one can be deaf while the other is fine, and saying "NO OSC"
    // without naming which would send the operator to the wrong box.
    stubBridge(
      'live',
      { label: 'A', state: 'healthy', amcpAxisOk: true, oscFreshAt: heard() },
      { label: 'B', state: 'healthy', amcpAxisOk: true },
    );
    const el = await render();
    expect(indicator(el, 'A')).toBeNull();
    expect(indicator(el, 'B')).not.toBeNull();
    expect(indicator(el, 'B')?.textContent).toContain('NO OSC FROM B');
  });

  it('it survives the FLAP — still shown while the pill reads DEGRADED', async () => {
    // A blind install oscillates healthy -> degraded -> reconnect. DEGRADED is the
    // moment the operator is most likely to go restart the server, so that is
    // exactly when the explanation must still be on screen. A pill STATE would
    // have been overwritten here; a separate indicator is not.
    stubBridge('live', { label: 'A', state: 'degraded', amcpAxisOk: false });
    const el = await render();
    expect(indicator(el)).not.toBeNull();
    expect(el.textContent).toContain('DEGRADED');
  });

  it('names a CONFIG fault and the remedy — never "restart the server"', async () => {
    stubBridge('live', { label: 'A', state: 'healthy', amcpAxisOk: true });
    const el = await render();
    const title = indicator(el)?.getAttribute('title') ?? '';

    expect(title).toMatch(/configuration problem/i);
    expect(title).toMatch(/casparcg\.config/i);
    expect(title).toMatch(/predefined-clients/i);
    // It must say the server is UP, so nobody power-cycles a working playout box…
    expect(title).toMatch(/server is UP/i);
    expect(title).toMatch(/not a connection failure/i);
    // …and say what is actually degraded, so urgency can be judged.
    expect(title).toMatch(/on air|orphan|restore/i);
  });

  it('does NOT fire during connect/handshake/resync — a cold start has heard nothing yet', async () => {
    for (const state of ['connecting', 'handshaking', 'resyncing']) {
      stubBridge('live', { label: 'A', state, amcpAxisOk: false });
      const el = await render();
      expect(indicator(el), state).toBeNull();
      await act(async () => {
        root?.unmount();
      });
      root = null;
      container?.remove();
      container = null;
    }
  });

  it('does NOT fire while the BRIDGE is down — that story belongs to the link, not OSC', async () => {
    // Everything is unreadable then; the pills already say UNKNOWN and the link
    // indicator says DISCONNECTED. Adding NO OSC would be a second, mis-attributed
    // alarm for a condition we cannot actually observe.
    stubBridge('disconnected', { label: 'A', state: 'healthy', amcpAxisOk: true });
    const el = await render();
    expect(indicator(el)).toBeNull();
  });

  it('does NOT fire in test mode — there is no server to be deaf to', async () => {
    stubBridge('offline-mock', { label: 'A', state: 'healthy', amcpAxisOk: true });
    const el = await render();
    expect(indicator(el)).toBeNull();
    expect(el.textContent).toContain('SIMULATED');
  });

  it('clears once OSC arrives', async () => {
    stubBridge('live', { label: 'A', state: 'healthy', amcpAxisOk: true });
    let el = await render();
    expect(indicator(el)).not.toBeNull();

    await act(async () => {
      root?.unmount();
    });
    root = null;
    container?.remove();
    container = null;

    stubBridge('live', { label: 'A', state: 'healthy', amcpAxisOk: true, oscFreshAt: heard() });
    el = await render();
    expect(indicator(el)).toBeNull();
  });
});
