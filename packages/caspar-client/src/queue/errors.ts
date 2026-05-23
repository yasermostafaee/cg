/**
 * Typed errors a CommandQueue promise can reject with. Consumers can
 * distinguish them via `instanceof`. All extend Error so they capture
 * stack traces for diagnostics.
 */

/** The command was queued but the configured timeout elapsed with no response. */
export class AmcpTimeoutError extends Error {
  override readonly name = 'AmcpTimeoutError';
  constructor(
    readonly seq: number,
    readonly timeoutMs: number,
    readonly line: string,
  ) {
    super(`AMCP command #${String(seq)} timed out after ${String(timeoutMs)}ms: ${line}`);
  }
}

/** The transport became disconnected while this command was in-flight or queued. */
export class AmcpDisconnectedError extends Error {
  override readonly name = 'AmcpDisconnectedError';
  constructor(
    readonly seq: number,
    readonly line: string,
  ) {
    super(`AMCP transport disconnected before command #${String(seq)} resolved: ${line}`);
  }
}

/** The caller aborted via `AbortSignal` before the command resolved. */
export class AmcpAbortedError extends Error {
  override readonly name = 'AmcpAbortedError';
  constructor(
    readonly seq: number,
    readonly line: string,
    cause?: unknown,
  ) {
    super(`AMCP command #${String(seq)} aborted: ${line}`);
    if (cause !== undefined) (this as Error & { cause?: unknown }).cause = cause;
  }
}
