import { randomUUID } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo, Socket } from 'node:net';
import { createLocalJWKSet, exportJWK, generateKeyPair, jwtVerify, SignJWT } from 'jose';
import type { CryptoKey, JWK, JWTPayload } from 'jose';

/**
 * 🔴 `C-037` — **A FAKE APASAI PLAYOUT, on loopback, for the bridge's auth integration suite.**
 *
 * It implements the Playout half of `PLAYOUT-INTEGRATION-CONTRACT-v1` (§4) plus v1.1's D9:
 * D1 sign-in, D2 refresh, D3 JWKS, D9 revocation list — and, since `CHANNEL-AUTHORITY-01`, D4,
 * the channel catalogue, which the bridge now reads (`C-039`). D8 (`/me`) is still not reached
 * by anything, and a fixture that pretended to serve it would be untested lines claiming to be a
 * contract.
 *
 * ── WHY A REAL SOCKET AND NOT A `fetchImpl` STUB ────────────────────────────
 *
 * `PlayoutAuth` already takes an injected `fetchImpl`, so a stub would be cheaper. It would
 * also verify almost nothing that matters: the two things most likely to be wrong in the
 * field are the HTTP layer itself — an `ETag` round-trip, a `304` with no body, a `Bearer`
 * header that never gets attached, a Persian `name` whose `Content-Length` was counted in
 * CHARACTERS and truncated the last letter on the wire — and `jose`'s own remote key set,
 * which fetches through the global `fetch` and cannot be handed a stub at all. A stub
 * substitutes the author's belief about HTTP for HTTP. This binds a port.
 *
 * ── 🔴 NO CREDENTIAL IS EVER WRITTEN TO DISK, AND NONE IS REAL ──────────────
 *
 * The ES256 key pair is generated at `startFakePlayout()` and lives in memory for the life of
 * the vitest process; there is no fixture key file, no PEM, no JWKS snapshot to go stale, and
 * nothing here to leak out of a repo. The one password constant is
 * {@link FAKE_PLAYOUT_PASSWORD}, whose value says out loud what it is.
 *
 * ── WHAT THIS FILE DELIBERATELY DOES NOT DO ─────────────────────────────────
 *
 * - It does not model the contract's refresh-token FAMILY revocation (§4.2: a replayed token
 *   revokes the whole family). Rotation-on-use and `401` on replay are modelled, because the
 *   bridge can observe those; family revocation is a Playout-internal consequence no bridge
 *   test can see, and a fake that implements what cannot be observed is decoration.
 * - It cannot mint a token with NO `jti` — {@link FakePlayout.issueToken} always sets one
 *   (the contract says SHOULD, and every path we exercise carries one). `PlayoutAuth` does
 *   handle `jti: null`; if a test ever needs that shape, widen this deliberately rather than
 *   working around it with a hand-rolled `SignJWT` beside this file.
 *
 * ── `DESKTOP-APPS-01-C` C8 — THE PLAYOUT'S AMCP ALLOW LIST, AS 2.8.54 (REVISED) KEEPS IT ───
 *
 * A 2.8.54 Playout refuses AMCP to every machine not on its allow list. This fake keeps the same
 * list ({@link FakePlayout.isTrusted}); an AMCP mock wired to it
 * (`createMock({ admit: (ip) => playout.isTrusted(ip) })`) refuses exactly as the Playout's
 * firewall would. The revised rule (their `PLAYOUT-CG-RESPONSE-BUILTIN-ACCOUNT-v1` §2.5), modelled:
 *
 *   - ONLY D9 introduces — a SERVER-SIDE read (no `Origin`) whose token verifies and is not
 *     revoked, by an ACCOUNT holding `station-admin` (the role is read from the account record,
 *     not from the token). D4 and D8 introduce nothing.
 *   - The FIRST introduced source is trusted AUTOMATICALLY, once; the automatic path is then SEALED.
 *   - Every later source — the same machine at a new address included — is PENDING until the
 *     administrator approves it ({@link FakePlayout.approve}, the test's stand-in for the button).
 *   - An `operator` as the first contact seals the path too, and is recorded pending; so does a
 *     LOOPBACK source (unless `sealOnLoopback: false` — every suite here runs on loopback, so the
 *     automatic path is reachable only with it).
 *   - No expiry.
 *
 * ⚠ Unlike D4's bearer check, THIS verifies the token, because letting a machine in is a Playout
 * DECISION with a security meaning, and a fake that trusted any bearer would let a bridge that
 * presented a viewer's token pass a test the real Playout would fail.
 */

/**
 * The contract's fixed paths (§4), spelled here as LITERALS rather than imported from
 * `../../src/playout-config.js`.
 *
 * ⚠ Importing the bridge's own `CONTRACT_PATHS` would make the fixture agree with the bridge
 * BY CONSTRUCTION: the two sides would rename a path together and every test would stay
 * green while the real Playout served the old one. The fake is the OTHER party to the
 * contract, so it quotes the contract, and a drift in either side shows up as a 404.
 */
const PATHS = {
  jwks: '/.well-known/jwks.json',
  token: '/api/cg/auth/token',
  refresh: '/api/cg/auth/refresh',
  revoked: '/api/cg/revoked',
  channels: '/api/cg/channels',
  /** D8 — who the bearer is. Served so a suite can show it introduces NOTHING (`-01-C` C4). */
  me: '/api/cg/me',
  /** `PLAYOUT-SOURCES-01` — D10, the Playout's inputs (contract v1.2, v1.3's `route` and `epoch`). */
  inputs: '/api/cg/inputs',
  /** `PLAYOUT-SOURCES-01` — D11, the Playout's media library. */
  media: '/api/cg/media',
} as const;

// ── `PLAYOUT-SOURCES-01` §3 — D10 AND D11, AS THEIR ANSWER DESCRIBES THEM ──────────────────────
//
// `PLAYOUT-CG-RESPONSE-INPUTS-MEDIA-v1` §1–§3 and `PLAYOUT-CG-RESPONSE-V13-INSTALL-v1`, quoted here
// rather than imported from `@cg/shared-ipc`, for the reason `PATHS` gives: the fake is the OTHER
// party to the contract, so it must not agree with the bridge by construction.

/** One D10 input as the Playout sends it. `producer` is kept loose: the Playout decides its shape. */
export interface FakeInput {
  readonly id: string;
  readonly name: string;
  readonly casparHost?: string;
  readonly producer: Readonly<Record<string, unknown>>;
  readonly format?: string;
  readonly aspect?: number;
  readonly available?: boolean;
  readonly reason?: string;
  readonly compatibleChannels?: readonly { casparHost: string; casparChannel: number }[];
}

/**
 * The inputs the fake lists, modelling the Playout's real list (§3 of the prompt): an NDI input, a
 * stream CARRYING CREDENTIALS (for the redaction tests), a multicast, v1.3's two `route` inputs to
 * the holder channel (one of them for channel 1 only, and down), and one stream on a scheme this
 * product does not accept.
 */
export const FAKE_INPUTS: readonly FakeInput[] = [
  {
    id: 'li-studio1',
    name: 'Studio 1',
    casparHost: '127.0.0.1',
    producer: { kind: 'ndi', source: 'STUDIO-PC (Cam 1)' },
    format: '1080i5000',
    aspect: 1.7778,
  },
  {
    id: 'li-newscam',
    name: 'دوربین خبر',
    casparHost: '127.0.0.1',
    producer: { kind: 'stream', url: 'rtsp://cam:secret@10.0.0.21/live' },
    format: 'AUTO',
    aspect: 1.7778,
  },
  {
    id: 'li-multicast',
    name: 'Multicast',
    casparHost: '127.0.0.1',
    producer: { kind: 'stream', url: 'udp://239.255.0.1:5000?reuse=1' },
    format: '1080i5000',
    aspect: 1.7778,
  },
  {
    id: 'li-input3',
    name: 'ورودی ۳',
    casparHost: '127.0.0.1',
    producer: { kind: 'route', channel: 9, layer: 12, videoMode: '1080i5000' },
    aspect: 1.7778,
    available: true,
    compatibleChannels: [
      { casparHost: '127.0.0.1', casparChannel: 1 },
      { casparHost: '127.0.0.1', casparChannel: 2 },
    ],
  },
  {
    id: 'li-input4',
    name: 'ورودی ۴',
    casparHost: '127.0.0.1',
    producer: { kind: 'route', channel: 9, layer: 13 },
    aspect: 1.7778,
    available: false,
    reason: 'no signal',
    compatibleChannels: [{ casparHost: '127.0.0.1', casparChannel: 1 }],
  },
  {
    id: 'li-rist',
    name: 'RIST feed',
    casparHost: '127.0.0.1',
    producer: { kind: 'stream', url: 'rist://10.0.0.30:5004' },
    aspect: 1.7778,
  },
];

/**
 * `ROUTE-PLATES-01` §1.H — the epoch after `epoch`, as a core start moves it (it never repeats): a
 * number counts up; `epoch-N` becomes `epoch-(N+1)`; none becomes 1.
 */
export function nextEpoch(epoch: number | string | null): number | string {
  if (epoch === null) return 1;
  if (typeof epoch === 'number') return epoch + 1;
  const tail = /^(.*?)(\d+)$/.exec(epoch);
  return tail === null ? `${epoch}-2` : `${tail[1] ?? ''}${String(Number(tail[2]) + 1)}`;
}

/**
 * `ROUTE-PLATES-01` §1.H — every held input's holder layer moved (+100), as a restart that added a
 * programme channel renumbers them (their design §2.2). A `route://H-L` from before now names a
 * layer nothing holds.
 */
export function renumberHolders(inputs: readonly FakeInput[]): FakeInput[] {
  return inputs.map((input) => {
    const producer = input.producer as { kind?: unknown; layer?: unknown };
    if (producer.kind !== 'route' || typeof producer.layer !== 'number') return input;
    return { ...input, producer: { ...input.producer, layer: producer.layer + 100 } };
  });
}

