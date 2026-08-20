// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import type { ConnectionHealth, LockState } from '@cg/shared-ipc';
import type { BridgeLinkStatus } from '../src/shared/runtime-bridge.js';
import { StatusBar } from '../src/renderer/features/status/StatusBar.js';

/**
 * B-080 — the StatusBar must leave "Loading…" when the bridge comes up, WITHOUT a refresh.
 *
 * The bug this pins: R-006 (#312) stopped substituting the mock for an unreachable bridge, so
 * a Runtime opened before the bridge is up now mounts against the LIVE backend in
 * `disconnected` — where every read is refused by design. `useConnections` pulled health ONCE
 * at mount, that pull was refused, and nothing ever re-pulled it: the bridge publishes health
 * only when it CHANGES, and `WebSocketRuntime` re-pulls a snapshot only on a RE-connect, never
 * on the first open. The pill sat on "Loading…" beside a green ● LIVE for the life of the page.
 *
 * Why the suite never caught it: every existing StatusBar test (and the Playwright harness)
 * mounts against an ALREADY-settled bridge — `link.status() === 'live'`, `health()` resolves.
 * A fresh mount is exactly the refresh that masks the bug. So this test mounts DISCONNECTED
 * and drives the transition on the LIVE ROOT: no remount, no re-render of a new tree.
 */

interface Bridge {
  connections: {
    health: () => Promise<ConnectionHealth>;
    onHealthChanged: (h: (next: ConnectionHealth) => void) => () => void;
    failover: () => Promise<{ ok: boolean; newPrimary: 'A' | 'B' }>;
  };
  lock: {
    state: () => Promise<LockState>;
    onStateChanged: (h: (next: LockState) => void) => () => void;
  };
  link: {
    status: () => BridgeLinkStatus;
    onStatusChanged: (h: (next: BridgeLinkStatus) => void) => () => void;
    resyncing: () => boolean;
    onResyncingChanged: (h: (v: boolean) => void) => () => void;
  };
}

// B-094 — a genuinely healthy server reports WHEN it was last heard on OSC. Without
// `oscFreshAt` these fixtures describe a server that answers AMCP but is inaudible, which
// now (correctly) mutes the pill and raises NO OSC — so the fixture must say what a healthy
// server actually says, or B-081's "green while connected" assertions are testing the wrong
// server.
const HEARD_AT = '2026-07-19T10:00:00.000Z';

const HEALTHY: ConnectionHealth = {
  primary: { label: 'A', state: 'healthy', amcpAxisOk: true, oscFreshAt: HEARD_AT },
  backup: { label: 'B', state: 'healthy', amcpAxisOk: true, oscFreshAt: HEARD_AT },
  currentPrimary: 'A',
  strategy: 'mirror-sync',
};

const PRIMARY_DEGRADED: ConnectionHealth = {
  ...HEALTHY,
  primary: { label: 'A', state: 'degraded', amcpAxisOk: false, oscFreshAt: HEARD_AT },
};

/** The refusal a disconnected `WebSocketRuntime` answers every read with (R-006). */
function refused(): Promise<never> {
  return Promise.reject(new Error('Bridge disconnected — command rejected. Not sent to CasparCG.'));
}

interface Harness {
  /** Flip the link and notify subscribers, exactly as `WebSocketRuntime.#setStatus` does. */
  setLink: (next: BridgeLinkStatus) => void;
  /** Push a health delta, exactly as the bridge's `connections.health-changed` publish does. */
  publishHealth: (next: ConnectionHealth) => void;
  /** How many times the renderer has PULLED health. */
  healthPulls: () => number;
  /** Leave subsequent pulls in flight, so a publish can be raced against one. */
  holdPulls: () => void;
  /** Answer the held pull. */
  answerPull: (health: ConnectionHealth) => void;
}

