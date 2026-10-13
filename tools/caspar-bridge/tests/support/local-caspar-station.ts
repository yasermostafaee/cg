import { createHash } from 'node:crypto';
import net from 'node:net';
import type {
  FakeCatalogueRow,
  FakeMediaItem,
  FakePlayout,
  FakePlayoutOptions,
} from './fake-playout.js';

/**
 * 🔴 `DEV-LOCAL-CASPAR-01` — **THE FAKE PLAYOUT IN FRONT OF THIS MACHINE'S OWN CASPARCG.**
 * `pnpm dev:station --fake --caspar 127.0.0.1:5250` runs {@link startLocalCasparStation} (it loads this
 * file by path, as it loads `fake-station.ts`), and `local-caspar-station.integration.test.ts` drives
 * the same function against `@cg/amcp-mock` standing in for the core — so what the owner checks with
 * real video and what the suite proves are one composition.
 *
 * ── WHAT IT IS ───────────────────────────────────────────────────────────────────────
 *
 *   - NOTHING stands in for CasparCG: the bridge's AMCP and OSC go to the real core, which the bridge
 *     learns the way it learns any — first-run writes the host D4 names, on the standard ports.
 *   - The FAKE PLAYOUT stays in front (sign-in, D4, D10, D11), shaped from the core:
 *       D4  — the core's channels, from `INFO`, named `CH n · local`, `output: unknown`;
 *       D10 — empty: there are no real inputs to offer here;
 *       D11 — the core's library, from `CLS`: each entry's ABSOLUTE path under the media folder
 *             `INFO PATHS` names, and its length. Read at the start, and again when a D11 SEARCH
 *             arrives once 30 s have passed ({@link CLS_REREAD_MS}); an `ids=` read never waits on it.
 *   - No programme feed: the owner watches the core's own screen consumer.
 *
 * ── WHAT IT NEVER DOES ───────────────────────────────────────────────────────────────
 *
 *   - It reaches ONE machine, this one. {@link parseCasparTarget} refuses every other host, and the
 *     test Playout (`.111`) and the plant (`.114`) by name.
 *   - It SENDS five commands and nothing else, every one a read ({@link LOCAL_CASPAR_READS}). The
 *     bridge's own send guard (`amcp-guard.ts`) is untouched: layers 50–99 only, and never a
 *     `CLEAR <ch>`, a `SET MODE` or a consumer `ADD`/`REMOVE`.
 *   - It writes no file (it imports no file API), so nothing lands in the core's folder.
 *
 * ⚠ **DEV-ONLY, AND NEVER IN THE INSTALLER.** It lives under `tests/`, which `tsc -b` never builds and
 * CG Bridge's bundle (`scripts/bundle.mjs`) never reaches; `bundle-service.test.ts` reads the bundle
 * the installer ships and asserts {@link LOCAL_CASPAR_MARKER} is not in it.
 *
 * ⚠ Only TYPE imports of its siblings, for the reason `fake-station.ts` gives: Node's type stripping
 * rewrites no `.js` specifier to a `.ts` file. The fake Playout arrives as an argument.
 */

/** A string only this module carries — the installer bundle test's subject. */
export const LOCAL_CASPAR_MARKER = 'cg-dev-local-caspar-dev-only';

// ── THE TARGET: THIS MACHINE, AND ONLY THIS MACHINE ──────────────────────────────────────────

/**
 * The one address this mode dials, whichever loopback spelling was given. A 2.5.0 core listens for
 * AMCP on IPv4 only (`src/protocol/util/AsyncEventServer.cpp:285`, `tcp::endpoint(tcp::v4(), port)`),
 * and the bridge rewrites no loopback `casparHost` when the Playout is itself on loopback
 * (`resolveCasparHost`) — so a D4 row saying `::1` would send first-run to an address the core never
 * answers. Every accepted spelling therefore becomes this one.
 */
export const LOCAL_CASPAR_HOST = '127.0.0.1';

/**
 * The only port this mode can use: first-run writes CasparCG's standard AMCP port whatever D4 lists
 * (`firstRunStation.ts` `AMCP_PORT`), so a core anywhere else would never be the one the bridge dials.
 */
export const LOCAL_CASPAR_PORT = 5250;

