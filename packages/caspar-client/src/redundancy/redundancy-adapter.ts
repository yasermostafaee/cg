import { EventEmitter } from 'node:events';
import type { ServerSession, ServerSessionState } from '../session/server-session.js';
import type { CommandQueue, QueueResult } from '../queue/command-queue.js';
import { InMemoryJournal, type CommandJournal } from './journal.js';
import type {
  FailoverEvent,
  FailoverReason,
  PairedSessions,
  RedundancySendResult,
  SendOptions,
  ServerLabel,
} from './types.js';

export type RedundancyStrategy = 'mirror-sync' | 'mirror-async' | 'journal-replay';

export interface RedundancyAdapterOptions {
  strategy: RedundancyStrategy;
  sessions: PairedSessions;
  /** Initial primary. Defaults to `'A'`. */
  initialPrimary?: ServerLabel;
  /** Plug a custom journal (e.g. SQLite-backed) — defaults to in-memory. */
  journal?: CommandJournal;
  /** Disable auto-failover (some stations prefer human-in-the-loop). */
  autoFailoverEnabled?: boolean;
  /** Trigger thresholds. Defaults match Phase 5 §7.5. */
  commandTimeoutBudget?: number; // 3
  fiveXxWindowMs?: number; // 30_000
  fiveXxBudget?: number; // 5
  /**
   * M9.1 corrective-resend tuning. When the backup ack-code diverges
   * from the primary more than `divergenceBudget` times within
   * `divergenceWindowMs`, the adapter replays the last accepted
   * commands from the journal to the backup queue.
   */
  divergenceWindowMs?: number; // 30_000
  divergenceBudget?: number; // 3
  /** Disable corrective resend (e.g. when debugging the divergence cause). */
  correctiveResendEnabled?: boolean; // true
  /** Override for tests. */
  now?: () => number;
}

export interface RedundancyAdapterEvents {
  'failover-requested': [event: FailoverEvent];
  'failover-complete': [event: FailoverEvent];
  'mirror-divergence': [info: { seq: number; primaryCode: number; backupCode: number }];
  'split-brain': [info: { primary: ServerLabel; backup: ServerLabel; slots: number }];
  /**
   * M9.1: emitted when divergence crosses the configured budget within
   * the window. The corrective resend (if enabled) fires immediately
   * after — `corrective-resend` follows for each replayed entry.
   */
  'split-brain-persistent': [
    info: { primary: ServerLabel; backup: ServerLabel; divergencesInWindow: number },
  ];
  /** M9.1: emitted for each journal entry replayed to the backup. */
  'corrective-resend': [info: { seq: number; line: string; target: ServerLabel }];
  /** Re-emits aggregated health derived from both sessions. */
  health: [info: { primary: HealthSnapshot; backup: HealthSnapshot }];
  error: [err: Error];
}

export interface HealthSnapshot {
  label: ServerLabel;
  state: ServerSessionState;
}

/**
 * RedundancyAdapter — wraps two ServerSessions and presents a single
 * `send()` interface to higher layers. Implements all three Phase 5 §7
 * strategies. Auto-failover triggers off the OSC + ping + timeout +
 * 5xx-burst signals from the underlying sessions.
 *
 * `failover()` is also exposed for manual operator-driven swaps.
 *
 * Note: Split-brain *detection* lives here; *reconciliation* (issuing
 * corrective CLEAR / PLAY / CG_PLAY per §7.7) lands with the Reconciler
 * in M4.7. This PR emits `'split-brain'` with the offending slot count
 * but doesn't yet issue correctives.
 */
export class RedundancyAdapter extends EventEmitter<RedundancyAdapterEvents> {
  readonly strategy: RedundancyStrategy;
  readonly sessions: PairedSessions;
  readonly journal: CommandJournal;
  private primary: ServerLabel;
  private readonly autoFailoverEnabled: boolean;
  private readonly commandTimeoutBudget: number;
  private readonly fiveXxWindowMs: number;
  private readonly fiveXxBudget: number;
  private readonly divergenceWindowMs: number;
  private readonly divergenceBudget: number;
  private readonly correctiveResendEnabled: boolean;
  private readonly now: () => number;

