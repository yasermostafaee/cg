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
    strategy: 'mirror-sync',
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

/**
 * B-082 — a LOAD is not an on-air action, and a dead link is not a load failure.
 *
 * The counterpart to R-006 above, and its boundary: `take`/`update`/`out` must reach the
 * wire to mean anything, so they are refused. A load only puts the item on the operator's
 * stack — nothing reaches air — so refusing it (or, as it did, ATTEMPTING the pre-roll
 * `CG ADD`, failing on the dead link, and acking `amcp-send-failed`) parked every row in
 * ERROR. "This item is broken" was never true; "the server isn't there" was.
 *
 * The fix skips the pre-roll rather than deferring it. Nothing is queued — the item merely
 * has no live producer, which is the SAME condition every item is in after a reconnect
 * (`#loaded` is per-server, cleared on drop). B-039's lazy re-ADD already covers exactly
 * that: `take` re-issues the `CG ADD` before the `CG PLAY`, pulling the template and the
 * CURRENT fields from the Reconciler at the moment of use rather than replaying a stored
 * command. So the offline-loaded item plays normally once the link is back — and until then
 * the on-air verbs stay refused.
 */
describe('load while disconnected — B-082', () => {
  it('ACCEPTS the load and rests the item at `loaded` — never ERROR', async () => {
    const rt = await bootDisconnected();

    await expect(rt.load('item1', 'lower-third', {})).resolves.toEqual({ accepted: true });

    const item = rt.stackSnapshot().find((i) => i.itemId === 'item1');
    expect(item?.status).toBe('loaded');
    // The regression, stated as the assertion that would have caught it.
    expect(item?.status).not.toBe('error');
    expect(item?.errorCode).toBeUndefined();
    expect(item?.pending).toBe(false);
  });

  it('does not make the item playable — the on-air verbs stay REFUSED', async () => {
    const rt = await bootDisconnected();
    await rt.load('item1', 'lower-third', {});

    // Offline safety is NARROWED to the on-air verbs, not removed.
    await expect(rt.take('item1')).resolves.toEqual({
      accepted: false,
      errorCode: 'disconnected',
    });
    expect(rt.stackSnapshot().find((i) => i.itemId === 'item1')?.status).toBe('loaded');
  });

  it('queues NOTHING: reconnecting does not put the skipped pre-roll on air by itself', async () => {
    const oscPort = await freeUdpPort();
    const rt = new CasparRuntime(connectionFor(1, oscPort));
    runtime = rt;
    rt.start();
    await rt.startServing();
    rt.templateImport(TEMPLATE, HTML);
    await rt.load('item1', 'lower-third', {});

    mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 40 });
    await rt.setConfig(connectionFor(mock.amcpPort, oscPort));
    await rt.whenServerHealthy(HEALTH_MS);

    // The load was not deferred and replayed — coming back does not, by itself, put a
    // graphic on air. Only the operator's take does (R-006's "refuse, never queue" holds).
    expect(mock.layerState({ channel: 1, layer: 10 })?.onAir).not.toBe(true);
  });

  it('PLAYS normally once the server is back — the take lazily re-ADDs before the PLAY', async () => {
    const oscPort = await freeUdpPort();
    const rt = new CasparRuntime(connectionFor(1, oscPort));
    runtime = rt;
    rt.start();
    await rt.startServing();
    rt.templateImport(TEMPLATE, HTML);

    await rt.load('item1', 'lower-third', {});
    expect(rt.stackSnapshot().find((i) => i.itemId === 'item1')?.status).toBe('loaded');

    mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 40 });
    await rt.setConfig(connectionFor(mock.amcpPort, oscPort));
    await rt.whenServerHealthy(HEALTH_MS);

    // The item the operator loaded while the server was down takes exactly like any other.
    // `CG PLAY` only renders over a live producer (B-039), so an on-air layer here IS the
    // proof that the lazy re-ADD supplied the pre-roll the offline load never sent.
    expect((await rt.take('item1')).accepted).toBe(true);
    await expect(mock.waitForCgAddResolution({ channel: 1, layer: 10 })).resolves.toBe('resolved');
    expect(mock.layerState({ channel: 1, layer: 10 })?.onAir).toBe(true);
  });
});
