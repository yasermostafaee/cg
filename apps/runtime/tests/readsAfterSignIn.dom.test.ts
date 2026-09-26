// @vitest-environment jsdom
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AUTH_REQUIRED_REFUSAL, defaultFixedLayerBank, type FixedLayerBank } from '@cg/shared-ipc';
import { App } from '../src/renderer/App.js';
import { createMockBridge } from '../src/platform/createRuntimeBridge.js';
import { __resetChannelChoiceForTest } from '../src/renderer/features/channels/channelStore.js';
import { __resetDraftsForTest } from '../src/renderer/features/inspector/draftStore.js';
import { clearRefusal } from '../src/renderer/features/status/refusalStore.js';
import type {
  AuthCapabilities,
  AuthSessionState,
  RuntimeBridge,
} from '../src/shared/runtime-bridge.js';
import { signedInStub } from './support/authStub.js';
import { clearPortals } from './support/dialog.js';
import { installMemoryStorage } from './support/localStorage.js';

/**
 * 🔴 `DELTA-MULTI-CHANNEL-01-A` A4 / A6 — **ROWS APPEAR WITHOUT A RELOAD.** The owner signed in on
 * the fake station, declared two channels, and the Layers tab read _"The layer list was refused…"_
 * until a browser reload — and the header had no `SILENCE ALL PLATES · EVERY CHANNEL`.
 *
 * One cause for both. Every snapshot the console pulled before its FIRST sign-in was refused by the
 * auth gate, and the only re-request after a sign-in was `WebSocketRuntime`'s resync — which
 * re-pulls stack, health and lock and nothing else. The plural bank read was among the refused, so
 * the console believed it drove one channel: no rows, and no every-channel control (it is offered
 * only when two or more are declared).
 *
 * Proved on the whole App over the offline mock, wrapped to refuse EVERY request — with the
 * bridge's own sentence — while nobody is signed in, exactly as the auth gate does. Each call that
 * arrives while signed out is recorded, which is also the A3 sweep's instrument: an automatic read
 * the console still sends before a sign-in shows up in that list.
 */

class NoopResizeObserver {
  observe(): void {
    /* geometry is Playwright's */
  }
  unobserve(): void {
    /* no-op */
  }
  disconnect(): void {
    /* no-op */
  }
}
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = NoopResizeObserver;
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const LAYER = 84;
let root: Root | null = null;
let host: HTMLDivElement | null = null;

async function flush(): Promise<void> {
  for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0));
}

/** An auth member whose state the test moves — signed out, then signed in. */
function movingAuth(initial: AuthSessionState): {
  auth: RuntimeBridge['auth'];
  set(next: AuthSessionState): void;
  now(): AuthSessionState;
} {
  let state = initial;
  const subs = new Set<(next: AuthSessionState) => void>();
  const caps: AuthCapabilities = {
    mode: 'playout',
    signInUrl: null,
    refreshUrl: null,
    contractVersion: null,
    setupPhase: null,
  };
  return {
    auth: {
      capabilities: () => caps,
      onCapabilitiesChanged: () => () => undefined,
      state: () => state,
      onStateChanged: (handler) => {
        subs.add(handler);
        return () => subs.delete(handler);
      },
      signIn: () => Promise.reject(new Error('not used here')),
      signOut: () => Promise.resolve(),
    } as RuntimeBridge['auth'],
    set: (next) => {
      state = next;
      for (const handler of [...subs]) handler(next);
    },
    now: () => state,
  };
}

/**
 * What the live console answers from the BROWSER, never the bridge (B-085: the template library
 * is browser-local — `WebSocketRuntime`'s `templates.list/get/html` read `#library`). Not gated:
 * no bridge can refuse them.
 */
const LOCAL = new Set(['templates.list', 'templates.get', 'templates.html']);

/**
 * The mock bridge behind the auth gate: every request (not a subscription, not the link, not the
 * auth door, not a browser-local read) is refused with {@link AUTH_REQUIRED_REFUSAL} while
 * `signedOut()` — and recorded.
 */
function gated(
  cg: RuntimeBridge,
  signedOut: () => boolean,
  asked: string[],
  answered: string[] = [],
): void {
  const open = new Set(['auth', 'link']);
  const record = cg as unknown as Record<string, unknown>;
  for (const [ns, members] of Object.entries(record)) {
    if (open.has(ns) || members === null || typeof members !== 'object') continue;
    const bag = members as Record<string, unknown>;
    for (const [name, member] of Object.entries(bag)) {
      if (typeof member !== 'function' || name.startsWith('on')) continue;
      if (LOCAL.has(`${ns}.${name}`)) continue;
      const call = member as (...args: unknown[]) => unknown;
      bag[name] = (...args: unknown[]): unknown => {
        if (signedOut()) {
          asked.push(`${ns}.${name}`);
          return Promise.reject(new Error(AUTH_REQUIRED_REFUSAL));
        }
        answered.push(`${ns}.${name}`);
        return call.apply(bag, args);
      };
    }
  }
}

