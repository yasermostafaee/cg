import { afterEach, describe, expect, it } from 'vitest';
import {
  AuthStateChangedChannel,
  defaultFixedLayerBank,
  type AuthState,
  type FixedLayerBank,
} from '@cg/shared-ipc';
import type { BridgeHandle } from '../src/index.js';
import { openClient, startAuthedBridge } from './support/auth-harness.js';
import type { FakePlayout } from './support/fake-playout.js';

/**
 * 🔴 `OPERATOR-NAME-SWEEP-01` § 3(a) — **THE PERMITTED-CHANNEL LIST FOLLOWS THE CONFIG.**
 *
 * ── THE DEFECT, AND WHY IT WAS FILED RATHER THAN SHIPPED BROKEN ─────────────
 *
 * `C-038` delivered `permittedChannels` once, on the socket's `auth` reply. The GATE reads the
 * connection configuration on every request, so a `station-admin` editing the server list moved
 * the gate immediately and left the console's strip as it was until it reconnected — a window
 * in which the console could offer a channel the bridge had begun refusing.
 *
 * ⚠ **The refusal was never wrong.** The bridge is the guarantee and it is never stale. What
 * was wrong is the courtesy half — and a control the console offers disagreeing with a command
 * the bridge accepts is the exact failure `C-038` exists to remove.
 *
 * ⭐ `PLAYOUT-AUTHZ-01` filed this as needing "a new per-socket publish path, not one more
 * `subscribe` line". **That was a misreading of this file and is worth recording**:
 * `wirePublishes` is already called once per connection with that connection's own
 * `AuthSession` in scope, so the fix genuinely is one more subscription. The correction matters
 * because the wrong reading is what made it look too big to do at the time.
 *
 * 🔴 Nothing here reaches a real CasparCG: the harness points AMCP at `127.0.0.1:1`, which
 * nothing answers, and the fake Playout generates its ES256 key in memory.
 */

/** The bank first-run declares (`firstRunStation.ts`): the default bands, EVERY row shown. */
function firstRunBank(channel: number): FixedLayerBank {
  const base = defaultFixedLayerBank();
  const shown = (v: Record<string, boolean> | undefined): Record<string, boolean> =>
    Object.fromEntries(Object.keys(v ?? {}).map((layer) => [layer, true]));
  return {
    ...base,
    channel,
    visibility: shown(base.visibility),
    low: { ...base.low, visibility: shown(base.low.visibility) },
  };
}

let handle: BridgeHandle | null = null;
let playout: FakePlayout | null = null;

afterEach(async () => {
  await handle?.close();
  handle = null;
  await playout?.stop();
  playout = null;
});

/** Every `auth.state-changed` payload this socket has been pushed, in order. */
function authPushes(frames: readonly { type: string; channel?: string; payload?: unknown }[]) {
  return frames
    .filter((f) => f.type === 'publish' && f.channel === AuthStateChangedChannel.name)
    .map((f) => f.payload as AuthState);
}

