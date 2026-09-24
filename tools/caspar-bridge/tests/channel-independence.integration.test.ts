import { describe, expect, it } from 'vitest';
import {
  authzChannelRefusal,
  channelNotDeclaredRefusal,
  type FixedLayerBank,
  type SourceAssignments,
  type SourceCatalog,
  type TemplateInfo,
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

// ── §2 C — PANIC for one channel ───────────────────────────────────────────────────────────

const SCENE = { width: 1920, height: 1080 };
const CENTRED = { anchor: 'center' as const, offset: { x: 0, y: 0 } };
const RECT = { x: 0, y: 100, width: 400, height: 225 };
const plate = (
  elementId: string,
  sourceId: string,
  x: number,
): { elementId: string; sourceId: string; rect: typeof RECT; dynamic: false } => ({
  elementId,
  sourceId,
  rect: { ...RECT, x },
  dynamic: false,
});

/** A graphics BED with two plates — it loads onto a bed row, and its plates onto the plate band. */
const TWO_BOX: TemplateInfo = {
  templateId: 'two-box',
  templateType: 'two-box',
  fields: [],
  liveSources: {
    resolution: SCENE,
    defaultPosition: CENTRED,
    sources: [plate('el-1', 'guest-1', 100), plate('el-2', 'guest-2', 600)],
  },
};

/** Two routed inputs, read FROM channels 3 and 4 of the fake — never a write target. */
const CATALOG: SourceCatalog = {
  sources: [
    { id: 'src-a', name: 'Studio A', format: '1080i5000', producer: { kind: 'route', channel: 3 } },
    { id: 'src-b', name: 'Baku', format: '1080i5000', producer: { kind: 'route', channel: 4 } },
  ],
  layerRange: { start: 60, end: 79 },
};

const ASSIGNMENTS: SourceAssignments = {
  assignments: [
    { templateId: 'two-box', plateId: 'guest-1', sourceId: 'src-a' },
    { templateId: 'two-box', plateId: 'guest-2', sourceId: 'src-b' },
  ],
};

/** A plate-bearing bed on air on each channel's row 59, both plates raised, both audible. */
async function audibleOnBoth(r: TwoChannelRig): Promise<void> {
  const rt = r.handle.runtime;
  rt.templateImport(TWO_BOX, '<!doctype html><html><body>bed</body></html>');
  for (const channel of [1, 2]) {
    const itemId = `bed-${String(channel)}`;
    expect(await rt.loadFixed({ channel, layer: 59 }, itemId, 'two-box', {})).toEqual({
      accepted: true,
    });
    expect((await rt.take(itemId)).accepted).toBe(true);
    await waitUntil(
      () => (rt.liveLayers().get(itemId) ?? []).length === 2,
      `channel ${String(channel)}'s plates seated`,
    );
    await rt.setLivePlateVolumes(itemId, { 'guest-1': 1, 'guest-2': 1 });
  }
  for (const channel of [1, 2]) {
    expect(volumesOn(r, channel), `channel ${String(channel)} is audible`).toEqual([1, 1]);
  }
}

/** The fake's own mixer volume on every plate the ledger seated on `channel`. */
function volumesOn(r: TwoChannelRig, channel: number): (number | undefined)[] {
  const records = r.handle.runtime.liveLayers().get(`bed-${String(channel)}`) ?? [];
  return records.map((rec) => r.mock.layerState(rec.slot)?.volume);
}

async function panicRig(): Promise<TwoChannelRig> {
  return twoChannelRig({
    channels: 4,
    bridge: { sourceCatalog: CATALOG, sourceAssignments: ASSIGNMENTS },
  });
}

describe('§2 C — PANIC for one channel', () => {
  it('silences channel 1’s plates and writes NOTHING to channel 2 — control: channel 2’s own PANIC silences it', async () => {
    const r = await panicRig();
    await audibleOnBoth(r);
    const before = (await r.lines()).length;

    const verdict = await r.handle.runtime.silenceChannelLivePlates(1);
    expect(verdict).toMatchObject({ ok: true, silenced: 2, recorded: 2 });
    expect(verdict.rows).toEqual([{ itemId: 'bed-1', plates: 2 }]);
    expect(volumesOn(r, 1), 'channel 1 is silent').toEqual([0, 0]);
    expect(volumesOn(r, 2), 'channel 2 is untouched').toEqual([1, 1]);
    const after = (await r.lines()).slice(before);
    expect(writes(addressing(after, 2))).toEqual([]);
    // Golden rule 10, measured: the only thing sent is VOLUME 0.
    expect(writes(after).every((l) => / VOLUME 0$/.test(l))).toBe(true);

    const verdict2 = await r.handle.runtime.silenceChannelLivePlates(2);
    expect(verdict2.rows).toEqual([{ itemId: 'bed-2', plates: 2 }]);
    expect(volumesOn(r, 2), 'channel 2 is silent').toEqual([0, 0]);
  });

  it('the EVERY-CHANNEL silence still reaches both, from the same ledger (A16, unscoped)', async () => {
    const r = await panicRig();
    await audibleOnBoth(r);
    const verdict = await r.handle.runtime.silenceAllLivePlates();
    expect(verdict.rows.map((x) => x.itemId).sort()).toEqual(['bed-1', 'bed-2']);
    expect(verdict.silenced).toBe(4);
    expect(volumesOn(r, 1)).toEqual([0, 0]);
    expect(volumesOn(r, 2)).toEqual([0, 0]);
  });

  it('over the socket it names its channel: the fence refuses an undeclared one — control: the declared one silences', async () => {
    const r = await panicRig();
    await audibleOnBoth(r);
    const client = await openClient(r.handle);
    const refused = await client.ask(id(), 'stack.silence-channel-live-plates', { channel: 3 });
    expect(refused.error).toBe(channelNotDeclaredRefusal(3));
    expect(volumesOn(r, 1)).toEqual([1, 1]);
    const ok = await client.ask(id(), 'stack.silence-channel-live-plates', { channel: 1 });
    expect(ok.error).toBeUndefined();
    expect(ok.payload).toMatchObject({ ok: true, silenced: 2 });
    expect(volumesOn(r, 2), 'the other channel is still audible').toEqual([1, 1]);
  });
});

describe('§2 C — auth ON, the per-channel PANIC is scoped to the principal’s channel', () => {
  it('a principal holding channel 2 may silence channel 2 — control: channel 1 is refused for permission; the unscoped PANIC is not channel-checked', async () => {
    const banks: FixedLayerBank[] = [standardBank(1), standardBank(2)];
    const { handle, playout } = await startAuthedBridge({ fixedLayers: banks });
    track(playout, (p) => p.stop());
    track(handle, (h) => h.close());
    const client = await openClient(handle);
    const issued = await playout.issueToken({ user: 'channelTwo' });
    expect((await client.authenticate(id(), issued.token)).error).toBeUndefined();

    const theirs = await client.ask(id(), 'stack.silence-channel-live-plates', { channel: 1 });
    expect(theirs.error).toBe(authzChannelRefusal(1));
    const mine = await client.ask(id(), 'stack.silence-channel-live-plates', { channel: 2 });
    expect(mine.error, 'channel 2 is held, so the gate passes').toBeUndefined();
    // A16: the every-channel PANIC takes no channel and is judged by the role alone.
    const all = await client.ask(id(), 'stack.silence-all-live-plates');
    expect(all.error).toBeUndefined();
  });
});
