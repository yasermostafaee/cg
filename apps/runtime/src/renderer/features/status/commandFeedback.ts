/**
 * Tiny renderer-local feedback channel for operator actions (C-001). When a
 * command is rejected — most importantly while the bridge link is down — the
 * operator must see a clear error, and the command must never be shown
 * optimistically as on-air. `runCommand` centralizes that: it reports a failed
 * `accepted: false` or a thrown rejection, and otherwise stays quiet.
 *
 * Two parallel channels, one transient toast surface (`CommandToast`):
 *   - ERROR   (`reportCommandError`)   — a refusal / failure. Rendered red.
 *   - SUCCESS (`reportCommandSuccess`) — a completed local action worth a brief
 *     confirmation (e.g. "Imported X"). Rendered green.
 * Both replace inline messages pinned into a row/panel, which broke tight layouts.
 */

type Listener = (message: string) => void;

const errorListeners = new Set<Listener>();
const successListeners = new Set<Listener>();

/** Subscribe to command-ERROR messages; returns an unsubscribe. */
export function onCommandError(listener: Listener): () => void {
  errorListeners.add(listener);
  return () => {
    errorListeners.delete(listener);
  };
}

/** Subscribe to command-SUCCESS messages; returns an unsubscribe. */
export function onCommandSuccess(listener: Listener): () => void {
  successListeners.add(listener);
  return () => {
    successListeners.delete(listener);
  };
}

/** Emit a command-error message to all subscribers. */
export function reportCommandError(message: string): void {
  for (const listener of [...errorListeners]) listener(message);
}

/** Emit a command-success message to all subscribers. */
export function reportCommandSuccess(message: string): void {
  for (const listener of [...successListeners]) listener(message);
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
