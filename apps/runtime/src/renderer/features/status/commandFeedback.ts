/**
 * Tiny renderer-local feedback channel for playout commands (C-001). When a
 * command is rejected — most importantly while the bridge link is down — the
 * operator must see a clear error, and the command must never be shown
 * optimistically as on-air. `runCommand` centralizes that: it reports a failed
 * `accepted: false` or a thrown rejection, and otherwise stays quiet.
 */

type Listener = (message: string) => void;

const listeners = new Set<Listener>();

/** Subscribe to command-error messages; returns an unsubscribe. */
export function onCommandError(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Emit a command-error message to all subscribers. */
export function reportCommandError(message: string): void {
  for (const listener of [...listeners]) listener(message);
}

/**
 * Run a playout command, surfacing any failure as a visible error. A rejected
 * promise (e.g. the link is `disconnected`) is reported, never swallowed and
 * never treated as success.
 */
export function runCommand(label: string, promise: Promise<{ accepted: boolean }>): void {
  promise.then(
    (res) => {
      if (!res.accepted) reportCommandError(`${label} was not accepted.`);
    },
    (err: unknown) => {
      reportCommandError(err instanceof Error ? err.message : `${label} failed.`);
    },
  );
}