  private consecutiveTimeouts = 0;
  private fiveXxTimestamps: number[] = [];
  private divergenceTimestamps: number[] = [];
  private correctiveResendInFlight = false;
  private failoverInProgress = false;

  constructor(options: RedundancyAdapterOptions) {
    super();
    this.strategy = options.strategy;
    this.sessions = options.sessions;
    this.primary = options.initialPrimary ?? 'A';
    this.journal = options.journal ?? new InMemoryJournal();
    this.autoFailoverEnabled = options.autoFailoverEnabled ?? true;
    this.commandTimeoutBudget = options.commandTimeoutBudget ?? 3;
    this.fiveXxWindowMs = options.fiveXxWindowMs ?? 30_000;
    this.fiveXxBudget = options.fiveXxBudget ?? 5;
    this.divergenceWindowMs = options.divergenceWindowMs ?? 30_000;
    this.divergenceBudget = options.divergenceBudget ?? 3;
    this.correctiveResendEnabled = options.correctiveResendEnabled ?? true;
    this.now = options.now ?? (() => Date.now());

    this.wireSessionEvents();
    this.on('error', noop);
  }

  /** Which session is currently the live primary. */
  get currentPrimary(): ServerLabel {
    return this.primary;
  }

  /** Convenience: the ServerSession instance that's currently primary. */
  get primarySession(): ServerSession {
    return this.sessions[this.primary];
  }

  /** Convenience: the ServerSession instance that's currently backup. */
  get backupSession(): ServerSession {
    return this.sessions[this.primary === 'A' ? 'B' : 'A'];
  }

  /**
   * Unified send. Behavior depends on the configured strategy:
   *
   *   mirror-sync    : fan out to both; await both; primary ack wins
   *   mirror-async   : send to primary; await; backup fire-and-forget; journal
   *   journal-replay : send to primary only; journal
   */
  async send(line: string, options: SendOptions = {}): Promise<RedundancySendResult> {
    if (this.strategy === 'journal-replay') {
      return this.sendJournalReplay(line, options);
    }
    if (this.strategy === 'mirror-async') {
      return this.sendMirrorAsync(line, options);
    }
    return this.sendMirrorSync(line, options);
  }

  /**
   * Trigger a failover. Manual reason flips primary/backup immediately.
   * Auto reasons go through the same path; the adapter de-dupes if one is
   * already in progress.
   */
  async failover(reason: FailoverReason): Promise<void> {
    if (this.failoverInProgress) return;
    if (reason !== 'manual' && !this.autoFailoverEnabled) return;
    this.failoverInProgress = true;
    const from = this.primary;
    const to: ServerLabel = from === 'A' ? 'B' : 'A';
    const event: FailoverEvent = { reason, from, to, at: this.now() };
    this.emit('failover-requested', event);
    try {
      // Strategy-specific catch-up before swapping primary.
      if (this.strategy === 'journal-replay') {
        await this.replayJournalTo(this.sessions[to].queue);
      } else if (this.strategy === 'mirror-async') {
        // Backup may be lagging — drain the journal tail to it.
        await this.replayJournalTo(this.sessions[to].queue);
      }
      this.primary = to;
      this.resetFailoverCounters();
      this.emit('failover-complete', { ...event, at: this.now() });
    } finally {
      this.failoverInProgress = false;
    }
  }

  /**
   * Compare what the two sessions believe is on-air. The Reconciler
   * supplies this in production; for now, the adapter exposes the
   * primitive so M4.7 can call it.
   *
   * Returns the number of (channel, layer) slots where the two sessions
   * disagree. Emits `'split-brain'` if non-zero.
   */
  detectSplitBrain(
    primaryView: ReadonlyMap<string, string>,
    backupView: ReadonlyMap<string, string>,
  ): number {
    const keys = new Set([...primaryView.keys(), ...backupView.keys()]);
    let diff = 0;
    for (const k of keys) {
      const a = primaryView.get(k);
      const b = backupView.get(k);
      if (a !== b) diff++;
    }
    if (diff > 0) {
      this.emit('split-brain', {
        primary: this.primary,
        backup: this.primary === 'A' ? 'B' : 'A',
        slots: diff,
      });
    }
    return diff;
  }