describe('§3(a) — the strip is told when the config moves under it', () => {
  /**
   * 🔴 The property: an operator granted `127.0.0.1` channel 1 loses that channel the moment a
   * `station-admin` repoints the station at a host their grant does not name.
   *
   * ⭐ **THE POSITIVE CONTROL IS THE FIRST ASSERTION, not an afterthought.** Before the config
   * moves, the same socket is asserted to HOLD channel 1. Without it, a final
   * `permittedChannels: []` would also be what a console that never received anything looks
   * like — and `PLAYOUT-AUTHZ-01`'s own e2e shipped exactly that shape before a control caught
   * it. An empty list is a measurement only when something beside it proves the instrument was
   * live.
   */
  it('pushes a fresh auth state, with the channel GONE, when the server list changes', async () => {
    const started = await startAuthedBridge();
    handle = started.handle;
    playout = started.playout;

    // An admin, because repointing the servers is a `station-admin` route.
    const admin = await openClient(started.handle);
    const adminToken = await started.playout.issueToken({ user: 'admin' });
    await admin.authenticate('a-admin', adminToken.token);

    // …and an operator, whose grant names `127.0.0.1` channel 1.
    const operator = await openClient(started.handle);
    const opToken = await started.playout.issueToken({ user: 'operator' });
    const accepted = await operator.authenticate('a-op', opToken.token);
    expect(
      accepted.error,
      'the fixture token was rejected — the harness is broken',
    ).toBeUndefined();

    // 🔴 THE POSITIVE CONTROL: the channel is theirs right now.
    expect(
      (accepted.payload as AuthState).permittedChannels,
      'the operator never held channel 1 — every assertion below would be vacuous',
    ).toEqual([1]);

    // The admin repoints the station at a host the operator's grant does not name.
    const repointed = await admin.ask('set', 'connections.set-config', {
      servers: { A: { host: '10.9.9.9', amcpPort: 5250, oscPort: 6250 } },
      strategy: 'mirror-sync',
      autoFailoverEnabled: false,
    });
    expect(repointed.error, 'the admin could not repoint the servers').toBeUndefined();

    // The operator's socket is TOLD, without asking and without reconnecting.
    await expect
      .poll(() => authPushes(operator.frames).length, { timeout: 4000 })
      .toBeGreaterThan(0);

    const latest = authPushes(operator.frames).at(-1);
    expect(latest?.permittedChannels, 'the strip was not told the channel is gone').toEqual([]);
    /*
      ⚠ And the principal is UNCHANGED — they are still signed in, still themselves. A push that
      also dropped the principal would read on the console as "your session ended", which is a
      different and wrong fact.
    */
    expect(latest?.status).toBe('signed-in');
    expect(latest?.principal?.sub).toBe((accepted.payload as AuthState).principal?.sub);
  });

  /**
   * ⭐ The complement, and the second control: a config change that does NOT affect the grant
   * still pushes, and still says the channel is theirs. Without this, the test above would pass
   * against a bridge that emptied `permittedChannels` on every config event regardless.
   */
  it('a config change that keeps the host KEEPS the channel', async () => {
    const started = await startAuthedBridge();
    handle = started.handle;
    playout = started.playout;

    const admin = await openClient(started.handle);
    await admin.authenticate(
      'a-admin',
      (await started.playout.issueToken({ user: 'admin' })).token,
    );

    const operator = await openClient(started.handle);
    const accepted = await operator.authenticate(
      'a-op',
      (await started.playout.issueToken({ user: 'operator' })).token,
    );
    expect((accepted.payload as AuthState).permittedChannels).toEqual([1]);

    // Same host, different port — the grant still matches.
    await admin.ask('set', 'connections.set-config', {
      servers: { A: { host: '127.0.0.1', amcpPort: 5251, oscPort: 6251 } },
      strategy: 'mirror-sync',
      autoFailoverEnabled: false,
    });

    await expect
      .poll(() => authPushes(operator.frames).length, { timeout: 4000 })
      .toBeGreaterThan(0);

    expect(
      authPushes(operator.frames).at(-1)?.permittedChannels,
      'a harmless config change took the channel away',
    ).toEqual([1]);
  });

  /**
   * 🔴 `DESKTOP-APPS-01-D` i — **AND THE STRIP IS TOLD WHEN THE BANK MOVES UNDER IT.**
   *
   * The owner's first-run on channel 2, measured on the installed build: first-run writes the
   * connection and then the bank, the one push the console got carried the bank-less answer
   * (channel 1), and the channel-2 tab read `· READ ONLY` with no controls until a reload. The
   * station-admin below holds both channels, as the real `cg-admin` does, so only the DECLARED
   * channel decides what is permitted — which is the input the push used to ignore.
   */
  it('first-run: declaring channel 2 pushes channel 2 to the admin who signed in before it', async () => {
    const started = await startAuthedBridge();
    handle = started.handle;
    playout = started.playout;

    const admin = await openClient(started.handle);
    const accepted = await admin.authenticate(
      'a-admin',
      (
        await started.playout.issueToken({
          user: 'admin',
          cgChannels: [
            { host: '127.0.0.1', channel: 1 },
            { host: '127.0.0.1', channel: 2 },
          ],
        })
      ).token,
    );
    // 🔴 THE POSITIVE CONTROL: before the declaration, the bank-less answer is channel 1.
    expect((accepted.payload as AuthState).permittedChannels).toEqual([1]);

    const declared = await admin.ask('set', 'fixedLayers.set-config', firstRunBank(2));
    expect(declared.error, 'the admin could not declare channel 2').toBeUndefined();
    expect(declared.payload).toEqual({ ok: true });

    await expect
      .poll(() => authPushes(admin.frames).at(-1)?.permittedChannels, { timeout: 4000 })
      .toEqual([2]);
  });

  it('control — an operator granted channel 1 only is told the declared channel is not theirs', async () => {
    const started = await startAuthedBridge();
    handle = started.handle;
    playout = started.playout;

    const admin = await openClient(started.handle);
    await admin.authenticate(
      'a-admin',
      (
        await started.playout.issueToken({
          user: 'admin',
          cgChannels: [
            { host: '127.0.0.1', channel: 1 },
            { host: '127.0.0.1', channel: 2 },
          ],
        })
      ).token,
    );
    const operator = await openClient(started.handle);
    const accepted = await operator.authenticate(
      'a-op',
      (await started.playout.issueToken({ user: 'operator' })).token,
    );
    expect((accepted.payload as AuthState).permittedChannels).toEqual([1]);

    expect((await admin.ask('set', 'fixedLayers.set-config', firstRunBank(2))).payload).toEqual({
      ok: true,
    });

    await expect
      .poll(() => authPushes(operator.frames).length, { timeout: 4000 })
      .toBeGreaterThan(0);
    expect(authPushes(operator.frames).at(-1)?.permittedChannels).toEqual([]);
  });

  /**
   * 🔴 **AUTH OFF PUSHES NOTHING ON THIS CHANNEL**, so a station that does not federate identity
   * gains no traffic it did not have.
   *
   * ⭐ Its positive control is the `connections.config-changed` push beside it: that one MUST
   * arrive, which proves the config event fired at all. Asserting only the absence would pass
   * against a bridge whose config never changed.
   */
  it('auth OFF: the config push arrives and the auth push does not', async () => {
    const { createBridge } = await import('../src/index.js');
    const { deadConnection } = await import('./support/auth-harness.js');
    handle = await createBridge({ port: 0, connection: deadConnection() });
    const client = await openClient(handle);

    await client.ask('set', 'connections.set-config', {
      servers: { A: { host: '127.0.0.1', amcpPort: 5252, oscPort: 6252 } },
      strategy: 'mirror-sync',
      autoFailoverEnabled: false,
    });

    // THE CONTROL: the config event really did fire on this socket.
    await expect
      .poll(
        () =>
          client.frames.filter(
            (f) => f.type === 'publish' && f.channel === 'connections.config-changed',
          ).length,
        { timeout: 4000 },
      )
      .toBeGreaterThan(0);

    expect(
      authPushes(client.frames),
      'an auth-off bridge pushed an auth state it has no principal for',
    ).toEqual([]);
  });
});
