import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { channelNotDeclaredRefusal, fixedBankSlots } from '@cg/shared-ipc';
import { createBridge } from '../src/index.js';
import { openClient } from './support/auth-harness.js';
import { track } from './support/harness.js';
import {
  addressing,
  standardBank,
  twoChannelRig,
  waitUntil,
  writes,
  type TwoChannelRig,
} from './support/two-channel-rig.js';

/**
 * 🔴 `MULTI-CHANNEL-01` §2 A — **ONE BANK PER DECLARED CHANNEL**, measured at the fake's wire.
 *
 * Phase 10 could not write these (`channelIndependence.dom.test.ts`'s header): with one bank there
 * was no second channel to disturb, so a wire test would have passed because the configuration
 * could not exist. It exists now. Every negative observation below carries its positive control on
 * the same boot.
 */

let seq = 0;
const id = (): string => `mc-${String(++seq)}`;

async function takeOn(r: TwoChannelRig, channel: number, itemId: string): Promise<void> {
  const rt = r.handle.runtime;
  expect(await rt.loadFixed({ channel, layer: 99 }, itemId, 'logo', {})).toEqual({
    accepted: true,
  });
  expect((await rt.take(itemId)).accepted).toBe(true);
  await waitUntil(
    async () => (await r.lines()).includes(`CG ${String(channel)}-99 PLAY 0`),
    `the take on channel ${String(channel)}`,
  );
}

describe('§2 A — two declared banks', () => {
  it('both channels are declared, each row is published from ITS channel’s bank, and the v1 view is the first channel', async () => {
    const aliased = { ...standardBank(2), aliases: { '98': 'CLOCK-2' } };
    const r = await twoChannelRig({ banks: [aliased, standardBank(1)], awaitBlanket: false });
    const rt = r.handle.runtime;
    expect(rt.declaredChannels()).toEqual([1, 2]);
    expect(rt.fixedLayerBanks().map((b) => b.channel)).toEqual([1, 2]);
    expect(rt.fixedLayersConfig()?.channel).toBe(1);
    const state = rt.fixedLayersState();
    expect(state.filter((s) => s.channel === 1)).toHaveLength(30);
    expect(state.filter((s) => s.channel === 2)).toHaveLength(30);
    // Channel 2's row 98 carries channel 2's alias; channel 1's row 98 carries none.
    expect(state.find((s) => s.channel === 2 && s.layer === 98)?.alias).toBe('CLOCK-2');
    expect(state.find((s) => s.channel === 1 && s.layer === 98)?.alias).toBeUndefined();
    // …and a channel no bank declares is not the station's.
    expect(rt.isDeclaredChannel(3)).toBe(false);
  });

  it('the connect-time volume sweep covers EVERY declared bank — control: an undeclared channel gets none', async () => {
    const r = await twoChannelRig();
    const lines = await r.lines();
    for (const channel of [1, 2]) {
      for (const s of fixedBankSlots(standardBank(channel))) {
        expect(lines).toContain(`MIXER ${String(channel)}-${String(s.layer)} VOLUME 1`);
      }
    }
    expect(addressing(lines, 3).filter((l) => l.startsWith('MIXER'))).toEqual([]);
  });

  it('the station fence operates both channels and refuses a third, in its one sentence', async () => {
    const r = await twoChannelRig({ awaitBlanket: false });
    const client = await openClient(r.handle);
    const third = await client.ask(id(), 'fixedLayers.clear-layer', { channel: 3, layer: 99 });
    expect(third.error).toBe(channelNotDeclaredRefusal(3));
    for (const channel of [1, 2]) {
      const res = await client.ask(id(), 'fixedLayers.clear-layer', { channel, layer: 99 });
      expect(res.error, `channel ${String(channel)} passes the fence`).toBeUndefined();
      expect(res.payload).toEqual({ ok: true });
    }
  });

  it('the discovery answer declares both channels, each from its bank', async () => {
    const r = await twoChannelRig({ awaitBlanket: false });
    const client = await openClient(r.handle);
    const res = await client.ask(id(), 'channels.list');
    const channels = (res.payload as { channels: { channel: number; declared: boolean }[] })
      .channels;
    expect(channels.filter((c) => c.declared).map((c) => c.channel)).toEqual([1, 2]);
  });
});

