import { isLoopbackCasparHost } from './playout-catalogue.js';
import { playoutFetch } from './playout-http.js';

/**
 * 🔴 `B-313` (`RELEASE-0112-01` Part B) — **NEVER A SECOND SENDER ON THE BACKUP CORE.**
 *
 * The Playout's engine installer ticks «CG Bridge هم نصب شود» by default, so installing the backup engine
 * puts a CG Bridge on the backup engine's machine. That bridge reaches the backup core over loopback with
 * no approval, and once it is given a channel it writes the same layers this bridge mirrors there — and
 * the core's `DEFER` list is one per channel, shared by every AMCP connection (`V13S` 207-213). No engine
 * publishes that it is a backup (`RELEASE-0112-01` §0.4), so the guard works from what CAN be seen: the
 * `/health` of the CG Bridge on the core's machine — unauthenticated, read-only, documented, and opened
 * by our own installer's firewall rule wherever one is installed.
 *
 * - **Server B:** while a CG Bridge there DRIVES that core ({@link drivesCore}), server B is HELD — its
 *   session stopped, never failed over to — and the backup's line reads `core-held`. Until the first
 *   answer about a server B, it is held too: nothing is sent to a core before the guard has looked.
 * - **Server A** (only when it is another machine): the same reading, and ONLY said (`core-shared`) —
 *   holding the primary would change the primary's take path, which this guard never does.
 * - **Its own `/health` never counts** (a server B on this machine is probed at this bridge's own port).
 *
 * What it cannot cover, said rather than hidden: a firewall that drops the other bridge's port hides it,
 * and the OTHER bridge's sends are not this bridge's to stop.
 */

/** How often a server's machine is read again. */
export const CORE_GUARD_POLL_MS = 15_000;

const PROBE_TIMEOUT_MS = 3_000;

/** A core this bridge drives: its host and AMCP port, as configured. */
export interface CoreEndpoint {
  readonly host: string;
  readonly amcpPort: number;
}

/** What identifies THIS bridge's own `/health`. */
export interface SelfIdentity {
  readonly startedAt: string;
  readonly controlPort: () => number;
}

interface PeerHealth {
  readonly app?: unknown;
  readonly startedAt?: unknown;
  readonly ports?: { readonly control?: unknown };
  readonly casparcg?: {
    readonly servers?: readonly {
      readonly host?: unknown;
      readonly amcpPort?: unknown;
      readonly channels?: unknown;
    }[];
    readonly channels?: unknown;
  };
}

/**
 * 🔴 **THE ONE PREDICATE: does the CG Bridge whose `/health` this is drive `core` — on a channel we write
 * there?** `peerHost` is the host the answer came from (the core's machine). A `casparcg.servers` row must
 * name the core — that host, or loopback on that machine, at the same AMCP port.
 *
 * 🔴 `RELEASE-0113-01` (the Playout team's §2: redundancy belongs to a CHANNEL, and one engine may hold
 * standalone channels, primaries and mirrors at once) — and the channels it drives THERE must meet `ours`,
 * the channels THIS bridge writes on that core in the core's own numbers: on server B the backup's mirror
 * channels in force, never A's numbers. Its row's own `channels` when `/health` has them (`0.11.3`+), else its
 * top-level `casparcg.channels` (`0.11.2`, which wrote its numbers to every core alike); a `/health` with no
 * list at all (older than `0.11.2`) counts as driving — unknown resolves to the safe side.
 */
