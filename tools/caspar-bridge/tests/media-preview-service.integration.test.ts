import http from 'node:http';
import { randomUUID } from 'node:crypto';
import * as dgram from 'node:dgram';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterEach, expect, it } from 'vitest';
import { createMock } from '@cg/amcp-mock';
import { mediaSourceId, type BackupChannelsState, type MediaPlaybackPreview } from '@cg/shared-ipc';
import { AuthSession } from '../src/auth-session.js';
import { HttpTickets } from '../src/http-tickets.js';
import {
  MediaPreviewService,
  mediaPreviewEngine,
  type MediaPreviewTarget,
} from '../src/media-preview-service.js';
import { playoutFetch } from '../src/playout-http.js';
import { openClient } from './support/auth-harness.js';
import {
  FAKE_MEDIA_IDS,
  FAKE_CATALOGUE,
  FAKE_PLAYOUT_PASSWORD,
  fakeFingerprint,
  startFakePlayout,
} from './support/fake-playout.js';
import { track } from './support/harness.js';
import { twoChannelRig, waitUntil } from './support/two-channel-rig.js';
import { FRAME_B } from './support/fake-pgm-feed.js';

const FINGERPRINT = 'a'.repeat(64);
const BYTES = Buffer.from(Array.from({ length: 65_536 }, (_, index) => index % 251));
const cleanups: (() => Promise<void>)[] = [];

afterEach(async () => {
  for (const close of cleanups.splice(0).reverse()) await close();
});

async function listen(server: http.Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  cleanups.push(
    () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  );
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

async function fixture(
  options: { consolePeer?: string; playoutHost?: string; httpPeer?: string } = {},
) {
  let mode: 'direct' | 'proxy' = 'direct';
  let proxyState = 'notPrepared';
  let proxyError: string | undefined;
  let manifestRetryAt: string | null | undefined;
  let supported = true;
  let malicious = false;
  let slow = false;
  let streams = 0;
  let preparations = 0;
  let preparationStatus = 202;
  let preparationError: string | undefined;
  let retryAfter: string | undefined;
  let losePreparationResponse = false;
  let preparationGate: Promise<void> | null = null;
  let targetGate: Promise<void> | null = null;
  let targetOnce = false;
  let targetWaits = 0;
  let manifestFails = false;
  let allowed = true;
  let now = Date.now();
  const authorizations: (string | undefined)[] = [];
  const root = '/api/v1/channels/local-b/media-previews/replica-b';
  const engine = http.createServer((req, res) => {
    authorizations.push(req.headers.authorization);
    if (req.headers.authorization !== 'Bearer independent-b') {
      res.writeHead(401).end();
      return;
    }
    const url = new URL(req.url ?? '/', 'http://engine');
    if (!supported) {
      res.writeHead(404).end();
      return;
    }
    if (url.pathname === root) {
      if (manifestFails) {
        res.destroy();
        return;
      }
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({
          mediaId: 'replica-b',
          fingerprint: FINGERPRINT,
          durationMs: 10_000,
          browserMode: mode,
          proxy: { state: proxyState, error: proxyError, retryAt: manifestRetryAt },
          fileUrl: malicious
            ? 'http://elsewhere.invalid/private'
            : `${root}/file?revision=${FINGERPRINT}`,
          proxyUrl: `${root}/proxy?revision=${FINGERPRINT}`,
          prepareUrl: `${root}/proxy`,
          posterUrl: `${root}/poster`,
        }),
      );
      return;
    }
    if (req.method === 'POST' && url.pathname === `${root}/proxy`) {
      preparations++;
      const respond = () => {
        if (preparationStatus === 202) proxyState = 'ready';
        if (losePreparationResponse) {
          res.destroy();
          return;
        }
        if (retryAfter !== undefined) res.setHeader('retry-after', retryAfter);
        res
          .writeHead(preparationStatus, { 'content-type': 'application/json' })
          .end(JSON.stringify({ error: preparationError }));
      };
      if (preparationGate === null) respond();
      else void preparationGate.then(respond);
      return;
    }
    if (url.pathname === `${root}/poster`) {
      res.writeHead(200, { 'content-type': 'image/jpeg' }).end(Buffer.from([255, 216, 255, 217]));
      return;
    }
    if (url.searchParams.get('revision') !== FINGERPRINT) {
      res.writeHead(409).end();
      return;
    }
    res.setHeader('content-type', 'video/mp4');
    res.setHeader('accept-ranges', 'bytes');
    res.setHeader('etag', '"verified-bytes"');
    if (slow) {
      streams++;
      res.writeHead(200);
      const timer = setInterval(() => res.write(BYTES.subarray(0, 1024)), 10);
      res.once('close', () => {
        clearInterval(timer);
        streams--;
      });
      return;
    }
    let start = 0;
    let end = BYTES.length - 1;
    const range = req.headers.range;
    if (range !== undefined && req.headers['if-range'] !== '"changed"') {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (match === null) {
        res.writeHead(416, { 'content-range': `bytes */${BYTES.length}` }).end();
        return;
      }
      start = match[1] === '' ? BYTES.length - Number(match[2]) : Number(match[1]);
      end = match[1] === '' || match[2] === '' ? end : Number(match[2]);
      if (start < 0 || start >= BYTES.length || end < start) {
        res.writeHead(416, { 'content-range': `bytes */${BYTES.length}` }).end();
        return;
      }
      end = Math.min(end, BYTES.length - 1);
      res.statusCode = 206;
      res.setHeader('content-range', `bytes ${start}-${end}/${BYTES.length}`);
    }
    res.setHeader('content-length', end - start + 1);
    res.end(req.method === 'HEAD' ? undefined : BYTES.subarray(start, end + 1));
  });
  const origin = await listen(engine);
  const targetUrl = new URL(origin);
  if (options.playoutHost !== undefined) targetUrl.hostname = options.playoutHost;
  const tickets = new HttpTickets(() => now);
  const target: MediaPreviewTarget = {
    origin: targetUrl.origin,
    code: 'local-b',
    mediaId: 'replica-b',
    fingerprint: FINGERPRINT,
    bearer: 'independent-b',
    engine: 'B',
    host: '192.0.2.43',
  };
  const owner = new AuthSession(options.consolePeer);
  const service = new MediaPreviewService({
    tickets,
    now: () => now,
    fetch: (url, request) => {
      const { pathname, search } = new URL(url);
      return playoutFetch(new URL(pathname + search, origin), request);
    },
    targetFor: async (_owner, channel, sourceId) => {
      if (targetGate !== null) {
        targetWaits++;
        const pending = targetGate;
        if (targetOnce) targetGate = null;
        await pending;
      }
      return allowed && channel === 1 && ['md-primary-a', 'md-next'].includes(sourceId)
        ? { ...target }
        : null;
    },
  });
  cleanups.push(async () => service.dispose());
  const relay = http.createServer((req, res) => {
    if (options.httpPeer !== undefined) {
      Object.defineProperty(req.socket, 'remoteAddress', { value: options.httpPeer });
    }
    const url = new URL(req.url ?? '/', 'http://relay');
    const match = /^\/media-preview\/([\w-]+)\/(file|proxy|poster)$/.exec(url.pathname);
    const grant = tickets.redeem(
      url.searchParams.get('ticket'),
      (held) =>
        held.kind === 'media-preview' &&
        held.previewId === match?.[1] &&
        held.resource === match[2],
    );
    if (grant?.kind !== 'media-preview') {
      res.writeHead(403).end();
      return;
    }
    void service.serve(req, res, grant).catch(() => res.destroy());
  });
  const relayOrigin = await listen(relay);
  return {
    service,
    owner,
    tickets,
    target,
    authorizations,
    url: (relative: string | undefined) => new URL(relative ?? '/', relayOrigin),
    setMode: () => {
      mode = 'proxy';
    },
    resetProxy: () => {
      proxyState = 'notPrepared';
    },
    readyProxy: () => {
      proxyState = 'ready';
    },
    setProxyState: (
      state: 'queued' | 'preparing' | 'retry' | 'notRequired',
      { error, retryMs }: { error?: string; retryMs?: number } = {},
    ) => {
      proxyState = state;
      proxyError = error;
      manifestRetryAt =
        retryMs === undefined
          ? null
          : new Date(now + retryMs).toISOString().replace(/Z$/, '+00:00');
    },
    failProxy: (error?: string) => {
      proxyState = 'error';
      proxyError = error;
    },
    setPreparationStatus: (status: number, retryAfterHeader?: string, error?: string) => {
      preparationStatus = status;
      retryAfter = retryAfterHeader;
      preparationError = error;
    },
    losePreparationResponse: () => {
      losePreparationResponse = true;
    },
    delayPrepare: () => {
      let release: () => void = () => undefined;
      preparationGate = new Promise<void>((resolve) => {
        release = resolve;
      });
      return release;
    },
    delayTarget: (once = false) => {
      let release: () => void = () => undefined;
      targetOnce = once;
      targetGate = new Promise<void>((resolve) => {
        release = resolve;
      });
      return release;
    },
    targetWaits: () => targetWaits,
    failManifest: () => {
      manifestFails = true;
    },
    setUnsupported: () => {
      supported = false;
    },
    setMalicious: () => {
      malicious = true;
    },
    setSlow: () => {
      slow = true;
    },
    revokeAccess: () => {
      allowed = false;
    },
    restoreAccess: () => {
      allowed = true;
    },
    advance: (ms: number) => {
      now += ms;
    },
    streams: () => streams,
    preparations: () => preparations,
    open: (
      previewId?: string,
      prepare = true,
      tryLocalOriginal?: boolean,
      tryNetworkOriginal?: boolean,
    ) =>
      service.open(owner, {
        channel: 1,
        sourceId: 'md-primary-a',
        prepare,
        ...(previewId === undefined ? {} : { previewId }),
        ...(tryLocalOriginal === undefined ? {} : { tryLocalOriginal }),
        ...(tryNetworkOriginal === undefined ? {} : { tryNetworkOriginal }),
      }),
  };
}

