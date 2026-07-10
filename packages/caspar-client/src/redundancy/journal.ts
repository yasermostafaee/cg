/**
 * Command journal interface.
 *
 * Used by `RedundancyAdapter` strategies to:
 *   - Record every command that went to primary so a stale backup can be
 *     caught up on failover.
 *   - Support the Phase 5 §7.7 split-brain reconciliation (intent-side wins).
 *
 * The journal is intentionally an interface here. The production
 * implementation is WAL'd SQLite in `@cg/persistence` (Phase 5 §11 / §7.7).
 * The in-memory implementation in this file is what tests use and what
 * ships before the persistence package exists.
 *
 * Durability contract (B-046): full-history replay for a COLD backup —
 * `journal-replay` strategy's "rebuild on failover from everything since
 * boot" — requires a persistent implementation with its own retention
 * policy. The in-memory journal is memory-bounded and only guarantees the
 * recent tail (see `InMemoryJournal`).
 */

export type JournalOutcome = 'pending' | 'ok' | 'err' | 'timeout';

export interface JournalEntry {
  /** Monotonic per-journal sequence. */
  seq: number;
  /** Wall-clock ms when the command was enqueued. */
  at: number;
  /** AMCP line as sent (post-quote). */
  line: string;
  /** Intent target — informational for failover/reconciliation. */
  target: 'primary' | 'backup' | 'both';
  /** Resolved outcome on the primary path. */
  outcome: JournalOutcome;
  /** Optional response code (200/201/202/4xx/5xx). */
  code?: number;
}

export interface CommandJournal {
  /** Append a new entry; returns the assigned seq. */
  append(line: string, target: 'primary' | 'backup' | 'both'): number;
  /** Update an entry's outcome by seq. */
  resolve(seq: number, outcome: JournalOutcome, code?: number): void;
  /** All entries since `sinceSeq` (exclusive). */
  since(sinceSeq: number): readonly JournalEntry[];
  /** Every entry currently held. */
  all(): readonly JournalEntry[];
  /** Drop entries with `at` older than `beforeMs`. */
  prune(beforeMs: number): void;
  /** Highest seq seen so far. */
  readonly lastSeq: number;
}

/**
 * Minimal in-memory journal. Suitable for tests and for the initial
 * adapter runtime before `@cg/persistence` is wired in.
 *
 * B-046 — SELF-BOUNDING: every `append()` first drops RESOLVED entries older
 * than `retentionMs`, then evicts oldest entries over `maxEntries` (pending
 * entries survive the age pass but not the hard cap). Memory is bounded in
 * every configuration — healthy pair, dead backup, or single-server.
 *
 * Retention contract: the corrective resend targets a BRIEFLY-LAGGED LIVE
 * backup (a divergence burst inside the adapter's `divergenceWindowMs`, 30 s
 * default); `retentionMs` defaults to 10× that, so every entry a legitimate
 * resend needs is still held. Full-history rebuild of a long-cold backup is
 * explicitly NOT this journal's job — a process restart already loses it —
 * it belongs to a persistent `CommandJournal` implementation (Phase 5 §7.7's
 * WAL'd SQLite, 7-day rolling window).
 */
export class InMemoryJournal implements CommandJournal {
  private entries: JournalEntry[] = [];
  private nextSeq = 1;
  private readonly now: () => number;
  private readonly maxEntries: number;
  private readonly retentionMs: number;

  constructor(options: { now?: () => number; maxEntries?: number; retentionMs?: number } = {}) {
    this.now = options.now ?? (() => Date.now());
    this.maxEntries = options.maxEntries ?? 500;
    this.retentionMs = options.retentionMs ?? 300_000;
  }

  append(line: string, target: 'primary' | 'backup' | 'both'): number {
    const seq = this.nextSeq++;
    this.entries.push({ seq, at: this.now(), line, target, outcome: 'pending' });
    this.bound();
    return seq;
  }

  /** Enforce the retention age (resolved entries only), then the hard cap. */
  private bound(): void {
    const cutoff = this.now() - this.retentionMs;
    if (this.entries.some((e) => e.outcome !== 'pending' && e.at < cutoff)) {
      this.entries = this.entries.filter((e) => e.outcome === 'pending' || e.at >= cutoff);
    }
    if (this.entries.length > this.maxEntries) {
      this.entries.splice(0, this.entries.length - this.maxEntries);
    }
  }

  resolve(seq: number, outcome: JournalOutcome, code?: number): void {
    const entry = this.entries.find((e) => e.seq === seq);
    if (entry === undefined) return;
    entry.outcome = outcome;
    if (code !== undefined) entry.code = code;
  }

  since(sinceSeq: number): readonly JournalEntry[] {
    return this.entries.filter((e) => e.seq > sinceSeq);
  }

  all(): readonly JournalEntry[] {
    return [...this.entries];
  }

  prune(beforeMs: number): void {
    const cutoff = this.now() - beforeMs;
    this.entries = this.entries.filter((e) => e.at >= cutoff);
  }

  get lastSeq(): number {
    return this.nextSeq - 1;
  }
}