export function drivesCore(
  health: unknown,
  core: CoreEndpoint,
  peerHost: string,
  ours: readonly number[],
): boolean {
  if (typeof health !== 'object' || health === null) return false;
  const h = health as PeerHealth;
  if (h.app !== 'cg-bridge') return false;
  const rows = Array.isArray(h.casparcg?.servers) ? h.casparcg.servers : [];
  const named = rows.filter(
    (r) =>
      r.amcpPort === core.amcpPort &&
      typeof r.host === 'string' &&
      (r.host === core.host || r.host === peerHost || isLoopbackCasparHost(r.host)),
  );
  if (named.length === 0) return false;
  const lists = named.map((r) => (Array.isArray(r.channels) ? (r.channels as unknown[]) : null));
  const theirs: unknown[] | null = lists.every((l) => l !== null)
    ? lists.flatMap((l) => l ?? [])
    : Array.isArray(h.casparcg?.channels)
      ? (h.casparcg.channels as unknown[])
      : null;
  if (theirs === null) return true;
  return theirs.some((c) => typeof c === 'number' && ours.includes(c));
}

/** Is this answer THIS bridge's own `/health`? */
export function isOwnHealth(health: unknown, self: SelfIdentity): boolean {
  if (typeof health !== 'object' || health === null) return false;
  const h = health as PeerHealth;
  return h.startedAt === self.startedAt && h.ports?.control === self.controlPort();
}

export interface CoreGuardVerdict {
  /** Server B's core is driven by the CG Bridge at this address (`host:port`), or `null`. */
  readonly heldB: string | null;
  /** Server A's core is ALSO driven by the CG Bridge at this address, or `null`. */
  readonly sharedA: string | null;
  /** The guard has answered about the server B in force (until then B is held). */
  readonly answeredB: boolean;
}

export interface CoreGuardOptions {
  /** The cores in force now: server A, and server B when declared. */
  readonly servers: () => { readonly A: CoreEndpoint; readonly B?: CoreEndpoint | undefined };
  /**
   * `RELEASE-0113-01` — the channels this bridge writes on each core, in that core's own numbers: A's
   * declared channels, and server B's mirror channels in force.
   */
  readonly channels: () => { readonly A: readonly number[]; readonly B: readonly number[] };
  /** The control port a CG Bridge on a core's machine answers on (this bridge's own, by default). */
  readonly peerPort: () => number;
  readonly self: SelfIdentity;
  /** Hold or release server B — the runtime's `holdServerB`. */
  readonly holdB: (held: boolean) => Promise<void>;
  /** TEST-ONLY — {@link playoutFetch} by default (server-side, no proxy). */
  readonly fetchImpl?: typeof fetch;
  readonly pollMs?: number;
  readonly log?: (line: string) => void;
}

export class CoreGuard {
  readonly #opts: CoreGuardOptions;
  readonly #fetch: typeof fetch;
  #verdict: CoreGuardVerdict = { heldB: null, sharedA: null, answeredB: false };
  /** The server B the last answer was about (`host:port`), so a new one is held until read. */
  #answeredFor: string | null = null;
  #ticker: ReturnType<typeof setInterval> | null = null;
  #inFlight: Promise<void> | null = null;
  #probes = 0;
  readonly #handlers = new Set<(verdict: CoreGuardVerdict) => void>();

  constructor(options: CoreGuardOptions) {
    this.#opts = options;
    this.#fetch = options.fetchImpl ?? playoutFetch;
  }

  verdict(): CoreGuardVerdict {
    return this.#verdict;
  }

  /** `/health` reads made — a test's positive control. */
  get probes(): number {
    return this.#probes;
  }

  onChanged(handler: (verdict: CoreGuardVerdict) => void): () => void {
    this.#handlers.add(handler);
    return () => {
      this.#handlers.delete(handler);
    };
  }

