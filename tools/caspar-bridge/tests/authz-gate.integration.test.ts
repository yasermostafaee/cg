import { afterEach, describe, expect, it } from 'vitest';
import { AUTHZ_ROLE_REFUSAL, authzChannelRefusal } from '@cg/shared-ipc';
import type { BridgeHandle } from '../src/index.js';
import { openClient, startAuthedBridge, expectRefusedWith } from './support/auth-harness.js';
import { FAKE_OTHER_STATION_USER, FAKE_VIEWER, type FakePlayout } from './support/fake-playout.js';

/**
 * 🔴 `C-038` — **THE AUTHORISATION GATE, OVER A REAL SOCKET.**
 *
 * `authz-classes.integration.test.ts` is the CENSUS: it walks the table and pins the classes.
 * This file is the other half — it drives the gate through the wire, because a class on a
 * route proves nothing on its own about what a socket is actually refused.
 *
 * ⚠ **EVERY REFUSAL IS CHECKED THROUGH `expectRefusedWith`**, never with a bare
 * `expect(res.error).toBe(CONSTANT)`. `lock-refuses-intents` recorded why: written the
 * obvious way, such a spec PASSES against an ungated bridge, because an unexported constant
 * resolves to `undefined` and an ungated bridge answers with no error — so the assertion
 * becomes `expect(undefined).toBe(undefined)`. The helper refuses a non-string expectation
 * before it compares anything.
 *
 * 🔴 Nothing here reaches a real CasparCG: `deadConnection()` points AMCP at `127.0.0.1:1`,
 * which nothing answers, and every refusal asserted below happens BEFORE any handler runs.
 * The fake Playout generates its ES256 key in memory and writes nothing to disk.
 */

let handle: BridgeHandle | null = null;
let playout: FakePlayout | null = null;

afterEach(async () => {
  await handle?.close();
  handle = null;
  await playout?.stop();
  playout = null;
});

/** A bridge with auth ON, and a client that has already presented `user`'s token. */
async function signedInAs(user: 'operator' | 'viewer' | 'admin' | 'otherStation'): Promise<{
  ask: (id: string, channel: string, payload?: unknown) => Promise<{ error?: string }>;
}> {
  const started = await startAuthedBridge();
  handle = started.handle;
  playout = started.playout;
  const client = await openClient(started.handle);
  const issued = await started.playout.issueToken({ user });
  const auth = await client.authenticate('a1', issued.token);
  if (auth.error !== undefined) {
    throw new Error(`the fixture token was rejected: ${auth.error} — the harness is broken`);
  }
  return { ask: client.ask };
}

describe('C-038 — the ROLE gate', () => {
  /**
   * 🔴 The bullet: a viewer may READ everything and OPERATE nothing.
   *
   * ⭐ Both halves in one spec deliberately. A refusal test that never proves the same socket
   * CAN do something is a test that would pass against a bridge refusing everything — which
   * is the vacuous-pass shape this suite is written to avoid throughout.
   */
  it('a viewer reads the stack and is refused every intent on it', async () => {
    const { ask } = await signedInAs('viewer');

    const read = await ask('r1', 'stack.snapshot');
    expect(read.error, 'a viewer was refused a READ — the class hierarchy is inverted').toBe(
      undefined,
    );

    for (const channel of ['stack.take', 'stack.out', 'stack.stop', 'stack.remove']) {
      const res = await ask(`i-${channel}`, channel, { itemId: 'nope' });
      expectRefusedWith(res.error, AUTHZ_ROLE_REFUSAL, `a viewer reached ${channel}`);
    }
  });

  /**
   * 🔴 **THE DECISION THAT MAKES `read` A STATEMENT ABOUT WHO.** A viewer must be able to
   * sign out; `auth.sign-out` is `read`-class precisely so they can. If a future author
   * reclassifies it by VERB, this reddens.
   */
  it('a viewer can SIGN OUT, because read names the principal and not the verb', async () => {
    const { ask } = await signedInAs('viewer');
    const res = await ask('s1', 'auth.sign-out');
    expect(res.error, 'a viewer could not sign out of their own session').toBe(undefined);
  });

  it('an operator is refused the six configuration routes', async () => {
    const { ask } = await signedInAs('operator');

    const admin: [string, unknown][] = [
      ['delimiters.set', { delimiters: [] }],
      ['channelSettings.set', { channel: 1, raster: { width: 1920, height: 1080 } }],
    ];
    for (const [channel, payload] of admin) {
      const res = await ask(`a-${channel}`, channel, payload);
      expectRefusedWith(res.error, AUTHZ_ROLE_REFUSAL, `an operator reached ${channel}`);
    }
  });

  it('a station-admin reaches a configuration route', async () => {
    const { ask } = await signedInAs('admin');
    const res = await ask('d1', 'delimiters.set', { delimiters: [] });
    expect(res.error, 'a station-admin was refused a configuration verb').toBe(undefined);
  });
});