it('relays engine-local verified bytes with Range, suffix Range, HEAD and If-Range', async () => {
  const f = await fixture();
  const opened = await f.open();
  expect(opened).toMatchObject({
    state: 'ready',
    engine: 'B',
    host: '192.0.2.43',
    durationMs: 10_000,
  });
  expect(opened.videoUrl).not.toContain('independent-b');
  const partial = await fetch(f.url(opened.videoUrl), { headers: { range: 'bytes=10-19' } });
  expect(partial.status).toBe(206);
  expect(partial.headers.get('content-range')).toBe(`bytes 10-19/${BYTES.length}`);
  expect(partial.headers.get('content-type')).toBe('video/mp4');
  expect(Buffer.from(await partial.arrayBuffer())).toEqual(BYTES.subarray(10, 20));
  const suffix = await fetch(f.url(opened.videoUrl), { headers: { range: 'bytes=-5' } });
  expect(suffix.status).toBe(206);
  expect(Buffer.from(await suffix.arrayBuffer())).toEqual(BYTES.subarray(-5));
  const head = await fetch(f.url(opened.videoUrl), { method: 'HEAD' });
  expect(head.headers.get('content-length')).toBe(String(BYTES.length));
  expect(await head.text()).toBe('');
  const invalid = await fetch(f.url(opened.videoUrl), { headers: { range: 'bytes=999999-' } });
  expect(invalid.status).toBe(416);
  expect(invalid.headers.get('content-range')).toBe(`bytes */${BYTES.length}`);
  const changed = await fetch(f.url(opened.videoUrl), {
    headers: { range: 'bytes=10-19', 'if-range': '"changed"' },
  });
  expect(changed.status).toBe(200);
  expect(changed.headers.get('etag')).toBe('"verified-bytes"');
  expect(Buffer.from(await changed.arrayBuffer())).toEqual(BYTES);
  expect(f.authorizations.every((value) => value === 'Bearer independent-b')).toBe(true);
});