  /**
   * Hold a declared server B until the first answer, read now, then every {@link CORE_GUARD_POLL_MS}.
   * Call BEFORE the runtime connects its sessions. Resolves once the hold is in place.
   */
  async start(): Promise<void> {
    if (this.#opts.servers().B !== undefined) await this.#opts.holdB(true);
    void this.refresh();
    if (this.#ticker !== null) return;
    this.#ticker = setInterval(() => {
      void this.refresh();
    }, this.#opts.pollMs ?? CORE_GUARD_POLL_MS);
    this.#ticker.unref();
  }

  /**
   * The servers changed (Station setup): a server B on another machine is held until it is read; then
   * read now.
   */
  async serversChanged(): Promise<void> {
    const b = this.#opts.servers().B;
    const key = b === undefined ? null : `${b.host}:${String(b.amcpPort)}`;
    if (key !== null && key !== this.#answeredFor) {
      await this.#opts.holdB(true);
      this.#set({ ...this.#verdict, answeredB: false, heldB: null });
    }
    await this.refresh();
  }

  dispose(): void {
    if (this.#ticker !== null) clearInterval(this.#ticker);
    this.#ticker = null;
  }

  /** Read every server's machine once (a read in flight is shared). Never rejects. */
  refresh(): Promise<void> {
    if (this.#inFlight !== null) return this.#inFlight;
    this.#inFlight = this.#read().finally(() => {
      this.#inFlight = null;
    });
    return this.#inFlight;
  }

  async #read(): Promise<void> {
    const { A, B } = this.#opts.servers();
    const ours = this.#opts.channels();
    const port = this.#opts.peerPort();
    const [aDriver, bDriver] = await Promise.all([
      // Server A on this machine is this bridge's own; it is read only when it is another machine.
      isLoopbackCasparHost(A.host) ? Promise.resolve(null) : this.#driverOf(A, port, ours.A),
      B === undefined ? Promise.resolve(null) : this.#driverOf(B, port, ours.B),
    ]);
    const keyB = B === undefined ? null : `${B.host}:${String(B.amcpPort)}`;
    // Server B changed while this read ran: its answer is about another machine.
    const nowB = this.#opts.servers().B;
    const stillB = nowB === undefined ? null : `${nowB.host}:${String(nowB.amcpPort)}`;
    if (stillB !== keyB) return;
    this.#answeredFor = keyB;
    const next: CoreGuardVerdict = { heldB: bDriver, sharedA: aDriver, answeredB: B !== undefined };
    if (B !== undefined) await this.#opts.holdB(bDriver !== null);
    if (bDriver !== null && bDriver !== this.#verdict.heldB) {
      this.#log(
        `🔴 another CG Bridge (${bDriver}) drives server B's CasparCG — nothing is sent to it ` +
          'while it does (B-313)',
      );
    }
    if (bDriver === null && this.#verdict.heldB !== null) {
      this.#log(`server B's CasparCG is no longer driven by another CG Bridge — connecting it`);
    }
    if (aDriver !== null && aDriver !== this.#verdict.sharedA) {
      this.#log(
        `🔴 another CG Bridge (${aDriver}) ALSO drives server A's CasparCG — two senders on one ` +
          'core; turn the other one off',
      );
    }
    this.#set(next);
  }

  /** `host:port` of a CG Bridge on `core`'s machine that drives it, or `null`. */
  async #driverOf(
    core: CoreEndpoint,
    port: number,
    ours: readonly number[],
  ): Promise<string | null> {
    if (port <= 0) return null;
    const where = `${core.host}:${String(port)}`;
    this.#probes += 1;
    let body: unknown;
    try {
      const res = await this.#fetch(`http://${hostForUrl(core.host)}:${String(port)}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      });
      if (!res.ok) return null;
      body = await res.json();
    } catch {
      return null; // Nothing answers there, or not a CG Bridge: nobody drives it from there.
    }
    if (isOwnHealth(body, this.#opts.self)) return null;
    return drivesCore(body, core, core.host, ours) ? where : null;
  }

  #set(next: CoreGuardVerdict): void {
    const same =
      next.heldB === this.#verdict.heldB &&
      next.sharedA === this.#verdict.sharedA &&
      next.answeredB === this.#verdict.answeredB;
    this.#verdict = next;
    if (!same) for (const handler of [...this.#handlers]) handler(next);
  }

  #log(line: string): void {
    (this.#opts.log ?? ((l: string) => process.stderr.write(`[caspar-bridge] ${l}\n`)))(line);
  }
}

/** An IPv6 literal in a URL needs its brackets. */
function hostForUrl(host: string): string {
  return host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
}
