import { createRemoteJWKSet, customFetch, errors as joseErrors, jwtVerify } from 'jose';
import { z } from 'zod';
import {
  AUTH_STATION_NOT_SET_UP,
  AUTH_TOKEN_EXPIRED,
  AUTH_TOKEN_INVALID,
  AUTH_TOKEN_WRONG_STATION,
  MAX_ACTOR_LENGTH,
  normalizeActor,
  PlayoutChannelsSchema,
  type PlayoutChannels,
  type PlayoutPrincipal,
} from '@cg/shared-ipc';
import type { PlayoutAuthConfig } from './playout-config.js';
import { playoutFetch } from './playout-http.js';

/**
 * 🔴 `C-037` / ADR 0010 rule 1 — **OFFLINE VERIFICATION OF A PLAYOUT-ISSUED TOKEN.**
 *
 * ES256 against the Playout's JWKS, `iss` byte-equal to the configured issuer, `aud`
 * containing the configured audience, ±60 s clock tolerance. Nothing here ever contacts the
 * Playout to ask whether a token is good — the signature answers that — which is the whole
 * reason a Playout outage cannot take the station off air.
 *
 * ── THE TWO NETWORK READS, AND WHY NEITHER IS IN THE PATH TO AIR ────────────
 *
 * 1. **The JWKS** (D3), fetched by `jose`'s remote key set: on first use, when the cache ages
 *    past the contract's `max-age`, and on an unknown `kid` — the last at most once per 60 s
 *    ({@link RemoteJWKSetOptions.cooldownDuration}). It happens while VERIFYING a sign-in,
 *    which is a person typing a password, not a take.
 * 2. **The revocation list** (D9): polled in the BACKGROUND, at most once per 60 s, and read
 *    SYNCHRONOUSLY from the last answer at gate time. 🔴 The gate never awaits it. A gate that
 *    did would put the Playout's reachability in the path to air, which is the coupling this
 *    entire design exists to avoid — and golden rule 8's rule, one axis out: a Playout outage
 *    never changes a verdict, it only stops the verdict being updated.
 *
 * ⚠ **Raw tokens live in memory and nowhere else.** They are never written to the audit log,
 * never to a config file, never to stderr. The one thing held beyond verification is the
 * compact token itself, because D9 takes `Authorization: Bearer <CG token>` and the bridge has
 * no credential of its own — see {@link PlayoutAuth.noteLiveToken}.
 */

/** The claims the contract requires, validated AFTER `jose` has checked the signature. */
const ClaimsSchema = z.object({
  sub: z.string().min(1),
  name: z.string().min(1),
  roles: z.array(z.string()).min(1),
  cg_channels: PlayoutChannelsSchema,
  /*
    🔴 BOUNDED, and the bound is the point rather than tidiness. `new Date(exp * 1000)` sits
    outside the `jwtVerify` try, so an out-of-range value throws a `RangeError` that escapes
    `verify()`, escapes `handleAuthFrame`, and lands as an UNHANDLED REJECTION in a `void`
    dispatch — a well-signed token from a misconfigured issuer (microseconds instead of
    seconds) could take the bridge process down. A claim that cannot be a real instant is a
    malformed claim, and it is refused here as one.

    The ceiling is ECMAScript's own maximum time value in SECONDS (8.64e15 ms), so nothing a
    `Date` can represent is excluded; the floor refuses a negative epoch.
  */
  exp: z.number().int().min(0).max(8.64e12),
  jti: z.string().min(1).optional(),
});

/** What a socket holds once a token has been accepted. */
export interface VerifiedToken {
  /** What the CONSOLE is told — no `jti`, no raw token, no credential of any kind. */
  readonly principal: PlayoutPrincipal;
  /** `jti`, for the D9 revocation check. Internal: never leaves the bridge. */
  readonly jti: string | null;
  /** `exp` in epoch seconds, re-checked per request so a mid-session expiry is caught. */
  readonly expEpochSec: number;
  /** The compact token, held solely as the D9 bearer. Never logged, never persisted. */
  readonly rawToken: string;
}