it('tries canonical original bytes from verified local sockets with no proxy preparation', async () => {
  const f = await fixture({ consolePeer: '::ffff:127.0.0.1' });
  f.setMode();
  const opened = await f.open(undefined, true, true);
  expect(opened).toMatchObject({ state: 'ready', playbackMode: 'local-original' });
  const response = await fetch(f.url(opened.videoUrl), { headers: { range: 'bytes=2-5' } });
  expect(response.status).toBe(206);
  expect(Buffer.from(await response.arrayBuffer())).toEqual(BYTES.subarray(2, 6));
  expect(f.preparations()).toBe(0);
  const renewed = await f.open(opened.previewId, false, true);
  expect(renewed).toMatchObject({
    state: 'ready',
    playbackMode: 'local-original',
    videoUrl: opened.videoUrl,
  });
});

it.each([
  { consolePeer: '192.0.2.44', playoutHost: undefined },
  { consolePeer: '127.0.0.1', playoutHost: '192.0.2.43' },
  { consolePeer: '127.0.0.1', playoutHost: 'localhost' },
] as const)(
  'preserves proxy behavior without both local literal addresses (%o)',
  async (options) => {
    const f = await fixture({
      consolePeer: options.consolePeer,
      ...(options.playoutHost === undefined ? {} : { playoutHost: options.playoutHost }),
    });
    f.setMode();
    expect(await f.open(undefined, true, true)).toMatchObject({
      state: 'preparing',
      playbackMode: 'proxy',
    });
    expect(f.preparations()).toBe(1);
  },
);

it('rejects a local-original ticket replayed on a nonlocal HTTP socket', async () => {
  const f = await fixture({ consolePeer: '127.0.0.1', httpPeer: '192.0.2.44' });
  f.setMode();
  const opened = await f.open(undefined, true, true);
  expect(opened).toMatchObject({ state: 'ready', playbackMode: 'local-original' });
  const response = await fetch(f.url(opened.videoUrl), {
    headers: { range: 'bytes=2-5', 'x-forwarded-for': '127.0.0.1' },
  });
  expect(response.status).toBe(403);
  expect(f.authorizations).toEqual(['Bearer independent-b']);
});

it('revokes original bytes and open streams when the same lease falls back to proxy', async () => {
  const f = await fixture({ consolePeer: '127.0.0.1' });
  f.setMode();
  const opened = await f.open(undefined, true, true);
  f.setSlow();
  const response = await fetch(f.url(opened.videoUrl));
  expect(response.ok).toBe(true);
  expect(f.streams()).toBe(1);
  const fallback = await f.open(opened.previewId, true, false);
  expect(fallback).toMatchObject({ state: 'preparing', playbackMode: 'proxy' });
  expect(f.preparations()).toBe(1);
  expect((await fetch(f.url(opened.videoUrl))).status).toBe(403);
  await waitUntil(() => f.streams() === 0, 'the downgraded original stream to close');
  const ready = await f.open(opened.previewId, true, true);
  expect(ready).toMatchObject({ state: 'ready', playbackMode: 'proxy' });
  expect(ready.videoUrl).toContain('/proxy?ticket=');
});

it('streams authenticated original bytes to the network console if proxy encoding timed out', async () => {
  const f = await fixture({ consolePeer: '192.0.2.44', httpPeer: '::ffff:192.0.2.44' });
  f.setMode();
  f.failProxy('mediaPreview.preparationTimedOut');
  const opened = await f.open(undefined, true, true, true);
  expect(opened).toMatchObject({ state: 'ready', playbackMode: 'network-original' });
  expect(opened.videoUrl).toContain('/file?ticket=');
  const response = await fetch(f.url(opened.videoUrl), { headers: { range: 'bytes=12-15' } });
  expect(response.status).toBe(206);
  expect(response.headers.get('content-range')).toBe(`bytes 12-15/${BYTES.length}`);
  expect(Buffer.from(await response.arrayBuffer())).toEqual(BYTES.subarray(12, 16));
  expect(f.preparations()).toBe(0);
  expect(f.authorizations).toEqual(['Bearer independent-b', 'Bearer independent-b']);
  f.readyProxy();
  expect(await f.open(opened.previewId, false, true, true)).toMatchObject({
    state: 'ready',
    playbackMode: 'network-original',
    videoUrl: opened.videoUrl,
  });
});

it('uses a previously prepared proxy at acquisition on the network', async () => {
  const f = await fixture({ consolePeer: '192.0.2.44', httpPeer: '192.0.2.44' });
  f.setMode();
  f.readyProxy();
  expect(await f.open(undefined, true, true, true)).toMatchObject({
    state: 'ready',
    playbackMode: 'proxy',
    videoUrl: expect.stringContaining('/proxy?ticket='),
  });
  expect(f.preparations()).toBe(0);
});

it('refuses a network original ticket used from another peer even with a forwarded header', async () => {
  const f = await fixture({ consolePeer: '192.0.2.44', httpPeer: '192.0.2.45' });
  f.setMode();
  const opened = await f.open(undefined, true, true, true);
  expect(opened).toMatchObject({ state: 'ready', playbackMode: 'network-original' });
  const response = await fetch(f.url(opened.videoUrl), {
    headers: { range: 'bytes=0-3', 'x-forwarded-for': '192.0.2.44' },
  });
  expect(response.status).toBe(403);
  expect(f.authorizations).toEqual(['Bearer independent-b']);
});

it('cancels the network original stream and continues the same preview through proxy fallback', async () => {
  const f = await fixture({ consolePeer: '192.0.2.44', httpPeer: '192.0.2.44' });
  f.setMode();
  const opened = await f.open(undefined, true, true, true);
  f.setSlow();
  const response = await fetch(f.url(opened.videoUrl));
  const interrupted = expect(response.arrayBuffer()).rejects.toThrow();
  expect(f.streams()).toBe(1);
  expect(f.preparations()).toBe(0);
  const downgraded = await f.open(opened.previewId, true, false, false);
  expect(downgraded).toMatchObject({
    state: 'preparing',
    previewId: opened.previewId,
    playbackMode: 'proxy',
  });
  await interrupted;
  await waitUntil(() => f.streams() === 0, 'network original stream to close');
  expect(f.preparations()).toBe(1);
  expect((await fetch(f.url(opened.videoUrl))).status).toBe(403);
  expect(await f.open(opened.previewId, true, true, true)).toMatchObject({
    state: 'ready',
    playbackMode: 'proxy',
    videoUrl: expect.stringContaining('/proxy?ticket='),
  });
});