/** The three spellings of this machine the flag accepts. */
export const LOCAL_CASPAR_SPELLINGS: readonly string[] = ['127.0.0.1', '::1', 'localhost'];

/** Where the local core is — always this machine. */
export interface LocalCasparTarget {
  readonly host: typeof LOCAL_CASPAR_HOST;
  readonly port: number;
}

/** The two plant machines this mode refuses BY NAME. */
const PLANT_HOSTS: ReadonlyMap<string, string> = new Map([
  ['192.168.21.111', "the test Playout's machine"],
  ['192.168.21.114', "the plant's CasparCG"],
]);

const TAKES = `--caspar takes this machine's CasparCG only: ${LOCAL_CASPAR_HOST}:${String(LOCAL_CASPAR_PORT)}`;

/**
 * What was typed, safe to echo in ONE line: anything a terminal may break a line on — a C0 or C1 control
 * (a pasted newline; NEL, U+0085), DEL, or a Unicode line or paragraph separator (U+2028, U+2029) —
 * shows as `?`.
 */
function echo(typed: string): string {
  return [...typed]
    .map((c) => {
      const code = c.charCodeAt(0);
      const breaks =
        code < 0x20 || (code >= 0x7f && code <= 0x9f) || code === 0x2028 || code === 0x2029;
      return breaks ? '?' : c;
    })
    .join('');
}

/**
 * 🔴 **THE LOOPBACK RULE** — the ONE reading of `--caspar <host:port>`. `127.0.0.1`, `::1` (`[::1]`
 * with a port) and `localhost` are accepted, each as {@link LOCAL_CASPAR_HOST}; `.111` and `.114` are
 * refused by name; every other host is refused; the port is {@link LOCAL_CASPAR_PORT} or absent.
 * Each refusal is one line. Nothing is resolved — a name is never this machine but `localhost`.
 */
export function parseCasparTarget(text: string): LocalCasparTarget | { readonly error: string } {
  const given = text.trim();
  if (given === '' || given.includes('/')) {
    return {
      error: `--caspar takes host:port — ${LOCAL_CASPAR_HOST}:${String(LOCAL_CASPAR_PORT)}.`,
    };
  }
  let host: string;
  let portText: string | undefined;
  const bracketed = /^\[([^\]]*)\](?::(.*))?$/.exec(given);
  if (bracketed !== null) {
    host = bracketed[1] ?? '';
    portText = bracketed[2];
  } else if (given.split(':').length > 2) {
    // An IPv6 address without brackets: its last group cannot be told from a port.
    if (given.toLowerCase() !== '::1') {
      return {
        error: `${echo(given)}: write an IPv6 address in brackets, as [::1]:${String(LOCAL_CASPAR_PORT)}.`,
      };
    }
    host = given;
    portText = undefined;
  } else {
    const colon = given.indexOf(':');
    host = colon === -1 ? given : given.slice(0, colon);
    portText = colon === -1 ? undefined : given.slice(colon + 1);
  }
  const lower = host.toLowerCase();
  const plant = PLANT_HOSTS.get(lower);
  if (plant !== undefined) {
    return { error: `${lower} is ${plant} — --caspar never connects there. ${TAKES}.` };
  }
  if (!LOCAL_CASPAR_SPELLINGS.includes(lower)) {
    return { error: `${echo(host)} is not this machine — ${TAKES} (127.0.0.1, ::1 or localhost).` };
  }
  if (portText === undefined) return { host: LOCAL_CASPAR_HOST, port: LOCAL_CASPAR_PORT };
  if (!/^\d{1,5}$/.test(portText)) {
    return {
      error: `${portText === '' ? 'An empty port' : echo(portText)} is not a port — ${TAKES}.`,
    };
  }
  if (Number(portText) !== LOCAL_CASPAR_PORT) {
    return {
      error:
        `--caspar takes port ${String(LOCAL_CASPAR_PORT)} only: first-run connects the station to ` +
        `CasparCG on ${String(LOCAL_CASPAR_PORT)}, whatever the Playout lists.`,
    };
  }
  return { host: LOCAL_CASPAR_HOST, port: LOCAL_CASPAR_PORT };
}

