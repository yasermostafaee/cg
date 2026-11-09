import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  SourcePreviewPvwChannel,
  SourcePreviewThumbnailsChannel,
  inputSourceId,
  type ChannelResponse,
} from '@cg/shared-ipc';
import { describe, expect, it } from 'vitest';
import type { SourcePreviewSelector } from '../src/playout-source-previews.js';
import { openClient, type Client } from './support/auth-harness.js';
import { startFakePlayout } from './support/fake-playout.js';
import { FRAME_A, FRAME_B } from './support/fake-pgm-feed.js';
import { track } from './support/harness.js';
import { twoChannelRig, waitUntil } from './support/two-channel-rig.js';

const BASE = '/api/v1/channels/fake-programme/source-previews';
const GENERATION = 'native-fixture:1';
const LIVE = inputSourceId('li-multicast');
const PLAYLIST = inputSourceId('pl-apasai');
const FOREIGN_PLAYLIST = inputSourceId('pl-cg-test2');

interface Lease {
  id: string;
  source: SourcePreviewSelector;
  owner: string;
  requestId: string;
}

function send(response: ServerResponse, status: number, body: object): void {
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(body));
}

async function bodyOf<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of request as AsyncIterable<Buffer>) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as T;
}

class FakeSourcePreviews {
  readonly requests: { method: string | undefined; path: string; owner: string }[] = [];
  readonly starts: Lease[] = [];
  readonly stops: { id: string; owner: string; generation: string }[] = [];
  readonly snapshots: SourcePreviewSelector[][] = [];
  readonly leases = new Map<string, Lease>();
  liveAbsent = false;

  readonly handle = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const url = new URL(request.url ?? '/', 'http://fake-playout.invalid');
    const owner = request.headers.authorization ?? '';
    const { pathname: path, searchParams } = url;
    this.requests.push({ method: request.method, path, owner });
    if (path === BASE && request.method === 'GET') {
      send(response, 200, {
        contractVersion: 1,
        opensReceivers: false,
        audio: false,
        maxSubscriptionsPerChannel: 4,
        maxSubscriptions: 8,
        maxBatchSources: 8,
        maxFramesPerSecond: 2,
        maxBytesPerSecond: 2_097_152,
        burstBytes: 2_097_152,
        ttlSeconds: 90,
        renewAfterSeconds: 30,
        maxWidth: 640,
        maxHeight: 640,
        maxJpegBytes: 131_072,
        sourceKinds: ['live', 'playlist', 'media'],
      });
      return;
    }
    if (path === BASE && request.method === 'POST') {
      const input = await bodyOf<Pick<Lease, 'source' | 'requestId'>>(request);
      const lease = { id: `sub-${this.starts.length + 1}`, owner, ...input };
      this.leases.set(lease.id, lease);
      this.starts.push(lease);
      send(response, 200, {
        ...this.#identity(lease),
        coreGeneration: 1,
        channelCode: 'fake-programme',
        requestId: lease.requestId,
        expiresAt: new Date(Date.now() + 90_000).toISOString(),
        renewAfterSeconds: 30,
        frameUrl: `${BASE}/${lease.id}/frame`,
        receiverOpened: false,
        audioSubscribed: false,
      });
      return;
    }
    if (path === BASE + '/snapshots' && request.method === 'POST') {
      const { sources } = await bodyOf<{ sources: SourcePreviewSelector[] }>(request);
      this.snapshots.push(sources);
      send(response, 200, {
        observedAt: new Date().toISOString(),
        items: sources.map((source) => ({
          source,
          status: 200,
          sourceRevision: source.kind + '-catalogue-revision',
          frame: this.#frame(source),
        })),
      });
      return;
    }
    const [id, action] = path.slice(BASE.length + 1).split('/');
    const lease = this.leases.get(id ?? '');
    if (lease === undefined || lease.owner !== owner) {
      send(response, 404, { error: 'sourcePreview.notFound' });
      return;
    }
    if (request.method === 'GET' && action === 'frame') {
      send(response, 200, {
        ...this.#identity(lease),
        observedAt: new Date().toISOString(),
        frame: this.#frame(lease.source),
      });
      return;
    }
    const generation = searchParams.get('generation');
    if (request.method === 'DELETE' && action === undefined && generation === GENERATION) {
      this.stops.push({ id: lease.id, owner, generation });
      this.leases.delete(lease.id);
      send(response, 200, { ok: true });
      return;
    }
    send(response, 409, { error: 'sourcePreview.identityMismatch' });
  };

  #identity(lease: Lease) {
    return {
      subscriptionId: lease.id,
      generation: GENERATION,
      source: lease.source,
      sourceRevision: lease.source.kind + '-catalogue-revision',
    };
  }

  #frame(source: SourcePreviewSelector) {
    const isLive = source.kind === 'live';
    const absent = isLive && this.liveAbsent;
    const raster = { x: 0, y: 0, width: 64, height: 36 };
    return {
      schemaVersion: 1,
      supported: true,
      state: 'ready',
      signal: isLive ? (absent ? 'absent' : 'present') : 'unknown',
      signalReason: isLive
        ? absent
          ? 'no-decoded-video'
          : 'receiving'
        : 'not-applicable-to-programme-source',
      signalScope: isLive ? 'decoded-input-video' : 'programme-image-only',
      producerGeneration: source.kind + '-native-generation',
      frameAgeMs: absent ? 4000 : 0,
      capturedAtUtc: new Date().toISOString(),
      // The native feed can retain a previous JPEG after it reports absent.
      jpegBase64: (isLive ? FRAME_A : FRAME_B).toString('base64'),
      mimeType: 'image/jpeg',
      geometry: {
        sourceWidth: 64,
        sourceHeight: 36,
        sourceSar: { numerator: 1, denominator: 1 },
        visibleSourceRect: raster,
        deliveredWidth: 64,
        deliveredHeight: 36,
        activeRect: raster,
        coversFullVisibleSource: true,
        geometryRevision: 'native-geometry-v1',
        sourceToDelivered: { scaleX: 1, scaleY: 1, translateX: 0, translateY: 0 },
      },
    };
  }
}

