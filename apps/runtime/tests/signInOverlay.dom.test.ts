// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { SignInOverlay } from '../src/renderer/features/auth/SignInOverlay.js';
import { signInMessage } from '../src/renderer/features/auth/signInMessages.js';
import { PlayoutSignInError } from '../src/platform/playoutSession.js';
import type { AuthSessionState } from '../src/shared/runtime-bridge.js';

/**
 * 🔴 `R-066` acceptance 1 — **WHEN the bridge advertises `auth: 'playout'` THEN the console
 * shows a sign-in (Persian/RTL, shared primitives, no raw controls) over the live stack; PANIC
 * and every intent are refused underneath until signed in.**
 *
 * ── WHAT THIS FILE ASSERTS, AND WHAT IT DELIBERATELY DOES NOT ───────────────
 *
 * It asserts what the SURFACE SAYS, over the real lifecycle, on ONE mounted instance. A spec
 * that mounted a fresh component per state would be testing a constructor: every transition
 * this surface actually makes — signed-out → signing in → refused → signed in → expired —
 * happens on a component that is already on screen, holding a password the operator typed, and
 * that is where the defects live.
 *
 * ⚠ It does NOT assert that intents are refused. That is the BRIDGE's job and it is pinned in
 * `tools/caspar-bridge/tests/auth-gate.integration.test.ts`, route by route, over the whole
 * table. This overlay is not a second gate — it exists so the console does not PRESENT
 * controls as live when they are not, which is the half a bridge cannot do.
 *
 * ⚠ It does NOT measure geometry. jsdom has no layout (golden rule 12(c)): a box assertion
 * here would pass against a surface of any shape. Placement is the e2e's to measure.
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
});

type Listener = (state: AuthSessionState) => void;

interface Harness {
  readonly el: HTMLElement;
  /** Push a new auth state, as the bridge would. */
  push(next: AuthSessionState): Promise<void>;
  /** Every `signIn` call this surface made, in order. */
  readonly calls: { username: string; password: string }[];
  /** What the next `signIn` will do. Default: resolve. */
  setSignInResult(result: Error | null): void;
  type(selector: string, value: string): Promise<void>;
  click(selector: string): Promise<void>;
  text(): string;
}

async function mount(initial: AuthSessionState): Promise<Harness> {
  const listeners = new Set<Listener>();
  let state = initial;
  const calls: { username: string; password: string }[] = [];
  let signInResult: Error | null = null;

  const stub = {
    auth: {
      state: () => state,
      onStateChanged: (l: Listener) => {
        listeners.add(l);
        return () => listeners.delete(l);
      },
      signIn: (username: string, password: string) => {
        calls.push({ username, password });
        return signInResult === null ? Promise.resolve() : Promise.reject(signInResult);
      },
    },
  };
  (window as unknown as { cg: typeof stub }).cg = stub;

  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const r = root;
  await act(async () => {
    r.render(createElement(StrictMode, null, createElement(SignInOverlay)));
  });

  const el = container;
  const find = (selector: string): HTMLElement => {
    const node = el.querySelector<HTMLElement>(selector);
    if (node === null) throw new Error(`no element for ${selector}`);
    return node;
  };

  return {
    el,
    calls,
    setSignInResult: (result) => {
      signInResult = result;
    },
    push: async (next) => {
      await act(async () => {
        state = next;
        for (const l of [...listeners]) l(next);
      });
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
    },
    text: () => el.textContent ?? '',
  };
}

const SIGNED_OUT: AuthSessionState = { kind: 'signed-out' };

