import { EventEmitter } from 'node:events';
import { AmcpTransport, type ParsedAmcpResponse } from '../amcp/transport.js';
import { OscTransport } from '../osc/transport.js';
import { CommandQueue } from '../queue/command-queue.js';
import { Backoff } from './backoff.js';

/**
 * Lifecycle per Phase 5 §2. Re-entering RESYNCING after every reconnect
 * is mandatory — the Reconciler cannot trust stale state.
 */
export type ServerSessionState =
  | 'disconnected'
  | 'connecting'
  | 'handshaking'
  | 'resyncing'
  | 'healthy'
  | 'degraded';

export interface ServerSessionOptions {
  /** Logical name (`'A'` / `'B'`) so log lines + events disambiguate which session. */
  name: string;
  /** AMCP host + port. */
  host: string;
  port: number;
  /** OSC bind port (CasparCG pushes here). `0` = ephemeral. */
  oscPort: number;
  /** OSC bind interface. Defaults to `'0.0.0.0'`. */
  oscBindHost?: string;

  /** Backoff config (Phase 5 §2: 250 → 500 → 1000 → 2000 → cap 4000). */
  initialBackoffMs?: number;
  maxBackoffMs?: number;

  /** OSC silence thresholds (Phase 5 §4.4 / §9). */
  oscDegradedAfterMs?: number;
  oscDownAfterMs?: number;
  /** Cadence of the OSC freshness watcher. */
  watcherIntervalMs?: number;

  /** OSC drain window during RESYNCING (Phase 5 §2). */
  resyncDurationMs?: number;

  /** Handshake-class command timeouts (Phase 5 §5.4). */
  versionTimeoutMs?: number;
  infoTimeoutMs?: number;

  /** Time source override for tests. */
  now?: () => number;

  /**
   * Factories so tests can substitute mocks. By default each reconnect
   * cycle constructs a fresh AmcpTransport and CommandQueue. The OSC
   * transport is created once per session and reused across cycles.
   */
  createAmcp?: () => AmcpTransport;
  createOsc?: () => OscTransport;
  createQueue?: (transport: AmcpTransport) => CommandQueue;
}

export interface ServerSessionEvents {
  'state-change': [info: { from: ServerSessionState; to: ServerSessionState; reason: string }];
  healthy: [];
  disconnected: [info: { reason: string }];
  error: [err: Error];
}

/**
 * ServerSession — owns one CasparCG instance's transports + queue and runs
 * the Phase 5 §2 FSM.
 *
 * Responsibilities:
 *   - Open AMCP TCP + bind OSC UDP.
 *   - Handshake: `VERSION` → `INFO`.
 *   - Mandatory RESYNCING after every reconnect (OSC drain window).
 *   - Auto-reconnect with exponential backoff on disconnect.
 *   - Watch OSC freshness; transition HEALTHY → DEGRADED → DISCONNECTED
 *     per Phase 5 §4.4 thresholds.
 *   - Expose `amcp` / `osc` / `queue` getters returning the **current**
 *     cycle's instances; references rotate after each reconnect.
 *
 * Out of scope (lands in later sub-milestones):
 *   - AMCP heartbeat ping (M4.5, HeartbeatService).
 *   - DEGRADED → RESYNCING-on-recovery path (deferred — current code
 *     treats prolonged OSC silence as DISCONNECTED and goes through a
 *     full reconnect cycle, which is more conservative).
 *   - Redundancy / failover across two sessions (M4.6).
 */
export class ServerSession extends EventEmitter<ServerSessionEvents> {
  readonly name: string;

  private currentState: ServerSessionState = 'disconnected';
  private currentAmcp: AmcpTransport;
  private currentOsc: OscTransport;
  private currentQueue: CommandQueue;
  private readonly backoff: Backoff;

  private readonly host: string;
  private readonly port: number;
  private readonly oscPort: number;
  private readonly oscBindHost: string;
  private readonly oscDegradedAfterMs: number;
  private readonly oscDownAfterMs: number;
  private readonly watcherIntervalMs: number;
  private readonly resyncDurationMs: number;
  private readonly versionTimeoutMs: number;
  private readonly infoTimeoutMs: number;
  private readonly now: () => number;
  private readonly createAmcp: () => AmcpTransport;
  private readonly createQueue: (t: AmcpTransport) => CommandQueue;

