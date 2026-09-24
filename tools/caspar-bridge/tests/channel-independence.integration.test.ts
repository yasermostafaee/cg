import { describe, expect, it } from 'vitest';
import {
  authzChannelRefusal,
  channelNotDeclaredRefusal,
  type FixedLayerBank,
} from '@cg/shared-ipc';
import { openClient, startAuthedBridge } from './support/auth-harness.js';
import { track } from './support/harness.js';
import {
  addressing,
  FURNITURE,
  standardBank,
  twoChannelRig,
  waitUntil,
  writes,
  type TwoChannelRig,
} from './support/two-channel-rig.js';

/**
 * 🔴 `MULTI-CHANNEL-01` §4 — **A BULK VERB ON ONE CHANNEL TOUCHES NOTHING ON ANOTHER**, measured at
 * the fake's wire with two declared channels, a graphic on air on each.
 *
 * Each negative carries its positive control on the same boot: the same verb aimed at the other
 * channel DOES reach the wire there, and a BARE call still reaches both — today's wire output,
 * exactly.
 */

let seq = 0;
const id = (): string => `ci-${String(++seq)}`;

/** A graphic on air on row 99 of each channel. */
async function onAirOnBoth(r: TwoChannelRig): Promise<void> {
  const rt = r.handle.runtime;
  for (const channel of [1, 2]) {
    const itemId = `logo-${String(channel)}`;
    expect((await rt.loadFixed({ channel, layer: 99 }, itemId, 'logo', {})).accepted).toBe(true);
    expect((await rt.take(itemId)).accepted).toBe(true);
    await waitUntil(
      async () => (await r.lines()).includes(`CG ${String(channel)}-99 PLAY 0`),
      `the take on channel ${String(channel)}`,
    );
  }
}

const statusOf = (r: TwoChannelRig, itemId: string): string | undefined =>
  r.handle.runtime.stackSnapshot().find((i) => i.itemId === itemId)?.status;

describe('§2 B — CLEAR ALL with a channel', () => {
  it('clears channel 2 alone — control: the same verb on channel 1 clears channel 1', async () => {
    const r = await twoChannelRig();
    await onAirOnBoth(r);
    const before = (await r.lines()).length;
    const res = await r.handle.runtime.clearAll(2);
    expect(res).toMatchObject({ ok: true, cleared: 1, attempted: 1 });
    const after = (await r.lines()).slice(before);
    expect(after).toContain('CLEAR 2-99');
    expect(writes(addressing(after, 1))).toEqual([]);
    expect(statusOf(r, 'logo-1')).toBe('on-air');

    const mark = (await r.lines()).length;
    expect((await r.handle.runtime.clearAll(1)).cleared).toBe(1);
    const second = (await r.lines()).slice(mark);
    expect(second).toContain('CLEAR 1-99');
    expect(writes(addressing(second, 2))).toEqual([]);
  });

  it('a BARE clear keeps today’s wire output: every bound row, on both channels', async () => {
    const r = await twoChannelRig();
    await onAirOnBoth(r);
    const before = (await r.lines()).length;
    expect(await r.handle.runtime.clearAll()).toMatchObject({ ok: true, cleared: 2, attempted: 2 });
    const after = (await r.lines()).slice(before);
    expect(after).toContain('CLEAR 1-99');
    expect(after).toContain('CLEAR 2-99');
  });
});

describe('§2 B — STOP ALL with a channel', () => {
  it('stops channel 1 alone — control: the same verb on channel 2 stops channel 2', async () => {
    const r = await twoChannelRig();
    await onAirOnBoth(r);
    const before = (await r.lines()).length;
    expect(await r.handle.runtime.stopAll(1)).toEqual({ ok: true, stopped: 1 });
    const after = (await r.lines()).slice(before);
    expect(after).toContain('CG 1-99 STOP 0');
    expect(writes(addressing(after, 2))).toEqual([]);
    expect(statusOf(r, 'logo-2')).toBe('on-air');

    const mark = (await r.lines()).length;
    expect(await r.handle.runtime.stopAll(2)).toEqual({ ok: true, stopped: 1 });
    const second = (await r.lines()).slice(mark);
    expect(second).toContain('CG 2-99 STOP 0');
    expect(writes(addressing(second, 1))).toEqual([]);
  });
});