function stubBridge(initial: BridgeLinkStatus): Harness {
  let status = initial;
  let pulls = 0;
  let holding = false;
  const held: ((health: ConnectionHealth) => void)[] = [];
  const linkSubs = new Set<(s: BridgeLinkStatus) => void>();
  const healthSubs = new Set<(h: ConnectionHealth) => void>();

  const bridge: Bridge = {
    connections: {
      health: () => {
        pulls += 1;
        // A read is REFUSED while the link is down — that is the R-006 contract, and the
        // rejection the old mount-time pull swallowed into a permanent "Loading…".
        if (status === 'disconnected') return refused();
        if (!holding) return Promise.resolve(HEALTHY);
        return new Promise<ConnectionHealth>((resolve) => held.push(resolve));
      },
      onHealthChanged: (h) => {
        healthSubs.add(h);
        return () => healthSubs.delete(h);
      },
      failover: () => Promise.resolve({ ok: false, newPrimary: 'A' as const }),
    },
    lock: {
      state: () => (status === 'disconnected' ? refused() : Promise.resolve({ engaged: false })),
      onStateChanged: () => () => undefined,
    },
    link: {
      status: () => status,
      onStatusChanged: (h) => {
        linkSubs.add(h);
        return () => linkSubs.delete(h);
      },
      resyncing: () => false,
      onResyncingChanged: () => () => undefined,
    },
  };
  (window as unknown as { cg: Bridge }).cg = bridge;

  return {
    setLink: (next) => {
      status = next;
      for (const h of [...linkSubs]) h(next);
    },
    publishHealth: (next) => {
      for (const h of [...healthSubs]) h(next);
    },
    healthPulls: () => pulls,
    holdPulls: () => {
      holding = true;
    },
    answerPull: (health) => {
      const resolve = held.shift();
      if (resolve === undefined) throw new Error('no pull in flight');
      resolve(health);
    },
  };
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
});

