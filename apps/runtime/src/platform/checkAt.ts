import {
  BridgeCapabilitiesChannel,
  CONNECTION_CHECK_CONNECT_MS,
  NOT_A_PLAYOUT_ADDRESS,
  normalisePlayoutAddress,
  parseWsFrame,
  serializeWsFrame,
  SetupCheckChannel,
  splitHostPort,
  type ChannelResponse,
  type ConnectionCheckRequest,
  type ConnectionCheckResult,
} from '@cg/shared-ipc';

import { bridgeHostPort, bridgeUrlForStation } from './bridgeUrl.js';

type BridgeCapabilities = ChannelResponse<typeof BridgeCapabilitiesChannel>;

/**
 * 🔴 `B-317` (`RELEASE-0114-01` A3/A4) — **THE CHECK RUNS WHERE `Connect` WILL GO.**
 *
 * The owner's `0.11.3`: `setup.check` rode the socket the console was already on — `.111`'s CG Bridge —
 * so a typed `127.0.0.1` was checked as `.111`'s own loopback, every line described `.111`, and `Connect`
 * then dialled `127.0.0.1:5280` on his PC, where nothing listens. Now a check whose CG Bridge is not the
 * one the console is on runs on a socket of its own, to THAT CG Bridge: open, (its token, when this
 * console holds one), `bridge.capabilities`, `setup.check`, close. The console's own socket is never
 * retargeted by a check.
 *
 * CG Bridge that does not open within the check's connect bound is {@link BridgeNotAnsweringError} — the
 * operator's sentence, never the console's refusal of a command.
 */

/** The slice of `WebSocket` this uses (the runtime's own `WebSocketLike`, restated so tests can fake it). */
export interface CheckSocket {
  readonly readyState: number;
  send(data: string): void;
  close(): void;
  addEventListener(type: 'open' | 'close' | 'error', listener: () => void): void;
  addEventListener(type: 'message', listener: (ev: { data: unknown }) => void): void;
}

/** `B-317` — no CG Bridge answered at the address the check resolved: said in the operator's words. */
export class BridgeNotAnsweringError extends Error {
  constructor(readonly address: string) {
    super(`CG Bridge is not answering at ${address}.`);
    this.name = 'BridgeNotAnsweringError';
  }
}

/** What a check on CG Bridge's own socket brought back. */
export interface CheckedAt {
  readonly result: ConnectionCheckResult;
  /** CG Bridge's capabilities as it answered them; `null` — it did not say. */
  readonly capabilities: BridgeCapabilities | null;
}

const isLoopback = (host: string): boolean => {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '');
  return h === 'localhost' || h === '::1' || /^127\./.test(h);
};

/**
 * 🔴 `B-317` — **ASK BY CG BRIDGE'S OWN NAME FOR ITS PLAYOUT.** CG Bridge set up on the Playout's own
 * machine names its Playout by loopback (`http://127.0.0.1:8080`), and before a sign-in it checks only that
 * address (its narrowing, unchanged). A console on another PC types the Playout's real address — the same
 * host it dials CG Bridge at. When the typed host IS that host and CG Bridge's own Playout is loopback on
 * the same scheme and port, it is the same Playout seen from CG Bridge's machine: ask for it by CG Bridge's
 * name. Anything else is asked as typed.
 */
export function playoutAsBridgeNamesIt(
  typed: string,
  bridgeHost: string,
  bridgeSignInUrl: string | null | undefined,
): string {
  const normal = normalisePlayoutAddress(typed);
  if (normal === null || bridgeSignInUrl === null || bridgeSignInUrl === undefined) return typed;
  try {
    const mine = new URL(normal);
    const its = new URL(bridgeSignInUrl);
    const same =
      mine.hostname.replace(/^\[|\]$/g, '').toLowerCase() ===
        bridgeHost.replace(/^\[|\]$/g, '').toLowerCase() &&
      isLoopback(its.hostname) &&
      mine.protocol === its.protocol &&
      mine.port === its.port;
    return same ? its.origin : typed;
  } catch {
    return typed;
  }
}

/** The `/health` problems that are about CG Bridge's OWN ports (`R-090`). */
const PORT_PROBLEMS = new Set(['port-refused', 'reserved-port']);

/**
 * 🔴 `R-090` — **WHAT CG BRIDGE SAYS ABOUT ITS OWN PORTS**, read off its `/health` (no credentials;
 * `access-control-allow-origin: *`): a port it cannot open and what holds it. Empty when `/health` does
 * not answer within the bound — never a verdict of "all clear" written as a line.
 */
