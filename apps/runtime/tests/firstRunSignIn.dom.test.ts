// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CatalogueChannel, ConnectionCheckResult } from '@cg/shared-ipc';
import { ChannelStep, FirstRunScreen } from '../src/renderer/features/firstRun/FirstRunScreen.js';
import { signInMessage } from '../src/renderer/features/auth/signInMessages.js';
import { PlayoutSignInError } from '../src/platform/playoutSession.js';
import type { AuthSessionState } from '../src/shared/runtime-bridge.js';
import { authStub, fillBridgeStub, setupStub } from './support/authStub.js';

/**
 * 🔴 `DELTA-MULTI-CHANNEL-01-B` — **FIRST-RUN'S SIGN-IN, WITH THE PLAYOUT DOWN.** The owner,
 * 2026-09-26, on `pnpm dev:station` against a Playout that was off: Check showed no line (B1, the
 * bridge's half, pinned in `auth-gate.integration.test.ts`), the sign-in section was usable, and
 * Sign in turned the Password field red with a Persian "the Playout does not answer".
 *
 *   B2 — the fields and Sign in are enabled only while the check says a sign-in can work, with
 *        ONE line in the check's words while it does not; Check stays available; a Playout that
 *        stops answering is said by the check, under the address; only a wrong username or
 *        password marks a field.
 *   B3 — every word of ours is English; Persian only in names from the Playout.
 */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

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
  vi.restoreAllMocks();
});

const SIGN_IN_URL = 'http://192.168.21.111:8080/api/cg/auth/token';

const line = (
  id: 'api' | 'cors',
  status: 'pass' | 'fail' | 'skip',
  text: string,
): ConnectionCheckResult['lines'][number] => ({ id, status, text });
const PLAYOUT_UP: ConnectionCheckResult = {
  lines: [
    line('api', 'pass', 'The Playout answers and publishes 1 signing key.'),
    line('cors', 'pass', 'The Playout accepts sign-in from this console.'),
  ],
  localAddress: '192.168.21.93',
};
const PLAYOUT_DOWN: ConnectionCheckResult = {
  lines: [
    line('api', 'fail', 'No answer from 192.168.21.111 on port 8080.'),
    line('cors', 'skip', 'Sign-in from this console: not checked — the Playout does not answer.'),
  ],
  localAddress: '192.168.21.93',
};

async function flush(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });
}

interface Harness {
  readonly el: HTMLElement;
  readonly checks: ReturnType<typeof vi.fn>;
  setCheck(result: ConnectionCheckResult): void;
  setSignInResult(result: Error | null): void;
  type(selector: string, value: string): Promise<void>;
  press(label: RegExp): Promise<void>;
}

async function mount(check: ConnectionCheckResult): Promise<Harness> {
  let checkResult = check;
  let signInResult: Error | null = null;
  const checks = vi.fn(() => Promise.resolve(checkResult));
  const signedOut: AuthSessionState = { kind: 'signed-out' };
  const stub = fillBridgeStub({
    auth: {
      ...authStub(signedOut),
      signIn: () => (signInResult === null ? Promise.resolve() : Promise.reject(signInResult)),
    },
    setup: { ...setupStub(), check: checks },
  });
  (window as unknown as { cg: typeof stub }).cg = stub;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const r = root;
  await act(async () => {
    r.render(
      createElement(
        StrictMode,
        null,
        createElement(FirstRunScreen, { phase: 'channel', signInUrl: SIGN_IN_URL }),
      ),
    );
  });
  await flush();
  const el = container;
  return {
    el,
    checks,
    setCheck: (result) => {
      checkResult = result;
    },
    setSignInResult: (result) => {
      signInResult = result;
    },
    type: async (selector, value) => {
      const input = el.querySelector<HTMLInputElement>(selector);
      if (input === null) throw new Error(`no ${selector}`);
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          'value',
        )?.set;
        setter?.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
    },
    press: async (label) => {
      const button = [...el.querySelectorAll('button')].find((b) =>
        label.test(b.textContent ?? ''),
      );
      if (button === undefined) throw new Error(`no button ${String(label)}`);
      await act(async () => {
        button.click();
      });
      await flush();
    },
  };
}

const input = (h: Harness, id: string): HTMLInputElement | null =>
  h.el.querySelector<HTMLInputElement>(`#${id}`);
const signInButton = (h: Harness): HTMLButtonElement | undefined =>
  [...h.el.querySelectorAll<HTMLButtonElement>('button')].find(
    (b) => b.textContent === 'Sign in' || b.textContent === 'Signing in…',
  );
const blocker = (h: Harness): string | null =>
  h.el.querySelector('[data-sign-in-blocker] [data-check]')?.textContent ?? null;