describe('C-038 — the CHANNEL gate', () => {
  /**
   * 🔴 **THE PROPERTY THE HOST RULE EXISTS FOR, asserted at the wire.**
   *
   * `cg-op-elsewhere` holds the full operator role and a grant for channel 1 — but the grant
   * names `192.0.2.10`, which this bridge does not drive. The channel NUMBER matching is not
   * enough, and this is the spec that says so through a socket rather than in a unit.
   */
  it("an operator of ANOTHER station is refused this station's channel", async () => {
    const { ask } = await signedInAs('otherStation');

    const res = await ask('c1', 'layers.clear', { channel: 1, layer: 10 });
    expectRefusedWith(
      res.error,
      authzChannelRefusal(1),
      "another station's operator cleared our layer",
    );
  });

  it('an operator of THIS station reaches the channel they are granted', async () => {
    const { ask } = await signedInAs('operator');
    const res = await ask('c2', 'layers.clear', { channel: 1, layer: 10 });
    expect(res.error, 'the granted channel was refused').toBe(undefined);
  });

  /**
   * ⭐ The refusal NAMES THE CHANNEL. Golden rule 11's ⭐ clause: an operator with two
   * channels granted and one refused cannot act on "that channel".
   */
  it('the refusal names the channel that was refused, not just that one was', async () => {
    const { ask } = await signedInAs('operator');
    const res = await ask('c3', 'layers.clear', { channel: 7, layer: 10 });
    expectRefusedWith(res.error, authzChannelRefusal(7), 'an ungranted channel was cleared');
    expect(res.error).toContain('7');
  });

  /**
   * 🔴 **THE ROLE IS CHECKED BEFORE THE CHANNEL, and the ORDER is the message.**
   *
   * A viewer pressing a channel verb must hear that their sign-in does not allow the command
   * — not that it does not cover channel 1, which is true, useless, and sends them to ask for
   * a channel they still could not use.
   */
  it('a viewer on an ungranted channel hears the ROLE sentence, not the channel one', async () => {
    const { ask } = await signedInAs('viewer');
    const res = await ask('c4', 'layers.clear', { channel: 1, layer: 10 });
    expectRefusedWith(res.error, AUTHZ_ROLE_REFUSAL, 'a viewer got the wrong refusal');
  });
});

describe('C-038 — the unbound item keeps working (design.md §4)', () => {
  /**
   * 🔴 **THE REGRESSION THIS CHANGE MUST NOT INTRODUCE.**
   *
   * A row that is loaded but never bound touches no channel and nothing on air. `remove` works
   * on it today — `#removeExempt` returns `true` for it explicitly, because `B-212` measured
   * that such a row has no STOP and no CLEAR to press, so refusing its removal leaves no
   * remedy at all. A fail-closed channel gate would rebuild that trap under a new name and
   * call it a safety property.
   *
   * ⚠ The assertion is that the refusal is NOT a permission one. The verb may still answer
   * `unknown-item` for a row that genuinely is not there — that is the pre-existing behaviour
   * and is not this change's business.
   */
  it('remove on an item with no channel is not refused by PERMISSION', async () => {
    const { ask } = await signedInAs('operator');
    const res = await ask('u1', 'stack.remove', { itemId: 'never-bound' });

    expect(res.error, 'an unbound row was refused as a permission failure').not.toBe(
      AUTHZ_ROLE_REFUSAL,
    );
    for (let channel = 1; channel <= 8; channel += 1) {
      expect(res.error).not.toBe(authzChannelRefusal(channel));
    }
  });

  it('set-position on an item with no channel is not refused by PERMISSION', async () => {
    const { ask } = await signedInAs('operator');
    const res = await ask('u2', 'stack.set-position', {
      itemId: 'never-bound',
      position: { xPct: 0, yPct: 0 },
    });
    expect(res.error).not.toBe(AUTHZ_ROLE_REFUSAL);
    expect(res.error).not.toBe(authzChannelRefusal(1));
  });
});

describe('C-038 — the refusal is RECORDED, with the verified actor', () => {
  /**
   * 🔴 The acceptance bullet: _"it is refused with the one sentence naming the channel, nothing
   * is sent, and the audit records the refusal with the verified actor"_.
   *
   * ⚠ **A `refused` row, not a failed `take`.** Writing it as a failed verb would put a take in
   * the log that nobody performed — the log's worst failure mode, since the log is what a
   * dispute is settled from.
   */
  it('writes a `refused` row naming the actor, the channel and the CasparCG channel', async () => {
    const started = await startAuthedBridge();
    handle = started.handle;
    playout = started.playout;
    const client = await openClient(started.handle);
    const issued = await started.playout.issueToken({ user: 'otherStation' });
    await client.authenticate('a1', issued.token);

    const before = await started.handle.runtime.auditRecent(200);
    expect(
      before.filter((r) => r.action === 'refused'),
      'the log already held a refusal — the instrument is not clean',
    ).toHaveLength(0);

    await client.ask('c1', 'layers.clear', { channel: 1, layer: 10 });

    const rows = (await started.handle.runtime.auditRecent(200)).filter(
      (r) => r.action === 'refused',
    );
    expect(rows, 'the refusal was not recorded at all').toHaveLength(1);
    expect(rows[0]?.actor).toBe(FAKE_OTHER_STATION_USER.name);
    expect(rows[0]?.actorSub).toBe(FAKE_OTHER_STATION_USER.sub);
    expect(rows[0]?.outcome).toBe('failed');
    expect(rows[0]?.refused?.channel).toBe('layers.clear');
    expect(rows[0]?.refused?.casparChannel).toBe(1);
  });

  /**
   * ⭐ A ROLE refusal carries no `casparChannel`, and that absence is the point: "your sign-in
   * does not operate" and "channel 3 is not yours" are different facts, and a row that could
   * not tell them apart would be useless in the dispute it exists for.
   */
  it('a ROLE refusal records no CasparCG channel', async () => {
    const started = await startAuthedBridge();
    handle = started.handle;
    playout = started.playout;
    const client = await openClient(started.handle);
    const issued = await started.playout.issueToken({ user: 'viewer' });
    await client.authenticate('a1', issued.token);

    await client.ask('t1', 'stack.take', { itemId: 'nope' });

    const rows = (await started.handle.runtime.auditRecent(200)).filter(
      (r) => r.action === 'refused',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.refused?.channel).toBe('stack.take');
    expect(rows[0]?.refused?.casparChannel).toBeUndefined();
    expect(rows[0]?.actor).toBe(FAKE_VIEWER.name);
  });
});
