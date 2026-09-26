/**
 * 🔴 `DESKTOP-APPS-01-A` — **THE ONE DOOR THAT WRITES THE PLAYOUT TARGET** (ADR 0011).
 *
 * The Playout address is written by CG Control's desktop shell — its `set_playout_address`
 * command, reachable through Tauri's IPC only from the console the bridge serves in the app's own
 * window — and NEVER over the control socket. A console in a plain browser has no such door, and
 * says so by the door being absent: {@link canSetPlayoutAddress} is `false` and the control that
 * would use it is not rendered.
 */

interface TauriInternals {
  invoke(command: string, args?: Record<string, unknown>): Promise<unknown>;
}

function tauri(): TauriInternals | null {
  const internals = (globalThis as { __TAURI_INTERNALS__?: Partial<TauriInternals> })
    .__TAURI_INTERNALS__;
  return internals !== undefined && typeof internals.invoke === 'function'
    ? (internals as TauriInternals)
    : null;
}

/** Is this console running inside CG Control, where the Playout address can be changed? */
export function canSetPlayoutAddress(): boolean {
  return tauri() !== null;
}

/**
 * Write the Playout address and restart the bridge. Resolves with the bridge's own sentence;
 * rejects with it when the address is refused. The console reconnects by itself.
 */
export async function setPlayoutAddress(address: string): Promise<string> {
  const door = tauri();
  if (door === null) throw new Error('Only CG Control can change the Playout address.');
  try {
    return String(await door.invoke('set_playout_address', { address }));
  } catch (err) {
    throw new Error(
      typeof err === 'string' ? err : err instanceof Error ? err.message : String(err),
    );
  }
}

/**
 * `FIELD-FIXES-01` G — **THE LOG FOLDER, from the console.** The native menu that held "Open bridge
 * log" is gone (its "CG Control" submenu was the second line repeating the app's name), so the
 * console carries the door instead: `open_bridge_log` opens Explorer on `bridge.log`, beside
 * `amcp.log`. Only inside CG Control; a browser has no such door and renders no control for it.
 */
export function canOpenBridgeLog(): boolean {
  return tauri() !== null;
}

/** Open the log folder in Explorer. Never throws: a refusal is reported, not raised. */
export async function openBridgeLog(): Promise<{ accepted: boolean; message?: string }> {
  const door = tauri();
  if (door === null)
    return { accepted: false, message: 'Only CG Control can open its log folder.' };
  try {
    await door.invoke('open_bridge_log');
    return { accepted: true };
  } catch (err) {
    return {
      accepted: false,
      message: typeof err === 'string' ? err : err instanceof Error ? err.message : String(err),
    };
  }
}