/** The type says it; a caller from plain JavaScript gets it said at run time. */
function assertThisMachine(target: LocalCasparTarget): void {
  if (target.host !== LOCAL_CASPAR_HOST) {
    throw new Error(
      `the local core is read on ${LOCAL_CASPAR_HOST} only — refused ${String(target.host)}`,
    );
  }
}

// ── READING THE CORE: FIVE READS, AND NOTHING ELSE ───────────────────────────────────────────

/**
 * 🔴 **EVERY COMMAND THIS MODULE CAN SEND** — each one a read among the core's own "Query Commands"
 * (`AMCPCommandsImpl.cpp` `register_commands`). {@link readCore} refuses anything else before a
 * connection is opened.
 */
export const LOCAL_CASPAR_READS = ['VERSION', 'INFO', 'INFO PATHS', 'INFO CONFIG', 'CLS'] as const;
export type LocalCasparRead = (typeof LOCAL_CASPAR_READS)[number];

/** One AMCP reply: its code, and its data. */
export interface AmcpReply {
  readonly code: number;
  /** A `200`'s lines; a `201`'s ONE chunk (an XML reply keeps its bare `\n` inside); else nothing. */
  readonly data: readonly string[];
}

/**
 * AMCP replies framed out of a byte stream, as a 2.5.0 core frames them: `200` — lines up to an
 * empty line (`info_command`, and the scanner's `/cls` body); `201` — exactly ONE chunk up to the
 * next `\r\n`, whose own newlines are bare `\n` (`info_paths_command`, `info_config_command`,
 * `version_command`); anything else — the status line alone.
 *
 * UTF-8 is decoded as a STREAM, so a Persian name whose two bytes arrive in two chunks is one letter.
 */
export class AmcpReplyReader {
  readonly #decoder = new TextDecoder('utf-8');
  #text = '';

  push(chunk: Uint8Array): void {
    this.#text += this.#decoder.decode(chunk, { stream: true });
  }

  /** The next COMPLETE reply, taken off the stream — or `null` while it is still arriving. */
  next(): AmcpReply | null {
    const statusEnd = this.#text.indexOf('\r\n');
    if (statusEnd === -1) return null;
    const match = /^(\d{3})(?:\s|$)/.exec(this.#text.slice(0, statusEnd));
    const code = match === null ? 0 : Number(match[1]);
    let at = statusEnd + 2;
    const data: string[] = [];
    if (code === 200) {
      for (;;) {
        const lineEnd = this.#text.indexOf('\r\n', at);
        if (lineEnd === -1) return null;
        const line = this.#text.slice(at, lineEnd);
        at = lineEnd + 2;
        if (line === '') break;
        data.push(line);
      }
    } else if (code === 201) {
      const chunkEnd = this.#text.indexOf('\r\n', at);
      if (chunkEnd === -1) return null;
      data.push(this.#text.slice(at, chunkEnd));
      at = chunkEnd + 2;
    }
    this.#text = this.#text.slice(at);
    return { code, data };
  }
}

/** How long a read may take. */
export interface ReadTiming {
  /** For the connection to open. */
  readonly connectMs: number;
  /** For each reply to arrive in full. */
  readonly replyMs: number;
}

/** The start's reads: a large library's `CLS` goes through the scanner's HTTP, so give it time. */
export const START_READS: ReadTiming = { connectMs: 2_000, replyMs: 5_000 };

/**
 * A re-read runs INSIDE a D11 search, which the bridge bounds at 5 s (`MEDIA_SEARCH_TIMEOUT_MS`), so
 * it stays well under that; past it, the search is answered from the last library.
 */
export const REREAD_TIMING: ReadTiming = { connectMs: 1_000, replyMs: 2_500 };

/** One read's outcome: its reply (2xx), or why there is none, in a few words. */
export type ReadResult = { readonly reply: AmcpReply } | { readonly failed: string };

function why(err: unknown): string {
  if (err instanceof Error) {
    const code = (err as { code?: unknown }).code;
    return typeof code === 'string' ? code : err.message;
  }
  return String(err);
}

function openSocket(target: LocalCasparTarget, ms: number): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: target.host, port: target.port });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`no connection within ${String(ms)} ms`));
    }, ms);
    const onError = (err: Error): void => {
      clearTimeout(timer);
      reject(err);
    };
    socket.once('error', onError);
    socket.once('connect', () => {
      clearTimeout(timer);
      socket.off('error', onError);
      resolve(socket);
    });
  });
}