/**
 * Either an accepted token or the sentence the console should show.
 *
 * `adopted` is set on exactly ONE result per bridge process: the sign-in that taught an
 * address-configured station its issuer (`DESKTOP-APPS-01-A` A2). The caller persists it.
 */
export type VerifyResult =
  | { ok: true; token: VerifiedToken; adopted?: string }
  | { ok: false; refusal: string };

/** How many seconds of clock skew the contract allows on `exp` / `nbf` / `iat`. */
const CLOCK_TOLERANCE_SEC = 60;

/** The contract's `Cache-Control: public, max-age=3600` on the JWKS, mirrored as the cache age. */
const JWKS_CACHE_MAX_AGE_MS = 3_600_000;

/** ADR 0010 rule 1 — an unknown `kid` re-fetches the JWKS at most once per 60 s. */
export const JWKS_COOLDOWN_MS = 60_000;

/** ADR 0010 rule 5 — D9 is polled at most once per 60 s. */
export const REVOCATION_POLL_MS = 60_000;

/** A short bound on both reads: neither may hang a sign-in or a background tick. */
const HTTP_TIMEOUT_MS = 5000;

const RevokedSchema = z.object({
  revoked: z.array(z.object({ jti: z.string(), exp: z.number().int() })),
});

/**
 * ⭐ **THE ONE PLACE A NAME BECOMES THE NAME THE RECORD WILL CARRY.**
 *
 * `MAX_ACTOR_LENGTH` is what the contract's `name ≤ 64` was cut to match, and ADR 0010 records
 * as still open that a longer Playout display name would be SILENTLY shortened. It is not
 * silent here: the flag travels with the principal, the bridge writes it once on the `sign-in`
 * row, and the console can say so. Trimmed on both sides of the cut for the same reason
 * `normalizeActor` does — a cut that lands mid-space leaves a name ending in whitespace.
 */
export function truncateActorName(raw: string): { name: string; truncated: boolean } {
  const trimmed = raw.trim();
  if (trimmed.length <= MAX_ACTOR_LENGTH) return { name: trimmed, truncated: false };
  return { name: trimmed.slice(0, MAX_ACTOR_LENGTH).trim(), truncated: true };
}

/** `aud` may be a string or an array; the contract says it must EQUAL or CONTAIN the audience. */
function audienceMatches(aud: unknown, expected: string): boolean {
  if (typeof aud === 'string') return aud === expected;
  if (Array.isArray(aud)) return aud.some((a) => a === expected);
  return false;
}

export interface PlayoutAuthOptions {
  /**
   * The D9 read. Injected in tests; defaults to {@link playoutFetch} — server-side, no `Origin`,
   * no proxy (`DESKTOP-APPS-01-B` B1.4). The JWKS read always uses `playoutFetch`.
   */
  readonly fetchImpl?: typeof fetch;
  /** Injected in tests to drive expiry and the poll cadence. Defaults to `Date.now`. */
  readonly now?: () => number;
  /**
   * `DESKTOP-APPS-01-A` A2 — told, synchronously and once, the `iss` an address-configured
   * station just adopted, so the bridge can persist it as `playout.issuer`. A throw here is
   * reported and never refuses the sign-in that earned the adoption.
   */
  readonly onIssuerAdopted?: (issuer: string) => void;
}

/**
 * The bridge's Playout-facing authority: verify tokens, and know which `jti`s are revoked.
 *
 * One per bridge process, shared by every socket. Sockets hold their own {@link VerifiedToken};
 * this object holds only what is common — the key set and the revocation list.
 */
export class PlayoutAuth {
  readonly #config: PlayoutAuthConfig;
  readonly #now: () => number;
  readonly #fetch: typeof fetch;
  readonly #jwks: ReturnType<typeof createRemoteJWKSet>;