it('prefers verified active topology over stale legacy selection for read previews', () => {
  expect(mediaPreviewEngine('A', 'B')).toBe('A');
  expect(mediaPreviewEngine('B', 'A')).toBe('B');
  expect(mediaPreviewEngine(undefined, 'B')).toBe('B');
  expect(mediaPreviewEngine(null, 'A', false)).toBe('B');
  expect(mediaPreviewEngine('A', 'B', false)).toBe('A');
  expect(mediaPreviewEngine('C', 'A')).toBeNull();
});

it('retains only a verified handoff hint after revoking a stream and all of its grants', async () => {
  const f = await fixture();
  const opened = await f.open();
  f.target.engine = 'A';
  expect((await fetch(f.url(opened.videoUrl))).status).toBe(403);
  expect(f.tickets.size).toBe(0);
  expect(await f.open(opened.previewId)).toEqual({
    state: 'unavailable',
    recovery: 'target-changed',
  });
  const recovered = await f.open();
  expect(recovered).toMatchObject({ state: 'ready', engine: 'A' });
  expect(recovered.previewId).not.toBe(opened.previewId);
  expect(await f.open(opened.previewId)).toEqual({ state: 'unavailable' });
});

it('returns the same explicit handoff hint when renewal observes the changed node first', async () => {
  const f = await fixture();
  const opened = await f.open();
  f.target.engine = 'A';
  expect(await f.open(opened.previewId)).toEqual({
    state: 'unavailable',
    recovery: 'target-changed',
  });
  expect(f.tickets.size).toBe(0);
  expect((await fetch(f.url(opened.posterUrl))).status).toBe(403);
});

it('keeps a recoverable hint when the periodic stream check closes playback before renewal', async () => {
  const f = await fixture();
  f.setSlow();
  const opened = await f.open();
  const response = await fetch(f.url(opened.videoUrl));
  const interrupted = expect(response.arrayBuffer()).rejects.toThrow();
  expect(f.streams()).toBe(1);
  f.target.engine = 'A';
  await interrupted;
  await waitUntil(() => f.streams() === 0, 'handoff stream cancellation');
  expect(await f.open(opened.previewId)).toEqual({
    state: 'unavailable',
    recovery: 'target-changed',
  });
  expect(f.tickets.size).toBe(0);
});

it.each(['different', 'missing'] as const)(
  'never marks a %s fingerprint as a recoverable handoff',
  async (fingerprint) => {
    const f = await fixture();
    const opened = await f.open();
    f.target.engine = 'A';
    if (fingerprint === 'different') f.target.fingerprint = 'b'.repeat(64);
    else delete f.target.fingerprint;
    expect((await fetch(f.url(opened.videoUrl))).status).toBe(403);
    expect(await f.open(opened.previewId)).toEqual({ state: 'unavailable' });
    expect(f.tickets.size).toBe(0);
  },
);

it('scopes a revoked-lease hint to the socket, channel, source and short lifetime', async () => {
  const f = await fixture();
  const opened = await f.open();
  f.target.engine = 'A';
  await fetch(f.url(opened.videoUrl));
  const request = { channel: 1, sourceId: 'md-primary-a', previewId: opened.previewId };
  expect(await f.service.open(new AuthSession(), request)).toEqual({ state: 'unavailable' });
  expect(await f.service.open(f.owner, { ...request, channel: 2 })).toEqual({
    state: 'unavailable',
  });
  expect(await f.service.open(f.owner, { ...request, sourceId: 'md-next' })).toEqual({
    state: 'unavailable',
  });
  expect(await f.open(opened.previewId)).toEqual({
    state: 'unavailable',
    recovery: 'target-changed',
  });
  f.advance(31_000);
  expect(await f.open(opened.previewId)).toEqual({ state: 'unavailable' });
});

it.each(['close', 'drop'] as const)(
  'does not return a late handoff hint after explicit %s',
  async (cancel) => {
    const f = await fixture();
    const opened = await f.open();
    f.target.engine = 'A';
    await fetch(f.url(opened.videoUrl));
    const release = f.delayTarget(true);
    const probe = f.open(opened.previewId);
    await waitUntil(() => f.targetWaits() === 1, 'pending handoff reauthorization');
    if (cancel === 'close')
      expect(f.service.close(f.owner, opened.previewId!)).toEqual({ closed: true });
    else f.service.drop(f.owner);
    release();
    expect(await probe).toEqual({ state: 'unavailable' });
    expect(f.tickets.size).toBe(0);
  },
);

it('reauthorizes the destination before returning a saved handoff hint', async () => {
  const f = await fixture();
  const opened = await f.open();
  f.target.engine = 'A';
  await fetch(f.url(opened.videoUrl));
  f.revokeAccess();
  expect(await f.open(opened.previewId)).toEqual({ state: 'unavailable' });
  f.restoreAccess();
  expect(await f.open(opened.previewId)).toEqual({ state: 'unavailable' });
});

it('keeps a second media selection pending while proxy capacity is busy and waits before retrying', async () => {
  const f = await fixture();
  const first = await f.open();
  expect(first.state).toBe('ready');
  f.setMode();
  f.setPreparationStatus(429, '3');
  const openNext = (previewId?: string) =>
    f.service.open(f.owner, {
      channel: 1,
      sourceId: 'md-next',
      prepare: true,
      ...(previewId === undefined ? {} : { previewId }),
    });
  const busy = await openNext();
  expect(busy.state).toBe('preparing');
  expect(busy.preparationPhase).toBe('waiting-for-capacity');
  expect(busy.message).toContain('queue is busy');
  expect(busy.previewId).toBeDefined();
  expect((await fetch(f.url(first.videoUrl))).status).toBe(403);
  expect((await fetch(f.url(busy.posterUrl))).status).toBe(200);
  f.setPreparationStatus(202);
  f.advance(2_999);
  expect(await openNext(busy.previewId)).toMatchObject({
    message: busy.message,
    preparationPhase: 'waiting-for-capacity',
  });
  expect(f.preparations()).toBe(1);
  f.advance(1);
  expect(await openNext(busy.previewId)).toMatchObject({
    state: 'preparing',
    preparationPhase: 'encoding',
  });
  const ready = await openNext(busy.previewId);
  expect(ready.state).toBe('ready');
  expect(ready.previewId).toBe(busy.previewId);
  expect(ready.posterUrl).toBe(busy.posterUrl);
  expect(f.preparations()).toBe(2);
  expect(f.service.close(f.owner, ready.previewId!)).toEqual({ closed: true });
  expect(f.tickets.size).toBe(0);
});

