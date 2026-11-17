import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as dgram from 'node:dgram';
import { createMock } from '@cg/amcp-mock';
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  SourcePreviewPvwChannel,
  SourcePreviewThumbnailsChannel,
  SourcesMediaSearchChannel,
  inputSourceId,
  mediaSourceId,
  type ChannelResponse,
  type LivePreviewStatus,
} from '@cg/shared-ipc';
import { describe, expect, it } from 'vitest';
import type { SourcePreviewSelector } from '../src/playout-source-previews.js';
import { openClient, type Client } from './support/auth-harness.js';
import { FakeLivePreview } from './support/fake-live-preview.js';
import {
  FAKE_MEDIA_IDS,
  FAKE_INPUTS,
  FAKE_CATALOGUE,
  FAKE_PLAYOUT_PASSWORD,
  startFakePlayout,
} from './support/fake-playout.js';
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
  readonly base: string;
  constructor(private readonly code = 'fake-programme') {
    this.base = `/api/v1/channels/${code}/source-previews`;
  }
  readonly requests: { method: string | undefined; path: string; owner: string }[] = [];
  readonly starts: Lease[] = [];
  readonly stops: { id: string; owner: string; generation: string }[] = [];
  readonly snapshots: SourcePreviewSelector[][] = [];
  readonly leases = new Map<string, Lease>();
  liveAbsent = false;
  liveMalformed = false;
  liveGeometry: 'unmeasured' | 'measured' | 'inconsistent' = 'unmeasured';
  liveProducerGeneration = 'live-native-generation';
  liveSample = 0;

  readonly handle = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const url = new URL(request.url ?? '/', 'http://fake-playout.invalid');
    const owner = request.headers.authorization ?? '';
    const { pathname: path, searchParams } = url;
    this.requests.push({ method: request.method, path, owner });
    if (path === this.base && request.method === 'GET') {
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
    if (path === this.base && request.method === 'POST') {
      const input = await bodyOf<Pick<Lease, 'source' | 'requestId'>>(request);
      const lease = { id: `sub-${this.starts.length + 1}`, owner, ...input };
      this.leases.set(lease.id, lease);
      this.starts.push(lease);
      send(response, 200, {
        ...this.#identity(lease),
        coreGeneration: 1,
        channelCode: this.code,
        requestId: lease.requestId,
        expiresAt: new Date(Date.now() + 90_000).toISOString(),
        renewAfterSeconds: 30,
        frameUrl: `${this.base}/${lease.id}/frame`,
        receiverOpened: false,
        audioSubscribed: false,
      });
      return;
    }
    if (path === this.base + '/snapshots' && request.method === 'POST') {
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
    const [id, action] = path.slice(this.base.length + 1).split('/');
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
    const measured = isLive && this.liveGeometry !== 'unmeasured';
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
      producerGeneration: isLive ? this.liveProducerGeneration : source.kind + '-native-generation',
      ...(isLive && { sampleSequence: ++this.liveSample }),
      frameAgeMs: absent ? 4000 : 0,
      capturedAtUtc: new Date().toISOString(),
      // The native feed can retain a previous JPEG after it reports absent.
      jpegBase64: (isLive ? FRAME_A : FRAME_B).toString('base64'),
      mimeType: 'image/jpeg',
      geometry: {
        sourceWidth: measured ? 100 : 64,
        sourceHeight: measured ? 64 : 36,
        sourceSar: measured ? { numerator: 4, denominator: 3 } : { numerator: 1, denominator: 1 },
        ...(measured && { sourceRotationDegrees: 0, appliedRotationDegrees: 0 }),
        visibleSourceRect: measured ? { x: 12, y: 4, width: 72, height: 54 } : raster,
        deliveredWidth: isLive && this.liveMalformed ? 65 : 64,
        deliveredHeight: 36,
        activeRect: measured ? { x: 8, y: 4, width: 48, height: 27 } : raster,
        coversFullVisibleSource: true,
        geometryRevision: 'native-geometry-v1',
        sourceToDelivered: measured
          ? {
              scaleX: 2 / 3,
              scaleY: 1 / 2,
              translateX: this.liveGeometry === 'inconsistent' ? 2 : 0,
              translateY: 2,
            }
          : { scaleX: 1, scaleY: 1, translateX: 0, translateY: 0 },
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
  it.each(['A', 'B'] as const)(
    'reads a B-only input with independent snapshot, PVW, audio and listen provenance while %s is active',
    async (active) => {
      const passiveA = new FakeSourcePreviews();
      const passiveB = new FakeSourcePreviews('reserve-local');
      const liveB = new FakeLivePreview();
      const meterSources: SourcePreviewSelector[][] = [];
      const a = track(
        await startFakePlayout({ verifyBearers: true, sourcePreviews: passiveA.handle }),
        (p) => p.stop(),
      );
      a.setChannels(FAKE_CATALOGUE.map((row) => ({ ...row, videoMode: '1080i5000' })));
      a.setInputs(
        FAKE_INPUTS.map((input) =>
          input.id === 'li-studio1' ? { ...input, available: false } : input,
        ),
      );
      const b = track(
        await startFakePlayout({
          verifyBearers: true,
          sourcePreviews: passiveB.handle,
          livePreview: liveB.handle,
          sourceAudio: async (req, res) => {
            const { sources } = await bodyOf<{ sources: SourcePreviewSelector[] }>(req);
            meterSources.push(sources);
            send(res, 200, {
              engineId: 'independent-b',
              channelCode: 'reserve-local',
              items: sources.map((source) => ({
                source,
                status: 200,
                reading: {
                  audio: { status: 'has-audio', channels: 2 },
                  signal: 'present',
                  peakDbfs: [-14, -18],
                  sampledAt: new Date().toISOString(),
                  sampleAgeMs: 0,
                  validForMs: 500,
                  stage: 'decoded-source-before-filters-and-mixer',
                },
              })),
            });
          },
        }),
        (p) => p.stop(),
      );
      b.setChannels([
        {
          id: 'reserve-local',
          name: 'Reserve',
          casparHost: '127.0.0.1',
          casparChannel: 2,
          videoMode: '1080i5000',
          mirrorOf: { playout: a.baseUrl, id: 'fake-programme' },
        },
      ]);
      b.setInputs([
        {
          id: 'li-replica-studio-b',
          name: 'Studio reserve',
          casparHost: '127.0.0.1',
          producer: { kind: 'ndi', source: 'B CAMERA' },
          available: true,
          logicalMappings: [{ channelCode: 'reserve-local', logicalInputId: 'li-studio1' }],
        },
        {
          id: 'li-replica-multicast-b',
          name: 'Shared camera',
          casparHost: '127.0.0.1',
          producer: { kind: 'stream', url: 'udp://239.0.0.1:5555' },
          available: true,
          logicalMappings: [{ channelCode: 'reserve-local', logicalInputId: 'li-multicast' }],
        },
      ]);
      const directory = track(fs.mkdtempSync(path.join(os.tmpdir(), 'cg-read-source-b-')), (p) =>
        fs.rmSync(p, { recursive: true, force: true }),
      );
      const udp = dgram.createSocket('udp4');
      await new Promise<void>((resolve) => udp.bind(0, '127.0.0.1', resolve));
      const oscPort = udp.address().port;
      await new Promise<void>((resolve) => udp.close(resolve));
      const coreB = track(
        await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 40, channels: 2 }),
        (core) => core.stop(),
      );
      const rig = await twoChannelRig({
        bridge: {
          playout: { auth: 'playout', address: a.baseUrl, issuer: a.issuer },
          backupPlayoutAddress: b.baseUrl,
          bridgeSessionPath: path.join(directory, 'session.json'),
          pgmReturn: {
            readTopology: async () => ({
              members: [
                {
                  key: a.baseUrl,
                  name: 'A',
                  channelCode: 'fake-programme',
                  physicalChannel: 1,
                  pgmHost: '127.0.0.1',
                },
                {
                  key: b.baseUrl,
                  name: 'B',
                  channelCode: 'reserve-local',
                  physicalChannel: 2,
                  pgmHost: '127.0.0.1',
                },
              ],
              activeMemberKey: active === 'A' ? a.baseUrl : b.baseUrl,
            }),
          },
        },
      });
      await rig.handle.runtime.setConfig({
        ...rig.connection,
        servers: {
          ...rig.connection.servers,
          B: { host: '127.0.0.1', amcpPort: coreB.amcpPort, oscPort },
        },
      });
      const client = await openClient(rig.handle);
      const primaryToken = (await a.issueToken({ user: 'admin' })).token;
      expect((await client.authenticate(randomUUID(), primaryToken)).error).toBeUndefined();
      expect(
        (
          await client.ask(randomUUID(), 'bridgeSession.backup.sign-in', {
            username: 'cg-admin',
            password: FAKE_PLAYOUT_PASSWORD,
          })
        ).payload,
      ).toEqual({ ok: true });
      const sourceId = inputSourceId('li-studio1');
      await waitUntil(async () => {
        const presence = await ask<{ sources: Record<string, { A: string; B: string }> }>(
          client,
          'playout.sourcePresence',
          { channel: 1, sourceIds: [sourceId] },
        );
        return (
          presence.sources[sourceId]?.A === 'missing' && presence.sources[sourceId]?.B === 'present'
        );
      }, 'A missing and independently mapped B present');
      const before = (await rig.lines()).length;
      expect((await thumbnails(client, [sourceId])).frames).toMatchObject([
        { sourceId, engine: 'B', signal: 'present', jpegBase64: FRAME_A.toString('base64') },
      ]);
      const viewId = randomUUID();
      expect((await pvw(client, viewId, [sourceId])).frames).toMatchObject([
        { sourceId, engine: 'B', signal: 'present' },
      ]);
      expect(passiveA.snapshots).toEqual([]);
      expect(passiveA.starts).toEqual([]);
      expect(passiveB.snapshots).toEqual([[{ kind: 'live', inputId: 'li-replica-studio-b' }]]);
      expect(passiveB.starts[0]?.source).toEqual({ kind: 'live', inputId: 'li-replica-studio-b' });
      const audio = await ask<{ readings: { sourceId: string; engine: string; dbFs: number[] }[] }>(
        client,
        'sourcePreviews.audioLevels',
        { channel: 1, sourceIds: [sourceId] },
      );
      expect(audio.readings).toMatchObject([{ sourceId, engine: 'B', dbFs: [-14, -18] }]);
      expect(meterSources).toEqual([[{ kind: 'live', inputId: 'li-replica-studio-b' }]]);
      const mixed = await pvw(client, viewId, [sourceId, LIVE]);
      expect(mixed.frames.find((frame) => frame.sourceId === sourceId)?.engine).toBe('B');
      expect(mixed.frames.find((frame) => frame.sourceId === LIVE)?.engine).toBe(active);
      expect(
        active === 'B' ? passiveB.starts.at(-1)?.source : passiveA.starts.at(-1)?.source,
      ).toEqual({
        kind: 'live',
        inputId: active === 'B' ? 'li-replica-multicast-b' : 'li-multicast',
      });
      const check = { channel: 1, previewId: randomUUID() };
      await ask(client, 'livePreview.start', { ...check, sourceId });
      await waitUntil(
        async () =>
          (await ask<LivePreviewStatus>(client, 'livePreview.status', check)).state === 'ready',
        'B-owned listen lease',
      );
      expect(await ask<LivePreviewStatus>(client, 'livePreview.status', check)).toMatchObject({
        engine: 'B',
        state: 'ready',
      });
      expect(liveB.starts[0]).toMatchObject({
        channelCode: 'reserve-local',
        body: { inputId: 'li-replica-studio-b' },
      });
      expect(
        passiveB.requests.every(
          (request) =>
            request.owner.startsWith('Bearer ') && request.owner !== `Bearer ${primaryToken}`,
        ),
      ).toBe(true);
      a.removeInput('li-studio1');
      await rig.handle.playoutSources?.refresh(0);
      expect(
        rig.handle.runtime.sourceCatalog().sources.find((source) => source.id === sourceId)
          ?.departed,
      ).toBe(true);
      expect((await pvw(client, viewId, [sourceId])).frames).toMatchObject([
        { sourceId, engine: 'B' },
      ]);
      expect(await ask<LivePreviewStatus>(client, 'livePreview.status', check)).toMatchObject({
        engine: 'B',
        state: 'ready',
      });
      if (active === 'B') {
        await a.goOffline();
        expect((await pvw(client, viewId, [sourceId])).frames).toMatchObject([
          { sourceId, engine: 'B' },
        ]);
      }
      await ask(client, 'livePreview.stop', check);
      await pvw(client, viewId, []);
      expect(passiveB.leases.size).toBe(0);
      expect(
        (await rig.lines())
          .slice(before)
          .filter((line) => /^(?:CG|PLAY|STOP|CLEAR|MIXER|LOAD|LOADBG)\b/i.test(line)),
      ).toEqual([]);
    },
    20_000,
  );

  it('keeps a clean Playlist thumbnail while an independent NDI check owns its preview', async () => {
    const passive = new FakeSourcePreviews();
    const active = new FakeLivePreview();
    const playout = track(
      await startFakePlayout({ sourcePreviews: passive.handle, livePreview: active.handle }),
      (p) => p.stop(),
    );
    const rig = await twoChannelRig({
      bridge: { playout: { auth: 'playout', address: playout.baseUrl, issuer: playout.issuer } },
    });
    const console = await openClient(rig.handle);
    const token = (await playout.issueToken({ user: 'operator' })).token;
    expect((await console.authenticate(randomUUID(), token)).error).toBeUndefined();
    await waitUntil(
      () =>
        rig.handle.runtime.sourceCatalog().sources.some((entry) => entry.id === PLAYLIST) &&
        playout.channelsBearers.length > 0,
      'D4 channel and D10 Playlist identities',
    );
    const sourceId = inputSourceId('li-studio1');
    const check = { channel: 1, previewId: randomUUID() };
    const before = (await rig.lines()).length;
    await ask<LivePreviewStatus>(console, 'livePreview.start', { ...check, sourceId });
    await waitUntil(
      async () =>
        (await ask<LivePreviewStatus>(console, 'livePreview.status', check)).state === 'ready',
      'the independent NDI check',
    );
    passive.liveMalformed = true;
    expect(await thumbnails(console, [sourceId, PLAYLIST])).toEqual({
      frames: [
        {
          sourceId: PLAYLIST,
          engine: 'A',
          signal: 'unknown',
          jpegBase64: FRAME_B.toString('base64'),
          width: 64,
          height: 36,
        },
      ],
    });
    expect(active.starts).toHaveLength(1);
    expect(active.leases.size).toBe(1);
    expect(passive.starts).toEqual([]);
    await ask(console, 'livePreview.stop', check);
    expect(
      (await rig.lines())
        .slice(before)
        .filter((line) => /^(?:CG|PLAY|STOP|CLEAR|MIXER|LOAD|LOADBG)\b/i.test(line)),
    ).toEqual([]);
  });

  it('seeks an authorized D11 search result without a lease, media binding or AMCP write', async () => {
    const preview = new FakeSourcePreviews();
    const playout = track(await startFakePlayout({ sourcePreviews: preview.handle }), (p) =>
      p.stop(),
    );
    const rig = await twoChannelRig({
      bridge: { playout: { auth: 'playout', address: playout.baseUrl, issuer: playout.issuer } },
    });
    const before = (await rig.lines()).length;
    const client = await openClient(rig.handle);
    const id = mediaSourceId(FAKE_MEDIA_IDS.studio1);
    const request = (sourceId: string, atMs: number, channel = 1) => ({
      channel,
      sourceIds: [],
      mediaPosition: { sourceId, atMs },
    });
    const askFrame = (sourceId: string, atMs: number) =>
      ask<ChannelResponse<typeof SourcePreviewThumbnailsChannel>>(
        client,
        SourcePreviewThumbnailsChannel.name,
        request(sourceId, atMs),
      );
    const target = request(id, 3_250);
    expect(
      (await client.ask(randomUUID(), SourcePreviewThumbnailsChannel.name, target)).error,
    ).toEqual(expect.any(String));
    const token = (await playout.issueToken({ user: 'operator' })).token;
    expect((await client.authenticate(randomUUID(), token)).error).toBeUndefined();
    await waitUntil(() => playout.channelsBearers.length > 0, 'D4 channel identity');
    expect(await askFrame(id, 3_250)).toEqual({ frames: [] });
    expect(
      await ask<ChannelResponse<typeof SourcesMediaSearchChannel>>(
        client,
        SourcesMediaSearchChannel.name,
        { q: 'Studio 1' },
      ),
    ).toMatchObject({ ok: true, items: expect.arrayContaining([expect.objectContaining({ id })]) });
    expect(
      (await client.ask(randomUUID(), SourcePreviewThumbnailsChannel.name, request(id, 3_250, 2)))
        .error,
    ).toEqual(expect.any(String));
    expect(await askFrame(LIVE, 3_250)).toEqual({ frames: [] });
    expect(await askFrame(id, 30_000)).toEqual({ frames: [] });
    expect(preview.snapshots).toEqual([]);
    expect(
      await ask<ChannelResponse<typeof SourcePreviewThumbnailsChannel>>(
        client,
        SourcePreviewThumbnailsChannel.name,
        { ...target, sourceIds: [id] },
      ),
    ).toEqual({
      frames: [
        {
          sourceId: id,
          engine: 'A',
          signal: 'unknown',
          jpegBase64: FRAME_B.toString('base64'),
          width: 64,
          height: 36,
        },
      ],
      mediaFrame: {
        sourceId: id,
        engine: 'A',
        previewPositionMs: 3_250,
        signal: 'unknown',
        jpegBase64: FRAME_B.toString('base64'),
        width: 64,
        height: 36,
      },
    });
    expect(preview.snapshots).toEqual([
      [
        { kind: 'media', mediaId: FAKE_MEDIA_IDS.studio1 },
        { kind: 'media', mediaId: FAKE_MEDIA_IDS.studio1, atMs: 3_250 },
      ],
    ]);
    expect(preview.starts).toEqual([]);
    expect(rig.handle.runtime.sourceCatalog().sources.some((entry) => entry.id === id)).toBe(false);
    expect(
      (await rig.lines())
        .slice(before)
        .filter((line) => /^(?:CG|PLAY|STOP|CLEAR|MIXER|LOAD|LOADBG)\b/i.test(line)),
    ).toEqual([]);
  });

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
      engine: 'A',
      signal: 'present',
      jpegBase64: FRAME_A.toString('base64'),
      width: 64,
      height: 36,
    };
    const playlistFrame = {
      sourceId: PLAYLIST,
      engine: 'A',
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

    const livePicture = async () =>
      (await pvw(first, firstView, [LIVE, PLAYLIST])).frames.find(
        (picture) => picture.sourceId === LIVE,
      );
    preview.liveGeometry = 'measured';
    await waitUntil(
      async () => (await livePicture())?.geometry !== undefined,
      'measured live geometry',
    );
    const measured = (await livePicture())?.geometry;
    expect(measured).toEqual({
      activeRect: { x: 8 / 64, y: 4 / 36, width: 48 / 64, height: 27 / 36 },
      sourceAspect: 16 / 9,
      revision: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    const firstSample = preview.liveSample;
    await waitUntil(async () => {
      await livePicture();
      return preview.liveSample > firstSample;
    }, 'a successive decoded sample');
    expect((await livePicture())?.geometry?.revision).toBe(measured?.revision);
    preview.liveProducerGeneration = 'restarted-live-decoder';
    await waitUntil(async () => {
      const revision = (await livePicture())?.geometry?.revision;
      return revision !== undefined && revision !== measured?.revision;
    }, 'the new decoder geometry revision');
    preview.liveGeometry = 'inconsistent';
    await waitUntil(async () => {
      const picture = await livePicture();
      return picture?.jpegBase64 === liveFrame.jpegBase64 && picture.geometry === undefined;
    }, 'omit incompatible mapping while retaining the JPEG');

    preview.liveAbsent = true;
    await waitUntil(async () => {
      const result = await pvw(first, firstView, [LIVE, PLAYLIST]);
      return result.frames.some(
        (picture) => picture.sourceId === LIVE && picture.signal === 'absent',
      );
    }, 'the next decoded signal observation');
    expect(await pvw(first, firstView, [LIVE, PLAYLIST])).toEqual({
      frames: [{ sourceId: LIVE, signal: 'absent', engine: 'A' }, playlistFrame],
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
