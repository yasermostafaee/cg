import type { ServerSession } from '../session/server-session.js';
import type { EnqueueOptions, QueueResult } from '../queue/command-queue.js';

/** Logical identifier for one of the two paired sessions. */
export type ServerLabel = 'A' | 'B';

/**
 * Where a `send()` goes is the STRATEGY's decision alone (`RedundancyAdapter.send`):
 *
 *   mirror-sync     : fans out to both, awaits both, the primary's ack wins
 *   mirror-async    : awaits the primary, the backup fire-and-forget, journals
 *   journal-replay  : the primary only, journals
 *
 * `B-287` / `FOLLOWUPS-01` C — there used to be a `target` override here, documented as choosing
 * among `'primary'`, `'backup'` and `'both'`, which the adapter never read: a caller passing
 * `target: 'primary'` under `mirror-sync` still reached server B. It is DELETED (the owner,
 * 2026-09-28). The one exception a caller may ask for is `mirror: false`, which IS read.
 */
export interface SendOptions extends EnqueueOptions {
  /**
   * 🔴 `ROUTE-PLATES-01` / contract v1.3 C4 — `false`: this line reaches the PRIMARY ONLY, under
   * every strategy, and is NEVER journaled — so neither a failover replay nor a corrective resend can
   * ever carry it to the backup. For a Playout route (`route://H-L`): one server's holder map is
   * never valid on another, and the backup carries the graphic without that plate.
   */
  mirror?: false;
  /**
   * 🔴 `PLAYOUT-FEATURES-01` A (`B-286`) — **THE LINE SERVER B GETS INSTEAD OF `line`**: a media `PLAY`
   * carrying the clip BACKUP'S OWN Playout lists for the same content, since the two installs keep their
   * files at different paths. `null`: server B is sent nothing for it — it has no copy — and nothing is
   * journaled for B. Absent: B gets `line`, as always.
   *
   * ⚠ Keyed to SERVER B, never to the backup ROLE: after a failover B is the primary, and it must still
   * get its own path. Every path that reaches a server — the live fan-out, a failover catch-up, a
   * corrective resend — sends that server's own line, read from the journal where both are kept.
   */
  serverB?: string | null;
}

export interface PairedSessions {
  readonly A: ServerSession;
  /**
   * B-046 — OPTIONAL: absent under a declared single-server config. With no
   * backup the adapter sends primary-only, refuses failover, and never
   * engages the divergence/split-brain/replay machinery.
   */
  readonly B?: ServerSession;
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