  private lastOscAt = 0;
  private degradedSince = 0;
  private oscBound = false;
  private watcher: NodeJS.Timeout | null = null;
  private stopping = false;
  private running = false;
  private currentDelayResolve: (() => void) | null = null;
  private currentDelayTimer: NodeJS.Timeout | null = null;

  /** Resolved by the watcher when HEALTHY exits — drives the outer loop. */
  private healthyExitResolve: (() => void) | null = null;

  constructor(opts: ServerSessionOptions) {
    super();
    this.name = opts.name;
    this.host = opts.host;
    this.port = opts.port;
    this.oscPort = opts.oscPort;
    this.oscBindHost = opts.oscBindHost ?? '0.0.0.0';
    this.oscDegradedAfterMs = opts.oscDegradedAfterMs ?? 3000;
    this.oscDownAfterMs = opts.oscDownAfterMs ?? 10000;
    this.watcherIntervalMs = opts.watcherIntervalMs ?? 500;
    this.resyncDurationMs = opts.resyncDurationMs ?? 2000;
    this.versionTimeoutMs = opts.versionTimeoutMs ?? 1000;
    this.infoTimeoutMs = opts.infoTimeoutMs ?? 3000;
    this.now = opts.now ?? (() => Date.now());

    this.createAmcp = opts.createAmcp ?? ((): AmcpTransport => new AmcpTransport());
    this.createQueue =
      opts.createQueue ?? ((t: AmcpTransport): CommandQueue => new CommandQueue(t));
    const createOsc = opts.createOsc ?? ((): OscTransport => new OscTransport());

    this.currentOsc = createOsc();
    this.currentAmcp = this.createAmcp();
    this.currentQueue = this.createQueue(this.currentAmcp);
    this.backoff = new Backoff(opts.initialBackoffMs, opts.maxBackoffMs);

    this.currentOsc.on('events', this.onOscEvents);
    this.on('error', noop);
  }

  /** The current AMCP transport. Reference rotates after each reconnect cycle. */
  get amcp(): AmcpTransport {
    return this.currentAmcp;
  }
  /** The OSC transport. Lives for the whole session lifetime. */
  get osc(): OscTransport {
    return this.currentOsc;
  }
  /** The current command queue. Reference rotates after each reconnect cycle. */
  get queue(): CommandQueue {
    return this.currentQueue;
  }
  get state(): ServerSessionState {
    return this.currentState;
  }
  get reconnectAttempts(): number {
    return this.backoff.attemptCount;
  }

