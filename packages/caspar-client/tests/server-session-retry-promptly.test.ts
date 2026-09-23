import { afterEach, describe, expect, it } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import { PROMPT_RETRY_MS, ServerSession } from '../src/session/server-session.js';

/**
 * 🔴 `DESKTOP-APPS-01-B` B1.3 — **`retryPromptly` HURRIES THE ONE RECONNECT LOOP; IT IS NOT A
 * SECOND ONE.**
 *
 * A Playout 2.8.54 refuses AMCP until a station admin signs in, then lets this machine in within
 * seconds. The loop's backoff by then may be sitting in a 4 s wait; `retryPromptly` cuts that wait
 * short and holds every wait inside its window to {@link PROMPT_RETRY_MS} — and outside the window
 * the backoff is exactly what it was. The wait each attempt used is READ from the loop's own
 * `disconnected` reason (`backoff <n>ms`), so these assert what the loop did, not what it was told.
 */

let mock: MockHandle | undefined;
let session: ServerSession | undefined;

afterEach(async () => {
  await session?.stop();
  session = undefined;
  await mock?.stop();
  mock = undefined;
});

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const waitsOf = (reasons: readonly string[]): number[] =>
  reasons.map((r) => Number(/backoff (\d+)ms/.exec(r)?.[1] ?? Number.NaN));

async function refusingSession(backoff: { initial: number; max: number }): Promise<{
  session: ServerSession;
  reasons: string[];
}> {
  // A peer that refuses this machine — as a 2.8.54 Playout's firewall does before it trusts it.
  mock = await createMock({ amcpPort: 0, oscPort: 0, disableOsc: true, admit: () => false });
  session = new ServerSession({
    name: 'A',
    host: mock.host,
    port: mock.amcpPort,
    oscPort: 0,
    oscBindHost: '127.0.0.1',
    resyncDurationMs: 50,
    initialBackoffMs: backoff.initial,
    maxBackoffMs: backoff.max,
  });
  const reasons: string[] = [];
  session.on('disconnected', ({ reason }) => reasons.push(reason));
  session.start();
  return { session, reasons };
}

describe('ServerSession.retryPromptly — B1.3', () => {
  it('cuts a running backoff wait short, and holds every wait inside the window to PROMPT_RETRY_MS', async () => {
    const { session: s, reasons } = await refusingSession({ initial: 3000, max: 3000 });
    while (reasons.length === 0) await delay(10);
    // CONTROL — left alone, the loop sits in its 3 s wait: no second attempt within a second.
    await delay(1000);
    expect(reasons).toHaveLength(1);
    expect(waitsOf(reasons)).toEqual([3000]);

    s.retryPromptly(2000);
    await delay(1500);
    // The running 3 s wait was cut, and each attempt since waited at most PROMPT_RETRY_MS.
    const hurried = waitsOf(reasons.slice(1));
    expect(hurried.length).toBeGreaterThanOrEqual(2);
    expect(hurried.every((w) => w <= PROMPT_RETRY_MS)).toBe(true);
    // The refusals are real attempts on the wire, not a counter moving by itself.
    expect(mock?.refusedConnections).toBeGreaterThanOrEqual(3);
  });

  it('after the window the backoff is the loop’s own again', async () => {
    const { session: s, reasons } = await refusingSession({ initial: 700, max: 700 });
    while (reasons.length === 0) await delay(10);
    s.retryPromptly(300);
    await delay(1600);
    const waits = waitsOf(reasons);
    expect(waits).toContain(PROMPT_RETRY_MS); // inside the window…
    expect(waits[waits.length - 1]).toBe(700); // …and outside it, the configured backoff.
  });

  it('the link comes up on the first prompt attempt once the peer lets this machine in', async () => {
    const { session: s, reasons } = await refusingSession({ initial: 4000, max: 4000 });
    while (reasons.length === 0) await delay(10);
    mock?.setAdmission(null); // the Playout trusts this machine…
    s.retryPromptly(5000); // …and the bridge is told to hurry
    const started = Date.now();
    while (s.state !== 'healthy' && Date.now() - started < 3000) await delay(10);
    expect(s.state).toBe('healthy');
    // Well inside the 4 s wait the loop would otherwise still be sleeping.
    expect(Date.now() - started).toBeLessThan(3000);
  });

  it('never cuts the resync drain: a session mid-resync still drains for its full window', async () => {
    mock = await createMock({ amcpPort: 0, oscPort: 0, disableOsc: true });
    session = new ServerSession({
      name: 'A',
      host: mock.host,
      port: mock.amcpPort,
      oscPort: 0,
      oscBindHost: '127.0.0.1',
      resyncDurationMs: 600,
    });
    let resyncAt = 0;
    session.on('state-change', ({ to }) => {
      if (to === 'resyncing') resyncAt = Date.now();
    });
    session.start();
    while (resyncAt === 0) await delay(5);
    session.retryPromptly(5000);
    while (session.state !== 'healthy') await delay(5);
    expect(Date.now() - resyncAt).toBeGreaterThanOrEqual(550);
  });
});