/** One D11 item as the Playout sends it (§2.1–§2.2). `clip` is ABSOLUTE, with `/`. */
export interface FakeMediaItem {
  readonly id: string;
  readonly name: string;
  readonly clip: string;
  readonly type: 'video' | 'audio';
  readonly durationMs: number;
  readonly width?: number;
  readonly height?: number;
  readonly folder: string;
  readonly updatedAt: string;
}

/** How big the fake library is (§3: 5,000 items). */
export const FAKE_MEDIA_COUNT = 5_000;

/** The named items every suite can rely on (§3), by their Playout ids. */
export const FAKE_MEDIA_IDS = {
  /** A media item named EXACTLY like an input — the separation test's subject. */
  studio1: 'm-studio1',
  /** Typed with ARABIC `ي`/`ك` — found by a Persian query, and the reverse. */
  arabicTyped: 'm-arabic',
  /** Persian digits: `خبر ۱۴۰۵`, found by `خبر 1405`. */
  khabar1405: 'm-khabar1405',
  /** The prompt's own media sentence names it. */
  titraj20: 'm-titraj20',
  /** Persian `کلیپ`, found by the Arabic-typed `كليپ`. */
  kelip: 'm-kelip',
} as const;

const PERSIAN_WORDS = ['خبر', 'گزارش', 'مستند', 'ورزش', 'اقتصاد', 'فرهنگ', 'آرشیو', 'میان‌برنامه'];
const LATIN_WORDS = ['News', 'Promo', 'Sport', 'Weather', 'Archive', 'Bumper', 'Trailer', 'Opener'];
const FOLDERS = [
  'Apasai_CIaB/News',
  'Apasai_CIaB/Film/khareji',
  'آرشیو/۱۴۰۵',
  'Share/Video',
  'Promo',
];
const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const toPersianDigits = (n: number): string =>
  String(n).replace(/\d/g, (d) => PERSIAN_DIGITS[Number(d)] ?? d);

/** An "original" path — where the library keeps the file: absolute, spaces and Persian allowed. */
const originalClip = (folder: string, name: string, ext: string): string =>
  `C:/Apasai CIaB/${folder}/${name}.${ext}`;
/** A "cache" path — the engine's content-hashed copy (§2.1). */
const cacheClip = (id: string): string =>
  `C:/Apasai CIaB/Engine/bin/engine/data/cache/${id.replace(/[^0-9a-z]/gi, '')}c0ffee.mpg`;

/**
 * THE FAKE LIBRARY: {@link FAKE_MEDIA_COUNT} items, generated deterministically (the same list on
 * every call), Persian and Latin names in five folders, audio mixed in (never offered), no stills.
 */
export function fakeMediaLibrary(): FakeMediaItem[] {
  const named: FakeMediaItem[] = [
    {
      id: FAKE_MEDIA_IDS.studio1,
      name: 'Studio 1',
      clip: originalClip('Promo', 'Studio 1', 'mov'),
      type: 'video',
      durationMs: 12_000,
      width: 1920,
      height: 1080,
      folder: 'Promo',
      updatedAt: '2026-09-20T08:00:00Z',
    },
    {
      id: FAKE_MEDIA_IDS.arabicTyped,
      name: 'كليپ خبري',
      clip: originalClip('Apasai_CIaB/News', 'كليپ خبري', 'mp4'),
      type: 'video',
      durationMs: 45_000,
      width: 1920,
      height: 1080,
      folder: 'Apasai_CIaB/News',
      updatedAt: '2026-09-21T09:30:00Z',
    },
    {
      id: FAKE_MEDIA_IDS.khabar1405,
      name: 'خبر ۱۴۰۵',
      clip: originalClip('آرشیو/۱۴۰۵', 'خبر ۱۴۰۵', 'mp4'),
      type: 'video',
      durationMs: 1_059_000,
      width: 1920,
      height: 1080,
      folder: 'آرشیو/۱۴۰۵',
      updatedAt: '2026-09-22T10:00:00Z',
    },
    {
      id: FAKE_MEDIA_IDS.titraj20,
      name: 'تیتراژ خبر ۲۰',
      clip: originalClip('Apasai_CIaB/News', 'تیتراژ خبر ۲۰', 'mov'),
      type: 'video',
      durationMs: 20_000,
      width: 1920,
      height: 1080,
      folder: 'Apasai_CIaB/News',
      updatedAt: '2026-09-23T11:15:00Z',
    },
    {
      id: FAKE_MEDIA_IDS.kelip,
      name: 'کلیپ معرفی',
      clip: originalClip('Promo', 'کلیپ معرفی', 'mp4'),
      type: 'video',
      durationMs: 30_000,
      width: 1280,
      height: 720,
      folder: 'Promo',
      updatedAt: '2026-09-24T12:45:00Z',
    },
  ];
  const items = [...named];
  for (let i = 0; items.length < FAKE_MEDIA_COUNT; i += 1) {
    const persian = i % 2 === 0;
    const word = persian
      ? (PERSIAN_WORDS[i % PERSIAN_WORDS.length] as string)
      : (LATIN_WORDS[i % LATIN_WORDS.length] as string);
    const serial = 100 + i;
    const name = persian ? `${word} ${toPersianDigits(serial)}` : `${word} ${String(serial)}`;
    const folder = FOLDERS[i % FOLDERS.length] as string;
    const audio = i % 7 === 3;
    const id = `m-${i.toString(16).padStart(8, '0')}`;
    const day = String(1 + (i % 28)).padStart(2, '0');
    const minute = String(i % 60).padStart(2, '0');
    items.push({
      id,
      name,
      // Every third video plays from the engine's cache copy, as `.111`'s 26 of 86 do (S5).
      clip: audio
        ? originalClip(folder, name, 'wav')
        : i % 3 === 0
          ? cacheClip(id)
          : originalClip(folder, name, 'mp4'),
      type: audio ? 'audio' : 'video',
      durationMs: 5_000 + (i % 600) * 1_000,
      ...(audio ? {} : { width: 1920, height: 1080 }),
      folder,
      updatedAt: `2026-08-${day}T${String(i % 24).padStart(2, '0')}:${minute}:00Z`,
    });
  }
  return items;
}

/**
 * §2.2 — the search normalisation, EXACTLY as the contract lists it and nothing more: `ي/ى→ی`,
 * `ك→ک`, U+200C, U+0640 and U+064B–U+065F removed, `۰–۹` and `٠–٩` to `0–9`, spaces collapsed, and
 * case folded.
 */
export function normalizeFakeSearch(text: string): string {
  return (
    text
      .replace(/[يى]/g, 'ی')
      .replace(/ك/g, 'ک')
      // An alternation, not one class: a mark straight after a letter in a class is one combined
      // character to the regex reader (`no-misleading-character-class`).
      .replace(/\u200C|\u0640|[\u064B-\u065F]/g, '')
      .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
      .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase()
  );
}

/** The keyset cursor, bound to its query (§2.2: another query gets `400`). */
interface FakeMediaCursor {
  readonly q: string;
  readonly type: string;
  readonly sort: string;
  readonly key: string;
  readonly id: string;
}

const encodeCursor = (cursor: FakeMediaCursor): string =>
  Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');

function decodeCursor(raw: string): FakeMediaCursor | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (typeof parsed !== 'object' || parsed === null) return null;
    const c = parsed as Record<string, unknown>;
    return typeof c['q'] === 'string' &&
      typeof c['type'] === 'string' &&
      typeof c['sort'] === 'string' &&
      typeof c['key'] === 'string' &&
      typeof c['id'] === 'string'
      ? (c as unknown as FakeMediaCursor)
      : null;
  } catch {
    return null;
  }
}

const FA_COLLATOR = new Intl.Collator('fa-IR');
const CONTRACT_ID = /^[A-Za-z0-9_-]{1,48}$/;
const MEDIA_TYPES = new Set(['video', 'audio', 'still']);

/** A D11 page as the Playout answers it. */
export interface FakeMediaPage {
  readonly items: readonly FakeMediaItem[];
  readonly total: number;
  readonly nextCursor: string | null;
}

/**
 * D11, answered over a library (their answer §2.2) — or `null` for a `400 invalid_query`. ONE
 * answer, shared by the HTTP fake and the auth-off provider (`local-playout-sources.ts`), so the
 * two cannot come to search differently:
 *
 *   - `ids=`: at most 100 contract ids, answered in REQUEST order; an id the library no longer
 *     holds is simply absent;
 *   - `q`: normalised ({@link normalizeFakeSearch}) and matched on the name and the readable folder;
 *   - `type`: a comma list of `video`/`audio`/`still` (still is accepted and has no items);
 *   - `sort`: `name` (fa-IR, then id) or `recent` (`updatedAt` descending, then id);
 *   - `limit`: 50 by default, clamped at 200, and `400` when not a positive whole number;
 *   - `cursor`: a KEYSET bound to its `q`/`type`/`sort` — `400` under another query — so an item
 *     added or removed between two pages causes neither a repeat nor a gap.
 */
