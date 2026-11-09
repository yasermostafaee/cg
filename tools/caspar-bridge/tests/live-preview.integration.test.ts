import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { LivePreviewHandle, LivePreviewStatus } from '@cg/shared-ipc';
import type { AuditEntry } from '@cg/shared-schema';
import { openClient, type Client } from './support/auth-harness.js';
import { FakeLivePreview } from './support/fake-live-preview.js';
import { startFakePlayout } from './support/fake-playout.js';
import { track } from './support/harness.js';
import { FRAME_A } from './support/fake-pgm-feed.js';
import { twoChannelRig, waitUntil } from './support/two-channel-rig.js';

const PROGRAMME = 'fake-programme';
const newCheck = (channel = 1): LivePreviewHandle => ({ channel, previewId: randomUUID() });

async function ask<T>(client: Client, method: string, payload?: unknown): Promise<T> {
  const answer = await client.ask(randomUUID(), method, payload);
  if (answer.error !== undefined) throw new Error(answer.error);
  return answer.payload as T;
}

async function fixture() {
  const preview = new FakeLivePreview();
  const playout = track(await startFakePlayout({ livePreview: preview.handle }), (p) => p.stop());
  const rig = await twoChannelRig({
    bridge: {
      playout: { auth: 'playout', address: playout.baseUrl, issuer: playout.issuer },
    },
  });
  const connect = async (): Promise<{ client: Client; bearer: string }> => {
    const client = await openClient(rig.handle);
    const { token } = await playout.issueToken({ user: 'operator' });
    const answer = await client.authenticate(randomUUID(), token);
    expect(answer.error).toBeUndefined();
    return { client, bearer: `Bearer ${token}` };
  };
  const first = await connect();
  await waitUntil(
    () =>
      rig.handle.runtime.sourceCatalog().sources.some((row) => row.id === 'in-li-studio1') &&
      playout.channelsBearers.length > 0,
    'D4 channel identity and D10 input catalogue',
  );
  return { preview, rig, first, connect };
}

const status = (client: Client, handle: LivePreviewHandle): Promise<LivePreviewStatus> =>
  ask(client, 'livePreview.status', handle);

const start = (
  client: Client,
  handle: LivePreviewHandle,
  sourceId = 'in-li-studio1',
): Promise<LivePreviewStatus> => ask(client, 'livePreview.start', { ...handle, sourceId });

async function ready(client: Client, handle: LivePreviewHandle): Promise<void> {
  await waitUntil(async () => (await status(client, handle)).state === 'ready', 'the input lease');
}

