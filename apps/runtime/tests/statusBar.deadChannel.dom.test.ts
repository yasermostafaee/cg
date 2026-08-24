// @vitest-environment jsdom
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { StatusBar } from '../src/renderer/features/status/StatusBar.js';

/**
 * 🔴 **`R-058` — REACHABLE IS NOT WORKING.**
 *
 * The owner, 2026-08-23: he added a `<decklink>` consumer to `casparcg.config` for a device
 * the machine did not have. CasparCG started, AMCP connected, and this bar read
 * **BRIDGE LIVE + PRIMARY A HEALTHY** while the channel produced nothing at all — not even on
 * the `<screen />` consumer. Every signal the console had was about REACHABILITY, and every
 * one of them was TRUE. There was no signal anywhere about PRODUCTION.
 *
 * ── 🔴 THE ONE-AXIS TRAP THESE TESTS EXIST TO CATCH ─────────────────────────
 *
 * The obvious implementation is *"no framerate tick within N ms ⇒ alarm"*, and it passes a
 * naive suite while being catastrophic: applied to a channel that has NEVER ticked it fires
 * on every OSC-less install, forever. That is `B-163`'s silence-as-evidence trap, and this
 * repo has already shipped it twice — `B-101` read OSC silence as AMCP death and destroyed a
 * working socket every ~13 s; `B-053` read it as an empty layer and re-ADDed over a live
 * graphic.
 *
 * So the tests below spend at least as much effort on **what must NOT light** as on what
 * must, and the never-ticked case is asserted from two directions: no `channels` key at all,
 * and an explicitly EMPTY list.
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
  channels?: { channel: number; ticking: boolean }[];
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

async function remount(): Promise<void> {
  await act(async () => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
}

const heard = (): string => new Date().toISOString();
/** The alarm chip for a server, located by its accessible name's stable prefix. */
const alarm = (el: HTMLElement, label = 'A'): HTMLElement | null =>
  el.querySelector<HTMLElement>(`[aria-label^="Server ${label} is not producing frames"]`);
const noOsc = (el: HTMLElement, label = 'A'): HTMLElement | null =>
  el.querySelector<HTMLElement>(`[aria-label="No OSC from server ${label}"]`);
const pillTone = (el: HTMLElement, word: string): string | null => {
  for (const span of el.querySelectorAll<HTMLElement>('span')) {
    if (span.textContent?.trim() === word) return span.style.color;
  }
  return null;
};

