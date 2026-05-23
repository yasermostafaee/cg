import type { ServerSession } from '../session/server-session.js';
import type { EnqueueOptions, QueueResult } from '../queue/command-queue.js';

/** Logical identifier for one of the two paired sessions. */
export type ServerLabel = 'A' | 'B';

/**
 * `send()` targeting model. Strategies interpret this differently:
 *
 *   mirror-sync     : 'both' fans out and awaits both
 *   mirror-async    : 'both' fans out, awaits primary, journals
 *   journal-replay  : 'primary' only; 'both' is treated as 'primary' too
 */
export type SendTarget = 'primary' | 'backup' | 'both';

export interface SendOptions extends EnqueueOptions {
  /** Override target (default `'both'` for mirror strategies, `'primary'` for journal-replay). */
  target?: SendTarget;
}

export interface PairedSessions {
  readonly A: ServerSession;
  readonly B: ServerSession;
}

/** Reasons the adapter can trigger an automatic failover (Phase 5 §7.5). */
export type FailoverReason =
  | 'manual'
  | 'osc-silence'
  | 'amcp-ping-fail'
  | 'command-timeouts'
  | '5xx-burst';

export interface FailoverEvent {
  reason: FailoverReason;
  from: ServerLabel;
  to: ServerLabel;
  at: number;
}

/**
 * The unified result of a redundancy-aware send. The `winner` field
 * identifies which session's ack the caller is seeing — equal to the
 * current primary for mirror-sync and mirror-async; always primary
 * for journal-replay.
 */
export interface RedundancySendResult extends QueueResult {
  winner: ServerLabel;
}