describe('R-066 §1 — the sign-in appears when the bridge says so, and not otherwise', () => {
  it('🔴 auth OFF renders NOTHING — byte-identical to a console without this change', async () => {
    const h = await mount({ kind: 'off' });
    expect(h.el.innerHTML, 'a station that does not authenticate must see no sign-in').toBe('');
  });

  it('UNKNOWN renders nothing either — an unanswered handshake is not "you are signed out"', async () => {
    /*
      The connect window, before `bridge.capabilities` lands. A sign-in that flashed here on
      every reload would be a gate reporting its own latency, and `B-153`'s banner refuses the
      mirror-image mistake one surface over: `null` skew renders nothing because an unanswered
      handshake is not evidence.
    */
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
    // ONE control. A ✕ or a Cancel would be a way past a gate, which is not a gate.
    expect(h.el.querySelectorAll('button').length).toBe(1);
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

describe('R-066 §1 — Persian, RTL, and the shared primitives', () => {
  it('🔴 the card is RTL and its copy is Persian', async () => {
    const h = await mount(SIGNED_OUT);
    const card = h.el.querySelector('[role="dialog"] > div');
    expect(card?.getAttribute('dir'), 'a Persian card must declare its own direction').toBe('rtl');
    // The heading and the state sentence, by their meaning rather than by a class.
    expect(h.text()).toContain('ورود به کنسول');
    expect(h.text()).toContain('پخش ادامه دارد');
    /*
      ⚠ The POSITIVE CONTROL for "this is really Persian": at least one Arabic-script codepoint
      is present. A spec that only compared strings would pass against a file whose Persian had
      been mangled into mojibake by a bad round trip — which `P-025` records as a real event in
      this tree.
    */
    expect(/[؀-ۿ]/.test(h.text())).toBe(true);
  });

  it('🔴 both fields are the SHARED primitive — `.cg-field`, no locally styled input', async () => {
    /*
      `R-066` asks for "shared primitives, no raw controls". `cg/raw-control` refuses a raw
      `<input>` outside `renderer/ui/` at lint time; this asserts the PROPERTY the rule exists
      to protect — that the console's skin is actually on the control — which lint cannot see
      (a local wrapper would satisfy the rule and fail this).
    */
    const h = await mount(SIGNED_OUT);
    const inputs = [...h.el.querySelectorAll('input')];
    expect(inputs.length).toBe(2);
    for (const input of inputs) {
      expect(input.classList.contains('cg-field'), `${input.id} is not on the shared skin`).toBe(
        true,
      );
      expect(input.getAttribute('style'), `${input.id} carries a local style`).toBeNull();
    }
    expect(inputs[0]?.type).toBe('text');
    expect(inputs[1]?.type).toBe('password');
  });

  it('the submit is the shared Button wearing a DECLARED class, not an inline treatment', async () => {
    const h = await mount(SIGNED_OUT);
    const button = h.el.querySelector('button');
    expect(button?.className).toContain('cg-gate-submit');
    expect(button?.getAttribute('style')).toBeNull();
  });
});

describe('R-066 §1 — the whole lifecycle, on one instance', () => {
  it('🔴 the action is REFUSED until both fields carry something', async () => {
    const h = await mount(SIGNED_OUT);
    const button = h.el.querySelector('button');
    expect(button?.disabled, 'an empty form must not be submittable').toBe(true);

    await h.type('#cg-signin-user', 'cg-op1');
    expect(h.el.querySelector('button')?.disabled, 'a username alone is not a sign-in').toBe(true);

    await h.type('#cg-signin-pass', 'whatever');
    expect(h.el.querySelector('button')?.disabled).toBe(false);
  });

  it('🔴 pressing it hands the typed pair to the bridge, verbatim', async () => {
    const h = await mount(SIGNED_OUT);
    await h.type('#cg-signin-user', 'cg-op1');
    await h.type('#cg-signin-pass', 'test-only-not-a-secret');
    await h.click('button');
    expect(h.calls).toEqual([{ username: 'cg-op1', password: 'test-only-not-a-secret' }]);
  });

  it('Enter in either field submits, so the operator never has to reach for the mouse', async () => {
    const h = await mount(SIGNED_OUT);
    await h.type('#cg-signin-user', 'cg-op1');
    await h.type('#cg-signin-pass', 'pw');
    const pass = h.el.querySelector<HTMLInputElement>('#cg-signin-pass');
    await act(async () => {
      pass?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(h.calls.length).toBe(1);
  });
});

describe('R-066 §1 — every failure has its own sentence, and it is this console"s', () => {
  /*
    The contract's four credential codes plus the one that is ours. Driven as a TABLE over ONE
    mounted instance per case, because each has to be shown on a surface the operator is
    already looking at — and because a table is how the fifth one stops being forgotten.
  */
  const cases = [
    'invalid_credentials',
    'no_cg_access',
    'account_locked',
    'rate_limited',
    'unreachable',
  ] as const;

  for (const code of cases) {
    it(`${code} → its own sentence, on the same instance, and the password is cleared`, async () => {
      const h = await mount(SIGNED_OUT);
      h.setSignInResult(new PlayoutSignInError(code));
      await h.type('#cg-signin-user', 'cg-op1');
      await h.type('#cg-signin-pass', 'wrong');
      await h.click('button');

      const expected = signInMessage(code);
      expect(typeof expected, 'the sentence table resolved to nothing').toBe('string');
      expect(expected.length, `${code} has no sentence`).toBeGreaterThan(0);
      expect(h.text(), `${code} did not reach the surface`).toContain(expected);

      // The password is cleared so the next attempt starts clean; the username is NOT, because
      // retyping a username the operator already got right is friction with no purpose.
      expect(h.el.querySelector<HTMLInputElement>('#cg-signin-pass')?.value).toBe('');
      expect(h.el.querySelector<HTMLInputElement>('#cg-signin-user')?.value).toBe('cg-op1');
      // …and the field says it is wrong where the operator is already looking.
      expect(h.el.querySelector('#cg-signin-pass')?.getAttribute('aria-invalid')).toBe('true');
    });
  }

  it('the five sentences are all DIFFERENT — a table that collapsed would pass every spec above', async () => {
    /*
      🔴 The control for the table. Each spec above asserts "the surface contains
      `signInMessage(code)`", which is satisfied by a table returning one sentence for
      everything. This is what makes them mean what they read as.
    */
    const sentences = cases.map((c) => signInMessage(c));
    expect(new Set(sentences).size).toBe(cases.length);
  });

  it('the UNREACHABLE sentence NAMES THE PLAYOUT — it is the one with a different remedy', async () => {
    expect(signInMessage('unreachable')).toContain('پلی‌اوت');
  });

  it('an error that is not a PlayoutSignInError falls back without naming a mechanism', async () => {
    const h = await mount(SIGNED_OUT);
    h.setSignInResult(new Error('something else entirely'));
    await h.type('#cg-signin-user', 'u');
    await h.type('#cg-signin-pass', 'p');
    await h.click('button');
    expect(h.text()).toContain(signInMessage('unexpected'));
    // 🔴 And the raw error NEVER reaches the operator. Naming the wrong mechanism is worse
    // than naming none, because a wrong name gets acted on.
    expect(h.text()).not.toContain('something else entirely');
  });
});

describe('R-066 §1 — a token the BRIDGE refused is said out loud, not swallowed', () => {
  /**
   * 🔴 **THE SILENT FORM.** A review found this and nothing covered it.
   *
   * A token can be refused by the bridge with nobody having pressed anything — on a reload, on
   * a reconnect. The console caught that refusal and threw the sentence away, so on a bridge
   * whose `playout.issuer` carries a typo the operator met a form that did nothing: the
   * credentials are right, the Playout mints a token, the bridge answers "that sign-in is not
   * for this station", and the card comes back blank. Every retry behaves identically.
   */
  it('🔴 the BRIDGE sentence is shown when no attempt was made here', async () => {
    const h = await mount({ kind: 'signed-out', reason: 'That sign-in is not for this station.' });
    expect(h.text()).toContain('That sign-in is not for this station.');
  });

  it('…and a plain signed-out gate shows NO message — the control for it', async () => {
    const h = await mount(SIGNED_OUT);
    expect(h.el.querySelector('#cg-signin-error')?.textContent).toBe('');
  });

  it('THIS attempt beats the carried one — the operator just pressed the button', async () => {
    const h = await mount({ kind: 'signed-out', reason: 'That sign-in has expired.' });
    expect(h.text()).toContain('That sign-in has expired.');

    h.setSignInResult(new PlayoutSignInError('invalid_credentials'));
    await h.type('#cg-signin-user', 'cg-op1');
    await h.type('#cg-signin-pass', 'wrong');
    await h.click('button');

    expect(h.text(), 'a stale sentence answered a question nobody asked').not.toContain(
      'That sign-in has expired.',
    );
    expect(h.text()).toContain(signInMessage('invalid_credentials'));
  });
});

describe('R-066 §1 — an EXPIRED session says whose, and says it here', () => {
  it('🔴 names the operator whose session ended, on the gate they now face', async () => {
    const h = await mount(SIGNED_OUT);
    // The real transition: a console that WAS signed in and lapsed, not a fresh mount.
    await h.push({ kind: 'expired', name: 'علی رضایی' });
    expect(
      h.el.querySelector('[role="dialog"]'),
      'an expired session is still gated',
    ).not.toBeNull();
    expect(h.text()).toContain('علی رضایی');
    expect(h.text()).toContain('به پایان رسیده است');
  });

  it('…and a SIGNED-OUT gate does NOT name anybody — the control for the spec above', async () => {
    const h = await mount(SIGNED_OUT);
    expect(h.text()).not.toContain('به پایان رسیده است');
  });

  it('the name is bidi-ISOLATED, so Persian beside English chrome is placed by us', async () => {
    /*
      Four surfaces learned this separately before it was written down (`B-210`/`B-211`,
      `B-223`, the template header, `B-232`). A Persian name joined into one text node with
      English or neutral characters has its placement decided by the bidi algorithm.
    */
    const h = await mount(SIGNED_OUT);
    await h.push({ kind: 'expired', name: 'علی رضایی' });
    const bdi = h.el.querySelector('bdi');
    expect(bdi, 'the name is not isolated').not.toBeNull();
    expect(bdi?.textContent).toBe('علی رضایی');
  });
});