export function answerFakeMediaQuery(
  library: Iterable<FakeMediaItem>,
  query: URLSearchParams,
): FakeMediaPage | null {
  const all = [...library];
  const idsParam = query.get('ids');
  if (idsParam !== null) {
    const ids = idsParam.split(',').filter((id) => id !== '');
    if (ids.length === 0 || ids.length > 100 || !ids.every((id) => CONTRACT_ID.test(id))) {
      return null;
    }
    const byId = new Map(all.map((m) => [m.id, m] as const));
    const items = ids.map((id) => byId.get(id)).filter((m): m is FakeMediaItem => m !== undefined);
    return { items, total: items.length, nextCursor: null };
  }
  const rawLimit = query.get('limit');
  const limitNumber = rawLimit === null ? 50 : Number(rawLimit);
  if (!Number.isInteger(limitNumber) || limitNumber <= 0) return null;
  const limit = Math.min(limitNumber, 200);
  const sort = query.get('sort') ?? 'name';
  if (sort !== 'name' && sort !== 'recent') return null;
  const typeParam = query.get('type') ?? 'video,audio';
  const types = typeParam.split(',').filter((t) => t !== '');
  if (types.length === 0 || !types.every((t) => MEDIA_TYPES.has(t))) return null;
  const q = query.get('q') ?? '';
  const needle = normalizeFakeSearch(q);
  const keyOf = (m: FakeMediaItem): string => (sort === 'name' ? m.name : m.updatedAt);
  const compare = (a: { key: string; id: string }, b: { key: string; id: string }): number => {
    const byKey = sort === 'name' ? FA_COLLATOR.compare(a.key, b.key) : b.key.localeCompare(a.key);
    return byKey !== 0 ? byKey : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  };
  const matched = all
    .filter((m) => types.includes(m.type))
    .filter(
      (m) =>
        needle === '' ||
        normalizeFakeSearch(m.name).includes(needle) ||
        normalizeFakeSearch(m.folder).includes(needle),
    )
    .sort((a, b) => compare({ key: keyOf(a), id: a.id }, { key: keyOf(b), id: b.id }));
  let start = 0;
  const rawCursor = query.get('cursor');
  if (rawCursor !== null) {
    const cursor = decodeCursor(rawCursor);
    if (cursor === null || cursor.q !== q || cursor.type !== typeParam || cursor.sort !== sort) {
      return null;
    }
    const after = matched.findIndex(
      (m) => compare({ key: keyOf(m), id: m.id }, { key: cursor.key, id: cursor.id }) > 0,
    );
    start = after === -1 ? matched.length : after;
  }
  const page = matched.slice(start, start + limit);
  const last = page[page.length - 1];
  return {
    items: page,
    total: matched.length,
    nextCursor:
      start + limit < matched.length && last !== undefined
        ? encodeCursor({ q, type: typeParam, sort, key: keyOf(last), id: last.id })
        : null,
  };
}

/** One D4 catalogue row (§4, `handoff/2026-09-16/channels.json`), spelled as the contract does. */
export interface FakeCatalogueRow {
  readonly id: string;
  readonly name: string;
  readonly casparHost: string;
  readonly casparChannel: number;
  /**
   * `UI-POLISH-01` G — the Playout `2.8.58` fields (V13 §1). STRINGS, not the three and the ten
   * values the contract names, so a spec can send a value the console does not know — which is a
   * case the console must handle, not one the fixture may rule out. Omitted: a pre-`2.8.58` row.
   */
  readonly output?: string;
  readonly playlist?: string;
}

/** `UI-POLISH-01` G — one channel's air state for {@link FakePlayout.setChannelState}; `null` removes the field. */
export interface FakeChannelState {
  readonly output?: string | null;
  readonly playlist?: string | null;
}

/**
 * 🔴 `CHANNEL-AUTHORITY-01` — **THE CATALOGUE THE TEST PLAYOUT PUBLISHES, IN SHAPE.**
 *
 * Two rows on this fake station's host, exactly as the recorded handoff has them on
 * `192.168.21.111`: channel 1 is the PLAYOUT'S OWN PROGRAMME output (`apasai` there), channel 2 is
 * the one set aside for CG (`cg-test2`). A station declaring channel 2 therefore meets both a row
 * that names its channel and a row it must never treat as its own — and `cg-op-both` holds a
 * grant for each.
 *
 * ⚠ The names are Persian, as the Playout's are, so the strip's bidi isolation is exercised by
 * every spec that reads a label, not only by one that remembers to.
 *
 * ⭐ `UI-POLISH-01` G — and the air state the real ones carry from `2.8.58`: the programme channel is
 * ON AIR and playing; the CG test channel is OFF (the Playout marks `cg-test2` "not to air") with its
 * playlist stopped. {@link FakePlayout.setChannelState} sets any other combination.
 */
export const FAKE_CATALOGUE: readonly FakeCatalogueRow[] = [
  {
    id: 'fake-programme',
    name: 'آپاسای',
    casparHost: '127.0.0.1',
    casparChannel: 1,
    output: 'on-air',
    playlist: 'playing',
  },
  {
    id: 'fake-cg',
    name: 'کانال دوم (تست CG)',
    casparHost: '127.0.0.1',
    casparChannel: 2,
    output: 'off',
    playlist: 'stopped',
  },
];

/** The `aud` the contract fixes (§3.2, Playout Q5 accepted). A literal, for the reason above. */
const CONTRACT_AUDIENCE = 'cg-control';

/** §3.5 — the contract's default access-token lifetime: one shift. */
const ACCESS_TOKEN_TTL_SEC = 43_200;

/**
 * 🔴 **NO REAL CREDENTIAL IS IN THIS REPO.** This is the password all three fixture users
 * sign in with, and it is spelled so that anyone grepping for a secret finds a sentence
 * saying it is not one. Do not "make it realistic" — a realistic-looking password in a public
 * tree is indistinguishable from a leaked one to everybody who is not its author.
 */
export const FAKE_PLAYOUT_PASSWORD = 'test-only-not-a-secret';

/** One `{ host, channel }` grant — the contract's `cg_channels` element (§3.2). */
export interface FakeChannelGrant {
  readonly host: string;
  readonly channel: number;
}

/**
 * The `cg_channels` claim: a grant list, or `'*'` for every channel.
 *
 * ⚠ Typed as the contract's own shape rather than `unknown`, on purpose: a fixture whose
 * claim type is `unknown` lets a typo compile, and a MALFORMED `cg_channels` is not something
 * this file is here to produce. A test that needs one should say so and widen this with a
 * comment naming the case.
 */
export type FakeCgChannels = '*' | readonly FakeChannelGrant[];

/** A Playout user, exactly as far as the contract makes the bridge care. */
export interface FakePlayoutUser {
  readonly username: string;
  readonly sub: string;
  readonly name: string;
  readonly roles: readonly string[];
  readonly cgChannels: FakeCgChannels;
}

/** Which fixture user a mint is for. */
export type FakeUserKey =
  | 'operator'
  | 'viewer'
  | 'longName'
  | 'admin'
  | 'adminChannelTwo'
  | 'otherStation'
  | 'channelTwo'
  | 'bothChannels';

/** `cg-op1` — one channel, Persian display name. The ordinary operator. */
export const FAKE_OPERATOR: FakePlayoutUser = {
  username: 'cg-op1',
  sub: 'u-1042',
  name: 'علی رضایی',
  roles: ['operator', 'viewer'],
  cgChannels: [{ host: '127.0.0.1', channel: 1 }],
};

/**
 * `cg-view` — no channels at all.
 *
 * ⚠ An EMPTY `cg_channels` is not `no_cg_access`: a viewer signs in successfully and reads
 * everything (contract §5, and the joint test's own acceptance line). The 403 is a Playout
 * DECISION, so it is driven by {@link FakePlayout.setCredentialFailure}, never inferred here
 * from the shape of a claim.
 */
export const FAKE_VIEWER: FakePlayoutUser = {
  username: 'cg-view',
  sub: 'u-2087',
  name: 'مریم کاظمی',
  roles: ['viewer'],
  cgChannels: [],
};

/**
 * 🔴 `cg-op2` — **the name that is LONGER than `MAX_ACTOR_LENGTH`, so the truncation is
 * MEASURED rather than assumed.**
 *
 * MEASURED, not estimated (`node`: `value.length`):
 *
 * - **75 UTF-16 code units**, and 75 code points — every character is BMP, so no surrogate
 *   pair straddles the cut and `slice(0, 64)` cannot produce a lone surrogate. That is worth
 *   stating: a fixture that DID straddle would be testing a different (and real) hazard, and
 *   should be added as its own case rather than by accident here.
 * - `normalizeActor` cuts it at 64 units, landing MID-WORD inside `سیما` and dropping the
 *   11 units `ما، نوبت شب`. Mid-word is deliberate: a cut that happened to land on a space
 *   would be trimmed away and the test could not tell truncation from a tidy name.
 * - The cut result is therefore exactly 64 units — the length an assertion should pin.
 *
 * ADR 0010's open note is that a longer Playout name is shortened; `nameTruncated` is the
 * flag that stops it being SILENT, and this user is what makes that flag fire.
 */
export const FAKE_LONG_NAME_USER: FakePlayoutUser = {
  username: 'cg-op2',
  sub: 'u-3311',
  name: 'سیدمحمدرضا حسینی نژاد طباطبایی، سرپرست شیفت پخش زنده شبکه خبر سیما، نوبت شب',
  roles: ['operator', 'viewer'],
  cgChannels: [{ host: '127.0.0.1', channel: 1 }],
};

/**
 * `cg-admin` — `C-038`'s station-admin, and the ONLY user who may reach the six
 * configuration routes.
 *
 * ⚠ **Its `roles` are CUMULATIVE, as the contract says the Playout issues them**
 * (`station-admin ⊇ operator ⊇ viewer`). `holdsPermissionClass` does not depend on that —
 * it applies the hierarchy explicitly, so a bare `['station-admin']` would be granted the
 * operator rungs too — but the fixture spells what the real Playout sends, so a spec written
 * against it is a spec about the contract rather than about our tolerance for breaking it.
 */
export const FAKE_ADMIN: FakePlayoutUser = {
  username: 'cg-admin',
  sub: 'u-5501',
  name: 'زهرا موسوی',
  roles: ['station-admin', 'operator', 'viewer'],
  cgChannels: [{ host: '127.0.0.1', channel: 1 }],
};

