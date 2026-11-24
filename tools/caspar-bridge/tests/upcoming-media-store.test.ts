import { createHash } from 'node:crypto';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  UPCOMING_MEDIA_MAX_BYTES,
  UpcomingMediaGetChannel,
  UpcomingMediaPutChannel,
  type UpcomingMediaMime,
} from '@cg/shared-ipc';
import { afterEach, describe, expect, it } from 'vitest';
import { createUpcomingMediaStore } from '../src/upcoming-media-store.js';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);
const MP4 = Buffer.concat([
  Buffer.from([0, 0, 0, 20]),
  Buffer.from('ftypisom'),
  Buffer.alloc(4),
  Buffer.from('mp42'),
]);
const WEBM = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x87, 0x42, 0x82, 0x84, 0x77, 0x65, 0x62, 0x6d]);

const workspaces: string[] = [];

afterEach(async () => {
  await Promise.all(
    workspaces.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function workspace(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'cg-upcoming-media-'));
  workspaces.push(directory);
  return directory;
}

function request(bytes: Buffer, mime: UpcomingMediaMime) {
  return { name: '../file.untrusted-extension', mime, base64: bytes.toString('base64') };
}

function shaOf(bytes: Buffer) {
  return createHash('sha256').update(bytes).digest('hex');
}

describe('Upcoming Programs media storage', () => {
  it.each([
    [PNG, 'image/png'],
    [MP4, 'video/mp4'],
    [WEBM, 'video/webm'],
  ] as const)(
    'stores validated bytes, identifying them independently of the file name',
    async (bytes, mime) => {
      const store = createUpcomingMediaStore();
      const body = request(bytes, mime);
      const sha256 = shaOf(bytes);
      const response = await store.put(UpcomingMediaPutChannel.request.parse(body));
      expect(UpcomingMediaPutChannel.response.parse(response)).toEqual({ ok: true, sha256, mime });
      expect(await store.mimeOf(sha256)).toBe(mime);
      expect(await store.read(sha256)).toEqual({ mime, bytes });
      const fetched = await store.get(UpcomingMediaGetChannel.request.parse({ sha256 }));
      expect(UpcomingMediaGetChannel.response.parse(fetched)).toEqual({
        kind: 'media',
        mime,
        base64: body.base64,
      });
    },
  );

  it('refuses malformed base64, disguised types, truncated containers and files above the limit', async () => {
    const store = createUpcomingMediaStore();
    expect(await store.put({ ...request(PNG, 'image/png'), base64: 'abcd?===' })).toEqual({
      ok: false,
      errorCode: 'media-invalid-base64',
    });
    const invalid = [
      request(PNG, 'video/mp4'),
      request(Buffer.from('<svg/>'), 'image/png'),
      request(MP4.subarray(0, 16), 'video/mp4'),
      request(Buffer.concat([WEBM.subarray(0, 8), Buffer.from('mkv!')]), 'video/webm'),
    ];
    for (const body of invalid) {
      expect(await store.put(body)).toEqual({ ok: false, errorCode: 'media-type-mismatch' });
    }
    expect(
      await store.put(request(Buffer.alloc(UPCOMING_MEDIA_MAX_BYTES + 1), 'image/png')),
    ).toEqual({
      ok: false,
      errorCode: 'media-too-large',
    });
    expect(await store.get({ sha256: shaOf(PNG) })).toEqual({ kind: 'missing' });
    expect(await store.read('../other-files')).toBeNull();
  });

  it('atomically deduplicates concurrent uploads and reads the same bytes after restart', async () => {
    const directory = await workspace();
    const sha256 = shaOf(MP4);
    const store = createUpcomingMediaStore(directory);
    const body = request(MP4, 'video/mp4');
    const responses = await Promise.all([store.put(body), store.put(body), store.put(body)]);
    expect(responses).toEqual(
      Array.from({ length: 3 }, () => ({ ok: true, sha256, mime: body.mime })),
    );
    expect(await readdir(directory)).toEqual([sha256]);
    const restored = createUpcomingMediaStore(directory);
    expect(await restored.mimeOf(sha256)).toBe(body.mime);
    expect(await restored.read(sha256)).toEqual({ mime: body.mime, bytes: MP4 });
    expect(await restored.get({ sha256: shaOf(PNG) })).toEqual({ kind: 'missing' });
  });

  it('sweeps unused objects after grace and only removes managed hashes', async () => {
    const directory = await workspace();
    const png = shaOf(PNG);
    const video = shaOf(MP4);
    const store = createUpcomingMediaStore(directory);
    const keep = new Set([png]);
    await store.put(request(PNG, 'image/png'));
    await store.put(request(MP4, 'video/mp4'));
    await writeFile(path.join(directory, 'other-file'), 'keep');
    expect(await store.sweep(keep)).toBe(0);
    expect(await store.sweep(keep, Date.now() + 35 * 60_000)).toBe(1);
    expect(await readdir(directory)).toEqual([png, 'other-file']);
    expect(await store.read(video)).toBeNull();
    expect(await store.read(png)).toEqual({ mime: 'image/png', bytes: PNG });
  });

  it('reports write refusal and accepts a retry after the storage path becomes usable', async () => {
    const directory = path.join(await workspace(), 'media');
    const store = createUpcomingMediaStore(directory);
    const body = request(PNG, 'image/png');
    await writeFile(directory, 'this should be a directory');
    expect(await store.put(body)).toEqual({ ok: false, errorCode: 'media-store-failed' });
    await rm(directory);
    expect(await store.put(body)).toEqual({ ok: true, sha256: shaOf(PNG), mime: body.mime });
  });

  it('protects a validated object from a concurrent sweep with an older keep set', async () => {
    const directory = await workspace();
    const sha256 = shaOf(PNG);
    await createUpcomingMediaStore(directory).put(request(PNG, 'image/png'));
    const restored = createUpcomingMediaStore(directory);
    const checking = restored.mimeOf(sha256);
    const sweeping = restored.sweep(new Set());

    expect(await checking).toBe('image/png');
    expect(await sweeping).toBe(0);
    expect(await restored.read(sha256)).toEqual({ mime: 'image/png', bytes: PNG });

    expect(await restored.sweep(new Set(), Date.now() + 35 * 60_000)).toBe(1);
    expect(await restored.mimeOf(sha256)).toBeNull();
  });
});
