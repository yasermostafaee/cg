import { describe, expect, it } from 'vitest';
import { authzChannelRefusal, type FixedLayerBank } from '@cg/shared-ipc';
import {
  FAKE_ADMIN,
  FAKE_CHANNEL_TWO_ADMIN,
  FAKE_PLAYOUT_PASSWORD,
} from './support/fake-playout.js';
import { openClient, startAuthedBridge } from './support/auth-harness.js';
import { track } from './support/harness.js';

/**
 * 🔴 `MULTI-CHANNEL-01` §2 J — **THE DEMO STATION HAS A STATION-ADMIN WHO CAN APPLY ITS SETUP.**
 *
 * `pnpm dev:playout-auth` declares its bank on channel 2. Its only station-admin was `cg-admin`,
 * granted channel 1: a `fixedLayers.set-config` from it passed the ROLE check and was refused by
 * the CHANNEL check, so nobody in the demo could apply Station setup. `cg-admin-ch2` holds channel
 * 2. Both users sign in through the fake Playout's own D1, with the password, as the console does.
 */

/** The demo's bank, as `scripts/dev-playout.ts` writes it: channel 2, the template band. */
const DEMO_BANK: FixedLayerBank = {
  channel: 2,
  start: 80,
  count: 20,
  low: { start: 50, count: 10 },
};

let seq = 0;
const id = (): string => `demo-${String(++seq)}`;

async function signIn(tokenUrl: string, username: string): Promise<string> {
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: FAKE_PLAYOUT_PASSWORD }),
  });
  expect(response.status, `the fake Playout refused ${username}`).toBe(200);
  const body = (await response.json()) as { access_token?: unknown };
  if (typeof body.access_token !== 'string') throw new Error('D1 returned no access token');
  return body.access_token;
}

describe('§2 J — the demo station’s own station-admin', () => {
  it('cg-admin-ch2 signs in through D1 and its set-config on channel 2 is accepted — control: cg-admin is refused with the channel sentence', async () => {
    const { handle, playout } = await startAuthedBridge({ fixedLayers: DEMO_BANK });
    track(playout, (p) => p.stop());
    track(handle, (h) => h.close());
    const renamed: FixedLayerBank = { ...DEMO_BANK, aliases: { '99': 'آرم' } };

    // CONTROL FIRST, on the same bridge: the channel-1 admin passes the role check and is
    // refused by the channel check, naming channel 2 — exactly what the owner met.
    const other = await openClient(handle);
    expect(
      (await other.authenticate(id(), await signIn(playout.tokenUrl, FAKE_ADMIN.username))).error,
    ).toBeUndefined();
    const refused = await other.ask(id(), 'fixedLayers.set-config', renamed);
    expect(refused.error).toBe(authzChannelRefusal(2));
    expect(handle.runtime.fixedLayersConfig()?.aliases).toBeUndefined();

    const admin = await openClient(handle);
    const token = await signIn(playout.tokenUrl, FAKE_CHANNEL_TWO_ADMIN.username);
    expect((await admin.authenticate(id(), token)).error).toBeUndefined();
    const accepted = await admin.ask(id(), 'fixedLayers.set-config', renamed);
    expect(accepted.error).toBeUndefined();
    expect(accepted.payload).toEqual({ ok: true });
    expect(handle.runtime.fixedLayersConfig()?.aliases).toEqual({ '99': 'آرم' });
  });
});
