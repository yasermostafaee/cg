import * as fs from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod';
import {
  PlayoutSignInError,
  refreshDelayMs,
  refreshPlayoutToken,
  signInToPlayout,
  type BridgeSessionState,
  type PlayoutFetchLike,
  type PlayoutTokens,
  type SignInFailure,
} from '@cg/shared-ipc';

/**
 * 🔴 `CENTRAL-BRIDGE-01` (D7, the Playout team's rule 8) — **CG BRIDGE'S OWN PLAYOUT SESSION.**
 *
 * The Playout has no service or machine token: the bridge signs in like a user (D1), as the
 * station's own account, and keeps the refresh token. Their letter's two sentences decide the
 * shape of everything here:
 *
 *   - _"the refresh token is single-use and changes every time — store the new one durably BEFORE
 *     using it; a crash between getting it and saving it means signing in again with the
 *     password."_ So every answer's refresh token is written — tmp, write, `fsync`, rename — before
 *     anything the answer carries is used, and the window the sentence warns about is the length of
 *     one synchronous write.
 *   - _"a new password for `cg-admin` revokes all its tokens."_ So a refused refresh is not an
 *     outage to retry: it is a lost session, and every console says
 *     `CG Bridge needs a station admin to sign in` until one does.
 *
 * The password is never stored: {@link BridgeSession.signIn} holds it for its one D1 request and
 * nowhere else — not in this object, not in the file, not in a log.
 */

const RecordSchema = z.object({
  version: z.literal(1),
  refreshToken: z.string().min(1),
  /** The account, from the verified token — for the record and `/health`, never for a decision. */
  sub: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  /** When this refresh token was received (ISO). */
  obtainedAt: z.string().min(1),
});

export type BridgeSessionRecord = z.infer<typeof RecordSchema>;

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
  /** `bridge-session.json`. */
  readonly file: string;
  /** D1 and D2. */
  readonly tokenUrl: string;
  readonly refreshUrl: string;
  /** The bridge's own offline verifier (`PlayoutAuth.verify`) — the account is read from the JWT. */
  readonly verify: VerifyAccess;
  /** The request — the bridge's `playoutFetch` (no `Origin`, no proxy, one IPv4). */
  readonly fetchImpl?: PlayoutFetchLike;
  readonly now?: () => number;
  /** The durable write. A seam for the crash test; the default is {@link saveBridgeSession}. */
  readonly save?: (file: string, record: BridgeSessionRecord) => void;
  /** Told once per access token gained — the bridge's introducing D9 read and its poller. */
  readonly onAccess?: (accessToken: string) => void;
  /** Between attempts when the Playout does not answer a refresh. */
  readonly retryMs?: number;
  readonly log?: (line: string) => void;
}

export type BridgeSignInResult = { ok: true } | { ok: false; failure: SignInFailure };

/** Thirty seconds between refresh attempts the Playout did not answer. */
const DEFAULT_RETRY_MS = 30_000;

export class BridgeSession {
  readonly #opts: BridgeSessionOptions;
  readonly #now: () => number;
  readonly #save: (file: string, record: BridgeSessionRecord) => void;
  #state: BridgeSessionState = { state: 'needs-admin' };
  #access: { readonly token: string; readonly expiresAtMs: number } | null = null;
  #record: BridgeSessionRecord | null = null;
  #timer: ReturnType<typeof setTimeout> | null = null;
  #disposed = false;
  /** One operation at a time: a sign-in and a refresh must never interleave their writes. */
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

  /** The bearer for the bridge's own Playout reads: only while signed in and not past `exp`. */
  accessToken(): string | null {
    const held = this.#access;
    if (held === null || this.#now() >= held.expiresAtMs) return null;
    return held.token;
  }

  /** Read the saved session and refresh it — or say that a station admin must sign the bridge in. */
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
      this.#record = record;
      this.#set({ state: 'waiting' });
      await this.#refresh();
    });
  }

  /**
   * A station admin's one-time sign-in: D1 with these, the refresh token kept, the password
   * dropped when this returns. Answers the contract's failure CODE, never the Playout's text.
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
        return { ok: false, failure: failureOf(err) };
      }
      return this.#adopt(tokens);
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

  #deps(): { fetchImpl?: PlayoutFetchLike; nowMs: () => number } {
    return {
      ...(this.#opts.fetchImpl !== undefined ? { fetchImpl: this.#opts.fetchImpl } : {}),
      nowMs: this.#now,
    };
  }

  async #refresh(): Promise<void> {
    const presented = this.#record?.refreshToken ?? null;
    if (presented === null) {
      this.#lose('there is no saved session');
      return;
    }
    let tokens: PlayoutTokens;
    try {
      tokens = await refreshPlayoutToken(this.#opts.refreshUrl, presented, this.#deps());
    } catch (err) {
      const failure = failureOf(err);
      if (failure === 'invalid_refresh_token' || failure === 'invalid_credentials') {
        // Refused, not unanswered: the token was spent, revoked, or the password changed.
        this.#lose(`the Playout refused the saved session (${failure})`);
        return;
      }
      // Unanswered: keep the token and ask again. An access token still inside `exp` keeps working.
      if (this.accessToken() === null) this.#set({ state: 'waiting' });
      this.#log(`the Playout did not answer the session refresh (${failure}); asking again`);
      this.#schedule(this.#opts.retryMs ?? DEFAULT_RETRY_MS);
      return;
    }
    await this.#adopt(tokens);
  }

  /**
   * 🔴 **PERSIST, THEN USE.** The answer's refresh token is written durably FIRST — before the
   * access token is verified, used, or handed to anything. A crash after this line leaves the new
   * token on disk, and the next start refreshes with it; the spent one is never presented again.
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
      };
      try {
        this.#save(this.#opts.file, record);
      } catch (err) {
        // The token is valid for THIS process; say plainly what a restart will cost.
        this.#log(
          `the session could not be saved (${err instanceof Error ? err.message : String(err)}) — ` +
            'it works until this bridge restarts, and a station admin must sign it in again then',
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
      next.state === this.#state.state && (next.name ?? null) === (this.#state.name ?? null);
    this.#state = next;
    if (!same) for (const l of this.#listeners) l(next);
  }

  #log(line: string): void {
    (this.#opts.log ?? ((l: string) => process.stderr.write(`[caspar-bridge] ${l}\n`)))(line);
  }
}

function failureOf(err: unknown): SignInFailure {
  return err instanceof PlayoutSignInError ? err.code : 'unexpected';
}
