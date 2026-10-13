import * as http from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { TEMPLATE_COMPLETE_PATH } from '@cg/shared-schema';
import { DEFAULT_BRIDGE_PORT } from '@cg/shared-ipc';
import {
  TemplateHttpServer,
  TEMPLATE_SERVER_ROUTES,
  deriveServeOptions,
} from '../src/template-http-server.js';

/**
 * 🔴 `SELF-STOP-24 · REPLY 1` §R3 — **THE ORIGIN A TEMPLATE CAN REACH, AND EVERYTHING ON IT.**
 *
 * ── WHY THIS FILE IS A SECURITY TEST AND NOT A ROUTING TEST ───────────────────────────────
 *
 * The owner accepted `connect-src 'self'` on the served page (2026-09-16). `'self'` is an
 * ORIGIN, not a path: a template — untrusted code, by `SECURITY.md`'s own framing — can reach
 * **anything this server hosts**. So the route set is the boundary, and the boundary has to be
 * something a reader can see change.
 *
 * Two independent axes, because one of them can be edited by somebody who has not read the
 * other:
 *
 *  1. **THE TABLE** — `TEMPLATE_SERVER_ROUTES` is pinned by name. The router consults it and
 *     nothing else, so a new route cannot be served without appearing here first.
 *  2. **THE WIRE** — a real server is probed with the paths a control, identity or data route
 *     would plausibly land on. Every one must `404`.
 *
 * ── AND THE CONTROL SOCKET IS SOMEWHERE ELSE, WHICH IS WHAT MAKES `'self'` NARROW ─────────
 *
 * The control WebSocket is a different server on a different port (`DEFAULT_BRIDGE_PORT`,
 * bound in `bridge.ts`); this server's port defaults to `0` (ephemeral) and is never that.
 * Different port ⇒ different origin ⇒ `connect-src 'self'` cannot reach it. Asserted below so
 * that a future default that collapsed the two would fail here rather than on a plant.
 */

let server: TemplateHttpServer | null = null;

afterEach(async () => {
  await server?.stop();
  server = null;
});

function probe(port: number, method: string, path: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path }, (res) => {
      res.resume();
      res.on('end', () => resolve(res.statusCode ?? 0));
    });
    req.on('error', reject);
    req.end();
  });
}

async function serve(): Promise<number> {
  server = new TemplateHttpServer(
    (id) => (id === 't1' ? '<html>t1</html>' : null),
    () => false,
  );
  await server.start({ bindHost: '127.0.0.1', port: 0, serveHost: '127.0.0.1' });
  return server.port;
}

