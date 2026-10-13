import { describe, expect, it } from 'vitest';
import { AUTH_REQUIRED_REFUSAL, AUTH_TOKEN_EXPIRED, authzChannelRefusal } from '@cg/shared-ipc';
import type { StackItemState } from '@cg/shared-schema';
import { expectRefusedWith, openClient, type Client } from './support/auth-harness.js';
import { startFakePlayout, type FakePlayout, type FakeUserKey } from './support/fake-playout.js';
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
 * 🔴 `CENTRAL-BRIDGE-01` §5 — **THE TOKENS, AGAINST ONE CG BRIDGE ON A TWO-CHANNEL STATION.**
 *
 * The prompt's list, verbatim: _"no token → refused; an expired token → refused; a token without
 * channel 2 → no command on channel 2, and none of its state. Control: a valid token for channel 2
 * works."_ Each case is read at the WIRE (the fake CasparCG's own trace, filtered by the one
 * addressing rule every channel spec uses) as well as at the answer, so "refused" means nothing
 * reached CasparCG — and the control proves the same instrument sees a take when one is sent.
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
  expect((await client.authenticate(`auth-${user}`, token)).error, user).toBeUndefined();
  return client;
}

let n = 0;
const id = (): string => `r-${String(++n)}`;

/** A row loaded (bound, nothing sent) on `channel`, by a console that holds both channels. */
async function loaded(s: Station, channel: number, itemId: string): Promise<void> {
  const both = await signedIn(s, 'bothChannels');
  const load = await both.ask(id(), 'fixedLayers.load', {
    channel,
    layer: 80,
    itemId,
    templateId: FURNITURE.templateId,
    fields: {},
  });
  expect(load.payload, `load ${itemId}`).toMatchObject({ accepted: true });
}

/** The WRITES the fake received on `channel` since `from` (reads — `INFO` — are the bridge looking). */
async function writesOn(s: Station, channel: number, from: number): Promise<string[]> {
  return addressing(writes((await s.rig.lines()).slice(from)), channel);
}

describe('CENTRAL-BRIDGE-01 §5 — the tokens', () => {
  it('🔴 NO token: a take and a read are refused with the sign-in sentence, and nothing reaches CasparCG', async () => {
    const s = await station();
    await loaded(s, 1, 'row-1');
    const mark = (await s.rig.lines()).length;

    const anonymous = await openClient(s.rig.handle);
    expectRefusedWith(
      (await anonymous.ask(id(), 'stack.take', { itemId: 'row-1' })).error,
      AUTH_REQUIRED_REFUSAL,
      'a take with no token',
    );
    expectRefusedWith(
      (await anonymous.ask(id(), 'stack.snapshot')).error,
      AUTH_REQUIRED_REFUSAL,
      'a read with no token',
    );
    expect(await writesOn(s, 1, mark)).toEqual([]);
    expect(anonymous.publishes(), 'a socket with no token was told state').toEqual([]);
  }, 60_000);

  it('🔴 an EXPIRED token is refused at presentation, and the socket is then treated as having none', async () => {
    const s = await station();
    await loaded(s, 1, 'row-1');
    const mark = (await s.rig.lines()).length;

    const lapsed = await openClient(s.rig.handle);
    const { token } = await s.playout.issueToken({
      user: 'operator',
      // An hour past — well beyond the contract's 60 s clock tolerance.
      expEpochSec: Math.floor(Date.now() / 1000) - 3600,
      iatEpochSec: Math.floor(Date.now() / 1000) - 7200,
    });
    expectRefusedWith(
      (await lapsed.authenticate(id(), token)).error,
      AUTH_TOKEN_EXPIRED,
      'an expired token',
    );
    expectRefusedWith(
      (await lapsed.ask(id(), 'stack.take', { itemId: 'row-1' })).error,
      AUTH_REQUIRED_REFUSAL,
      'a take after an expired token',
    );
    expect(await writesOn(s, 1, mark)).toEqual([]);
  }, 60_000);

  it('🔴 a token WITHOUT channel 2: no command on channel 2 and none of its state — CONTROL: a channel-2 token takes', async () => {
    const s = await station();
    await loaded(s, 2, 'row-2');
    const one = await signedIn(s, 'operator');
    const mark = (await s.rig.lines()).length;

    // No command on channel 2 — refused by PERMISSION, naming the channel, and nothing on the wire.
    expectRefusedWith(
      (await one.ask(id(), 'stack.take', { itemId: 'row-2' })).error,
      authzChannelRefusal(2),
      'channel 1’s token taking on channel 2',
    );
    expectRefusedWith(
      (
        await one.ask(id(), 'fixedLayers.load', {
          channel: 2,
          layer: 81,
          itemId: 'row-2b',
          templateId: FURNITURE.templateId,
          fields: {},
        })
      ).error,
      authzChannelRefusal(2),
      'channel 1’s token loading on channel 2',
    );
    expect(await writesOn(s, 2, mark), 'a channel-1 token reached channel 2').toEqual([]);
    // …and none of its state.
    const told = (await one.ask(id(), 'stack.snapshot')).payload as StackItemState[];
    expect(told.map((i) => i.itemId)).not.toContain('row-2');

    // CONTROL — a valid token FOR channel 2 takes the same row, and the same instrument sees it.
    const two = await signedIn(s, 'channelTwo');
    const take = await two.ask(id(), 'stack.take', { itemId: 'row-2' });
    expect(take.error, 'the channel-2 token was refused').toBeUndefined();
    await waitUntil(
      async () => (await writesOn(s, 2, mark)).some((l) => l.startsWith('CG 2-80 PLAY')),
      'the channel-2 take on the wire',
    );
    const told2 = (await two.ask(id(), 'stack.snapshot')).payload as StackItemState[];
    expect(told2.map((i) => i.itemId)).toContain('row-2');
  }, 60_000);
});
