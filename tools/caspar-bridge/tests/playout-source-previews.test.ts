import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { describe, expect, it } from 'vitest';
import {
  PlayoutSourcePreviews,
  type SourcePreviewReply,
  type SourcePreviewSelector,
} from '../src/playout-source-previews.js';
import { FRAME_A, FRAME_B } from './support/fake-pgm-feed.js';
import { track } from './support/harness.js';

const BASE = '/api/v1/channels/TEST/source-previews';
const OWNER = 'preview-fixture-owner';
const OBSERVED_AT = '2026-11-09T21:02:18.73724+00:00';
const GENERATION = 'native-core:1';
const INPUT_A = { kind: 'live', inputId: 'udp-a' } as const;
const INPUT_B = { kind: 'live', inputId: 'udp-b' } as const;
const PLAYLIST = {
  kind: 'playlist',
  playlistOf: { casparHost: '127.0.0.1', casparChannel: 1 },
} as const;
const MEDIA = { kind: 'media', mediaId: 'clip-fixture' } as const;
const CAPABILITY = {
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
};

function canonicalSource(source: SourcePreviewSelector): object {
  return { inputId: null, playlistOf: null, mediaId: null, fingerprint: null, atMs: 0, ...source };
}

function session(source: SourcePreviewSelector, subscriptionId: string, requestId: string) {
  return {
    subscriptionId,
    generation: GENERATION,
    coreGeneration: 1,
    channelCode: 'TEST',
    requestId,
    source: canonicalSource(source),
    sourceRevision: subscriptionId + '-source-revision',
    expiresAt: '2026-11-09T21:03:45.6836096+00:00',
    renewAfterSeconds: 30,
    frameUrl: BASE + '/' + subscriptionId + '/frame',
    receiverOpened: false,
    audioSubscribed: false,
  };
}

const geometry = {
  sourceWidth: 64,
  sourceHeight: 36,
  sourceSar: { numerator: 1, denominator: 1 },
  sourceRotationDegrees: 0,
  appliedRotationDegrees: 0,
  visibleSourceRect: { x: 0, y: 0, width: 64, height: 36 },
  deliveredWidth: 64,
  deliveredHeight: 36,
  deliveredSar: { numerator: 1, denominator: 1 },
  activeRect: { x: 0, y: 0, width: 64, height: 36 },
  coversFullVisibleSource: true,
  geometryRevision: 'decoder-first-geometry',
  sourceToDelivered: { scaleX: 1, scaleY: 1, translateX: 0, translateY: 0 },
  captureStage: 'decoded-source-before-filters-and-mixer',
  coordinateSpace: 'decoded-frame-raster',
};

function frame(bytes: Buffer) {
  return {
    schemaVersion: 1,
    supported: true,
    state: 'ready',
    signal: 'present',
    signalReason: 'receiving',
    signalScope: 'decoded-input-video',
    producerGeneration: 'first-decoder',
    decodedVideoFrames: 82,
    sampleSequence: 78,
    sourceAgeMs: 5,
    frameAgeMs: 164,
    capturedAtUtc: OBSERVED_AT,
    jpegBase64: bytes.toString('base64'),
    mimeType: 'image/jpeg',
    geometry,
  };
}

function observation(held: ReturnType<typeof session>, picture: object) {
  return {
    subscriptionId: held.subscriptionId,
    generation: held.generation,
    source: held.source,
    sourceRevision: held.sourceRevision,
    observedAt: OBSERVED_AT,
    frame: picture,
  };
}