  // ──────────────────────────────────────────────────────────────────────
  // Strategy implementations
  // ──────────────────────────────────────────────────────────────────────

  private async sendMirrorSync(line: string, options: SendOptions): Promise<RedundancySendResult> {
    const seq = this.journal.append(line, 'both');
    const primaryQ = this.primarySession.queue;
    const backupQ = this.backupSession.queue;
    const [pRes, bRes] = await Promise.allSettled([
      primaryQ.enqueue(line, options),
      backupQ.enqueue(line, options),
    ]);
    if (pRes.status === 'fulfilled' && bRes.status === 'fulfilled') {
      this.journal.resolve(seq, 'ok', pRes.value.response.code);
      if (pRes.value.response.code !== bRes.value.response.code) {
        this.reportDivergence(seq, pRes.value.response.code, bRes.value.response.code);
      }
      this.recordPrimaryResult(pRes.value);
      return { ...pRes.value, winner: this.primary };
    }
    if (pRes.status === 'fulfilled') {
      this.journal.resolve(seq, 'ok', pRes.value.response.code);
      this.recordPrimaryResult(pRes.value);
      // Backup failed — log + degrade backup health. Don't auto-failover
      // just because the backup is gone; primary is still serving.
      this.reportDivergence(seq, pRes.value.response.code, -1);
      return { ...pRes.value, winner: this.primary };
    }
    if (bRes.status === 'fulfilled') {
      this.journal.resolve(seq, 'err');
      this.recordPrimaryFailure();
      return { ...bRes.value, winner: this.primary === 'A' ? 'B' : 'A' };
    }
    this.journal.resolve(seq, 'err');
    this.recordPrimaryFailure();
    throw pRes.reason as Error;
  }

  private async sendMirrorAsync(line: string, options: SendOptions): Promise<RedundancySendResult> {
    const seq = this.journal.append(line, 'both');
    const primaryQ = this.primarySession.queue;
    const backupQ = this.backupSession.queue;
    try {
      const result = await primaryQ.enqueue(line, options);
      this.journal.resolve(seq, 'ok', result.response.code);
      this.recordPrimaryResult(result);
      // Backup runs in parallel — divergence detection is best-effort.
      backupQ.enqueue(line, options).then(
        (bRes) => {
          if (bRes.response.code !== result.response.code) {
            this.reportDivergence(seq, result.response.code, bRes.response.code);
          }
        },
        () => {
          this.reportDivergence(seq, result.response.code, -1);
        },
      );
      return { ...result, winner: this.primary };
    } catch (err) {
      this.journal.resolve(seq, 'err');
      this.recordPrimaryFailure();
      throw err instanceof Error ? err : new Error(String(err));
    }
  }

