import { expect, it } from 'vitest';
import {
  AUTHZ_ROLE_REFUSAL,
  LOCK_ENGAGED_REFUSAL,
  PlaylistGainGetChannel,
  PlaylistGainSetChannel,
  authzChannelRefusal,
} from '@cg/shared-ipc';
import { createBridge } from '../src/bridge.js';
import { deadConnection, openClient } from './support/auth-harness.js';
import { startFakePlayout } from './support/fake-playout.js';
import { track } from './support/harness.js';
import { standardBank } from './support/two-channel-rig.js';

it('R-110 reaches only the authorized owning Engine with the acting operator and its read revision', async () => {
  const calls: { method?: string | undefined; url?: string | undefined; body: string }[] = [];
  const actor = { authorization: '' };
  const playout = track(
    await startFakePlayout({
      programmeGain: async (req, res) => {
        if (req.headers.authorization !== actor.authorization) {
          res.writeHead(403).end();
          return;
        }
        const chunks: Buffer[] = [];
        for await (const chunk of req as AsyncIterable<Buffer>) chunks.push(chunk);
        calls.push({
          method: req.method,
          url: req.url,
          body: Buffer.concat(chunks).toString('utf8'),
        });
        const write = req.method === 'PUT';
        const revision = write ? 5 : 4;
        res.writeHead(200, { 'Content-Type': 'application/json' }).end(
          JSON.stringify({
            contractVersion: 1,
            channelCode: 'fake-programme',
            gainDb: write ? -6 : 0,
            revision,
            target: { casparChannel: 1, layer: 7 },
            application: { desiredRevision: revision, appliedRevision: revision, state: 'applied' },
          }),
        );
      },
    }),
    (engine) => engine.stop(),
  );
  const bridge = track(
    await createBridge({
      port: 0,
      connection: deadConnection(),
      fixedLayers: [standardBank(1), standardBank(2)],
      playout: { auth: 'playout', address: playout.baseUrl, issuer: playout.issuer },
    }),
    (value) => value.close(),
  );
  const operator = await openClient(bridge);
  const viewer = await openClient(bridge);
  const operatorToken = await playout.issueToken({ user: 'operator' });
  actor.authorization = `Bearer ${operatorToken.token}`;
  expect((await operator.authenticate('op', operatorToken.token)).error).toBeUndefined();
  expect(
    (await viewer.authenticate('viewer', (await playout.issueToken({ user: 'viewer' })).token))
      .error,
  ).toBeUndefined();

  const get = PlaylistGainGetChannel.name;
  const set = PlaylistGainSetChannel.name;
  expect((await viewer.ask('viewer-get', get, { channel: 1 })).error).toBe(AUTHZ_ROLE_REFUSAL);
  expect((await operator.ask('other-channel', get, { channel: 2 })).error).toBe(
    authzChannelRefusal(2),
  );
  expect(calls).toEqual([]);

  let response: unknown;
  let reads = 0;
  await expect
    .poll(async () => {
      response = (await operator.ask(`get-${String(++reads)}`, get, { channel: 1 })).payload;
      return response;
    })
    .toMatchObject({ ok: true, state: { gainDb: 0, usage: 'unused' } });
  const parsed = PlaylistGainGetChannel.response.parse(response);
  if (!parsed.ok) throw new Error('expected an edit ticket from the fake Engine');
  const request = { channel: 1, editToken: parsed.state.editToken, gainDb: -6 };
  expect((await operator.ask('apply', set, request)).payload).toMatchObject({
    ok: true,
    state: { gainDb: -6, application: 'applied' },
  });
  expect((await operator.ask('repeat', set, request)).payload).toEqual({
    ok: false,
    reason: 'conflict',
  });
  expect((await operator.ask('lock', 'lock.engage', { pin: '1234' })).error).toBeUndefined();
  expect((await operator.ask('locked', get, { channel: 1 })).error).toBe(LOCK_ENGAGED_REFUSAL);
  expect(calls).toEqual([
    { method: 'GET', url: '/api/v1/channels/fake-programme/programme-gain', body: '' },
    {
      method: 'PUT',
      url: '/api/v1/channels/fake-programme/programme-gain',
      body: JSON.stringify({ gainDb: -6, expectedRevision: 4 }),
    },
  ]);
});
