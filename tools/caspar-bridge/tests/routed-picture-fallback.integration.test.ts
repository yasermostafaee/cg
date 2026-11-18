import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthSession } from '../src/auth-session.js';
import { RoutedSourceReads } from '../src/routed-source-reads.js';
import type { SourcePreviewSelector } from '../src/playout-source-previews.js';
import type { PreviewEngine } from '../src/source-read-routing.js';
import { FRAME_A, FRAME_B } from './support/fake-pgm-feed.js';
import { track } from './support/harness.js';
import { waitUntil } from './support/two-channel-rig.js';

interface Lease {
  source: SourcePreviewSelector;
  requestId: string;
  id: string;
}

class PassiveNode {
  readonly starts: SourcePreviewSelector[] = [];
  readonly batches: SourcePreviewSelector[][] = [];
  readonly leases = new Map<string, Lease>();
  stops = 0;
  pending = false;
  snapshotStatus = 200;
  snapshotGate: Promise<void> | undefined;
  readonly code: string;
  readonly base: string;
  constructor(readonly engine: PreviewEngine) {
    this.code = `local-${engine.toLowerCase()}`;
    this.base = `/api/v1/channels/${this.code}/source-previews`;
  }
  selector(id: string): SourcePreviewSelector {
    return id === 'media'
      ? { kind: 'media', mediaId: `${this.engine}-media` }
      : { kind: 'live', inputId: `${this.engine}-${id}` };
  }
  identity(lease: Lease) {
    return {
      subscriptionId: lease.id,
      generation: 'core:1',
      source: lease.source,
      sourceRevision: 'catalogue-1',
    };
  }
  frame(source: SourcePreviewSelector) {
    const raster = { x: 0, y: 0, width: 64, height: 36 };
    return {
      schemaVersion: 1,
      supported: true,
      state: this.pending ? 'pending' : 'ready',
      signal: this.pending || source.kind !== 'live' ? 'unknown' : 'present',
      signalReason: 'fixture',
      frameAgeMs: 0,
      producerGeneration: 'producer-1',
      requestedPositionMs: source.kind === 'media' ? (source.atMs ?? 0) : null,
      jpegBase64: this.pending
        ? null
        : (this.engine === 'A' ? FRAME_A : FRAME_B).toString('base64'),
      geometry: this.pending
        ? null
        : {
            sourceWidth: 64,
            sourceHeight: 36,
            sourceSar: { numerator: 1, denominator: 1 },
            visibleSourceRect: raster,
            deliveredWidth: 64,
            deliveredHeight: 36,
            activeRect: raster,
            coversFullVisibleSource: true,
            geometryRevision: 'geometry-1',
            sourceToDelivered: { scaleX: 1, scaleY: 1, translateX: 0, translateY: 0 },
          },
    };
  }
  readonly handle = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const send = (status: number, body: object) => {
      res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body));
    };
    if (req.headers.authorization !== `Bearer own-${this.engine}`)
      return send(401, { error: 'fixture.wrongNodeToken' });
    const url = new URL(req.url ?? '/', 'http://fixture');
    if (url.pathname === this.base && req.method === 'GET')
      return send(200, {
        contractVersion: 1,
        opensReceivers: false,
        audio: false,
        maxSubscriptionsPerChannel: 4,
        maxSubscriptions: 8,
        maxBatchSources: 8,
        maxFramesPerSecond: 2,
        maxBytesPerSecond: 2097152,
        burstBytes: 2097152,
        ttlSeconds: 90,
        renewAfterSeconds: 30,
        maxWidth: 640,
        maxHeight: 640,
        maxJpegBytes: 131072,
        sourceKinds: ['live', 'playlist', 'media'],
      });
    if (req.method === 'POST') {
      const chunks: Buffer[] = [];
      for await (const chunk of req as AsyncIterable<Buffer>) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString()) as {
        sources?: SourcePreviewSelector[];
        source?: SourcePreviewSelector;
        requestId?: string;
      };
      const wanted = body.sources ?? (body.source === undefined ? [] : [body.source]);
      if (
        wanted.some((source) =>
          source.kind === 'live'
            ? !source.inputId.startsWith(`${this.engine}-`)
            : source.kind === 'media'
              ? source.mediaId !== `${this.engine}-media`
              : true,
        )
      )
        return send(400, { error: 'fixture.foreignSourceId' });
      if (url.pathname === this.base + '/snapshots') {
        this.batches.push(wanted);
        await this.snapshotGate;
        if (this.snapshotStatus !== 200)
          return send(this.snapshotStatus, { error: 'sourcePreview.capacity' });
        return send(200, {
          observedAt: new Date().toISOString(),
          items: wanted.map((source) => ({
            source,
            sourceRevision: 'catalogue-1',
            status: 200,
            frame: this.frame(source),
          })),
        });
      }
      if (url.pathname === this.base && body.source !== undefined && body.requestId !== undefined) {
        const lease = { source: body.source, requestId: body.requestId, id: randomUUID() };
        this.starts.push(lease.source);
        this.leases.set(lease.id, lease);
        return send(200, {
          ...this.identity(lease),
          coreGeneration: 1,
          channelCode: this.code,
          requestId: lease.requestId,
          expiresAt: new Date(Date.now() + 90000).toISOString(),
          renewAfterSeconds: 30,
          frameUrl: `${this.base}/${lease.id}/frame`,
          receiverOpened: false,
          audioSubscribed: false,
        });
      }
    }
    const [id, action] = url.pathname.slice(this.base.length + 1).split('/');
    const lease = this.leases.get(id ?? '');
    if (lease === undefined) return send(404, { error: 'sourcePreview.notFound' });
    if (req.method === 'GET' && action === 'frame')
      return send(200, {
        ...this.identity(lease),
        observedAt: new Date().toISOString(),
        frame: this.frame(lease.source),
      });
    if (req.method === 'DELETE' && url.searchParams.get('generation') === 'core:1') {
      this.leases.delete(lease.id);
      this.stops++;
      return send(200, { ok: true });
    }
    return send(409, { error: 'sourcePreview.identityMismatch' });
  };
}

