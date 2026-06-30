import * as http from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { TemplateRegistry } from '../src/template-registry.js';
import {
  TemplateHttpServer,
  deriveServeOptions,
  isLoopbackHost,
} from '../src/template-http-server.js';
import type { TemplateInfo } from '@cg/shared-ipc';

/**
 * B-038 Phase 3 — the bridge serves each retained template's HTML over HTTP
 * (`GET /template/<id>`), reading the current HTML from the registry so re-import
 * is reflected with no server change. These tests pin that contract + the
 * host/reachability derivation the `CG ADD` URL depends on.
 */

let server: TemplateHttpServer | null = null;

afterEach(async () => {
  await server?.stop();
  server = null;
});

function info(templateId: string): TemplateInfo {
  return { templateId, templateType: 'lower-third', fields: [] };
}

interface HttpResult {
  status: number;
  contentType: string | undefined;
  body: string;
}

function get(url: string): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        let body = '';
        res.setEncoding('utf-8');
        res.on('data', (c: string) => (body += c));
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            contentType: res.headers['content-type'],
            body,
          }),
        );
      })
      .on('error', reject);
  });
}

describe('TemplateHttpServer', () => {
  it('serves the stored HTML for a known id and 404s an unknown id', async () => {
    const reg = new TemplateRegistry();
    reg.import(info('t1'), '<!doctype html><html><body>v1</body></html>');
    server = new TemplateHttpServer((id) => reg.html(id));
    await server.start({ bindHost: '127.0.0.1', port: 0, serveHost: '127.0.0.1' });

    const known = await get(server.urlFor('t1'));
    expect(known.status).toBe(200);
    expect(known.contentType).toBe('text/html; charset=utf-8');
    expect(known.body).toBe('<!doctype html><html><body>v1</body></html>');

    const unknown = await get(server.urlFor('nope'));
    expect(unknown.status).toBe(404);

    const root = await get(`http://127.0.0.1:${String(server.port)}/`);
    expect(root.status).toBe(404);
  });

  it('serves the replacement HTML after a re-import (reads the live registry)', async () => {
    const reg = new TemplateRegistry();
    reg.import(info('t1'), '<html><body>v1</body></html>');
    server = new TemplateHttpServer((id) => reg.html(id));
    await server.start({ bindHost: '127.0.0.1', port: 0, serveHost: '127.0.0.1' });

    expect((await get(server.urlFor('t1'))).body).toBe('<html><body>v1</body></html>');
    reg.import(info('t1'), '<html><body>v2</body></html>');
    expect((await get(server.urlFor('t1'))).body).toBe('<html><body>v2</body></html>');
  });

  it('builds a /template/<id> URL on the configured serve host + bound port', async () => {
    server = new TemplateHttpServer(() => null);
    await server.start({ bindHost: '127.0.0.1', port: 0, serveHost: '127.0.0.1' });
    expect(server.urlFor('abc')).toBe(`http://127.0.0.1:${String(server.port)}/template/abc`);
    expect(server.port).toBeGreaterThan(0);
  });
});

describe('deriveServeOptions (host/reachability)', () => {
  it('serves loopback when CasparCG is local', () => {
    expect(isLoopbackHost('127.0.0.1')).toBe(true);
    const opts = deriveServeOptions('127.0.0.1');
    expect(opts).toEqual({ bindHost: '127.0.0.1', port: 0, serveHost: '127.0.0.1' });
  });

  it('binds a routable interface (opt-in) when CasparCG is remote', () => {
    expect(isLoopbackHost('192.168.1.50')).toBe(false);
    const opts = deriveServeOptions('192.168.1.50');
    expect(opts.bindHost).toBe('0.0.0.0');
    expect(typeof opts.serveHost).toBe('string'); // guessed LAN IPv4 (or loopback fallback)
  });

  it('honors explicit serve-host / port / bind overrides', () => {
    const opts = deriveServeOptions('192.168.1.50', {
      serveHost: '10.0.0.9',
      port: 8080,
      bindHost: '0.0.0.0',
    });
    expect(opts).toEqual({ bindHost: '0.0.0.0', port: 8080, serveHost: '10.0.0.9' });
  });
});
