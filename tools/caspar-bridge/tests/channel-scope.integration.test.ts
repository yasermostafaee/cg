import { describe, expect, it } from 'vitest';
import type { WsFrame } from '@cg/shared-ipc';
import type { StackItemState } from '@cg/shared-schema';
import { PUBLISH_SCOPE } from '../src/channel-scope.js';
import { openClient, type Client } from './support/auth-harness.js';
import { startFakePlayout, type FakePlayout, type FakeUserKey } from './support/fake-playout.js';
// `track` releases the fake Playout in the harness's own `afterEach`, as the rig's mock and bridge are.
import { track } from './support/harness.js';
import {
  FURNITURE,
  twoChannelRig,
  waitUntil,
  type TwoChannelRig,
} from './support/two-channel-rig.js';

/**
 * 🔴 `CENTRAL-BRIDGE-01` (D4) — **ONE CG BRIDGE, THREE CONSOLES, AND EACH IS TOLD ITS OWN CHANNELS.**
 *
 * The prompt's §5: _"a token without channel 2 → no command on channel 2, and none of its
 * state."_ `channel-scope.test.ts` measures every projection on fixtures; this runs the real
 * thing — a bridge declaring channels 1 and 2 on a loopback fake CasparCG, a fake Playout, and
 * three signed-in sockets: `cg-op1` (channel 1), `cg-op-ch2` (channel 2) and `cg-op-both` (both,
 * the CONTROL). A graphic goes on air on each channel, and each console's reads and pushes are read
 * back. Then the core restarts under the bridge, and one console's dismissal of the restart notice
 * is shown to reach only its own rows.
 */

interface Station {
  readonly rig: TwoChannelRig;
  readonly playout: FakePlayout;
}

async function station(): Promise<Station> {
  const playout = track(await startFakePlayout(), (p) => p.stop());
  const rig = await twoChannelRig({
    bridge: {
      playout: {
        auth: 'playout',
        issuer: playout.issuer,
        jwksUrl: playout.jwksUrl,
        tokenUrl: playout.tokenUrl,
        refreshUrl: playout.refreshUrl,
        revokedUrl: playout.revokedUrl,
      },
    },
  });
  return { rig, playout };
}

async function signedIn(s: Station, user: FakeUserKey): Promise<Client> {
  const client = await openClient(s.rig.handle);
  const { token } = await s.playout.issueToken({ user });
  const answer = await client.authenticate(`auth-${user}`, token);
  expect(answer.error, `${user} signed in`).toBeUndefined();
  return client;
}

let asked = 0;
async function read<T>(client: Client, channel: string, payload?: unknown): Promise<T> {
  const answer = await client.ask(`q-${String(++asked)}`, channel, payload);
  if (answer.error !== undefined) throw new Error(`${channel} refused: ${answer.error}`);
  return answer.payload as T;
}

/** Every channel number a payload names — under `channel`/`casparChannel`, and each seat's. */
function channelsIn(value: unknown): number[] {
  const found: number[] = [];
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) {
      for (const x of v) walk(x);
      return;
    }
    if (typeof v !== 'object' || v === null) return;
    for (const [key, x] of Object.entries(v)) {
      if ((key === 'channel' || key === 'casparChannel') && typeof x === 'number') found.push(x);
      else if (key === 'seatChannels' && Array.isArray(x)) found.push(...(x as number[]));
      else walk(x);
    }
  };
  walk(value);
  return found;
}

/** The channels named across every SCOPED push this socket received. */
function pushedChannels(client: Client): number[] {
  return client
    .publishes()
    .filter(
      (f): f is Extract<WsFrame, { type: 'publish' }> =>
        f.type === 'publish' && PUBLISH_SCOPE[f.channel]?.kind === 'scoped',
    )
    .flatMap((f) => channelsIn(f.payload));
}

/** Load and take the furniture template on `channel`, as the both-channels console. */
async function onAir(both: Client, channel: number, itemId: string): Promise<void> {
  const load = await both.ask(`load-${itemId}`, 'fixedLayers.load', {
    channel,
    layer: 80,
    itemId,
    templateId: FURNITURE.templateId,
    fields: {},
  });
  expect(load.payload, `load ${itemId}`).toMatchObject({ accepted: true });
  const take = await both.ask(`take-${itemId}`, 'stack.take', { itemId });
  expect(take.error, `take ${itemId}`).toBeUndefined();
}

