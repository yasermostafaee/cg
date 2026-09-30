import { describe, expect, it } from 'vitest';
import { unlicensedTakeRefusal, type StationChannels } from '@cg/shared-ipc';
import type { AuditEntry } from '@cg/shared-schema';
import { openClient, type Client } from './support/auth-harness.js';
import { startFakePlayout, type FakePlayout } from './support/fake-playout.js';
import { track } from './support/harness.js';
import {
  addressing,
  FURNITURE,
  twoChannelRig,
  waitUntil,
  writes,
  type TwoChannelRig,
} from './support/two-channel-rig.js';

/**
 * 🔴 `CENTRAL-BRIDGE-01` (D12, the Playout team's rule 11; task 5.3) — **A TAKE ON AN UNLICENSED
 * CHANNEL IS REFUSED, WITH THE REASON, BEFORE ANYTHING IS SENT.**
 *
 * The Playout clears an unlicensed channel every minute, ours with it. So the take is refused by
 * the bridge — read at the fake CasparCG's own trace — with the one sentence, the one predicate the
 * console's line uses; a removal passes; and CONTROL: a licensed channel takes, on the same wire.
 */

let n = 0;
const id = (): string => `u-${String(++n)}`;

async function station(): Promise<{ rig: TwoChannelRig; playout: FakePlayout; both: Client }> {
  const playout = track(await startFakePlayout(), (p) => p.stop());
  // Channel 2 is unlicensed in the Playout; channel 1 is its ordinary state.
  playout.setChannelState(2, { playlist: 'unlicensed' });
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
  const both = await openClient(rig.handle);
  const { token } = await playout.issueToken({ user: 'bothChannels' });
  expect((await both.authenticate(id(), token)).error).toBeUndefined();
  // The catalogue arrives with the sign-in: wait until the bridge has READ channel 2's playlist.
  await waitUntil(async () => {
    const list = (await both.ask(id(), 'channels.list')).payload as StationChannels;
    return list.channels.some((c) => c.channel === 2 && c.playlist === 'unlicensed');
  }, 'the catalogue naming channel 2 unlicensed');
  for (const [channel, itemId] of [
    [1, 'row-1'],
    [2, 'row-2'],
  ] as const) {
    const load = await both.ask(id(), 'fixedLayers.load', {
      channel,
      layer: 80,
      itemId,
      templateId: FURNITURE.templateId,
      fields: {},
    });
    expect(load.payload, itemId).toMatchObject({ accepted: true });
  }
  return { rig, playout, both };
}

describe('CENTRAL-BRIDGE-01 5.3 — unlicensed', () => {
  it('🔴 a take on the unlicensed channel is refused with the reason, and nothing reaches it — CONTROL: the licensed channel takes', async () => {
    const { rig, both } = await station();
    const mark = (await rig.lines()).length;

    const refused = await both.ask(id(), 'stack.take', { itemId: 'row-2' });
    expect(refused.payload).toEqual({
      accepted: false,
      errorCode: 'unlicensed',
      message: unlicensedTakeRefusal(2),
    });
    expect(addressing(writes((await rig.lines()).slice(mark)), 2)).toEqual([]);

    // CONTROL — the licensed channel takes, and the same instrument sees it.
    expect((await both.ask(id(), 'stack.take', { itemId: 'row-1' })).payload).toMatchObject({
      accepted: true,
    });
    await waitUntil(
      async () =>
        addressing(writes((await rig.lines()).slice(mark)), 1).some((l) =>
          l.startsWith('CG 1-80 PLAY'),
        ),
      'the channel-1 take on the wire',
    );

    // The record says what was refused and why.
    const rows = (await both.ask(id(), 'audit.recent', { limit: 20 })).payload as AuditEntry[];
    expect(rows.find((r) => r.action === 'take' && r.itemId === 'row-2')).toMatchObject({
      outcome: 'failed',
      errorCode: 'unlicensed',
    });
  }, 60_000);

  it('a removal on the unlicensed channel is not a take, and passes', async () => {
    const { both } = await station();
    expect((await both.ask(id(), 'stack.remove', { itemId: 'row-2' })).payload).toMatchObject({
      accepted: true,
    });
  }, 60_000);
});