  /** Begin the FSM loop. Returns immediately; status flows through events. */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.stopping = false;
    void this.loop();
  }

  /** Tear down — closes transports, rejects pending queue items, ends the loop. */
  async stop(): Promise<void> {
    if (!this.running && this.currentState === 'disconnected') return;
    this.stopping = true;
    this.running = false;
    this.cancelDelay();
    this.resolveHealthyExit();
    this.stopWatcher();
    this.currentQueue.dispose();
    this.currentAmcp.destroy();
    await this.currentOsc.close();
    this.transitionTo('disconnected', 'stop()');
  }

  private async loop(): Promise<void> {
    // OSC binds once for the session's lifetime.
    if (!this.oscBound) {
      try {
        await this.currentOsc.listen(this.oscBindHost, this.oscPort);
        this.oscBound = true;
      } catch (err) {
        this.emit('error', err instanceof Error ? err : new Error(String(err)));
        return;
      }
    }

    while (this.running) {
      try {
        this.transitionTo('connecting', 'reconnect cycle');
        await this.currentAmcp.connect(this.host, this.port);

        this.transitionTo('handshaking', 'tcp open');
        await this.handshake();

        this.transitionTo('resyncing', 'mandatory post-reconnect drain');
        this.currentOsc.resetState();
        this.lastOscAt = this.now();
        await this.delay(this.resyncDurationMs);
        if (!this.running) break;

        this.backoff.reset();
        this.transitionTo('healthy', 'resync complete');
        this.emit('healthy');

        this.startWatcher();
        await this.waitForHealthyExit();
        this.stopWatcher();
      } catch (err) {
        if (!this.stopping) {
          this.emit('error', err instanceof Error ? err : new Error(String(err)));
        }
      }

      if (!this.running) break;

      // Tear down the cycle's transport + queue; we'll allocate fresh
      // ones for the next attempt.
      this.currentQueue.dispose();
      this.currentAmcp.destroy();
      this.stopWatcher();
      this.transitionTo('disconnected', 'cycle teardown');

      const wait = this.backoff.nextDelay();
      this.emit('disconnected', { reason: `backoff ${String(wait)}ms` });
      await this.delay(wait);
      if (!this.running) break;

      // Fresh transport + queue for the next cycle. OSC stays bound.
      this.currentAmcp = this.createAmcp();
      this.currentAmcp.on('error', noop);
      this.currentQueue = this.createQueue(this.currentAmcp);
    }
  }

  private async handshake(): Promise<void> {
    const version = await this.currentQueue.enqueue('VERSION', {
      priority: 'urgent',
      timeoutMs: this.versionTimeoutMs,
    });
    if (!isOk(version.response)) {
      throw new Error(`VERSION handshake failed: code=${String(version.response.code)}`);
    }
    const info = await this.currentQueue.enqueue('INFO', {
      priority: 'urgent',
      timeoutMs: this.infoTimeoutMs,
    });
    if (!isOk(info.response)) {
      throw new Error(`INFO handshake failed: code=${String(info.response.code)}`);
    }
  }

  private waitForHealthyExit(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.healthyExitResolve = resolve;
      // Resolve immediately if state already transitioned out of HEALTHY
      // (a synchronous AMCP close could happen between transitionTo and here).
      if (this.currentState !== 'healthy' && this.currentState !== 'degraded') {
        this.resolveHealthyExit();
      }
    });
  }

  private resolveHealthyExit(): void {
    if (this.healthyExitResolve !== null) {
      const r = this.healthyExitResolve;
      this.healthyExitResolve = null;
      r();
    }
  }

  private startWatcher(): void {
    this.stopWatcher();
    this.currentAmcp.once('close', this.onAmcpClose);
    this.watcher = setInterval(this.tick, this.watcherIntervalMs);
    this.watcher.unref?.();
  }

  private stopWatcher(): void {
    if (this.watcher !== null) {
      clearInterval(this.watcher);
      this.watcher = null;
    }
    this.currentAmcp.off('close', this.onAmcpClose);
  }

  private tick = (): void => {
    const sinceOsc = this.now() - this.lastOscAt;

    if (this.currentState === 'healthy' && sinceOsc > this.oscDegradedAfterMs) {
      this.degradedSince = this.now();
      this.transitionTo('degraded', `osc silence ${String(sinceOsc)}ms`);
      return;
    }

    if (this.currentState === 'degraded') {
      // Recovery: OSC came back within the down threshold → restored to HEALTHY.
      if (sinceOsc <= this.oscDegradedAfterMs / 2) {
        this.transitionTo('healthy', 'osc recovered');
        return;
      }
      // Down: stayed silent past the harder threshold → force reconnect.
      if (this.now() - this.degradedSince > this.oscDownAfterMs) {
        this.transitionTo('disconnected', `osc down > ${String(this.oscDownAfterMs)}ms`);
        this.resolveHealthyExit();
      }
    }
  };

  private onAmcpClose = (): void => {
    if (this.currentState === 'disconnected') return;
    this.transitionTo('disconnected', 'amcp peer closed');
    this.resolveHealthyExit();
  };

  private onOscEvents = (_: unknown, meta: { recvAt: number }): void => {
    this.lastOscAt = meta.recvAt;
  };

  private transitionTo(to: ServerSessionState, reason: string): void {
    const from = this.currentState;
    if (from === to) return;
    this.currentState = to;
    this.emit('state-change', { from, to, reason });
  }

  private delay(ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
      this.currentDelayResolve = resolve;
      const t = setTimeout(() => {
        this.currentDelayTimer = null;
        this.currentDelayResolve = null;
        resolve();
      }, ms);
      t.unref?.();
      this.currentDelayTimer = t;
    });
  }

  private cancelDelay(): void {
    if (this.currentDelayTimer !== null) {
      clearTimeout(this.currentDelayTimer);
      this.currentDelayTimer = null;
    }
    if (this.currentDelayResolve !== null) {
      const r = this.currentDelayResolve;
      this.currentDelayResolve = null;
      r();
    }
  }
}

function isOk(resp: ParsedAmcpResponse): boolean {
  return resp.kind !== 'err';
}

function noop(): void {
  /* baseline error listener */
}
