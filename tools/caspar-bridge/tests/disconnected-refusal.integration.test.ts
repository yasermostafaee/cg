import * as dgram from 'node:dgram';
import { afterEach, describe, expect, it } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import { CasparRuntime } from '../src/caspar-runtime.js';
import type { ConnectionConfig, TemplateInfo } from '@cg/shared-ipc';
import { HEALTH_MS } from './support/harness.js';

/**
 * R-006 — the on-air verbs are REFUSED while the server is not connected.
 *
 * The failure this prevents is the one that was observed live: an operator presses PLAY at
 * a server that is not there, the item picks up an optimistic status, and the row claims
 * air for a graphic that does not exist. The refusal happens BEFORE the intent is applied —
 * that is the whole point. An intent that never exists cannot lie.
 *
 * And it is a refusal, NOT a deferral: nothing is queued for later delivery (the reconnect
 * path re-delivers template HTML, never stack intents — a queued take would be stranded).
 */

let mock: MockHandle | null = null;
let runtime: CasparRuntime | null = null;

afterEach(async () => {
  await runtime?.stop();
  runtime = null;
  await mock?.stop();
  mock = null;
});

function freeUdpPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const sock = dgram.createSocket('udp4');
    sock.once('error', reject);
    sock.bind(0, '127.0.0.1', () => {
      const port = sock.address().port;
      sock.close(() => resolve(port));
    });
  });
}

function connectionFor(amcpPort: number, oscPort: number): ConnectionConfig {
  return {
    servers: { A: { host: '127.0.0.1', amcpPort, oscPort } },
    strategy: 'single',
    autoFailoverEnabled: false,
  };
}

const TEMPLATE: TemplateInfo = {
  templateId: 'lower-third',
  name: 'Lower Third',
  templateType: 'lower-third',
  fields: [],
};
const HTML = '<!doctype html><html><head><meta charset="utf-8"></head><body>hi</body></html>';

/** A runtime whose CasparCG is NOT there: AMCP port 1 never answers, so it never goes healthy. */
async function bootDisconnected(): Promise<CasparRuntime> {
  const rt = new CasparRuntime(connectionFor(1, await freeUdpPort()));
  runtime = rt;
  rt.start();
  await rt.startServing();
  rt.templateImport(TEMPLATE, HTML);
  return rt;
}

describe('on-air verbs while disconnected — R-006', () => {
  it('REFUSES take with errorCode disconnected, and records no intent at all', async () => {
    const rt = await bootDisconnected();
    await rt.load('item1', 'lower-third', {});
    const before = rt.stackSnapshot().find((i) => i.itemId === 'item1');

    const result = await rt.take('item1');

    expect(result).toEqual({ accepted: false, errorCode: 'disconnected' });

    // The load-time status is untouched: no `playing`, no `on-air`, nothing optimistic.
    const after = rt.stackSnapshot().find((i) => i.itemId === 'item1');
    expect(after?.status).toBe(before?.status);
    expect(after?.status).not.toBe('on-air');
    expect(after?.status).not.toBe('playing');
    expect(after?.pending).toBe(false);
  });

  it('REFUSES update and out the same way', async () => {
    const rt = await bootDisconnected();
    await rt.load('item1', 'lower-third', {});

    await expect(rt.update('item1', { title: 'x' }, 'merge')).resolves.toEqual({
      accepted: false,
      errorCode: 'disconnected',
    });
    await expect(rt.out('item1')).resolves.toEqual({
      accepted: false,
      errorCode: 'disconnected',
    });

    const after = rt.stackSnapshot().find((i) => i.itemId === 'item1');
    expect(after?.status).not.toBe('updating');
    expect(after?.status).not.toBe('exiting');
  });

  it('does NOT queue the refused command — reconnecting does not play it', async () => {
    const oscPort = await freeUdpPort();
    // Boot against a dead AMCP port, then bring a real server up on a DIFFERENT port and
    // reconfigure onto it — the closest thing to "the server came back".
    const rt = new CasparRuntime(connectionFor(1, oscPort));
    runtime = rt;
    rt.start();
    await rt.startServing();
    rt.templateImport(TEMPLATE, HTML);
    await rt.load('item1', 'lower-third', {});

    expect((await rt.take('item1')).accepted).toBe(false);

    mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 40 });
    await rt.setConfig(connectionFor(mock.amcpPort, oscPort));
    await rt.whenServerHealthy(HEALTH_MS);

    // The refused take was NOT replayed: nothing went to air behind the operator's back.
    expect(mock.layerState({ channel: 1, layer: 10 })?.onAir).not.toBe(true);
  });

  it('accepts the verbs again once the server is healthy', async () => {
    const oscPort = await freeUdpPort();
    mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 40 });
    const rt = new CasparRuntime(connectionFor(mock.amcpPort, oscPort));
    runtime = rt;
    rt.start();
    await rt.startServing();
    rt.templateImport(TEMPLATE, HTML);
    await rt.whenServerHealthy(HEALTH_MS);

    await rt.load('item1', 'lower-third', {});
    await expect(mock.waitForCgAddResolution({ channel: 1, layer: 10 })).resolves.toBe('resolved');

    // The gate lifts cleanly — the producer-state rules that choose the verb are unchanged.
    expect((await rt.take('item1')).accepted).toBe(true);
    expect(mock.layerState({ channel: 1, layer: 10 })?.onAir).toBe(true);
  });
});
