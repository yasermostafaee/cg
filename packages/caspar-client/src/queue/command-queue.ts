import { EventEmitter } from 'node:events';
import type { AmcpTransport, ParsedAmcpResponse } from '../amcp/transport.js';
import { AmcpAbortedError, AmcpDisconnectedError, AmcpTimeoutError } from './errors.js';

/**
 * Priority levels per Phase 5 §5.2.
 *
 *   urgent  — air-safety: `CLEAR`, `CG STOP`, `CG REMOVE`, heartbeat
 *             `VERSION`. Inserted at the head, ahead of normal/low.
 *   normal  — `PLAY`, `CG ADD`, `CG INVOKE`, `LOAD`. FIFO.
 *   low     — `INFO` (non-heartbeat), telemetry. Yields to anything else.
 */
export type Priority = 'urgent' | 'normal' | 'low';

export interface EnqueueOptions {
  priority?: Priority;
  /** Default 2000 ms. Per-command overrides per Phase 5 §5.4 are the caller's job. */
  timeoutMs?: number;
  /**
   * How many retry attempts on timeout. Default 0 (no retry). The retry
   * fires with a fresh timer and a fresh seq number — the original entry
   * becomes a "ghost" that's silently discarded when its response arrives.
   */
  retries?: number;
  /** Optional cancellation. Aborting after send rejects but keeps the in-flight slot. */
  signal?: AbortSignal;
}

/** What `enqueue()` resolves to on success. */
export interface QueueResult {
  /** Monotonic sequence (per-queue), useful for journals. */
  seq: number;
  /** The original AMCP line as sent (post-quote). */
  line: string;
  /** Parsed response — for INFO/VERSION etc. that carry data. */
  response: ParsedAmcpResponse;
  /** Wall-clock ms from enqueue to response. */
  ms: number;
}

export interface CommandQueueOptions {
  /** Max in-flight commands. Phase 5 §5.3 says 4. Set to 1 during RESYNCING. */
  pipelineDepth?: number;
  /** Default timeoutMs when enqueue() doesn't specify. */
  defaultTimeoutMs?: number;
  /** Queue depth threshold for `'backpressure'` event. Phase 5 §5.5: 50. */
  backpressureThreshold?: number;
  /** Queue depth threshold for `'failover-suggested'` event. Phase 5 §5.5: 200. */
  failoverSuggestedThreshold?: number;
  /** Override for testing — defaults to `Date.now`. */
  now?: () => number;
}

interface Entry {
  seq: number;
  line: string;
  priority: Priority;
  enqueuedAt: number;
  startedAt: number | null;
  timeoutMs: number;
  retriesLeft: number;
  signal?: AbortSignal;
  signalListener?: () => void;
  resolve: (result: QueueResult) => void;
  reject: (err: Error) => void;
  /** Ghost flag — entry already settled but still occupies an in-flight slot. */
  settled: boolean;
  timer: NodeJS.Timeout | null;
}

export interface CommandQueueEvents {
  backpressure: [meta: { depth: number }];
  'failover-suggested': [meta: { depth: number }];
  error: [err: Error];
}

/**
 * Priority-ordered, pipelined command queue per Phase 5 §5.
 *
 * Sits above an `AmcpTransport`. Listens for `'response'` events and pairs
 * them with the in-flight head (responses arrive in-order per AMCP TCP
 * framing). Handles timeouts, retries, AbortSignal, backpressure events.
 *
 * On transport disconnect every pending + in-flight command is rejected
 * with `AmcpDisconnectedError`. The queue is then ready for fresh enqueues
 * once the transport reconnects — the FSM (M4.4) is responsible for
 * re-issuing intents via the journal, not the queue itself.
 */
export class CommandQueue extends EventEmitter<CommandQueueEvents> {
  private readonly transport: AmcpTransport;
  private readonly pipelineDepth: number;
  private readonly defaultTimeoutMs: number;
  private readonly backpressureThreshold: number;
  private readonly failoverSuggestedThreshold: number;
  private readonly now: () => number;

