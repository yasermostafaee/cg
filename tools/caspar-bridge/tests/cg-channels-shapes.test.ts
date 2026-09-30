import { describe, expect, it } from 'vitest';
import { grantsChannel, PlayoutChannelsSchema, type PlayoutChannels } from '@cg/shared-ipc';
import { PlayoutAuth, type PlayoutAuthOptions } from '../src/playout-auth.js';
import { resolveGrantHosts } from '../src/playout-catalogue.js';
import { playoutFetch } from '../src/playout-http.js';
import { startFakePlayout, type FakePlayout } from './support/fake-playout.js';
import { track } from './support/harness.js';

/**
 * 🔴 `CENTRAL-BRIDGE-01-A` A3 (Playout `2.9.2` §2, §9) — **`cg_channels` ARRIVES IN THREE SHAPES, AND
 * EVERY READER TAKES ALL THREE.**
 *
 *   - `"*"` — every channel;
 *   - an explicit list — from `2.9.2`, even an ADMIN's token carries one on a Playout whose CG licence
 *     caps the channels, so a role never stands in for the claim;
 *   - a lone grant OBJECT — what D8 (`GET /api/cg/me`) answered for a multi-channel account before
 *     `2.9.2` (its FIRST grant).
 *
 * The readers: the bridge's token verifier (every console's principal) and D8. Nothing in the product
 * reads D8 today; the second half pins that what D8 sends, in either version, parses.
 */

const CH1 = { host: '127.0.0.1', channel: 1 } as const;
const CH2 = { host: '127.0.0.1', channel: 2 } as const;
const HOSTS = ['127.0.0.1'];

async function playout(): Promise<FakePlayout> {
  return track(await startFakePlayout(), (p) => p.stop());
}

function verifier(p: FakePlayout, options: PlayoutAuthOptions = {}): PlayoutAuth {
  return track(
    new PlayoutAuth(
      {
        address: null,
        issuer: p.issuer,
        jwksUrl: p.jwksUrl,
        tokenUrl: p.tokenUrl,
        refreshUrl: p.refreshUrl,
        channelsUrl: p.channelsUrl,
        revokedUrl: p.revokedUrl,
        inputsUrl: p.inputsUrl,
        mediaUrl: p.mediaUrl,
        audience: 'cg-control',
      },
      options,
    ),
    (a) => a.dispose(),
  );
}

describe('CENTRAL-BRIDGE-01-A A3 — the token verifier takes every shape of `cg_channels`', () => {
  it('`"*"` is every channel', async () => {
    const p = await playout();
    const { token } = await p.issueToken({ user: 'admin', cgChannels: '*' });
    const v = await verifier(p).verify(token);
    if (!v.ok) throw new Error(v.refusal);
    expect(v.token.principal.channels).toBe('*');
    expect(grantsChannel(v.token.principal.channels, HOSTS, 7)).toBe(true);
  });

  it('🔴 an ADMIN with an explicit list holds that list and nothing else — the role is not the claim', async () => {
    const p = await playout();
    const { token } = await p.issueToken({ user: 'admin', cgChannels: [CH1] });
    const v = await verifier(p).verify(token);
    if (!v.ok) throw new Error(v.refusal);
    expect(v.token.principal.roles).toContain('station-admin');
    expect(v.token.principal.channels).toEqual([CH1]);
    expect(grantsChannel(v.token.principal.channels, HOSTS, 1)).toBe(true);
    expect(grantsChannel(v.token.principal.channels, HOSTS, 2)).toBe(false);
  });

  it('🔴 a lone grant OBJECT is read as a list of one — never refused as malformed', async () => {
    const p = await playout();
    const { token } = await p.issueToken({ user: 'operator', cgChannels: CH2 });
    const v = await verifier(p).verify(token);
    if (!v.ok) throw new Error(v.refusal);
    expect(v.token.principal.channels).toEqual([CH2]);
    expect(grantsChannel(v.token.principal.channels, HOSTS, 2)).toBe(true);
    expect(grantsChannel(v.token.principal.channels, HOSTS, 1)).toBe(false);
  });
});

/**
 * 🔴 `B-297` (`CENTRAL-BRIDGE-01` rule 9) — **A LOOPBACK GRANT NAMES THE PLAYOUT'S MACHINE**, as a
 * loopback D4 row does: a grant's `host` is the Playout's `casparHost` (the join key). On `.111` that is
 * `127.0.0.1`, so a CG Bridge on a separate server — driving the Playout by its network address —
 * refused every explicit grant until the verifier read them by the host rule.
 */