async function ask<T>(client: Client, method: string, payload: unknown): Promise<T> {
  const answer = await client.ask(randomUUID(), method, payload);
  if (answer.error !== undefined) throw new Error(answer.error);
  return answer.payload as T;
}

const pvw = (client: Client, viewId: string, sourceIds: string[]) =>
  ask<ChannelResponse<typeof SourcePreviewPvwChannel>>(client, SourcePreviewPvwChannel.name, {
    channel: 1,
    viewId,
    sourceIds,
  });

const thumbnails = (client: Client, sourceIds: string[]) =>
  ask<ChannelResponse<typeof SourcePreviewThumbnailsChannel>>(
    client,
    SourcePreviewThumbnailsChannel.name,
    { channel: 1, sourceIds },
  );

describe('C-023 independent source previews through authenticated Bridge WebSocket', () => {
  it('keeps exact authorized PVW sources separate, masks stale JPEGs and closes only owned leases', async () => {
    const preview = new FakeSourcePreviews();
    const playout = track(await startFakePlayout({ sourcePreviews: preview.handle }), (p) =>
      p.stop(),
    );
    const rig = await twoChannelRig({
      bridge: { playout: { auth: 'playout', address: playout.baseUrl, issuer: playout.issuer } },
    });
    const before = (await rig.lines()).length;
    const first = await openClient(rig.handle);
    const second = await openClient(rig.handle);
    const firstView = randomUUID();
    const secondView = randomUUID();
    const unsigned = await first.ask(randomUUID(), SourcePreviewPvwChannel.name, {
      channel: 1,
      viewId: firstView,
      sourceIds: [LIVE, PLAYLIST],
    });
    expect(unsigned.error).toEqual(expect.any(String));
    expect(preview.requests).toEqual([]);

    const firstToken = (await playout.issueToken({ user: 'operator' })).token;
    const secondToken = (await playout.issueToken({ user: 'operator' })).token;
    const firstOwner = 'Bearer ' + firstToken;
    const secondOwner = 'Bearer ' + secondToken;
    expect((await first.authenticate(randomUUID(), firstToken)).error).toBeUndefined();
    expect((await second.authenticate(randomUUID(), secondToken)).error).toBeUndefined();
    await waitUntil(
      () =>
        rig.handle.runtime.sourceCatalog().sources.some((entry) => entry.id === PLAYLIST) &&
        playout.channelsBearers.length > 0,
      'D4 channel and D10 Playlist identities',
    );
    expect(
      (
        await first.ask(randomUUID(), SourcePreviewPvwChannel.name, {
          channel: 2,
          viewId: firstView,
          sourceIds: [LIVE],
        })
      ).error,
    ).toEqual(expect.any(String));
    expect(preview.requests).toEqual([]);

    const liveSelector = { kind: 'live', inputId: 'li-multicast' };
    const playlistSelector = {
      kind: 'playlist',
      playlistOf: { casparHost: '127.0.0.1', casparChannel: 1 },
    };
    const liveFrame = {
      sourceId: LIVE,
      signal: 'present',
      jpegBase64: FRAME_A.toString('base64'),
      width: 64,
      height: 36,
    };
    const playlistFrame = {
      sourceId: PLAYLIST,
      signal: 'unknown',
      jpegBase64: FRAME_B.toString('base64'),
      width: 64,
      height: 36,
    };
    expect(await thumbnails(first, [LIVE, PLAYLIST, FOREIGN_PLAYLIST])).toEqual({
      frames: [liveFrame, playlistFrame],
    });
    expect(preview.snapshots).toEqual([[liveSelector, playlistSelector]]);
    expect(preview.starts).toEqual([]);
    expect(await pvw(first, firstView, [LIVE, PLAYLIST, FOREIGN_PLAYLIST])).toEqual({
      frames: [liveFrame, playlistFrame],
    });
    expect(await pvw(second, secondView, [PLAYLIST])).toEqual({ frames: [playlistFrame] });
    expect(preview.starts).toHaveLength(3);
    expect(preview.starts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ owner: firstOwner, source: liveSelector }),
        expect.objectContaining({ owner: firstOwner, source: playlistSelector }),
        expect.objectContaining({ owner: secondOwner, source: playlistSelector }),
      ]),
    );
    expect(new Set(preview.starts.map((lease) => lease.requestId)).size).toBe(3);
    expect(preview.requests.every((request) => request.path.startsWith(BASE))).toBe(true);

    preview.liveAbsent = true;
    await waitUntil(async () => {
      const result = await pvw(first, firstView, [LIVE, PLAYLIST]);
      return result.frames.some(
        (picture) => picture.sourceId === LIVE && picture.signal === 'absent',
      );
    }, 'the next decoded signal observation');
    expect(await pvw(first, firstView, [LIVE, PLAYLIST])).toEqual({
      frames: [{ sourceId: LIVE, signal: 'absent' }, playlistFrame],
    });

    expect(await pvw(first, randomUUID(), [])).toEqual({ frames: [] });
    expect(preview.stops).toEqual([]);
    expect(await pvw(first, firstView, [])).toEqual({ frames: [] });
    expect(preview.stops).toEqual(
      expect.arrayContaining(
        preview.starts
          .filter((lease) => lease.owner === firstOwner)
          .map((lease) => ({ id: lease.id, owner: firstOwner, generation: GENERATION })),
      ),
    );
    expect(preview.stops).toHaveLength(2);
    expect(await pvw(second, secondView, [PLAYLIST])).toEqual({ frames: [playlistFrame] });
    second.ws.close();
    await waitUntil(() => preview.leases.size === 0, 'exact owner cleanup on disconnect');
    expect(preview.stops[2]).toEqual({
      id: preview.starts.find((lease) => lease.owner === secondOwner)?.id,
      owner: secondOwner,
      generation: GENERATION,
    });
    expect(
      (await rig.lines())
        .slice(before)
        .filter((line) => /^(?:CG|PLAY|STOP|CLEAR|MIXER|LOAD|LOADBG)\b/i.test(line)),
    ).toEqual([]);
  });
});
