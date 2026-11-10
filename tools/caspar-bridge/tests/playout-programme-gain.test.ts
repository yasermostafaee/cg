import { once } from 'node:events';
import { createServer, type IncomingHttpHeaders } from 'node:http';
import { describe, expect, it } from 'vitest';
import { PlayoutProgrammeGain } from '../src/playout-programme-gain.js';
import { track } from './support/harness.js';

const CHANNEL = 'SIM-ops';
const BEARER = 'fixture-operator-token';
const TARGET = { casparChannel: 3, layer: 26 };
const edit = { gainDb: -6, expectedRevision: 4, rampMs: 1_000 };

function state(revision: number, gainDb: number, application: 'pending' | 'ramping' | 'applied') {
  return {
    contractVersion: 1,
    channelCode: CHANNEL.toUpperCase(),
    unit: 'dB',
    gainDb,
    rampMs: gainDb === edit.gainDb ? edit.rampMs : 0,
    revision,
    limits: { minDb: -60, maxDb: 12, maxRampMs: 5_000 },
    target: TARGET,
    application: {
      desiredRevision: revision,
      appliedRevision: application === 'pending' ? null : revision,
      state: application,
      limited: false,
      rampEndsAt: application === 'ramping' ? '2026-11-09T20:59:59.0427033+00:00' : null,
      coreGeneration: 1,
    },
  };
}

interface Call {
  method: string | undefined;
  path: string | undefined;
  headers: IncomingHttpHeaders;
  body: string;
}

type Reply = { status: number; body: unknown } | 'disconnect';