it('observes a ready shared proxy without reposting during the busy cooldown', async () => {
  const f = await fixture();
  f.setMode();
  f.setPreparationStatus(429);
  const busy = await f.open();
  expect(busy.state).toBe('preparing');
  f.advance(999);
  expect((await f.open(busy.previewId)).state).toBe('preparing');
  expect(f.preparations()).toBe(1);
  f.readyProxy();
  expect((await f.open(busy.previewId)).state).toBe('ready');
  expect(f.preparations()).toBe(1);
});

it('streams a .22 direct file whose manifest says no proxy is required', async () => {
  const f = await fixture();
  f.setProxyState('notRequired');
  const opened = await f.open();
  expect(opened).toMatchObject({ state: 'ready', playbackMode: 'original', engine: 'B' });
  expect(opened.videoUrl).toContain('/file?ticket=');
  const partial = await fetch(f.url(opened.videoUrl), { headers: { Range: 'bytes=0-31' } });
  expect(partial.status).toBe(206);
  expect(Buffer.from(await partial.arrayBuffer())).toEqual(BYTES.subarray(0, 32));
  expect(f.preparations()).toBe(0);
  f.setMode();
  expect(await f.open(opened.previewId)).toMatchObject({ state: 'error' });
  expect(f.preparations()).toBe(0);
});

it('waits for a .22 prewarmed proxy and preserves its poster without submitting duplicate work', async () => {
  const f = await fixture();
  f.setMode();
  f.setProxyState('queued');
  const queued = await f.open();
  expect(queued).toMatchObject({ state: 'preparing', preparationPhase: 'waiting-for-capacity' });
  expect(queued.message).toContain('queued');
  expect(queued.videoUrl).toBeUndefined();
  expect((await fetch(f.url(queued.posterUrl))).status).toBe(200);
  f.setProxyState('queued', { error: 'mediaPreview.diskBudget' });
  const cacheFull = await f.open(queued.previewId);
  expect(cacheFull.message).toContain('waiting for space');
  f.setProxyState('preparing');
  expect(await f.open(queued.previewId)).toMatchObject({
    state: 'preparing',
    preparationPhase: 'encoding',
  });
  f.readyProxy();
  const ready = await f.open(queued.previewId);
  expect(ready).toMatchObject({ state: 'ready', playbackMode: 'proxy', engine: 'B' });
  expect(ready.posterUrl).toBe(queued.posterUrl);
  expect(ready.videoUrl).toContain('/proxy?ticket=');
  expect(f.preparations()).toBe(0);
});

it('honors the .22 retry deadline even if a later manifest reports notPrepared', async () => {
  const f = await fixture();
  f.setMode();
  f.setProxyState('retry', { retryMs: 120_000, error: 'internal worker detail' });
  const retry = await f.open();
  expect(retry).toMatchObject({ state: 'preparing', preparationPhase: 'waiting-for-capacity' });
  expect(retry.message).toContain('about 2 min');
  expect(retry.message).not.toContain('internal worker detail');
  expect(retry.videoUrl).toBeUndefined();
  f.resetProxy();
  for (let ms = 15_000; ms <= 105_000; ms += 15_000) {
    f.advance(15_000);
    expect(await f.open(retry.previewId)).toMatchObject({ state: 'preparing' });
  }
  f.advance(14_999);
  expect(await f.open(retry.previewId)).toMatchObject({ state: 'preparing' });
  expect(f.preparations()).toBe(0);
  f.advance(1);
  f.setProxyState('retry', { retryMs: 0 });
  expect(await f.open(retry.previewId)).toMatchObject({ state: 'preparing' });
  expect(f.preparations()).toBe(0);
  f.resetProxy();
  expect(await f.open(retry.previewId)).toMatchObject({
    state: 'preparing',
    preparationPhase: 'encoding',
  });
  expect(f.preparations()).toBe(1);
});

it('continues playback when Playout accepted preparation but its POST response was lost', async () => {
  const f = await fixture();
  f.setMode();
  const initial = await f.open(undefined, false);
  f.losePreparationResponse();
  const ready = await f.open(initial.previewId);
  expect(ready).toMatchObject({
    state: 'ready',
    previewId: initial.previewId,
    posterUrl: initial.posterUrl,
  });
  expect((await fetch(f.url(ready.videoUrl))).status).toBe(200);
  expect(f.preparations()).toBe(1);
});

it.each([
  [422, 'mediaPreview.proxyTooLarge', 'size limit'],
  [403, 'internal detail must stay private', 'refused access'],
] as const)(
  'reports a preparation refusal (%i) without treating it as capacity',
  async (status, error, message) => {
    const f = await fixture();
    f.setMode();
    f.setPreparationStatus(status, undefined, error);
    const failed = await f.open();
    expect(failed.state).toBe('error');
    expect(failed.message).toContain(message);
    expect(failed.message).not.toContain(error);
    expect((await fetch(f.url(failed.posterUrl))).status).toBe(200);
    await f.open(failed.previewId, false);
    expect(f.preparations()).toBe(1);
  },
);

it.each([
  ['mediaPreview.proxyTooLarge', 'size limit'],
  ['mediaPreview.proxyBudgetExceeded', 'size limit'],
  ['mediaPreview.preparationTimedOut', 'timed out'],
  ['internal detail must stay private', 'could not be prepared'],
] as const)(
  'keeps a permanent proxy error (%s) terminal while renewing its independent poster',
  async (error, message) => {
    const f = await fixture();
    f.setMode();
    f.failProxy(error);
    const failed = await f.open();
    expect(failed.state).toBe('error');
    expect(failed.message).toContain(message);
    expect(failed.message).not.toContain(error);
    f.advance(15_000);
    const renewed = await f.open(failed.previewId);
    expect(renewed.state).toBe('error');
    expect(renewed.posterUrl).toBe(failed.posterUrl);
    expect((await fetch(f.url(renewed.posterUrl))).status).toBe(200);
    expect(f.preparations()).toBe(0);
  },
);

