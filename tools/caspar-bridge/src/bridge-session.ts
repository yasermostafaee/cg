import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod';
import {
  PlayoutSignInError,
  refreshDelayMs,
  refreshPlayoutToken,
  refreshTokenFate,
  signInToPlayout,
  type BridgeSessionState,
  type PlayoutFetchLike,
  type PlayoutTokens,
  type SignInFailure,
} from '@cg/shared-ipc';
import { neverReachedPlayout } from './playout-http.js';

/**
 * 🔴 `CENTRAL-BRIDGE-01` (D7, the Playout team's rule 8) and `CENTRAL-BRIDGE-01-A` (Playout
 * `2.9.2`) — **CG BRIDGE'S OWN PLAYOUT SESSION.**
 *
 * The Playout has no service or machine token: the bridge signs in like a user (D1), as the
 * station's own account, and keeps the refresh token — its OWN family, never shared with a console.
 * Three facts from the Playout decide the shape of everything here:
 *
 *   1. _"the refresh token is single-use and changes every time — store the new one durably BEFORE
 *      using it."_ Every answer's refresh token is written (tmp, write, `fsync`, rename) before
 *      anything the answer carries is used.
 *   2. **`2.9.2` §8 — a spent refresh token that comes back is REUSE.** Within 10 s: `401` only. After
 *      10 s: THEFT — the whole family is revoked and every access token of that user goes on the D9
 *      list, so one stale refresh signs every console of that account out. So a D2 is marked "in
 *      flight" ON DISK before its token leaves, and the mark comes off only when the successor is on
 *      disk or the Playout refused BEFORE using the token. A mark found at start — the process died
 *      with a D2 in flight — means the token may have been used: it is NEVER sent again, and the
 *      station says `CG Bridge needs a station admin to sign in`. The same for any D2 whose outcome
 *      is unknown (a timeout, a dropped connection, an answer that cannot be read).
 *   3. **`2.9.2` §2 — every D2 REFUSAL comes before the token is used** (`cg_not_licensed`,
 *      `no_cg_access`, a disabled account): the token is kept, the Playout's reason is shown, and
 *      the refresh is asked again about every minute. Never a lost session.
 *
 * Refreshes are SERIAL (one operation at a time, {@link BridgeSession.#serial}). The password is
 * never stored: {@link BridgeSession.signIn} holds it for its one D1 request and nowhere else.
 */

const RecordSchema = z.object({
  version: z.literal(1),
  refreshToken: z.string().min(1),
  /** The account, from the verified token — for the record and `/health`, never for a decision. */
  sub: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  /** When this refresh token was received (ISO). */
  obtainedAt: z.string().min(1),
  /**
   * `CENTRAL-BRIDGE-01-A` — a D2 carrying `refreshToken` was SENT and its answer is not yet saved.
   * `tokenId` names the token (a hash, not the token) for the log.
   */
  refreshInFlight: z.object({ tokenId: z.string().min(1), since: z.string().min(1) }).optional(),
  /**
   * 🔴 `RELEASE-0112-01` (`R-085`) — the ENGINE this session belongs to (its API address), for a session
   * bound to one ({@link BridgeSessionOptions.address}: the backup engine's). A record for another
   * address is never used: its token is never sent to an engine that did not issue it.
   */
  address: z.string().min(1).optional(),
});

export type BridgeSessionRecord = z.infer<typeof RecordSchema>;

/** A refresh token's name for the log and the mark — never the token. */
export function refreshTokenId(token: string): string {
  return createHash('sha256').update(token).digest('hex').slice(0, 16);
}

/** The saved session, or `null` when there is none; `problem` says why a file present was unusable. */
export function loadBridgeSession(file: string): {
  record: BridgeSessionRecord | null;
  problem?: string;
} {
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { record: null };
    return { record: null, problem: err instanceof Error ? err.message : String(err) };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    return { record: null, problem: `invalid JSON: ${err instanceof Error ? err.message : ''}` };
  }
  const result = RecordSchema.safeParse(parsed);
  return result.success
    ? { record: result.data }
    : { record: null, problem: 'not a CG Bridge session file' };
}

