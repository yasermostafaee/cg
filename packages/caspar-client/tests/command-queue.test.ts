import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import {
  AmcpAbortedError,
  AmcpDisconnectedError,
  AmcpTimeoutError,
  AmcpTransport,
  CommandQueue,
  type QueueResult,
} from '../src/index.js';

let mock: MockHandle | undefined;
let transport: AmcpTransport | undefined;
let queue: CommandQueue | undefined;

afterEach(async () => {
  if (queue) {
    queue.dispose();
    queue = undefined;
  }
  if (transport) {
    transport.destroy();
    transport = undefined;
  }
  if (mock) {
    await mock.stop();
    mock = undefined;
  }
});

async function setup(): Promise<{
  mock: MockHandle;
  transport: AmcpTransport;
  queue: CommandQueue;
}> {
  mock = await createMock({ amcpPort: 0, oscPort: 0, disableOsc: true });
  transport = new AmcpTransport();
  await transport.connect(mock.host, mock.amcpPort);
  queue = new CommandQueue(transport);
  return { mock, transport, queue };
}

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function ignore(_err: unknown): void {
  /* swallow expected error in cleanup */
}

describe('CommandQueue', () => {
  it('resolves a single VERSION round-trip', async () => {
    const { queue } = await setup();
    const result = await queue.enqueue('VERSION');
    expect(result.response).toMatchObject({
      kind: 'ok-line',
      code: 201,
      verb: 'VERSION',
      data: '2.3.2 Stable',
    });
    expect(result.seq).toBe(1);
    expect(result.ms).toBeGreaterThanOrEqual(0);
  });

  it('assigns monotonic seq numbers per queue', async () => {
    const { queue } = await setup();
    const [a, b, c] = await Promise.all([
      queue.enqueue('VERSION'),
      queue.enqueue('VERSION'),
      queue.enqueue('VERSION'),
    ]);
    expect([a.seq, b.seq, c.seq]).toEqual([1, 2, 3]);
  });

  it('returns full multi-line data on a 200 INFO ack', async () => {
    mock = await createMock({ amcpPort: 0, oscPort: 0, channels: 2, disableOsc: true });
    transport = new AmcpTransport();
    await transport.connect(mock.host, mock.amcpPort);
    queue = new CommandQueue(transport);
    const result = await queue.enqueue('INFO');
    expect(result.response.kind).toBe('ok-multi');
    if (result.response.kind === 'ok-multi') {
      expect(result.response.lines).toEqual(['1 PAL PLAYING', '2 PAL PLAYING']);
    }
  });

  it('pipelines up to N concurrent commands but preserves response order', async () => {
    const { queue, mock } = await setup();

    // Make the mock count the order in which it sees commands.
    const seenOrder: string[] = [];
    mock.setHandler('PLAY', (req) => {
      seenOrder.push(req.args[0] ?? '?');
      return { kind: 'ok', code: 202, verb: 'PLAY' };
    });

    const results = await Promise.all([
      queue.enqueue('PLAY 1-10 "a" HTML'),
      queue.enqueue('PLAY 1-11 "b" HTML'),
      queue.enqueue('PLAY 1-12 "c" HTML'),
      queue.enqueue('PLAY 1-13 "d" HTML'),
    ]);
    expect(seenOrder).toEqual(['1-10', '1-11', '1-12', '1-13']);
    expect(results.map((r) => r.seq)).toEqual([1, 2, 3, 4]);
  });

  it('urgent priority jumps ahead of normal commands still waiting', async () => {
    const { queue, mock } = await setup();
    const seen: string[] = [];
    mock.setHandler('PLAY', (req) => {
      seen.push(`PLAY:${req.args[0] ?? '?'}`);
      return { kind: 'ok', code: 202, verb: 'PLAY' };
    });
    mock.setHandler('CLEAR', (req) => {
      seen.push(`CLEAR:${req.args[0] ?? '?'}`);
      return { kind: 'ok', code: 202, verb: 'CLEAR' };
    });

    // Saturate the pipeline first with 4 normals; then enqueue more normals
    // and a CLEAR. The CLEAR (urgent) should overtake the normals still
    // waiting, but not the 4 already in-flight.
    queue.enqueue('PLAY 1-10 "a" HTML').catch(ignore);
    queue.enqueue('PLAY 1-11 "b" HTML').catch(ignore);
    queue.enqueue('PLAY 1-12 "c" HTML').catch(ignore);
    queue.enqueue('PLAY 1-13 "d" HTML').catch(ignore);
    queue.enqueue('PLAY 1-14 "e" HTML').catch(ignore);
    queue.enqueue('PLAY 1-15 "f" HTML').catch(ignore);
    const clearP = queue.enqueue('CLEAR 1-99', { priority: 'urgent' });

    await clearP;
    // Once all 7 finish, all 6 PLAYs are also done.
    await delay(50);
    // The order of "seen" should have the urgent CLEAR after the first 4
    // (which were already in-flight) but BEFORE the last 2 normals.
    expect(seen.slice(0, 4)).toEqual(['PLAY:1-10', 'PLAY:1-11', 'PLAY:1-12', 'PLAY:1-13']);
    expect(seen[4]).toBe('CLEAR:1-99');
    expect(seen.slice(5)).toEqual(['PLAY:1-14', 'PLAY:1-15']);
  });

  it('rejects with AmcpTimeoutError when no response arrives in time', async () => {
    const { queue, mock } = await setup();
    mock.setHandler('SLOW', async () => {
      await delay(300);
      return { kind: 'ok', code: 202, verb: 'SLOW' };
    });
    await expect(queue.enqueue('SLOW', { timeoutMs: 50 })).rejects.toBeInstanceOf(AmcpTimeoutError);
  });

  it('retries on timeout up to the configured budget', async () => {
    const { queue, mock } = await setup();
    let attempts = 0;
    mock.setHandler('FLAKY', async () => {
      attempts++;
      if (attempts < 2) {
        await delay(200);
        return { kind: 'ok', code: 202, verb: 'FLAKY' };
      }
      return { kind: 'ok', code: 202, verb: 'FLAKY' };
    });
    const result = await queue.enqueue('FLAKY', { timeoutMs: 50, retries: 2 });
    expect(result.response).toMatchObject({ kind: 'ok' });
    expect(attempts).toBeGreaterThanOrEqual(2);
  });

  it('rejects with AmcpAbortedError on signal.abort()', async () => {
    const { queue, mock } = await setup();
    mock.setHandler('SLOW', async () => {
      await delay(200);
      return { kind: 'ok', code: 202, verb: 'SLOW' };
    });
    const ctrl = new AbortController();
    const p = queue.enqueue('SLOW', { signal: ctrl.signal });
    setTimeout(() => ctrl.abort(), 20);
    await expect(p).rejects.toBeInstanceOf(AmcpAbortedError);
  });

  it('rejects immediately if the signal was already aborted', async () => {
    const { queue } = await setup();
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(queue.enqueue('VERSION', { signal: ctrl.signal })).rejects.toBeInstanceOf(
      AmcpAbortedError,
    );
  });

  it('rejects everything with AmcpDisconnectedError on transport close', async () => {
    const { queue, mock } = await setup();
    mock.setHandler('SLOW', async () => {
      await delay(200);
      return { kind: 'ok', code: 202, verb: 'SLOW' };
    });
    const p1 = queue.enqueue('SLOW');
    const p2 = queue.enqueue('SLOW');
    await delay(10);
    mock.closeAllAmcpConnections();
    await expect(p1).rejects.toBeInstanceOf(AmcpDisconnectedError);
    await expect(p2).rejects.toBeInstanceOf(AmcpDisconnectedError);
  });

  it("doesn't pump new commands while paused", async () => {
    const { queue, mock } = await setup();
    let seen = 0;
    mock.setHandler('PLAY', () => {
      seen++;
      return { kind: 'ok', code: 202, verb: 'PLAY' };
    });
    queue.pause();
    const p = queue.enqueue('PLAY 1-10 "a" HTML');
    await delay(50);
    expect(seen).toBe(0);
    queue.resume();
    await p;
    expect(seen).toBe(1);
  });

  it('emits backpressure once depth crosses the threshold', async () => {
    const { mock, transport } = await setup();
    mock.setHandler('SLOW', async () => {
      await delay(500);
      return { kind: 'ok', code: 202, verb: 'SLOW' };
    });
    queue = new CommandQueue(transport, {
      backpressureThreshold: 3,
      failoverSuggestedThreshold: 100,
    });
    const events: { depth: number }[] = [];
    queue.on('backpressure', (meta) => events.push(meta));

    const pending = [
      queue.enqueue('SLOW'),
      queue.enqueue('SLOW'),
      queue.enqueue('SLOW'),
      queue.enqueue('SLOW'),
    ];
    expect(events).toHaveLength(1);
    expect(events[0]?.depth).toBeGreaterThanOrEqual(3);

    // Cleanup — they'll all eventually settle.
    for (const p of pending) p.catch(ignore);
  });

  it('emits failover-suggested when depth crosses the second threshold', async () => {
    const { mock, transport } = await setup();
    mock.setHandler('SLOW', async () => {
      await delay(1000);
      return { kind: 'ok', code: 202, verb: 'SLOW' };
    });
    queue = new CommandQueue(transport, {
      backpressureThreshold: 2,
      failoverSuggestedThreshold: 4,
    });
    const events: { depth: number }[] = [];
    queue.on('failover-suggested', (meta) => events.push(meta));

    const pending = [
      queue.enqueue('SLOW'),
      queue.enqueue('SLOW'),
      queue.enqueue('SLOW'),
      queue.enqueue('SLOW'),
      queue.enqueue('SLOW'),
    ];
    expect(events.length).toBeGreaterThan(0);

    for (const p of pending) p.catch(ignore);
  });

  it('survives a transport.send rejection by failing just that command', async () => {
    const { transport, queue } = await setup();
    const sendSpy = vi.spyOn(transport, 'send').mockRejectedValueOnce(new Error('write failed'));
    const failing = queue.enqueue('VERSION');
    await expect(failing).rejects.toThrow(/write failed/);
    sendSpy.mockRestore();

    // Subsequent commands still work.
    const ok = await queue.enqueue('VERSION');
    expect(ok.response.kind).toBe('ok-line');
  });

  it('reports depth / inFlight / waiting counts', async () => {
    const { queue, mock } = await setup();
    mock.setHandler('SLOW', async () => {
      await delay(100);
      return { kind: 'ok', code: 202, verb: 'SLOW' };
    });
    expect(queue.depth).toBe(0);
    expect(queue.inFlightCount).toBe(0);
    expect(queue.waitingCount).toBe(0);
    const a = queue.enqueue('SLOW');
    const b = queue.enqueue('SLOW');
    await delay(20);
    expect(queue.inFlightCount).toBe(2);
    expect(queue.waitingCount).toBe(0);
    expect(queue.depth).toBe(2);
    let results: QueueResult[];
    try {
      results = await Promise.all([a, b]);
    } catch {
      results = [];
    }
    expect(results.length).toBe(2);
    expect(queue.depth).toBe(0);
  });
});