/**
 * 🔴 `C-038` — **AN OPERATOR OF ANOTHER STATION.** Full operator role, a grant for channel 1,
 * and a HOST that is not one this bridge drives.
 *
 * This is the user that proves the host half of `grantsChannel` does anything at all. Without
 * it a spec could assert "channel 1 is permitted" all day while the host were ignored, and
 * the one property the rule exists for — _a grant naming another station's host does not
 * authorise this station's channel 1_ — would be untested.
 *
 * ⚠ The host is a documentation IP (`192.0.2.x`, RFC 5737 TEST-NET-1) and NOT a real station
 * address. Nothing in this suite connects to it; it is compared as a string and never dialled.
 */
export const FAKE_OTHER_STATION_USER: FakePlayoutUser = {
  username: 'cg-op-elsewhere',
  sub: 'u-6604',
  name: 'حسن قادری',
  roles: ['operator', 'viewer'],
  cgChannels: [{ host: '192.0.2.10', channel: 1 }],
};

/**
 * 🔴 `B-257` — `cg-op-ch2` — **A FULL OPERATOR OF THIS STATION'S HOST, GRANTED CHANNEL 2 ONLY.**
 *
 * The principal `B-257` was measured with: an operator whose channels do not overlap
 * `cg-op1`'s. While `cg-op1` holds a lock, this user's console must not read as locked, and a
 * channel-1 command of theirs must be refused for PERMISSION, never for a PIN they do not hold.
 * Every other fixture user holds channel 1 or nothing, so without this one no suite and no
 * visual check could put two consoles with DIFFERENT channels side by side.
 */
export const FAKE_CHANNEL_TWO_OPERATOR: FakePlayoutUser = {
  username: 'cg-op-ch2',
  sub: 'u-7715',
  name: 'رضا احمدی',
  roles: ['operator', 'viewer'],
  cgChannels: [{ host: '127.0.0.1', channel: 2 }],
};

/**
 * 🔴 `CHANNEL-AUTHORITY-01` — `cg-op-both` — **GRANTED CHANNEL 1 AND CHANNEL 2 OF THIS HOST: the
 * test Playout's real `cg-op2` grant, in shape.**
 *
 * That grant includes channel 1, which on the test Playout is the Playout's own live PROGRAMME
 * output. A station configured for channel 2 must still write nothing to channel 1 for this user:
 * the grant says who MAY operate a channel, never that THIS station operates it. With every other
 * fixture user holding one channel or none, no suite could put that difference on the wire.
 *
 * ⚠ Not called `cg-op2` here: that username already belongs to {@link FAKE_LONG_NAME_USER},
 * whose subject is name truncation, and moving it would edit six passing suites for a label.
 */
export const FAKE_BOTH_CHANNELS_OPERATOR: FakePlayoutUser = {
  username: 'cg-op-both',
  sub: 'u-8826',
  name: 'نرگس کریمی',
  roles: ['operator', 'viewer'],
  cgChannels: [
    { host: '127.0.0.1', channel: 1 },
    { host: '127.0.0.1', channel: 2 },
  ],
};

/**
 * 🔴 `MULTI-CHANNEL-01` §2 J — `cg-admin-ch2` — **A STATION-ADMIN OF THIS HOST'S CHANNEL 2: the
 * one fixture user who can apply Station setup on the demo station.**
 *
 * The demo (`pnpm dev:playout-auth`) declares its bank on channel 2, and the only station-admin
 * was {@link FAKE_ADMIN}, granted channel 1: its `fixedLayers.set-config` passed the ROLE check
 * and was then refused by the CHANNEL check (`authzChannelRefusal(2)`). So nobody in the demo
 * could apply Station setup — the owner met it. Same cumulative roles as `FAKE_ADMIN`, channel 2
 * of `127.0.0.1`. `FAKE_ADMIN` itself is untouched: suites pin its channel-1 shape.
 */
export const FAKE_CHANNEL_TWO_ADMIN: FakePlayoutUser = {
  username: 'cg-admin-ch2',
  sub: 'u-9937',
  name: 'مینا رحیمی',
  roles: ['station-admin', 'operator', 'viewer'],
  cgChannels: [{ host: '127.0.0.1', channel: 2 }],
};

/** The eight fixture users, by key. */
export const FAKE_USERS: Readonly<Record<FakeUserKey, FakePlayoutUser>> = {
  operator: FAKE_OPERATOR,
  viewer: FAKE_VIEWER,
  longName: FAKE_LONG_NAME_USER,
  admin: FAKE_ADMIN,
  adminChannelTwo: FAKE_CHANNEL_TWO_ADMIN,
  otherStation: FAKE_OTHER_STATION_USER,
  channelTwo: FAKE_CHANNEL_TWO_OPERATOR,
  bothChannels: FAKE_BOTH_CHANNELS_OPERATOR,
};

/**
 * Every error code this fake can answer with, mapped to its HTTP status (§4.1/§4.2/§4.4).
 *
 * ⚠ ONE table, because the pairing IS the contract: `423` for `account_locked` and `429` for
 * `rate_limited` are the two a hand-written handler gets wrong, and two handlers each
 * spelling their own status is how they come to disagree.
 */
const ERROR_STATUS = {
  invalid_credentials: 401,
  no_cg_access: 403,
  account_locked: 423,
  rate_limited: 429,
  invalid_refresh_token: 401,
  invalid_token: 401,
  not_found: 404,
  /** `PLAYOUT-SOURCES-01` — D11's bad parameter (§3 of their answer): a stale cursor, a bad limit. */
  invalid_query: 400,
} as const;

/** A contract error code. `not_found` is this fake's own; the SHAPE is the contract's (§4.6). */
export type FakePlayoutErrorCode = keyof typeof ERROR_STATUS;

/** The four codes D1 may answer a sign-in with — what {@link FakePlayout.setCredentialFailure} takes. */
export type FakeCredentialFailure =
  | 'invalid_credentials'
  | 'no_cg_access'
  | 'account_locked'
  | 'rate_limited';

/**
 * `message` is free text and Persian by the contract's own note (§4.6) — CG Control never
 * shows it verbatim, it maps `error` to its own sentence. Persian here also means the error
 * path carries non-ASCII, so a `Content-Length` counted in characters breaks a TEST rather
 * than a plant.
 */
const ERROR_MESSAGES: Readonly<Record<FakePlayoutErrorCode, string>> = {
  invalid_credentials: 'نام کاربری یا گذرواژه نادرست است.',
  no_cg_access: 'این کاربر دسترسی CG ندارد.',
  account_locked: 'حساب کاربری قفل شده است.',
  rate_limited: 'تعداد تلاش های ناموفق بیش از حد مجاز است.',
  invalid_refresh_token: 'توکن تازه سازی نامعتبر یا مصرف شده است.',
  invalid_token: 'توکن نامعتبر است.',
  not_found: 'چنین مسیری وجود ندارد.',
  invalid_query: 'پارامتر نامعتبر است.',
};

/**
 * Permissive CORS on EVERY response, preflights included (D5, §4.7).
 *
 * ⚠ The contract requires an EXACT origin rather than `*` _"when credentials are involved"_ —
 * they are not: the browser posts credentials in the BODY and carries the token in an
 * `Authorization` header, never a cookie, so `fetch` runs with `credentials: 'omit'` and `*`
 * is both legal and correct. `*` also keeps the fixture free of an origin list that every
 * test would then have to know. A test that needs the exact-origin path is testing the
 * PLAYOUT's configuration, which is not this file's subject.
 */
const CORS_HEADERS: Readonly<Record<string, string>> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Max-Age': '600',
};

/** How many requests the fake has actually SERVED, per endpoint. See {@link FakePlayout.requestCounts}. */
export interface FakePlayoutRequestCounts {
  jwks: number;
  token: number;
  refresh: number;
  revoked: number;
  /** D4 reads, `304`s included — a cadence test's positive control. */
  channels: number;
  /** `PLAYOUT-SOURCES-01` — D10 reads, `304`s and `404`s included. */
  inputs: number;
  /** `PLAYOUT-SOURCES-01` — D11 SEARCH requests (no `ids=`). */
  media: number;
  /** `PLAYOUT-SOURCES-01` — D11 `ids=` requests — the one retry's positive control. */
  mediaIds: number;
}

/**
 * One request as the fake RECEIVED it — `DESKTOP-APPS-01-B` B1's instrument: what the bridge
 * actually put on the wire (`Origin` absent, `Authorization` present) and from which address.
 */
export interface FakePlayoutRequest {
  readonly method: string;
  readonly path: string;
  /** Lower-cased names, as Node delivers them. */
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
  /** The TCP peer's address — what the Playout puts on its allow list (or pending). */
  readonly source: string;
}

/** Everything {@link FakePlayout.issueToken} lets a test override. All optional. */
export interface IssueTokenOptions {
  /** Which fixture user's `sub`/`name`/`roles`/`cg_channels` to mint. Default `'operator'`. */
  readonly user?: FakeUserKey;
  /** `iss`. Default: this server's own base URL — i.e. a token this bridge should accept. */
  readonly issuer?: string;
  /** `aud`. Default `'cg-control'`. */
  readonly audience?: string;
  /** `exp`, epoch SECONDS. Default: now + 12 h. */
  readonly expEpochSec?: number;
  /** `iat`, epoch seconds. Default: now. */
  readonly iatEpochSec?: number;
  /** `nbf`, epoch seconds. Omitted entirely unless given — the contract marks it MAY. */
  readonly nbfEpochSec?: number;
  /** `jti`. Default: a fresh UUID. */
  readonly jti?: string;
  /** `name`. Default: the chosen user's. Pass `''` to mint the empty-name refusal case. */
  readonly name?: string;
  /** `roles`. Default: the chosen user's. Pass `[]` to mint the empty-roles refusal case. */
  readonly roles?: readonly string[];
  /** `cg_channels`. Default: the chosen user's. */
  readonly cgChannels?: FakeCgChannels;
  /** Sign with a specific PUBLISHED `kid`. Throws if that kid is not in the JWKS. */
  readonly kid?: string;
  /**
   * Sign with a key that is NOT in the JWKS, under a `kid` header that is not published —
   * the unknown-`kid` path (§3.5's first check, and `JWKS_COOLDOWN_MS`'s reason to exist).
   *
   * ⚠ Both halves matter. A token signed by an unpublished key under a PUBLISHED `kid` tests
   * signature failure; this one tests key LOOKUP failure, and `jose` reaches them by
   * different routes.
   */
  readonly signWithRetiredKey?: boolean;
}

