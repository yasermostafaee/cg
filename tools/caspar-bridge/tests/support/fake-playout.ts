import { randomUUID } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo, Socket } from 'node:net';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
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
} as const;

/** One D4 catalogue row (§4, `handoff/2026-09-16/channels.json`), spelled as the contract does. */
export interface FakeCatalogueRow {
  readonly id: string;
  readonly name: string;
  readonly casparHost: string;
  readonly casparChannel: number;
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
 */
export const FAKE_CATALOGUE: readonly FakeCatalogueRow[] = [
  { id: 'fake-programme', name: 'آپاسای', casparHost: '127.0.0.1', casparChannel: 1 },
  { id: 'fake-cg', name: 'کانال دوم (تست CG)', casparHost: '127.0.0.1', casparChannel: 2 },
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

/** The seven fixture users, by key. */
export const FAKE_USERS: Readonly<Record<FakeUserKey, FakePlayoutUser>> = {
  operator: FAKE_OPERATOR,
  viewer: FAKE_VIEWER,
  longName: FAKE_LONG_NAME_USER,
  admin: FAKE_ADMIN,
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
function listen(server: http.Server, port: number): Promise<void> {
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
    server.listen(port, '127.0.0.1');
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
  const payload = Buffer.from(JSON.stringify(body), 'utf8');
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
  };
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

  constructor(active: FakeSigningKey, unpublished: FakeSigningKey, keySeq: number) {
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
    await listen(this.#server, 0);
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

  get activeKid(): string {
    return this.#active.kid;
  }

  get requestCounts(): FakePlayoutRequestCounts {
    return this.#counts;
  }

  async stop(): Promise<void> {
    await this.#closeListener();
  }

  async goOffline(): Promise<void> {
    await this.#closeListener();
  }

  async goOnline(): Promise<void> {
    if (this.#listening) return;
    await listen(this.#server, this.#port);
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
    const user = FAKE_USERS[options.user ?? 'operator'];
    const nowSec = Math.floor(Date.now() / 1000);
    const jti = options.jti ?? randomUUID();
    const claims: JWTPayload = {
      iss: options.issuer ?? this.issuer,
      aud: options.audience ?? CONTRACT_AUDIENCE,
      sub: user.sub,
      name: options.name ?? user.name,
      roles: [...(options.roles ?? user.roles)],
      cg_channels: options.cgChannels ?? user.cgChannels,
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
      this.#serveRevoked(req, res);
      return;
    }
    if (method === 'GET' && pathname === PATHS.channels) {
      this.#counts.channels += 1;
      this.#serveChannels(req, res);
      return;
    }
    sendError(res, 'not_found');
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
        cg_channels: user.cgChannels,
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
export async function startFakePlayout(): Promise<FakePlayout> {
  const active = await mintSigningKey('fake-key-1');
  /*
    The never-published key. Its `kid` says so in the string itself, because it will show up in
    a decoded header in somebody's debugger at 02:00 and the alternative — `fake-key-0` — reads
    like an ordinary retired key rather than like the point of the test.
  */
  const unpublished = await mintSigningKey('fake-key-never-published');
  const server = new FakePlayoutServer(active, unpublished, 1);
  await server.start();
  return server;
}