it('aborts pending proxy preparation on close and never returns its revoked URLs', async () => {
  const f = await fixture();
  const initial = await f.open();
  f.setMode();
  const release = f.delayPrepare();
  const pending = f.open(initial.previewId);
  await waitUntil(() => f.preparations() === 1, 'the pending proxy preparation');
  expect(f.service.close(f.owner, initial.previewId!)).toEqual({ closed: true });
  const result = await pending;
  release();
  expect(result.state).toBe('unavailable');
  expect(result.previewId).toBeUndefined();
  expect(f.tickets.size).toBe(0);
});

it('does not open a stream if its preview was closed while read authorization was pending', async () => {
  const f = await fixture();
  f.setSlow();
  const initial = await f.open();
  const release = f.delayTarget();
  const pending = fetch(f.url(initial.videoUrl));
  await waitUntil(() => f.targetWaits() > 0, 'the pending target authorization');
  f.service.close(f.owner, initial.previewId!);
  release();
  expect((await pending).status).toBe(403);
  expect(f.streams()).toBe(0);
  expect(f.tickets.size).toBe(0);
});

it('does not let a late initial lookup revoke the preview opened for the newer selection', async () => {
  const f = await fixture();
  const release = f.delayTarget(true);
  const old = f.open();
  await waitUntil(() => f.targetWaits() === 1, 'the older pending selection');
  const current = await f.service.open(f.owner, { channel: 1, sourceId: 'md-next', prepare: true });
  expect(current.state).toBe('ready');
  release();
  expect((await old).state).toBe('unavailable');
  expect((await fetch(f.url(current.videoUrl))).status).toBe(200);
  expect(f.tickets.size).toBe(3);
});

it('sign-out invalidates an initial media lookup before it has created any HTTP grant', async () => {
  const f = await fixture();
  const release = f.delayTarget(true);
  const pending = f.open();
  await waitUntil(() => f.targetWaits() === 1, 'the pending signed-out selection');
  f.service.drop(f.owner);
  release();
  expect((await pending).state).toBe('unavailable');
  expect(f.tickets.size).toBe(0);
});

it('does not recreate a closed renewal lease when its pending lookup resolves on another engine', async () => {
  const f = await fixture();
  const initial = await f.open();
  const release = f.delayTarget(true);
  const renewal = f.open(initial.previewId);
  await waitUntil(() => f.targetWaits() === 1, 'the pending renewal');
  f.service.close(f.owner, initial.previewId!);
  f.target.engine = 'A';
  release();
  expect((await renewal).state).toBe('unavailable');
  expect(f.tickets.size).toBe(0);
});

it('revokes old resources and active streams when manifest renewal loses its source connection', async () => {
  const f = await fixture();
  f.setSlow();
  const initial = await f.open();
  const response = await fetch(f.url(initial.videoUrl));
  const body = response.arrayBuffer();
  const settled = expect(body).rejects.toThrow();
  f.failManifest();
  expect((await f.open(initial.previewId)).state).toBe('unavailable');
  await settled;
  await waitUntil(() => f.streams() === 0, 'the cancelled upstream stream');
  expect(f.tickets.size).toBe(0);
});

it('keeps the poster available while preparing a proxy and preserves URLs on renewal', async () => {
  const f = await fixture();
  f.setMode();
  const preparing = await f.open();
  expect(preparing.state).toBe('preparing');
  expect(preparing.videoUrl).toBeUndefined();
  expect((await fetch(f.url(preparing.posterUrl))).status).toBe(200);
  f.advance(15_000);
  const ready = await f.open(preparing.previewId);
  expect(ready.state).toBe('ready');
  expect(ready.posterUrl).toBe(preparing.posterUrl);
  const renewed = await f.open(ready.previewId);
  expect(renewed.videoUrl).toBe(ready.videoUrl);
  expect(f.preparations()).toBe(1);
  expect((await fetch(f.url(ready.videoUrl))).status).toBe(200);
  f.resetProxy();
  const recovering = await f.open(ready.previewId);
  expect(recovering.state).toBe('preparing');
  expect(recovering.posterUrl).toBe(ready.posterUrl);
  expect(f.preparations()).toBe(2);
  expect((await f.open(recovering.previewId)).videoUrl).toBe(ready.videoUrl);
});

it('binds a preview to its owner, source and lifetime and rechecks read access', async () => {
  const f = await fixture();
  const opened = await f.open();
  const other = new AuthSession();
  expect(
    await f.service.open(other, {
      channel: 1,
      sourceId: 'md-primary-a',
      previewId: opened.previewId,
    }),
  ).toEqual({ state: 'unavailable' });
  expect(f.service.close(other, opened.previewId!)).toEqual({ closed: false });
  expect((await fetch(f.url(opened.videoUrl))).status).toBe(200);
  f.revokeAccess();
  expect((await fetch(f.url(opened.videoUrl))).status).toBe(403);
  f.advance(31_000);
  expect((await fetch(f.url(opened.videoUrl))).status).toBe(403);
  f.restoreAccess();
  const renewed = await f.open();
  expect(renewed.state).toBe('ready');
  expect(
    await f.service.open(f.owner, {
      channel: 1,
      sourceId: 'another-media',
      previewId: renewed.previewId,
    }),
  ).toMatchObject({ state: 'unavailable' });
  expect(f.tickets.size).toBe(0);
  expect((await fetch(f.url(renewed.videoUrl))).status).toBe(403);
});

it('rejects upstream URL substitution and releases grants for unsupported servers', async () => {
  const f = await fixture();
  f.setMalicious();
  expect((await f.open()).state).toBe('error');
  expect(f.tickets.size).toBe(0);
  f.setUnsupported();
  expect(await f.open()).toEqual({ state: 'unsupported' });
  expect(f.tickets.size).toBe(0);
});