afterEach(() => vi.restoreAllMocks());

async function fixture(preferred: PreviewEngine = 'B') {
  let now = Date.now();
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  const nodes = { A: new PassiveNode('A'), B: new PassiveNode('B') };
  nodes[preferred].pending = true;
  const origins: Record<PreviewEngine, string> = { A: '', B: '' };
  for (const engine of ['A', 'B'] as const) {
    const server = track(
      http.createServer((req, res) => {
        void nodes[engine].handle(req, res).catch(() => res.destroy());
      }),
      async (held) => {
        held.closeAllConnections();
        await new Promise<void>((resolve) => held.close(() => resolve()));
      },
    );
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    origins[engine] = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
  }
  const owner = new AuthSession();
  owner.adopt({
    jti: 'fixture',
    rawToken: 'operator-fixture',
    expEpochSec: Math.floor(now / 1000) + 600,
    principal: {
      name: 'Operator',
      sub: 'operator',
      roles: ['operator'],
      channels: '*',
      expiresAt: new Date(now + 600000).toISOString(),
      nameTruncated: false,
    },
  });
  const routed = new Map<string, PreviewEngine>();
  let permitted = true;
  let fallbackAllowed = true;
  let fallbackCalls = 0;
  let gate: Promise<void> | undefined;
  const reads = track(
    new RoutedSourceReads({
      prepare: async (_owner, _channel, ids) =>
        new Map(ids.map((id) => [id, routed.get(id) ?? preferred])),
      fallback: async (_owner, _channel, from) => {
        fallbackCalls++;
        await gate;
        return new Map(
          [...from].flatMap(([id, engine]) =>
            fallbackAllowed && permitted
              ? [[id, engine === 'A' ? ('B' as const) : ('A' as const)]]
              : [],
          ),
        );
      },
      target: (engine) =>
        permitted
          ? { origin: origins[engine], code: nodes[engine].code, bearer: `own-${engine}`, engine }
          : null,
      selector: (engine, _owner, _channel, id) => nodes[engine].selector(id),
      mediaId: (engine) => `${engine}-media`,
    }),
    (held) => held.dispose(),
  );
  return {
    nodes,
    reads,
    owner,
    routed,
    fallbackCalls: () => fallbackCalls,
    advance: () => {
      now += 1100;
    },
    deny: () => {
      permitted = false;
    },
    forbidFallback: () => {
      fallbackAllowed = false;
    },
    delayFallback: () => {
      let release: () => void = () => undefined;
      gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      return release;
    },
  };
}