/** What a mint hands back: the compact token plus the claims it actually carries. */
export interface IssuedToken {
  readonly token: string;
  readonly jti: string;
  readonly claims: Record<string, unknown>;
}

/** The handle `startFakePlayout()` returns. */
export interface FakePlayout {
  /** `http://127.0.0.1:<ephemeral>`. Stable across {@link goOffline}/{@link goOnline}. */
  readonly baseUrl: string;
  /** The `iss` this server signs with, and what `playout.issuer` should be set to. Equals `baseUrl`. */
  readonly issuer: string;
  readonly jwksUrl: string;
  readonly tokenUrl: string;
  readonly refreshUrl: string;
  readonly revokedUrl: string;
  /** D4 — the channel catalogue. Bearer-gated, `ETag`'d. */
  readonly channelsUrl: string;
  /**
   * 🔴 Every bearer presented to D4, in order — so a spec can say WHOSE credential a catalogue
   * read carried, and that a revoked or expired one never was.
   */
  readonly channelsBearers: readonly string[];
  /** Replace the catalogue (and change its `ETag`, so a polling bridge sees the change). */
  setChannels(rows: readonly FakeCatalogueRow[]): void;
  /**
   * `UI-POLISH-01` G — set one channel's `output` and/or `playlist` (a key left out is kept, `null`
   * removes it), and change the `ETag`, so the bridge sees it at its NEXT read and not before.
   */
  setChannelState(casparChannel: number, state: FakeChannelState): void;
  /**
   * The `kid` new tokens are currently signed with.
   *
   * ⚠ Exposed because the FIRST key's id is otherwise unobtainable — only `rotateKey()`
   * returns one — which would make `issueToken({ kid })` unusable for the original key and
   * "the retired kid still verifies" (§3.5's 24 h rule) untestable.
   */
  readonly activeKid: string;
  /**
   * 🔴 **LIVE counters, not a snapshot** — the same object every read returns, so a test can
   * hold it and watch it move.
   *
   * ⚠ **This is a cadence test's POSITIVE CONTROL and exists for that reason.** A test
   * asserting "the bridge polls D9 at most once per 60 s" proves it by seeing `revoked` NOT
   * move across a second trigger — and a counter that never moves AT ALL passes that
   * assertion having measured nothing (a wrong URL, an unbound port, a request that 404s
   * before it is counted). So such a test must FIRST watch the number go 0 → 1, and only
   * then assert it stays at 1. A negative observation is void until the instrument is proven
   * live.
   *
   * ⚠ `OPTIONS` preflights are NOT counted. They are not reads of the resource, and counting
   * them would make `token: 1` mean "one browser sign-in" on one host and "two" on another.
   */
  readonly requestCounts: FakePlayoutRequestCounts;
  /** `DESKTOP-APPS-01-B` — every request served, in order, `OPTIONS` included. LIVE, like the counts. */
  readonly requestLog: readonly FakePlayoutRequest[];
  /** D8 (`/api/cg/me`) — who the bearer is. Introduces nothing. */
  readonly meUrl: string;
  /** Is this source address on the AMCP allow list? Wire an AMCP mock's `admit` to it. */
  isTrusted(sourceAddress: string): boolean;
  /** Every source on the allow list. */
  readonly trustedSources: readonly string[];
  /** Every source waiting for the administrator's approval. */
  readonly pendingSources: readonly string[];
  /** Has the automatic path been used up (one machine, once per install)? */
  readonly sealed: boolean;
  /** TEST-ONLY — the administrator clicks APPROVE for this source: pending → allowed. */
  approve(sourceAddress: string): void;

  /** Close the listener for good. Safe to call twice. */
  stop(): Promise<void>;
  /**
   * Close the listener while KEEPING the port — "the Playout is unreachable", with no URL
   * anywhere having changed. Every open connection is destroyed, so this resolves promptly
   * instead of waiting on a keep-alive socket.
   */
  goOffline(): Promise<void>;
  /**
   * Re-listen on the SAME port.
   *
   * ⚠ It can fail with `EADDRINUSE` if something grabbed the port during the outage. That is
   * a LOUD failure and the right one: the alternative — listening on a fresh port — would
   * leave every configured URL pointing at nothing while the fixture reported success.
   */
  goOnline(): Promise<void>;
  /**
   * Rotate to a NEW ES256 key, publishing BOTH in the JWKS.
   *
   * This is the contract's own rotation rule (§3.5): publish the new key before signing with
   * it and keep the previous `kid` for ≥ 24 h. A token minted before the rotation therefore
   * still verifies.
   */
  rotateKey(): Promise<{ kid: string }>;
  /**
   * Rotate and publish ONLY the new key — the contract VIOLATED, which is the point.
   *
   * A token signed by the retired key becomes unverifiable, so this is how a test drives
   * "the operator is signed out because the Playout dropped the key that signed them in"
   * without waiting 24 h.
   */
  rotateKeyReplacing(): Promise<{ kid: string }>;
  /** Add a `jti` to the D9 list. `exp` is epoch seconds and must be in the FUTURE to survive
   * the bridge's own pruning of stale entries. */
  revoke(jti: string, exp: number): void;
  /** Empty the D9 list (and change its `ETag`, so a polling bridge sees the change). */
  unrevokeAll(): void;
  /**
   * Make D1 answer with `code` instead of issuing a token; `null` restores normal sign-in.
   *
   * ⚠ A Playout DECISION, driven explicitly, never inferred from a user's claims — see
   * {@link FAKE_VIEWER} for why an empty channel list is not `no_cg_access`.
   */
  setCredentialFailure(code: FakeCredentialFailure | null): void;
  /** Mint a token directly, bypassing D1 — the only way to reach the malformed/expired cases. */
  issueToken(options?: IssueTokenOptions): Promise<IssuedToken>;

  // ── `PLAYOUT-SOURCES-01` §3 — D10 and D11, and their test-only hooks ──────────────────────
  /** D10 — the Playout's inputs. Bearer-gated, `ETag`'d. */
  readonly inputsUrl: string;
  /** D11 — the Playout's media library. Bearer-gated. */
  readonly mediaUrl: string;
  /** Every D11 request's query string, in order — what the bridge actually asked. LIVE. */
  readonly mediaQueries: readonly string[];
  /** The inputs D10 lists now, in order. */
  readonly inputs: readonly FakeInput[];
  /**
   * "CG Control" in the Playout's settings: switched OFF, D10 and D11 answer `404` (their answer
   * §3). Default on.
   */
  setCgEnabled(enabled: boolean): void;
  /** Replace the whole input list (and change D10's `ETag`). */
  setInputs(inputs: readonly FakeInput[]): void;
  /** Take one input off the list; answers whether it was there. */
  removeInput(id: string): boolean;
  /** Put a removed input back, at its place in {@link FAKE_INPUTS}. */
  restoreInput(id: string): void;
  /** v1.3's top-level `epoch` (it changes with every core start); `null` sends none. */
  setEpoch(epoch: number | string | null): void;
  /**
   * `ROUTE-PLATES-01` — v1.3's epoch as the Playout WRITES it: a 64-bit JSON integer, its digits
   * verbatim in the body. A JS number cannot carry one past 2^53, so this is the only way the fake
   * can send what a real core's epoch looks like. `setEpoch` replaces it.
   */
  setEpochLiteral(digits: string): void;
  /**
   * `ROUTE-PLATES-01` §1.H — a core restart: a new `epoch`, every held input's holder layer
   * renumbered ({@link renumberHolders}), and — through `dropAmcp`, wired by the test to the AMCP
   * mock's `closeAllAmcpConnections` — the AMCP connection dropped. Answers the new epoch.
   */
  simulateCoreRestart(options?: { readonly dropAmcp?: () => void }): number | string;
  /** One media item as the library holds it now, or `undefined`. */
  mediaItem(id: string): FakeMediaItem | undefined;
  /** Take one media item out of the library ("not playable now"); answers whether it was there. */
  removeMedia(id: string): boolean;
  /** Put a removed media item back. */
  restoreMedia(id: string): void;
  /**
   * Move one item's `clip` between its cache copy and its original (§2.1: the path moves; the content
   * does not). Answers the NEW clip.
   */
  flipMediaClip(id: string): string;
}

/** A generated key pair plus the public JWK the JWKS would publish for it. */
interface FakeSigningKey {
  readonly kid: string;
  readonly privateKey: CryptoKey;
  readonly publicJwk: JWK;
}

/**
 * Generate one ES256 pair and its public JWK.
 *
 * `extractable: true` is the private half's flag (the public half always is). It is set so
 * the pair can be exported if a future test needs a PEM — and, more usefully here, so this
 * function is the ONLY place key material comes from: there is no file to read and no
 * environment variable to consult.
 */
async function mintSigningKey(kid: string): Promise<FakeSigningKey> {
  const { privateKey, publicKey } = await generateKeyPair('ES256', { extractable: true });
  const jwk = await exportJWK(publicKey);
  // `kid`/`alg`/`use` are what §4.3 shows and what `jose` matches a token's header against.
  return { kid, privateKey, publicJwk: { ...jwk, kid, alg: 'ES256', use: 'sig' } };
}

/** `listen`, as a promise that rejects on the bind error instead of throwing it at the process. */
function listen(server: http.Server, port: number, host: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (err: Error): void => {
      server.removeListener('listening', onListening);
      reject(err);
    };
    const onListening = (): void => {
      server.removeListener('error', onError);
      resolve();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, host);
  });
}