async function boot(): Promise<RuntimeBridge> {
  (globalThis as { CG_E2E?: boolean }).CG_E2E = true;
  (globalThis as { CG_E2E_FIXED_BANK?: boolean }).CG_E2E_FIXED_BANK = false;
  installMemoryStorage();
  const cg = createMockBridge();
  const seed: FixedLayerBank = defaultFixedLayerBank();
  // Row 84 SHOWN on both channels (the default bank hides most rows), each named by its own bank.
  const shown = { ...seed.visibility, [String(LAYER)]: true };
  const declared = await cg.fixedLayers.setBanks({
    banks: [
      { ...seed, channel: 1, visibility: shown, aliases: { [String(LAYER)]: 'دسک خبر' } },
      { ...seed, channel: 2, visibility: shown, aliases: { [String(LAYER)]: 'میز ورزش' } },
    ],
  });
  expect(declared.ok, 'two channels were declared').toBe(true);
  return cg;
}

async function mount(): Promise<void> {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(createElement(App));
    await flush();
  });
  await act(flush);
}

afterEach(async () => {
  const r = root;
  if (r !== null) {
    await act(async () => {
      r.unmount();
    });
  }
  root = null;
  host?.remove();
  host = null;
  clearPortals();
  clearRefusal();
  __resetChannelChoiceForTest();
  __resetDraftsForTest();
  vi.restoreAllMocks();
});

const refusedList = (): Element | null =>
  [...document.querySelectorAll('[data-layers-loading]')].find((el) =>
    (el.textContent ?? '').includes('The layer list was refused.'),
  ) ?? null;
const rowNames = (): string[] =>
  [...document.querySelectorAll<HTMLElement>(`[data-layer="${String(LAYER)}"]`)].map(
    (r) => r.textContent ?? '',
  );
const everyChannelPanic = (): Element | null =>
  document.querySelector('[data-every-channel-panic]');

describe('`DELTA-MULTI-CHANNEL-01-A` A4 / A6 — a sign-in brings the rows, with no reload', () => {
  it('🔴 nothing is asked while signed out; the sign-in brings BOTH channels’ rows and the every-channel PANIC', async () => {
    const cg = await boot();
    const auth = movingAuth({ kind: 'signed-out' });
    const asked: string[] = [];
    const answered: string[] = [];
    (cg as unknown as { auth: RuntimeBridge['auth'] }).auth = auth.auth;
    gated(cg, () => auth.now().kind === 'signed-out', asked, answered);
    window.cg = cg;
    await mount();

    // Signed out: NOTHING was asked of the bridge — no snapshot, no station store — so nothing
    // was refused and there is no refusal to show. (The A3 sweep's instrument: any automatic read
    // the console still sent before a sign-in would be listed here.)
    expect(asked).toEqual([]);
    expect(refusedList()).toBeNull();

    await act(async () => {
      auth.set(signedInStub('زهرا موسوی', [1, 2], ['station-admin', 'operator', 'viewer']));
      await flush();
    });
    await act(flush);

    expect(refusedList(), 'the layer list stayed refused after the sign-in').toBeNull();
    // The sign-in is what asked — the banks, and the station stores that live on pushes.
    for (const read of [
      'fixedLayers.banks',
      'sources.config',
      'sources.assignments',
      'delimiters.list',
    ]) {
      expect(answered, `${read} was not asked after the sign-in`).toContain(read);
    }
    expect(rowNames().some((t) => t.includes('دسک خبر'))).toBe(true);
    expect(
      everyChannelPanic(),
      'the every-channel PANIC needs both channels declared',
    ).not.toBeNull();
    // …and the second channel's rows are there to switch to.
    await act(async () => {
      document.getElementById('channel-2')?.click();
      await flush();
    });
    expect(rowNames().some((t) => t.includes('میز ورزش'))).toBe(true);
  });

  it('CONTROL — a bridge that truly refuses the list is still SAID: the refusal renders', async () => {
    const cg = await boot();
    const auth = movingAuth(signedInStub('زهرا موسوی', [1, 2], ['operator', 'viewer']));
    (cg as unknown as { auth: RuntimeBridge['auth'] }).auth = auth.auth;
    const refuse = (): Promise<never> =>
      Promise.reject(new Error('This sign-in does not allow that command.'));
    (cg.fixedLayers as unknown as Record<string, unknown>)['banks'] = refuse;
    (cg.fixedLayers as unknown as Record<string, unknown>)['config'] = refuse;
    window.cg = cg;
    await mount();
    expect(refusedList(), 'a real refusal must still be said').not.toBeNull();
  });
});
