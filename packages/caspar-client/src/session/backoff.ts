/**
 * Reconnect backoff per Phase 5 §2.
 *
 * Sequence: 250 → 500 → 1000 → 2000 → 4000 → cap 4000 (ms). Each successful
 * `HEALTHY` resets the clock; each failure advances one step.
 */
export class Backoff {
  private attempt = 0;
  constructor(
    private readonly initialMs = 250,
    private readonly maxMs = 4000,
  ) {}

  /** Compute the next wait duration and increment the attempt counter. */
  nextDelay(): number {
    const delay = Math.min(this.initialMs * 2 ** this.attempt, this.maxMs);
    this.attempt++;
    return delay;
  }

  /** Reset to the initial backoff (call after a successful `HEALTHY`). */
  reset(): void {
    this.attempt = 0;
  }

  /** Diagnostic. */
  get attemptCount(): number {
    return this.attempt;
  }
}
