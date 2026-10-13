import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import type { PlayoutFetchLike } from '@cg/shared-ipc';

/**
 * 🔴 `DESKTOP-APPS-01-B` B1.4 — **EVERY REQUEST THE BRIDGE MAKES TO THE PLAYOUT GOES THROUGH HERE:
 * server-side, no `Origin`, no proxy — and (`-01-C` C6) over ONE IPv4 address.**
 *
 * A Playout 2.8.54 lets this machine's AMCP in after a SERVER-SIDE D9 read (it carries no
 * `Origin`; a browser always sends one) by a `station-admin`, and it admits the ADDRESS that read
 * came from (`X-Forwarded-For` is not honoured). So three properties decide whether this station
 * ever reaches CasparCG, and none of them is hygiene:
 *
 *   1. no `Origin` — a request carrying one is a browser's, and introduces nothing;
 *   2. no proxy — a read that leaves through one introduces the proxy. Measured 2026-09-23: with
 *      `NODE_USE_ENV_PROXY=1` and `HTTP_PROXY` set, Node's own `fetch` (and `jose`'s key-set read,
 *      which uses it) went to the proxy, on Node 26 here and on CI's Node 22. `node:http` with an
 *      agent of our own never consults those variables: only the GLOBAL agents are made
 *      proxy-aware by them;
 *   3. ONE IPv4 — the D9 read must come from the same address AMCP comes from. A Playout name
 *      that resolves to IPv6 as well would introduce this machine's IPv6 address while AMCP
 *      arrives over IPv4. So a Playout host is resolved ONCE to an IPv4 literal
 *      ({@link pinnedIPv4}) and every request — and the AMCP session (`CasparRuntime`) — connects
 *      to that literal, with the name kept in the `Host` header.
 *
 * It answers with a WHATWG `Response`, so it drops in wherever `fetch` was: the D4 reader, the D9
 * poll, and `jose`'s remote key set (its `customFetch` hook). It follows no redirect.
 */

/** Our own agents: never the proxy-aware globals. No keep-alive — a read is one per 30–60 s. */
const PLAIN_HTTP = new http.Agent();
const PLAIN_HTTPS = new https.Agent();

/** The agent every Playout-bound request uses — also the connection check's, so it probes this path. */
export function plainAgentFor(url: URL): http.Agent {
  return url.protocol === 'https:' ? PLAIN_HTTPS : PLAIN_HTTP;
}

/** Host name → its one IPv4 literal (or `null`: it has none). Resolved once per process. */
const PINNED = new Map<string, Promise<string | null>>();

/**
 * 🔴 `DESKTOP-APPS-01-C` C6 — **A PLAYOUT HOST'S ONE IPv4 ADDRESS, RESOLVED ONCE.**
 *
 * An IPv4 literal passes through untouched, without a lookup. A name is looked up for IPv4 ONLY,
 * the first time it is asked for, and the answer (the first address, or `null` when the name has
 * no IPv4 address at all) stands for the life of the process — so the D9 read, every other read
 * and the AMCP session can never pick different addresses. A failed lookup is not remembered.
 */
export function pinnedIPv4(host: string): Promise<string | null> {
  const bare = host.replace(/^\[|\]$/g, '');
  if (net.isIPv4(bare)) return Promise.resolve(bare);
  if (net.isIPv6(bare)) return Promise.resolve(null);
  const key = bare.toLowerCase();
  const held = PINNED.get(key);
  if (held !== undefined) return held;
  const lookup = dns.promises
    .lookup(key, { family: 4 })
    .then(({ address }) => address)
    .catch((err: NodeJS.ErrnoException) => {
      // "No IPv4 address" is an answer; a lookup that could not run is not, and is asked again.
      if (err.code === 'ENOTFOUND' || err.code === 'ENODATA') return null;
      PINNED.delete(key);
      throw err;
    });
  PINNED.set(key, lookup);
  return lookup;
}

/** A Playout-bound request that could not be made, with the reason the connection check words. */
export class PlayoutRequestError extends Error {
  override readonly name = 'PlayoutRequestError';
  constructor(
    readonly code: 'NO_IPV4' | 'CONNECT_TIMEOUT' | 'ECONNREFUSED' | 'FAILED',
    message: string,
  ) {
    super(message);
  }
}

/** Statuses whose response may not carry a body (the `Response` constructor refuses one). */
const NULL_BODY = new Set([204, 205, 304]);

export interface PlayoutFetchInit extends RequestInit {
  /**
   * `DESKTOP-APPS-01-C` C2 — give up on a connection that has not opened within this many ms
   * (`CONNECT_TIMEOUT`). The connection check sets it; the background reads rely on their signal.
   */
  readonly connectTimeoutMs?: number;
}