/**
 * Ask the core `reads`, in order, on ONE connection, and close it. Rejects only when no connection
 * opens; a read that fails is answered as `failed`. A `400` (which carries the refused line after it,
 * `AMCPProtocolStrategy.cpp`) or a line that is not AMCP ends the asking: nothing more is sent on a
 * connection whose next line may not be a reply.
 */
export async function readCore(
  target: LocalCasparTarget,
  reads: readonly LocalCasparRead[],
  timing: ReadTiming = START_READS,
): Promise<ReadonlyMap<LocalCasparRead, ReadResult>> {
  for (const read of reads) {
    if (!(LOCAL_CASPAR_READS as readonly string[]).includes(read)) {
      throw new Error(`${String(read)} is not one of the local core's reads — nothing was sent`);
    }
  }
  assertThisMachine(target);
  const socket = await openSocket(target, timing.connectMs);
  const reader = new AmcpReplyReader();
  let closed = false;
  let wake: (() => void) | null = null;
  socket.on('data', (chunk: Buffer) => {
    reader.push(chunk);
    wake?.();
  });
  socket.on('error', () => {
    closed = true;
    wake?.();
  });
  socket.on('close', () => {
    closed = true;
    wake?.();
  });
  const nextReply = (ms: number): Promise<AmcpReply | null> =>
    new Promise((resolve) => {
      const timer = setTimeout(() => {
        wake = null;
        resolve(null);
      }, ms);
      const check = (): void => {
        const reply = reader.next();
        if (reply === null && !closed) return;
        clearTimeout(timer);
        wake = null;
        resolve(reply);
      };
      wake = check;
      check();
    });

  const results = new Map<LocalCasparRead, ReadResult>();
  let stopped: string | null = null;
  try {
    for (const read of reads) {
      if (stopped !== null) {
        results.set(read, { failed: stopped });
        continue;
      }
      socket.write(`${read}\r\n`, 'utf8');
      const reply = await nextReply(timing.replyMs);
      if (reply === null) {
        stopped = closed
          ? 'the connection closed'
          : `no answer within ${String(timing.replyMs)} ms`;
        results.set(read, { failed: stopped });
      } else if (reply.code < 200 || reply.code > 299) {
        results.set(read, { failed: `answered ${String(reply.code)}` });
        if (reply.code === 400 || reply.code === 0) stopped = `not asked after ${read} was refused`;
      } else {
        results.set(read, { reply });
      }
    }
  } finally {
    socket.destroy();
  }
  return results;
}

function resultOf(
  results: ReadonlyMap<LocalCasparRead, ReadResult>,
  read: LocalCasparRead,
): ReadResult {
  return results.get(read) ?? { failed: 'not asked' };
}

// ── WHAT THE CORE SAID ──────────────────────────────────────────────────────────────────────

/** One of the core's channels, as `INFO` lists it. */
export interface CoreChannel {
  readonly channel: number;
  /** Its video mode — `1080i5000`. */
  readonly format: string;
}

/** `INFO`'s lines — `1 1080i5000 PLAYING`, one per channel (`info_command`) — in channel order. */
export function parseInfoChannels(lines: readonly string[]): CoreChannel[] {
  const byChannel = new Map<number, CoreChannel>();
  for (const line of lines) {
    const match = /^\s*(\d+)\s+(\S+)/.exec(line);
    if (match === null) continue;
    const channel = Number(match[1]);
    if (channel < 1 || byChannel.has(channel)) continue;
    byChannel.set(channel, { channel, format: match[2] ?? '' });
  }
  return [...byChannel.values()].sort((a, b) => a.channel - b.channel);
}

/** The five entities boost's `write_xml` writes, and numeric ones (`&#32;` for an all-space text). */
function decodeXml(text: string): string {
  const named: Readonly<Record<string, string>> = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
  };
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, entity: string) => {
    if (entity.startsWith('#')) {
      const hex = entity[1] === 'x' || entity[1] === 'X';
      const point = hex ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
      return point <= 0x10ffff ? String.fromCodePoint(point) : whole;
    }
    return named[entity.toLowerCase()] ?? whole;
  });
}

