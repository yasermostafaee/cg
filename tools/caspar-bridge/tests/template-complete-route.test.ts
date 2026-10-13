import * as http from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TEMPLATE_COMPLETE_PATH } from '@cg/shared-schema';
import { TemplateHttpServer } from '../src/template-http-server.js';

/**
 * 🔴 `SELF-STOP-24` §2.2 — **THE RECEIPT, AND EVERYTHING IT REFUSES.**
 *
 * This route is the only inbound surface the template HTTP server has ever had. Until now that
 * server answered `GET /template/<id>` and nothing else — no control surface at all, which is
 * why the `B-229` console lock never needed to reach it. So the refusals below are not
 * housekeeping; they are the whole of the server's new attack surface, and each is pinned.
 *
 * ⚠ **It is reachable from the LAN whenever a remote CasparCG forces a routable bind.** That is
 * why a valid token buys exactly one thing — a stop on the row it names — and why every other
 * shape answers `404` having touched nothing. There is no read, no enumeration and no second
 * verb here to find.
 *
 * ⚠ **`404`, not `400`.** A wrong shape and an unknown token are the same answer as an unknown
 * template id already is: the route declines to distinguish "you asked badly" from "that does
 * not exist", because the difference is only useful to somebody probing it.
 */

let server: TemplateHttpServer | null = null;

afterEach(async () => {
  await server?.stop();
  server = null;
});

interface Result {
  status: number;
  body: string;
}

function request(
  port: number,
  method: string,
  path: string,
  body?: string,
  headers: Record<string, string> = {},
): Promise<Result> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path, headers }, (res) => {
      let text = '';
      res.setEncoding('utf-8');
      res.on('data', (c: string) => (text += c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: text }));
    });
    req.on('error', reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

const post = (port: number, body: string): Promise<Result> =>
  request(port, 'POST', TEMPLATE_COMPLETE_PATH, body, {
    'content-type': 'application/json',
    'content-length': String(Buffer.byteLength(body)),
  });

/** Start a server whose completion handler accepts exactly `live`. */
async function serve(live: string | null): Promise<{
  port: number;
  seen: string[];
  handler: ReturnType<typeof vi.fn>;
}> {
  const seen: string[] = [];
  const handler = vi.fn((take: string) => {
    seen.push(take);
    return take === live;
  });
  server = new TemplateHttpServer(() => '<html>t</html>', handler);
  await server.start({ bindHost: '127.0.0.1', port: 0, serveHost: '127.0.0.1' });
  return { port: server.port, seen, handler };
}

describe('SELF-STOP-24 §2.2 — the completion route', () => {
  it('accepts a POST naming a live take', async () => {
    const { port, seen } = await serve('tok-live');

    const res = await post(port, JSON.stringify({ take: 'tok-live' }));

    expect(res.status).toBe(204);
    expect(seen).toEqual(['tok-live']);
  });

  it('404s a GET on the same path, and never reaches the handler', async () => {
    const { port, handler } = await serve('tok-live');

    const res = await request(port, 'GET', TEMPLATE_COMPLETE_PATH);

    expect(res.status).toBe(404);
    expect(handler, 'a GET reached the stop path').not.toHaveBeenCalled();
  });

  it('404s a body that is not JSON', async () => {
    const { port, handler } = await serve('tok-live');

    const res = await post(port, 'tok-live');

    expect(res.status).toBe(404);
    expect(handler).not.toHaveBeenCalled();
  });

  it('404s JSON that carries no token', async () => {
    const { port, handler } = await serve('tok-live');

    expect((await post(port, JSON.stringify({}))).status).toBe(404);
    expect((await post(port, JSON.stringify({ take: '' }))).status).toBe(404);
    expect((await post(port, JSON.stringify({ take: 7 }))).status).toBe(404);
    expect((await post(port, JSON.stringify([1, 2, 3]))).status).toBe(404);
    expect((await post(port, JSON.stringify(null))).status).toBe(404);
    expect(handler, 'a token-less body reached the stop path').not.toHaveBeenCalled();
  });

  it('404s a token that names no live take — the handler is asked, and its NO is honoured', async () => {
    const { port, seen } = await serve('tok-live');

    const res = await post(port, JSON.stringify({ take: 'tok-stale' }));

    expect(res.status).toBe(404);
    expect(seen, 'the handler was not consulted at all').toEqual(['tok-stale']);
  });

  it('refuses an oversized body without accumulating it', async () => {
    // A token is ~32 characters, so a report is ~45 bytes. Anything appreciably larger is not
    // one, and STORING it to find that out is the exposure — this route answers on an interface
    // that is routable whenever a remote CasparCG is configured. The bound is on the buffer, not
    // on the socket: past it the rest is read and discarded in constant space, and the 404 still
    // arrives. Resetting the connection instead would race the answer down the same socket.
    const { port, handler } = await serve('tok-live');

    const res = await post(port, JSON.stringify({ take: 'x'.repeat(64 * 1024) }));

    expect(res.status).toBe(404);
    expect(handler).not.toHaveBeenCalled();
  });

  it('leaves GET /template/<id> exactly as it was', async () => {
    const { port } = await serve('tok-live');

    const res = await request(port, 'GET', '/template/t1');

    expect(res.status).toBe(200);
    expect(res.body).toBe('<html>t</html>');
  });

  it('a server with NO completion handler 404s the route and still serves templates', async () => {
    // Every existing construction site passes one argument. The route must not exist for them
    // rather than exist and throw.
    server = new TemplateHttpServer(() => '<html>t</html>');
    await server.start({ bindHost: '127.0.0.1', port: 0, serveHost: '127.0.0.1' });

    expect((await post(server.port, JSON.stringify({ take: 'anything' }))).status).toBe(404);
    expect((await request(server.port, 'GET', '/template/t1')).status).toBe(200);
  });

  it('a THROWING handler answers 404 rather than hanging the connection', async () => {
    // The page never reads the answer, but a socket left open is a socket `stop()` waits on.
    const handler = vi.fn(() => {
      throw new Error('bridge is mid-teardown');
    });
    server = new TemplateHttpServer(() => '<html>t</html>', handler);
    await server.start({ bindHost: '127.0.0.1', port: 0, serveHost: '127.0.0.1' });

    const res = await post(server.port, JSON.stringify({ take: 'tok-live' }));

    expect(res.status).toBe(404);
  });
});