  /** The LAST list the bridge saw. Never cleared by a failure — ADR 0010 rule 5. */
  #revoked: ReadonlySet<string> = new Set();
  #revokedEtag: string | null = null;
  #lastPollMs = Number.NEGATIVE_INFINITY;
  #polling = false;
  /**
   * Any live compact token, used solely as the Playout-read bearer — with the two facts that
   * decide whether it may still be PRESENTED.
   *
   * ⚠ `CHANNEL-AUTHORITY-01` — `jti` and `exp` ride beside the raw token so D4 can refuse, at the
   * moment of USE, a bearer that has expired or been revoked since it was adopted (see
   * {@link usableBearer}). The adoption-time guard alone let a bearer outlive both.
   */
  #bearer: { readonly raw: string; readonly jti: string | null; readonly exp: number } | null =
    null;
  /** The background tick. Armed by the first live token, cleared by {@link dispose}. */
  #ticker: ReturnType<typeof setInterval> | null = null;
  /** Count of D9 requests actually issued — the positive control a cadence test needs. */
  #pollCount = 0;
  /**
   * 🔴 `DELTA B` — **TOKENS THIS BRIDGE HAS ALREADY ACCEPTED, so a resume is not a sign-in.**
   *
   * Keyed by `jti` where the contract supplies one, and by `sub`+`exp` where it does not — both
   * identify ONE issued token rather than one person, which is the distinction that matters: a
   * REFRESHED token is a new token and a new sign-in is a new token, while a reconnect
   * re-presents the same one.
   *
   * ⚠ Pruned by `exp`, so a bridge up for a week is not carrying last Tuesday's ids. The set
   * is per PROCESS: a bridge restart forgets, and the first presentation after it is recorded
   * as a sign-in — which is honest, because from that process's point of view it is the first
   * time it has seen anybody.
   */
  #accepted = new Map<string, number>();
  /**
   * 🔴 `DESKTOP-APPS-01-A` A2 — the issuer tokens are compared to. The configured one, or — for a
   * station configured by its Playout ADDRESS — `null` until the first `station-admin` sign-in
   * teaches it, and then that value for the life of the process (and, persisted, after it).
   */
  #issuer: string | null;
  readonly #onIssuerAdopted: ((issuer: string) => void) | undefined;

