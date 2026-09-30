import { describe, expect, it } from 'vitest';
import { grantsChannel, PlayoutChannelsSchema } from '@cg/shared-ipc';
import { PlayoutAuth } from '../src/playout-auth.js';
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

function verifier(p: FakePlayout): PlayoutAuth {
  return track(
    new PlayoutAuth({
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
    }),
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
