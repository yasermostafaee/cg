// @vitest-environment jsdom
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CLOSE_REQUESTED_EVENT, closeGuardDoor } from '@cg/gesture';
import { parseWsFrame, serializeWsFrame } from '@cg/shared-ipc';
import type { StackItemState } from '@cg/shared-schema';
import { WebSocketRuntime, type WebSocketLike } from '../src/platform/WebSocketRuntime.js';
import type { AuthSessionState, RuntimeBridge } from '../src/shared/runtime-bridge.js';
import { stayOnAirLine } from '../src/renderer/features/shell/CloseConsoleDialog.js';
import { ConsoleCloseGuard } from '../src/renderer/features/shell/ConsoleCloseGuard.js';
import {
  __resetLeavePromptForTest,
  reloadOnPurpose,
} from '../src/renderer/features/shell/leavePrompt.js';
import { authStub } from './support/authStub.js';
import { currentBridgeCapabilities } from './support/currentBridge.js';
import { clearPortals } from './support/dialog.js';
import { installMemoryStorage } from './support/localStorage.js';

/**
 * 🔴 `R-094` — **CG CONTROL DOES NOT CLOSE ON A SLIP, AND CLOSING SENDS NOTHING.**
 *
 * Inside CG Control the guard runs against the REAL `WebSocketRuntime` over a socket that records
 * every frame, and the real shell door (`@cg/gesture`'s `closeGuardDoor`) over a recorded Tauri
 * `invoke`. The no-wire case is the one the item names: the shell asks, the dialog shows, Close is
 * pressed — and not one frame leaves for CG Bridge, and the socket is not closed by the console.
 * Its control is the same socket carrying the connect handshake first: the recorder is live.
 */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** A scriptable `WebSocketLike` that records every frame the console sends. */
class RecordingSocket implements WebSocketLike {
  readyState = 0;
  readonly sent: string[] = [];
  closedByConsole = false;
  readonly #listeners = new Map<string, ((ev: { data: unknown }) => void)[]>();

  addEventListener(type: string, listener: (ev: { data: unknown }) => void): void {
    const list = this.#listeners.get(type) ?? [];
    list.push(listener);
    this.#listeners.set(type, list);
  }

  send(data: string): void {
    this.sent.push(data);
    const frame = parseWsFrame(data);
    if (frame === null || frame.type !== 'request') return;
    queueMicrotask(() => {
      const payload = answer(frame.channel);
      this.#fire('message', {
        data: serializeWsFrame({ type: 'response', id: frame.id, payload }),
      });
    });
  }

  close(): void {
    this.closedByConsole = true;
    this.readyState = 3;
    this.#fire('close', { data: undefined });
  }

  open(): void {
    this.readyState = 1;
    this.#fire('open', { data: undefined });
  }

  #fire(type: string, ev: { data: unknown }): void {
    for (const listener of this.#listeners.get(type) ?? []) listener(ev);
  }
}

/** What a current, auth-off bridge answers the connect sequence with. */
function answer(channel: string): unknown {
  switch (channel) {
    case 'bridge.capabilities':
      return currentBridgeCapabilities();
    case 'stack.snapshot':
    case 'station.strays':
      return [];
    case 'connections.health':
      return {
        primary: { label: 'A', state: 'healthy', amcpAxisOk: true },
        backup: { label: 'B', state: 'healthy', amcpAxisOk: true },
        currentPrimary: 'A',
        strategy: 'mirror-sync',
      };
    case 'lock.state':
      return { engaged: false };
    default:
      return null;
  }
}

function item(itemId: string, status: StackItemState['status'], pending = false): StackItemState {
  return { itemId, templateId: 'tpl', fields: {}, status, pending } as StackItemState;
}

/** On air or unsettled by `isOnAirStatus`: on-air, playing, unconfirmed, and a pending take. */
const STACK: readonly StackItemState[] = [
  item('a', 'on-air'),
  item('b', 'playing'),
  item('c', 'unconfirmed'),
  item('d', 'idle', true),
  item('e', 'error'),
  item('f', 'loaded'),
  item('g', 'idle'),
];