export async function bridgePortProblems(
  url: string,
  fetchImpl:
    | ((input: string, init: { signal: AbortSignal }) => Promise<{ json(): Promise<unknown> }>)
    | undefined = (
    globalThis as {
      fetch?: (
        input: string,
        init: { signal: AbortSignal },
      ) => Promise<{ json(): Promise<unknown> }>;
    }
  ).fetch,
  timeoutMs = 2000,
): Promise<{ code: string; message: string }[]> {
  if (fetchImpl === undefined) return [];
  const health = `${url.replace(/^ws(s?):\/\//i, 'http$1://').replace(/\/+$/, '')}/health`;
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeoutMs);
  try {
    const body = (await (await fetchImpl(health, { signal: abort.signal })).json()) as {
      problems?: unknown;
    };
    if (!Array.isArray(body.problems)) return [];
    return body.problems.flatMap((p: unknown) => {
      const { code, message } = (p ?? {}) as { code?: unknown; message?: unknown };
      return typeof code === 'string' && typeof message === 'string' && PORT_PROBLEMS.has(code)
        ? [{ code, message }]
        : [];
    });
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 🔴 `B-317` — **DOES CG BRIDGE ANSWER WHERE THE ADDRESS GATE WOULD SEND THIS CONSOLE?** The gate (no
 * station yet, so no socket) saved whatever was typed and restarted; the owner's `192.168.111` became
 * `192.168.0.111` and a NOT CONNECTED he could only escape by setting up again. Now Connect asks CG
 * Bridge's `/health` at the resolved address first (no credentials; `cors: *`), within the check's
 * connect bound. `null` — CG Bridge answered; else the operator's sentence naming where.
 */
export async function bridgeAnswersAt(
  bridgeUrl: string,
  address: string,
  fetchImpl:
    | ((input: string, init: { signal: AbortSignal }) => Promise<{ json(): Promise<unknown> }>)
    | undefined = (
    globalThis as {
      fetch?: (
        input: string,
        init: { signal: AbortSignal },
      ) => Promise<{ json(): Promise<unknown> }>;
    }
  ).fetch,
  timeoutMs = CONNECTION_CHECK_CONNECT_MS,
): Promise<string | null> {
  const silent = new BridgeNotAnsweringError(address).message;
  if (fetchImpl === undefined) return silent;
  const health = `${bridgeUrl.replace(/^ws(s?):\/\//i, 'http$1://').replace(/\/+$/, '')}/health`;
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeoutMs);
  try {
    const body = (await (await fetchImpl(health, { signal: abort.signal })).json()) as {
      app?: unknown;
    };
    return body.app === 'cg-bridge' ? null : silent;
  } catch {
    return silent;
  } finally {
    clearTimeout(timer);
  }
}

/** {@link bridgeAnswersAt} for a station record, resolved by the one rule Connect connects by. */
export function stationBridgeAnswers(station: {
  readonly playoutAddress: string;
  readonly bridgeAddress?: string;
}): Promise<string | null> {
  const url = bridgeUrlForStation(station);
  return url === null
    ? Promise.resolve(NOT_A_PLAYOUT_ADDRESS)
    : bridgeAnswersAt(url, bridgeHostPort(url));
}

/** The host of a `ws://host:port` URL, from its text. */
export function hostOfBridgeUrl(url: string): string {
  const authority = url.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').split(/[/?#]/, 1)[0] ?? '';
  return splitHostPort(authority)?.host.replace(/^\[|\]$/g, '') ?? '';
}

export async function checkOnItsOwnSocket(options: {
  readonly url: string;
  /** `host:port`, as the not-answering sentence names it. */
  readonly address: string;
  readonly request: ConnectionCheckRequest;
  readonly createSocket: (url: string) => CheckSocket;
  /** This console's token, presented first so a signed-in check is not narrowed; `null` — none. */
  readonly token: string | null;
  readonly waitMs: number;
  /** TEST-ONLY — the connect bound, the check's own by default. */
  readonly connectMs?: number;
}): Promise<CheckedAt> {
  const { url, address } = options;
  const ws = options.createSocket(url);
  const pending = new Map<
    string,
    (frame: { payload?: unknown; error?: { message: string } | undefined }) => void
  >();
  let nextId = 0;
  let closed = false;
  const opened = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new BridgeNotAnsweringError(address)),
      options.connectMs ?? CONNECTION_CHECK_CONNECT_MS,
    );
    ws.addEventListener('open', () => {
      clearTimeout(timer);
      resolve();
    });
    const down = (): void => {
      clearTimeout(timer);
      closed = true;
      reject(new BridgeNotAnsweringError(address));
      for (const [, answer] of pending)
        answer({ error: { message: `CG Bridge at ${address} closed the connection.` } });
      pending.clear();
    };
    ws.addEventListener('close', down);
    ws.addEventListener('error', down);
  });
  ws.addEventListener('message', (ev) => {
    const frame = parseWsFrame(typeof ev.data === 'string' ? ev.data : String(ev.data));
    if (frame?.type !== 'response') return;
    const answer = pending.get(frame.id);
    if (answer === undefined) return;
    pending.delete(frame.id);
    answer(frame);
  });
  const ask = (
    frame: { type: 'request'; channel: string; payload: unknown } | { type: 'auth'; token: string },
    waitMs: number,
  ): Promise<unknown> =>
    new Promise((resolve, reject) => {
      if (closed) {
        reject(new BridgeNotAnsweringError(address));
        return;
      }
      const id = String(++nextId);
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new BridgeNotAnsweringError(address));
      }, waitMs);
      pending.set(id, (answer) => {
        clearTimeout(timer);
        if (answer.error !== undefined) reject(new Error(answer.error.message));
        else resolve(answer.payload);
      });
      ws.send(serializeWsFrame({ ...frame, id }));
    });
  try {
    await opened;
    if (options.token !== null) {
      // A refused token only narrows the check; it never stops it.
      await ask({ type: 'auth', token: options.token }, options.waitMs).catch(() => undefined);
    }
    const capabilities = await ask(
      { type: 'request', channel: BridgeCapabilitiesChannel.name, payload: {} },
      options.waitMs,
    )
      .then((raw) => BridgeCapabilitiesChannel.response.parse(raw))
      .catch((err: unknown) => {
        if (err instanceof BridgeNotAnsweringError) throw err;
        return null;
      });
    const request = {
      ...options.request,
      playoutAddress: playoutAsBridgeNamesIt(
        options.request.playoutAddress,
        hostOfBridgeUrl(url),
        capabilities?.signInUrl,
      ),
    };
    const raw = await ask(
      {
        type: 'request',
        channel: SetupCheckChannel.name,
        payload: SetupCheckChannel.request.parse(request),
      },
      options.waitMs,
    );
    return { result: SetupCheckChannel.response.parse(raw), capabilities };
  } finally {
    closed = true;
    ws.close();
  }
}
