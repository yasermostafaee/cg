import { afterEach, describe, expect, it } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import { ConnectionService } from '../src/main/services/ConnectionService.js';

/**
 * Smoke tests against real amcp-mocks. The full FSM is tested in
 * caspar-client's M4.4 suite; here we just confirm that the runtime
 * composition wires correctly.
 */

let service: ConnectionService | undefined;
let mocks: [MockHandle, MockHandle] | undefined;

afterEach(async () => {
  if (service) {
    await service.stop();
    service = undefined;
  }
  if (mocks) {
    for (const m of mocks) await m.stop();
    mocks = undefined;
  }
});

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function setup(): Promise<ConnectionService> {
  const mockA = await createMock({ amcpPort: 0, oscPort: 0, disableOsc: true });
  const mockB = await createMock({ amcpPort: 0, oscPort: 0, disableOsc: true });
  mocks = [mockA, mockB];
  service = new ConnectionService({
    servers: {
      A: { host: mockA.host, amcpPort: mockA.amcpPort, oscPort: 0 },
      B: { host: mockB.host, amcpPort: mockB.amcpPort, oscPort: 0 },
    },
    strategy: 'mirror-sync',
    autoFailoverEnabled: true,
  });
  return service;
}

describe('ConnectionService', () => {
  it('starts and reports both sessions reaching healthy', async () => {
    const svc = await setup();
    svc.start();
    // Wait for at least one healthy event from both sides.
    let healthyA = false;
    let healthyB = false;
    await new Promise<void>((resolve) => {
      svc.sessionA.once('healthy', () => {
        healthyA = true;
        if (healthyB) resolve();
      });
      svc.sessionB.once('healthy', () => {
        healthyB = true;
        if (healthyA) resolve();
      });
    });
    expect(svc.isReady()).toBe(true);
  });

  it('getConfig returns the constructor input verbatim', async () => {
    const svc = await setup();
    expect(svc.getConfig()).toMatchObject({
      strategy: 'mirror-sync',
      autoFailoverEnabled: true,
    });
  });

  it('emits health-changed on session state transitions', async () => {
    const svc = await setup();
    let events = 0;
    svc.on('health-changed', () => events++);
    svc.start();
    await delay(200);
    expect(events).toBeGreaterThan(0);
  });

  it('failover swaps the primary', async () => {
    const svc = await setup();
    svc.start();
    await new Promise<void>((resolve) => svc.sessionA.once('healthy', () => resolve()));
    expect(svc.adapter.currentPrimary).toBe('A');
    const newPrimary = await svc.failover('manual');
    expect(newPrimary).toBe('B');
  });

  it('records lastFailover on health snapshot after a failover (M9.0)', async () => {
    const svc = await setup();
    svc.start();
    await new Promise<void>((resolve) => svc.sessionA.once('healthy', () => resolve()));
    expect(svc.getHealth().lastFailover).toBeUndefined();
    await svc.failover('manual');
    const info = svc.getHealth().lastFailover;
    expect(info).toBeDefined();
    expect(info?.reason).toBe('manual');
    expect(info?.from).toBe('A');
    expect(info?.to).toBe('B');
    expect(typeof info?.at).toBe('string');
  });

  it('setStrategy stores the desired value', async () => {
    const svc = await setup();
    svc.setStrategy('journal-replay');
    expect(svc.getConfig().strategy).toBe('journal-replay');
  });

  it('sessionState diagnostic returns one session at a time', async () => {
    const svc = await setup();
    expect(svc.sessionState('A')).toBe('disconnected');
  });
});
