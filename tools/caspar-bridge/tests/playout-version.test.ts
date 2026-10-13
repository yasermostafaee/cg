import http from 'node:http';
import type net from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import {
  PLAYOUT_VERSION_PATH,
  PlayoutVersionReader,
  playoutVersionOf,
  playoutVersionUrl,
} from '../src/playout-version.js';

/**
 * 🔴 `R-084` (`RELEASE-0111-01-A` A1) — **CG BRIDGE READS THE PLAYOUT'S VERSION ITSELF**: at start and
 * then once per period, with no token and no `Origin`, the `version` alone. A Playout that does not
 * answer is `not served` (`null`), and nothing else depends on it.
 */

const closers: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

/** A Playout answering `/api/v1/system/version` with `version` (`null` — `404`), recording each ask. */
async function playout(version: { current: string | null }, asked: http.IncomingHttpHeaders[]) {
  const server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === PLAYOUT_VERSION_PATH) {
      asked.push({ ...req.headers });
      if (version.current === null) {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          component: 'engine',
          version: version.current,
          releaseDate: '2026-09-30',
          changelog: [{ items: ['بهبودِ پایداری'] }],
        }),
      );
      return;
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  closers.push(() => new Promise((resolve) => server.close(() => resolve())));
  return `http://127.0.0.1:${String((server.address() as net.AddressInfo).port)}`;
}

async function until(done: () => boolean, ms = 3000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!done() && Date.now() < deadline) await new Promise((r) => setTimeout(r, 10));
  if (!done()) throw new Error('timed out');
}

describe('R-084 — the Playout’s version', () => {
  it('reads `version` and nothing else of the answer; anything else is not a version', () => {
    expect(playoutVersionOf({ version: '2.9.2', changelog: ['…'] })).toBe('2.9.2');
    expect(playoutVersionOf({ version: '2.9.3-beta.1' })).toBe('2.9.3-beta.1');
    expect(playoutVersionOf({ version: 'two' })).toBeNull();
    expect(playoutVersionOf({ assemblyVersion: '2.9.2.0' })).toBeNull();
    expect(playoutVersionOf(null)).toBeNull();
    expect(playoutVersionUrl('http://192.0.2.10:8080/')).toBe(
      'http://192.0.2.10:8080/api/v1/system/version',
    );
  });

  it('🔴 read at start — no token, no Origin — and again each period; a change is told once', async () => {
    const version = { current: '2.9.2' as string | null };
    const asked: http.IncomingHttpHeaders[] = [];
    const reader = new PlayoutVersionReader(playoutVersionUrl(await playout(version, asked)), {
      pollMs: 50,
    });
    const told: (string | null)[] = [];
    reader.onChanged((v) => told.push(v));
    reader.start();
    try {
      await until(() => reader.version() === '2.9.2');
      expect(asked[0]?.authorization).toBeUndefined();
      expect(asked[0]?.origin).toBeUndefined();
      version.current = '2.9.3';
      await until(() => reader.version() === '2.9.3');
      expect(told).toEqual(['2.9.2', '2.9.3']);
      expect(reader.readCount, 'read again each period').toBeGreaterThanOrEqual(2);
    } finally {
      reader.dispose();
    }
  });

  it('CONTROL — a Playout that does not serve it (or cannot be reached) reads `null`: not served', async () => {
    const version = { current: null as string | null };
    const reader = new PlayoutVersionReader(playoutVersionUrl(await playout(version, [])));
    await reader.refresh();
    expect(reader.version()).toBeNull();
    // Unreachable: a port nothing listens on.
    const gone = new PlayoutVersionReader('http://127.0.0.1:1/api/v1/system/version');
    await gone.refresh();
    expect(gone.version()).toBeNull();
  });
});