describe('§4 — a take and a clear on one channel touch nothing on the other', () => {
  it('a TAKE on channel 1 writes nothing to channel 2 — control: the same take on channel 2 writes there', async () => {
    const r = await twoChannelRig();
    const before = (await r.lines()).length;
    await takeOn(r, 1, 'logo-1');
    const after = (await r.lines()).slice(before);
    expect(addressing(after, 1)).toContain('CG 1-99 PLAY 0');
    expect(writes(addressing(after, 2))).toEqual([]);

    const mark = (await r.lines()).length;
    await takeOn(r, 2, 'logo-2');
    const second = (await r.lines()).slice(mark);
    expect(addressing(second, 2)).toContain('CG 2-99 PLAY 0');
    expect(writes(addressing(second, 1))).toEqual([]);
  });

  it('a row CLEAR on channel 2 sends CLEAR 2-99 and the post-CLEAR mixer reset there, and nothing to channel 1', async () => {
    const r = await twoChannelRig();
    await takeOn(r, 1, 'logo-1');
    await takeOn(r, 2, 'logo-2');
    const before = (await r.lines()).length;
    expect((await r.handle.runtime.out('logo-2')).accepted).toBe(true);
    await waitUntil(
      async () => (await r.lines()).slice(before).includes('MIXER 2-99 CLEAR'),
      'the mixer reset inside the second declared bank',
    );
    const after = (await r.lines()).slice(before);
    // The reset follows the CLEAR: inside A declared bank — channel 2's — not only the first.
    expect(after.indexOf('CLEAR 2-99')).toBeGreaterThanOrEqual(0);
    expect(after.indexOf('MIXER 2-99 CLEAR')).toBeGreaterThan(after.indexOf('CLEAR 2-99'));
    expect(writes(addressing(after, 1))).toEqual([]);
    // Channel 1's graphic is still on air.
    expect(r.handle.runtime.stackSnapshot().find((i) => i.itemId === 'logo-1')?.status).toBe(
      'on-air',
    );
  });
});

describe('§2 A — the plural door and the v1 door', () => {
  it('set-banks adds channel 2 to a channel-1 station, persists `{ banks }`, and a restart boots both', async () => {
    const dir = track(fs.mkdtempSync(path.join(os.tmpdir(), 'cg-mc-banks-')), (d) => {
      fs.rmSync(d, { recursive: true, force: true });
    });
    const file = path.join(dir, 'bridge-fixed-layers.json');
    fs.writeFileSync(file, `${JSON.stringify(standardBank(1), null, 2)}\n`, 'utf8');
    const r = await twoChannelRig({
      banks: [standardBank(1)],
      bridge: { fixedLayers: undefined, fixedLayersPath: file },
      awaitBlanket: false,
    });
    expect(r.handle.runtime.declaredChannels()).toEqual([1]);
    const client = await openClient(r.handle);
    const res = await client.ask(id(), 'fixedLayers.set-banks', {
      banks: [standardBank(1), standardBank(2)],
    });
    expect(res.error).toBeUndefined();
    expect(res.payload).toEqual({ ok: true });
    expect(r.handle.runtime.declaredChannels()).toEqual([1, 2]);
    // The push carried the whole set.
    await waitUntil(
      () =>
        client
          .publishes()
          .some((f) => f.type === 'publish' && f.channel === 'fixedLayers.banks-changed'),
      'the banks push',
    );
    const saved = JSON.parse(fs.readFileSync(file, 'utf8')) as { banks: { channel: number }[] };
    expect(saved.banks.map((b) => b.channel)).toEqual([1, 2]);

    const again = track(
      await createBridge({ port: 0, connection: r.connection, fixedLayersPath: file }),
      (h) => h.close(),
    );
    expect(again.runtime.declaredChannels()).toEqual([1, 2]);
  });

  it('the v1 door on a two-channel station makes the set that one bank — refused while ours holds air on a channel it drops', async () => {
    const r = await twoChannelRig();
    const rt = r.handle.runtime;
    await takeOn(r, 1, 'logo-1');
    const before = (await r.lines()).length;
    expect(rt.setFixedLayers(standardBank(2))).toEqual({
      ok: false,
      reason: 'channel-change-refused',
      message: 'Something of ours is still on air on channel 1 — take it off air first.',
    });
    expect(rt.declaredChannels()).toEqual([1, 2]);
    expect(writes((await r.lines()).slice(before)), 'a refused change sends nothing').toEqual([]);

    // CONTROL: once channel 1 is clear, the same request leaves channel 2 alone declared.
    expect((await rt.out('logo-1')).accepted).toBe(true);
    await waitUntil(async () => (await r.lines()).includes('CLEAR 1-99'), 'the clear');
    expect(rt.setFixedLayers(standardBank(2))).toEqual({ ok: true });
    expect(rt.declaredChannels()).toEqual([2]);
  });
});
