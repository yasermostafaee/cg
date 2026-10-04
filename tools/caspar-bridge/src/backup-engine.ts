import * as path from 'node:path';
import { createRemoteJWKSet, customFetch, jwtVerify } from 'jose';
import {
  normalizeActor,
  type BridgeSessionState,
  type PlayoutFetchLike,
  type PlayoutLicense,
  type SignInFailure,
} from '@cg/shared-ipc';
import {
  BridgeSession,
  type BridgeSessionOptions,
  type BridgeSignInResult,
  type VerifyAccess,
} from './bridge-session.js';
import { PlayoutCatalogue, type PlayoutCatalogueOptions } from './playout-catalogue.js';
import { playout292Url, playoutEndpointsFor, type PlayoutEndpoints } from './playout-config.js';
import { playoutFetch } from './playout-http.js';
import { PlayoutLicenseReader, type PlayoutLicenseReaderOptions } from './playout-license.js';
import {
  PlayoutVersionReader,
  playoutVersionUrl,
  type PlayoutVersionReaderOptions,
} from './playout-version.js';

/**
 * 🔴 `RELEASE-0112-01` (`R-085`) — **THE BACKUP ENGINE, READ WITH ITS OWN SESSION.**
 *
 * A pair is two ENGINES, each with its own core, its own API on `:8080`, its own ES256 key and its own
 * users (`PLAYOUT-CG-RESPONSE-0110-111-v1.md` §2; `RELEASE-0112-01-B`). The primary's token gets
 * `401 invalid_token` on every backup endpoint, and they will not change that. So CG Bridge keeps a
 * second session, signed in on the backup engine with THAT engine's own account and password, and
 * every read of the backup engine carries that token and nothing else:
 *
 *   - D11 `?fingerprint=` (`B-286`: the backup's own clip path) — through {@link accessToken};
 *   - D4, its `casparHost` resolved to the backup engine's host (rule 9);
 *   - `/api/cg/license` — reported on the backup's line, never a refusal of anything;
 *   - one server-side D9 read per access token gained — the introduction that lets this machine into the
 *     backup core's AMCP when the account holds `station-admin` (`BIA` 61-69);
 *   - `/api/v1/system/version` with NO token — whether the backup engine's API answers at all, and its
 *     version (`RELEASE-0112-01-C` C3 offers `cg-bridge` from `2.9.4`).
 *
 * WHERE it is: the primary engine's address with server B's host ({@link backupEngineAddress}) — each
 * engine serves its API on its own core's machine; no engine publishes its partner (`RELEASE-0112-01`
 * §0, B3.1). When server B's host changes, every part is rebuilt for the new address, and the session
 * bound to the old one is never used there.
 *
 * ⚠ ISOLATION is structural: this object holds the only reference to the backup's session, and the
 * primary's session never reads it. A `401`, a reuse revocation or a password change here touches this
 * session alone.
 */

/** The backup engine's API: the primary engine's address at server B's host (`null`: no server B). */
export function backupEngineAddress(
  primaryAddress: string,
  backupHost: string | undefined,
): string | null {
  if (backupHost === undefined || backupHost.trim() === '') return null;
  try {
    const url = new URL(primaryAddress);
    url.hostname = backupHost.trim();
    return url.origin;
  } catch {
    return null;
  }
}

/** The backup's session file, beside the primary's. */
export function backupSessionPath(primarySessionPath: string): string {
  return path.join(path.dirname(primarySessionPath), 'bridge-session-backup.json');
}

const CLOCK_TOLERANCE_SEC = 60;

/**
 * 🔴 **THE BACKUP'S OWN VERIFIER.** ES256 against the BACKUP engine's key set, `aud` containing the
 * audience, `exp` within tolerance, and the account (`sub`, `name`) read. Its issuer is NOT compared,
 * and nothing is adopted: a backup token never authorises anything in CG — it is only the bearer for the
 * backup engine's own reads — so what a station trusts for its consoles stays the primary engine's
 * alone (`PlayoutAuth`, untouched).
 */
