import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import { AmcpTransport, CommandQueue, HeartbeatService } from '../src/index.js';

let mock: MockHandle | undefined;
let transport: AmcpTransport | undefined;
let queue: CommandQueue | undefined;
let heartbeat: HeartbeatService | undefined;

afterEach(async () => {
  if (heartbeat) {
    heartbeat.stop();
    heartbeat = undefined;
  }
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

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function setup(): Promise<{ queue: CommandQueue; mock: MockHandle }> {
  mock = await createMock({ amcpPort: 0, oscPort: 0, disableOsc: true });
  transport = new AmcpTransport();
  await transport.connect(mock.host, mock.amcpPort);
  queue = new CommandQueue(transport);
  return { queue, mock };
}

describe('HeartbeatService', () => {
  it('emits ping-ok on a successful VERSION round-trip', async () => {
    const { queue } = await setup();
    heartbeat = new HeartbeatService(queue, { intervalMs: 10000, timeoutMs: 1000 });
    const okP = new Promise<{ roundtripMs: number; consecutiveOks: number }>((resolve) => {
      heartbeat!.once('ping-ok', (info) => resolve(info));
    });
    heartbeat.start();
    const info = await okP;
    expect(info.consecutiveOks).toBe(1);
    expect(info.roundtripMs).toBeGreaterThanOrEqual(0);
  });

  it('emits ping-miss when the response times out', async () => {
    const { queue, mock } = await setup();
    mock.setHandler('VERSION', async () => {
      await delay(200);
      return { kind: 'ok-line', code: 201, verb: 'VERSION', data: '2.3.2 Stable' };
    });
    heartbeat = new HeartbeatService(queue, { intervalMs: 10000, timeoutMs: 50 });
    const missP = new Promise<{ consecutiveMisses: number; reason: string }>((resolve) => {
      heartbeat!.once('ping-miss', (info) => resolve(info));
    });
    heartbeat.start();
    const info = await missP;
    expect(info.consecutiveMisses).toBe(1);
    expect(info.reason).toBe('timeout');
  });

  it('emits amcp-axis-failed after the miss budget is exceeded', async () => {
    const { queue, mock } = await setup();
    mock.setHandler('VERSION', async () => {
      await delay(200);
      return { kind: 'ok-line', code: 201, verb: 'VERSION', data: '2.3.2 Stable' };
    });
    heartbeat = new HeartbeatService(queue, {
      intervalMs: 50,
      timeoutMs: 30,
      missBudget: 2,
    });
    const failedP = new Promise<void>((resolve) => {
      heartbeat!.once('amcp-axis-failed', () => resolve());
    });
    heartbeat.start();
    await failedP;
    expect(heartbeat.status.axisFailed).toBe(true);
  });

  it('emits amcp-axis-recovered after a success following amcp-axis-failed', async () => {
    const { queue, mock } = await setup();
    let attempts = 0;
    mock.setHandler('VERSION', async () => {
      attempts++;
      if (attempts <= 2) {
        await delay(200);
      }
      return { kind: 'ok-line', code: 201, verb: 'VERSION', data: '2.3.2 Stable' };
    });
    heartbeat = new HeartbeatService(queue, {
      intervalMs: 50,
      timeoutMs: 30,
      missBudget: 2,
    });
    const failedP = new Promise<void>((resolve) => {
      heartbeat!.once('amcp-axis-failed', () => resolve());
    });
    heartbeat.start();
    await failedP;
    const recoveredP = new Promise<void>((resolve) => {
      heartbeat!.once('amcp-axis-recovered', () => resolve());
    });
    await recoveredP;
    expect(heartbeat.status.axisFailed).toBe(false);
  });

  it('treats a non-OK response code as a miss', async () => {
    const { queue, mock } = await setup();
    mock.setHandler('VERSION', () => ({ kind: 'err', code: 500, verb: 'VERSION' }));
    heartbeat = new HeartbeatService(queue, { intervalMs: 10000, timeoutMs: 100 });
    const missP = new Promise<{ reason: string }>((resolve) => {
      heartbeat!.once('ping-miss', (info) => resolve(info));
    });
    heartbeat.start();
    const info = await missP;
    expect(info.reason).toBe('code=500');
  });

  it('resets miss counter after a single success', async () => {
    const { queue, mock } = await setup();
    let attempts = 0;
    mock.setHandler('VERSION', async () => {
      attempts++;
      if (attempts === 1) {
        await delay(200); // first miss
      }
      return { kind: 'ok-line', code: 201, verb: 'VERSION', data: '2.3.2 Stable' };
    });
    heartbeat = new HeartbeatService(queue, {
      intervalMs: 80,
      timeoutMs: 50,
      missBudget: 5,
    });
    heartbeat.start();
    await delay(300);
    expect(heartbeat.status.consecutiveMisses).toBe(0);
    expect(heartbeat.status.consecutiveOks).toBeGreaterThan(0);
  });

  it('skips overlapping ticks when a ping is still in flight', async () => {
    const { queue, mock } = await setup();
    let pingsHandled = 0;
    mock.setHandler('VERSION', async () => {
      pingsHandled++;
      await delay(150);
      return { kind: 'ok-line', code: 201, verb: 'VERSION', data: '2.3.2 Stable' };
    });
    heartbeat = new HeartbeatService(queue, { intervalMs: 30, timeoutMs: 500 });
    heartbeat.start();
    await delay(220);
    // ~7 ticks at 30 ms cadence over 220 ms, but only 1-2 should have been
    // sent because each blocks for 150 ms.
    expect(pingsHandled).toBeLessThanOrEqual(3);
  });

  it('stop() halts further pings', async () => {
    const { queue } = await setup();
    heartbeat = new HeartbeatService(queue, { intervalMs: 30 });
    const okSpy = vi.fn();
    heartbeat.on('ping-ok', okSpy);
    heartbeat.start();
    await delay(50);
    heartbeat.stop();
    const count = okSpy.mock.calls.length;
    await delay(100);
    expect(okSpy.mock.calls.length).toBe(count);
  });

  it('starts and stops idempotently', async () => {
    const { queue } = await setup();
    heartbeat = new HeartbeatService(queue, { intervalMs: 10000 });
    heartbeat.start();
    heartbeat.start();
    heartbeat.stop();
    heartbeat.stop();
    expect(heartbeat.status.running).toBe(false);
  });
});
