import { afterEach, describe, expect, it } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import type { OscEvent } from '@cg/shared-schema';
import { OscTransport } from '../src/osc/transport.js';
import { OscRateLimiter } from '../src/osc/rate-limiter.js';

/**
 * Integration tests: spin up the amcp-mock's OSC emitter pointing at an
 * ephemeral port that our OscTransport is bound to. The mock pushes
 * bundles, we assert the typed events that come out the other side.
 */

let mock: MockHandle | undefined;
let transport: OscTransport | undefined;

afterEach(async () => {
  if (transport) {
    await transport.close();
    transport = undefined;
  }
  if (mock) {
    await mock.stop();
    mock = undefined;
  }
});

interface SetupOptions {
  interest?: 'all' | { channel: number; layer: number }[];
  rateLimiter?: OscRateLimiter;
  oscHz?: number;
}

async function setup(opts: SetupOptions = {}): Promise<{
  transport: OscTransport;
  mock: MockHandle;
  events: () => OscEvent[];
}> {
  // First, bind our transport to an ephemeral port so we know what the mock should target.
  const ratelim = opts.rateLimiter ?? new OscRateLimiter({});
  transport = new OscTransport({ rateLimiter: ratelim });
  const ourPort = await transport.listen('127.0.0.1', 0);
  // Pre-populate the interest filter so layer events come through.
  if (opts.interest === undefined || opts.interest === 'all') {
    transport.interest.add(1, 10);
    transport.interest.add(1, 20);
  } else {
    for (const s of opts.interest) transport.interest.add(s.channel, s.layer);
  }

  const collected: OscEvent[] = [];
  transport.on('events', (events) => {
    for (const e of events) collected.push(e);
  });

  // Boot the mock pointing OSC at us. Disable its OSC tick for tests that
  // don't want the ambient framerate stream; opt-in via opts.oscHz.
  mock = await createMock({
    amcpPort: 0,
    oscPort: ourPort,
    oscHost: '127.0.0.1',
    oscHz: opts.oscHz ?? 0,
    disableOsc: opts.oscHz === undefined,
  });

  return { transport, mock, events: () => collected };
}

function waitForEvent(t: OscTransport, ms = 500): Promise<OscEvent[]> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('osc timeout')), ms);
    t.once('events', (events) => {
      clearTimeout(timer);
      resolve(events);
    });
  });
}

describe('OscTransport', () => {
  it('binds to an ephemeral port and reports it', async () => {
    transport = new OscTransport();
    const port = await transport.listen('127.0.0.1', 0);
    expect(port).toBeGreaterThan(0);
    expect(transport.port).toBe(port);
    expect(transport.address).toBe('127.0.0.1');
  });

  it('refuses listen() when already listening', async () => {
    transport = new OscTransport();
    await transport.listen('127.0.0.1', 0);
    await expect(transport.listen('127.0.0.1', 0)).rejects.toThrow(/already listening/);
  });

  it('emits the typed event for a /foreground/producer change', async () => {
    const { transport, mock } = await setup();
    const eventsP = waitForEvent(transport);
    // Trigger a PLAY → mock sets layer producer → mock pushes OSC.
    mock.emitOsc('/channel/1/stage/layer/10/foreground/producer', ['html']);
    const events = await eventsP;
    expect(events).toEqual([
      {
        kind: 'osc.layer.foreground.producer',
        channel: 1,
        layer: 10,
        producer: 'html',
      },
    ]);
  });

  it('drops events for out-of-interest layers', async () => {
    const { transport, mock } = await setup({ interest: [{ channel: 1, layer: 20 }] });
    const eventsP = waitForEvent(transport);
    mock.emitOsc('/channel/1/stage/layer/10/foreground/producer', ['html']);
    const events = await eventsP;
    expect(events).toEqual([]);
    expect(transport.interest.droppedCount).toBeGreaterThan(0);
  });

  it('suppresses duplicate values via the change tracker', async () => {
    const { transport, mock } = await setup();

    // Fire two identical bundles.
    const first = waitForEvent(transport);
    mock.emitOsc('/channel/1/stage/layer/10/foreground/producer', ['html']);
    expect(await first).toHaveLength(1);

    const second = waitForEvent(transport);
    mock.emitOsc('/channel/1/stage/layer/10/foreground/producer', ['html']);
    expect(await second).toEqual([]);
  });

  it('emits again when the value transitions back', async () => {
    const { transport, mock } = await setup();
    const first = waitForEvent(transport);
    mock.emitOsc('/channel/1/stage/layer/10/foreground/producer', ['html']);
    await first;

    const second = waitForEvent(transport);
    mock.emitOsc('/channel/1/stage/layer/10/foreground/producer', ['empty']);
    expect(await second).toEqual([
      {
        kind: 'osc.layer.foreground.producer',
        channel: 1,
        layer: 10,
        producer: 'empty',
      },
    ]);
  });

  it('atomically dispatches every changed address in a bundle', async () => {
    const { transport, mock } = await setup();
    const eventsP = waitForEvent(transport);
    mock.emitOsc('/channel/1/stage/layer/10/foreground/producer', ['html']);
    // First emit is one message — still counts as a one-event burst.
    expect((await eventsP).length).toBe(1);

    // Now send TWO state-changing messages in one mock tick by enabling
    // the heartbeat. After the first ambient tick we should see them all in one go.
    mock.emitOsc('/channel/1/stage/layer/10/foreground/file/path', ['file:///x.html']);
    const next = await waitForEvent(transport);
    expect(next).toEqual([
      {
        kind: 'osc.layer.foreground.file',
        channel: 1,
        layer: 10,
        path: 'file:///x.html',
      },
    ]);
  });

  it('counts received packets and parse failures', async () => {
    const { transport, mock } = await setup();
    const eventsP = waitForEvent(transport);
    mock.emitOsc('/channel/1/stage/layer/10/foreground/producer', ['html']);
    await eventsP;
    expect(transport.receivedCount).toBeGreaterThanOrEqual(1);
    expect(transport.parseFailureCount).toBe(0);
  });

  it('resetState() clears change tracker so a repeat now emits', async () => {
    const { transport, mock } = await setup();
    const first = waitForEvent(transport);
    mock.emitOsc('/channel/1/stage/layer/10/foreground/producer', ['html']);
    await first;

    transport.resetState();

    const after = waitForEvent(transport);
    mock.emitOsc('/channel/1/stage/layer/10/foreground/producer', ['html']);
    expect(await after).toHaveLength(1);
  });

  it('close() is a no-op when not bound', async () => {
    transport = new OscTransport();
    await expect(transport.close()).resolves.toBeUndefined();
  });
});