function send(response: ServerResponse, body: object, status = 200): void {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

interface RequestLog {
  method: string | undefined;
  path: string | undefined;
  headers: IncomingMessage['headers'];
  body: unknown;
}

async function engine(answer: (request: RequestLog, response: ServerResponse) => void) {
  const seen: RequestLog[] = [];
  const server = track(
    createServer((request, response) => {
      request.setEncoding('utf8');
      let body = '';
      request.on('data', (chunk: string) => {
        body += chunk;
      });
      request.on('end', () => {
        const entry = {
          method: request.method,
          path: request.url,
          headers: request.headers,
          body: body === '' ? undefined : (JSON.parse(body) as unknown),
        };
        seen.push(entry);
        answer(entry, response);
      });
    }),
    (server) => new Promise<void>((resolve) => server.close(() => resolve())),
  );
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('Fixture did not listen');
  const origin = `http://127.0.0.1:${address.port}`;
  return { origin, seen, client: new PlayoutSourcePreviews(origin, 'TEST', OWNER) };
}

function value<T>(reply: SourcePreviewReply<T>): T {
  if (!reply.ok) throw new Error(`Unexpected refusal ${reply.status} ${reply.code}`);
  return reply.value;
}

describe('C-023 Playout 2.18.17 source-preview HTTP contract', () => {
  it('reads and closes independent Playlist and D11 subscriptions with the exact original owner', async () => {
    const playlist = session(PLAYLIST, 'playlist-lease', 'playlist-request-0001');
    const media = session(MEDIA, 'media-lease', 'media-request-000001');
    const renewed = { ...playlist, expiresAt: '2026-11-09T21:04:05.901+00:00' };
    const fixture = await engine((request, response) => {
      switch (`${request.method} ${request.path}`) {
        case 'GET ' + BASE:
          send(response, CAPABILITY);
          break;
        case 'POST ' + BASE:
          send(
            response,
            (request.body as { requestId: string }).requestId === playlist.requestId
              ? playlist
              : media,
          );
          break;
        case 'GET ' + playlist.frameUrl:
          send(
            response,
            observation(playlist, {
              ...frame(FRAME_A),
              signal: 'unknown',
              signalReason: 'not-applicable-to-programme-source',
              signalScope: 'programme-image-only',
            }),
          );
          break;
        case 'GET ' + media.frameUrl:
          send(
            response,
            observation(media, {
              ...frame(FRAME_B),
              signalReason: 'selected-file-frame',
              signalScope: 'selected-file-frame',
              requestedPositionMs: 0,
              actualPositionMs: null,
              geometry: { ...geometry, coordinateSpace: 'decoded-visible-raster' },
            }),
          );
          break;
        case 'POST ' + BASE + '/playlist-lease/renew':
        case 'GET ' + BASE + '/playlist-lease':
          send(response, renewed);
          break;
        case 'DELETE ' + BASE + '/playlist-lease?generation=native-core%3A1':
          send(response, { ok: true });
          break;
        default:
          send(response, { error: 'sourcePreview.notFound' }, 404);
      }
    });

    const { client, seen } = fixture;
    expect(value(await client.capabilities())).toEqual(CAPABILITY);
    const [p, m] = await Promise.all([
      client.start(PLAYLIST, playlist.requestId).then(value),
      client.start(MEDIA, media.requestId).then(value),
    ]);
    expect(p).not.toHaveProperty('frameUrl');
    expect(p.subscriptionId).not.toBe(m.subscriptionId);
    expect(p.generation).toBe(m.generation);
    const [pFrame, mFrame] = await Promise.all([
      client.readFrame(p).then(value),
      client.readFrame(m).then(value),
    ]);
    expect(pFrame.frame).toMatchObject({
      jpegBase64: FRAME_A.toString('base64'),
      signal: 'unknown',
      signalScope: 'programme-image-only',
      geometry,
    });
    expect(mFrame.frame).toMatchObject({
      jpegBase64: FRAME_B.toString('base64'),
      requestedPositionMs: 0,
      actualPositionMs: null,
    });
    const ownerChanged = new PlayoutSourcePreviews(fixture.origin, 'TEST', 'different-operator');
    expect(await ownerChanged.stop(p)).toMatchObject({ ok: false, status: 404 });
    expect(await client.readFrame({ ...p })).toMatchObject({ ok: false, status: 404 });
    const next = value(await client.renew(p));
    expect(next.expiresAt).toBe(renewed.expiresAt);
    expect(value(await client.inspect(next))).toEqual(next);
    expect(value(await client.stop(next))).toEqual({ ok: true });
    expect(await client.readFrame(next)).toMatchObject({ ok: false, status: 404 });
    expect(await client.readFrame(p)).toMatchObject({ ok: false, status: 404 });
    expect(value(await client.readFrame(m)).frame.jpegBase64).toBe(FRAME_B.toString('base64'));
    expect(
      seen.filter((request) => request.method === 'POST').map((request) => request.body),
    ).toEqual([
      { source: PLAYLIST, requestId: playlist.requestId },
      { source: MEDIA, requestId: media.requestId },
      { generation: GENERATION },
    ]);
    expect(seen.filter((request) => request.method === 'DELETE')).toHaveLength(1);
    expect(seen.every((request) => request.headers.authorization === 'Bearer ' + OWNER)).toBe(true);
    expect(seen.every((request) => request.headers.origin === undefined)).toBe(true);
  });

  it('keeps snapshots silent and independent, pairs by source, and reports per-source failures', async () => {
    const fixture = await engine((_request, response) => {
      send(response, {
        observedAt: OBSERVED_AT,
        items: [
          {
            source: canonicalSource(INPUT_B),
            status: 200,
            sourceRevision: 'b-revision',
            frame: { ...frame(FRAME_B), signal: 'absent', signalReason: 'decoded-video-timeout' },
          },
          { source: canonicalSource(MEDIA), status: 503, error: 'sourcePreview.unavailable' },
          {
            source: canonicalSource(INPUT_A),
            status: 200,
            sourceRevision: 'a-revision',
            frame: frame(FRAME_A),
          },
        ],
      });
    });
    const { client, seen } = fixture;
    const result = value(await client.snapshots([INPUT_A, INPUT_B, MEDIA]));
    expect(result.items.map((item) => item.status)).toEqual([200, 200, 503]);
    expect(result.items[0]?.frame).toMatchObject({
      jpegBase64: FRAME_A.toString('base64'),
      signal: 'present',
    });
    expect(result.items[1]?.frame).toMatchObject({
      jpegBase64: FRAME_B.toString('base64'),
      signal: 'absent',
    });
    expect(result.items[2]?.frame).toBeUndefined();
    expect(await client.snapshots(Array<SourcePreviewSelector>(9).fill(INPUT_A))).toMatchObject({
      ok: false,
      status: 400,
    });
    expect(await client.start({ kind: 'media' }, 'no-media-id-0000001')).toMatchObject({
      ok: false,
      status: 400,
    });
    expect(
      await client.start(
        { ...PLAYLIST, playlistOf: { ...PLAYLIST.playlistOf, casparHost: 'http://foreign.test' } },
        'raw-host-url-000001',
      ),
    ).toMatchObject({ ok: false, status: 400 });
    expect(seen).toMatchObject([
      { method: 'POST', path: BASE + '/snapshots', body: { sources: [INPUT_A, INPUT_B, MEDIA] } },
    ]);
  });

  it('rejects replies with a different generation, source, revision or frame geometry', async () => {
    const held = session(INPUT_A, 'input-lease', 'first-input-request-1');
    const valid = observation(held, frame(FRAME_A));
    const invalid = [
      { ...valid, generation: 'native-core:2' },
      { ...valid, source: INPUT_B },
      { ...valid, sourceRevision: 'redefined-input' },
      { ...valid, frame: { ...frame(FRAME_A), jpegBase64: 'bm90IGFjdHVhbGx5IEpQRUc=' } },
      { ...valid, frame: { ...frame(FRAME_A), geometry: { ...geometry, deliveredWidth: 65 } } },
      {
        ...valid,
        frame: {
          ...frame(FRAME_A),
          geometry: { ...geometry, activeRect: { x: 20, y: 0, width: 64, height: 36 } },
        },
      },
    ];
    const fixture = await engine((request, response) => {
      send(response, request.method === 'POST' ? held : (invalid.shift() ?? valid));
    });
    const { client } = fixture;
    const handle = value(await client.start(INPUT_A, held.requestId));
    for (let index = 0; index < 6; index++) {
      expect(await client.readFrame(handle)).toEqual({
        ok: false,
        status: 502,
        code: 'sourcePreview.invalidResponse',
      });
    }
    expect(value(await client.readFrame(handle)).frame.geometry).toEqual(geometry);
  });

  it('rejects a cross-origin frame URL, an opening capability and an oversized chunked reply', async () => {
    const held = session(INPUT_A, 'input-lease', 'first-input-request-1');
    const fixture = await engine((request, response) => {
      if (request.method === 'GET') {
        send(response, { ...CAPABILITY, opensReceivers: true });
      } else if (request.path === BASE + '/snapshots') {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.write(' '.repeat(100_000));
        response.end(' '.repeat(100_000) + '{}');
      } else {
        send(response, { ...held, frameUrl: 'http://outside.invalid/foreign/frame' });
      }
    });
    const refusal = { ok: false, status: 502, code: 'sourcePreview.invalidResponse' };
    expect(await fixture.client.capabilities()).toEqual(refusal);
    expect(await fixture.client.start(INPUT_A, held.requestId)).toEqual(refusal);
    expect(await fixture.client.snapshots([INPUT_A])).toEqual(refusal);
    expect(fixture.seen).toHaveLength(3);
  });

  it('preserves rate-limit and retired endpoint statuses without following redirects', async () => {
    const fixture = await engine((request, response) => {
      if (request.path === BASE) {
        response.writeHead(302, { Location: '/must-not-be-called' });
        response.end();
      } else {
        response.setHeader('Retry-After', '2');
        send(response, { error: 'sourcePreview.rateLimited', message: 'private detail' }, 429);
      }
    });
    expect(await fixture.client.capabilities()).toMatchObject({ ok: false, status: 302 });
    expect(await fixture.client.snapshots([INPUT_A])).toEqual({
      ok: false,
      status: 429,
      code: 'sourcePreview.rateLimited',
      retryAfterMs: 2000,
    });
    expect(fixture.seen.map((request) => request.path)).toEqual([BASE, BASE + '/snapshots']);
  });
});