  /** Commands waiting for an in-flight slot, in priority + arrival order. */
  private readonly waiting: Entry[] = [];
  /** Commands sent to the transport, awaiting a response, in send order. */
  private readonly inFlight: Entry[] = [];
  private nextSeq = 1;
  private paused = false;
  /** Sticky backpressure flag so we don't spam the event on every enqueue. */
  private backpressureActive = false;

  constructor(transport: AmcpTransport, options: CommandQueueOptions = {}) {
    super();
    this.transport = transport;
    this.pipelineDepth = options.pipelineDepth ?? 4;
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 2000;
    this.backpressureThreshold = options.backpressureThreshold ?? 50;
    this.failoverSuggestedThreshold = options.failoverSuggestedThreshold ?? 200;
    this.now = options.now ?? (() => Date.now());

    transport.on('response', this.onResponse);
    transport.on('close', this.onClose);
    this.on('error', noop);
  }

  /** Number of waiting + in-flight commands. */
  get depth(): number {
    return this.waiting.length + this.inFlight.length;
  }

  get inFlightCount(): number {
    return this.inFlight.length;
  }

  get waitingCount(): number {
    return this.waiting.length;
  }

  get isPaused(): boolean {
    return this.paused;
  }

  /**
   * Send a command (eventually). Resolves with the parsed response,
   * rejects on timeout / abort / disconnect.
   *
   * The caller is responsible for quoting (`quote()` from `../amcp/escape`).
   * `line` is written verbatim followed by `\r\n`.
   */
  async enqueue(line: string, options: EnqueueOptions = {}): Promise<QueueResult> {
    const priority = options.priority ?? 'normal';
    const timeoutMs = options.timeoutMs ?? this.defaultTimeoutMs;
    const retries = options.retries ?? 0;

    return new Promise<QueueResult>((resolve, reject) => {
      const seq = this.nextSeq++;
      const entry: Entry = {
        seq,
        line,
        priority,
        enqueuedAt: this.now(),
        startedAt: null,
        timeoutMs,
        retriesLeft: retries,
        resolve,
        reject,
        settled: false,
        timer: null,
      };
      if (options.signal !== undefined) {
        entry.signal = options.signal;
        if (options.signal.aborted) {
          this.settle(entry, new AmcpAbortedError(seq, line, options.signal.reason));
          return;
        }
        entry.signalListener = () => {
          if (entry.settled) return;
          this.settle(entry, new AmcpAbortedError(seq, line, entry.signal?.reason));
          // If the entry is still in waiting, drop it. In-flight entries
          // stay (ghost) since AMCP will still respond.
          const wIdx = this.waiting.indexOf(entry);
          if (wIdx !== -1) this.waiting.splice(wIdx, 1);
        };
        options.signal.addEventListener('abort', entry.signalListener);
      }

      this.insertSorted(entry);
      this.checkBackpressure();
      this.pump();
    });
  }

