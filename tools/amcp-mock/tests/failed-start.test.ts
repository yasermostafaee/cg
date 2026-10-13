import * as net from 'node:net';
import { describe, expect, it } from 'vitest';
import { createMock } from '../src/mock.js';

/**
 * `DEV-LOCAL-CASPAR-01` (review) — **A MOCK THAT CANNOT LISTEN LEAVES NOTHING BEHIND.** Its OSC emitter
 * binds a UDP socket and starts its tick timer BEFORE the AMCP listen, and when that listen failed both
 * stayed open: `pnpm dev:station --fake`, which ends a failed start in one line, was then kept alive by
 * them instead of exiting.
 */

/** How many UDP sockets this process holds open right now. */
const udpSockets = (): number =>
  process.getActiveResourcesInfo().filter((resource) => resource === 'UDPWrap').length;

/**
 * The count once it has reached `expected`, or after `ms` — a closed socket's handle is released a
 * loop turn after `close()` answers, so the count is read when it has had the time to settle.
 */
async function udpSocketsSettled(expected: number, ms = 1000): Promise<number> {
  const deadline = Date.now() + ms;
  while (udpSockets() !== expected && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return udpSockets();
}

describe('a failed AMCP listen', () => {
  it('rejects, and leaves no UDP socket open', async () => {
    const blocker = net.createServer();
    await new Promise<void>((resolve) => blocker.listen(0, '127.0.0.1', resolve));
    const address = blocker.address();
    const port = typeof address === 'object' && address !== null ? address.port : 0;
    try {
      const before = udpSockets();
      await expect(createMock({ amcpPort: port, oscPort: 0 })).rejects.toThrow(/EADDRINUSE/);
      expect(await udpSocketsSettled(before)).toBe(before);
    } finally {
      await new Promise<void>((resolve) => blocker.close(() => resolve()));
    }
  });

  it('CONTROL — a mock that did listen holds its UDP socket until it is stopped', async () => {
    const before = udpSockets();
    const mock = await createMock({ amcpPort: 0, oscPort: 0 });
    expect(udpSockets()).toBe(before + 1);
    await mock.stop();
    expect(await udpSocketsSettled(before)).toBe(before);
  });
});