/** Collect a request body as UTF-8 text. */
function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.setEncoding('utf8');
    req.on('data', (chunk: string) => {
      raw += chunk;
    });
    req.on('end', () => {
      resolve(raw);
    });
    req.on('error', reject);
  });
}

/** Parse a body, or `null` — a malformed body is a client error here, never a fixture crash. */
function parseJsonObject(raw: string): Record<string, unknown> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
  return parsed as Record<string, unknown>;
}

function readString(body: Record<string, unknown>, key: string): string | null {
  const value = body[key];
  return typeof value === 'string' ? value : null;
}

/**
 * Write a JSON response.
 *
 * ⚠ **`Content-Length` is the BYTE length, which is why the body is serialized to a `Buffer`
 * first.** Every fixture name here is Persian, where one character is two UTF-8 bytes: a
 * length counted in characters truncates the response mid-name, and the symptom is a JSON
 * parse error in the BRIDGE — as far from the cause as it is possible to be. The contract's
 * own acceptance checklist has a line for exactly this ("`name` carries Persian correctly …
 * no mojibake").
 */
function sendJson(
  res: http.ServerResponse,
  status: number,
  body: unknown,
  extraHeaders: Readonly<Record<string, string>> = {},
): void {
  sendJsonText(res, status, JSON.stringify(body), extraHeaders);
}

/** A JSON body already written as text — for a value `JSON.stringify` cannot spell (a 64-bit int). */
function sendJsonText(
  res: http.ServerResponse,
  status: number,
  text: string,
  extraHeaders: Readonly<Record<string, string>> = {},
): void {
  const payload = Buffer.from(text, 'utf8');
  res.writeHead(status, {
    ...CORS_HEADERS,
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': String(payload.byteLength),
    ...extraHeaders,
  });
  res.end(payload);
}

/** The contract's one error shape (§4.6): a stable snake_case `error` plus free-text `message`. */
function sendError(res: http.ServerResponse, code: FakePlayoutErrorCode): void {
  sendJson(res, ERROR_STATUS[code], { error: code, message: ERROR_MESSAGES[code] });
}