export function backupTokenVerifier(jwksUrl: string, audience: string): VerifyAccess {
  const jwks = createRemoteJWKSet(new URL(jwksUrl), {
    cooldownDuration: 60_000,
    cacheMaxAge: 3_600_000,
    timeoutDuration: 5_000,
    [customFetch]: playoutFetch,
  });
  return async (accessToken) => {
    try {
      const { payload } = await jwtVerify(accessToken, jwks, {
        algorithms: ['ES256'],
        clockTolerance: CLOCK_TOLERANCE_SEC,
      });
      const aud = payload.aud;
      const audienceOk =
        typeof aud === 'string' ? aud === audience : (aud ?? []).includes(audience);
      if (!audienceOk) return { ok: false, reason: 'the token is not for CG Control' };
      const sub = payload.sub;
      const rawName = (payload as { name?: unknown }).name;
      const name = typeof rawName === 'string' ? normalizeActor(rawName) : '';
      if (typeof sub !== 'string' || sub === '' || name === '') {
        return { ok: false, reason: 'the token names no account' };
      }
      return { ok: true, name, sub };
    } catch (err) {
      return { ok: false, reason: err instanceof Error ? err.message : String(err) };
    }
  };
}

const INTRODUCE_TIMEOUT_MS = 5_000;

export interface BackupEngineOptions {
  /** The primary engine's address (`http://host:port`). */
  readonly primaryAddress: string;
  /** Server B's host now (read on every {@link BackupEngine.refresh}); `undefined` — no server B. */
  readonly backupHost: () => string | undefined;
  /** TEST / DEV — the backup engine's address outright (two fakes on one PC differ by port). */
  readonly addressOverride?: string | undefined;
  /** `bridge-session-backup.json`; absent — no backup session is kept (a development bridge). */
  readonly sessionFile?: string | undefined;
  readonly audience: string;
  /** The session's D1/D2 request — the bridge's `playoutFetchForSession`. */
  readonly sessionFetch?: PlayoutFetchLike;
  /** TEST-ONLY — the reads' request ({@link playoutFetch} by default). */
  readonly readFetch?: typeof fetch;
  /** TEST-ONLY — the session's timings. */
  readonly sessionTimings?: Pick<
    BridgeSessionOptions,
    'retryMs' | 'refusedRetryMs' | 'answerTimeoutMs' | 'now' | 'save'
  >;
  readonly versionOptions?: PlayoutVersionReaderOptions;
  readonly licenseOptions?: Omit<PlayoutLicenseReaderOptions, 'playoutHost'>;
  readonly catalogueOptions?: Omit<PlayoutCatalogueOptions, 'playoutHost'>;
  readonly now?: () => number;
  readonly log?: (line: string) => void;
}

interface Parts {
  readonly endpoints: PlayoutEndpoints;
  readonly session: BridgeSession | null;
  readonly license: PlayoutLicenseReader;
  readonly catalogue: PlayoutCatalogue;
  readonly version: PlayoutVersionReader;
  readonly unsubscribe: readonly (() => void)[];
}

export class BackupEngine {
  readonly #opts: BackupEngineOptions;
  readonly #now: () => number;
  #address: string | null = null;
  #parts: Parts | null = null;
  #signedInAtMs: number | null = null;
  #introductions = 0;
  readonly #handlers = new Set<() => void>();

  constructor(options: BackupEngineOptions) {
    this.#opts = options;
    this.#now = options.now ?? ((): number => Date.now());
  }

  /** Find the backup engine and start reading it. */
  start(): void {
    this.refresh();
  }

