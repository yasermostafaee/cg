import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import type { LivePreviewHandle, SourceDefinition } from '@cg/shared-ipc';
import { AuthSession } from '../src/auth-session.js';
import { LivePreviewService } from '../src/live-preview.js';
import { FakeLivePreview } from './support/fake-live-preview.js';
import { track } from './support/harness.js';
import { waitUntil } from './support/two-channel-rig.js';

const PROGRAMME = 'prepare-race';
const handle = (): LivePreviewHandle => ({ channel: 1, previewId: randomUUID() });
const sources: readonly SourceDefinition[] = [
  {
    id: 'in-li-studio1',
    name: 'Studio',
    origin: 'input',
    producer: { kind: 'ndi', source: 'Studio' },
  },
  {
    id: 'in-li-newscam',
    name: 'Guest',
    origin: 'input',
    producer: { kind: 'ndi', source: 'Guest' },
  },
];

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve: () => void = () => {
    throw new Error('Deferred was not initialized');
  };
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function fixture(prepare: (sourceId: string) => Promise<void>) {
  const preview = new FakeLivePreview();
  const server = track(
    http.createServer((req, res) => {
      void preview.handle(req, res).catch(() => res.destroy());
    }),
    async (held) => {
      held.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        held.close((error) => (error ? reject(error) : resolve())),
      );
    },
  );
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
  const owner = new AuthSession();
  owner.adopt({
    jti: 'fixture-operator',
    expEpochSec: Math.floor(Date.now() / 1000) + 600,
    rawToken: 'fixture-operator',
    principal: {
      name: 'Operator',
      sub: 'operator',
      roles: ['operator'],
      channels: '*',
      expiresAt: new Date(Date.now() + 600_000).toISOString(),
      nameTruncated: false,
    },
  });
  const service = track(
    new LivePreviewService(
      () => ({ origin, code: PROGRAMME, bearer: 'fixture-operator', engine: 'A' }),
      (id) => sources.find((source) => source.id === id),
      () => undefined,
      undefined,
      async (_owner, _channel, sourceId) => prepare(sourceId),
    ),
    (held) => held.dispose(),
  );
  return { service, owner, preview };
}

describe('live input preview preparation intent', () => {
  it('keeps the newest selection when the earlier source lookup completes last', async () => {
    const firstLookup = deferred();
    const { service, owner, preview } = await fixture(async (sourceId) => {
      if (sourceId === 'in-li-studio1') await firstLookup.promise;
    });
    const old = handle();
    const current = handle();
    const staleStart = service.start(owner, { ...old, sourceId: 'in-li-studio1' });
    expect(await service.start(owner, { ...current, sourceId: 'in-li-newscam' })).toMatchObject({
      state: 'connecting',
    });
    await waitUntil(
      async () => (await service.status(owner, current)).state === 'ready',
      'new source ready',
    );
    firstLookup.resolve();
    expect(await staleStart).toMatchObject({ state: 'replaced' });
    expect(await service.status(owner, current)).toMatchObject({
      state: 'ready',
      sourceName: 'Guest',
    });
    expect(preview.starts.map((entry) => entry.body)).toEqual([
      { inputId: 'li-newscam', requestId: current.previewId },
    ]);
    expect(preview.leases.get(PROGRAMME)?.requestId).toBe(current.previewId);
    expect(preview.stops).toEqual([]);
  });

  it('does not open an upstream lease after Stop cancels a pending source lookup', async () => {
    const lookup = deferred();
    const { service, owner, preview } = await fixture(async () => lookup.promise);
    const request = handle();
    const start = service.start(owner, { ...request, sourceId: 'in-li-studio1' });
    expect(service.stop(owner, request)).toEqual({ ok: true });
    lookup.resolve();
    expect(await start).toMatchObject({ state: 'expired' });
    expect(await service.status(owner, request)).toMatchObject({ state: 'expired' });
    expect(preview.paths).toEqual([]);
    expect(preview.leases.size).toBe(0);
  });

  it('does not let a stale Stop cancel a newer pending selection', async () => {
    const lookup = deferred();
    const { service, owner, preview } = await fixture(async () => lookup.promise);
    const old = handle();
    const current = handle();
    const start = service.start(owner, { ...current, sourceId: 'in-li-newscam' });
    service.stop(owner, old);
    lookup.resolve();
    expect(await start).toMatchObject({ state: 'connecting' });
    await waitUntil(
      async () => (await service.status(owner, current)).state === 'ready',
      'current source ready',
    );
    expect(preview.starts.map((entry) => entry.body)).toEqual([
      { inputId: 'li-newscam', requestId: current.previewId },
    ]);
  });
});