  private async sendJournalReplay(
    line: string,
    options: SendOptions,
  ): Promise<RedundancySendResult> {
    const seq = this.journal.append(line, 'primary');
    try {
      const result = await this.primarySession.queue.enqueue(line, options);
      this.journal.resolve(seq, 'ok', result.response.code);
      this.recordPrimaryResult(result);
      return { ...result, winner: this.primary };
    } catch (err) {
      this.journal.resolve(seq, 'err');
      this.recordPrimaryFailure();
      throw err instanceof Error ? err : new Error(String(err));
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  // Failover trigger logic
  // ──────────────────────────────────────────────────────────────────────

  private recordPrimaryResult(result: QueueResult): void {
    this.consecutiveTimeouts = 0;
    if (result.response.kind === 'err' && result.response.code >= 500) {
      this.record5xx();
    }
  }

  private recordPrimaryFailure(): void {
    this.consecutiveTimeouts++;
    if (this.consecutiveTimeouts >= this.commandTimeoutBudget) {
      void this.maybeFailover('command-timeouts');
    }
  }

  private record5xx(): void {
    const now = this.now();
    this.fiveXxTimestamps.push(now);
    const cutoff = now - this.fiveXxWindowMs;
    this.fiveXxTimestamps = this.fiveXxTimestamps.filter((t) => t > cutoff);
    if (this.fiveXxTimestamps.length > this.fiveXxBudget) {
      void this.maybeFailover('5xx-burst');
    }
  }

  private resetFailoverCounters(): void {
    this.consecutiveTimeouts = 0;
    this.fiveXxTimestamps = [];
    this.divergenceTimestamps = [];
  }

  /**
   * Record + emit a single divergence. If the cumulative count inside
   * `divergenceWindowMs` crosses `divergenceBudget`, escalate to
   * 'split-brain-persistent' and trigger a corrective resend (if enabled).
   */
  private reportDivergence(seq: number, primaryCode: number, backupCode: number): void {
    this.emit('mirror-divergence', { seq, primaryCode, backupCode });
    const now = this.now();
    this.divergenceTimestamps.push(now);
    const cutoff = now - this.divergenceWindowMs;
    this.divergenceTimestamps = this.divergenceTimestamps.filter((t) => t > cutoff);
    if (this.divergenceTimestamps.length >= this.divergenceBudget) {
      const backupLabel: ServerLabel = this.primary === 'A' ? 'B' : 'A';
      this.emit('split-brain-persistent', {
        primary: this.primary,
        backup: backupLabel,
        divergencesInWindow: this.divergenceTimestamps.length,
      });
      // Reset the window so we don't fire on every subsequent ack — the
      // resend itself either converges the two sides or surfaces a new
      // burst of divergences.
      this.divergenceTimestamps = [];
      if (this.correctiveResendEnabled) {
        void this.triggerCorrectiveResend(backupLabel);
      }
    }
  }

  /**
   * Replay the journal's recently-accepted commands to the backup
   * queue. M9.1's first cut: replay every 'ok'-resolved entry. M10
   * narrows this to the slot the divergence touched once the
   * Reconciler exposes which slot diverged.
   */
  private async triggerCorrectiveResend(target: ServerLabel): Promise<void> {
    if (this.correctiveResendInFlight) return;
    this.correctiveResendInFlight = true;
    try {
      const queue = this.sessions[target].queue;
      const entries = this.journal.all().filter((e) => e.outcome === 'ok');
      for (const entry of entries) {
        this.emit('corrective-resend', { seq: entry.seq, line: entry.line, target });
        try {
          await queue.enqueue(entry.line, { priority: 'urgent' });
        } catch {
          // Replay best-effort. The next divergence burst will fire again.
        }
      }
    } finally {
      this.correctiveResendInFlight = false;
    }
  }

  private async maybeFailover(reason: FailoverReason): Promise<void> {
    if (!this.autoFailoverEnabled) return;
    await this.failover(reason);
  }

  // ──────────────────────────────────────────────────────────────────────
  // Session wiring
  // ──────────────────────────────────────────────────────────────────────

  private wireSessionEvents(): void {
    const onPrimaryStateChange = (info: {
      from: ServerSessionState;
      to: ServerSessionState;
    }): void => {
      if (info.to === 'disconnected' || info.to === 'degraded') {
        // OSC silence + AMCP TCP loss surface as session state.
        // Either is grounds for auto-failover.
        const reason: FailoverReason = info.to === 'degraded' ? 'osc-silence' : 'amcp-ping-fail';
        void this.maybeFailover(reason);
      }
      this.emitHealth();
    };
    this.sessions[this.primary].on('state-change', onPrimaryStateChange);
    // The "current primary" can change after failover. We re-bind in
    // failover-complete; for the initial primary the listener above
    // suffices. The backup's state changes are interesting too but the
    // adapter doesn't act on them directly — the health event is what
    // surfaces them.
    this.sessions.A.on('state-change', () => this.emitHealth());
    this.sessions.B.on('state-change', () => this.emitHealth());
  }

  private emitHealth(): void {
    this.emit('health', {
      primary: { label: this.primary, state: this.primarySession.state },
      backup: {
        label: this.primary === 'A' ? 'B' : 'A',
        state: this.backupSession.state,
      },
    });
  }

  private async replayJournalTo(queue: CommandQueue): Promise<void> {
    const entries = this.journal.all().filter((e) => e.outcome === 'ok');
    for (const entry of entries) {
      try {
        await queue.enqueue(entry.line, { priority: 'urgent' });
      } catch {
        // Replay best-effort; the Reconciler resolves the rest.
      }
    }
  }
}

function noop(): void {
  /* baseline error listener */
}
