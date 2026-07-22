import type { CommandQueue } from '../queue/command-queue.js';
import { AmcpTimeoutError } from '../queue/errors.js';

/** The verdict of one AMCP liveness probe. */
export type AmcpProbeVerdict = { ok: true; roundtripMs: number } | { ok: false; reason: string };

/**
 * THE AMCP liveness probe — the one place that answers "did the command axis
 * answer?".
 *
 * B-101: liveness on an axis is measured BY that axis. A monitoring channel's
 * silence says nothing about whether commands still land, so the only honest
 * test of the AMCP link is to send an AMCP command and see. `VERSION` is the
 * cheapest one that proves a live command path end-to-end — the peer parsed a
 * line and answered it. It goes at `urgent` priority (the air-safety class, per
 * Phase 5 §5.2) so a long `INFO` cannot starve the verdict, under a bounded
 * timeout so a HALF-OPEN link — TCP open, peer mute — resolves as a failure
 * instead of hanging forever. A non-OK response code counts as a failure for the
 * same reason the handshake rejects one: a peer that answers `VERSION` with an
 * error is not serving commands.
 *
 * Both callers share this so there is exactly ONE definition of an answering
 * AMCP link — `ServerSession`'s degraded-window probe and `HeartbeatService`'s
 * ping. A second local copy is how a liveness test comes to mean something other
 * than its name (see B-100, and the golden rule it produced).
 */
export async function probeAmcpLiveness(
  queue: CommandQueue,
  timeoutMs: number,
  now: () => number = () => Date.now(),
): Promise<AmcpProbeVerdict> {
  const startedAt = now();
  try {
    const result = await queue.enqueue('VERSION', { priority: 'urgent', timeoutMs });
    if (result.response.kind === 'err') {
      return { ok: false, reason: `code=${String(result.response.code)}` };
    }
    return { ok: true, roundtripMs: now() - startedAt };
  } catch (err) {
    if (err instanceof AmcpTimeoutError) return { ok: false, reason: 'timeout' };
    return { ok: false, reason: err instanceof Error ? err.message : 'unknown' };
  }
}