/** The text of the first `<tag>` element, decoded; `''` for `<tag/>`; `null` when there is none. */
function xmlTextOf(xml: string, tag: string): string | null {
  const match = new RegExp(
    `<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>|<${tag}(?:\\s[^>]*)?/>`,
  ).exec(xml);
  if (match === null) return null;
  return decodeXml(match[1] ?? '');
}

const isAbsolutePath = (p: string): boolean => /^[A-Za-z]:\//.test(p) || p.startsWith('/');
const withTrailingSlash = (p: string): string => (p.endsWith('/') ? p : `${p}/`);

/**
 * The core's media folder from `INFO PATHS`: ABSOLUTE, `/`-separated, ending `/` — or `null`.
 *
 * `media-path` is the config's own value (`env.cpp` keeps a relative one relative — the stock
 * `media/`), so a relative one is joined to `initial-path`, the core's start folder with `/`
 * appended (on Windows it keeps its backslashes: `D:\CasparCG/`). Every `\` becomes `/`: the bridge
 * quotes a clip path for AMCP with backslashes DOUBLED (`@cg/caspar-client` `escape`), so a path
 * holding one would not be the file.
 */
export function mediaFolderOf(infoPathsXml: string): string | null {
  const media = xmlTextOf(infoPathsXml, 'media-path')?.trim().replace(/\\/g, '/');
  if (media === undefined || media === '') return null;
  if (isAbsolutePath(media)) return withTrailingSlash(media);
  const initial = xmlTextOf(infoPathsXml, 'initial-path')?.trim().replace(/\\/g, '/');
  if (initial === undefined || initial === '') return null;
  return withTrailingSlash(`${initial.replace(/\/+$/, '')}/${media.replace(/^(\.\/)+/, '')}`);
}

/** CasparCG's OSC default port (`server.cpp` `setup_osc`), and the one the station listens on. */
export const CORE_OSC_DEFAULT_PORT = 6250;

/** Where the core sends OSC, as its config decides it. */
export interface CoreOsc {
  /** It sends to each AMCP client's address — unless `disable-send-to-amcp-clients` is set. */
  readonly toClients: boolean;
  /** On this port: `default-port`, 6250 unless the config says otherwise. */
  readonly port: number;
}

/**
 * 🔴 **WHETHER THE REMAINING TIME CAN SHOW** — from `INFO CONFIG`, read exactly as the core reads its
 * own config (`src/shell/server.cpp` `setup_osc`, lines 311–341): `configuration.osc.default-port`
 * (6250 when absent) and `disable-send-to-amcp-clients` (false when absent). When the core sends to
 * its AMCP clients, the bridge's AMCP connection is subscribed on that port for as long as it lasts.
 */
export function oscOf(infoConfigXml: string): CoreOsc {
  const block = /<osc(?:\s[^>]*)?>([\s\S]*?)<\/osc>/.exec(infoConfigXml)?.[1] ?? '';
  const portText = xmlTextOf(block, 'default-port')?.trim() ?? '';
  const port = /^\d{1,5}$/.test(portText) ? Number(portText) : CORE_OSC_DEFAULT_PORT;
  /*
    Read as the core reads it: boost's `bool` — a number, then `boolalpha` in the C locale — takes `1`
    or `true` exactly; anything else, `True` included, fails to parse and the default (false) stands.
  */
  const disabledText = xmlTextOf(block, 'disable-send-to-amcp-clients')?.trim();
  const disabled = disabledText === 'true' || disabledText === '1';
  return { toClients: !disabled, port };
}

/** One `CLS` line, as the media scanner prints it. `null` fields are ones it did not print as numbers. */
export interface ClsEntry {
  /** The scanner's ID: the path under the media folder, last extension removed, `/`s, UPPER-CASED. */
  readonly id: string;
  /** `MOVIE`, `STILL` or `AUDIO`. */
  readonly type: string;
  readonly bytes: number | null;
  /** `YYYYMMDDHHmmss`, the scanner machine's local time. */
  readonly modified: string | null;
  readonly frames: number | null;
  /** `[num, den]` — a frame lasts num/den seconds. */
  readonly timebase: readonly [number, number] | null;
}