describe('R-058 — the channel-not-producing alarm', () => {
  it('ticking normally: nothing lights', async () => {
    stubBridge('live', {
      label: 'A',
      state: 'healthy',
      amcpAxisOk: true,
      oscFreshAt: heard(),
      channels: [{ channel: 1, ticking: true }],
    });
    const el = await render();
    expect(alarm(el)).toBeNull();
    expect(el.textContent).toContain('HEALTHY');
  });

  it('🔴 ticks were arriving and STOPPED: the alarm fires', async () => {
    stubBridge('live', {
      label: 'A',
      state: 'healthy',
      amcpAxisOk: true,
      oscFreshAt: heard(),
      channels: [{ channel: 1, ticking: false }],
    });
    const el = await render();
    const chip = alarm(el);
    expect(chip).not.toBeNull();
    expect(chip?.textContent).toContain('NOT PRODUCING');
    expect(chip?.textContent).toContain('1');
  });

  it('🔴 NEVER ticked (no channels key): NO alarm — silence is not evidence', async () => {
    // The OSC-less install. `B-094`'s operator had exactly this and it is perfectly
    // ordinary; alarming here would fire forever on a plant that is completely fine.
    stubBridge('live', { label: 'A', state: 'healthy', amcpAxisOk: true, oscFreshAt: heard() });
    const el = await render();
    expect(alarm(el)).toBeNull();
  });

  it('🔴 NEVER ticked (explicitly EMPTY list): still NO alarm', async () => {
    // The same fact spelled the other way. Asserted separately because an
    // implementation that reads `channels ?? []` and one that reads `channels?.length`
    // fail differently, and only one of these two cases catches each.
    stubBridge('live', {
      label: 'A',
      state: 'healthy',
      amcpAxisOk: true,
      oscFreshAt: heard(),
      channels: [],
    });
    const el = await render();
    expect(alarm(el)).toBeNull();
  });

  it('🔴 the pill STOPS ASSERTING — no confident green beside the alarm', async () => {
    // The complaint, precisely: `PRIMARY A HEALTHY` in confident green while the channel
    // produced nothing. B-081/R-006's shape — two claims, same row, and the reassuring one
    // wins. The WORD stays (it is the FSM's, and true on the AMCP axis); the confidence goes.
    stubBridge('live', {
      label: 'A',
      state: 'healthy',
      amcpAxisOk: true,
      oscFreshAt: heard(),
      channels: [{ channel: 1, ticking: false }],
    });
    const dead = await render();
    const mutedTone = pillTone(dead, 'HEALTHY');
    expect(alarm(dead)).not.toBeNull();
    await remount();

    stubBridge('live', {
      label: 'A',
      state: 'healthy',
      amcpAxisOk: true,
      oscFreshAt: heard(),
      channels: [{ channel: 1, ticking: true }],
    });
    const live = await render();
    expect(pillTone(live, 'HEALTHY')).not.toBeNull();
    expect(mutedTone).not.toBe(pillTone(live, 'HEALTHY'));
  });

  it('resuming clears it', async () => {
    stubBridge('live', {
      label: 'A',
      state: 'healthy',
      amcpAxisOk: true,
      oscFreshAt: heard(),
      channels: [{ channel: 1, ticking: false }],
    });
    let el = await render();
    expect(alarm(el)).not.toBeNull();
    await remount();

    stubBridge('live', {
      label: 'A',
      state: 'healthy',
      amcpAxisOk: true,
      oscFreshAt: heard(),
      channels: [{ channel: 1, ticking: true }],
    });
    el = await render();
    expect(alarm(el)).toBeNull();
  });

  it('names the CHANNELS and the SERVER — a mirror pair must not send anyone to the wrong box', async () => {
    stubBridge(
      'live',
      {
        label: 'A',
        state: 'healthy',
        amcpAxisOk: true,
        oscFreshAt: heard(),
        channels: [{ channel: 1, ticking: true }],
      },
      {
        label: 'B',
        state: 'healthy',
        amcpAxisOk: true,
        oscFreshAt: heard(),
        channels: [
          { channel: 1, ticking: true },
          { channel: 2, ticking: false },
          { channel: 3, ticking: false },
        ],
      },
    );
    const el = await render();
    expect(alarm(el, 'A')).toBeNull();
    const chip = alarm(el, 'B');
    expect(chip).not.toBeNull();
    expect(chip?.textContent).toContain('B NOT PRODUCING');
    expect(chip?.textContent).toContain('2, 3');
    // …and channel 1 of B, which IS ticking, is not accused.
    expect(chip?.textContent).not.toContain('1,');
  });

  it('🔴 does NOT fire while the server is unreachable — that fault has an owner already', async () => {
    // A disconnected server's channels are not "stopped", they are unknown, and the
    // disconnection is already reported loudly. Two alarms for one fault point at two
    // different remedies, and "check the consumers" is the wrong one for a dead link.
    for (const state of ['disconnected', 'connecting', 'handshaking', 'resyncing']) {
      stubBridge('live', {
        label: 'A',
        state,
        amcpAxisOk: false,
        channels: [{ channel: 1, ticking: false }],
      });
      const el = await render();
      expect(alarm(el), state).toBeNull();
      await remount();
    }
  });

  it('DEGRADED still counts as reachable — AMCP is up, so a stopped channel is real', async () => {
    // `degraded` is OSC-silent / AMCP-up and is REACHABLE by the one canonical predicate
    // (B-100). Suppressing here would hide a genuine stoppage on every OSC-flaky install.
    stubBridge('live', {
      label: 'A',
      state: 'degraded',
      amcpAxisOk: false,
      oscFreshAt: heard(),
      channels: [{ channel: 1, ticking: false }],
    });
    const el = await render();
    expect(alarm(el)).not.toBeNull();
  });

  it('does NOT fire while the BRIDGE is down, or in test mode', async () => {
    stubBridge('disconnected', {
      label: 'A',
      state: 'healthy',
      amcpAxisOk: true,
      channels: [{ channel: 1, ticking: false }],
    });
    expect(alarm(await render())).toBeNull();
    await remount();

    stubBridge('offline-mock', {
      label: 'A',
      state: 'healthy',
      amcpAxisOk: true,
      channels: [{ channel: 1, ticking: false }],
    });
    const el = await render();
    expect(alarm(el)).toBeNull();
    expect(el.textContent).toContain('SIMULATED');
  });

  it('🔴 coexists with NO OSC rather than replacing it — different faults, different remedies', async () => {
    // Both can be true on a mirror pair at once: we are deaf to A, and B's channel has
    // stopped. Suppressing either would leave one of two real faults unreported.
    stubBridge(
      'live',
      { label: 'A', state: 'healthy', amcpAxisOk: true },
      {
        label: 'B',
        state: 'healthy',
        amcpAxisOk: true,
        oscFreshAt: heard(),
        channels: [{ channel: 2, ticking: false }],
      },
    );
    const el = await render();
    expect(noOsc(el, 'A')).not.toBeNull();
    expect(alarm(el, 'B')).not.toBeNull();
  });

  it('the wording sends the operator to the LOG and the CONSUMERS, and never claims the config', async () => {
    stubBridge('live', {
      label: 'A',
      state: 'healthy',
      amcpAxisOk: true,
      oscFreshAt: heard(),
      channels: [{ channel: 1, ticking: false }],
    });
    const el = await render();
    const title = alarm(el)?.getAttribute('title') ?? '';

    expect(title).toMatch(/STOPPED/);
    expect(title).toMatch(/consumer/i);
    expect(title).toMatch(/log/i);
    // The server is UP — nobody power-cycles a working playout box over this.
    expect(title).toMatch(/server is UP/i);
    expect(title).toMatch(/not a connection failure/i);
    /*
      🔴 It must NOT claim the config is wrong. The console cannot read casparcg.config —
      it is on the playout machine, may be remote, and AMCP does not expose it. A consumer
      that cannot start is the LIKELY cause, not an observed one, and a wrong diagnosis
      gets acted on (the `amcp-error` lesson: naming the wrong mechanism is worse than
      naming none).
    */
    expect(title).toMatch(/cannot read casparcg\.config/i);
    expect(title).not.toMatch(/the config is wrong|misconfigured/i);
  });
});
