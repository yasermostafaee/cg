import * as http from 'node:http';
import { upcomingProgramMediaPath } from '@cg/shared-schema';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TemplateHttpServer } from '../src/template-http-server.js';

const SHA256 = 'a'.repeat(64);
const MEDIA = Buffer.from('0123456789');
const readMedia = vi.fn((sha256: string) =>
  Promise.resolve(sha256 === SHA256 ? { mime: 'video/webm' as const, bytes: MEDIA } : null),
);
let server: TemplateHttpServer;

beforeEach(async () => {
  readMedia.mockClear();
  server = new TemplateHttpServer(() => null, undefined, undefined, undefined, readMedia);
  await server.start({ bindHost: '127.0.0.1', serveHost: '127.0.0.1', port: 0 });
});

afterEach(async () => {
  await server.stop();
});

function request(
  headers: http.OutgoingHttpHeaders = {},
  method = 'GET',
  url = upcomingProgramMediaPath(SHA256),
): Promise<{ status: number; headers: http.IncomingHttpHeaders; bytes: Buffer }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port: server.port, path: url, method, headers },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            bytes: Buffer.concat(chunks),
          }),
        );
        res.on('error', reject);
      },
    );
    req.on('error', reject);
    req.end();
  });
}

describe('template Upcoming Programs media route', () => {
  it('serves an exact stored asset to a same-origin document', async () => {
    const result = await request({
      origin: `http://127.0.0.1:${String(server.port)}`,
      'sec-fetch-site': 'same-origin',
    });
    expect(result.status).toBe(200);
    expect(result.bytes).toEqual(MEDIA);
    expect(result.headers).toMatchObject({
      'content-type': 'video/webm',
      'content-length': '10',
      'accept-ranges': 'bytes',
      'cross-origin-resource-policy': 'same-origin',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    });
    expect(result.headers['access-control-allow-origin']).toBeUndefined();
  });

  it.each([
    ['bytes=2-4', 'bytes 2-4/10', '234'],
    ['bytes=8-', 'bytes 8-9/10', '89'],
    ['bytes=8-20', 'bytes 8-9/10', '89'],
    ['bytes=-3', 'bytes 7-9/10', '789'],
  ])('returns a single partial response for %s', async (range, contentRange, payload) => {
    const result = await request({ range });
    expect(result.status).toBe(206);
    expect(result.headers['content-range']).toBe(contentRange);
    expect(result.headers['content-length']).toBe(String(payload.length));
    expect(result.bytes.toString()).toBe(payload);
  });

  it.each(['bytes=10-', 'bytes=-0', 'bytes=7-3', 'bytes=0-1,4-5'])(
    'refuses an unusable range %s',
    async (range) => {
      const result = await request({ range });
      expect(result.status).toBe(416);
      expect(result.headers['content-range']).toBe('bytes */10');
      expect(result.bytes.length).toBe(0);
    },
  );

  it('refuses foreign origins, foreign document sites, other methods and non-hash paths before reading', async () => {
    for (const headers of [{ origin: 'http://other.test' }, { 'sec-fetch-site': 'same-site' }]) {
      const result = await request(headers);
      expect(result.status).toBe(404);
      expect(result.bytes.toString()).toBe('not found');
    }
    for (const method of ['HEAD', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']) {
      expect((await request({}, method)).status).toBe(404);
    }
    expect((await request({}, 'GET', '/upcoming-media/abcd')).status).toBe(404);
    expect(readMedia).not.toHaveBeenCalled();
    expect((await request({}, 'GET', upcomingProgramMediaPath('b'.repeat(64)))).status).toBe(404);
  });
});
