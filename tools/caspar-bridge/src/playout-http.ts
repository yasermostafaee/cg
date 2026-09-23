import http from 'node:http';
import https from 'node:https';

/**
 * 🔴 `DESKTOP-APPS-01-B` B1.4 — **EVERY REQUEST THE BRIDGE MAKES TO THE PLAYOUT GOES THROUGH HERE:
 * server-side, no `Origin`, no proxy.**
 *
 * A Playout 2.8.54 opens AMCP to a machine when that machine's bridge reads D4, D8 or D9 with a
 * `station-admin` token — and only when the request is SERVER-SIDE (it carries no `Origin`; a
 * browser always sends one) and arrives from the machine's own address (`X-Forwarded-For` is not
 * honoured, so a proxy in the path trusts the proxy). So the two properties are not hygiene: a
 * request that carries an `Origin`, or leaves through a proxy, costs this station its AMCP.
 *
 * ⚠ **Why not the global `fetch`.** Measured 2026-09-23 on Node 26: `fetch` sends no `Origin`,
 * but with `NODE_USE_ENV_PROXY=1` and `HTTP_PROXY` in the environment it — and `jose`'s JWKS
 * read, which uses it — went to the proxy (`ECONNREFUSED` on a dead one) instead of the Playout.
 * An environment variable on the station's machine must not decide where this goes. `node:http`
 * with an agent of our own never consults those variables: only the GLOBAL agents are made
 * proxy-aware by them.
 *
 * It answers with a WHATWG `Response`, so it drops in wherever `fetch` was: the D4 reader, the D9
 * poll, and `jose`'s remote key set (through its `customFetch` hook). It follows no redirect —
 * `jose` asks for `redirect: 'manual'`, and neither D4 nor D9 redirects.
 */

/** Our own agents: never the proxy-aware globals. No keep-alive — a read is one per 30–60 s. */
const PLAIN_HTTP = new http.Agent();
const PLAIN_HTTPS = new https.Agent();

/** The agent every Playout-bound request uses — also the connection check's, so it probes this path. */
export function plainAgentFor(url: URL): http.Agent {
  return url.protocol === 'https:' ? PLAIN_HTTPS : PLAIN_HTTP;
}

/** Statuses whose response may not carry a body (the `Response` constructor refuses one). */
const NULL_BODY = new Set([204, 205, 304]);

export function playoutFetch(
  input: string | URL | Request,
  init: RequestInit = {},
): Promise<Response> {
  const url = new URL(
    typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
  );
  const headers: Record<string, string> = {};
  new Headers(init.headers).forEach((value, name) => {
    // Never an `Origin`, whoever asked for one: a request carrying it is a browser's to the Playout.
    if (name !== 'origin') headers[name] = value;
  });
  const signal = init.signal ?? null;
  return new Promise<Response>((resolve, reject) => {
    if (signal?.aborted === true) {
      reject(signal.reason);
      return;
    }
    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.request(
      url,
      { method: init.method ?? 'GET', headers, agent: plainAgentFor(url) },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('error', reject);
        res.on('end', () => {
          const status = res.statusCode ?? 0;
          if (status < 200 || status > 599) {
            reject(new Error(`the Playout answered status ${String(status)}`));
            return;
          }
          const out = new Headers();
          for (const [name, value] of Object.entries(res.headers)) {
            if (value === undefined) continue;
            for (const one of Array.isArray(value) ? value : [value]) out.append(name, one);
          }
          resolve(
            new Response(NULL_BODY.has(status) ? null : new Uint8Array(Buffer.concat(chunks)), {
              status,
              statusText: res.statusMessage ?? '',
              headers: out,
            }),
          );
        });
      },
    );
    const onAbort = (): void => {
      req.destroy(signal?.reason instanceof Error ? signal.reason : new Error('aborted'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    req.on('close', () => signal?.removeEventListener('abort', onAbort));
    req.on('error', reject);
    req.end();
  });
}
