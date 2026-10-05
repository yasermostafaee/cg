// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BRIDGE_NEEDS_ADMIN_LINE,
  ENGINE_PASSWORD_WHERE,
  type BridgeSessionState,
  type EngineLine,
  type EngineSessions,
} from '@cg/shared-ipc';
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
  engines?: {
    readonly sessions: EngineSessions;
    readonly signInBackup?: (req: { username: string; password: string }) => Promise<unknown>;
  },
): Promise<{
  push: (next: BridgeSessionState) => Promise<void>;
  signIn: typeof signIn;
  signInBackup: ReturnType<typeof vi.fn>;
}> {
  const listeners = new Set<(s: BridgeSessionState) => void>();
  const spy = vi.fn(signIn);
  const backupSpy = vi.fn(engines?.signInBackup ?? (() => Promise.resolve({ ok: true })));
  const stub = {
    auth: authStub(auth),
    bridgeSession: {
      state: () => Promise.resolve(initial),
      onChanged: (l: (s: BridgeSessionState) => void) => {
        listeners.add(l);
        return () => listeners.delete(l);
      },
      signIn: spy,
      // `RELEASE-0112-01` — each engine's session; absent, a bridge too old to know them (rejects).
      ...(engines !== undefined
        ? {
            engines: () => Promise.resolve(engines.sessions),
            onEnginesChanged: () => () => undefined,
            signInBackup: backupSpy,
          }
        : {}),
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
    signInBackup: backupSpy,
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

  it('🔴 R-082 — one sign-in look: the brand and the version; Enter in EITHER field signs in; the password has a show control', async () => {
    const { signIn } = await mount({ state: 'needs-admin' }, ADMIN);
    await act(async () => {
      openButton()?.click();
    });
    const dialog = openDialog();
    expect(dialog?.querySelector('[data-signin-brand]')?.textContent?.trim()).toBe('CG Control');
    expect(dialog?.querySelector('[data-app-version]')?.textContent).toMatch(
      /^Version \d+\.\d+\.\d+/,
    );
    const password = dialog?.querySelector<HTMLInputElement>('#cg-bridge-signin-pass');
    const account = dialog?.querySelector<HTMLInputElement>('#cg-bridge-signin-user');
    if (password === null || password === undefined || account === null || account === undefined)
      throw new Error('no fields');
    expect(
      dialog?.querySelector('button[aria-label="Show password"]'),
      'the password has no show control',
    ).not.toBeNull();
    await type(password, PASSWORD);
    // Enter from the ACCOUNT field — it used to submit from the password alone.
    await act(async () => {
      account.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(signIn).toHaveBeenCalledWith({ username: 'cg-admin', password: PASSWORD });
  });

  it('A4 — a `cg_not_licensed` refusal shows the Playout’s own message, and marks no field', async () => {
    const message = 'لایسنسِ Playout منقضی شده است.';
    await mount({ state: 'needs-admin' }, ADMIN, () =>
      Promise.resolve({ ok: false, failure: 'cg_not_licensed', message }),
    );
    await act(async () => {
      openButton()?.click();
    });
    const password = openDialog()?.querySelector<HTMLInputElement>('#cg-bridge-signin-pass');
    if (password === null || password === undefined) throw new Error('no password field');
    await type(password, PASSWORD);
    await press('Sign in');
    expect(openDialog()?.textContent).toContain(message);
    expect(password.getAttribute('aria-invalid')).not.toBe('true');
  });
});

/**
 * 🔴 `CENTRAL-BRIDGE-01-A` A2 (Playout `2.9.2` §2) — **REFUSED BEFORE USE: THE PLAYOUT'S REASON, ON
 * EVERY CONSOLE.** The bridge keeps its token and asks again every minute, so nothing is lost; the
 * line says why, in the Playout's words, isolated.
 */
describe('CENTRAL-BRIDGE-01-A A2 — the bridge’s refused renewal', () => {
  const message = 'لایسنسِ این Playout شاملِ CG Control نیست.';

  it('🔴 shows the Playout’s reason after "CG Bridge:", in its own isolate — on an operator’s console too', async () => {
    await mount({ state: 'refused', message }, OPERATOR);
    expect(banner()?.getAttribute('data-bridge-session-state')).toBe('refused');
    expect(banner()?.textContent).toBe(`CG Bridge: ${message}`);
    expect(banner()?.querySelector('bdi')?.textContent).toBe(message);
    expect(banner()?.textContent).not.toContain(BRIDGE_NEEDS_ADMIN_LINE);
    expect(openButton()).toBeNull();
  });

  it('a station admin keeps the sign-in (an account that lost its access is fixed by signing in as another) — CONTROL: the line clears when the renewal lands', async () => {
    const { push } = await mount({ state: 'refused', message }, ADMIN);
    expect(openButton()).not.toBeNull();
    await push({ state: 'signed-in', name: 'cg-admin' });
    expect(banner()).toBeNull();
  });
});

/**
 * 🔴 `RELEASE-0112-01` (`R-085`) and delta C3 — **«Sign in CG Bridge…» NAMES EACH ENGINE.** The dialog
 * lists `Primary engine` and `Backup engine`, each with its address and its state in words; a station
 * admin chooses one and signs it in with THAT engine's password; the one line says where each password
 * is; the account offered follows the chosen engine's version (`cg-bridge` from `2.9.4`).
 */
describe('RELEASE-0112-01 — one sign-in per engine', () => {
  const line = (
    engine: 'primary' | 'backup',
    state: EngineLine['state'],
    version: string | null = '2.9.2',
  ): EngineLine => ({
    engine,
    address: engine === 'primary' ? 'http://192.0.2.10:8080' : 'http://192.0.2.20:8080',
    state,
    ...(state === 'signed-in' ? { name: 'cg-admin' } : {}),
    version,
  });
  const pair = (primary: EngineLine, backup: EngineLine): EngineSessions => ({ primary, backup });
  const rows = (): string[] =>
    [...(openDialog()?.querySelectorAll('[data-engine-row]') ?? [])].map(
      (r) => r.textContent ?? '',
    );
  const account = (): HTMLInputElement | null =>
    openDialog()?.querySelector<HTMLInputElement>('#cg-bridge-signin-user') ?? null;
  async function chooseTab(name: string): Promise<void> {
    const tab = [...(openDialog()?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? [])].find(
      (t) => t.textContent?.includes(name) === true,
    );
    expect(tab, `no ${name} tab`).toBeDefined();
    await act(async () => {
      tab?.click();
    });
  }

  it('🔴 lists both engines with their addresses and states; the backup is signed in with ITS OWN password, through its own channel — the primary’s sign-in untouched', async () => {
    const { signIn, signInBackup } = await mount(
      { state: 'signed-in', name: 'cg-admin' },
      ADMIN,
      undefined,
      { sessions: pair(line('primary', 'signed-in'), line('backup', 'needs-admin')) },
    );
    // The banner shows for the backup alone, and names it.
    expect(banner()?.textContent).toContain(`${BRIDGE_NEEDS_ADMIN_LINE} on the backup engine`);
    await act(async () => {
      openButton()?.click();
    });
    expect(rows()).toEqual([
      'Primary enginehttp://192.0.2.10:8080Signed in as cg-admin.',
      'Backup enginehttp://192.0.2.20:8080Needs a station admin to sign in.',
    ]);
    // The one line: where each engine's password is read — the Playout team's own sentence, in its `<bdi>`.
    const where = openDialog()?.querySelector('[data-password-where]');
    expect(where?.textContent).toContain("Each engine's cg-admin password:");
    expect(where?.querySelector('bdi')?.textContent).toBe(ENGINE_PASSWORD_WHERE);
    // It opened on the engine that needs a sign-in.
    const password = openDialog()?.querySelector<HTMLInputElement>('#cg-bridge-signin-pass');
    if (password === null || password === undefined) throw new Error('no password field');
    await type(password, 'the-backup-password');
    await press('Sign in');
    expect(signInBackup).toHaveBeenCalledWith({
      username: 'cg-admin',
      password: 'the-backup-password',
    });
    expect(signIn).not.toHaveBeenCalled();
  });

  it('a refusal names the engine that refused', async () => {
    await mount({ state: 'needs-admin' }, ADMIN, undefined, {
      sessions: pair(line('primary', 'needs-admin'), line('backup', 'needs-admin')),
      signInBackup: () => Promise.resolve({ ok: false, failure: 'invalid_credentials' }),
    });
    await act(async () => {
      openButton()?.click();
    });
    await chooseTab('Backup engine');
    const password = openDialog()?.querySelector<HTMLInputElement>('#cg-bridge-signin-pass');
    if (password === null || password === undefined) throw new Error('no password field');
    await type(password, 'wrong');
    await press('Sign in');
    expect(openDialog()?.textContent).toContain(
      'Backup engine: The username or password is wrong.',
    );
  });

  it('🔴 C3 — the account offered is cg-bridge for a 2.9.4 engine, cg-admin for 2.9.3 — and an account the admin types is kept', async () => {
    await mount({ state: 'needs-admin' }, ADMIN, undefined, {
      sessions: pair(
        line('primary', 'needs-admin', '2.9.3'),
        line('backup', 'needs-admin', '2.9.4'),
      ),
    });
    await act(async () => {
      openButton()?.click();
    });
    expect(account()?.value, 'the primary at 2.9.3').toBe('cg-admin');
    await chooseTab('Backup engine');
    expect(account()?.value, 'the backup at 2.9.4').toBe('cg-bridge');
    // The line names the cg-bridge account when that is the account offered.
    expect(openDialog()?.querySelector('[data-password-where]')?.textContent).toContain(
      "Each engine's cg-bridge password:",
    );
    // Typed, it stays — choosing another engine does not overwrite it.
    const input = account();
    if (input === null) throw new Error('no account field');
    await type(input, 'ops-bridge');
    await chooseTab('Primary engine');
    expect(account()?.value).toBe('ops-bridge');
  });

  it('a 2.9.2 engine offers cg-admin (it has no cg-bridge account)', async () => {
    await mount({ state: 'needs-admin' }, ADMIN, undefined, {
      sessions: pair(line('primary', 'needs-admin', '2.9.2'), line('backup', 'signed-in', '2.9.2')),
    });
    await act(async () => {
      openButton()?.click();
    });
    expect(account()?.value).toBe('cg-admin');
  });
});
