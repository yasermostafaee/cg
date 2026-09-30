import { parsePlayoutMediaPage } from '@cg/shared-ipc';
import { playoutFetch } from './playout-http.js';

/**
 * 🔴 `PLAYOUT-FEATURES-01` A (`B-286`) — **THE BACKUP'S OWN COPY OF A BOUND CLIP, FOUND BY FINGERPRINT IN THE
 * BACKUP PLAYOUT'S OWN D11.**
 *
 * A media plate's `PLAY` carried the PRIMARY's `clip` to server B too, and a backup Playout is a separate install
 * whose files can sit at other paths (`B-286`). Playout `2.9.1` gives each D11 item a `fingerprint` — the same for
 * the same bytes on any server, and given only when `clip`'s bytes really match (ROUTE-ON-DONE §2) — and a
 * `?fingerprint=` filter. So the bridge asks the BACKUP's own D11 for each bound clip's fingerprint and sends
 * server B the `clip` B listed. The rules:
 *
 * - **Resolved BEFORE any take, and cached by fingerprint.** A take, a swap or a restore reads
 *   {@link BackupMediaLookup.lookup} synchronously and NEVER waits on the backup.
 * - **Resolved again** when a clip is bound (the catalogue changes), after server B reconnects (a new core may
 *   hold another library — a new `epoch` always comes with one), and on a 30 s cadence.
 * - **A returned item counts only when its OWN `fingerprint` equals the one asked for** — an older Playout
 *   ignores the filter and answers the first page of its library.
 * - **The backup is never sent a path it has not listed.** No fingerprint, no copy, a backup older than
 *   `2.9.1` (its items carry no fingerprint), or a list not read yet: server B gets NOTHING for that plate, and
 *   the row says so in one line.
 *
 * ⚠ The bearer is the bridge's own (the primary Playout's). Whether a backup Playout — a separate install
 * with its own keys — accepts it is for `.111`'s pair to show; if it does not, every read fails, and every
 * media plate stays empty on the backup with the line naming that the list could not be read.
 */

/** Why server B is sent nothing for a clip. */
export type BackupRefusalReason = 'no-fingerprint' | 'no-copy' | 'backup-old' | 'backup-unread';

/** What server B gets for one clip: its OWN path, or nothing, with the reason. */
export type BackupClip =
  | { readonly kind: 'copy'; readonly clip: string }
  | { readonly kind: 'refused'; readonly reason: BackupRefusalReason };

/** D11's filter takes at most this many values per request (ROUTE-ON-DONE §2). */
export const FINGERPRINTS_PER_CALL = 100;

/** The periodic re-read, beside the bound media's own (`SOURCES_POLL_MS`). */
export const BACKUP_MEDIA_POLL_MS = 30_000;

const HTTP_TIMEOUT_MS = 5_000;

export interface BackupMediaLookupOptions {
  /** The BACKUP Playout's D11 URL, or `null` while no server B is configured. Read per request. */
  readonly url: () => string | null;
  /** The bearer (the bridge's own session, checked at use), or `null`: nothing is read. */
  readonly bearer: () => string | null;
  /** TEST-ONLY — {@link playoutFetch} by default: server-side, no `Origin`, no proxy. */
  readonly fetchImpl?: typeof fetch;
  /** Where a read's outcome is said (the bridge's log). */
  readonly log?: (line: string) => void;
}

export class BackupMediaLookup {
  readonly #url: () => string | null;
  readonly #bearer: () => string | null;
  readonly #fetch: typeof fetch;
  readonly #log: (line: string) => void;
  /** fingerprint → the backup's own `clip`, or `null`: its D11 lists no such item. */
  readonly #answers = new Map<string, string | null>();
  /** The backup answered items carrying NO fingerprint: a Playout older than `2.9.1`. */
  #old = false;
  #known = new Set<string>();
  #ticker: ReturnType<typeof setInterval> | null = null;
  #inFlight: Promise<void> | null = null;
  readonly #handlers = new Set<() => void>();

  constructor(options: BackupMediaLookupOptions) {
    this.#url = options.url;
    this.#bearer = options.bearer;
    this.#fetch = options.fetchImpl ?? playoutFetch;
    this.#log = options.log ?? ((): void => undefined);
  }

