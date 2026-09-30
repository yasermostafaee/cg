import { describe, expect, it } from 'vitest';
import {
  CG_UNLICENSED_CODE,
  cgOutsideCapReason,
  type LicenseState,
  type StationChannels,
} from '@cg/shared-ipc';
import type { StackItemState } from '@cg/shared-schema';
import { openClient, type Client } from './support/auth-harness.js';
import {
  FAKE_GRACE_UNTIL,
  FAKE_NOT_INCLUDED_MESSAGE,
  startFakePlayout,
  type FakeLicensePreset,
  type FakePlayout,
} from './support/fake-playout.js';
import { track } from './support/harness.js';
import {
  addressing,
  delay,
  FURNITURE,
  twoChannelRig,
  waitUntil,
  writes,
  type TwoChannelRig,
} from './support/two-channel-rig.js';

/**
 * 🔴 `PLAYOUT-FEATURES-01` D (`R-077`) — **THE CG LICENSE: a take where CG is not licensed is refused
 * with the Playout's own message, a clear still works, and nothing on air is cleared by us.**
 *
 * Read at the fake CasparCG's own trace (the two-channel rig) against the fake Playout's `2.9.2`
 * license (`GET /api/cg/license`, D4 `cgLicensed`). The license read's clock is the test's, so "60 s
 * later" costs nothing.
 */

let n = 0;
const id = (): string => `lic-${String(++n)}`;

interface Station {
  readonly rig: TwoChannelRig;
  readonly playout: FakePlayout;
  readonly both: Client;
  /** Move the license reader's clock on (its 60 s floor). */
  advance(ms: number): void;
}

async function station(preset: FakeLicensePreset | null): Promise<Station> {
  const playout = track(await startFakePlayout(), (p) => p.stop());
  playout.setLicense(preset);
  let clock = 1_000_000;
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
      playoutLicenseOptions: { now: () => clock, tickMs: 20 },
    },
  });
  const both = await openClient(rig.handle);
  const { token } = await playout.issueToken({ user: 'bothChannels' });
  expect((await both.authenticate(id(), token)).error).toBeUndefined();
  // The license and the catalogue arrive with the sign-in: wait until the bridge has READ both.
  if (preset !== null) {
    await waitUntil(
      async () =>
        ((await both.ask(id(), 'license.state')).payload as LicenseState).license !== null,
      'the license read',
    );
    await waitUntil(async () => {
      const list = (await both.ask(id(), 'channels.list')).payload as StationChannels;
      return list.channels.some((c) => c.channel === 2 && c.cgLicensed !== undefined);
    }, 'D4 carrying cgLicensed');
  }
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
  return {
    rig,
    playout,
    both,
    advance(ms) {
      clock += ms;
    },
  };
}

async function rowOf(both: Client, itemId: string): Promise<StackItemState | undefined> {
  const items = (await both.ask(id(), 'stack.snapshot', undefined)).payload as StackItemState[];
  return items.find((i) => i.itemId === itemId);
}

async function onWire(rig: TwoChannelRig, mark: number, channel: number, prefix: string) {
  await waitUntil(
    async () =>
      addressing(writes((await rig.lines()).slice(mark)), channel).some((l) =>
        l.startsWith(prefix),
      ),
    `${prefix} on the wire`,
  );
}

