import { closeGuardDoor, type CloseGuardDoor, type ShellInvoke } from '@cg/gesture';
import type { PlayoutFetchLike, PlayoutResponseLike } from '@cg/shared-ipc';
import { FloatingPanelPlacementSchema } from '../shared/floating-panels.js';
import type { FloatingPanelWindowDoor } from '../shared/floating-panel-window.js';
import type {
  LocalBridgeOutcome,
  LocalBridgeState,
  NdiPreviewPacket,
} from '../shared/runtime-bridge.js';

/**
 * 🔴 CG Control's shell, from the console's side (ADR 0011; `CENTRAL-BRIDGE-01`).
 *
 * CG Control no longer runs a bridge: CG Bridge is one service on the Playout machine and this
 * console connects to it over the network. What is left of the shell is a few doors, each granted to
 * the console the app bundles and to nothing else, and absent in a plain browser:
 *
 *   - `playout_post` — the Playout's D1/D2 from the native side, with no `Origin` (rule 8);
 *   - `keyboard_language` — which keyboard language the window types in (`TEXT-DIGITS-01`);
 *   - `local_bridge_state` / `local_bridge_act` — CG Bridge on this machine (`R-091`);
 *   - the window's close, held for the console to answer (`R-094`, {@link shellCloseGuard}).
 *
 * `set_playout_address` and `open_bridge_log` are gone with the bridge the app no longer runs: the
 * console keeps its own Playout address (`stationAddress.ts`), and a station admin downloads CG
 * Bridge's logs from CG Bridge.
 */

