import { describe, expect, it } from 'vitest';
import {
  AUTHZ_ROLE_REFUSAL,
  LOCK_ENGAGED_REFUSAL,
  authzChannelRefusal,
  withChannelDefaults,
  type LockState,
  type SourceAssignments,
  type SourceCatalog,
} from '@cg/shared-ipc';
import { createBridge, type BridgeHandle } from '../src/index.js';
import {
  deadConnection,
  expectRefusedWith,
  openClient,
  startAuthedBridge,
  type Client,
} from './support/auth-harness.js';
import type { FakePlayout, IssueTokenOptions } from './support/fake-playout.js';
import { track } from './support/harness.js';
import { standardBank } from './support/two-channel-rig.js';

/**
 * 🔴 `PLATE-BAND-01` (the owner, 2026-09-28) — **SOURCE DEFAULTS OBEY THE CHANNEL GRANT.** A principal
 * whose grant (`cg_channels`) does not include a channel is refused when changing that channel's
 * Source defaults, with the existing channel sentence (`authzChannelRefusal`); `"*"` holds every
 * channel. `CHANNEL-SOURCES-01` made the defaults per channel and filed this question; its answer is
 * the permission gate's, judged on the channels the write CHANGES (`assignmentChangeFootprint`) — the
 * console sends the whole set on every save, so a channel whose defaults come back as they were is not
 * an act on it.
 *
 * The station declares channels 1 and 2. The write is `station-admin` (one of the ten routes pinned in
 * `authz-classes`), so the channel-2-only principal is the fake's `cg-admin-ch2`; an operator-role
 * principal is refused by ROLE before any channel is asked, as before. Each refusal is beside the
 * control on the same socket.
 */

const HOST = '127.0.0.1';
const CH1 = { host: HOST, channel: 1 };
const CH2 = { host: HOST, channel: 2 };

const CATALOG: SourceCatalog = {
  sources: [
    { id: 'src-a', name: 'Studio A', format: '1080i5000', producer: { kind: 'route', channel: 3 } },
    { id: 'src-b', name: 'Studio B', format: '1080i5000', producer: { kind: 'route', channel: 4 } },
  ],
  layerRange: { start: 60, end: 79 },
};

/** Each channel's own default for the bed's one plate: Studio A. */
const START: SourceAssignments = {
  assignments: [
    { channel: 1, templateId: 'bed', plateId: 'guest-1', sourceId: 'src-a' },
    { channel: 2, templateId: 'bed', plateId: 'guest-1', sourceId: 'src-a' },
  ],
};

/** A station-admin granted channel 2 only — `cg-admin-ch2`. */
const CH2_ADMIN: IssueTokenOptions = { user: 'adminChannelTwo' };
/** A station-admin holding every channel. */
const STAR_ADMIN: IssueTokenOptions = { user: 'admin', cgChannels: '*' };

interface Station {
  readonly handle: BridgeHandle;
  readonly playout: FakePlayout;
  signedIn(options: IssueTokenOptions): Promise<Client>;
}

async function station(): Promise<Station> {
  const { handle, playout } = await startAuthedBridge({
    connection: deadConnection(),
    fixedLayers: [standardBank(1), standardBank(2)],
    sourceCatalog: CATALOG,
    sourceAssignments: START,
  });
  track(playout, (p) => p.stop());
  track(handle, (h) => h.close());
  return {
    handle,
    playout,
    async signedIn(options) {
      const client = await openClient(handle);
      const issued = await playout.issueToken(options);
      const res = await client.authenticate(`auth-${String(Math.random())}`, issued.token);
      if (res.error !== undefined) throw new Error(`fixture token rejected: ${res.error}`);
      return client;
    },
  };
}

/** The Source defaults dialog's save: `src-b` for the plate ON `channel`, and the whole set sent. */
function saveOn(handle: BridgeHandle, channel: number): SourceAssignments {
  return withChannelDefaults(
    handle.runtime.sourceAssignments(),
    channel,
    'bed',
    new Map([['guest-1', 'src-b']]),
  );
}

const sourceOn = (handle: BridgeHandle, channel: number): string | undefined =>
  handle.runtime
    .sourceAssignments()
    .assignments.find((a) => a.channel === channel && a.plateId === 'guest-1')?.sourceId;