  /**
   * Re-read where the backup engine is (server B changed, or was added or removed). A new address
   * rebuilds every part; the old session is disposed and never used at the new address.
   */
  refresh(): void {
    const host = this.#opts.backupHost();
    const next =
      host === undefined
        ? null
        : (this.#opts.addressOverride ?? backupEngineAddress(this.#opts.primaryAddress, host));
    if (next === this.#address) return;
    this.#disposeParts();
    this.#address = next;
    this.#signedInAtMs = null;
    if (next !== null) this.#parts = this.#build(next);
    this.#emit();
  }

  /** The backup engine's API address, or `null` with no server B. */
  address(): string | null {
    return this.#address;
  }

  /** The backup engine's D11 URL, or `null`. */
  mediaUrl(): string | null {
    return this.#parts?.endpoints.mediaUrl ?? null;
  }

  /** 🔴 The ONLY bearer for the backup engine's reads: its own session's, or `null`. */
  accessToken(): string | null {
    return this.#parts?.session?.accessToken() ?? null;
  }

  session(): BridgeSessionState {
    return this.#parts?.session?.state() ?? { state: 'off' };
  }

  lastSignInFailure(): SignInFailure | null {
    return this.#parts?.session?.lastSignInFailure() ?? null;
  }

  license(): PlayoutLicense | null {
    return this.#parts?.license.license() ?? null;
  }

  version(): string | null {
    return this.#parts?.version.version() ?? null;
  }

  reachable(): boolean | null {
    return this.#parts?.version.reachable() ?? null;
  }

  /** The last good D4 read of the backup engine (epoch ms), or `null`. */
  lastReadAtMs(): number | null {
    return this.#parts?.catalogue.lastGoodReadAtMs() ?? null;
  }

  signedInAtMs(): number | null {
    return this.#signedInAtMs;
  }

  /** Introducing D9 reads made on the backup engine — a test's positive control. */
  get introductions(): number {
    return this.#introductions;
  }

  /** A station admin signs CG Bridge in on the backup engine, with its own account and password. */
  async signIn(username: string, password: string): Promise<BridgeSignInResult> {
    const session = this.#parts?.session ?? null;
    if (session === null) return { ok: false, failure: 'unexpected' };
    const result = await session.signIn(username, password);
    this.#emit();
    return result;
  }

  /** Told whenever anything the backup's line is made from changes. Returns an unsubscribe. */
  onChanged(handler: () => void): () => void {
    this.#handlers.add(handler);
    return () => {
      this.#handlers.delete(handler);
    };
  }

  dispose(): void {
    this.#disposeParts();
  }

  // ── inside ────────────────────────────────────────────────────────────────────────────────

  #build(address: string): Parts {
    const endpoints = playoutEndpointsFor(address);
    const playoutHost = new URL(address).hostname;
    const log = (line: string): void => {
      (this.#opts.log ?? ((l: string) => process.stderr.write(`[caspar-bridge] ${l}\n`)))(
        `backup engine (${address}): ${line}`,
      );
    };
    // Declared first: every reader's bearer is THIS session's token, read when the reader asks.
    let session: BridgeSession | null = null;
    const bearer = (): string | null => session?.accessToken() ?? null;
    const license = new PlayoutLicenseReader(playout292Url(endpoints, 'license'), bearer, {
      ...(this.#opts.licenseOptions ?? {}),
      ...(this.#opts.readFetch !== undefined ? { fetchImpl: this.#opts.readFetch } : {}),
      playoutHost,
    });
    session =
      this.#opts.sessionFile === undefined
        ? null
        : new BridgeSession({
            file: this.#opts.sessionFile,
            address,
            tokenUrl: endpoints.tokenUrl,
            refreshUrl: endpoints.refreshUrl,
            verify: backupTokenVerifier(endpoints.jwksUrl, this.#opts.audience),
            ...(this.#opts.sessionFetch !== undefined
              ? { fetchImpl: this.#opts.sessionFetch }
              : {}),
            ...(this.#opts.sessionTimings ?? {}),
            onAccess: (accessToken) => {
              void this.#introduce(endpoints.revokedUrl, accessToken);
              void license.refresh({ soon: true });
            },
            log,
          });
    const catalogue = new PlayoutCatalogue(endpoints.channelsUrl, bearer, {
      ...(this.#opts.catalogueOptions ?? {}),
      ...(this.#opts.readFetch !== undefined ? { fetchImpl: this.#opts.readFetch } : {}),
      playoutHost,
    });
    const version = new PlayoutVersionReader(playoutVersionUrl(address), {
      ...(this.#opts.versionOptions ?? {}),
      ...(this.#opts.readFetch !== undefined ? { fetchImpl: this.#opts.readFetch } : {}),
    });
    const emit = (): void => {
      this.#emit();
    };
    const held = session;
    const unsubscribe = [
      ...(held !== null
        ? [
            held.onChanged((state) => {
              if (state.state === 'signed-in') this.#signedInAtMs = this.#now();
              emit();
            }),
          ]
        : []),
      license.onChanged(emit),
      version.onChanged(emit),
      version.onReachChanged(emit),
    ];
    license.start();
    catalogue.start();
    version.start();
    void held?.start();
    return { endpoints, session: held, license, catalogue, version, unsubscribe };
  }

  /** One server-side D9 read on the backup engine with its token — AMCP's introduction. Swallows. */
  async #introduce(revokedUrl: string, accessToken: string): Promise<void> {
    this.#introductions += 1;
    try {
      await (this.#opts.readFetch ?? playoutFetch)(revokedUrl, {
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(INTRODUCE_TIMEOUT_MS),
      });
    } catch {
      // An introduction that did not land is retried by the next token; nothing waits on it.
    }
  }

  #disposeParts(): void {
    const parts = this.#parts;
    this.#parts = null;
    if (parts === null) return;
    for (const off of parts.unsubscribe) off();
    parts.session?.dispose();
    parts.license.dispose();
    parts.catalogue.dispose();
    parts.version.dispose();
  }

  #emit(): void {
    for (const handler of [...this.#handlers]) handler();
  }
}