async function fixture(...replies: Reply[]) {
  const calls: Call[] = [];
  const server = track(createServer(), (http) => {
    http.closeAllConnections();
    return new Promise<void>((resolve) => http.close(() => resolve()));
  });
  server.on('request', (request, response) => {
    request.setEncoding('utf8');
    let body = '';
    request.on('data', (chunk: string) => {
      body += chunk;
    });
    request.on('end', () => {
      calls.push({ method: request.method, path: request.url, headers: request.headers, body });
      const reply = replies.shift();
      if (reply === 'disconnect') {
        response.destroy();
        return;
      }
      response.writeHead(reply?.status ?? 500, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(reply?.body ?? null));
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('test Engine did not bind');
  const client = new PlayoutProgrammeGain(
    `http://127.0.0.1:${String(address.port)}`,
    CHANNEL,
    BEARER,
    TARGET.casparChannel,
  );
  return { client, calls };
}

describe('R-110 programme gain Playout client', () => {
  it('reads the logical channel with the operator bearer and sends only the revision-checked gain', async () => {
    const saved = state(4, 0, 'applied');
    const changed = state(5, -6, 'ramping');
    const { client, calls } = await fixture(
      { status: 200, body: saved },
      { status: 200, body: changed },
    );

    expect(await client.get()).toEqual({ ok: true, status: 200, state: saved });
    expect(await client.set(edit)).toEqual({ ok: true, status: 200, state: changed });
    expect(calls.map(({ method, path, body }) => ({ method, path, body }))).toEqual([
      { method: 'GET', path: `/api/v1/channels/${CHANNEL}/programme-gain`, body: '' },
      {
        method: 'PUT',
        path: `/api/v1/channels/${CHANNEL}/programme-gain`,
        body: JSON.stringify(edit),
      },
    ]);
    for (const call of calls) {
      expect(call.headers.authorization).toBe(`Bearer ${BEARER}`);
      expect(call.headers.origin).toBeUndefined();
    }
    expect(calls[1]?.headers['content-type']).toBe('application/json');
  });

  it('preserves durable pending state on 202 and follows it with a read without another write', async () => {
    const pending = state(5, -6, 'pending');
    const applied = state(5, -6, 'applied');
    const { client, calls } = await fixture(
      { status: 202, body: pending },
      { status: 200, body: pending },
      { status: 200, body: applied },
    );

    expect(await client.set(edit)).toEqual({ ok: true, status: 202, state: pending });
    expect(await client.get()).toEqual({ ok: true, status: 200, state: pending });
    expect(await client.get()).toEqual({ ok: true, status: 200, state: applied });
    expect(calls.map((call) => call.method)).toEqual(['PUT', 'GET', 'GET']);
  });

  it('preserves conflict and peer ownership as distinct reread results without retrying', async () => {
    const { client, calls } = await fixture(
      { status: 409, body: { error: 'programmeGain.revisionConflict', currentRevision: 8 } },
      { status: 409, body: { error: 'control.peerOwner' } },
      { status: 409, body: { error: 'programmeGain.busy' } },
    );

    expect(await client.set(edit)).toEqual({
      ok: false,
      status: 409,
      reason: 'conflict',
      reconcile: true,
      currentRevision: 8,
    });
    expect(await client.set(edit)).toEqual({
      ok: false,
      status: 409,
      reason: 'peer-owner',
      reconcile: true,
    });
    expect(await client.set(edit)).toEqual({
      ok: false,
      status: 409,
      reason: 'busy',
      reconcile: true,
    });
    expect(calls.map((call) => call.method)).toEqual(['PUT', 'PUT', 'PUT']);
  });

  it('reports an uncertain write when the Engine disconnects, answers 503 or fails to confirm the edit', async () => {
    const { client, calls } = await fixture(
      'disconnect',
      { status: 503, body: { error: 'programmeGain.saveFailed' } },
      { status: 200, body: state(4, 0, 'applied') },
    );

    for (const status of [0, 503, 200]) {
      expect(await client.set(edit)).toEqual({
        ok: false,
        status,
        reason: 'uncertain',
        reconcile: true,
      });
    }
    expect(calls.map((call) => call.method)).toEqual(['PUT', 'PUT', 'PUT']);
  });

  it('rejects mismatched channel, physical target or application revision and bounds the response', async () => {
    const saved = state(4, 0, 'applied');
    const { client } = await fixture(
      { status: 200, body: { ...saved, channelCode: 'OTHER' } },
      { status: 200, body: { ...saved, target: { ...TARGET, casparChannel: 1 } } },
      {
        status: 200,
        body: { ...saved, application: { ...saved.application, appliedRevision: 2 } },
      },
      { status: 200, body: { ...saved, unused: 'x'.repeat(17_000) } },
    );

    for (let index = 0; index < 4; index++) {
      expect(await client.get()).toEqual({
        ok: false,
        status: 200,
        reason: 'unavailable',
        reconcile: false,
      });
    }
  });

  it('rejects out-of-range, non-finite or unsafe edits before sending and retains auth or legacy refusal', async () => {
    const { client, calls } = await fixture(
      { status: 401, body: { error: 'invalid_token' } },
      { status: 403, body: { error: 'channel_forbidden' } },
      { status: 404, body: null },
    );

    for (const invalid of [
      { ...edit, gainDb: 13 },
      { ...edit, gainDb: -60.1 },
      { ...edit, gainDb: NaN },
      { ...edit, expectedRevision: Number.MAX_SAFE_INTEGER + 1 },
      { ...edit, rampMs: 0.5 },
      { ...edit, rampMs: 5_001 },
    ]) {
      expect(await client.set(invalid)).toEqual({
        ok: false,
        status: 0,
        reason: 'invalid-request',
        reconcile: false,
      });
    }
    expect(calls).toEqual([]);
    expect(await client.get()).toEqual({
      ok: false,
      status: 401,
      reason: 'forbidden',
      reconcile: false,
    });
    expect(await client.set(edit)).toEqual({
      ok: false,
      status: 403,
      reason: 'forbidden',
      reconcile: false,
    });
    expect(await client.get()).toEqual({
      ok: false,
      status: 404,
      reason: 'unavailable',
      reconcile: false,
    });
  });
});