/** Run `body`, then drain the microtasks the bridge round-trips settle on. */
async function flush(body: () => void): Promise<void> {
  await act(async () => {
    body();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/** Mount ONCE. Every assertion below runs against this same root — never a fresh mount. */
async function mount(): Promise<HTMLDivElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await flush(() => {
    root?.render(createElement(StrictMode, null, createElement(StatusBar)));
  });
  return container;
}

function pill(el: HTMLElement, contains: string): HTMLElement | undefined {
  const pills = [...el.querySelectorAll<HTMLElement>('.cg-pill')];
  return pills.find((p) => p.textContent?.includes(contains));
}

/** The primary server's pill — `backup` carries its own HEALTHY, so assert on this one. */
function primaryPill(el: HTMLElement): string {
  return pill(el, 'PRIMARY')?.textContent ?? '';
}

/**
 * THE CONFIDENT-HEALTH TREATMENT (`styles.ok`) — what a pill wears when it is
 * asserting that a server is fine.
 *
 * B-081 is about a CLAIM, and the treatment makes the claim as loudly as the word:
 * a muted "UNKNOWN" beside a still-confident ● dot would not be a fix. That is
 * unchanged and is what these assertions protect.
 *
 * WHAT CHANGED IS THE MECHANISM, NOT THE ASSERTION. Confident health used to be
 * the emerald `#10B981`. The status bar may no longer borrow the on-air green or
 * the ready sky at any weight — a glance at green in the footer reads as
 * "something is on air", and those two hues already mean something on the layer
 * table (owner's call; see `StatusBar`'s style block). Health is now the primary
 * INK at bold weight against the bar's muted base text, so this matches on that
 * instead. Deliberately still a POSITIVE match on the confident treatment rather
 * than a weaker "not muted" check: the original would have gone green-blind, and
 * so would a loosened rewrite.
 */
const OK_INK = 'rgb(229, 231, 235)';

function confidentIn(scope: HTMLElement | undefined): string[] {
  if (scope === undefined) return [];
  return [...scope.querySelectorAll<HTMLElement>('span')]
    .filter((s) => s.style.color === OK_INK && s.style.fontWeight === '700')
    .map((s) => s.textContent ?? '');
}

describe('StatusBar — B-080/B-081 link transitions, without a refresh', () => {
  it('B-080 — leaves the not-ready state when the link goes disconnected → live, on the SAME mount', async () => {
    const bridge = stubBridge('disconnected');
    const el = await mount();

    // Booted before the bridge: nothing has answered, and the refused read was never fired.
    // It is not "Loading…" either — while the link is down there is nobody to load FROM.
    expect(el.textContent).toContain('SERVER HEALTH UNKNOWN');
    expect(el.textContent).not.toContain('Loading…');
    expect(bridge.healthPulls()).toBe(0);
    const footerBefore = el.querySelector('footer');

    // The bridge comes up. No remount, no refresh — only the link transition.
    await flush(() => bridge.setLink('live'));

    expect(el.textContent).not.toContain('Loading…');
    expect(el.textContent).not.toContain('UNKNOWN');
    expect(primaryPill(el)).toContain('PRIMARY A');
    expect(primaryPill(el)).toContain('HEALTHY');
    // The same <footer> node throughout: React reconciled the tree, it was never re-created.
    expect(el.querySelector('footer')).toBe(footerBefore);
  });

  it('B-081 — a mid-session DROP makes the health pills stale/UNKNOWN, never a green HEALTHY', async () => {
    const bridge = stubBridge('live');
    const el = await mount();

    // Connected: real health, stated in green. (Count the pulls RELATIVE to the mount —
    // StrictMode deliberately double-invokes the mount effect, so the absolute number is a
    // property of the harness, not of the hook.)
    expect(primaryPill(el)).toContain('HEALTHY');
    expect(confidentIn(pill(el, 'PRIMARY'))).not.toEqual([]);
    const pullsWhileConnected = bridge.healthPulls();
    expect(pullsWhileConnected).toBeGreaterThan(0);
    const footerBefore = el.querySelector('footer');

    // The bridge drops. Health reaches us only THROUGH the bridge, so the last snapshot is
    // now unverifiable — and a confident green HEALTHY beside "NOTHING CAN REACH AIR" is the
    // exact lie R-006 was filed to kill.
    await flush(() => bridge.setLink('disconnected'));

    expect(primaryPill(el)).toContain('UNKNOWN');
    expect(primaryPill(el)).not.toContain('HEALTHY');
    // Not just the word — nothing in the pill is still claiming green, ● dot included.
    expect(confidentIn(pill(el, 'PRIMARY'))).toEqual([]);
    expect(confidentIn(pill(el, 'BACKUP'))).toEqual([]);
    // The last-known reading survives ONLY as an explicitly-stale tooltip.
    expect(pill(el, 'PRIMARY')?.title).toContain('Last known before the link dropped: HEALTHY');
    // And no read is fired at a link that refuses reads by design (R-006).
    expect(bridge.healthPulls()).toBe(pullsWhileConnected);

    // Reconnect: real health resumes, on the same mount — no refresh.
    await flush(() => bridge.setLink('live'));

    expect(bridge.healthPulls()).toBe(pullsWhileConnected + 1);
    expect(primaryPill(el)).toContain('HEALTHY');
    expect(primaryPill(el)).not.toContain('UNKNOWN');
    expect(confidentIn(pill(el, 'PRIMARY'))).not.toEqual([]);
    expect(el.querySelector('footer')).toBe(footerBefore);
  });

  it('B-081 — a DEGRADED primary does not get laundered into UNKNOWN while still connected', async () => {
    // The stale state must be driven by the LINK, not by "any state I would rather not show":
    // a real DEGRADED on a live link is a true reading and must keep its own color and word.
    const bridge = stubBridge('live');
    const el = await mount();

    await flush(() => bridge.publishHealth(PRIMARY_DEGRADED));

    expect(primaryPill(el)).toContain('DEGRADED');
    expect(primaryPill(el)).not.toContain('UNKNOWN');
  });

  it('does not let a slow pull overwrite a publish that landed while it was in flight', async () => {
    const bridge = stubBridge('disconnected');
    const el = await mount();

    // The connect issues a pull; hold it in flight.
    bridge.holdPulls();
    await flush(() => bridge.setLink('live'));
    expect(el.textContent).toContain('Loading…');

    // A fresher publish lands first.
    await flush(() => bridge.publishHealth(PRIMARY_DEGRADED));
    expect(primaryPill(el)).toContain('DEGRADED');

    // The pull finally answers with the STALER snapshot — it must be dropped, not applied.
    await flush(() => bridge.answerPull(HEALTHY));
    expect(primaryPill(el)).toContain('DEGRADED');
    expect(primaryPill(el)).not.toContain('HEALTHY');
  });
});

/**
 * THE HEALTH LED FOLLOWS ITS OWN SERVER, and this is the owner-reported bug.
 *
 * With CasparCG down the footer rendered `● PRIMARY A OFFLINE` with a GREEN dot
 * beside a red word. The first version keyed the green on "not stale and not
 * OSC-deaf" — a different question — and a server reporting `disconnected` is
 * neither, so it kept the confident light. A light that says fine next to a label
 * that says offline is the B-081 contradiction reintroduced on the one element
 * that is hardest to read as text, and the reassuring half wins.
 *
 * Asserted on the DOT specifically rather than on the pill's text, because the
 * text was right the whole time.
 */
const LED_GREEN = 'rgb(16, 185, 129)';

const PRIMARY_OFFLINE: ConnectionHealth = {
  ...HEALTHY,
  primary: { label: 'A', state: 'disconnected', amcpAxisOk: false, oscFreshAt: HEARD_AT },
};

/** The ● glyphs inside a pill that are painted the confident green. */
function greenDots(scope: HTMLElement | undefined): number {
  if (scope === undefined) return 0;
  return [...scope.querySelectorAll<HTMLElement>('span')].filter(
    (s) => s.textContent?.trim() === '●' && s.style.color === LED_GREEN,
  ).length;
}

describe('the health LED agrees with its own label', () => {
  it('a HEALTHY primary lights green', async () => {
    const bridge = stubBridge('disconnected');
    const el = await mount();
    await flush(() => bridge.setLink('live'));
    await flush(() => bridge.publishHealth(HEALTHY));

    expect(primaryPill(el)).toContain('HEALTHY');
    expect(greenDots(pill(el, 'PRIMARY'))).toBe(1);
  });

  it('THE BUG: an OFFLINE primary must NOT keep a green dot', async () => {
    const bridge = stubBridge('disconnected');
    const el = await mount();
    await flush(() => bridge.setLink('live'));
    await flush(() => bridge.publishHealth(PRIMARY_OFFLINE));

    expect(primaryPill(el)).toContain('OFFLINE');
    expect(greenDots(pill(el, 'PRIMARY')), 'a green LED beside OFFLINE').toBe(0);
  });

  it('a DEGRADED primary does not keep one either', async () => {
    const bridge = stubBridge('disconnected');
    const el = await mount();
    await flush(() => bridge.setLink('live'));
    await flush(() => bridge.publishHealth(PRIMARY_DEGRADED));

    expect(primaryPill(el)).toContain('DEGRADED');
    expect(greenDots(pill(el, 'PRIMARY'))).toBe(0);
  });
});

describe('the BACKUP LED agrees with its own label too', () => {
  /**
   * Owner: a backup that is DEFINED and OFFLINE must light red. It used to be
   * permanently muted — the primary's defect one pill along, and invisible for the
   * same reason: the WORD was right the whole time.
   *
   * The `○` shape stays against the primary's `●`. That distinction says which
   * server is in charge, not how healthy it is, and it has to survive the two now
   * sharing a colour vocabulary — the pair must be tellable apart without reading
   * either word.
   */
  const BACKUP_OFFLINE: ConnectionHealth = {
    ...HEALTHY,
    backup: { label: 'B', state: 'disconnected', amcpAxisOk: false, oscFreshAt: HEARD_AT },
  };

  /** `colors.error` — `styles.failedHard`, the tone a down server wears. */
  const FAULT_RED = 'rgb(153, 27, 27)';

  function hollowDot(scope: HTMLElement | undefined): HTMLElement | undefined {
    return [...(scope?.querySelectorAll<HTMLElement>('span') ?? [])].find(
      (x) => x.textContent?.trim() === '○',
    );
  }

  it('a DEFINED but OFFLINE backup lights RED, never neutral', async () => {
    const bridge = stubBridge('disconnected');
    const el = await mount();
    await flush(() => bridge.setLink('live'));
    await flush(() => bridge.publishHealth(BACKUP_OFFLINE));

    const scope = pill(el, 'BACKUP');
    expect(scope?.textContent ?? '').toContain('OFFLINE');
    expect(greenDots(scope), 'a green LED beside an OFFLINE backup').toBe(0);
    expect(hollowDot(scope)?.style.color, 'the backup LED must read as the fault').toBe(FAULT_RED);
    // The shape is still the backup's, so the pair stays tellable apart.
    expect(hollowDot(scope)).toBeDefined();
  });

  it('a HEALTHY backup lights green, and keeps its hollow shape', async () => {
    const bridge = stubBridge('disconnected');
    const el = await mount();
    await flush(() => bridge.setLink('live'));
    await flush(() => bridge.publishHealth(HEALTHY));

    const scope = pill(el, 'BACKUP');
    expect(scope?.textContent ?? '').toContain('HEALTHY');
    expect(hollowDot(scope)).toBeDefined();
    expect(hollowDot(scope)?.style.color).toBe(LED_GREEN);
  });
});