/**
 * Write the session DURABLY: a temp file, written, `fsync`ed and closed, then renamed over the old
 * one. `rename` is atomic, so the file on disk is always a whole record — the new one or the one
 * before it, never a torn one; the `fsync` is what makes "written" mean "on the disk" before the
 * token it holds is used. Owner-only on a POSIX host (the installer sets the Windows ACL).
 */
export function saveBridgeSession(file: string, record: BridgeSessionRecord): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  const fd = fs.openSync(tmp, 'w', 0o600);
  try {
    fs.writeSync(fd, JSON.stringify(record));
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, file);
}

/** What the session needs of the bridge's verifier: the account a token names, or why not. */
export type VerifyAccess = (
  accessToken: string,
) => Promise<{ ok: true; name: string; sub: string } | { ok: false; reason: string }>;

export interface BridgeSessionOptions {
  /** `bridge-session.json` (the primary engine's), or `bridge-session-backup.json` (the backup's). */
  readonly file: string;
  /**
   * 🔴 `RELEASE-0112-01` (`R-085`) — the engine this session is bound to. Given, every record saved
   * names it, and a saved record that names ANOTHER engine (or none) is treated as no session — so a
   * token is never sent to an engine that did not issue it (server B moved to another machine). Absent
   * (the primary engine's session, as before this release): records are read and written as they were.
   */
  readonly address?: string;
  /** D1 and D2. */
  readonly tokenUrl: string;
  readonly refreshUrl: string;
  /** The bridge's own offline verifier (`PlayoutAuth.verify`) — the account is read from the JWT. */
  readonly verify: VerifyAccess;
  /** The request — the bridge's `playoutFetchForSession` (no `Origin`, no proxy, one IPv4). */
  readonly fetchImpl?: PlayoutFetchLike;
  readonly now?: () => number;
  /** The durable write. A seam for the crash tests; the default is {@link saveBridgeSession}. */
  readonly save?: (file: string, record: BridgeSessionRecord) => void;
  /** Told once per access token gained — the bridge's introducing D9 read and its poller. */
  readonly onAccess?: (accessToken: string) => void;
  /** Between attempts when a refresh never reached the Playout (default 30 s). */
  readonly retryMs?: number;
  /** Between attempts after the Playout REFUSED a refresh before using it (default 60 s, `2.9.2` §2). */
  readonly refusedRetryMs?: number;
  /** The bound on a D1/D2 answer (default 15 s). An answer that never comes is an unknown outcome. */
  readonly answerTimeoutMs?: number;
  readonly log?: (line: string) => void;
}

export type BridgeSignInResult =
  | { ok: true }
  | { ok: false; failure: SignInFailure; message?: string };

const DEFAULT_RETRY_MS = 30_000;
const DEFAULT_REFUSED_RETRY_MS = 60_000;
const DEFAULT_ANSWER_TIMEOUT_MS = 15_000;

/**
 * What a `refused` state says when the Playout sent no reason of its own. Every console shows it
 * after "CG Bridge:", as it shows the Playout's own reason.
 */
const REFUSED_WITHOUT_REASON = 'The Playout refuses to renew its session.';

export class BridgeSession {
  readonly #opts: BridgeSessionOptions;
  readonly #now: () => number;
  readonly #save: (file: string, record: BridgeSessionRecord) => void;
  #state: BridgeSessionState = { state: 'needs-admin' };
  #access: { readonly token: string; readonly expiresAtMs: number } | null = null;
  #record: BridgeSessionRecord | null = null;
  #timer: ReturnType<typeof setTimeout> | null = null;
  #disposed = false;
  /** `RELEASE-0112-01` — the last sign-in's failure code (`cg_not_licensed`, `unreachable` …), or `null`. */
  #lastSignInFailure: SignInFailure | null = null;
  /** One operation at a time: a sign-in and a refresh never interleave, and never run twice at once. */
  #chain: Promise<unknown> = Promise.resolve();
  readonly #listeners = new Set<(state: BridgeSessionState) => void>();