const itemIdsOf = (items: readonly StackItemState[]): string[] => items.map((i) => i.itemId).sort();

describe('CENTRAL-BRIDGE-01 (D4) — each console is told only the channels its sign-in holds', () => {
  it('🔴 reads and pushes: channel 1’s console sees channel 1, channel 2’s sees channel 2 — CONTROL: a console holding both sees both', async () => {
    const s = await station();
    const one = await signedIn(s, 'operator');
    const two = await signedIn(s, 'channelTwo');
    const both = await signedIn(s, 'bothChannels');

    await onAir(both, 1, 'row-1');
    await onAir(both, 2, 'row-2');
    const r = s.rig.handle.runtime;
    await waitUntil(
      () => r.stackSnapshot().filter((i) => i.status === 'on-air').length === 2,
      'both rows on air',
    );

    // THE READS.
    expect(itemIdsOf(await read(one, 'stack.snapshot'))).toEqual(['row-1']);
    expect(itemIdsOf(await read(two, 'stack.snapshot'))).toEqual(['row-2']);
    expect(itemIdsOf(await read(both, 'stack.snapshot'))).toEqual(['row-1', 'row-2']);
    expect(new Set(channelsIn(await read(one, 'fixedLayers.state')))).toEqual(new Set([1]));
    expect(new Set(channelsIn(await read(two, 'fixedLayers.state')))).toEqual(new Set([2]));
    expect(new Set(channelsIn(await read(both, 'fixedLayers.state')))).toEqual(new Set([1, 2]));

    // THE PUSHES — every scoped push each console received while both rows went on air.
    await waitUntil(() => pushedChannels(both).includes(2), 'the control console heard channel 2');
    expect(pushedChannels(one), 'channel 1’s console was pushed channel 2').not.toContain(2);
    expect(pushedChannels(one), 'CONTROL — channel 1’s console heard its own').toContain(1);
    expect(pushedChannels(two), 'channel 2’s console was pushed channel 1').not.toContain(1);
    expect(pushedChannels(two)).toContain(2);

    // Configuration is the station's: every console reads both banks, so its verbs keep their
    // channel scope (the bank set decides it).
    const banks = await read<{ channel: number }[]>(one, 'fixedLayers.banks');
    expect(banks.map((b) => b.channel).sort()).toEqual([1, 2]);

    // …and the command half, beside it: channel 1's console cannot press on channel 2.
    const refused = await one.ask('clear-2', 'stack.out', { itemId: 'row-2' });
    expect(refused.error, 'channel 1’s console reached channel 2').toBeDefined();
  }, 60_000);

  it('🔴 the restart notice: each console is told its own rows, and one console’s dismissal leaves the other’s', async () => {
    const s = await station();
    const one = await signedIn(s, 'operator');
    const two = await signedIn(s, 'channelTwo');
    const both = await signedIn(s, 'bothChannels');
    await onAir(both, 1, 'row-1');
    await onAir(both, 2, 'row-2');
    const r = s.rig.handle.runtime;
    await waitUntil(
      () => r.stackSnapshot().filter((i) => i.status === 'on-air').length === 2,
      'both rows on air',
    );

    await s.rig.mock.restartCore({ downMs: 300 });
    await waitUntil(() => r.emptiedAir()?.rows.length === 2, 'the notice for both rows', 20_000);

    type Notice = { rows: { itemId: string }[] } | null;
    const rowsOf = async (c: Client): Promise<string[] | null> =>
      (await read<Notice>(c, 'air.emptied'))?.rows.map((x) => x.itemId).sort() ?? null;
    expect(await rowsOf(one)).toEqual(['row-1']);
    expect(await rowsOf(two)).toEqual(['row-2']);
    expect(await rowsOf(both)).toEqual(['row-1', 'row-2']);

    // Channel 1's operator dismisses what THEY were shown…
    expect((await one.ask('dismiss-1', 'air.dismiss-emptied')).payload).toEqual({ ok: true });
    expect(await rowsOf(one)).toBeNull();
    // …and channel 2's row is still there for channel 2's operator, who has not read it.
    expect(await rowsOf(two)).toEqual(['row-2']);
    expect(await rowsOf(both)).toEqual(['row-2']);
    // Nothing went back on air by itself, on either channel.
    expect(r.stackSnapshot().filter((i) => i.status === 'on-air')).toEqual([]);
  }, 60_000);
});
