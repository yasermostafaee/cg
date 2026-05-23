import { EventEmitter } from 'node:events';
import type { CommandQueue } from '../queue/command-queue.js';
import { AmcpTimeoutError } from '../queue/errors.js';

/**
 * Heartbeat service per Phase 5 §9. Issues `VERSION` at urgent priority
 * every `intervalMs` (default 2000) and tracks miss budget. Three
 * consecutive misses (~6s by default) downgrades the AMCP axis to fail;
 * any success resets the counter.
 *
 * Combined with OSC freshness (tracked by `ServerSession`), this gives
 * the two-axis health table from §9:
 *
 *   | AMCP ping ok   | OSC fresh                       → HEALTHY
 *   | AMCP ping ok   | OSC stale                       → DEGRADED (feedback)
 *   | AMCP ping fail | OSC fresh                       → DEGRADED (cmd channel)
 *   | AMCP ping fail | OSC stale                       → DOWN (failover candidate)
 *
 * The service itself emits the AMCP axis ('ping-ok' / 'ping-miss-budget-
 * exceeded'); deriving the combined health is the caller's job.
 */
export interface HeartbeatOptions {
  /** Ping interval. Phase 5 §9 default: 2000 ms. */
  intervalMs?: number;
  /** Per-ping timeout. Phase 5 §5.4 default: 1000 ms. */
  timeoutMs?: number;
  /** Misses to tolerate before signaling the AMCP axis as failed. Default 3. */
  missBudget?: number;
  /** Override for tests. */
  now?: () => number;
}

export interface HeartbeatEvents {
  /** Fired on every successful VERSION round-trip. */
  'ping-ok': [info: { roundtripMs: number; consecutiveOks: number }];
  /** Fired on every miss (timeout or non-OK response). */
  'ping-miss': [info: { consecutiveMisses: number; reason: string }];
  /** Fired exactly once when the miss counter crosses `missBudget`. Reset to OK clears it. */
  'amcp-axis-failed': [];
  /** Fired when the AMCP axis recovers after `amcp-axis-failed` was emitted. */
  'amcp-axis-recovered': [];
  error: [err: Error];
}

export class HeartbeatService extends EventEmitter<HeartbeatEvents> {
  private readonly queue: CommandQueue;
  private readonly intervalMs: number;
  private readonly timeoutMs: number;
  private readonly missBudget: number;
  private readonly now: () => number;

  private timer: NodeJS.Timeout | null = null;
  private consecutiveMisses = 0;
  private consecutiveOks = 0;
  private axisFailed = false;
  private inFlight = false;
  private running = false;

  constructor(queue: CommandQueue, options: HeartbeatOptions = {}) {
    super();
    this.queue = queue;
    this.intervalMs = options.intervalMs ?? 2000;
    this.timeoutMs = options.timeoutMs ?? 1000;
    this.missBudget = options.missBudget ?? 3;
    this.now = options.now ?? (() => Date.now());
    this.on('error', noop);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    // Issue the first ping immediately so consumers can derive health on
    // session-start without waiting a full interval.
    void this.tick();
    this.timer = setInterval(() => {
      void this.tick();
    }, this.intervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.running = false;
  }

  /** Diagnostic snapshot for telemetry / UI. */
  get status(): HeartbeatStatus {
    return {
      running: this.running,
      consecutiveMisses: this.consecutiveMisses,
      consecutiveOks: this.consecutiveOks,
      axisFailed: this.axisFailed,
    };
  }

  private async tick(): Promise<void> {
    if (this.inFlight) {
      // Don't overlap pings. If the previous one is still pending, skip.
      return;
    }
    this.inFlight = true;
    const startedAt = this.now();
    try {
      const result = await this.queue.enqueue('VERSION', {
        priority: 'urgent',
        timeoutMs: this.timeoutMs,
      });
      if (result.response.kind === 'err') {
        this.recordMiss(`code=${String(result.response.code)}`);
        return;
      }
      this.recordOk(this.now() - startedAt);
    } catch (err) {
      if (err instanceof AmcpTimeoutError) {
        this.recordMiss('timeout');
      } else {
        this.recordMiss(err instanceof Error ? err.message : 'unknown');
      }
    } finally {
      this.inFlight = false;
    }
  }

  private recordOk(roundtripMs: number): void {
    this.consecutiveMisses = 0;
    this.consecutiveOks++;
    this.emit('ping-ok', { roundtripMs, consecutiveOks: this.consecutiveOks });
    if (this.axisFailed) {
      this.axisFailed = false;
      this.emit('amcp-axis-recovered');
    }
  }

  private recordMiss(reason: string): void {
    this.consecutiveOks = 0;
    this.consecutiveMisses++;
    this.emit('ping-miss', { consecutiveMisses: this.consecutiveMisses, reason });
    if (!this.axisFailed && this.consecutiveMisses >= this.missBudget) {
      this.axisFailed = true;
      this.emit('amcp-axis-failed');
    }
  }
}

export interface HeartbeatStatus {
  running: boolean;
  consecutiveMisses: number;
  consecutiveOks: number;
  axisFailed: boolean;
}

function noop(): void {
  /* baseline error listener */
}