  constructor(options: BridgeSessionOptions) {
    this.#opts = options;
    this.#now = options.now ?? ((): number => Date.now());
    this.#save = options.save ?? saveBridgeSession;
  }

  state(): BridgeSessionState {
    return this.#state;
  }

  onChanged(handler: (state: BridgeSessionState) => void): () => void {
    this.#listeners.add(handler);
    return () => this.#listeners.delete(handler);
  }

  /**
   * `RELEASE-0112-01` — the code the last station-admin sign-in failed with, or `null` (none tried, or
   * the last one took). It is what says "CG not licensed on this engine" before any token exists.
   */
  lastSignInFailure(): SignInFailure | null {
    return this.#lastSignInFailure;
  }

  /** The bearer for the bridge's own Playout reads: only while held and not past `exp`. */
  accessToken(): string | null {
    const held = this.#access;
    if (held === null || this.#now() >= held.expiresAtMs) return null;
    return held.token;
  }

  /**
   * Read the saved session and refresh it — or say that a station admin must sign the bridge in.
   * 🔴 A mark left IN FLIGHT means this process (or one before it) died with a D2 out: the token may
   * have been used, so it is never sent again.
   */
  start(): Promise<void> {
    return this.#serial(async () => {
      const { record, problem } = loadBridgeSession(this.#opts.file);
      if (problem !== undefined) {
        this.#log(`the saved session at ${this.#opts.file} is unusable (${problem})`);
      }
      if (record === null) {
        this.#set({ state: 'needs-admin' });
        return;
      }
      const bound = this.#opts.address;
      if (bound !== undefined && record.address !== bound) {
        // `R-085` — a token is never sent to an engine that did not issue it.
        this.#set({ state: 'needs-admin' });
        this.#log(
          `the saved session belongs to ${record.address ?? 'no named engine'}, not ${bound}; ` +
            'its token is never sent here — CG Bridge needs a station admin to sign in',
        );
        return;
      }
      if (record.refreshInFlight !== undefined) {
        this.#lose(
          `a refresh of token ${record.refreshInFlight.tokenId} was in flight when CG Bridge ` +
            'stopped; the Playout may have used it, so it is never sent again',
        );
        return;
      }
      this.#record = record;
      this.#set({ state: 'waiting' });
      await this.#refresh();
    });
  }

  /**
   * A station admin's one-time sign-in: D1 with these, the refresh token kept (a NEW family), the
   * password dropped when this returns. Answers the contract's failure CODE — and, for
   * `cg_not_licensed`, the Playout's own message.
   */
  signIn(username: string, password: string): Promise<BridgeSignInResult> {
    return this.#serial(async () => {
      let tokens: PlayoutTokens;
      try {
        ({ session: tokens } = await signInToPlayout(
          this.#opts.tokenUrl,
          username,
          password,
          this.#deps(),
        ));
      } catch (err) {
        const failure = err instanceof PlayoutSignInError ? err.code : 'unexpected';
        const message = err instanceof PlayoutSignInError ? err.playoutMessage : null;
        this.#lastSignInFailure = failure;
        return {
          ok: false,
          failure,
          ...(failure === 'cg_not_licensed' && message !== null ? { message } : {}),
        };
      }
      const adopted = await this.#adopt(tokens);
      this.#lastSignInFailure = adopted.ok ? null : adopted.failure;
      return adopted;
    });
  }

  dispose(): void {
    this.#disposed = true;
    if (this.#timer !== null) clearTimeout(this.#timer);
    this.#timer = null;
  }

  // ── inside ────────────────────────────────────────────────────────────────────────────────

  #serial<T>(op: () => Promise<T>): Promise<T> {
    const next = this.#chain.then(op, op);
    this.#chain = next.catch(() => undefined);
    return next;
  }

  #deps(): { fetchImpl?: PlayoutFetchLike; nowMs: () => number; timeoutMs: number } {
    return {
      ...(this.#opts.fetchImpl !== undefined ? { fetchImpl: this.#opts.fetchImpl } : {}),
      nowMs: this.#now,
      timeoutMs: this.#opts.answerTimeoutMs ?? DEFAULT_ANSWER_TIMEOUT_MS,
    };
  }

  async #refresh(): Promise<void> {
    const record = this.#record;
    if (record === null) {
      this.#lose('there is no saved session');
      return;
    }
    if (record.refreshInFlight !== undefined) {
      this.#lose('a refresh with this token is already unaccounted for; it is never sent again');
      return;
    }
    // 1 — THE MARK, ON DISK, BEFORE THE TOKEN LEAVES. No mark, no send.
    const marked: BridgeSessionRecord = {
      ...record,
      refreshInFlight: {
        tokenId: refreshTokenId(record.refreshToken),
        since: new Date(this.#now()).toISOString(),
      },
    };
    try {
      this.#save(this.#opts.file, marked);
    } catch (err) {
      this.#log(
        `the refresh could not be recorded before it was sent (${describe(err)}), so it was not ` +
          'sent; asking again',
      );
      if (this.accessToken() === null) this.#set({ state: 'waiting' });
      this.#schedule(this.#opts.retryMs ?? DEFAULT_RETRY_MS);
      return;
    }
    this.#record = marked;

    // 2 — D2, bounded.
    let tokens: PlayoutTokens;
    try {
      tokens = await refreshPlayoutToken(this.#opts.refreshUrl, record.refreshToken, this.#deps());
    } catch (err) {
      this.#afterFailedRefresh(record, err);
      return;
    }
    // 3 — the successor, durably, with the mark cleared, before anything the answer carries is used.
    await this.#adopt(tokens);
  }

  /** What a failed D2 did to the token it carried, and what follows (`refreshTokenFate`). */
  #afterFailedRefresh(unmarked: BridgeSessionRecord, err: unknown): void {
    const cause = err instanceof PlayoutSignInError ? err.cause : err;
    if (neverReachedPlayout(cause)) {
      // Never sent: the token cannot have been used. The mark comes off; ask again.
      this.#unmark(unmarked);
      if (this.accessToken() === null) this.#set({ state: 'waiting' });
      this.#log(
        `the Playout could not be reached for the session refresh (${describe(cause)}); asking again`,
      );
      this.#schedule(this.#opts.retryMs ?? DEFAULT_RETRY_MS);
      return;
    }
    const fate = refreshTokenFate(err);
    if (fate === 'kept') {
      // `2.9.2` §2 — refused BEFORE use: the same token works once the cause is fixed.
      this.#unmark(unmarked);
      const message = err instanceof PlayoutSignInError ? err.playoutMessage : null;
      const code = err instanceof PlayoutSignInError ? err.code : 'unexpected';
      this.#set({ state: 'refused', message: message ?? REFUSED_WITHOUT_REASON, failure: code });
      this.#log(
        `the Playout refused the session refresh before using the token (${code}); the token is kept`,
      );
      this.#schedule(this.#opts.refusedRetryMs ?? DEFAULT_REFUSED_RETRY_MS);
      return;
    }
    if (fate === 'spent') {
      this.#lose(
        'the Playout refused the saved session (it was spent, revoked, or its password changed)',
      );
      return;
    }
    // Unknown — the Playout may have used the token. It is never sent again (the mark stays on disk).
    this.#lose(
      `the Playout's answer to the session refresh did not arrive (${describe(cause)}); ` +
        'its token may have been used, so it is never sent again',
    );
  }

  /** Take the in-flight mark off: the token was not used. A failed write leaves the mark — safe. */
  #unmark(unmarked: BridgeSessionRecord): void {
    try {
      this.#save(this.#opts.file, unmarked);
      this.#record = unmarked;
    } catch (err) {
      this.#log(
        `the session file could not be cleared after a refresh that did not use the token (${describe(err)}); ` +
          'a restart will ask for a station admin',
      );
      this.#record = unmarked;
    }
  }

  /**
   * 🔴 **PERSIST, THEN USE.** The answer's refresh token is written durably FIRST — with no in-flight
   * mark — before the access token is verified, used, or handed to anything. A crash after this line
   * leaves the new token on disk; a crash before it leaves the mark, and the next start sends
   * nothing.
   */
  async #adopt(tokens: PlayoutTokens): Promise<BridgeSignInResult> {
    const refreshToken = tokens.refreshToken ?? this.#record?.refreshToken ?? null;
    if (refreshToken !== null) {
      const record: BridgeSessionRecord = {
        version: 1,
        refreshToken,
        ...(this.#record?.sub !== undefined ? { sub: this.#record.sub } : {}),
        ...(this.#record?.name !== undefined ? { name: this.#record.name } : {}),
        obtainedAt: new Date(this.#now()).toISOString(),
        ...(this.#opts.address !== undefined ? { address: this.#opts.address } : {}),
      };
      try {
        this.#save(this.#opts.file, record);
      } catch (err) {
        // The token is valid for THIS process; the file keeps the mark, so a restart sends nothing.
        this.#log(
          `the session could not be saved (${describe(err)}) — it works until this bridge ` +
            'restarts, and a station admin must sign it in again then',
        );
      }
      this.#record = record;
    }

    const verified = await this.#opts.verify(tokens.accessToken);
    if (!verified.ok) {
      this.#lose(`the Playout's token for the bridge was not accepted: ${verified.reason}`);
      return { ok: false, failure: 'no_cg_access' };
    }
    if (this.#record !== null) {
      this.#record = { ...this.#record, sub: verified.sub, name: verified.name };
      try {
        this.#save(this.#opts.file, this.#record);
      } catch {
        // The token half is already on disk; the name is for the record only.
      }
    }
    this.#access = { token: tokens.accessToken, expiresAtMs: tokens.expiresAtMs };
    this.#set({ state: 'signed-in', name: verified.name });
    if (refreshToken !== null) {
      this.#schedule(refreshDelayMs(tokens.expiresAtMs, this.#now()));
    }
    this.#opts.onAccess?.(tokens.accessToken);
    return { ok: true };
  }

  #lose(why: string): void {
    this.#access = null;
    this.#record = null;
    if (this.#timer !== null) clearTimeout(this.#timer);
    this.#timer = null;
    this.#set({ state: 'needs-admin' });
    this.#log(`${why} — CG Bridge needs a station admin to sign in`);
  }

  #schedule(delayMs: number): void {
    if (this.#disposed) return;
    if (this.#timer !== null) clearTimeout(this.#timer);
    this.#timer = setTimeout(() => {
      this.#timer = null;
      void this.#serial(() => this.#refresh());
    }, delayMs);
    this.#timer.unref();
  }

  #set(next: BridgeSessionState): void {
    const same =
      next.state === this.#state.state &&
      (next.name ?? null) === (this.#state.name ?? null) &&
      (next.message ?? null) === (this.#state.message ?? null) &&
      (next.failure ?? null) === (this.#state.failure ?? null);
    this.#state = next;
    if (!same) for (const l of this.#listeners) l(next);
  }

  #log(line: string): void {
    (this.#opts.log ?? ((l: string) => process.stderr.write(`[caspar-bridge] ${l}\n`)))(line);
  }
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