it('closing a preview aborts its live HTTP stream and revokes every resource', async () => {
  const f = await fixture();
  f.setSlow();
  const opened = await f.open();
  const response = await fetch(f.url(opened.videoUrl));
  const body = response.arrayBuffer();
  expect(f.streams()).toBe(1);
  expect(f.service.close(f.owner, opened.previewId!)).toEqual({ closed: true });
  await expect(body).rejects.toThrow();
  await new Promise((resolve) => setTimeout(resolve, 30));
  expect(f.streams()).toBe(0);
  expect(f.tickets.size).toBe(0);
  expect((await fetch(f.url(opened.posterUrl))).status).toBe(403);
});

it('opens a searched media item through the authenticated Bridge socket and HTTP route without taking it on air', async () => {
  const mediaId = FAKE_MEDIA_IDS.studio1;
  const fingerprint = fakeFingerprint(mediaId);
  const root = `/api/v1/channels/fake-programme/media-previews/${mediaId}`;
  let browserMode: 'direct' | 'proxy' = 'direct';
  const playout = track(
    await startFakePlayout({
      verifyBearers: true,
      mediaPreviews: async (req, res) => {
        const url = new URL(req.url ?? '/', 'http://engine');
        if (url.pathname === root) {
          res.writeHead(200, { 'content-type': 'application/json' }).end(
            JSON.stringify({
              mediaId,
              fingerprint,
              durationMs: 12_000,
              browserMode,
              proxy: { state: 'notPrepared' },
              fileUrl: `${root}/file?revision=${fingerprint}`,
              proxyUrl: `${root}/proxy?revision=${fingerprint}`,
              prepareUrl: `${root}/proxy`,
              posterUrl: `${root}/poster`,
            }),
          );
        } else if (url.pathname === `${root}/file`) {
          expect(req.headers.range).toBe('bytes=2-5');
          res
            .writeHead(206, {
              'content-type': 'video/mp4',
              'content-range': `bytes 2-5/${BYTES.length}`,
              'content-length': 4,
              etag: '"actual-http-preview"',
            })
            .end(BYTES.subarray(2, 6));
        } else res.writeHead(404).end();
      },
    }),
    (p) => p.stop(),
  );
  const rig = await twoChannelRig({
    bridge: { playout: { auth: 'playout', address: playout.baseUrl, issuer: playout.issuer } },
  });
  const client = await openClient(rig.handle);
  const sourceId = mediaSourceId(mediaId);
  expect(
    (await client.ask('unsigned', 'sourcePreviews.mediaOpen', { channel: 1, sourceId })).error,
  ).toBeDefined();
  expect(
    (await client.authenticate('signin', (await playout.issueToken({ user: 'operator' })).token))
      .error,
  ).toBeUndefined();
  await waitUntil(() => playout.channelsBearers.length > 0, 'the authorized channel catalogue');
  const before = (await rig.lines()).length;
  expect(
    (await client.ask('unsearched', 'sourcePreviews.mediaOpen', { channel: 1, sourceId })).payload,
  ).toEqual({
    state: 'unavailable',
    message: 'This media preview is unavailable on the source server.',
  });
  expect(
    (await client.ask('search', 'sources.media-search', { q: 'Studio 1' })).error,
  ).toBeUndefined();
  const answer = await client.ask('open', 'sourcePreviews.mediaOpen', {
    channel: 1,
    sourceId,
    prepare: true,
  });
  expect(answer.error).toBeUndefined();
  const opened = answer.payload as MediaPlaybackPreview;
  expect(opened).toMatchObject({
    state: 'ready',
    engine: 'A',
    durationMs: 12_000,
    playbackMode: 'original',
  });
  const response = await fetch(`http://127.0.0.1:${rig.handle.port}${opened.videoUrl!}`, {
    headers: { range: 'bytes=2-5' },
  });
  expect(response.status).toBe(206);
  expect(Buffer.from(await response.arrayBuffer())).toEqual(BYTES.subarray(2, 6));
  expect(
    (await client.ask('foreign', 'sourcePreviews.mediaOpen', { channel: 2, sourceId })).error,
  ).toBeDefined();
  await client.ask('close', 'sourcePreviews.mediaClose', { previewId: opened.previewId });
  expect((await fetch(`http://127.0.0.1:${rig.handle.port}${opened.videoUrl!}`)).status).toBe(403);
  browserMode = 'proxy';
  const localAnswer = await client.ask('local-original', 'sourcePreviews.mediaOpen', {
    channel: 1,
    sourceId,
    prepare: true,
    tryLocalOriginal: true,
  });
  expect(localAnswer.error).toBeUndefined();
  const local = localAnswer.payload as MediaPlaybackPreview;
  expect(local).toMatchObject({ state: 'ready', engine: 'A', playbackMode: 'local-original' });
  const original = await fetch(`http://127.0.0.1:${rig.handle.port}${local.videoUrl!}`, {
    headers: { range: 'bytes=2-5' },
  });
  expect(original.status).toBe(206);
  expect(Buffer.from(await original.arrayBuffer())).toEqual(BYTES.subarray(2, 6));
  expect(
    (await rig.lines())
      .slice(before)
      .filter((line) => /^(?:CG|PLAY|STOP|CLEAR|MIXER|LOAD|LOADBG)\b/i.test(line)),
  ).toEqual([]);
});

