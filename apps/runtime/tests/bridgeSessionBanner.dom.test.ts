// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BRIDGE_NEEDS_ADMIN_LINE, type BridgeSessionState } from '@cg/shared-ipc';
import { BridgeSessionBanner } from '../src/renderer/features/status/BridgeSessionBanner.js';
import type { AuthSessionState } from '../src/shared/runtime-bridge.js';
import { authStub, fillBridgeStub, signedInStub } from './support/authStub.js';
import { clearPortals, openDialog } from './support/dialog.js';
import { installMemoryStorage } from './support/localStorage.js';

/**
 * 🔴 `CENTRAL-BRIDGE-01` (D7, rule 8) — **ONE LINE WHILE CG BRIDGE HAS NO PLAYOUT SESSION, AND A
 * STATION ADMIN'S ONE-TIME SIGN-IN.**
 *
 *   1. `needs-admin` shows the line on every console, and a station admin — and only a station
 *      admin — gets the control (absent, not disabled, for anyone else: golden rule 13);
 *   2. the dialog asks the bridge, words a refusal from the contract's CODE as the console's own
 *      sign-in does, and keeps no password — not after a refusal, not after it closes, not in
 *      storage;
 *   3. CONTROL: a signed-in bridge draws nothing, and follows the bridge's push.
 */

const OPERATOR = signedInStub('Sara', [1]);
const ADMIN = signedInStub('Mina', [1], ['station-admin', 'operator', 'viewer']);
const PASSWORD = 'correct horse battery staple';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
/** A real store to read back — jsdom's opaque origin has none, which would make "nothing stored" vacuous. */
let storage: Storage = installMemoryStorage();

beforeEach(() => {
  storage = installMemoryStorage();
});

afterEach(async () => {
  if (root !== null) {
    const r = root;
    await act(async () => {
      r.unmount();
    });
  }
  root = null;
  container?.remove();
  container = null;
  clearPortals();
  vi.restoreAllMocks();
});

async function mount(
  initial: BridgeSessionState,
  auth: AuthSessionState,
  signIn: (req: { username: string; password: string }) => Promise<unknown> = () =>
    Promise.resolve({ ok: true }),
): Promise<{ push: (next: BridgeSessionState) => Promise<void>; signIn: typeof signIn }> {
  const listeners = new Set<(s: BridgeSessionState) => void>();
  const spy = vi.fn(signIn);
  const stub = {
    auth: authStub(auth),
    bridgeSession: {
      state: () => Promise.resolve(initial),
      onChanged: (l: (s: BridgeSessionState) => void) => {
        listeners.add(l);
        return () => listeners.delete(l);
      },
      signIn: spy,
    },
  };
  (window as unknown as { cg: typeof stub }).cg = fillBridgeStub(stub);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const r = root;
  await act(async () => {
    r.render(createElement(StrictMode, null, createElement(BridgeSessionBanner)));
  });
  await act(async () => {
    await Promise.resolve();
  });
  return {
    push: async (next) => {
      await act(async () => {
        for (const l of listeners) l(next);
      });
    },
    signIn: spy,
  };
}

const banner = (): HTMLElement | null => document.querySelector('[data-bridge-session-banner]');
const openButton = (): HTMLButtonElement | null =>
  [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (b) => b.textContent === 'Sign in CG Bridge…',
  ) ?? null;

async function type(input: HTMLInputElement, value: string): Promise<void> {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function press(label: string): Promise<void> {
  const button = [...(openDialog()?.querySelectorAll<HTMLButtonElement>('button') ?? [])].find(
    (b) => b.textContent === label,
  );
  expect(button, `no ${label} button`).toBeDefined();
  await act(async () => {
    button?.click();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('CENTRAL-BRIDGE-01 5.1 — the needs-admin line', () => {
  it('shows the ONE line on an operator’s console — and no sign-in control there, not even a disabled one', async () => {
    await mount({ state: 'needs-admin' }, OPERATOR);
    expect(banner()?.textContent).toContain(BRIDGE_NEEDS_ADMIN_LINE);
    expect(openButton()).toBeNull();
  });

  it('CONTROL — a signed-in bridge draws nothing, and the line follows the bridge’s push', async () => {
    const { push } = await mount({ state: 'signed-in', name: 'cg-admin' }, ADMIN);
    expect(banner()).toBeNull();
    await push({ state: 'needs-admin' });
    expect(banner()?.textContent).toContain(BRIDGE_NEEDS_ADMIN_LINE);
    await push({ state: 'signed-in', name: 'cg-admin' });
    expect(banner()).toBeNull();
  });
});

describe('CENTRAL-BRIDGE-01 5.1 — a station admin signs the bridge in, once', () => {
  it('🔴 a refusal is the console’s own sentence; the password is dropped at once and never stored', async () => {
    const { signIn } = await mount({ state: 'needs-admin' }, ADMIN, () =>
      Promise.resolve({ ok: false, failure: 'invalid_credentials' }),
    );
    await act(async () => {
      openButton()?.click();
    });
    const dialog = openDialog();
    const account = dialog?.querySelector<HTMLInputElement>('#cg-bridge-signin-user');
    const password = dialog?.querySelector<HTMLInputElement>('#cg-bridge-signin-pass');
    // The station's own account is offered, as the Playout team named it.
    expect(account?.value).toBe('cg-admin');
    if (password === null || password === undefined) throw new Error('no password field');
    await type(password, 'wrong');
    await press('Sign in');

    expect(signIn).toHaveBeenCalledWith({ username: 'cg-admin', password: 'wrong' });
    expect(openDialog()?.textContent).toContain('The username or password is wrong.');
    expect(password.value, 'the password outlived its one request').toBe('');
    expect(password.getAttribute('aria-invalid')).toBe('true');
  });

  it('an accepted sign-in closes the dialog — CONTROL: the request carried what was typed — and nothing kept it', async () => {
    const { signIn } = await mount({ state: 'needs-admin' }, ADMIN);
    await act(async () => {
      openButton()?.click();
    });
    const password = openDialog()?.querySelector<HTMLInputElement>('#cg-bridge-signin-pass');
    if (password === null || password === undefined) throw new Error('no password field');
    await type(password, PASSWORD);
    await press('Sign in');

    expect(signIn).toHaveBeenCalledWith({ username: 'cg-admin', password: PASSWORD });
    expect(openDialog()).toBeNull();
    // Nothing in this browser holds it.
    const stored: string[] = [];
    for (let i = 0; i < storage.length; i++)
      stored.push(storage.getItem(storage.key(i) ?? '') ?? '');
    expect(stored.join('\n')).not.toContain(PASSWORD);
    // Re-opened, the field is empty.
    await act(async () => {
      openButton()?.click();
    });
    expect(openDialog()?.querySelector<HTMLInputElement>('#cg-bridge-signin-pass')?.value).toBe('');
  });
});