/**
 * `CENTRAL-BRIDGE-01` (D7) — {@link playoutFetch} as `@cg/shared-ipc`'s D1/D2 calls it. That package
 * is built with no DOM library, so the timeout's `AbortSignal` rides on the init outside its type
 * (see `PlayoutFetchLike`); this is where the real type is known.
 *
 * `CENTRAL-BRIDGE-01-A` — with a CONNECT bound ({@link SESSION_CONNECT_TIMEOUT_MS}), so a request that
 * never reached the Playout fails as `CONNECT_TIMEOUT` (never sent) rather than as the caller's own
 * overall timeout (which cannot tell "never sent" from "sent, answer lost").
 */
export const playoutFetchForSession: PlayoutFetchLike = (url, init) => {
  const { signal } = init as { signal?: AbortSignal };
  return playoutFetch(url, {
    method: init.method,
    headers: init.headers,
    body: init.body,
    connectTimeoutMs: SESSION_CONNECT_TIMEOUT_MS,
    ...(signal !== undefined ? { signal } : {}),
  });
};

/** How long the bridge's own D1/D2 wait for a connection to OPEN. */
export const SESSION_CONNECT_TIMEOUT_MS = 5_000;

/**
 * `CENTRAL-BRIDGE-01-A` — did this request fail before it could reach the Playout? A refresh token
 * that was never sent cannot have been used, so it may be sent again; every other failure is one
 * whose token may have been used.
 */
export function neverReachedPlayout(err: unknown): boolean {
  return (
    err instanceof PlayoutRequestError &&
    (err.code === 'ECONNREFUSED' || err.code === 'NO_IPV4' || err.code === 'CONNECT_TIMEOUT')
  );
}

export async function playoutFetch(
  input: string | URL | Request,
  init: PlayoutFetchInit = {},
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
  /*
    `CENTRAL-BRIDGE-01` (D7) — a STRING body is sent, with its length. Every request this made before
    was a GET read and it wrote no body at all, so the bridge's own D1/D2 (a JSON POST) reached the
    Playout empty and was refused as a wrong password. Any other body kind is refused rather than
    silently dropped the same way.
  */
  const body = init.body ?? null;
  if (body !== null && typeof body !== 'string') {
    throw new PlayoutRequestError('FAILED', 'only a text body can be sent to the Playout');
  }
  if (body !== null) headers['content-length'] = String(Buffer.byteLength(body, 'utf8'));
  const ip = await pinnedIPv4(url.hostname).catch(() => null);
  if (ip === null) {
    throw new PlayoutRequestError('NO_IPV4', `${url.hostname} has no IPv4 address`);
  }
  const https_ = url.protocol === 'https:';
  const bareHost = url.hostname.replace(/^\[|\]$/g, '');
  return new Promise<Response>((resolve, reject) => {
    if (signal?.aborted === true) {
      reject(signal.reason);
      return;
    }
    const lib = https_ ? https : http;
    const req = lib.request(
      {
        protocol: url.protocol,
        hostname: ip,
        port: url.port === '' ? (https_ ? 443 : 80) : Number(url.port),
        path: `${url.pathname}${url.search}`,
        method: init.method ?? 'GET',
        // The NAME the operator typed stays in `Host`; only the connection is pinned.
        headers: { ...headers, host: url.host },
        agent: plainAgentFor(url),
        ...(https_ && !net.isIP(bareHost) ? { servername: bareHost } : {}),
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('error', reject);
        res.on('end', () => {
          const status = res.statusCode ?? 0;
          if (status < 200 || status > 599) {
            reject(
              new PlayoutRequestError('FAILED', `the Playout answered status ${String(status)}`),
            );
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
    if (init.connectTimeoutMs !== undefined) {
      const bound = init.connectTimeoutMs;
      req.on('socket', (socket) => {
        if (!socket.connecting) return;
        const timer = setTimeout(() => {
          req.destroy(new PlayoutRequestError('CONNECT_TIMEOUT', 'no answer'));
        }, bound);
        socket.once('connect', () => clearTimeout(timer));
        socket.once('close', () => clearTimeout(timer));
      });
    }
    // The signal's own reason (a `TimeoutError` for `AbortSignal.timeout`) is what rejects, as
    // `fetch` does — `jose` tells its key-set timeout apart by it.
    const onAbort = (): void => {
      req.destroy(signal?.reason instanceof Error ? signal.reason : new Error('aborted'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    req.on('close', () => signal?.removeEventListener('abort', onAbort));
    req.on('error', (err: NodeJS.ErrnoException) => {
      if (err instanceof PlayoutRequestError) reject(err);
      else if (err.code === 'ECONNREFUSED')
        reject(new PlayoutRequestError('ECONNREFUSED', err.message));
      else if (err.code === 'ETIMEDOUT')
        reject(new PlayoutRequestError('CONNECT_TIMEOUT', err.message));
      else reject(err);
    });
    if (body !== null) req.end(body, 'utf8');
    else req.end();
  });
}
