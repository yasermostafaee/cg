import { DEFAULT_BRIDGE_HOST, DEFAULT_BRIDGE_PORT } from '@cg/shared-ipc';

/**
 * `P-041` — THE ONE PLACE THE RUNTIME DECIDES WHERE ITS BRIDGE IS.
 *
 * The bridge's control WebSocket lives beside the page that was served: the machine that
 * runs `vite` (or `vite preview`) is the machine that runs `caspar-bridge`. So the page's
 * own origin is the only honest source for the bridge HOST. A page opened at
 * `http://192.168.21.93:5174` from a second machine must probe `ws://192.168.21.93:5280`;
 * the old constant `ws://127.0.0.1:5280` made it probe the SECOND machine's loopback
 * instead, and the app sat in DISCONNECTED with nothing wrong on the dev box. That defect
 * is invisible from the dev machine itself, where `localhost` and the LAN address are the
 * same box — which is why it survived: every test ran where it could not fail.
 *
 * Precedence, in one function:
 *
 *   1. `globalThis.__CG_BRIDGE_URL__` — the test harness's override. E2E pins a
 *      guaranteed-dead port so a real bridge on this machine cannot make a spec go live; the
 *      Node test pins an ephemeral real bridge. A non-empty string only.
 *   2. Derived from the page: `ws://<location.hostname>:<DEFAULT_BRIDGE_PORT>` — `wss:` when
 *      the page is `https:`, because a secure page refuses a plain `ws:` and the failure
 *      would read as "bridge down".
 *   3. `ws://<DEFAULT_BRIDGE_HOST>:<DEFAULT_BRIDGE_PORT>` when there is no usable location
 *      (Node tests, a `file:` page, an `about:` document): same box, loopback.
 *
 * Only the HOST follows the page. The PORT stays the bridge's documented default: it is a
 * property of the bridge process, not of where the page came from.
 *
 * ⚠ This is the module `cg/no-hardcoded-origin` exempts BY PATH (`configs/base.ts`). Every
 * other client module that spells a loopback/IPv4 host beside a scheme or a port, or imports
 * `DEFAULT_BRIDGE_HOST` / `DEFAULT_BRIDGE_WS_URL` from `@cg/shared-ipc`, fails lint — the
 * same shape as `cg/bank-shape`'s owner-file exemption (`P-039`).
 */

/** The two fields of `Location` the derivation reads, so a test can pass a plain object. */
export interface PageLocation {
  /** `location.protocol` — `'http:'`, `'https:'`, `'file:'`, … (with the trailing colon). */
  readonly protocol: string;
  /** `location.hostname` — no port; an IPv6 literal arrives already bracketed (`[::1]`). */
  readonly hostname: string;
}

/**
 * The bridge WebSocket URL for a page served from `location`. Pure: no globals, no I/O.
 * `undefined` (or an empty hostname) means "no page origin to follow" and yields loopback.
 */
export function bridgeUrlFor(location: PageLocation | undefined): string {
  const hostname = location?.hostname.trim() ?? '';
  const host = hostname.length > 0 ? hostname : DEFAULT_BRIDGE_HOST;
  const scheme = location?.protocol === 'https:' ? 'wss' : 'ws';
  return `${scheme}://${host}:${String(DEFAULT_BRIDGE_PORT)}`;
}

/**
 * The URL `createRuntimeBridge` probes: the harness override when armed, else the page's
 * own host with the bridge's default port, else loopback.
 */
export function resolveBridgeUrl(): string {
  const override = (globalThis as { __CG_BRIDGE_URL__?: unknown }).__CG_BRIDGE_URL__;
  if (typeof override === 'string' && override.length > 0) return override;
  return bridgeUrlFor(pageLocation());
}

/** `globalThis.location` when it looks like a `Location`; `undefined` in Node. */
function pageLocation(): PageLocation | undefined {
  const loc = (globalThis as { location?: Partial<PageLocation> }).location;
  if (loc === undefined || typeof loc.hostname !== 'string' || typeof loc.protocol !== 'string') {
    return undefined;
  }
  return { protocol: loc.protocol, hostname: loc.hostname };
}
