// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ConnectionCheckResult } from '@cg/shared-ipc';
import { SignInOverlay } from '../src/renderer/features/auth/SignInOverlay.js';
import { signInMessage } from '../src/renderer/features/auth/signInMessages.js';
import { PlayoutSignInError } from '../src/platform/playoutSession.js';
import { buttonClass } from '../src/renderer/ui/Button.js';
import type { AuthCapabilities, AuthSessionState } from '../src/shared/runtime-bridge.js';
import { fillBridgeStub, setupStub } from './support/authStub.js';

/**
 * 🔴 `R-066` acceptance 1 — **WHEN the bridge advertises `auth: 'playout'` THEN the console
 * shows a sign-in (shared primitives, no raw controls) over the live stack; PANIC and every
 * intent are refused underneath until signed in.**
 *
 * 🔴 `DELTA-MULTI-CHANNEL-01-B` — and, since the owner's run of 2026-09-26 with the Playout down:
 *
 *   B2 — the sign-in is OFFERED ONLY WHEN IT CAN WORK: the connection check is on the gate, the
 *        fields and the button are enabled only while it says a sign-in can work, and while it
 *        does not ONE line says why, in the check's words. A Playout that stops answering is said
 *        by the check, under the address; only a wrong username or password marks a field.
 *   B3 — ONE INTERFACE LANGUAGE: every word of ours is English; Persian appears only in names.
 *
 * ── WHAT THIS FILE ASSERTS, AND WHAT IT DELIBERATELY DOES NOT ───────────────
 *
 * It asserts what the SURFACE SAYS, over the real lifecycle, on ONE mounted instance. A spec
 * that mounted a fresh component per state would be testing a constructor: every transition
 * this surface actually makes happens on a component already on screen, holding a password the
 * operator typed, and that is where the defects live.
 *
 * ⚠ It does NOT assert that intents are refused. That is the BRIDGE's job, pinned route by route
 * in `tools/caspar-bridge/tests/auth-gate.integration.test.ts`. And it does NOT measure geometry:
 * jsdom has no layout (golden rule 12(c)).
 */

// React's own act() gate — without it every `act` here warns and the flush is not guaranteed.
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

const SIGN_IN_URL = 'http://127.0.0.1:8080/api/cg/auth/token';
const CAPS: AuthCapabilities = {
  mode: 'playout',
  signInUrl: SIGN_IN_URL,
  refreshUrl: 'http://127.0.0.1:8080/api/cg/auth/refresh',
  contractVersion: '1.1',
  setupPhase: null,
};

const line = (
  id: 'api' | 'cors' | 'amcp',
  status: 'pass' | 'fail' | 'skip',
  text: string,
): ConnectionCheckResult['lines'][number] => ({ id, status, text });

/** The Playout answering, and taking sign-in from this console: a sign-in can work. */
const PLAYOUT_UP: ConnectionCheckResult = {
  lines: [
    line('amcp', 'pass', 'CasparCG on 127.0.0.1 answered VERSION: 2.3.2.'),
    line('api', 'pass', 'The Playout answers and publishes 1 signing key.'),
    line('cors', 'pass', 'The Playout accepts sign-in from this console.'),
  ],
  localAddress: '127.0.0.1',
};
/** The Playout down: its API does not answer, and CORS is not checked. */
const PLAYOUT_DOWN: ConnectionCheckResult = {
  lines: [
    line('amcp', 'fail', '127.0.0.1 refused the connection on port 5250.'),
    line('api', 'fail', 'No answer from 127.0.0.1 on port 8080.'),
    line('cors', 'skip', 'Sign-in from this console: not checked — the Playout does not answer.'),
  ],
  localAddress: '127.0.0.1',
};

type Listener = (state: AuthSessionState) => void;

