import type { PlayoutFetchLike, PlayoutResponseLike } from '@cg/shared-ipc';

/**
 * 🔴 CG Control's shell, from the console's side (ADR 0011; `CENTRAL-BRIDGE-01`).
 *
 * CG Control no longer runs a bridge: CG Bridge is one service on the Playout machine and this
 * console connects to it over the network. What is left of the shell is two doors, each granted to
 * the console the app bundles and to nothing else, and absent in a plain browser:
 *
 *   - `playout_post` — the Playout's D1/D2 from the native side, with no `Origin` (rule 8);
 *   - `keyboard_language` — which keyboard language the window types in (`TEXT-DIGITS-01`).
 *
 * `set_playout_address` and `open_bridge_log` are gone with the bridge the app no longer runs: the
 * console keeps its own Playout address (`stationAddress.ts`), and a station admin downloads CG
 * Bridge's logs from CG Bridge.
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

/** Is this console inside CG Control — the app with a native sign-in and a keyboard-language door? */
export function insideCgControl(): boolean {
  return tauri() !== null;
}

/**
 * `TEXT-DIGITS-01` — CG Control's shell reports the keyboard language its window types in through
 * ONE read-only command. A browser has no shell and reports nothing; the detector then reads the
 * letters typed instead.
 */
export function shellReportsKeyboardLanguage(): boolean {
  return tauri() !== null;
}

/** The shell's answer — `unknown` where there is no shell. */
export function shellKeyboardLanguage(): Promise<unknown> {
  const door = tauri();
  return door === null ? Promise.resolve('unknown') : door.invoke('keyboard_language');
}

/**
 * `CENTRAL-BRIDGE-01-A` — the request never reached the Playout (no route, refused, no answer to
 * the connect): a refresh token it carried NEVER LEFT, so it is kept and asked again
 * (`playoutRefresh.ts`). Only the native side can know this; a browser's `fetch` cannot.
 */
export class PlayoutNotSentError extends Error {
  override readonly name = 'PlayoutNotSentError';
}

type NativeAnswer =
  | { readonly kind: 'answered'; readonly status: number; readonly body: string }
  | { readonly kind: 'not-sent'; readonly reason: string }
  | { readonly kind: 'lost'; readonly reason: string };

function responseOf(status: number, body: string): PlayoutResponseLike {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(body),
    json: () => Promise.resolve(JSON.parse(body) as unknown),
  };
}

/**
 * 🔴 `CENTRAL-BRIDGE-01` rule 8 — **D1/D2 FROM CG CONTROL'S NATIVE SIDE, WITH NO `Origin`.** A
 * `PlayoutFetchLike`, so `@cg/shared-ipc`'s one reading of the answers applies unchanged. `null`
 * outside CG Control: a browser keeps its `fetch`.
 */
export function nativePlayoutFetch(): PlayoutFetchLike | null {
  const door = tauri();
  if (door === null) return null;
  return async (url, init) => {
    const answer = (await door.invoke('playout_post', { url, body: init.body })) as NativeAnswer;
    if (answer.kind === 'answered') return responseOf(answer.status, answer.body);
    if (answer.kind === 'not-sent') throw new PlayoutNotSentError(answer.reason);
    throw new Error(answer.reason);
  };
}