async function fill(h: Harness): Promise<void> {
  await h.type('#cg-first-run-user', 'cg-admin');
  await h.type('#cg-first-run-pass', 'test-only-not-a-secret');
}

describe('DELTA-MULTI-CHANNEL-01-B B2 — first-run offers a sign-in only when it can work', () => {
  it('🔴 the Playout DOWN: the check runs once on its own, the fields and Sign in are disabled, ONE line says why in the check’s words, and Check stays available', async () => {
    const h = await mount(PLAYOUT_DOWN);
    expect(h.checks).toHaveBeenCalledTimes(1);
    expect(input(h, 'cg-first-run-user')?.disabled).toBe(true);
    expect(input(h, 'cg-first-run-pass')?.disabled).toBe(true);
    expect(signInButton(h)?.disabled).toBe(true);
    expect(blocker(h)).toBe('No answer from 192.168.21.111 on port 8080.');
    const check = [...h.el.querySelectorAll<HTMLButtonElement>('button')].find(
      (b) => b.textContent === 'Check',
    );
    expect(check?.disabled).toBe(false);
  });

  it('CONTROL — the Playout UP: enabled, no line in the way; and a wrong password marks the field, in English', async () => {
    const h = await mount(PLAYOUT_UP);
    expect(input(h, 'cg-first-run-pass')?.disabled).toBe(false);
    expect(blocker(h)).toBeNull();
    h.setSignInResult(new PlayoutSignInError('invalid_credentials'));
    await fill(h);
    await h.press(/^Sign in$/);
    expect(input(h, 'cg-first-run-pass')?.getAttribute('aria-invalid')).toBe('true');
    expect(h.el.textContent).toContain('The username or password is wrong.');
  });

  it('🔴 the Playout stops answering between the check and Sign in: the check runs again and says so — the field is NOT marked, and no sentence sits under it', async () => {
    const h = await mount(PLAYOUT_UP);
    await fill(h);
    h.setSignInResult(new PlayoutSignInError('unreachable'));
    h.setCheck(PLAYOUT_DOWN);
    await h.press(/^Sign in$/);
    expect(h.checks).toHaveBeenCalledTimes(2);
    expect(blocker(h)).toBe('No answer from 192.168.21.111 on port 8080.');
    expect(input(h, 'cg-first-run-pass')?.getAttribute('aria-invalid')).not.toBe('true');
    expect(input(h, 'cg-first-run-pass')?.disabled).toBe(true);
    // Neither the old Persian line nor its English successor sits under the field.
    expect(h.el.textContent).not.toContain(signInMessage('unreachable'));
    expect(h.el.textContent).not.toContain('پلی‌اوت پاسخ نمی‌دهد');
  });

  it('an account without access says so, in English, and marks no field', async () => {
    const h = await mount(PLAYOUT_UP);
    h.setSignInResult(new PlayoutSignInError('no_cg_access'));
    await fill(h);
    await h.press(/^Sign in$/);
    expect(h.el.textContent).toContain('This account has no access to CG Control.');
    expect(input(h, 'cg-first-run-pass')?.getAttribute('aria-invalid')).not.toBe('true');
  });
});

describe('DELTA-MULTI-CHANNEL-01-B B3 — one interface language', () => {
  it('🔴 the "does not answer" line renders English — no Arabic-script character of ours on the sign-in', async () => {
    const h = await mount(PLAYOUT_DOWN);
    expect(blocker(h)).toBe('No answer from 192.168.21.111 on port 8080.');
    expect(/[؀-ۿ]/.test(h.el.textContent ?? ''), 'a Persian word of ours is on first-run').toBe(
      false,
    );
  });

  it('CONTROL — a channel NAME from the Playout still renders Persian', async () => {
    const ROWS: CatalogueChannel[] = [
      { id: 'apasai', name: 'آپاسای', casparHost: '192.168.21.111', casparChannel: 1 },
    ];
    (window as unknown as { cg: unknown }).cg = fillBridgeStub({
      setup: {
        ...setupStub(),
        catalogue: () => Promise.resolve({ rows: ROWS }),
        routeAddress: () => Promise.resolve({ address: '192.168.21.93' }),
      },
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    const r = root;
    await act(async () => {
      r.render(
        createElement(ChannelStep, {
          playoutHost: '192.168.21.111',
          onDone: () => undefined,
          prepare: () => Promise.resolve(null),
          declare: () => Promise.resolve(null),
        }),
      );
    });
    await flush();
    const chip = container.querySelector('button[data-channel="1"]');
    expect(chip?.textContent).toContain('آپاسای');
    expect(chip?.querySelector('bdi')?.textContent).toBe('آپاسای');
  });
});