describe('C-023 preview lease through authenticated Bridge routes', () => {
  it('relays the saved input, scopes tickets and meter, and fences a stale console on replacement', async () => {
    const { preview, rig, first, connect } = await fixture();
    const { client: a } = first;
    const b = await connect();
    const one = newCheck();
    const two = newCheck();
    const ledgerBefore = await rig.lines();
    const base = rig.handle.url.replace(/^ws:/, 'http:');

    expect(await start(a, one)).toMatchObject({ state: 'connecting', dbFs: null });
    await ready(a, one);
    expect(preview.starts[0]).toEqual({
      owner: first.bearer,
      body: { inputId: 'li-studio1', requestId: one.previewId },
      channelCode: PROGRAMME,
    });
    expect(await status(a, one)).toMatchObject({ sourceName: 'Studio 1', dbFs: [-21, -18] });
    preview.otherMeter = true;
    expect(await status(a, one)).toMatchObject({ state: 'ready', dbFs: null });
    preview.otherMeter = false;

    expect(await ask(b.client, 'livePreview.ticket', { ...one, stream: 'picture' })).toEqual({
      path: null,
    });
    const { path } = await ask<{ path: string }>(a, 'livePreview.ticket', {
      ...one,
      stream: 'picture',
    });
    const ticket = new URL(base + path).search;
    expect(path).not.toContain('studio1');
    expect((await fetch(base + '/pgm/1' + ticket)).status).toBe(403);
    expect((await fetch(base + path.replace('/picture?', '/audio?'))).status).toBe(403);
    const abort = new AbortController();
    const picture = await fetch(base + path, { signal: abort.signal });
    const reader = picture.body?.getReader();
    const chunks: Buffer[] = [];
    let received = 0;
    while (received < FRAME_A.length + 4) {
      const part = await reader?.read();
      if (part === undefined || part.done)
        throw new Error('the picture ended before its first frame');
      received += part.value.length;
      chunks.push(Buffer.from(part.value));
    }
    const frame = Buffer.concat(chunks);
    expect(frame.readUInt32BE()).toBe(FRAME_A.length);
    expect(frame.subarray(4, 4 + FRAME_A.length)).toEqual(FRAME_A);
    expect(preview.audioOpens).toBe(0);
    abort.abort();

    await start(b.client, two, 'in-li-newscam');
    await ready(b.client, two);
    expect(await status(a, one)).toMatchObject({ state: 'replaced', dbFs: null });
    await ask(a, 'livePreview.stop', one);
    a.ws.close();
    const owned = preview.leases.get(PROGRAMME);
    expect(owned?.requestId).toBe(two.previewId);
    expect(preview.stops).toHaveLength(0);
    const sound = await ask<{ path: string }>(b.client, 'livePreview.ticket', {
      ...two,
      stream: 'audio',
    });
    const pcmAbort = new AbortController();
    const audio = await fetch(base + sound.path, { signal: pcmAbort.signal });
    const sample = await audio.body?.getReader().read();
    expect(
      Buffer.from(sample?.value ?? [])
        .subarray(0, 4)
        .toString(),
    ).toBe('RIFF');
    b.client.ws.close();
    await waitUntil(
      () => preview.audioCloses === 1 && preview.stops.length === 1,
      'conditional stop and sound release',
    );
    pcmAbort.abort();
    expect(preview.stops[0]).toEqual({
      owner: b.bearer,
      leaseId: owned?.leaseId,
      generation: owned?.generation,
    });
    expect(preview.leases.has(PROGRAMME)).toBe(false);
    const observer = await connect();
    const audit = await ask<{ entries: AuditEntry[] }>(observer.client, 'audit.page', {
      filter: { channel: 1, action: 'live-preview' },
    });
    expect(audit.entries.map((row) => row.inputPreview)).toEqual([
      { channel: 1, sourceName: 'دوربین خبر', operation: 'stop' },
      { channel: 1, sourceName: 'دوربین خبر', operation: 'replace' },
      { channel: 1, sourceName: 'Studio 1', operation: 'start' },
    ]);
    expect(JSON.stringify(audit)).not.toMatch(/Bearer|udp:\/\/|in-li-/);
    const writes = (await rig.lines())
      .slice(ledgerBefore.length)
      .filter((line) => /^(?:CG|PLAY|STOP|CLEAR|MIXER|LOAD|LOADBG)\b/i.test(line));
    expect(writes).toEqual([]);
  });

  it('refuses legacy, forbidden and unavailable inputs and never retries an air conflict', async () => {
    const { preview, first } = await fixture();
    const { client } = first;
    await expect(start(client, newCheck(2))).rejects.toThrow();
    expect(await start(client, newCheck(), 'in-li-input4')).toMatchObject({
      state: 'unavailable',
      message: expect.stringMatching(/no layer|no signal/i),
    });
    expect(preview.paths).toEqual([]);
    preview.legacy = true;
    const legacy = newCheck();
    await start(client, legacy);
    await waitUntil(
      async () => (await status(client, legacy)).state === 'unavailable',
      'legacy refusal',
    );
    expect(preview.starts).toEqual([]);
    expect(preview.stops).toEqual([]);
    preview.legacy = false;
    preview.inUse = true;
    const conflict = newCheck();
    await start(client, conflict);
    await waitUntil(
      async () => (await status(client, conflict)).state === 'conflict',
      'air priority',
    );
    expect(preview.starts).toHaveLength(1);
    expect(preview.stops).toEqual([]);
  });

  it('recovers a pending request without replaying POST, renews the same lease and resets an expired meter', async () => {
    const { preview, first } = await fixture();
    const { client } = first;
    preview.pending = true;
    preview.renewAfter = 1;
    const handle = newCheck();
    await start(client, handle);
    await waitUntil(() => preview.leases.has(PROGRAMME), 'pending start');
    expect(await status(client, handle)).toMatchObject({ state: 'connecting' });
    expect(await ask(client, 'livePreview.ticket', { ...handle, stream: 'picture' })).toEqual({
      path: null,
    });
    preview.pending = false;
    await ready(client, handle);
    await waitUntil(async () => {
      await status(client, handle);
      return preview.renews === 1;
    }, 'the same lease renewed');
    expect(preview.starts).toHaveLength(1);
    expect(preview.paths.some((path) => path.endsWith(`?requestId=${handle.previewId}`))).toBe(
      true,
    );
    preview.staleMeter = true;
    expect(await status(client, handle)).toMatchObject({ state: 'ready', dbFs: null });
    preview.revoke(PROGRAMME);
    expect(await status(client, handle)).toMatchObject({ state: 'expired', dbFs: null });
  });

  it('releases an owned pending lease with its exact handle when a check closes', async () => {
    const { preview, first } = await fixture();
    const { client } = first;
    preview.pending = true;
    const handle = newCheck();
    await start(client, handle);
    await waitUntil(() => preview.leases.has(PROGRAMME), 'pending lease');
    const owned = preview.leases.get(PROGRAMME);
    await ask(client, 'livePreview.stop', handle);
    await waitUntil(
      () => preview.stops.length === 1 && !preview.leases.has(PROGRAMME),
      'pending lease released',
    );
    expect(preview.stops[0]).toEqual({
      owner: first.bearer,
      leaseId: owned?.leaseId,
      generation: owned?.generation,
    });
    expect(await status(client, handle)).toMatchObject({ state: 'expired' });
  });
});