describe('B-297 — a loopback grant is the Playout’s own machine (rule 9)', () => {
  const PLAYOUT = '192.0.2.50';

  it('the rule: loopback → the Playout’s host; another machine and `"*"` as they are; no Playout host, nothing', () => {
    const loops: PlayoutChannels = [
      { host: '127.0.0.1', channel: 1 },
      { host: 'localhost', channel: 2 },
      { host: '::1', channel: 3 },
    ];
    expect(resolveGrantHosts(loops, PLAYOUT)).toEqual([
      { host: PLAYOUT, channel: 1 },
      { host: PLAYOUT, channel: 2 },
      { host: PLAYOUT, channel: 3 },
    ]);
    const elsewhere: PlayoutChannels = [{ host: '198.51.100.10', channel: 1 }];
    expect(resolveGrantHosts(elsewhere, PLAYOUT)).toBe(elsewhere);
    expect(resolveGrantHosts('*', PLAYOUT)).toBe('*');
    // A CG Bridge on the Playout's own machine reads its Playout at loopback: nothing moves.
    expect(resolveGrantHosts(loops, '127.0.0.1')).toBe(loops);
    expect(resolveGrantHosts(loops, undefined)).toBe(loops);
  });

  it('🔴 the verifier reads a `127.0.0.1` grant as the Playout’s host — CONTROL: without it, the separate server refused it', async () => {
    const p = await playout();
    const { token } = await p.issueToken({ user: 'operator' });

    const separate = await verifier(p, { playoutHost: PLAYOUT }).verify(token);
    if (!separate.ok) throw new Error(separate.refusal);
    expect(separate.token.principal.channels).toEqual([{ host: PLAYOUT, channel: 1 }]);
    expect(grantsChannel(separate.token.principal.channels, [PLAYOUT], 1)).toBe(true);

    // CONTROL — the same token read as the grant spells it: a CG Bridge driving `192.0.2.50` holds
    // nothing. This is B-297 as it stood.
    const literal = await verifier(p).verify(token);
    if (!literal.ok) throw new Error(literal.refusal);
    expect(literal.token.principal.channels).toEqual([{ host: '127.0.0.1', channel: 1 }]);
    expect(grantsChannel(literal.token.principal.channels, [PLAYOUT], 1)).toBe(false);
  });

  it('🔴 a grant naming ANOTHER machine still authorises nothing here', async () => {
    const p = await playout();
    const { token } = await p.issueToken({ user: 'otherStation' });
    const v = await verifier(p, { playoutHost: PLAYOUT }).verify(token);
    if (!v.ok) throw new Error(v.refusal);
    expect(v.token.principal.channels).toEqual([{ host: '192.0.2.10', channel: 1 }]);
    expect(grantsChannel(v.token.principal.channels, [PLAYOUT], 1)).toBe(false);
  });
});

describe('CENTRAL-BRIDGE-01-A A3 — what D8 sends, in either version, parses', () => {
  async function me(p: FakePlayout, token: string): Promise<unknown> {
    const answer = await playoutFetch(`${p.issuer}/api/cg/me`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(answer.status).toBe(200);
    return ((await answer.json()) as { cg_channels: unknown }).cg_channels;
  }

  it('2.9.2: the FULL list (and `"*"` as itself)', async () => {
    const p = await playout();
    const both = await p.issueToken({ user: 'admin', cgChannels: [CH1, CH2] });
    const listed = await me(p, both.token);
    expect(listed).toEqual([CH1, CH2]);
    expect(PlayoutChannelsSchema.parse(listed)).toEqual([CH1, CH2]);
    const star = await p.issueToken({ user: 'admin', cgChannels: '*' });
    expect(PlayoutChannelsSchema.parse(await me(p, star.token))).toBe('*');
  });

  it('🔴 before 2.9.2: a lone OBJECT — read as a list of one (CONTROL: the same token answered the full list above)', async () => {
    const p = await playout();
    p.setMeLegacy(true);
    const both = await p.issueToken({ user: 'admin', cgChannels: [CH1, CH2] });
    const lone = await me(p, both.token);
    // The instrument: the fake really does answer the old shape.
    expect(Array.isArray(lone)).toBe(false);
    expect(lone).toEqual(CH1);
    expect(PlayoutChannelsSchema.parse(lone)).toEqual([CH1]);
  });
});
