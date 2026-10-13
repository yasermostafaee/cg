import {
  DEFAULT_BRIDGE_PORT,
  PLAYOUT_API_PORT,
  normaliseBridgeAddress,
  normalisePlayoutAddress,
  splitHostPort,
} from '@cg/shared-ipc';
import { hostError, portError } from '../../ui/fieldValue.js';

/**
 * 🔴 `SERVERS-SIMPLIFY-01` (T1, T5) — **AN ADDRESS IS A HOST AND A PORT, AND A PORT'S DEFAULT IS ITS
 * PLACEHOLDER.**
 *
 * The owner, 2026-10-10: one address to give (the Playout's), every address that needs a port gets its own
 * port field, and the default is shown as the field's placeholder. So an EMPTY port field IS the default —
 * what is saved is the default number — and a port field shows text only when it overrides.
 *
 * This is the ONE reading of those fields, for the two places they are asked: the Set up page
 * (`PlayoutAddressGate`) and the Connection card (`PlayoutConnection`). Pure: what is typed in, an address or a
 * fact out. The normalisations that decide what an address IS stay where they were (`@cg/shared-ipc`'s
 * `normalisePlayoutAddress` and `normaliseBridgeAddress`), and the sentences a field is wrong by stay in
 * `fieldValue.ts` — this file composes them, it never re-spells them.
 */

/** One address as its two fields. `port` is EMPTY while it is the default. */
export interface HostPort {
  readonly host: string;
  readonly port: string;
}

export const NO_HOST_PORT: HostPort = { host: '', port: '' };

/** The Set up questions: the Playout's address, and CG Bridge's when it is not on the Playout's machine. */
export interface StationFields {
  readonly playout: HostPort;
  readonly bridge: HostPort;
}

/** The Playout API's port, as its field's placeholder shows it. */
export const PLAYOUT_PORT_DEFAULT = String(PLAYOUT_API_PORT);
/** CG Bridge's port, as its field's placeholder shows it. */
export const BRIDGE_PORT_DEFAULT = String(DEFAULT_BRIDGE_PORT);

/** What a host field holds, read. `secure` — an `https://` address (the one scheme a field ever shows). */
interface Read {
  readonly secure: boolean;
  readonly host: string;
  readonly port: string;
}

const SCHEME = /^([a-z][a-z0-9+.-]*):\/\/(.*)$/i;

/**
 * A host field's text: a host, `host:port`, or an `http(s)://host:port` address (a trailing `/` allowed).
 * `null` — none of those (a path, a query, another scheme, a space).
 */
function readHostText(text: string): Read | null {
  const trimmed = text.trim().replace(/\/+$/, '');
  if (trimmed === '') return null;
  let secure = false;
  let authority = trimmed;
  const scheme = SCHEME.exec(trimmed);
  if (scheme !== null) {
    const name = (scheme[1] ?? '').toLowerCase();
    if (name !== 'http' && name !== 'https') return null;
    secure = name === 'https';
    authority = scheme[2] ?? '';
  }
  const parts = splitHostPort(authority);
  if (parts === null) return null;
  return { secure, host: parts.host, port: parts.port === null ? '' : String(parts.port) };
}

/**
 * 🔴 T1 — **A WHOLE ADDRESS IN A HOST FIELD FILLS BOTH FIELDS.** `http://192.168.21.32:8080` or
 * `192.168.21.32:8080` → `192.168.21.32` and `8080`. `null` when the text is not one address that carries a
 * scheme or a port, so a host is left exactly as it was typed.
 *
 * `http://` is the default and is never kept; `https://` is the one scheme a host field shows, because it is
 * the one that changes what is dialled.
 */
export function splitAddress(text: string): HostPort | null {
  const read = readHostText(text);
  if (read === null) return null;
  if (SCHEME.exec(text.trim()) === null && read.port === '') return null;
  return { host: read.secure ? `https://${read.host}` : read.host, port: read.port };
}

/**
 * A host field's change. A PASTE — more than one character arriving at once — of a whole address splits into
 * both fields; so does `http://` typed in front of a host, the moment there is a host after it. Anything else
 * is taken as it is: a person typing `192.168.21.32:` has not finished, and a field that moved his text under
 * his caret would be one he cannot type into.
 *
 * `web` — the field names a WEB address (the Playout's): a scheme is read. CG Bridge's address never has one
 * (`host` or `host:port`, `normaliseBridgeAddress`), so in its field a URL stays as it was typed and is
 * refused by its one sentence, never quietly turned into a host.
 */
export function hostFieldChange(previous: HostPort, host: string, web: boolean): HostPort {
  const pasted = host.length - previous.host.length > 1;
  const typedScheme = web && /^http:\/\/./i.test(host.trim());
  if (pasted || typedScheme) {
    const split = web || SCHEME.exec(host.trim()) === null ? splitAddress(host) : null;
    if (split !== null) return split;
  }
  return { ...previous, host };
}

/** The two fields read as ONE address: the host's own port when it carries one. `null` — not one address. */
function resolve(f: HostPort): Read | null {
  const read = readHostText(f.host);
  if (read === null) return null;
  const port = f.port.trim();
  if (port !== '' && !/^\d{1,5}$/.test(port)) return null;
  if (read.port !== '' && port !== '' && read.port !== port) return null;
  return { ...read, port: read.port !== '' ? read.port : port };
}