/**
 * One line of `CLS`: `"<ID>"  MOVIE  <bytes> <YYYYMMDDHHmmss> <frames> <num>/<den>` — the scanner's
 * `generateCinf` (`CasparCG/media-scanner` v1.3.4, `src/ffmpeg.ts` 139–148), relayed verbatim by the
 * core (`AMCPCommandsImpl.cpp` `cls_command`). The ID may hold spaces and any letter; the fields after
 * it are split on whitespace, so a scanner that prints fewer of them still names its file.
 */
export function parseClsLine(line: string): ClsEntry | null {
  const match = /^"(.*)"\s+(.*)$/.exec(line.trim());
  if (match === null) return null;
  const id = match[1] ?? '';
  if (id.trim() === '') return null;
  const [type = '', bytes = '', modified = '', frames = '', timebase = ''] = (match[2] ?? '')
    .trim()
    .split(/\s+/);
  const tb = /^(\d+)\/(\d+)$/.exec(timebase);
  return {
    id,
    type: type.toUpperCase(),
    bytes: /^\d+$/.test(bytes) ? Number(bytes) : null,
    modified: /^\d{14}$/.test(modified) ? modified : null,
    frames: /^\d+$/.test(frames) ? Number(frames) : null,
    timebase: tb === null ? null : [Number(tb[1]), Number(tb[2])],
  };
}

/**
 * A clip's length from its line: `frames × num / den` seconds (`generateCinf` wrote
 * `frames = floor(duration × den / num)`). A still, or a line without the numbers, has none.
 */
export function durationMsOf(entry: ClsEntry): number | undefined {
  if (entry.type === 'STILL' || entry.frames === null || entry.timebase === null) return undefined;
  const [num, den] = entry.timebase;
  if (num <= 0 || den <= 0) return undefined;
  return Math.round((entry.frames * num * 1000) / den);
}

/** A D11 id for a `CLS` ID: the same on every read (a hash of it), and the contract's shape. */
export function mediaIdOf(clsId: string): string {
  return `lc-${createHash('sha256').update(clsId, 'utf8').digest('hex').slice(0, 32)}`;
}

const NEVER = '1970-01-01T00:00:00.000Z';

/**
 * The scanner's local `YYYYMMDDHHmmss` as an instant. The core and this station are one machine
 * (the flag takes loopback only), so this machine's time zone IS the scanner's.
 */
export function updatedAtOf(modified: string | null): string {
  const match =
    modified === null ? null : /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(modified);
  if (match === null) return NEVER;
  const [, y, mo, d, h, mi, s] = match.map(Number);
  const at = new Date(y ?? 1970, (mo ?? 1) - 1, d ?? 1, h ?? 0, mi ?? 0, s ?? 0);
  return Number.isNaN(at.getTime()) ? NEVER : at.toISOString();
}

const D11_TYPES: Readonly<Record<string, FakeMediaItem['type']>> = {
  MOVIE: 'video',
  STILL: 'still',
  AUDIO: 'audio',
};

/**
 * One `CLS` entry as a D11 item: its NAME is the ID's last part and its FOLDER the rest (`''` at the
 * top of the media folder); its `clip` is the media folder + the ID — absolute, with no extension,
 * because `CLS` drops it. A 2.5.0 core plays exactly that: `find_file_within_dir_or_absolute` tries
 * the path as absolute first, and `probe_path` matches a file whose STEM equals it, ignoring case
 * (`src/common/filesystem.cpp` 33–77, from `ffmpeg_producer.cpp` 286–292).
 */
export function mediaItemFrom(entry: ClsEntry, mediaFolder: string): FakeMediaItem | null {
  const type = D11_TYPES[entry.type];
  if (type === undefined) return null;
  const cut = entry.id.lastIndexOf('/');
  const name = entry.id.slice(cut + 1);
  if (name.trim() === '') return null;
  const durationMs = durationMsOf(entry);
  return {
    id: mediaIdOf(entry.id),
    name,
    clip: `${mediaFolder}${entry.id}`,
    type,
    ...(durationMs !== undefined ? { durationMs } : {}),
    folder: cut === -1 ? '' : entry.id.slice(0, cut),
    updatedAt: updatedAtOf(entry.modified),
  };
}