  constructor(config: PlayoutAuthConfig, options: PlayoutAuthOptions = {}) {
    this.#config = config;
    this.#issuer = config.issuer;
    this.#onIssuerAdopted = options.onIssuerAdopted;
    this.#now = options.now ?? ((): number => Date.now());
    this.#fetch = options.fetchImpl ?? playoutFetch;
    this.#jwks = createRemoteJWKSet(new URL(config.jwksUrl), {
      cooldownDuration: JWKS_COOLDOWN_MS,
      cacheMaxAge: JWKS_CACHE_MAX_AGE_MS,
      timeoutDuration: HTTP_TIMEOUT_MS,
      // B1.4 — the key set too goes out server-side and never through a proxy the environment names.
      [customFetch]: playoutFetch,
    });
  }

  /** D9 requests issued since boot. Exported for the cadence test's positive control. */
  get pollCount(): number {
    return this.#pollCount;
  }

  /** The issuer in force — `null` while an address-configured station awaits adoption (A2). */
  get issuer(): string | null {
    return this.#issuer;
  }

  /**
   * Verify a compact JWT and reduce it to a principal, or to the sentence to show.
   *
   * The order is the contract's own (§3.5): `kid` known → signature → `iss` equal → `aud`
   * contains → `exp`/`nbf` within tolerance → `name` non-empty → `roles` non-empty →
   * `cg_channels` well-formed. The first five are `jose`'s; the last three are this side's,
   * because a signature says the Playout wrote the token and says nothing about whether the
   * token says what the contract requires.
   */
  async verify(token: string): Promise<VerifyResult> {
    let payload: Record<string, unknown>;
    /*
      🔴 `DESKTOP-APPS-01-A` A3 — with no issuer yet, `jose` checks the signature against the
      ADDRESS's JWKS and everything else it always checks, but not `iss`. That is NOT "accept any
      `iss`": the token below must still carry the audience AND hold `station-admin`, or it is
      refused before anything is adopted or accepted.
    */
    const issuer = this.#issuer;
    try {
      const verified = await jwtVerify(token, this.#jwks, {
        ...(issuer !== null ? { issuer } : {}),
        clockTolerance: CLOCK_TOLERANCE_SEC,
        algorithms: ['ES256'],
        currentDate: new Date(this.#now()),
      });
      payload = verified.payload as Record<string, unknown>;
    } catch (err) {
      return { ok: false, refusal: refusalForVerifyError(err) };
    }

    /*
      ⚠ `aud` is checked HERE rather than through `jwtVerify`'s `audience` option, and the
      difference is the sentence the operator gets. `jose` raises the same
      `JWTClaimValidationFailed` for `aud` as for a dozen other claims, and telling them apart
      by a string field is exactly the kind of brittle read this file should not contain. A
      wrong `aud` means the token was minted for something other than CG Control — the same
      fact as a wrong `iss` — so it gets the same sentence, decided here where the claim is
      named in code.
    */
    if (!audienceMatches(payload['aud'], this.#config.audience)) {
      return { ok: false, refusal: AUTH_TOKEN_WRONG_STATION };
    }

    const claims = ClaimsSchema.safeParse(payload);
    if (!claims.success) return { ok: false, refusal: AUTH_TOKEN_INVALID };

    const jti = claims.data.jti ?? null;
    if (jti !== null && this.#revoked.has(jti)) {
      return { ok: false, refusal: AUTH_TOKEN_INVALID };
    }

    /*
      ⭐ **REDUCED ONCE, HERE, BY THE CANONICAL REDUCER.**

      `normalizeActor` is what every other name entering this process goes through, and golden
      rule 6 says to reuse the one predicate rather than derive a second that agrees today. The
      Playout is outside this process exactly as a browser is. Doing it HERE and not at the ALS
      means the name the console is shown and the name the record writes are the SAME STRING,
      not two reductions of one claim that could differ after an edit to either.

      ⚠ {@link truncateActorName} is still called, and only for its FLAG: `normalizeActor`
      truncates silently and ADR 0010's open note is precisely that silence.
    */
    const { truncated } = truncateActorName(claims.data.name);
    const name = normalizeActor(claims.data.name);
    if (name === '') return { ok: false, refusal: AUTH_TOKEN_INVALID };

    /*
      🔴 `DESKTOP-APPS-01-A` A2/A3 — **ADOPTION, and the only thing accepted before it.**

      Read `#issuer` AGAIN rather than trusting the value from before the await: another sign-in
      may have adopted while this one was verifying. From here to the assignment there is no
      await, so two concurrent sign-ins cannot both adopt.

        - still unset, and this token is a `station-admin` with a string `iss` → ADOPT it;
        - still unset, and it is not → refused as "not set up yet", nothing adopted;
        - set meanwhile → byte-equal or refused, exactly as a configured issuer is.
    */
    let adopted: string | undefined;
    const current = this.#issuer;
    const iss = payload['iss'];
    if (current === null) {
      if (!claims.data.roles.includes('station-admin')) {
        return { ok: false, refusal: AUTH_STATION_NOT_SET_UP };
      }
      if (typeof iss !== 'string' || iss === '') return { ok: false, refusal: AUTH_TOKEN_INVALID };
      this.#issuer = iss;
      adopted = iss;
      try {
        this.#onIssuerAdopted?.(iss);
      } catch (err) {
        process.stderr.write(
          `[caspar-bridge] ⚠ the adopted Playout issuer could not be saved: ` +
            `${err instanceof Error ? err.message : String(err)} — it holds until this bridge ` +
            `restarts, and the next station-admin sign-in after that adopts it again\n`,
        );
      }
    } else if (issuer === null && iss !== current) {
      return { ok: false, refusal: AUTH_TOKEN_WRONG_STATION };
    }

    return {
      ...(adopted !== undefined ? { adopted } : {}),
      ok: true,
      token: {
        principal: {
          name,
          sub: claims.data.sub,
          roles: claims.data.roles,
          channels: claims.data.cg_channels satisfies PlayoutChannels,
          expiresAt: new Date(claims.data.exp * 1000).toISOString(),
          nameTruncated: truncated,
        },
        jti,
        expEpochSec: claims.data.exp,
        rawToken: token,
      },
    };
  }

  /**
   * 🔴 `DELTA B` — **IS THIS THE FIRST TIME THIS BRIDGE HAS ACCEPTED THIS TOKEN?**
   *
   * Returns `true` once per token and `false` every time after. The audit's `sign-in` row hangs
   * off it, because a `sign-in` means a human typed a password — and the bridge cannot see that
   * exchange at all: it happens between the browser and the Playout (ADR 0010 rule 9). What the
   * bridge CAN see is the first time a token it has never seen is accepted, which is the nearest
   * true thing.
   *
   * ── WHAT THE OWNER SAW ──────────────────────────────────────────────────
   *
   * 37 audit events, almost all `sign-in · علی رضایی · ok`, growing on every browser
   * reload. He signed in ONCE, with a password. Every reconnect re-presents the held token
   * (`R-066` bullet 2 — held per console, survives a reload, presented on every reconnect), and
   * each was recorded as an act of the operator. A record that misstates what the operator did
   * is the `B-141` failure with the sign flipped: not a log that cannot answer, a log that
   * answers wrongly.
   */
  markAccepted(token: VerifiedToken): boolean {
    const nowSec = this.#now() / 1000;
    for (const [key, exp] of this.#accepted) {
      if (exp + CLOCK_TOLERANCE_SEC < nowSec) this.#accepted.delete(key);
    }
    const key = token.jti ?? `${token.principal.sub}:${String(token.expEpochSec)}`;
    if (this.#accepted.has(key)) return false;
    this.#accepted.set(key, token.expEpochSec);
    return true;
  }

  /** Has this token's `jti` been revoked, per the LAST list the bridge saw? Synchronous. */
  isRevoked(jti: string | null): boolean {
    return jti !== null && this.#revoked.has(jti);
  }

  /** Is this token past `exp`, allowing the contract's clock tolerance? Synchronous. */
  isExpired(expEpochSec: number): boolean {
    return this.#now() / 1000 > expEpochSec + CLOCK_TOLERANCE_SEC;
  }

  /**
   * Offer a live token as the D9 bearer, and kick the poller if it is due.
   *
   * ⚠ Called on every successful verify AND on every gate check that finds a valid principal,
   * so the list keeps updating for as long as anybody is signed in — and stops the moment
   * nobody is, which is correct: with no principal there is no verdict for a revocation to
   * change.
   */
  noteLiveToken(token: Pick<VerifiedToken, 'rawToken' | 'jti' | 'expEpochSec'>): void {
    this.#bearer = { raw: token.rawToken, jti: token.jti, exp: token.expEpochSec };
    this.#armTicker();
    this.#maybePoll();
  }

  /**
   * 🔴 `CHANNEL-AUTHORITY-01` — **THE BEARER FOR A PLAYOUT READ OTHER THAN D9, CHECKED AT USE.**
   *
   * The held token, only while it is neither past `exp` (with the contract's tolerance) nor on the
   * revocation list as last seen; otherwise `null`, and the caller does not read at all.
   *
   * ⚠ **Why D4 does not simply take the D9 bearer as it is.** What guards that bearer is the
   * moment it is ADOPTED: `authGateState` never adopts a revoked token (the `PLAYOUT-AUTH-01`
   * review found one frozen as the bearer). But a token adopted while good is kept after it
   * expires, and after its `jti` lands on the list, until another principal's token replaces it —
   * so D9 goes on presenting it, is answered `401`, and swallows that by design (an outage must
   * never change a verdict). D4 must not present a credential the Playout has withdrawn, so its
   * check is here, at use.
   *
   * ⚠ D9's own reads are deliberately left as they were: their cadence and their "the last list
   * stands" rules are pinned by the revocation suite, and this change is about D4.
   */
  usableBearer(): string | null {
    const held = this.#bearer;
    if (held === null) return null;
    if (this.isExpired(held.exp) || this.isRevoked(held.jti)) return null;
    return held.raw;
  }

  /**
   * 🔴 **ARM THE TICK WITHOUT ADOPTING A BEARER.**
   *
   * Called for a token that VERIFIED but is revoked. The first spelling of the revocation fix
   * called {@link noteLiveToken} for it instead, and that was worse than the problem it
   * solved: a revoked token became the process-wide D9 bearer, the Playout answers
   * `401 invalid_token` to it, `#pollRevoked` swallows a non-ok response — correctly, because
   * an outage must not change a verdict — and the revocation list then freezes for the WHOLE
   * bridge, not just that socket.
   *
   * So a revoked token keeps the CLOCK running and never becomes the credential. Polling
   * continues with whatever bearer was last good.
   *
   * ⚠ The residual, stated rather than hidden: on a station where the ONLY principal is
   * revoked there is no usable bearer, so the list cannot be refreshed until somebody signs in
   * with a token that is not revoked. That is a strictly smaller hole than a bridge that has
   * stopped polling entirely, and it resolves the moment anyone signs in.
   */
  noteVerifiedButRevoked(): void {
    this.#armTicker();
  }

  /**
   * Give up the bearer, when the socket that supplied it has signed out or gone away.
   *
   * ⚠ Without this the bridge keeps calling the Playout with a token belonging to an operator
   * who left hours ago — it stays valid until `exp`, so nothing fails and nothing says so.
   */
  releaseBearer(rawToken: string): void {
    if (this.#bearer?.raw === rawToken) this.#bearer = null;
  }

  /**
   * 🔴 **THE BACKGROUND TICK, and why a request-driven poll was not enough.**
   *
   * `C-037`'s acceptance says a revoked `jti` is refused _"within 60 s"_. Kicking the poller
   * only from the request path delivers something weaker and easy to mistake for it: an upper
   * bound on FREQUENCY, not a bound on LATENCY. An idle console sends nothing, so nothing
   * polls — and the first intent after a quiet spell is then decided against a stale list and
   * ALLOWED, with the refresh arriving just behind it. One command by a revoked operator is
   * exactly the thing the bullet promises will not happen.
   *
   * ⚠ `unref()`d, so it never holds the process open, and armed only once a principal exists
   * — with nobody signed in there is no verdict a revocation could change, and a bridge with
   * auth off never arms it at all.
   */
  #armTicker(): void {
    if (this.#ticker !== null) return;
    this.#ticker = setInterval(() => {
      this.#maybePoll();
    }, REVOCATION_POLL_MS);
    this.#ticker.unref();
  }

  /** Stop the background tick. Called from the bridge's own `close()`. */
  dispose(): void {
    if (this.#ticker !== null) clearInterval(this.#ticker);
    this.#ticker = null;
  }

  /**
   * 🔴 FIRE-AND-FORGET, NEVER AWAITED BY A CALLER ON THE REQUEST PATH.
   *
   * Every failure path leaves {@link #revoked} exactly as it was. That is ADR 0010 rule 5 in
   * one line — _"on a Playout outage the bridge keeps the LAST list it saw"_ — and it is the
   * reason this method returns `void` and swallows: a caller able to see the error would be a
   * caller tempted to act on it, and the only correct action is none.
   */
  #maybePoll(): void {
    if (this.#polling) return;
    if (this.#bearer === null) return;
    if (this.#now() - this.#lastPollMs < REVOCATION_POLL_MS) return;
    this.#polling = true;
    this.#lastPollMs = this.#now();
    this.#pollCount += 1;
    void this.#pollRevoked().finally(() => {
      this.#polling = false;
    });
  }

  /** Force a poll now, bypassing the cadence. Tests only — never called on the request path. */
  async pollRevokedNow(): Promise<void> {
    if (this.#bearer === null) return;
    this.#lastPollMs = this.#now();
    this.#pollCount += 1;
    await this.#pollRevoked();
  }

  /**
   * 🔴 `DESKTOP-APPS-01-C` C4 — **THE INTRODUCING READ: ONE D9 READ, NOW, WITH THIS TOKEN.**
   *
   * A Playout 2.8.54 lets a machine's AMCP in from exactly one kind of request: a SERVER-SIDE
   * D9 read (no `Origin`) whose token is valid and unrevoked and whose ACCOUNT holds
   * `station-admin`. D4 and D8 introduce nothing. So a `station-admin`'s sign-in is followed by
   * this, at once, with THAT admin's own token — never the held bearer, which is whoever signed in
   * last — rather than at the next tick of the 60 s cycle. The cycle itself is unchanged; it
   * restarts from this read, so the Playout is not asked twice in a row.
   *
   * Human-paced: the bridge calls it once per station-admin SIGN-IN (a token's first acceptance).
   * Swallows every failure, as every D9 read does.
   */
  async introduce(rawToken: string): Promise<void> {
    // The sign-in's own `noteLiveToken` may have just started a poll with this very token (a
    // bridge that has never polled): that read IS the introduction, and a second one is noise.
    if (this.#polling && this.#bearer?.raw === rawToken) return;
    this.#lastPollMs = this.#now();
    this.#pollCount += 1;
    await this.#pollRevoked(rawToken);
  }

  async #pollRevoked(presented?: string): Promise<void> {
    const bearer = presented ?? this.#bearer?.raw ?? null;
    if (bearer === null) return;
    try {
      const headers: Record<string, string> = { Authorization: `Bearer ${bearer}` };
      if (this.#revokedEtag !== null) headers['If-None-Match'] = this.#revokedEtag;
      const res = await this.#fetch(this.#config.revokedUrl, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
      });
      // 304 — the list has not changed. Keeping what we have IS the answer.
      if (res.status === 304) return;
      if (!res.ok) return;
      const parsed = RevokedSchema.safeParse(await res.json());
      if (!parsed.success) return;
      const etag = res.headers.get('etag');
      this.#revokedEtag = etag;
      // Entries prune themselves by `exp` on the Playout; drop stale ones here too so a
      // bridge that has been up for a week is not carrying last Tuesday's revocations.
      const nowSec = this.#now() / 1000;
      this.#revoked = new Set(
        parsed.data.revoked.filter((r) => r.exp + CLOCK_TOLERANCE_SEC >= nowSec).map((r) => r.jti),
      );
    } catch {
      // Unreachable, timed out, malformed: the last list stands. See the docblock.
    }
  }
}

/**
 * Map a `jose` failure onto one of the three reason CLASSES the contract's §3.5 names.
 *
 * ⚠ Exported so the mapping is testable without a socket, and so there is ONE of it. Three
 * sentences and not one, because unlike an intent refusal these have three different remedies:
 * sign in again · check which Playout this console signed in to · nothing the operator can do.
 */
export function refusalForVerifyError(err: unknown): string {
  if (err instanceof joseErrors.JWTExpired) return AUTH_TOKEN_EXPIRED;
  if (err instanceof joseErrors.JWTClaimValidationFailed) {
    return err.claim === 'iss' ? AUTH_TOKEN_WRONG_STATION : AUTH_TOKEN_INVALID;
  }
  return AUTH_TOKEN_INVALID;
}