describe('PLAYOUT-FEATURES-01 D — the CG license', () => {
  it('🔴 `not_included`: a take is refused with the Playout’s message, nothing reaches the channel, and the row says it', async () => {
    const { rig, both } = await station('not_included');
    const mark = (await rig.lines()).length;

    const refused = await both.ask(id(), 'stack.take', { itemId: 'row-2' });
    expect(refused.payload).toEqual({
      accepted: false,
      errorCode: CG_UNLICENSED_CODE,
      message: FAKE_NOT_INCLUDED_MESSAGE,
    });
    expect(addressing(writes((await rig.lines()).slice(mark)), 2)).toEqual([]);
    expect((await rowOf(both, 'row-2'))?.takeRefusal).toEqual({
      code: CG_UNLICENSED_CODE,
      message: FAKE_NOT_INCLUDED_MESSAGE,
    });
  }, 60_000);

  it('🔴 the license goes while on air: NOTHING is cleared by us, new takes are refused, and CLEAR still works', async () => {
    const { rig, playout, both, advance } = await station('licensed');
    const start = (await rig.lines()).length;
    expect((await both.ask(id(), 'stack.take', { itemId: 'row-2' })).payload).toMatchObject({
      accepted: true,
    });
    await onWire(rig, start, 2, 'CG 2-80 PLAY');

    // The license goes; the reader sees it at its next minute.
    const mark = (await rig.lines()).length;
    playout.setLicense('not_included');
    advance(61_000);
    await waitUntil(
      async () =>
        ((await both.ask(id(), 'license.state')).payload as LicenseState).license?.licensed ===
        false,
      'the license read as not licensed',
    );
    // Nothing on air is cleared by us: give the bridge time, then read the wire.
    await delay(600);
    expect(addressing(writes((await rig.lines()).slice(mark)), 2)).toEqual([]);

    // A new take is refused (row-1 was never on air).
    expect((await both.ask(id(), 'stack.take', { itemId: 'row-1' })).payload).toMatchObject({
      accepted: false,
      errorCode: CG_UNLICENSED_CODE,
    });

    // The removal is not a take: the operator's OUT reaches our layer.
    expect((await both.ask(id(), 'stack.out', { itemId: 'row-2' })).payload).toMatchObject({
      accepted: true,
    });
    await waitUntil(
      async () => addressing(writes((await rig.lines()).slice(mark)), 2).length > 0,
      'the operator’s removal on the wire',
    );
  }, 60_000);

  it('🔴 a cap of one channel: CH 1 takes, CH 2 is refused with the cap’s words', async () => {
    const { rig, both } = await station('cap-1');
    const mark = (await rig.lines()).length;

    expect((await both.ask(id(), 'stack.take', { itemId: 'row-1' })).payload).toMatchObject({
      accepted: true,
    });
    await onWire(rig, mark, 1, 'CG 1-80 PLAY');

    expect((await both.ask(id(), 'stack.take', { itemId: 'row-2' })).payload).toEqual({
      accepted: false,
      errorCode: CG_UNLICENSED_CODE,
      message: cgOutsideCapReason(2),
    });
    expect(addressing(writes((await rig.lines()).slice(mark)), 2)).toEqual([]);
  }, 60_000);

  it('🔴 the Playout unreachable after `licensed: false`: the value is KEPT, and takes stay refused', async () => {
    const { playout, both, advance } = await station('not_included');
    await playout.goOffline();
    try {
      advance(61_000);
      await delay(200); // a tick or more: the read fails and must keep what it had
      expect(
        ((await both.ask(id(), 'license.state')).payload as LicenseState).license?.licensed,
      ).toBe(false);
      expect((await both.ask(id(), 'stack.take', { itemId: 'row-2' })).payload).toMatchObject({
        accepted: false,
        errorCode: CG_UNLICENSED_CODE,
      });
    } finally {
      await playout.goOnline();
    }
  }, 60_000);

  it('`grace`: the license is published with `graceUntil`, and CG still takes (the control)', async () => {
    const { rig, playout, both } = await station('grace');
    const license = ((await both.ask(id(), 'license.state')).payload as LicenseState).license;
    expect(license).toMatchObject({
      licensed: true,
      playoutState: 'grace',
      graceUntil: FAKE_GRACE_UNTIL,
    });
    const mark = (await rig.lines()).length;
    expect((await both.ask(id(), 'stack.take', { itemId: 'row-2' })).payload).toMatchObject({
      accepted: true,
    });
    await onWire(rig, mark, 2, 'CG 2-80 PLAY');
    // The read carried the bearer in its header, and no token in its URL.
    const reads = playout.requestLog.filter((r) => r.path === '/api/cg/license');
    expect(reads.length).toBeGreaterThan(0);
    for (const r of reads) expect(r.headers.authorization).toMatch(/^Bearer /);
  }, 60_000);

  it('a Playout before `2.9.2` (`404`): nothing is read, and nothing is refused', async () => {
    const { rig, playout, both } = await station(null);
    await waitUntil(() => playout.requestCounts.license > 0, 'the license asked for');
    expect(((await both.ask(id(), 'license.state')).payload as LicenseState).license).toBeNull();
    const mark = (await rig.lines()).length;
    expect((await both.ask(id(), 'stack.take', { itemId: 'row-2' })).payload).toMatchObject({
      accepted: true,
    });
    await onWire(rig, mark, 2, 'CG 2-80 PLAY');
  }, 60_000);
});