class FakePlayoutServer implements FakePlayout {
  readonly #server = http.createServer();
  /** Every open connection, so an outage can be made to happen NOW rather than eventually. */
  readonly #sockets = new Set<Socket>();
  readonly #counts: FakePlayoutRequestCounts = {
    jwks: 0,
    token: 0,
    refresh: 0,
    revoked: 0,
    channels: 0,
    inputs: 0,
    media: 0,
    mediaIds: 0,
  };
  // `PLAYOUT-SOURCES-01` — D10, D11 and their switch.
  #cgEnabled = true;
  #inputs: readonly FakeInput[] = FAKE_INPUTS;
  #inputsRevision = 0;
  #epoch: number | string | null = 'epoch-1';
  /** `ROUTE-PLATES-01` — an epoch sent as raw digits ({@link FakePlayout.setEpochLiteral}). */
  #epochLiteral: string | null = null;
  readonly #library = new Map<string, FakeMediaItem>(fakeMediaLibrary().map((m) => [m.id, m]));
  readonly #removedMedia = new Map<string, FakeMediaItem>();
  readonly #mediaQueries: string[] = [];
  readonly #requestLog: FakePlayoutRequest[] = [];
  /** `DESKTOP-APPS-01-C` C8 — the AMCP allow list, the pending list, and the one automatic slot. */
  readonly #trusted = new Set<string>();
  readonly #pending = new Set<string>();
  #sealed = false;
  readonly #sealOnLoopback: boolean;
  readonly #listenHost: string;
  /** `DESKTOP-APPS-01-D` i — a per-user grant override, for D1, D2 and minted tokens alike. */
  readonly #grants: Partial<Record<FakeUserKey, FakeCgChannels>>;
  #catalogue: readonly FakeCatalogueRow[] = FAKE_CATALOGUE;
  /** Bumped by every catalogue change, and spelled into D4's `ETag` — D9's revision rule. */
  #catalogueRevision = 0;
  readonly #channelsBearers: string[] = [];

  /** Published public keys, newest first. The JWKS is exactly this list. */
  #published: FakeSigningKey[];
  /** The key new tokens are signed with. Always one of {@link #published}. */
  #active: FakeSigningKey;
  /** Generated at boot, NEVER published — `signWithRetiredKey`'s key. */
  readonly #unpublished: FakeSigningKey;
  #keySeq: number;

  /** `jti` → `exp` (epoch seconds), in insertion order so the D9 body is deterministic. */
  readonly #revoked = new Map<string, number>();
  /**
   * Bumped by every mutation of {@link #revoked}, and spelled into the `ETag`.
   *
   * ⚠ A revision counter rather than a hash of the body: it changes on a change that a hash
   * would call identical (revoke `X`, unrevoke all, revoke `X` again), which is the direction
   * a caching bug hides in — a bridge that kept a stale list would still look right.
   */
  #revokedRevision = 0;

  /** Opaque refresh token → which user it refreshes. Deleted on use (§4.2 rotation). */
  readonly #refreshTokens = new Map<string, FakeUserKey>();

  #credentialFailure: FakeCredentialFailure | null = null;
  #port = 0;
  #listening = false;

  constructor(
    active: FakeSigningKey,
    unpublished: FakeSigningKey,
    keySeq: number,
    options: FakePlayoutOptions,
  ) {
    this.#sealOnLoopback = options.sealOnLoopback ?? true;
    this.#listenHost = options.listenHost ?? '127.0.0.1';
    this.#grants = options.grants ?? {};
    this.#published = [active];
    this.#active = active;
    this.#unpublished = unpublished;
    this.#keySeq = keySeq;

    this.#server.on('connection', (socket: Socket) => {
      this.#sockets.add(socket);
      socket.on('close', () => {
        this.#sockets.delete(socket);
      });
    });
    this.#server.on('request', (req: http.IncomingMessage, res: http.ServerResponse) => {
      void this.#route(req, res).catch((err: unknown) => {
        // A fixture bug must not hang the test on a socket that never answers.
        if (!res.headersSent) {
          sendJson(res, 500, { error: 'fake_playout_failed', message: String(err) });
        } else {
          res.destroy();
        }
      });
    });
  }

  /** Bind an ephemeral loopback port. Called once, by {@link startFakePlayout}. */
  async start(): Promise<void> {
    await listen(this.#server, 0, this.#listenHost);
    // Flagged BEFORE the address is read, so the failure path below can actually close the
    // listener it just opened — `stop()` is a no-op while this flag is false.
    this.#listening = true;
    const address: AddressInfo | string | null = this.#server.address();
    if (address === null || typeof address === 'string') {
      await this.stop();
      throw new Error('fake Playout: listener reported no TCP address');
    }
    this.#port = address.port;
  }

  get baseUrl(): string {
    return `http://127.0.0.1:${String(this.#port)}`;
  }

  /** Byte-for-byte what `playout.issuer` must be configured as (ADR 0010 rule 1). */
  get issuer(): string {
    return this.baseUrl;
  }

  get jwksUrl(): string {
    return `${this.baseUrl}${PATHS.jwks}`;
  }

  get tokenUrl(): string {
    return `${this.baseUrl}${PATHS.token}`;
  }

  get refreshUrl(): string {
    return `${this.baseUrl}${PATHS.refresh}`;
  }

  get revokedUrl(): string {
    return `${this.baseUrl}${PATHS.revoked}`;
  }

  get channelsUrl(): string {
    return `${this.baseUrl}${PATHS.channels}`;
  }

  get channelsBearers(): readonly string[] {
    return this.#channelsBearers;
  }

  setChannels(rows: readonly FakeCatalogueRow[]): void {
    this.#catalogue = rows;
    this.#catalogueRevision += 1;
  }

  setChannelState(casparChannel: number, state: FakeChannelState): void {
    const apply = (
      row: FakeCatalogueRow,
      key: 'output' | 'playlist',
      value: string | null | undefined,
    ): FakeCatalogueRow => {
      if (value === undefined) return row;
      const { [key]: _dropped, ...rest } = row;
      return value === null ? rest : { ...rest, [key]: value };
    };
    this.setChannels(
      this.#catalogue.map((row) =>
        row.casparChannel === casparChannel
          ? apply(apply(row, 'output', state.output), 'playlist', state.playlist)
          : row,
      ),
    );
  }

  get activeKid(): string {
    return this.#active.kid;
  }

  get requestCounts(): FakePlayoutRequestCounts {
    return this.#counts;
  }

  get requestLog(): readonly FakePlayoutRequest[] {
    return this.#requestLog;
  }

  get meUrl(): string {
    return `${this.baseUrl}${PATHS.me}`;
  }

  get inputsUrl(): string {
    return `${this.baseUrl}${PATHS.inputs}`;
  }

  get mediaUrl(): string {
    return `${this.baseUrl}${PATHS.media}`;
  }

  get mediaQueries(): readonly string[] {
    return this.#mediaQueries;
  }

  get inputs(): readonly FakeInput[] {
    return this.#inputs;
  }

  setCgEnabled(enabled: boolean): void {
    this.#cgEnabled = enabled;
  }

  setInputs(inputs: readonly FakeInput[]): void {
    this.#inputs = inputs;
    this.#inputsRevision += 1;
  }

  removeInput(id: string): boolean {
    const had = this.#inputs.some((i) => i.id === id);
    if (had) this.setInputs(this.#inputs.filter((i) => i.id !== id));
    return had;
  }

  restoreInput(id: string): void {
    if (this.#inputs.some((i) => i.id === id)) return;
    const wanted = new Set([...this.#inputs.map((i) => i.id), id]);
    // Back at its place in the fixture order — the Playout's order is the list's order.
    this.setInputs(FAKE_INPUTS.filter((i) => wanted.has(i.id)));
  }

  setEpoch(epoch: number | string | null): void {
    this.#epoch = epoch;
    this.#epochLiteral = null;
    this.#inputsRevision += 1;
  }

  setEpochLiteral(digits: string): void {
    if (!/^\d+$/.test(digits)) throw new Error(`fake Playout: not an integer literal: ${digits}`);
    this.#epochLiteral = digits;
    this.#inputsRevision += 1;
  }

  simulateCoreRestart(options: { readonly dropAmcp?: () => void } = {}): number | string {
    // A 64-bit literal counts up as the integer it is — never through a JS number.
    const literal = this.#epochLiteral;
    const next = literal !== null ? String(BigInt(literal) + 1n) : nextEpoch(this.#epoch);
    if (literal !== null) this.#epochLiteral = String(next);
    else this.#epoch = next;
    this.#inputs = renumberHolders(this.#inputs);
    this.#inputsRevision += 1;
    options.dropAmcp?.();
    return next;
  }

  mediaItem(id: string): FakeMediaItem | undefined {
    return this.#library.get(id);
  }

  removeMedia(id: string): boolean {
    const item = this.#library.get(id);
    if (item === undefined) return false;
    this.#library.delete(id);
    this.#removedMedia.set(id, item);
    return true;
  }

  restoreMedia(id: string): void {
    const item = this.#removedMedia.get(id);
    if (item === undefined) return;
    this.#removedMedia.delete(id);
    this.#library.set(id, item);
  }

  flipMediaClip(id: string): string {
    const item = this.#library.get(id);
    if (item === undefined) throw new Error(`fake Playout: no media item ${id}`);
    const cached = item.clip.includes('/Engine/bin/engine/data/cache/');
    const clip = cached ? originalClip(item.folder, item.name, 'mp4') : cacheClip(item.id);
    this.#library.set(id, { ...item, clip });
    return clip;
  }

  isTrusted(sourceAddress: string): boolean {
    return this.#trusted.has(sourceAddress.replace(/^::ffff:/, ''));
  }

  get trustedSources(): readonly string[] {
    return [...this.#trusted];
  }

  get pendingSources(): readonly string[] {
    return [...this.#pending];
  }

  get sealed(): boolean {
    return this.#sealed;
  }

  approve(sourceAddress: string): void {
    const source = sourceAddress.replace(/^::ffff:/, '');
    this.#pending.delete(source);
    this.#trusted.add(source);
  }

  /** The account a token speaks for — by `sub`, from the Playout's own records, never the token. */
  #accountOf(sub: unknown): FakePlayoutUser | undefined {
    return Object.values(FAKE_USERS).find((u) => u.sub === sub);
  }

  /**
   * 🔴 `DESKTOP-APPS-01-C` C8 — **THE INTRODUCTION, on one D9 read.** No `Origin` (a browser always
   * sends one), a bearer that verifies against THIS Playout's keys with the contract's audience,
   * not expired, not revoked, for a known account. Then, for a source not already allowed:
   *
   *   - the automatic path unsealed: it seals now, whoever this is; a `station-admin` account from a
   *     non-loopback source (or any source, with `sealOnLoopback: false`) is ALLOWED, anyone else is
   *     PENDING;
   *   - sealed: a `station-admin` account's source is PENDING until approved; anyone else, nothing.
   *
   * Anything short of the first sentence introduces nothing, silently, as the Playout does.
   */
  async #introduce(req: http.IncomingMessage): Promise<void> {
    if (req.headers.origin !== undefined) return;
    const authorization = req.headers.authorization;
    if (authorization === undefined || !authorization.startsWith('Bearer ')) return;
    let account: FakePlayoutUser | undefined;
    try {
      const { payload } = await jwtVerify(
        authorization.slice('Bearer '.length),
        createLocalJWKSet({ keys: this.#published.map((k) => k.publicJwk) }),
        { audience: CONTRACT_AUDIENCE },
      );
      if (typeof payload.jti === 'string' && this.#revoked.has(payload.jti)) return;
      account = this.#accountOf(payload.sub);
    } catch {
      return; // Unverifiable, expired, wrong audience: nothing, and no answer changes because of it.
    }
    if (account === undefined) return;
    const source = (req.socket.remoteAddress ?? '').replace(/^::ffff:/, '');
    if (this.#trusted.has(source)) return;
    const admin = account.roles.includes('station-admin');
    if (!this.#sealed) {
      this.#sealed = true;
      const loopback = /^127\./.test(source) || source === '::1';
      if (admin && !(loopback && this.#sealOnLoopback)) this.#trusted.add(source);
      else this.#pending.add(source);
      return;
    }
    if (admin) this.#pending.add(source);
  }

  async stop(): Promise<void> {
    await this.#closeListener();
  }

  async goOffline(): Promise<void> {
    await this.#closeListener();
  }

  async goOnline(): Promise<void> {
    if (this.#listening) return;
    await listen(this.#server, this.#port, this.#listenHost);
    this.#listening = true;
  }

  async #closeListener(): Promise<void> {
    if (!this.#listening) return;
    this.#listening = false;
    // Destroy first: `close()` only stops NEW connections and would otherwise wait for a
    // keep-alive socket the bridge is holding open, turning "go offline" into "go offline in
    // five seconds" — long enough for a cadence assertion to have already been taken.
    for (const socket of this.#sockets) socket.destroy();
    this.#sockets.clear();
    await new Promise<void>((resolve) => {
      this.#server.close(() => {
        resolve();
      });
    });
  }

  async rotateKey(): Promise<{ kid: string }> {
    const next = await this.#mintNextKey();
    this.#published = [next, ...this.#published];
    this.#active = next;
    return { kid: next.kid };
  }

  async rotateKeyReplacing(): Promise<{ kid: string }> {
    const next = await this.#mintNextKey();
    this.#published = [next];
    this.#active = next;
    return { kid: next.kid };
  }

  async #mintNextKey(): Promise<FakeSigningKey> {
    this.#keySeq += 1;
    return mintSigningKey(`fake-key-${String(this.#keySeq)}`);
  }

  revoke(jti: string, exp: number): void {
    this.#revoked.set(jti, exp);
    this.#revokedRevision += 1;
  }

  unrevokeAll(): void {
    this.#revoked.clear();
    this.#revokedRevision += 1;
  }

  setCredentialFailure(code: FakeCredentialFailure | null): void {
    this.#credentialFailure = code;
  }

  async issueToken(options: IssueTokenOptions = {}): Promise<IssuedToken> {
    const userKey = options.user ?? 'operator';
    const user = FAKE_USERS[userKey];
    const nowSec = Math.floor(Date.now() / 1000);
    const jti = options.jti ?? randomUUID();
    const claims: JWTPayload = {
      iss: options.issuer ?? this.issuer,
      aud: options.audience ?? CONTRACT_AUDIENCE,
      sub: user.sub,
      name: options.name ?? user.name,
      roles: [...(options.roles ?? user.roles)],
      cg_channels: options.cgChannels ?? this.#grants[userKey] ?? user.cgChannels,
      iat: options.iatEpochSec ?? nowSec,
      exp: options.expEpochSec ?? nowSec + ACCESS_TOKEN_TTL_SEC,
      jti,
      // `nbf` is MAY: ABSENT unless asked for, rather than present-and-permissive. A claim
      // the contract calls optional must be testable in its absent form, which is the form
      // every real token will have.
      ...(options.nbfEpochSec === undefined ? {} : { nbf: options.nbfEpochSec }),
    };

    const key = this.#signingKeyFor(options);
    const token = await new SignJWT(claims)
      .setProtectedHeader({ alg: 'ES256', kid: key.kid, typ: 'JWT' })
      .sign(key.privateKey);
    return { token, jti, claims };
  }

  #signingKeyFor(options: IssueTokenOptions): FakeSigningKey {
    if (options.signWithRetiredKey === true) return this.#unpublished;
    if (options.kid === undefined) return this.#active;
    const named = this.#published.find((k) => k.kid === options.kid);
    if (named === undefined) {
      // Loudly, with the published set named: a silent fall-back to the active key would
      // make "the retired kid still verifies" pass while testing the CURRENT key.
      throw new Error(
        `fake Playout: no published key with kid ${JSON.stringify(options.kid)} ` +
          `(published: ${this.#published.map((k) => k.kid).join(', ')})`,
      );
    }
    return named;
  }

  async #route(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const method = req.method ?? 'GET';
    // The base is a formality — `req.url` is always origin-form on a server — and it is what
    // strips a query string before the path is matched.
    const pathname = new URL(req.url ?? '/', this.baseUrl).pathname;
    this.#requestLog.push({
      method,
      path: pathname,
      headers: { ...req.headers },
      source: (req.socket.remoteAddress ?? '').replace(/^::ffff:/, ''),
    });

    if (method === 'OPTIONS') {
      // 204 and nothing else. Not counted: a preflight is not a read of the resource.
      res.writeHead(204, CORS_HEADERS);
      res.end();
      return;
    }

    if (method === 'GET' && pathname === PATHS.jwks) {
      this.#counts.jwks += 1;
      this.#serveJwks(res);
      return;
    }
    if (method === 'POST' && pathname === PATHS.token) {
      this.#counts.token += 1;
      await this.#serveToken(req, res);
      return;
    }
    if (method === 'POST' && pathname === PATHS.refresh) {
      this.#counts.refresh += 1;
      await this.#serveRefresh(req, res);
      return;
    }
    if (method === 'GET' && pathname === PATHS.revoked) {
      this.#counts.revoked += 1;
      // C8 — D9 alone introduces; judged before the answer, so a caller holding the answer can
      // rely on the list.
      await this.#introduce(req);
      this.#serveRevoked(req, res);
      return;
    }
    if (method === 'GET' && pathname === PATHS.channels) {
      this.#counts.channels += 1;
      this.#serveChannels(req, res);
      return;
    }
    if (method === 'GET' && pathname === PATHS.me) {
      this.#serveMe(req, res);
      return;
    }
    if (method === 'GET' && pathname === PATHS.inputs) {
      this.#counts.inputs += 1;
      this.#serveInputs(req, res);
      return;
    }
    if (method === 'GET' && pathname === PATHS.media) {
      const query = new URL(req.url ?? '/', this.baseUrl).searchParams;
      if (query.has('ids')) this.#counts.mediaIds += 1;
      else this.#counts.media += 1;
      this.#mediaQueries.push(query.toString());
      this.#serveMedia(req, res, query);
      return;
    }
    sendError(res, 'not_found');
  }

  /**
   * `PLAYOUT-SOURCES-01` — D10 (their answer §1, v1.3): the inputs, bearer-gated, `ETag`/`304`, a
   * top-level `epoch` when one is set, and `404` while CG Control is switched off (§3).
   */
  #serveInputs(req: http.IncomingMessage, res: http.ServerResponse): void {
    if (!this.#cgEnabled) {
      sendError(res, 'not_found');
      return;
    }
    const authorization = req.headers.authorization;
    if (authorization === undefined || !authorization.startsWith('Bearer ')) {
      sendError(res, 'invalid_token');
      return;
    }
    const etag = `"inputs-${String(this.#inputsRevision)}"`;
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, { ...CORS_HEADERS, ETag: etag });
      res.end();
      return;
    }
    if (this.#epochLiteral !== null) {
      // The digits go into the TEXT verbatim — the one form a 64-bit integer survives in.
      const text = `{"epoch":${this.#epochLiteral},"inputs":${JSON.stringify(this.#inputs)}}`;
      sendJsonText(res, 200, text, { ETag: etag });
      return;
    }
    sendJson(
      res,
      200,
      { ...(this.#epoch !== null ? { epoch: this.#epoch } : {}), inputs: this.#inputs },
      { ETag: etag },
    );
  }

  /**
   * `PLAYOUT-SOURCES-01` — D11 (their answer §2.2): `q` normalised and matched on the name and the
   * readable folder; `type` a comma list; `sort=name` (fa-IR, then id) or `recent` (`updatedAt`
   * descending); `limit` 50 by default, clamped at 200, `400` when not a positive number; a KEYSET
   * cursor bound to its `q`/`type`/`sort` (`400` for another query); and `ids=` — at most 100, answered
   * in REQUEST order, an id the library no longer holds simply absent.
   */
  #serveMedia(req: http.IncomingMessage, res: http.ServerResponse, query: URLSearchParams): void {
    if (!this.#cgEnabled) {
      sendError(res, 'not_found');
      return;
    }
    const authorization = req.headers.authorization;
    if (authorization === undefined || !authorization.startsWith('Bearer ')) {
      sendError(res, 'invalid_token');
      return;
    }
    const answer = answerFakeMediaQuery(this.#library.values(), query);
    if (answer === null) {
      sendError(res, 'invalid_query');
      return;
    }
    sendJson(res, 200, answer);
  }

  /**
   * D4 (§4) — the channel catalogue, bearer-gated like D9 and with the same `ETag` round trip.
   *
   * ⚠ It refuses a missing bearer and records every presented one; it does NOT itself verify the
   * token, because the property worth testing is the BRIDGE's — that it never presents a revoked
   * or expired credential — and a fake that refused one would hide a bridge that tried.
   */
  #serveChannels(req: http.IncomingMessage, res: http.ServerResponse): void {
    const authorization = req.headers.authorization;
    if (authorization === undefined || !authorization.startsWith('Bearer ')) {
      sendError(res, 'invalid_token');
      return;
    }
    this.#channelsBearers.push(authorization.slice('Bearer '.length));
    const etag = `"channels-${String(this.#catalogueRevision)}"`;
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, { ...CORS_HEADERS, ETag: etag });
      res.end();
      return;
    }
    sendJson(res, 200, { channels: this.#catalogue }, { ETag: etag });
  }

  /** D8 — the bearer's principal, as the contract echoes it. It introduces nothing (C8). */
  #serveMe(req: http.IncomingMessage, res: http.ServerResponse): void {
    const authorization = req.headers.authorization;
    if (authorization === undefined || !authorization.startsWith('Bearer ')) {
      sendError(res, 'invalid_token');
      return;
    }
    sendJson(res, 200, { ok: true });
  }

  /** D3 (§4.3) — public, no auth, and cacheable for an hour exactly as the contract says. */
  #serveJwks(res: http.ServerResponse): void {
    sendJson(
      res,
      200,
      { keys: this.#published.map((k) => k.publicJwk) },
      { 'Cache-Control': 'public, max-age=3600' },
    );
  }

  /** D1 (§4.1) — sign in. */
  async #serveToken(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const body = parseJsonObject(await readBody(req));
    if (this.#credentialFailure !== null) {
      // Checked BEFORE the credentials so a test can drive `rate_limited` or `account_locked`
      // with a perfectly good username and password — which is what those two actually are.
      sendError(res, this.#credentialFailure);
      return;
    }
    if (body === null) {
      sendError(res, 'invalid_credentials');
      return;
    }
    const username = readString(body, 'username');
    const password = readString(body, 'password');
    const key = (Object.keys(FAKE_USERS) as FakeUserKey[]).find(
      (k) => FAKE_USERS[k].username === username,
    );
    if (key === undefined || password !== FAKE_PLAYOUT_PASSWORD) {
      sendError(res, 'invalid_credentials');
      return;
    }
    await this.#sendSignInBody(res, key);
  }

  /** D2 (§4.2) — refresh, rotating the refresh token on use. */
  async #serveRefresh(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const body = parseJsonObject(await readBody(req));
    const presented = body === null ? null : readString(body, 'refresh_token');
    const key = presented === null ? undefined : this.#refreshTokens.get(presented);
    if (presented === null || key === undefined) {
      // Unknown AND used-after-rotation land here together, because the rotation below
      // DELETES the spent token — which is what makes a replay indistinguishable from a
      // forgery, on purpose.
      sendError(res, 'invalid_refresh_token');
      return;
    }
    this.#refreshTokens.delete(presented);
    await this.#sendSignInBody(res, key);
  }

  /** The §4.1 body, shared by D1 and D2 — one shape, so the two cannot drift apart. */
  async #sendSignInBody(res: http.ServerResponse, key: FakeUserKey): Promise<void> {
    const user = FAKE_USERS[key];
    const issued = await this.issueToken({ user: key });
    const refreshToken = `refresh-${randomUUID()}`;
    this.#refreshTokens.set(refreshToken, key);
    sendJson(res, 200, {
      token_type: 'Bearer',
      access_token: issued.token,
      expires_in: ACCESS_TOKEN_TTL_SEC,
      refresh_token: refreshToken,
      // The UI convenience echo (§4.1). ⚠ The BRIDGE trusts only the JWT — so this is spelled
      // from the user record rather than from `issued.claims`, and a test that finds the two
      // disagreeing has found the console trusting the wrong one.
      principal: {
        sub: user.sub,
        name: user.name,
        roles: [...user.roles],
        cg_channels: this.#grants[key] ?? user.cgChannels,
      },
    });
  }

  /** D9 (v1.1) — the revocation list, with the ETag round-trip the bridge relies on. */
  #serveRevoked(req: http.IncomingMessage, res: http.ServerResponse): void {
    const authorization = req.headers.authorization;
    if (authorization === undefined || !authorization.startsWith('Bearer ')) {
      // ⚠ The bridge has no credential of its own and uses a live operator token as the
      // bearer. Refusing here is what makes "it forgot to attach one" fail a test instead of
      // quietly polling as nobody.
      sendError(res, 'invalid_token');
      return;
    }
    const etag = `"revoked-${String(this.#revokedRevision)}"`;
    if (req.headers['if-none-match'] === etag) {
      // 304 carries NO body and no `Content-Type`/`Content-Length`; a bridge that tried to
      // parse one would hang or throw, which is the bug this branch exists to expose.
      res.writeHead(304, { ...CORS_HEADERS, ETag: etag });
      res.end();
      return;
    }
    const revoked = [...this.#revoked.entries()].map(([jti, exp]) => ({ jti, exp }));
    sendJson(res, 200, { revoked }, { ETag: etag });
  }
}

/**
 * Start a fake Playout on an ephemeral loopback port.
 *
 * ⚠ Register the teardown at the moment it starts, never on the last line of the test —
 * `harness.ts`'s flake family 1, verbatim:
 *
 * ```ts
 * const playout = track(await startFakePlayout(), (p) => p.stop());
 * ```
 */
/** How a fake Playout is started. Both optional; the defaults are the real Playout's behaviour. */
export interface FakePlayoutOptions {
  /**
   * `DESKTOP-APPS-01-C` C8 — does a LOOPBACK first contact seal the automatic path (the real
   * Playout's rule)? Default `true`. Every suite runs on loopback, so a suite that exercises the
   * automatic path — the FIRST machine let in without an approval — passes `false`.
   */
  readonly sealOnLoopback?: boolean;
  /** Where to listen. Default `127.0.0.1`; `::` (dual-stack) lets an IPv6 client in too (C6). */
  readonly listenHost?: string;
  /**
   * `DESKTOP-APPS-01-D` i — a fixture user's `cg_channels`, overridden for this Playout: the
   * real `cg-admin` holds channels 1 AND 2 of the test Playout, which `FAKE_ADMIN` does not.
   */
  readonly grants?: Partial<Record<FakeUserKey, FakeCgChannels>>;
}

export async function startFakePlayout(options: FakePlayoutOptions = {}): Promise<FakePlayout> {
  const active = await mintSigningKey('fake-key-1');
  /*
    The never-published key. Its `kid` says so in the string itself, because it will show up in
    a decoded header in somebody's debugger at 02:00 and the alternative — `fake-key-0` — reads
    like an ordinary retired key rather than like the point of the test.
  */
  const unpublished = await mintSigningKey('fake-key-never-published');
  const server = new FakePlayoutServer(active, unpublished, 1, options);
  await server.start();
  return server;
}
