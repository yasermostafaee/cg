import { afterEach, describe, expect, it, vi } from 'vitest';
import * as ipc from '@cg/shared-ipc';
import {
  BridgeTimeoutError,
  WebSocketRuntime,
  type WebSocketLike,
} from '../src/platform/WebSocketRuntime.js';

/**
 * 🔴 `DESKTOP-APPS-01-C` C2 — **A BRIDGE THAT DOES NOT ANSWER IS SAID IN WORDS, AND THE CHECK IS
 * WAITED FOR LONGER THAN ITS SLOWEST LINE.**
 *
 * The owner's first installed run showed `Bridge request timed out: setup.check` under the
 * Playout field — an internal channel name as the check's only output. Twenty-seven renderer sites
 * show a caught error's message, so the words are fixed where the error is MADE.
 */

let runtime: WebSocketRuntime | null = null;
afterEach(() => {
  runtime?.dispose();
  runtime = null;
  vi.useRealTimers();
});

/** A socket that answers the capability handshake — every channel — and then nothing at all. */
function silentBridge(): WebSocketLike {
  const listeners = new Map<string, ((ev?: unknown) => void)[]>();
  return {
    readyState: 1,
    send(data: string) {
      const frame = JSON.parse(data) as { id: string; channel?: string };
      if (frame.channel !== ipc.BridgeCapabilitiesChannel.name) return; // silence
      const response = {
        type: 'response',
        id: frame.id,
        payload: { channels: ipc.runtimeRequestChannelNames(ipc) },
      };
      setTimeout(() => {
        for (const l of listeners.get('message') ?? []) l({ data: JSON.stringify(response) });
      }, 0);
    },
    close() {
      /* nothing to tear down */
    },
    addEventListener(type: string, listener: (ev?: unknown) => void) {
      const list = listeners.get(type) ?? [];
      list.push(listener);
      listeners.set(type, list);
      if (type === 'open') setTimeout(() => listener(), 0);
    },
  } as unknown as WebSocketLike;
}

async function live(): Promise<WebSocketRuntime> {
  const rt = new WebSocketRuntime('ws://fake', { createWebSocket: () => silentBridge() });
  const start = Date.now();
  while (rt.link.status() !== 'live') {
    if (Date.now() - start > 5000) throw new Error('never live');
    await new Promise((r) => setTimeout(r, 10));
  }
  return rt;
}

describe('C2 — the bridge not answering, in the operator’s words', () => {
  it('a timed-out request says "The bridge did not answer in time." — the channel name is on the object, never in the message', async () => {
    runtime = await live();
    vi.useFakeTimers();
    const pending = runtime.connections.health().catch((err: unknown) => err);
    await vi.advanceTimersByTimeAsync(8000);
    const err = await pending;
    expect(err).toBeInstanceOf(BridgeTimeoutError);
    expect((err as Error).message).toBe('The bridge did not answer in time.');
    expect((err as Error).message).not.toMatch(/connections|health|timed out:/);
    expect((err as BridgeTimeoutError).channel).toBe('connections.health');
  });

  it('setup.check is waited for SETUP_CHECK_WAIT_MS — past the old 8 s — and then says so in the same words', async () => {
    runtime = await live();
    vi.useFakeTimers();
    let settled: unknown = 'pending';
    void runtime.setup
      .check({ playoutAddress: 'http://192.0.2.1:8080', origin: 'http://127.0.0.1:5174' })
      .then(
        (v) => (settled = v),
        (e: unknown) => (settled = e),
      );
    // The old one-size wait would have given up here — with no line on screen.
    await vi.advanceTimersByTimeAsync(8000);
    expect(settled).toBe('pending');
    expect(ipc.SETUP_CHECK_WAIT_MS).toBeGreaterThan(ipc.CONNECTION_CHECK_LINE_MS);
    await vi.advanceTimersByTimeAsync(ipc.SETUP_CHECK_WAIT_MS - 8000);
    expect(settled).toBeInstanceOf(BridgeTimeoutError);
    expect((settled as Error).message).toBe('The bridge did not answer in time.');
  });
});