  /** Stop sending NEW commands until `resume()`. In-flight continue. Phase 5 §5.3 RESYNCING. */
  pause(): void {
    this.paused = true;
  }

  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.pump();
  }

  /** Detach from the transport and reject every pending + in-flight command. */
  dispose(): void {
    this.transport.off('response', this.onResponse);
    this.transport.off('close', this.onClose);
    this.failAll((e) => new AmcpDisconnectedError(e.seq, e.line));
  }

  private insertSorted(entry: Entry): void {
    // Urgent jumps to the head among the same-or-lower priority entries
    // already waiting; normal goes after all urgents/normals (FIFO); low
    // goes at the tail.
    if (entry.priority === 'urgent') {
      // Insert after the last urgent already in waiting.
      let i = 0;
      while (i < this.waiting.length && this.waiting[i]?.priority === 'urgent') i++;
      this.waiting.splice(i, 0, entry);
      return;
    }
    if (entry.priority === 'normal') {
      // Insert after urgents and normals, before lows.
      let i = 0;
      while (
        i < this.waiting.length &&
        (this.waiting[i]?.priority === 'urgent' || this.waiting[i]?.priority === 'normal')
      ) {
        i++;
      }
      this.waiting.splice(i, 0, entry);
      return;
    }
    // low — tail
    this.waiting.push(entry);
  }

  private pump(): void {
    if (this.paused) return;
    const effectiveDepth = this.paused ? 1 : this.pipelineDepth;
    while (this.inFlight.length < effectiveDepth && this.waiting.length > 0) {
      const entry = this.waiting.shift();
      if (!entry || entry.settled) continue;
      this.inFlight.push(entry);
      entry.startedAt = this.now();
      entry.timer = setTimeout(() => {
        this.onTimeout(entry);
      }, entry.timeoutMs);
      entry.timer.unref?.();
      // Send asynchronously, but in send order. If send rejects, treat as
      // an immediate disconnect.
      this.transport.send(entry.line).catch((err: unknown) => {
        if (entry.settled) return;
        this.settle(
          entry,
          err instanceof Error ? err : new AmcpDisconnectedError(entry.seq, entry.line),
        );
        const idx = this.inFlight.indexOf(entry);
        if (idx !== -1) this.inFlight.splice(idx, 1);
        this.pump();
      });
    }
  }

  private onResponse = (response: ParsedAmcpResponse): void => {
    // AMCP guarantees in-order responses, so each response belongs to the
    // current head of in-flight — regardless of whether that head has
    // been timed out / aborted.
    const head = this.inFlight.shift();
    if (head === undefined) {
      // Spurious response. Drop.
      return;
    }
    if (!head.settled) {
      const ms = this.now() - (head.startedAt ?? head.enqueuedAt);
      const result: QueueResult = { seq: head.seq, line: head.line, response, ms };
      this.settle(head, result);
    }
    this.pump();
  };

  private onClose = (): void => {
    this.failAll((e) => new AmcpDisconnectedError(e.seq, e.line));
  };

  private onTimeout(entry: Entry): void {
    if (entry.settled) return;
    if (entry.retriesLeft > 0) {
      entry.retriesLeft--;
      // Mark the old entry as a ghost — its response (if it arrives) will
      // be silently discarded. Re-enqueue a fresh copy with a new seq.
      entry.settled = true;
      const idx = this.inFlight.indexOf(entry);
      if (idx !== -1) this.inFlight.splice(idx, 1);
      void this.enqueue(entry.line, {
        priority: entry.priority,
        timeoutMs: entry.timeoutMs,
        retries: entry.retriesLeft,
      }).then(entry.resolve, entry.reject);
      // Note: signal isn't re-bound for the retry — once aborted, the
      // wrapping promise is settled, no further retries will fire.
      return;
    }
    this.settle(entry, new AmcpTimeoutError(entry.seq, entry.timeoutMs, entry.line));
    // Leave the entry in in-flight as a ghost so the eventual response
    // gets consumed by `onResponse` without resolving a different entry.
  }

  private settle(entry: Entry, value: QueueResult | Error): void {
    if (entry.settled) return;
    entry.settled = true;
    if (entry.timer !== null) {
      clearTimeout(entry.timer);
      entry.timer = null;
    }
    if (entry.signal !== undefined && entry.signalListener !== undefined) {
      entry.signal.removeEventListener('abort', entry.signalListener);
    }
    if (value instanceof Error) {
      entry.reject(value);
    } else {
      entry.resolve(value);
    }
    this.checkBackpressureRelief();
  }

  private failAll(errFor: (entry: Entry) => Error): void {
    for (const e of this.waiting) {
      this.settle(e, errFor(e));
    }
    this.waiting.length = 0;
    for (const e of this.inFlight) {
      this.settle(e, errFor(e));
    }
    this.inFlight.length = 0;
  }

  private checkBackpressure(): void {
    const depth = this.depth;
    if (!this.backpressureActive && depth >= this.backpressureThreshold) {
      this.backpressureActive = true;
      this.emit('backpressure', { depth });
    }
    if (depth >= this.failoverSuggestedThreshold) {
      this.emit('failover-suggested', { depth });
    }
  }

  private checkBackpressureRelief(): void {
    if (this.backpressureActive && this.depth < this.backpressureThreshold) {
      this.backpressureActive = false;
    }
  }
}

function noop(): void {
  /* baseline error listener */
}