let said: string[];
let root: Root | null = null;
let host: HTMLDivElement | null = null;
let runtime: WebSocketRuntime | null = null;

async function flush(): Promise<void> {
  for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0));
}

function mount(items: readonly StackItemState[]): void {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root?.render(createElement(ConsoleCloseGuard, { items }));
  });
}

async function shellAsksToClose(): Promise<void> {
  await act(async () => {
    window.dispatchEvent(new Event(CLOSE_REQUESTED_EVENT));
    await flush();
  });
}

const dialog = (): HTMLElement | null =>
  document.querySelector<HTMLElement>('[role="dialog"][aria-label="Close CG Control?"]');

function press(label: string): void {
  const found = [...(dialog()?.querySelectorAll('button') ?? [])].find(
    (b) => b.textContent?.trim() === label,
  );
  if (found === undefined) throw new Error(`no ${label} button in the dialog`);
  act(() => found.click());
}

/** CG Control: a recorded shell, installed BEFORE the runtime builds its door. */
function insideCgControl(): void {
  (globalThis as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {
    invoke: (command: string) => {
      said.push(command);
      return Promise.resolve(null);
    },
  };
}

beforeEach(() => {
  said = [];
  installMemoryStorage();
  __resetLeavePromptForTest();
});

afterEach(async () => {
  act(() => root?.unmount());
  root = null;
  host?.remove();
  host = null;
  clearPortals();
  runtime?.dispose();
  runtime = null;
  delete (globalThis as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  await flush();
});

describe('R-094 — inside CG Control', () => {
  let socket: RecordingSocket;

  beforeEach(async () => {
    insideCgControl();
    runtime = new WebSocketRuntime('ws://fake', {
      createWebSocket: () => {
        socket = new RecordingSocket();
        return socket;
      },
    });
    socket.open();
    await runtime.whenReady();
    await flush();
    window.cg = runtime;
  });

  it('🔴 Close closes the WINDOW and sends nothing to CG Bridge — control: the recorder carried the handshake', async () => {
    // CONTROL — the recorder is live: the connect sequence went through it.
    const handshake = socket.sent.map((d) => parseWsFrame(d)).filter((f) => f?.type === 'request');
    expect(handshake.length, 'the connect sequence was recorded').toBeGreaterThan(0);

    mount(STACK);
    await act(flush);
    const before = socket.sent.length;
    expect(said).toEqual(['close_guard']);

    await shellAsksToClose();
    expect(dialog(), 'the dialog shows; the window was held').not.toBeNull();
    press('Close');
    await act(flush);

    expect(said.filter((c) => c.startsWith('close_'))).toEqual([
      'close_guard',
      'close_request_seen',
      'close_window_now',
    ]);
    // ⚠ The whole point: not one frame, and the console did not close its socket either.
    expect(socket.sent.slice(before)).toEqual([]);
    expect(socket.closedByConsole).toBe(false);
    expect(runtime?.link.status()).toBe('live');

    // CONTROL — the silence is a measurement: the same recorder, at this moment, sees a read.
    await act(async () => {
      await runtime?.stack.snapshot();
    });
    const after = socket.sent.slice(before).map((d) => parseWsFrame(d));
    expect(after.map((f) => (f?.type === 'request' ? f.channel : null))).toEqual([
      'stack.snapshot',
    ]);
  });

  it('the dialog: its title, the one fact line counted by `airTally`, two buttons, focus on Cancel', async () => {
    mount(STACK);
    await shellAsksToClose();
    const d = dialog();
    expect(d?.querySelector('h2')?.textContent).toBe('Close CG Control?');
    // on-air + playing + unconfirmed + a pending take — `isOnAirStatus` counts unknown as on air.
    expect(d?.querySelector('[data-modal-body]')?.textContent).toBe('4 items stay on air.');
    const buttons = [...(d?.querySelectorAll('.cg-modal-footer button') ?? [])].map((b) =>
      b.textContent?.trim(),
    );
    expect(buttons).toEqual(['Cancel', 'Close']);
    expect(document.activeElement?.textContent?.trim()).toBe('Cancel');
    // Above the lock, the sign-in gate and first-run.
    expect(d?.closest('[data-modal-layer]')?.getAttribute('data-modal-layer')).toBe('window');
  });

  it('with nothing on air the dialog carries no fact line at all', async () => {
    mount([item('f', 'loaded'), item('g', 'idle'), item('e', 'error')]);
    await shellAsksToClose();
    expect(dialog()).not.toBeNull();
    expect(dialog()?.querySelector('[data-modal-body]')).toBeNull();
  });

  it('Cancel keeps the window; the next close asks again', async () => {
    mount(STACK);
    await shellAsksToClose();
    press('Cancel');
    expect(dialog()).toBeNull();
    expect(said).not.toContain('close_window_now');
    await shellAsksToClose();
    expect(dialog()).not.toBeNull();
  });

  it('Escape keeps the window', async () => {
    mount(STACK);
    await shellAsksToClose();
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(dialog()).toBeNull();
    expect(said).not.toContain('close_window_now');
  });

  it('a close asked while the dialog is open does not stack a second dialog', async () => {
    mount(STACK);
    await shellAsksToClose();
    await shellAsksToClose();
    await shellAsksToClose();
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    expect(said.filter((c) => c === 'close_request_seen')).toHaveLength(3);
  });

  it('inside CG Control a SIGNED-IN console registers no leave prompt: the shell’s close is the question', () => {
    // Signed in, so the browser rule WOULD ask (its control is the browser describe below).
    window.cg = {
      closeGuard: closeGuardDoor((command) => {
        said.push(command);
        return Promise.resolve(null);
      }, window),
      auth: { ...authStub(), state: () => signedIn() },
    } as unknown as RuntimeBridge;
    mount(STACK);
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(said.at(-1), 'the shell holds the close instead').toBe('close_guard');
  });
});

function signedIn(): AuthSessionState {
  return {
    kind: 'signed-in',
    principal: {
      name: 'زهرا موسوی',
      sub: 'u-1',
      roles: ['operator'],
      channels: [],
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      nameTruncated: false,
    },
    permittedChannels: [1],
  } as AuthSessionState;
}

describe('R-094 — the fact line', () => {
  it('is said only when true, in the singular for one', () => {
    expect(stayOnAirLine(0)).toBeNull();
    expect(stayOnAirLine(1)).toBe('1 item stays on air.');
    expect(stayOnAirLine(2)).toBe('2 items stay on air.');
  });
});

describe('R-094 — the browser console’s leave prompt', () => {
  let session: AuthSessionState;

  beforeEach(() => {
    session = { kind: 'signed-out' };
    const auth = authStub();
    // No shell: the door holds nothing, and the tab's own prompt is the question.
    window.cg = {
      closeGuard: closeGuardDoor(null, window),
      auth: { ...auth, state: () => session },
    } as unknown as RuntimeBridge;
    mount(STACK);
  });

  const wouldPrompt = (): boolean => {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  };

  it('asks while signed in, and not signed out or with no sign-in at all', () => {
    expect(wouldPrompt(), 'signed out').toBe(false);
    session = { kind: 'off' };
    expect(wouldPrompt(), 'auth off').toBe(false);
    session = signedIn();
    expect(wouldPrompt(), 'signed in').toBe(true);
    session = { kind: 'expired', name: 'زهرا موسوی' };
    expect(wouldPrompt(), 'expired').toBe(false);
  });

  it('a reload the console starts itself (Retry connection) does not ask', () => {
    session = signedIn();
    expect(wouldPrompt()).toBe(true);
    let reloaded = 0;
    reloadOnPurpose(() => {
      reloaded += 1;
    });
    expect(reloaded).toBe(1);
    expect(wouldPrompt()).toBe(false);
  });

  it('a close request without a shell shows nothing — there is no window to hold', async () => {
    session = signedIn();
    await shellAsksToClose();
    expect(dialog()).toBeNull();
  });
});
