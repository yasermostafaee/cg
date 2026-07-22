import { EventEmitter } from 'node:events';
import { AmcpTransport, type ParsedAmcpResponse } from '../amcp/transport.js';
import { OscTransport } from '../osc/transport.js';
import { CommandQueue } from '../queue/command-queue.js';
import { probeAmcpLiveness } from './amcp-probe.js';
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

  /** OSC silence threshold for the HEALTHY → DEGRADED demote (Phase 5 §4.4 / §9). */
  oscDegradedAfterMs?: number;
  /**
   * How long OSC may stay silent before the session stops trusting the silence
   * and ASKS AMCP whether it is alive — and the cadence of every re-ask after an
   * answer. It does NOT disconnect on its own: only a failed AMCP probe does
   * (B-101).
   */
  oscDownAfterMs?: number;
  /** Cadence of the OSC freshness watcher. */
  watcherIntervalMs?: number;

  /** OSC drain window during RESYNCING (Phase 5 §2). */
  resyncDurationMs?: number;

  /**
   * Handshake-class command timeouts (Phase 5 §5.4). `versionTimeoutMs` also
   * bounds the degraded-window liveness probe — it is the same `VERSION` against
   * the same peer, so a second knob would be two names for one latency budget.
   */
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
 *   - Watch OSC freshness; demote HEALTHY → DEGRADED per Phase 5 §4.4. Past
 *     the harder threshold, probe AMCP itself rather than reading OSC silence
 *     as proof the socket is dead (B-101).
 *   - Expose `amcp` / `osc` / `queue` getters returning the **current**
 *     cycle's instances; references rotate after each reconnect.
 *
 * Out of scope (lands in later sub-milestones):
 *   - Continuous AMCP heartbeat ping (M4.5, HeartbeatService — still dead
 *     wiring per C-010). The degraded-window probe below is not that: it
 *     fires only while OSC is silent, never on a healthy link.
 *   - DEGRADED → RESYNCING on recovery (still deferred): when OSC returns the
 *     session goes straight back to HEALTHY with no drain window. Note the old
 *     justification for the deferral — that prolonged silence went through a
 *     full reconnect anyway — no longer holds; silence alone never disconnects.
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
  /** When the next AMCP liveness probe falls due, while `degraded` (B-101). */
  private nextProbeAt = 0;
  /** One probe at a time — `tick` is a setInterval, the probe is async. */
  private probeInFlight = false;
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
    // Only the declared server's OSC counts as evidence that we are hearing IT
    // (the ingest binds a routable interface for a remote server, so anything on
    // the LAN can reach this port). Trust signal only — see OscTransportOptions.
    const createOsc =
      opts.createOsc ?? ((): OscTransport => new OscTransport({ expectedSourceHost: opts.host }));

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
      this.nextProbeAt = this.now() + this.oscDownAfterMs;
      this.transitionTo('degraded', `osc silence ${String(sinceOsc)}ms`);
      return;
    }

    if (this.currentState === 'degraded') {
      // Recovery: OSC came back within the down threshold → restored to HEALTHY.
      if (sinceOsc <= this.oscDegradedAfterMs / 2) {
        this.transitionTo('healthy', 'osc recovered');
        return;
      }
      // Silent past the harder threshold. That is a CONFIRMATION-axis fact and
      // says nothing about the COMMAND axis — so ask the command axis itself,
      // instead of tearing down a socket OSC cannot speak for (B-101).
      if (this.now() >= this.nextProbeAt) {
        void this.probeAmcpAxis();
      }
    }
  };

  /**
   * B-101 — the degraded-window AMCP liveness probe.
   *
   * Answered → the link is fine and only its confirmation is missing: hold
   * `degraded`, keep the transport, re-arm for the next window. An install that
   * never sends OSC therefore holds ONE stable connection with full command
   * capability, which is what C-014 and B-094 already design for.
   *
   * Failed → the command axis really is dead, including the half-open case
   * (socket up, peer mute) that `onAmcpClose` structurally cannot see: disconnect
   * so the existing teardown/backoff/reconnect loop runs — this time for a reason
   * AMCP reported rather than one OSC was blamed for.
   */
  private async probeAmcpAxis(): Promise<void> {
    if (this.probeInFlight) return;
    this.probeInFlight = true;
    // Bind the verdict to THIS cycle's queue: a teardown rotates `currentQueue`,
    // and a probe that outlives its cycle must never act on the next one.
    const probedQueue = this.currentQueue;
    try {
      const verdict = await probeAmcpLiveness(probedQueue, this.versionTimeoutMs, this.now);
      // The probe is async and `tick` is a setInterval, so by now OSC may have
      // recovered, the peer may have closed, or stop() may have run. A verdict
      // only applies to the session state it was asked about.
      if (!this.probeApplies(probedQueue)) return;
      if (verdict.ok) {
        this.nextProbeAt = this.now() + this.oscDownAfterMs;
        return;
      }
      this.transitionTo('disconnected', `amcp probe failed: ${verdict.reason}`);
      this.resolveHealthyExit();
    } finally {
      this.probeInFlight = false;
    }
  }

  /** Whether a settled probe still describes the session that asked for it. */
  private probeApplies(probedQueue: CommandQueue): boolean {
    return (
      this.running &&
      !this.stopping &&
      this.currentState === 'degraded' &&
      this.currentQueue === probedQueue
    );
  }

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