/** `CLS`'s lines as the D11 library, in the scanner's order; one item per ID. */
export function libraryFrom(lines: readonly string[], mediaFolder: string): FakeMediaItem[] {
  const out: FakeMediaItem[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    const entry = parseClsLine(line);
    const item = entry === null ? null : mediaItemFrom(entry, mediaFolder);
    if (item === null || seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

/** D4, from the core's channels: `CH n · local`, on this machine, air state unknown. */
export function catalogueFrom(channels: readonly CoreChannel[]): FakeCatalogueRow[] {
  return channels.map((c) => ({
    id: `local-ch${String(c.channel)}`,
    name: `CH ${String(c.channel)} · local`,
    casparHost: LOCAL_CASPAR_HOST,
    casparChannel: c.channel,
    output: 'unknown',
  }));
}

// ── THE STATION ─────────────────────────────────────────────────────────────────────────────

/** How long a library read stands before a D11 search reads `CLS` again. */
export const CLS_REREAD_MS = 30_000;

/** The one fake the station needs, as the dev station loads it and as the suite imports it. */
export interface LocalCasparModules {
  startFakePlayout(options: FakePlayoutOptions): Promise<FakePlayout>;
}

export interface LocalCasparOptions {
  /** TEST-ONLY — the clock the 30 s re-read counts on. `Date.now` by default. */
  readonly now?: () => number;
  /**
   * `CENTRAL-BRIDGE-01` — the fake Playout's port (ephemeral by default). `pnpm dev:station
   * --playout-only` fixes it where an installed CG Bridge looks for its Playout.
   */
  readonly playoutPort?: number;
}

/** What the start's reads found — the banner's line about the core. */
export interface LocalCore {
  /** `host:port`, as the bridge dials it. */
  readonly address: string;
  /** What `VERSION` answered — `2.5.0 69e8ad5 Stable` on the owner's core. */
  readonly version: string;
  readonly channels: readonly CoreChannel[];
  /** The media folder `INFO PATHS` named, absolute; `null` when it could not be read. */
  readonly mediaFolder: string | null;
  /** How many clips and stills the start's `CLS` listed. */
  readonly clips: number;
  readonly stills: number;
  /** Where the core sends OSC; `null` when `INFO CONFIG` could not be read. */
  readonly osc: CoreOsc | null;
}

export interface LocalCasparStation {
  readonly marker: typeof LOCAL_CASPAR_MARKER;
  readonly playout: FakePlayout;
  readonly core: LocalCore;
  /** One line per thing the owner should know — the library, or the remaining time, unavailable. */
  readonly notes: readonly string[];
  /** Stop the Playout. The core is not held open between reads. Safe to call twice. */
  stop(): Promise<void>;
}

function oscNote(osc: CoreOsc | null, failure: string): string | null {
  if (osc === null) {
    return `CasparCG's OSC settings could not be read (INFO CONFIG ${failure}) — if it sends none here, no remaining time shows.`;
  }
  if (!osc.toClients) {
    return 'CasparCG sends no OSC to its AMCP clients (disable-send-to-amcp-clients) — no remaining time shows in this mode, and no setting was changed.';
  }
  if (osc.port !== CORE_OSC_DEFAULT_PORT) {
    return `CasparCG sends OSC to port ${String(osc.port)} and the station listens on ${String(CORE_OSC_DEFAULT_PORT)} — no remaining time shows in this mode, and no setting was changed.`;
  }
  return null;
}

function clsNote(failure: string): string {
  return failure === 'answered 501'
    ? 'CasparCG answered CLS with 501: its media scanner is not running, so the Media tab is empty until it runs (casparcg_auto_restart.bat starts it beside CasparCG); the Media tab reads CLS again after 30 s.'
    : `CasparCG did not list its media (CLS ${failure}) — the Media tab is empty; it reads CLS again after 30 s.`;
}

/**
 * Read the core, then start the fake Playout shaped from it. Rejects in ONE line when nothing
 * answers AMCP there, when what answers is not CasparCG, or when it lists no channel. A missing
 * library or OSC setting is not a reason to refuse: the station starts, and a note says what is
 * missing.
 */
export async function startLocalCasparStation(
  mods: LocalCasparModules,
  target: LocalCasparTarget,
  options: LocalCasparOptions = {},
): Promise<LocalCasparStation> {
  assertThisMachine(target);
  const now = options.now ?? Date.now;
  const address = `${target.host}:${String(target.port)}`;
  let first: ReadonlyMap<LocalCasparRead, ReadResult>;
  try {
    first = await readCore(target, LOCAL_CASPAR_READS, START_READS);
  } catch (err) {
    throw new Error(
      `Nothing answers AMCP on ${address} (${why(err)}) — start CasparCG, then run the command again.`,
    );
  }
  const failure = (result: ReadResult): string => ('failed' in result ? result.failed : '');

  const versionRead = resultOf(first, 'VERSION');
  const version = 'reply' in versionRead ? (versionRead.reply.data[0] ?? '').trim() : '';
  if (version === '') {
    throw new Error(
      `${address} did not answer VERSION as CasparCG does (${failure(versionRead) || 'no version'}) — is CasparCG what listens there?`,
    );
  }
  const infoRead = resultOf(first, 'INFO');
  const channels = 'reply' in infoRead ? parseInfoChannels(infoRead.reply.data) : [];
  if (channels.length === 0) {
    throw new Error(
      `CasparCG on ${address} lists no channel (INFO ${failure(infoRead) || 'answered none'}) — there is nothing to operate.`,
    );
  }

  const notes: string[] = [];
  const pathsRead = resultOf(first, 'INFO PATHS');
  const mediaFolder = 'reply' in pathsRead ? mediaFolderOf(pathsRead.reply.data[0] ?? '') : null;
  let library: FakeMediaItem[] = [];
  if (mediaFolder === null) {
    notes.push(
      `CasparCG did not name its media folder (INFO PATHS ${failure(pathsRead) || 'named none'}) — the Media tab is empty.`,
    );
  } else {
    const clsRead = resultOf(first, 'CLS');
    if ('reply' in clsRead) library = libraryFrom(clsRead.reply.data, mediaFolder);
    else notes.push(clsNote(clsRead.failed));
  }
  const configRead = resultOf(first, 'INFO CONFIG');
  const osc = 'reply' in configRead ? oscOf(configRead.reply.data[0] ?? '') : null;
  const oscLine = oscNote(osc, failure(configRead));
  if (oscLine !== null) notes.push(oscLine);

  /*
    THE RE-READ: at most one `CLS` per 30 s, and only for a SEARCH (the fake awaits this before a D11
    search and never before an `ids=` read). A search that arrives while one is running waits for
    that one. A failed re-read keeps the last library — a scanner that stopped does not empty a list
    the owner was choosing from.
  */
  let lastRead = now();
  let rereading: Promise<void> | null = null;
  let served: FakePlayout | null = null;
  const reread = (): Promise<void> => {
    if (rereading !== null) return rereading;
    if (mediaFolder === null || now() - lastRead < CLS_REREAD_MS) return Promise.resolve();
    lastRead = now();
    rereading = readCore(target, ['CLS'], REREAD_TIMING)
      .then((results) => {
        const read = resultOf(results, 'CLS');
        if ('reply' in read) served?.setMedia(libraryFrom(read.reply.data, mediaFolder));
      })
      .catch(() => undefined)
      .finally(() => {
        rereading = null;
      });
    return rereading;
  };

  const playout = await mods.startFakePlayout({
    // The fake admin holds every channel the core has, on this machine.
    grants: { admin: channels.map((c) => ({ host: LOCAL_CASPAR_HOST, channel: c.channel })) },
    // As `fake-station.ts`: on an all-loopback station the admin's sign-in lets this machine in.
    sealOnLoopback: false,
    beforeMediaSearch: reread,
    ...(options.playoutPort !== undefined ? { port: options.playoutPort } : {}),
  });
  served = playout;
  playout.setChannels(catalogueFrom(channels));
  playout.setInputs([]);
  playout.setMedia(library);

  let stopped = false;
  return {
    marker: LOCAL_CASPAR_MARKER,
    playout,
    core: {
      address,
      version,
      channels,
      mediaFolder,
      clips: library.filter((m) => m.type === 'video').length,
      stills: library.filter((m) => m.type === 'still').length,
      osc,
    },
    notes,
    stop: async () => {
      if (stopped) return;
      stopped = true;
      await playout.stop();
    },
  };
}