interface Harness {
  readonly el: HTMLElement;
  /** Push a new auth state, as the bridge would. */
  push(next: AuthSessionState): Promise<void>;
  /** Every `signIn` call this surface made, in order. */
  readonly calls: { username: string; password: string }[];
  /** What the next `signIn` will do. Default: resolve. */
  setSignInResult(result: Error | null): void;
  /** What the next connection check answers. */
  setCheck(result: ConnectionCheckResult): void;
  readonly checks: ReturnType<typeof vi.fn>;
  type(selector: string, value: string): Promise<void>;
  click(selector: string): Promise<void>;
  clickButton(label: RegExp): Promise<void>;
  text(): string;
  /** `B-320` — every `forgetStation` call, and every restart the gate asked for. */
  readonly forgets: ReturnType<typeof vi.fn>;
  readonly reloads: ReturnType<typeof vi.fn>;
}

/** `B-320` — the desktop door: CG Control (Set up again offered) or a browser (none). */
interface Door {
  readonly insideCgControl?: boolean;
  /** What `forgetStation` answers. Default: forgotten. */
  readonly forget?: () => boolean;
}

async function flush(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });
}

async function mount(
  initial: AuthSessionState,
  check: ConnectionCheckResult = PLAYOUT_UP,
  door: Door = {},
): Promise<Harness> {
  const listeners = new Set<Listener>();
  let state = initial;
  let checkResult = check;
  const calls: { username: string; password: string }[] = [];
  let signInResult: Error | null = null;
  const checks = vi.fn(() => Promise.resolve(checkResult));
  const forgets = vi.fn(door.forget ?? (() => true));
  const reloads = vi.fn();

  const stub = fillBridgeStub({
    auth: {
      capabilities: () => (initial.kind === 'off' ? null : CAPS),
      onCapabilitiesChanged: () => () => undefined,
      state: () => state,
      onStateChanged: (l: Listener) => {
        listeners.add(l);
        return () => listeners.delete(l);
      },
      signIn: (username: string, password: string) => {
        calls.push({ username, password });
        return signInResult === null ? Promise.resolve() : Promise.reject(signInResult);
      },
      signOut: () => Promise.resolve(),
    },
    setup: {
      ...setupStub(),
      check: checks,
      canSetPlayoutAddress: () => door.insideCgControl === true,
      forgetStation: forgets,
    },
  });
  (window as unknown as { cg: typeof stub }).cg = stub;

  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const r = root;
  await act(async () => {
    r.render(createElement(StrictMode, null, createElement(SignInOverlay, { reload: reloads })));
  });
  await flush();

  const el = container;
  const find = (selector: string): HTMLElement => {
    const node = el.querySelector<HTMLElement>(selector);
    if (node === null) throw new Error(`no element for ${selector}`);
    return node;
  };

  return {
    el,
    calls,
    checks,
    forgets,
    reloads,
    setSignInResult: (result) => {
      signInResult = result;
    },
    setCheck: (result) => {
      checkResult = result;
    },
    push: async (next) => {
      await act(async () => {
        state = next;
        for (const l of [...listeners]) l(next);
      });
      await flush();
    },
    type: async (selector, value) => {
      const input = find(selector) as HTMLInputElement;
      await act(async () => {
        // React tracks the last value it set on the node; assigning through the prototype's
        // setter is what makes it see a genuine change rather than swallowing the event.
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          'value',
        )?.set;
        setter?.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
    },
    click: async (selector) => {
      const node = find(selector);
      await act(async () => {
        node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      await flush();
    },
    clickButton: async (label) => {
      const node = [...el.querySelectorAll('button')].find((b) => label.test(b.textContent ?? ''));
      if (node === undefined) throw new Error(`no button ${String(label)}`);
      await act(async () => {
        node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      await flush();
    },
    text: () => el.textContent ?? '',
  };
}

const SIGNED_OUT: AuthSessionState = { kind: 'signed-out' };
const submitButton = (h: Harness): HTMLButtonElement | null =>
  h.el.querySelector<HTMLButtonElement>('button.cg-gate-submit');
const checkButton = (h: Harness): HTMLButtonElement | undefined =>
  [...h.el.querySelectorAll<HTMLButtonElement>('button')].find((b) =>
    /^Check/.test(b.textContent ?? ''),
  );
const field = (h: Harness, id: string): HTMLInputElement | null =>
  h.el.querySelector<HTMLInputElement>(`#${id}`);
/** The check's lines as the gate shows them. */
const shownLines = (h: Harness): { id: string | null; text: string | null }[] =>
  [...h.el.querySelectorAll('[data-check]')].map((li) => ({
    id: li.getAttribute('data-check'),
    text: li.textContent,
  }));

async function fill(h: Harness): Promise<void> {
  await h.type('#cg-signin-user', 'cg-op1');
  await h.type('#cg-signin-pass', 'test-only-not-a-secret');
}

describe('R-066 §1 — the sign-in appears when the bridge says so, and not otherwise', () => {
  it('🔴 auth OFF renders NOTHING — byte-identical to a console without this change', async () => {
    const h = await mount({ kind: 'off' });
    expect(h.el.innerHTML, 'a station that does not authenticate must see no sign-in').toBe('');
  });

  it('UNKNOWN renders nothing either — an unanswered handshake is not "you are signed out"', async () => {
    const h = await mount({ kind: 'unknown' });
    expect(h.el.innerHTML).toBe('');
  });

  it('🔴 SIGNED OUT renders the gate — a dialog, over everything, with no way past it', async () => {
    const h = await mount(SIGNED_OUT);
    const dialog = h.el.querySelector('[role="dialog"]');
    expect(
      dialog,
      'the gate must be a dialog so assistive tech announces it as one',
    ).not.toBeNull();
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    // Three controls and no way past: CHECK (B2), the password's show control (`R-082`) and SIGN IN.
    // A ✕ or a Cancel would be a way out. Read by accessible name: the show control is an icon.
    // (This is a browser. Inside CG Control a fourth, `Set up again`, leads back to Set up — `B-320`.)
    expect(
      [...h.el.querySelectorAll('button')].map(
        (b) => b.getAttribute('aria-label') ?? b.textContent,
      ),
    ).toEqual(['Check', 'Show password', 'Sign in']);
  });

  it('SIGNED IN renders nothing — the same instance, after a real transition', async () => {
    const h = await mount(SIGNED_OUT);
    expect(h.el.querySelector('[role="dialog"]')).not.toBeNull();
    await h.push({
      kind: 'signed-in',
      principal: {
        name: 'علی رضایی',
        sub: 'u-1042',
        roles: ['operator'],
        channels: [],
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
        nameTruncated: false,
      },
      permittedChannels: [1],
    });
    expect(h.el.innerHTML, 'the gate must lift on the same instance, with no remount').toBe('');
  });
});

describe('DELTA-MULTI-CHANNEL-01-B B3 — one interface language, and the shared primitives', () => {
  it('🔴 every word of ours is English — the card is not RTL, and no Arabic-script character is ours', async () => {
    const h = await mount(SIGNED_OUT);
    const card = h.el.querySelector('[role="dialog"] > div');
    expect(card?.getAttribute('dir'), 'the card still declares a Persian direction').toBeNull();
    expect(h.text()).toContain('Sign in');
    /*
      🔴 `R-082` — pinned as an ABSENCE, the direction it regresses in: the gate's explanatory line
      ("The broadcast continues. Until you sign in, this console sends nothing.") went with the one
      sign-in look — an operator surface carries no explanatory prose. The product name and the
      version are what the card says about itself.
    */
    expect(h.text()).not.toContain('The broadcast continues');
    expect(h.text()).not.toContain('this console sends nothing');
    expect(h.el.querySelector('[data-signin-brand]')?.textContent?.trim()).toBe('CG Control');
    expect(h.el.querySelector('[data-app-version]')?.textContent).toMatch(/^Version \d+\.\d+\.\d+/);
    expect(/[؀-ۿ]/.test(h.text()), 'a Persian word of ours is still on the gate').toBe(false);
  });

  it('CONTROL — a NAME from the Playout still renders Persian, isolated, beside the English', async () => {
    const h = await mount(SIGNED_OUT);
    await h.push({ kind: 'expired', name: 'علی رضایی' });
    expect(h.text()).toContain('The session of');
    const bdi = h.el.querySelector('bdi');
    expect(bdi, 'the name is not isolated').not.toBeNull();
    expect(bdi?.textContent).toBe('علی رضایی');
  });

  it('every failure sentence of ours is English, and all eight are different', () => {
    const codes = [
      'invalid_credentials',
      'no_cg_access',
      'account_locked',
      'rate_limited',
      'unreachable',
      'invalid_refresh_token',
      'cg_not_licensed',
      'unexpected',
    ] as const;
    const sentences = codes.map((c) => signInMessage(c));
    for (const s of sentences) expect(/[؀-ۿ]/.test(s), s).toBe(false);
    expect(new Set(sentences).size).toBe(codes.length);
    // The one with a different remedy NAMES THE PLAYOUT.
    expect(signInMessage('unreachable')).toBe('The Playout does not answer.');
  });

  it('🔴 both fields are the SHARED primitive — `.cg-field`, no locally styled input', async () => {
    const h = await mount(SIGNED_OUT);
    for (const id of ['cg-signin-user', 'cg-signin-pass']) {
      const input = field(h, id);
      expect(input?.classList.contains('cg-field'), `${id} is not on the shared skin`).toBe(true);
      expect(input?.getAttribute('style'), `${id} carries a local style`).toBeNull();
    }
    expect(field(h, 'cg-signin-pass')?.type).toBe('password');
  });

  it('the submit is the shared Button wearing a DECLARED class, not an inline treatment', async () => {
    const h = await mount(SIGNED_OUT);
    expect(submitButton(h)?.getAttribute('style')).toBeNull();
  });
});

describe('DELTA-MULTI-CHANNEL-01-B B2 — a sign-in is offered only when it can work', () => {
  it('🔴 the Playout DOWN: the fields and Sign in are disabled, ONE line says why in the check’s words, and Check stays available', async () => {
    const h = await mount(SIGNED_OUT, PLAYOUT_DOWN);
    // The check ran once, by itself, when the gate opened — StrictMode's second mount included.
    expect(h.checks).toHaveBeenCalledTimes(1);
    expect(field(h, 'cg-signin-user')?.disabled).toBe(true);
    expect(field(h, 'cg-signin-pass')?.disabled).toBe(true);
    expect(submitButton(h)?.disabled).toBe(true);
    // ONE line, and it is the check's own: the API line.
    expect(shownLines(h)).toEqual([{ id: 'api', text: 'No answer from 127.0.0.1 on port 8080.' }]);
    expect(checkButton(h)?.disabled).toBe(false);
  });

  it('CONTROL — the Playout UP: the fields and Sign in are enabled once both fields carry something', async () => {
    const h = await mount(SIGNED_OUT, PLAYOUT_UP);
    expect(field(h, 'cg-signin-user')?.disabled).toBe(false);
    expect(field(h, 'cg-signin-pass')?.disabled).toBe(false);
    expect(submitButton(h)?.disabled, 'an empty form must not be submittable').toBe(true);
    await h.type('#cg-signin-user', 'cg-op1');
    expect(submitButton(h)?.disabled, 'a username alone is not a sign-in').toBe(true);
    await h.type('#cg-signin-pass', 'whatever');
    expect(submitButton(h)?.disabled).toBe(false);
  });

  it('pressing Check with the Playout back makes a sign-in possible — no reload, no retyping', async () => {
    const h = await mount(SIGNED_OUT, PLAYOUT_DOWN);
    expect(field(h, 'cg-signin-pass')?.disabled).toBe(true);
    h.setCheck(PLAYOUT_UP);
    await h.clickButton(/^Check$/);
    expect(h.checks).toHaveBeenCalledTimes(2);
    expect(field(h, 'cg-signin-pass')?.disabled).toBe(false);
  });

  it('🔴 a wrong password marks the field, in English; the password is cleared and the username kept', async () => {
    const h = await mount(SIGNED_OUT);
    h.setSignInResult(new PlayoutSignInError('invalid_credentials'));
    await fill(h);
    await h.click('button.cg-gate-submit');
    expect(h.text()).toContain('The username or password is wrong.');
    expect(field(h, 'cg-signin-pass')?.getAttribute('aria-invalid')).toBe('true');
    expect(field(h, 'cg-signin-pass')?.value).toBe('');
    expect(field(h, 'cg-signin-user')?.value).toBe('cg-op1');
  });

  /*
    🔴 `CENTRAL-BRIDGE-01-A` A4 — Playout `2.9.2` refuses a sign-in with `403 cg_not_licensed` and a
    message for the operator. It is shown AS IT IS, in one line, isolated; it is not a password error,
    so no field is marked and nothing typed is cleared.
  */
  it('🔴 A4 — `cg_not_licensed` shows the Playout’s OWN message, isolated and alone on its line; no field is marked, and the form is KEPT', async () => {
    const h = await mount(SIGNED_OUT);
    const message = 'لایسنسِ این Playout شاملِ CG Control نیست.';
    h.setSignInResult(
      new PlayoutSignInError('cg_not_licensed', { status: 403, body: '' }, message),
    );
    await fill(h);
    await h.click('button.cg-gate-submit');
    const line = h.el.querySelector('#cg-signin-error');
    expect(line?.querySelector('bdi')?.textContent, 'the message is not isolated').toBe(message);
    // The Playout's words, and nothing of ours around them.
    expect(line?.textContent).toBe(message);
    expect(field(h, 'cg-signin-pass')?.getAttribute('aria-invalid')).not.toBe('true');
    expect(field(h, 'cg-signin-pass')?.value, 'the form was cleared').toBe(
      'test-only-not-a-secret',
    );
    expect(field(h, 'cg-signin-user')?.value).toBe('cg-op1');
  });

  it('A4 — with no message of its own, this console’s sentence: English, no field marked, the form kept', async () => {
    const h = await mount(SIGNED_OUT);
    h.setSignInResult(new PlayoutSignInError('cg_not_licensed', { status: 403, body: '' }));
    await fill(h);
    await h.click('button.cg-gate-submit');
    expect(h.el.querySelector('#cg-signin-error')?.textContent).toBe(
      signInMessage('cg_not_licensed'),
    );
    expect(field(h, 'cg-signin-pass')?.getAttribute('aria-invalid')).not.toBe('true');
    expect(field(h, 'cg-signin-pass')?.value).toBe('test-only-not-a-secret');
  });

  for (const code of ['no_cg_access', 'account_locked', 'rate_limited'] as const) {
    it(`${code} → its own sentence, and NO field is marked — the password was not what was wrong`, async () => {
      const h = await mount(SIGNED_OUT);
      h.setSignInResult(new PlayoutSignInError(code));
      await fill(h);
      await h.click('button.cg-gate-submit');
      expect(h.text()).toContain(signInMessage(code));
      expect(field(h, 'cg-signin-pass')?.getAttribute('aria-invalid')).not.toBe('true');
    });
  }

  it('🔴 the Playout stops answering between the check and Sign in: the CHECK says so, under the address — no field is marked, no sentence under it', async () => {
    const h = await mount(SIGNED_OUT, PLAYOUT_UP);
    await fill(h);
    h.setSignInResult(new PlayoutSignInError('unreachable'));
    h.setCheck(PLAYOUT_DOWN);
    await h.click('button.cg-gate-submit');
    // The check ran again, and its API line is the one line now shown.
    expect(h.checks).toHaveBeenCalledTimes(2);
    expect(shownLines(h)).toEqual([{ id: 'api', text: 'No answer from 127.0.0.1 on port 8080.' }]);
    expect(field(h, 'cg-signin-pass')?.getAttribute('aria-invalid')).not.toBe('true');
    expect(h.el.querySelector('#cg-signin-error')?.textContent).toBe('');
    expect(h.text()).not.toContain(signInMessage('unreachable'));
    expect(field(h, 'cg-signin-pass')?.disabled).toBe(true);
  });

  it('pressing Sign in hands the typed pair to the bridge verbatim; Enter submits too', async () => {
    const h = await mount(SIGNED_OUT);
    await fill(h);
    await h.click('button.cg-gate-submit');
    expect(h.calls).toEqual([{ username: 'cg-op1', password: 'test-only-not-a-secret' }]);
    await h.type('#cg-signin-pass', 'again');
    await act(async () => {
      field(h, 'cg-signin-pass')?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
      );
    });
    expect(h.calls.length).toBe(2);
  });

  it('an error that is not a PlayoutSignInError falls back without naming a mechanism', async () => {
    const h = await mount(SIGNED_OUT);
    h.setSignInResult(new Error('something else entirely'));
    await fill(h);
    await h.click('button.cg-gate-submit');
    expect(h.text()).toContain(signInMessage('unexpected'));
    expect(h.text()).not.toContain('something else entirely');
  });
});

/**
 * 🔴 `B-320` (`SIGNIN-ESCAPE-01`) — **THE GATE'S WAY BACK TO SET UP.** The owner's console was pointed at
 * his own PC, where a fresh CG Bridge answered with no Playout behind it: the gate opened, its one line
 * locked the fields, and nothing on the card led anywhere — reinstalling kept the record. Inside CG
 * Control the gate now offers the NOT CONNECTED banner's own `Set up again`; in a browser there is no
 * station to forget, and no such control. Nothing else about the gate changes (A2).
 */
const OWNERS_STATE: ConnectionCheckResult = {
  lines: [
    line('amcp', 'fail', '192.168.21.93 refused the connection on port 5250.'),
    line('api', 'fail', '192.168.21.93 answers, but nothing listens on port 8080.'),
    line('cors', 'skip', 'Sign-in from this console: not checked — the Playout does not answer.'),
  ],
  localAddress: '127.0.0.1',
};
const setUpAgain = (h: Harness): HTMLButtonElement | undefined =>
  [...h.el.querySelectorAll<HTMLButtonElement>('button')].find(
    (b) => b.textContent?.trim() === 'Set up again',
  );
const controls = (h: Harness): (string | null)[] =>
  [...h.el.querySelectorAll('button')].map((b) => b.getAttribute('aria-label') ?? b.textContent);

describe('B-320 — the sign-in gate’s way back to Set up', () => {
  it('🔴 the owner’s state, inside CG Control: the fields stay locked, Set up again is offered, and pressing it forgets this console’s station and starts it again — sending nothing', async () => {
    const h = await mount(SIGNED_OUT, OWNERS_STATE, { insideCgControl: true });
    // A2 — the lock on the fields stands: the check still says a sign-in cannot work.
    expect(field(h, 'cg-signin-user')?.disabled).toBe(true);
    expect(field(h, 'cg-signin-pass')?.disabled).toBe(true);
    expect(submitButton(h)?.disabled).toBe(true);
    // …and the way back is not locked with them.
    expect(setUpAgain(h)?.disabled).toBe(false);
    const checked = h.checks.mock.calls.length;

    await h.clickButton(/^Set up again$/);

    expect(h.forgets).toHaveBeenCalledTimes(1);
    expect(h.reloads).toHaveBeenCalledTimes(1);
    // It sends nothing: no check, no sign-in — the record is this console's own.
    expect(h.checks).toHaveBeenCalledTimes(checked);
    expect(h.calls).toEqual([]);
  });

  it('offered whatever the check says — a wrong station that answers reads like the right one', async () => {
    const h = await mount(SIGNED_OUT, PLAYOUT_UP, { insideCgControl: true });
    expect(controls(h)).toEqual(['Check', 'Show password', 'Sign in', 'Set up again']);
  });

  it('is the banner’s own control: the shared Button, `ghost`, no local style — and no prose comes with it', async () => {
    const h = await mount(SIGNED_OUT, OWNERS_STATE, { insideCgControl: true });
    const again = setUpAgain(h);
    expect(again?.className).toBe(buttonClass('ghost'));
    expect(again?.getAttribute('style')).toBeNull();
    // Pinned as an ABSENCE: the card says what it said before, plus the control's own two words.
    const card = h.el.querySelector('[role="dialog"]');
    expect(card?.querySelector('.cg-signin-card__foot')?.textContent).toBe('Sign inSet up again');
  });

  it('a store that will not forget does not restart into the same failure', async () => {
    const h = await mount(SIGNED_OUT, OWNERS_STATE, { insideCgControl: true, forget: () => false });
    await h.clickButton(/^Set up again$/);
    expect(h.forgets).toHaveBeenCalledTimes(1);
    expect(h.reloads).not.toHaveBeenCalled();
  });

  it('A2 — signing in is unchanged beside it: the typed pair goes to the bridge, and nothing is forgotten', async () => {
    const h = await mount(SIGNED_OUT, PLAYOUT_UP, { insideCgControl: true });
    await fill(h);
    await h.click('button.cg-gate-submit');
    expect(h.calls).toEqual([{ username: 'cg-op1', password: 'test-only-not-a-secret' }]);
    expect(h.forgets).not.toHaveBeenCalled();
    expect(h.reloads).not.toHaveBeenCalled();
  });

  it('CONTROL — in a browser there is no station to forget, and no such control', async () => {
    const h = await mount(SIGNED_OUT, OWNERS_STATE);
    expect(setUpAgain(h)).toBeUndefined();
    // The gate itself is there — the absence is the control's, not the gate's.
    expect(submitButton(h)).not.toBeNull();
    expect(h.forgets).not.toHaveBeenCalled();
  });
});

describe('R-066 §1 — a token the BRIDGE refused is said out loud, not swallowed', () => {
  it('🔴 the BRIDGE sentence is shown when no attempt was made here — and marks no field', async () => {
    const h = await mount({ kind: 'signed-out', reason: 'That sign-in is not for this station.' });
    expect(h.text()).toContain('That sign-in is not for this station.');
    expect(field(h, 'cg-signin-pass')?.getAttribute('aria-invalid')).not.toBe('true');
  });

  it('…and a plain signed-out gate shows NO message — the control for it', async () => {
    const h = await mount(SIGNED_OUT);
    expect(h.el.querySelector('#cg-signin-error')?.textContent).toBe('');
  });

  it('THIS attempt beats the carried one — the operator just pressed the button', async () => {
    const h = await mount({ kind: 'signed-out', reason: 'That sign-in has expired.' });
    expect(h.text()).toContain('That sign-in has expired.');
    h.setSignInResult(new PlayoutSignInError('invalid_credentials'));
    await fill(h);
    await h.click('button.cg-gate-submit');
    expect(h.text(), 'a stale sentence answered a question nobody asked').not.toContain(
      'That sign-in has expired.',
    );
    expect(h.text()).toContain(signInMessage('invalid_credentials'));
  });
});

describe('R-066 §1 — an EXPIRED session says whose, and says it here', () => {
  it('🔴 names the operator whose session ended, on the gate they now face', async () => {
    const h = await mount(SIGNED_OUT);
    await h.push({ kind: 'expired', name: 'علی رضایی' });
    expect(
      h.el.querySelector('[role="dialog"]'),
      'an expired session is still gated',
    ).not.toBeNull();
    expect(h.text()).toContain('علی رضایی');
    expect(h.text()).toContain('has ended');
  });

  it('…and a SIGNED-OUT gate does NOT name anybody — the control for the spec above', async () => {
    const h = await mount(SIGNED_OUT);
    expect(h.text()).not.toContain('has ended');
  });
});