describe('authenticated passive picture fallback', () => {
  it.each(['A', 'B'] as const)(
    'uses the alternate node picture and its own bearer/source ID when %s returns a valid pending observation',
    async (preferred) => {
      const f = await fixture(preferred);
      const alternate = preferred === 'A' ? 'B' : 'A';
      const result = await f.reads.thumbnails(f.owner, { channel: 1, sourceIds: ['camera'] });
      expect(result.frames).toMatchObject([
        {
          sourceId: 'camera',
          engine: alternate,
          jpegBase64: (alternate === 'A' ? FRAME_A : FRAME_B).toString('base64'),
        },
      ]);
      expect(f.nodes[preferred].batches).toEqual([
        [{ kind: 'live', inputId: `${preferred}-camera` }],
      ]);
      expect(f.nodes[alternate].batches).toEqual([
        [{ kind: 'live', inputId: `${alternate}-camera` }],
      ]);
    },
  );

  it('does not duplicate snapshots or guess fallback on empty/throttled or refused replies', async () => {
    const f = await fixture();
    f.nodes.B.snapshotStatus = 429;
    expect(await f.reads.thumbnails(f.owner, { channel: 1, sourceIds: ['camera'] })).toEqual({
      frames: [],
    });
    expect(f.fallbackCalls()).toBe(0);
    expect(f.nodes.A.batches).toEqual([]);
    expect(await f.reads.thumbnails(f.owner, { channel: 1, sourceIds: ['camera'] })).toEqual({
      frames: [],
    });
    expect(f.nodes.B.batches).toHaveLength(1);
  });

  it('keeps independent PVW leases in a per-node union and closes fallback when preferred pictures recover', async () => {
    const f = await fixture();
    f.routed.set('sibling', 'A');
    const request = { channel: 1, viewId: randomUUID(), sourceIds: ['camera', 'sibling'] };
    const first = await f.reads.pvw(f.owner, request);
    expect(first.frames.map(({ sourceId, engine }) => [sourceId, engine])).toEqual([
      ['camera', 'A'],
      ['sibling', 'A'],
    ]);
    expect(f.nodes.A.leases.size).toBe(2);
    expect(f.nodes.A.stops).toBe(0);
    f.advance();
    await f.reads.pvw(f.owner, request);
    expect(f.nodes.A.starts).toHaveLength(2);
    expect(f.nodes.B.starts).toHaveLength(1);
    f.advance();
    f.nodes.B.pending = false;
    const recovered = await f.reads.pvw(f.owner, request);
    expect(recovered.frames.map(({ sourceId, engine }) => [sourceId, engine])).toEqual([
      ['camera', 'B'],
      ['sibling', 'A'],
    ]);
    expect(f.nodes.A.leases.size).toBe(1);
    expect(f.nodes.A.stops).toBe(1);
    await f.reads.drop(f.owner);
    expect(f.nodes.A.leases.size + f.nodes.B.leases.size).toBe(0);
  });

  it('warms a mixed thumbnail union for the next normal poll without bypassing the one-batch budget', async () => {
    const f = await fixture();
    f.routed.set('sibling', 'A');
    const request = { channel: 1, sourceIds: ['camera', 'sibling'] };
    const first = await f.reads.thumbnails(f.owner, request);
    expect(first.frames.find((frame) => frame.sourceId === 'camera')?.jpegBase64).toBeUndefined();
    expect(f.nodes.A.batches).toHaveLength(1);
    f.advance();
    const next = await f.reads.thumbnails(f.owner, request);
    expect(next.frames.find((frame) => frame.sourceId === 'camera')).toMatchObject({
      engine: 'A',
      jpegBase64: FRAME_A.toString('base64'),
    });
    expect(f.nodes.A.batches).toHaveLength(2);
    expect(f.nodes.A.batches[1]).toHaveLength(2);
  });

  it('preserves the requested media position while resolving the other node media ID', async () => {
    const f = await fixture();
    const result = await f.reads.thumbnails(f.owner, {
      channel: 1,
      sourceIds: [],
      mediaPosition: { sourceId: 'media', atMs: 1234 },
    });
    expect(result.mediaFrame).toMatchObject({
      sourceId: 'media',
      engine: 'A',
      previewPositionMs: 1234,
      jpegBase64: FRAME_A.toString('base64'),
    });
    expect(f.nodes.A.batches).toEqual([[{ kind: 'media', mediaId: 'A-media', atMs: 1234 }]]);
  });

  it('retains pending metadata when the alternate is not independently confirmed', async () => {
    const f = await fixture();
    f.forbidFallback();
    const result = await f.reads.thumbnails(f.owner, { channel: 1, sourceIds: ['camera'] });
    expect(result.frames).toEqual([{ sourceId: 'camera', engine: 'B', signal: 'unknown' }]);
    expect(f.nodes.A.batches).toEqual([]);
  });

  it('does not return a previously fetched sibling picture after access changes during fallback', async () => {
    const f = await fixture();
    f.routed.set('sibling', 'A');
    const release = f.delayFallback();
    const work = f.reads.thumbnails(f.owner, { channel: 1, sourceIds: ['camera', 'sibling'] });
    await waitUntil(() => f.fallbackCalls() === 1, 'pending thumbnail fallback authorization');
    f.deny();
    release();
    expect(await work).toEqual({ frames: [] });
  });

  it('does not issue a late alternate snapshot after thumbnail cleanup', async () => {
    const f = await fixture();
    const release = f.delayFallback();
    const work = f.reads.thumbnails(f.owner, { channel: 1, sourceIds: ['camera'] });
    await waitUntil(() => f.fallbackCalls() === 1, 'pending thumbnail fallback');
    await f.reads.drop(f.owner);
    release();
    expect(await work).toEqual({ frames: [] });
    expect(f.nodes.A.batches).toEqual([]);
  });

  it('keeps a slow input snapshot valid while an independent positioned-media request is throttled', async () => {
    const f = await fixture('A');
    f.nodes.A.pending = false;
    let release: () => void = () => undefined;
    f.nodes.A.snapshotGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const input = f.reads.thumbnails(f.owner, { channel: 1, sourceIds: ['camera'] });
    await waitUntil(() => f.nodes.A.batches.length === 1, 'pending input snapshot');
    expect(
      await f.reads.thumbnails(f.owner, {
        channel: 1,
        sourceIds: [],
        mediaPosition: { sourceId: 'media', atMs: 1234 },
      }),
    ).toEqual({ frames: [] });
    release();
    expect((await input).frames).toMatchObject([
      { sourceId: 'camera', engine: 'A', jpegBase64: FRAME_A.toString('base64') },
    ]);
    expect(f.nodes.A.batches).toHaveLength(1);
    expect(f.nodes.B.batches).toEqual([]);
  });

  it.each(['drop', 'stop'] as const)(
    'never opens the alternate after %s cancels a pending fallback decision',
    async (cancel) => {
      const f = await fixture();
      const release = f.delayFallback();
      const request = { channel: 1, viewId: randomUUID(), sourceIds: ['camera'] };
      const pending = f.reads.pvw(f.owner, request);
      await waitUntil(() => f.fallbackCalls() === 1, 'pending fallback authorization');
      if (cancel === 'drop') await f.reads.drop(f.owner);
      else await f.reads.pvw(f.owner, { ...request, sourceIds: [] });
      release();
      expect(await pending).toEqual({ frames: [] });
      expect(f.nodes.A.starts).toEqual([]);
      expect(f.nodes.B.leases.size).toBe(0);
    },
  );
});