/** The Playout's address the two fields give, normalised (`http://host:8080`). `null` — empty, or not one. */
export function playoutAddressOf(f: HostPort): string | null {
  const read = resolve(f);
  if (read === null) return null;
  return normalisePlayoutAddress(
    `${read.secure ? 'https' : 'http'}://${read.host}${read.port === '' ? '' : `:${read.port}`}`,
  );
}

/** The host a normalised Playout address names (an IPv6 host keeps its brackets). */
export function playoutHostOf(address: string | null): string | null {
  if (address === null) return null;
  return readHostText(address)?.host ?? null;
}

/**
 * CG Bridge's address the two fields give, as this console's station record holds it:
 *
 *   - `''` — both empty: CG Bridge is on the Playout's machine, on its own port;
 *   - `host` or `host:port` — a separate server's (CG Bridge's own port, 5280, is never written out);
 *   - a port alone — CG Bridge on the Playout's host, on that port;
 *   - `null` — not an address.
 */
export function bridgeAddressOf(f: HostPort, playoutHost: string | null): string | null {
  const host = f.host.trim();
  const port = f.port.trim();
  if (host === '' && port === '') return '';
  if (host === '') {
    if (playoutHost === null || !/^\d{1,5}$/.test(port)) return null;
    return normaliseBridgeAddress(
      port === BRIDGE_PORT_DEFAULT ? playoutHost : `${playoutHost}:${port}`,
    );
  }
  // A scheme names a web address, never CG Bridge's.
  if (SCHEME.exec(host) !== null) return null;
  const read = resolve(f);
  if (read === null) return null;
  return normaliseBridgeAddress(
    read.port === '' || read.port === BRIDGE_PORT_DEFAULT ? read.host : `${read.host}:${read.port}`,
  );
}

/**
 * The Playout's two fields for an address this console holds — an ORIGIN as the bridge advertises it (`URL`'s
 * reading: an `http` origin with no port is on port 80), or a normalised address. The API's port reads as an
 * empty field.
 */
export function playoutFieldsOf(address: string | null): HostPort {
  if (address === null) return NO_HOST_PORT;
  const read = readHostText(address);
  if (read === null) return NO_HOST_PORT;
  const port = read.port !== '' ? read.port : read.secure ? '' : '80';
  return {
    host: read.secure ? `https://${read.host}` : read.host,
    port: !read.secure && port === PLAYOUT_PORT_DEFAULT ? '' : port,
  };
}

/** CG Bridge's two fields for the address this console keeps (`host` / `host:port`), or none. */
export function bridgeFieldsOf(address: string | null | undefined): HostPort {
  if (address === null || address === undefined || address.trim() === '') return NO_HOST_PORT;
  const parts = splitHostPort(address);
  if (parts === null) return { host: address, port: '' };
  const port = parts.port === null ? '' : String(parts.port);
  return { host: parts.host, port: port === BRIDGE_PORT_DEFAULT ? '' : port };
}

/** The fields for this console's station as it is: its Playout, and its CG Bridge address if it keeps one. */
export function stationFieldsOf(origin: string | null, bridge: string | null): StationFields {
  return { playout: playoutFieldsOf(origin), bridge: bridgeFieldsOf(bridge) };
}

/**
 * 🔴 `B-324` — **DO THE FIELDS SAY SOMETHING OTHER THAN THE STATION AS IT IS?** The one comparison, read by the
 * card (its `Connect` and its `Not connected yet`) and by Station setup (the rail's mark), so the two can never
 * disagree about whether there is anything to connect. Compared as ADDRESSES, so `192.168.21.32` and
 * `192.168.21.32:8080` are one value.
 */
export function stationFieldsChanged(
  fields: StationFields,
  origin: string | null,
  bridge: string | null,
): boolean {
  const saved = stationFieldsOf(origin, bridge);
  const playout = playoutAddressOf(fields.playout);
  const savedPlayout = playoutAddressOf(saved.playout);
  if (playout !== savedPlayout) return true;
  return (
    bridgeAddressOf(fields.bridge, playoutHostOf(playout)) !==
    bridgeAddressOf(saved.bridge, playoutHostOf(savedPlayout))
  );
}

/** `host : port` — an address as a FACT (T1): `192.168.21.32 : 8080`. */
export function addressFact(host: string, port: string): string {
  return `${host} : ${port}`;
}

/** The Playout's address as a fact, from its origin (an `http` origin with no port is on port 80). */
export function playoutFact(origin: string): string {
  const read = readHostText(origin);
  if (read === null) return origin;
  const port = read.port !== '' ? read.port : read.secure ? '443' : '80';
  return addressFact(read.secure ? `https://${read.host}` : read.host, port);
}

/** CG Bridge's `host:port` as a fact. */
export function bridgeFact(hostPort: string): string {
  const parts = splitHostPort(hostPort);
  return parts === null
    ? hostPort
    : addressFact(parts.host, String(parts.port ?? DEFAULT_BRIDGE_PORT));
}

/**
 * The sentence a host field is wrong by, or `null`: `fieldValue.ts`'s one rule, read past the `https://` a
 * Playout host may carry. Blank is legal here — whether an address is needed at all is the commit's question.
 */
export function hostFieldError(text: string): string | null {
  return hostError(text.trim().replace(/^https:\/\//i, ''), { label: 'Host', blankAllowed: true });
}

/** The sentence a port field is wrong by, or `null` (`fieldValue.ts`'s one rule; empty is the default). */
export function portFieldError(text: string): string | null {
  return portError(text, { min: 1, label: 'Port', blankAllowed: true });
}