  /**
   * 🔴 **What server B gets for this clip — synchronous; nothing waits on the backup.** Absent fingerprint:
   * refused. A backup older than `2.9.1`: refused. A fingerprint answered: B's own path, or refused.
   * Not answered yet (never read, or unreachable): refused — the backup is never sent a path it has not
   * listed.
   */
  lookup(fingerprint: string | undefined): BackupClip {
    if (fingerprint === undefined) return { kind: 'refused', reason: 'no-fingerprint' };
    if (this.#old) return { kind: 'refused', reason: 'backup-old' };
    const answer = this.#answers.get(fingerprint.toLowerCase());
    if (answer === undefined) return { kind: 'refused', reason: 'backup-unread' };
    return answer === null
      ? { kind: 'refused', reason: 'no-copy' }
      : { kind: 'copy', clip: answer };
  }

  /** Called whenever an answer changes. Returns an unsubscribe. */
  onChanged(handler: () => void): () => void {
    this.#handlers.add(handler);
    return () => {
      this.#handlers.delete(handler);
    };
  }

  /** Arm the 30 s re-read. `unref`'d, so it never holds the process open. */
  start(): void {
    if (this.#ticker !== null) return;
    this.#ticker = setInterval(() => {
      void this.refreshAll();
    }, BACKUP_MEDIA_POLL_MS);
    this.#ticker.unref();
  }

  dispose(): void {
    if (this.#ticker !== null) clearInterval(this.#ticker);
    this.#ticker = null;
  }

  /**
   * The bound clips' fingerprints changed (a bind, a re-read): remember them, and read the ones never
   * answered. Never rejects.
   */
  track(fingerprints: Iterable<string>): Promise<void> {
    const next = new Set([...fingerprints].map((f) => f.toLowerCase()));
    this.#known = next;
    const fresh = [...next].filter((f) => !this.#answers.has(f));
    return fresh.length === 0 ? Promise.resolve() : this.#resolve(fresh);
  }

  /**
   * Forget every answer and read again — server B's address changed, so what another machine listed says
   * nothing about this one. Until the new answers land, every clip is `backup-unread`: sent nothing.
   */
  reset(): Promise<void> {
    this.#answers.clear();
    this.#old = false;
    for (const handler of [...this.#handlers]) handler();
    return this.refreshAll();
  }

  /** Read every known fingerprint again (server B reconnected; the 30 s cadence). Never rejects. */
  refreshAll(): Promise<void> {
    return this.#known.size === 0 ? Promise.resolve() : this.#resolve([...this.#known]);
  }

  #resolve(fingerprints: readonly string[]): Promise<void> {
    // One read at a time: a second call while one is in flight waits for it, then reads what is new.
    const run = async (): Promise<void> => {
      if (this.#inFlight !== null) await this.#inFlight.catch(() => undefined);
      for (let i = 0; i < fingerprints.length; i += FINGERPRINTS_PER_CALL) {
        await this.#readChunk(fingerprints.slice(i, i + FINGERPRINTS_PER_CALL));
      }
    };
    const promise = run().catch(() => undefined);
    this.#inFlight = promise;
    return promise;
  }

  async #readChunk(chunk: readonly string[]): Promise<void> {
    const url = this.#url();
    const bearer = this.#bearer();
    if (url === null || bearer === null || chunk.length === 0) return;
    let body: unknown;
    try {
      const res = await this.#fetch(`${url}?fingerprint=${chunk.join(',')}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${bearer}` },
        signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
      });
      if (!res.ok) {
        this.#log(`backup media list answered ${String(res.status)} — kept what was known`);
        return;
      }
      body = await res.json();
    } catch {
      this.#log('backup media list not reachable — kept what was known');
      return;
    }
    const page = parsePlayoutMediaPage(body);
    if (page === null) return;
    let changed = false;
    // An item with no fingerprint: the backup ignored the filter — a Playout older than `2.9.1`.
    const old = page.items.some((item) => item.fingerprint === undefined);
    if (old !== this.#old) {
      this.#old = old;
      changed = true;
    }
    for (const fingerprint of chunk) {
      const hit = page.items.find((item) => item.fingerprint === fingerprint);
      const answer = hit === undefined ? null : hit.clip;
      if (this.#answers.get(fingerprint) !== answer) {
        this.#answers.set(fingerprint, answer);
        changed = true;
      }
    }
    if (changed) for (const handler of [...this.#handlers]) handler();
  }
}

/**
 * The BACKUP Playout's D11 URL: the configured Playout's, at server B's host (a backup Playout runs on its own
 * core's machine, at the same port and path). `null` with no server B.
 */
export function backupMediaUrl(
  primaryMediaUrl: string,
  backupHost: string | undefined,
): string | null {
  if (backupHost === undefined) return null;
  try {
    const url = new URL(primaryMediaUrl);
    url.hostname = backupHost;
    return url.toString();
  } catch {
    return null;
  }
}