describe('§2 B — REMOVE ALL with a channel', () => {
  it('empties channel 2 while channel 1 is ON AIR — the refusal is decided over channel 2 alone; control: channel 1 is refused', async () => {
    const r = await twoChannelRig();
    await onAirOnBoth(r);
    const rt = r.handle.runtime;
    // Channel 2's graphic comes off air first; channel 1's stays on.
    expect((await rt.out('logo-2')).accepted).toBe(true);
    await waitUntil(async () => (await r.lines()).includes('CLEAR 2-99'), 'the clear');
    await waitUntil(() => statusOf(r, 'logo-2') === 'idle', 'channel 2 settling idle');
    const before = (await r.lines()).length;
    expect(await rt.removeAll(2)).toEqual({ ok: true, removed: 1 });
    expect(rt.stackSnapshot().map((i) => i.itemId)).toEqual(['logo-1']);
    expect(writes(addressing((await r.lines()).slice(before), 1))).toEqual([]);
    // CONTROL: the same verb on channel 1 is refused all-or-nothing — its row is on air.
    const refused = await rt.removeAll(1);
    expect(refused.ok).toBe(false);
    expect(refused.removed).toBe(0);
    expect(statusOf(r, 'logo-1')).toBe('on-air');
  });
});

describe('§2 B — the snapshot with a channel', () => {
  it('lists channel 2’s items alone — control: bare lists both', async () => {
    const r = await twoChannelRig();
    await onAirOnBoth(r);
    expect(r.handle.runtime.stackSnapshot(2).map((i) => i.itemId)).toEqual(['logo-2']);
    expect(
      r.handle.runtime
        .stackSnapshot()
        .map((i) => i.itemId)
        .sort(),
    ).toEqual(['logo-1', 'logo-2']);
  });
});

describe('§2 B — over the socket, the named channel is what every gate judges', () => {
  it('the station fence refuses a bulk verb naming a channel this station does not declare — nothing is sent', async () => {
    const r = await twoChannelRig();
    await onAirOnBoth(r);
    const client = await openClient(r.handle);
    const before = (await r.lines()).length;
    const res = await client.ask(id(), 'stack.clear-all', { channel: 3 });
    expect(res.error).toBe(channelNotDeclaredRefusal(3));
    expect(writes((await r.lines()).slice(before))).toEqual([]);
    // CONTROL: the declared channel passes the same fence and clears.
    const ok = await client.ask(id(), 'stack.clear-all', { channel: 2 });
    expect(ok.error).toBeUndefined();
    await waitUntil(
      async () => (await r.lines()).slice(before).includes('CLEAR 2-99'),
      'the clear',
    );
  });

  it('auth ON: a principal holding channel 2 may clear channel 2 — control: channel 1, and the bare verb over a stack on channel 1, are refused for permission', async () => {
    const banks: FixedLayerBank[] = [standardBank(1), standardBank(2)];
    const { handle, playout } = await startAuthedBridge({ fixedLayers: banks });
    track(playout, (p) => p.stop());
    track(handle, (h) => h.close());
    // List-only loads: nothing reaches a server (the harness connection is dead by design). The
    // rows MUST exist — the bare case below is only a refusal if channel 1 holds one.
    handle.runtime.templateImport(FURNITURE, '<!doctype html><html><body></body></html>');
    for (const channel of [1, 2]) {
      expect(
        await handle.runtime.loadFixed(
          { channel, layer: 99 },
          `row-${String(channel)}`,
          'logo',
          {},
        ),
      ).toEqual({ accepted: true });
    }
    const client = await openClient(handle);
    const issued = await playout.issueToken({ user: 'channelTwo' });
    expect((await client.authenticate(id(), issued.token)).error).toBeUndefined();

    const mine = await client.ask(id(), 'stack.clear-all', { channel: 2 });
    expect(mine.error, 'channel 2 is held, so the gate passes').toBeUndefined();
    const theirs = await client.ask(id(), 'stack.clear-all', { channel: 1 });
    expect(theirs.error).toBe(authzChannelRefusal(1));
    // The bare verb reaches every row, channel 1's included — refused all-or-nothing.
    const bare = await client.ask(id(), 'stack.clear-all');
    expect(bare.error).toBe(authzChannelRefusal(1));
  });
});