describe('PLATE-BAND-01 — Source defaults obey the channel grant', () => {
  it('🔴 a station-admin holding CH 2 only is refused on CH 1, with the channel sentence, and nothing changes there — control: CH 2 changes', async () => {
    const s = await station();
    const ch2 = await s.signedIn(CH2_ADMIN);

    const refused = await ch2.ask('w1', 'sources.set-assignments', saveOn(s.handle, 1));
    expectRefusedWith(refused.error, authzChannelRefusal(1), 'a CH 2 admin changed CH 1');
    // Nothing changed ANYWHERE — the refusal is all-or-nothing, and before the handler.
    expect(s.handle.runtime.sourceAssignments()).toEqual(START);

    // CONTROL — the same principal, the same save, on the channel it holds. The request carries CH 1's
    // entry too (the whole set), unchanged: that costs CH 1 nothing.
    const accepted = await ch2.ask('w2', 'sources.set-assignments', saveOn(s.handle, 2));
    expect(accepted.error).toBeUndefined();
    expect(accepted.payload).toEqual({ ok: true });
    expect(sourceOn(s.handle, 2)).toBe('src-b');
    expect(sourceOn(s.handle, 1), 'CH 1 is as it was').toBe('src-a');
  });

  it('control — a "*" station-admin changes both channels', async () => {
    const s = await station();
    const star = await s.signedIn(STAR_ADMIN);

    expect((await star.ask('w1', 'sources.set-assignments', saveOn(s.handle, 1))).payload).toEqual({
      ok: true,
    });
    expect((await star.ask('w2', 'sources.set-assignments', saveOn(s.handle, 2))).payload).toEqual({
      ok: true,
    });
    expect(sourceOn(s.handle, 1)).toBe('src-b');
    expect(sourceOn(s.handle, 2)).toBe('src-b');
  });

  it('an operator-role principal is refused by ROLE first, whatever it holds — unchanged', async () => {
    const s = await station();
    const operator = await s.signedIn({ user: 'channelTwo' });
    const res = await operator.ask('w1', 'sources.set-assignments', saveOn(s.handle, 2));
    expectRefusedWith(res.error, AUTHZ_ROLE_REFUSAL, 'an operator wrote Source defaults');
    expect(s.handle.runtime.sourceAssignments()).toEqual(START);
  });

  it('auth OFF refuses nothing — the gate reads no grant there', async () => {
    const handle = track(
      await createBridge({
        port: 0,
        connection: deadConnection(),
        fixedLayers: [standardBank(1), standardBank(2)],
        sourceCatalog: CATALOG,
        sourceAssignments: START,
      }),
      (h) => h.close(),
    );
    const client = await openClient(handle);
    expect((await client.ask('w1', 'sources.set-assignments', saveOn(handle, 1))).payload).toEqual({
      ok: true,
    });
    expect(sourceOn(handle, 1)).toBe('src-b');
  });
});

/*
  🔴 THE LOCK READS THE SAME FOOTPRINT (`channelsForRequest` is the one resolver), as it does for
  `fixedLayers.set-banks`. Before `PLATE-BAND-01` a defaults write resolved to NO channel, which a
  channel-scoped lock reads as touching every channel the principal holds — so under a lock on
  channel 1, a channel-2 save was refused. Now it is judged on what it changes, like every other
  channel-2 verb under that lock (`lock-scope`'s `MULTI-CHANNEL-01` case).
*/
describe('PLATE-BAND-01 — a channel-scoped lock judges a Source defaults write by the channels it changes', () => {
  it('under a lock covering CH 1, a save that changes CH 2 alone passes — control: one that changes CH 1 is refused by the lock', async () => {
    const s = await station();
    const engager = await s.signedIn({ user: 'operator', cgChannels: [CH1] });
    const both = await s.signedIn({ user: 'admin', cgChannels: [CH1, CH2] });
    expect((await engager.ask('e', 'lock.engage', { pin: '4711' })).payload).toEqual({ ok: true });
    const lock = (await both.ask('s', 'lock.state')).payload as LockState;
    expect(lock).toMatchObject({ engaged: true, channels: [1] });

    const covered = await both.ask('w1', 'sources.set-assignments', saveOn(s.handle, 1));
    expectRefusedWith(covered.error, LOCK_ENGAGED_REFUSAL, 'a save on the covered channel');
    expect(s.handle.runtime.sourceAssignments()).toEqual(START);

    const free = await both.ask('w2', 'sources.set-assignments', saveOn(s.handle, 2));
    expect(free.error, 'a save on the uncovered channel was refused').toBeUndefined();
    expect(free.payload).toEqual({ ok: true });
    expect(sourceOn(s.handle, 2)).toBe('src-b');
    expect(sourceOn(s.handle, 1)).toBe('src-a');
  });
});