interface TauriInternals {
  invoke(
    command: string,
    args?: Record<string, unknown> | ArrayBuffer,
    options?: { headers: Record<string, string> },
  ): Promise<unknown>;
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

export function nativeFloatingPanels(): FloatingPanelWindowDoor | null {
  const door = tauri();
  if (door === null) return null;
  return {
    async arrange(arrangement) {
      await door.invoke('arrange_floating_panel', { ...arrangement });
    },
    async placement(panel) {
      const actual = await door.invoke('read_floating_panel_placement', { panel });
      return actual === null ? null : FloatingPanelPlacementSchema.parse(actual);
    },
    async dispose() {
      await door.invoke('dispose_floating_panels');
    },
  };
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

export function shellSetLayerAltF4Armed(armed: boolean): void {
  const door = tauri();
  if (door === null) return;
  void door.invoke('set_layer_alt_f4', { armed }).catch((error: unknown) => console.warn(error));
}

export function nativeBridgeArchiveSaver():
  | ((archive: Blob, filename: string) => Promise<string | null>)
  | null {
  const door = tauri();
  if (door === null) return null;
  return async (archive, filename) => {
    try {
      const saved = await door.invoke('save_bridge_archive', await archive.arrayBuffer(), {
        headers: { 'x-cg-archive-name': encodeURIComponent(filename) },
      });
      if (saved === null || (typeof saved === 'string' && saved !== '')) return saved;
      throw new Error('The desktop shell did not confirm the save.');
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error('CG Control could not save the log archive. ' + detail, { cause: error });
    }
  };
}

export function shellOpenCompanySite(): boolean {
  const door = tauri();
  if (door === null) return false;
  void door.invoke('open_company_site').catch((error: unknown) => console.warn(error));
  return true;
}

/**
 * 🔴 `R-091` — CG Bridge on `host` when that is THIS machine, as CG Control's shell reads Windows
 * (`local_bridge_state`). `null` outside CG Control, or when the shell could not answer.
 */
export async function localBridgeState(host: string): Promise<LocalBridgeState | null> {
  const door = tauri();
  if (door === null) return null;
  try {
    return (await door.invoke('local_bridge_state', { host })) as LocalBridgeState;
  } catch {
    return null;
  }
}

/**
 * 🔴 `R-091` — one administrator step (`local_bridge_act`): start CG Bridge's service, or free TCP 5280
 * from a holder of ours. Windows asks for the rights itself; the shell stops nothing that is not ours.
 */
export async function localBridgeAct(
  action: 'start' | 'free',
  pid?: number,
): Promise<LocalBridgeOutcome> {
  const door = tauri();
  if (door === null) return { kind: 'failed', reason: 'Only CG Control can do this.' };
  try {
    return (await door.invoke('local_bridge_act', {
      action,
      ...(pid !== undefined ? { pid } : {}),
    })) as LocalBridgeOutcome;
  } catch (err) {
    return { kind: 'failed', reason: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * 🔴 `R-094` — **NO CLOSE ON A SLIP.** CG Control's shell holds every close of its window it can
 * intercept and asks the console (`close_window.rs`, shared with CG Designer; the JS half is
 * `@cg/gesture`'s `closeGuardDoor`). Closing the window is a WINDOW close: the three commands go to
 * the shell and nowhere else — nothing is sent to CG Bridge or CasparCG, and what is on air stays.
 * A browser has no shell: the door holds nothing, and the tab's leave prompt is the question.
 */
export function shellCloseGuard(): CloseGuardDoor {
  const door = tauri();
  const invoke: ShellInvoke | null =
    door === null ? null : (command, args) => door.invoke(command, args);
  // The page's window — or, where there is none (a test under Node), a target nothing dispatches on.
  const target: EventTarget = typeof window === 'undefined' ? new EventTarget() : window;
  return closeGuardDoor(invoke, target);
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

const NDI_PACKET_HEADER_BYTES = 5;
const NDI_PREVIEW_POLL_MS = 32;
const ndiSessionTails = new Map<string, Promise<void>>();

export function decodeNdiPreviewPackets(buffer: ArrayBuffer): NdiPreviewPacket[] {
  const view = new DataView(buffer);
  const packets: NdiPreviewPacket[] = [];
  let offset = 0;
  while (offset < buffer.byteLength) {
    if (buffer.byteLength - offset < NDI_PACKET_HEADER_BYTES) {
      throw new Error('Local NDI preview returned an incomplete packet.');
    }
    const kind = view.getUint8(offset);
    const length = view.getUint32(offset + 1, true);
    offset += NDI_PACKET_HEADER_BYTES;
    if (length > buffer.byteLength - offset) {
      throw new Error('Local NDI preview returned an incomplete packet.');
    }
    const bytes = new Uint8Array(buffer, offset, length);
    offset += length;
    if (kind === 1) packets.push({ kind: 'picture', bytes });
    else if (kind === 2) packets.push({ kind: 'audio', bytes });
    else if (kind === 3) packets.push({ kind: 'no-signal' });
    else if (kind === 4) packets.push({ kind: 'error', message: new TextDecoder().decode(bytes) });
    else throw new Error('Local NDI preview returned an unknown packet.');
  }
  return packets;
}

/** Pulls bounded data through the app's native IPC. Image and audio never visit CG Bridge. */
export async function openNativeNdiStream(
  senderName: string,
  onPacket: (packet: NdiPreviewPacket) => void,
): Promise<() => void> {
  const door = tauri();
  if (door === null) throw new Error('Direct NDI preview requires CG Control desktop.');
  const previous = ndiSessionTails.get(senderName);
  let release!: () => void;
  const lifetime = new Promise<void>((resolve) => {
    release = resolve;
  });
  ndiSessionTails.set(senderName, lifetime);
  const finish = (): void => {
    if (ndiSessionTails.get(senderName) === lifetime) ndiSessionTails.delete(senderName);
    release();
  };

  // A view can close while Start is still in flight. Reserve the sender until Stop finishes.
  await previous;
  let id: number;
  try {
    const answer = await door.invoke('ndi_preview_start', { sender: senderName });
    if (typeof answer !== 'number' || !Number.isSafeInteger(answer) || answer < 0) {
      throw new Error('Could not open a local NDI preview.');
    }
    id = answer;
  } catch (error) {
    finish();
    throw error;
  }

  let closed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const close = (): void => {
    if (closed) return;
    closed = true;
    clearTimeout(timer);
    void door.invoke('ndi_preview_stop', { id }).then(finish, finish);
  };

  const read = async (): Promise<void> => {
    if (closed) return;
    try {
      const data = await door.invoke('ndi_preview_poll', { id });
      if (closed) return;
      if (!(data instanceof ArrayBuffer)) {
        throw new Error('Local NDI preview did not return media data.');
      }
      for (const packet of decodeNdiPreviewPackets(data)) {
        if (closed) return;
        onPacket(packet);
        if (packet.kind === 'error') {
          close();
          return;
        }
      }
    } catch (error) {
      if (!closed) {
        close();
        onPacket({
          kind: 'error',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
    if (!closed) timer = setTimeout(() => void read(), NDI_PREVIEW_POLL_MS);
  };
  timer = setTimeout(() => void read(), 0);
  return close;
}
