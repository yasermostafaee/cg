import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CONSOLE_HEALTH_APP,
  CONSOLE_HEALTH_PATH,
  ConsoleHttpServer,
  resolveConsolePath,
} from '../src/console-http-server.js';

/**
 * `DESKTOP-APPS-01` — the console's own origin (ADR 0011): static files, the SPA fallback, the
 * health identity, and nothing outside the served directory.
 */

let root: string;
let outside: string;
let server: ConsoleHttpServer;

/** A raw GET/POST, so a path like `/../x` reaches the server exactly as written. */
function request(
  port: number,
  urlPath: string,
  method = 'GET',
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: urlPath, method }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => (body += chunk));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

beforeEach(async () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-console-'));
  root = path.join(base, 'console');
  outside = path.join(base, 'secret.txt');
  fs.mkdirSync(path.join(root, 'assets'), { recursive: true });
  fs.mkdirSync(path.join(root, 'fonts'), { recursive: true });
  fs.writeFileSync(path.join(root, 'index.html'), '<!doctype html><title>console</title>');
  fs.writeFileSync(path.join(root, 'assets', 'app-abc123.js'), 'console.log(1)');
  fs.writeFileSync(path.join(root, 'fonts', 'face.woff2'), Buffer.from([0x77, 0x4f, 0x46, 0x32]));
  fs.writeFileSync(outside, 'not for the console');
  server = new ConsoleHttpServer();
  await server.start({ dir: root, port: 0 });
});

afterEach(async () => {
  await server.stop();
});

describe('DESKTOP-APPS-01 — the console served on its own origin', () => {
  it('serves index.html at the root, uncached', async () => {
    const res = await request(server.port, '/');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(res.headers['cache-control']).toBe('no-cache');
    expect(res.body).toContain('<title>console</title>');
  });

  it('answers a client-side route with index.html (the SPA fallback)', async () => {
    const res = await request(server.port, '/stack/row/1?x=2');
    expect(res.status).toBe(200);
    expect(res.body).toContain('<title>console</title>');
  });

  it('serves fingerprinted assets as immutable, with their own type', async () => {
    const js = await request(server.port, '/assets/app-abc123.js');
    expect(js.status).toBe(200);
    expect(js.headers['content-type']).toBe('text/javascript; charset=utf-8');
    expect(js.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(js.body).toBe('console.log(1)');
    const font = await request(server.port, '/fonts/face.woff2');
    expect(font.headers['content-type']).toBe('font/woff2');
  });

  it('a MISSING asset is a 404, never the page', async () => {
    const res = await request(server.port, '/assets/missing-def456.js');
    expect(res.status).toBe(404);
    expect(res.body).not.toContain('<title>console</title>');
  });

  it('refuses every spelling of a path outside the served directory', async () => {
    // Positive control: the file exists, and the server does serve files — so a 404 below is
    // the containment answering, not a dead server.
    expect(fs.existsSync(outside)).toBe(true);
    expect((await request(server.port, '/assets/app-abc123.js')).status).toBe(200);
    for (const p of [
      '/../secret.txt',
      '/..%2fsecret.txt',
      '/%2e%2e/secret.txt',
      '/..%5csecret.txt',
    ]) {
      const res = await request(server.port, p);
      expect(res.body, p).not.toContain('not for the console');
    }
    expect(resolveConsolePath(root, '/../secret.txt')).toBeNull();
    expect(resolveConsolePath(root, '/%2e%2e/secret.txt')).toBeNull();
    expect(resolveConsolePath(root, '/assets/app-abc123.js')).toBe(
      path.join(root, 'assets', 'app-abc123.js'),
    );
  });

  it('GET /__cg/health names this process as a bridge', async () => {
    const res = await request(server.port, CONSOLE_HEALTH_PATH);
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(JSON.parse(res.body)).toEqual({
      app: CONSOLE_HEALTH_APP,
      pid: process.pid,
      execPath: process.execPath,
    });
  });

  it('answers GET and HEAD only', async () => {
    const post = await request(server.port, '/', 'POST');
    expect(post.status).toBe(405);
    expect(post.headers.allow).toBe('GET, HEAD');
    const head = await request(server.port, '/', 'HEAD');
    expect(head.status).toBe(200);
    expect(head.body).toBe('');
  });

  it('refuses to start on a directory that holds no console', async () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-console-empty-'));
    await expect(new ConsoleHttpServer().start({ dir: empty, port: 0 })).rejects.toThrow(
      /no console at/,
    );
  });

  it('stops listening when stopped', async () => {
    const port = server.port;
    await server.stop();
    await expect(request(port, '/')).rejects.toThrow();
  });
});