it.each(['missing', 'offline'] as const)(
  'reads cached media from independently authenticated mapped B when A is %s',
  async (state) => {
    const mediaId = FAKE_MEDIA_IDS.studio1;
    const fingerprint = fakeFingerprint(mediaId);
    const replicaId = `replica-${fakeFingerprint('reserve-preview')}`;
    const root = `/api/v1/channels/reserve-local/media-previews/${replicaId}`;
    const a = track(await startFakePlayout({ verifyBearers: true }), (p) => p.stop());
    a.setChannels(FAKE_CATALOGUE.map((row) => ({ ...row, videoMode: '1080i5000' })));
    let bReads = 0;
    const b = track(
      await startFakePlayout({
        verifyBearers: true,
        mediaThumbnail: (req, res) => {
          expect(new URL(req.url ?? '/', 'http://engine').searchParams.get('fingerprint')).toBe(
            fingerprint,
          );
          res
            .writeHead(200, { 'content-type': 'image/jpeg', 'content-length': FRAME_B.length })
            .end(FRAME_B);
        },
        mediaPreviews: async (req, res) => {
          bReads++;
          const url = new URL(req.url ?? '/', 'http://engine');
          if (url.pathname === root)
            res.writeHead(200, { 'content-type': 'application/json' }).end(
              JSON.stringify({
                mediaId: replicaId,
                fingerprint,
                durationMs: 12_000,
                browserMode: 'direct',
                proxy: { state: 'notPrepared' },
                fileUrl: `${root}/file?revision=${fingerprint}`,
                proxyUrl: `${root}/proxy?revision=${fingerprint}`,
                prepareUrl: `${root}/proxy`,
                posterUrl: `${root}/poster`,
              }),
            );
          else if (url.pathname === `${root}/file`)
            res
              .writeHead(206, {
                'content-type': 'video/mp4',
                'content-range': `bytes 0-3/${BYTES.length}`,
                'content-length': 4,
              })
              .end(BYTES.subarray(0, 4));
          else res.writeHead(404).end();
        },
      }),
      (p) => p.stop(),
    );
    b.setChannels([
      {
        id: 'reserve-local',
        name: 'Reserve mirror',
        casparHost: '127.0.0.1',
        casparChannel: 2,
        videoMode: '1080i5000',
        mirrorOf: { playout: a.baseUrl, id: 'fake-programme' },
      },
    ]);
    b.setMedia([
      {
        id: replicaId,
        name: 'Studio reserve',
        clip: 'D:/Reserve/Studio.mp4',
        type: 'video',
        fingerprint,
        durationMs: 12_000,
        folder: 'Reserve',
        updatedAt: '2026-11-18T00:00:00Z',
      },
    ]);
    const dir = track(fs.mkdtempSync(path.join(os.tmpdir(), 'cg-relay-reserve-')), (p) =>
      fs.rmSync(p, { recursive: true, force: true }),
    );
    const udp = dgram.createSocket('udp4');
    await new Promise<void>((resolve) => udp.bind(0, '127.0.0.1', resolve));
    const oscPort = udp.address().port;
    await new Promise<void>((resolve) => udp.close(resolve));
    const core = track(
      await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 40, channels: 2 }),
      (m) => m.stop(),
    );
    let clock = Date.now();
    const rig = await twoChannelRig({
      bridge: {
        playout: { auth: 'playout', address: a.baseUrl, issuer: a.issuer },
        backupPlayoutAddress: b.baseUrl,
        bridgeSessionPath: path.join(dir, 'session.json'),
        playoutCatalogueOptions: { now: () => clock },
      },
    });
    await rig.handle.runtime.setConfig({
      ...rig.connection,
      servers: {
        ...rig.connection.servers,
        B: { host: '127.0.0.1', amcpPort: core.amcpPort, oscPort },
      },
    });
    const client = await openClient(rig.handle);
    expect(
      (await client.authenticate('admin', (await a.issueToken({ user: 'admin' })).token)).error,
    ).toBeUndefined();
    expect(
      (
        await client.ask('b-signin', 'bridgeSession.backup.sign-in', {
          username: 'cg-admin',
          password: FAKE_PLAYOUT_PASSWORD,
        })
      ).payload,
    ).toEqual({ ok: true });
    let mapping: BackupChannelsState | undefined;
    await waitUntil(async () => {
      const state = (await client.ask(randomUUID(), 'backupChannels.state'))
        .payload as BackupChannelsState;
      mapping = state;
      return (
        state.backup?.channels.some((entry) => entry.channel === 1 && entry.backupChannel === 2) ===
        true
      );
    }, 'the verified backup mapping').catch(() => {
      expect(mapping).toMatchObject({
        backup: { channels: [{ channel: 1, state: 'mapped', backupChannel: 2 }] },
      });
    });
    const sourceId = mediaSourceId(mediaId);
    expect(
      (await client.ask('media', 'sources.media-search', { q: 'Studio 1' })).error,
    ).toBeUndefined();
    if (state === 'missing') {
      expect(await rig.handle.playoutSources?.ensureBound(sourceId)).toEqual({ ok: true });
      a.setMedia([]);
      await rig.handle.playoutSources?.freshClipFor(sourceId, 'previous-clip');
      expect(rig.handle.playoutSources?.mediaForPresence(sourceId)?.state).toBe('missing');
    } else {
      await a.goOffline();
      clock += 60_000;
      await rig.handle.playoutCatalogue?.refresh();
      expect(rig.handle.playoutCatalogue?.rows()).toBeNull();
    }
    const reply = await client.ask('reserve-open', 'sourcePreviews.mediaOpen', {
      channel: 1,
      sourceId,
      prepare: true,
    });
    expect(reply.error).toBeUndefined();
    const preview = reply.payload as MediaPlaybackPreview;
    expect(preview).toMatchObject({ state: 'ready', engine: 'B' });
    const response = await fetch(`http://127.0.0.1:${rig.handle.port}${preview.videoUrl!}`, {
      headers: { range: 'bytes=0-3' },
    });
    expect(response.status).toBe(206);
    expect(Buffer.from(await response.arrayBuffer())).toEqual(BYTES.subarray(0, 4));
    expect(bReads).toBe(2);
    const poster = await client.ask('reserve-poster', 'sources.media-thumbnail', {
      channel: 1,
      id: sourceId,
    });
    expect(poster.payload).toEqual({
      ok: true,
      engine: 'B',
      dataUrl: 'data:image/jpeg;base64,' + FRAME_B.toString('base64'),
    });
    if (state === 'missing') {
      const viewer = (
        await a.issueToken({ user: 'viewer', cgChannels: [{ host: '127.0.0.1', channel: 1 }] })
      ).token;
      expect((await client.authenticate('poster-viewer', viewer)).error).toBeUndefined();
      expect(
        (
          await client.ask('viewer-b-poster', 'sources.media-thumbnail', {
            channel: 1,
            id: sourceId,
          })
        ).payload,
      ).toEqual(poster.payload);
    }
  },
  20_000,
);