describe('REPLY 1 §R3 — the template server hosts exactly two routes', () => {
  it('🔴 the route table is EXACTLY these two, by name', () => {
    /*
      🔴 IF THIS FAILS, READ `SECURITY.md` BEFORE CHANGING THE EXPECTATION.

      A served template runs untrusted JavaScript and its CSP lets it reach THIS ORIGIN. Every
      route here is reachable by every template on every playout server. A control, identity or
      data route added to this server is a control, identity or data route handed to template
      authors — which is why `PLAYOUT-LINK-01`'s identity work belongs on the control socket's
      origin instead.

      Adding a route is not forbidden; adding one WITHOUT a decision is. Update this list only
      together with `SECURITY.md`'s statement of the rule.
    */
    expect(TEMPLATE_SERVER_ROUTES.map((r) => r.name)).toEqual([
      'GET /template/<id>',
      `POST ${TEMPLATE_COMPLETE_PATH}`,
    ]);
  });

  it('🔴 the table carries exactly TWO KINDS — a route class cannot be added silently', () => {
    /*
      🔴 `C-037` / ADR 0010 rule 13 — THE AXIS THE FORBIDDEN-PATH LIST CANNOT COVER.

      That list is a list of GUESSED addresses. A route added at a path nobody guessed —
      `/v1/sign-in`, `/keys`, `/whoami` — passes every probe in it and passes the name pin only
      until somebody reads the diff. The `kind` discriminant is the other axis: it is
      `'template' | 'complete'` in the TYPE, so an identity handler is already a type change;
      pinning the two values makes it a TEST change as well, and a test that names what is
      missing is what stops it being a decision nobody took.

      Two independent passes over one boundary — the rule golden rule 9 states for a sweep,
      applied to a guard.
    */
    expect([...TEMPLATE_SERVER_ROUTES.map((r) => r.kind)].sort()).toEqual(['complete', 'template']);
    // The positive control: the table is not empty, so the equality above is a real comparison.
    expect(TEMPLATE_SERVER_ROUTES.length).toBe(2);
  });

  it('each table entry declares one method, and no entry is a wildcard', () => {
    for (const route of TEMPLATE_SERVER_ROUTES) {
      expect(['GET', 'POST'], `${route.name} declares an unexpected method`).toContain(
        route.method,
      );
      // A matcher that accepts `/` accepts everything after it too — the shape a wildcard
      // route would have, and the one that would make the pin above meaningless.
      expect(route.match('/'), `${route.name} matches the root — it is a wildcard`).toBe(false);
      expect(route.match('/anything/at/all'), `${route.name} is too broad`).toBe(false);
    }
  });

  it('🔴 every plausible control / identity / data path 404s on the wire', async () => {
    const port = await serve();
    // The paths a future control, identity or data surface would most plausibly take. None of
    // them is served today and none may be served tomorrow without a decision.
    const forbidden = [
      '/',
      '/api',
      '/api/stack',
      '/health',
      '/status',
      '/identity',
      '/login',
      '/auth',
      '/token',
      '/ws',
      '/socket',
      '/config',
      '/audit',
      '/templates',
      '/template',
      '/template/',
      '/template/t1/extra',
      '/complete/anything',
      '/.env',
      /*
        🔴 `C-037` / ADR 0010 rule 13 — THE PATHS THE PLAYOUT ERA ACTUALLY LANDS ON.

        The list above was written before there was any identity work; these four are the
        addresses a JWT-era mistake takes. `/.well-known/jwks.json` is the one to watch: it is
        where a well-meaning change would put a key set "so the browser can check tokens too",
        and publishing anything on THIS origin publishes it to every template on every playout
        server.

        ⚠ They are GUESSED paths, which is why the `kind` pin below exists as well — a route
        at a path nobody guessed would pass every assertion in this list.
      */
      '/.well-known/jwks.json',
      '/.well-known/openid-configuration',
      '/api/cg/auth/token',
      '/signin',
    ];
    for (const path of forbidden) {
      expect(await probe(port, 'GET', path), `GET ${path} is served by the template origin`).toBe(
        404,
      );
      expect(await probe(port, 'POST', path), `POST ${path} is served by the template origin`).toBe(
        404,
      );
    }
  });

  it('the two real routes are reachable — so the 404s above are a refusal, not a dead server', async () => {
    // The positive control. Without it "everything 404s" is satisfied by a server that serves
    // nothing at all, and the test above would pass over a broken boundary.
    const port = await serve();
    expect(await probe(port, 'GET', '/template/t1')).toBe(200);
    // POST /complete reaches the handler; this fixture's handler says "no live take", so 404 —
    // the point is that it is ROUTED, which `template-complete-route.test.ts` proves in full.
    expect(await probe(port, 'GET', TEMPLATE_COMPLETE_PATH)).toBe(404);
  });

  it('a template cannot reach the control socket — it is a different origin', () => {
    // Same host, different PORT, so a different origin, so outside `connect-src 'self'`.
    // `deriveServeOptions` defaults to an ephemeral port and a real bind could never collide
    // with a listening `DEFAULT_BRIDGE_PORT` anyway (the second bind would fail).
    expect(deriveServeOptions(['127.0.0.1']).port).toBe(0);
    expect(deriveServeOptions(['127.0.0.1']).port).not.toBe(DEFAULT_BRIDGE_PORT);
  });
});
