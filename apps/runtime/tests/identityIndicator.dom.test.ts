// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import {
  IdentityIndicator,
  formatEndTime,
} from '../src/renderer/features/status/IdentityIndicator.js';
import { colors } from '../src/renderer/theme.js';
import type { AuthSessionState } from '../src/shared/runtime-bridge.js';

/**
 * 🔴 `R-066` acceptance — **"…and the link indicator names the state in the operator's
 * words"**.
 *
 * ── WHY THE SUBJECT IS A SECOND PILL AND NOT A STATE OF `LinkIndicator` ─────
 *
 * The clause says "the link indicator", and it is satisfied here by a pill sitting
 * immediately beside it rather than by a fifth state inside it. `LinkIndicator`'s own header
 * forbids the fold, in the words this repo has already paid for twice: _"What it may not do is
 * claim, in the word and the colour that mean 'connected', to be connected to something it
 * does not measure."_ A signed-out console has a perfectly LIVE link — the socket is open, the
 * bridge is answering, `bridge.capabilities` came back — so folding identity into that pill
 * would make one instrument report two axes, which is golden rule 8's shape and is how
 * `● LIVE` came to be read as a claim about the plant. One pill per axis; the state is named
 * in the operator's words in the same row. The last spec in this file pins that separation as
 * a property of the surface rather than as a comment: the pill's `aria-label` is about
 * sign-in, and never about the link.
 *
 * ── WHAT THIS FILE ASSERTS, AND WHAT IT DELIBERATELY DOES NOT ───────────────
 *
 * It asserts what the SURFACE SAYS, over the real lifecycle, on ONE mounted instance. This
 * pill is a long-lived member of the status bar: it is mounted before the bridge answers and
 * it is still mounted when a shift's session lapses hours later. Every transition it makes
 * therefore happens on a component that is already on screen, and a spec that mounted a fresh
 * component per state would be testing a constructor — so every state here is reached by a
 * PUSH from the stub bridge, exactly as `window.cg.auth.onStateChanged` delivers it.
 *
 * ⚠ It does NOT measure geometry. jsdom has no layout (golden rule 12(c)):
 * `getBoundingClientRect()` is all zeros there and a box assertion would pass against a
 * surface of any shape. Placement — that this pill sits beside the link and not under it — is
 * the e2e's to measure. A `getComputedStyle` COLOUR is real in jsdom (`cssstyle` resolves the
 * cascade), which is what makes the ink spec at the end of this file legitimate.
 *
 * ⚠ It does NOT re-assert the sign-in gate. `signInOverlay.dom.test.ts` owns that surface;
 * this one owns the sentence the operator reads when the gate is NOT in front of them.
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
  /** Push a new auth state, as the bridge would over `onStateChanged`. */
  push(next: AuthSessionState): Promise<void>;
  /** The pill itself — the one element carrying the shared tag marker. */
  tag(): HTMLElement | null;
  /** The pill's inner, inked span. */
  ink(): HTMLElement | null;
  text(): string;
}

async function mount(initial: AuthSessionState): Promise<Harness> {
  const listeners = new Set<Listener>();
  let state = initial;

  const stub = {
    auth: {
      state: () => state,
      onStateChanged: (l: Listener) => {
        listeners.add(l);
        return () => listeners.delete(l);
      },
    },
  };
  (window as unknown as { cg: typeof stub }).cg = stub;

  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const r = root;
  await act(async () => {
    r.render(createElement(StrictMode, null, createElement(IdentityIndicator)));
  });

  const el = container;

  return {
    el,
    push: async (next) => {
      await act(async () => {
        state = next;
        for (const l of [...listeners]) l(next);
      });
    },
    tag: () => el.querySelector<HTMLElement>('[data-cg-tag]'),
    ink: () => el.querySelector<HTMLElement>('[data-cg-tag] > span'),
    text: () => el.textContent ?? '',
  };
}

/**
 * A distinctive `sub`, chosen so that "it appears nowhere" is a search for something that
 * could not arrive by accident. It is the SAME value `signInOverlay.dom.test.ts` uses, so the
 * two specs are asking about one principal rather than two.
 */
const SUB = 'u-1042';
const NAME = 'علی رضایی';
/** A fixed instant, so the `title` spec is reading a clock derived from a value it chose. */
const EXPIRES_AT = '2026-09-22T18:45:00.000Z';

const SIGNED_IN: AuthSessionState = {
  kind: 'signed-in',
  principal: {
    name: NAME,
    sub: SUB,
    roles: ['operator'],
    channels: [],
    expiresAt: EXPIRES_AT,
    nameTruncated: false,
  },
};
const EXPIRED: AuthSessionState = { kind: 'expired', name: NAME };
const SIGNED_OUT: AuthSessionState = { kind: 'signed-out' };

/**
 * The computed value of a colour token, resolved by the engine rather than spelled as a hex.
 * `B-153`'s banner spec established the idiom: assert TOKEN IDENTITY, never a literal, so a
 * palette move that is deliberate does not read as a regression and a palette move that is
 * accidental still does.
 */
function inkFor(token: string): string {
  const probe = document.createElement('span');
  probe.style.color = token;
  document.body.appendChild(probe);
  const resolved = window.getComputedStyle(probe).color;
  probe.remove();
  return resolved;
}

describe('R-066 — the pill has no verdict until there is one to give', () => {
  it('🔴 auth OFF renders NOTHING — a station that does not authenticate is byte-identical', async () => {
    /*
      The whole promise of `mode: 'off'`: a console at a station with no Playout must look
      exactly as it did yesterday. An identity pill reading "SIGNED IN" — or worse, one reading
      nothing in a box — would be this change leaking into every station that did not ask for
      it.
    */
    const h = await mount({ kind: 'off' });
    expect(h.el.innerHTML, 'an unauthenticated station must see no identity pill').toBe('');

    /*
      🔴 POSITIVE CONTROL for the emptiness above. `innerHTML === ''` is also what a broken
      harness produces — a stub the component never read, a root that never rendered, an import
      that resolved to nothing. Pushing a state that MUST render proves the instrument is live,
      so the empty reading is a fact about `off` and not about this file.
    */
    await h.push(SIGNED_OUT);
    expect(
      h.el.innerHTML.length,
      'the harness renders nothing at all — the spec above is void',
    ).toBeGreaterThan(0);
  });

  it('UNKNOWN renders nothing either — an unanswered handshake has no verdict to give', async () => {
    /*
      The connect window, before `bridge.capabilities` lands. A pill that said "CHECKING…" here
      would be an instrument reporting its own latency, and `B-153`'s banner refuses the
      mirror-image mistake one surface over: `null` skew renders nothing, because an unanswered
      handshake is not evidence. Same control as above, same reason.
    */
    const h = await mount({ kind: 'unknown' });
    expect(h.el.innerHTML).toBe('');
    await h.push(SIGNED_OUT);
    expect(
      h.el.innerHTML.length,
      'the harness renders nothing at all — the spec above is void',
    ).toBeGreaterThan(0);
  });
});

describe('R-066 — the three states name themselves, on ONE instance', () => {
  it('🔴 signed-out → expired → signed-in: each says its own state in the operator’s words', async () => {
    /*
      The real sequence a console lives through, driven on a single mounted pill. Mounting three
      of them would assert that the constructor picks the right branch and would say nothing
      about the surface an operator actually watches change.
    */
    const h = await mount(SIGNED_OUT);
    expect(h.text(), 'a console holding no token must SAY so').toBe('SIGNED OUT');

    await h.push(EXPIRED);
    // An expired session is still an answer to "who is at this console": it says the session
    // ended, whose it was, and what to do — the three things "SIGNED OUT" alone cannot say.
    expect(h.text()).toBe('SESSION EXPIRED — علی رضایی — SIGN IN AGAIN');

    await h.push(SIGNED_IN);
    expect(h.text()).toBe('SIGNED IN AS علی رضایی');
  });

  it('the three sentences are all DIFFERENT — a surface that collapsed would pass a `toContain`', async () => {
    /*
      🔴 The control for the spec above read loosely. Exact equality already rules a collapse
      out, but the next person who relaxes one of those `toBe`s to a `toContain` (the usual
      softening when copy moves) needs this to stay behind them.
    */
    const h = await mount(SIGNED_OUT);
    const seen: string[] = [h.text()];
    await h.push(EXPIRED);
    seen.push(h.text());
    await h.push(SIGNED_IN);
    seen.push(h.text());
    expect(new Set(seen).size).toBe(3);
  });
});

describe('R-066 — golden rule 11: the id is not in the sentence', () => {
  it('🔴 the `sub` appears NOWHERE on the pill, while the NAME does', async () => {
    /*
      Golden rule 11. `sub` is an opaque Playout id; it is what the audit record carries beside
      the name, and it is not a word. The sentence an operator reads under pressure carries the
      name only.

      🔴 POSITIVE CONTROL: the name IS present in the same assertion pair. Without it,
      "`u-1042` appears nowhere" is satisfied by a pill that renders nothing at all — which is
      precisely what two of the five states legitimately do, so the vacuous pass is one line of
      code away rather than hypothetical.
    */
    const h = await mount(SIGNED_OUT);
    await h.push(SIGNED_IN);

    expect(h.text(), 'the name must be on the surface — else the check below is vacuous').toContain(
      NAME,
    );
    expect(h.text(), 'an internal id reached the sentence the operator reads').not.toContain(SUB);

    // …and not smuggled into an attribute either. The rule relocates an id to a `title` or a
    // copy button on a TECHNICAL surface; the status bar is neither, and this pill's `title`
    // is owned by the session's end time.
    expect(h.tag()?.outerHTML, 'the id reached the markup by another route').not.toContain(SUB);
  });
});

describe('R-066 — the name is bidi-isolated, because it is Persian beside English chrome', () => {
  /*
    Four surfaces learned this separately before it was written down — `B-210`/`B-211` (the
    audit log), `B-223` (the output alarm), `useTemplateIndex`'s own header, and `B-232` (the
    emptied-air notice, measured on the plant as `1-9 · e506e319-…`). A Persian name joined
    into one text node with English words has its placement decided by the bidi algorithm
    rather than by us, and the fix is never `dir="auto"` on the line: that would let the name
    flip the English clauses beside it.
  */
  it('SIGNED IN — a `<bdi>` carries exactly the name, and nothing of the chrome', async () => {
    const h = await mount(SIGNED_OUT);
    await h.push(SIGNED_IN);
    const bdi = h.el.querySelector('bdi');
    expect(bdi, 'the name is not isolated').not.toBeNull();
    expect(bdi?.textContent).toBe(NAME);
    /*
      🔴 The control that makes the isolation MEAN something: the isolate is a STRICT SUBSET of
      the line. A `<bdi>` wrapped around the whole sentence would satisfy "a bdi exists" and
      re-create the defect, because the chrome would then travel with the name's direction.
    */
    expect(h.text().length).toBeGreaterThan(NAME.length);
  });

  it('EXPIRED — the same isolation, on the state that names a name between TWO English clauses', async () => {
    /*
      The harder half, and the reason this is a second `it()` rather than a loop: here the name
      sits between `SESSION EXPIRED — ` and ` — SIGN IN AGAIN`, with NEUTRAL em dashes on both
      sides. Neutrals between runs of opposite direction resolve against their surroundings,
      so which side of the name each dash lands on stops being something the author chose.
    */
    const h = await mount(SIGNED_OUT);
    await h.push(EXPIRED);
    const bdi = h.el.querySelector('bdi');
    expect(bdi, 'the name is not isolated').not.toBeNull();
    expect(bdi?.textContent).toBe(NAME);
    expect(bdi?.textContent, 'a separator was dragged inside the isolate').not.toContain('—');
  });
});

describe('R-066 — the session’s end time is a `title`, not a sentence', () => {
  it('🔴 the clock reading is in the `title` and NOT in the visible text', async () => {
    /*
      The design system's first rule for an operator surface: labels, values, state facts and
      refusal sentences — nothing else. "This session ends at 22:15" in the status bar is a
      fourth thing, read once and then occupying the space a real message needs. It is a fact
      worth having, so it is relocated to the `title` rather than deleted — the same move
      golden rule 11 makes with an id.
    */
    const h = await mount(SIGNED_OUT);
    await h.push(SIGNED_IN);

    const clock = formatEndTime(EXPIRES_AT);
    // 🔴 CONTROLS for both halves below. If `clock` were empty, `toContain` would pass
    // vacuously and `not.toContain` would fail confusingly; if it were the raw ISO, "the title
    // carries a clock" would be true of a title that carries a timestamp.
    expect(
      clock.length,
      'the formatter produced nothing — both checks below are void',
    ).toBeGreaterThan(0);
    expect(clock, 'the formatter handed back the ISO — this is not a clock reading').not.toBe(
      EXPIRES_AT,
    );
    expect(clock, 'not a clock reading').toMatch(/\d{1,2}:\d{2}/);

    const title = h.tag()?.getAttribute('title') ?? '';
    expect(title, 'the end time is not on the pill at all').toContain(clock);
    expect(title, 'the raw ISO was handed to the operator').not.toContain(EXPIRES_AT);
    expect(h.text(), 'the end time reached the sentence').not.toContain(clock);
  });

  it('SIGNED OUT and EXPIRED carry no end-time `title` — there is no session to end', async () => {
    /*
      The control for the spec above being about SIGNED IN specifically: a `title` hard-coded
      onto every branch would pass it. It would also be a lie — an expired session's end time
      is in the past and a signed-out console never had one.
    */
    const h = await mount(SIGNED_OUT);
    expect(h.tag(), 'nothing rendered — the check below is vacuous').not.toBeNull();
    expect(h.tag()?.getAttribute('title')).toBeNull();
    await h.push(EXPIRED);
    expect(h.tag()?.getAttribute('title')).toBeNull();
  });
});

describe('R-066 — `formatEndTime` never invents a value', () => {
  it('🔴 an unparseable `exp` comes back VERBATIM, not as "Invalid Date" and not as a time', async () => {
    /*
      WHY THIS MATTERS ENOUGH TO BE ITS OWN SPEC. `exp` is a value from the Playout, reshaped by
      the bridge, and this surface is the last thing between it and a human. `new Date(x)` is
      happy to produce an Invalid Date and `toLocaleTimeString` is happy to render it as the
      string "Invalid Date" — a sentence that reads like a bug report — while any "sensible
      default" (now, midnight, the epoch) is strictly worse: an operator would plan the end of
      their shift around a time the token never contained. A value shown verbatim is something
      an ENGINEER can act on; a fabricated one is something an OPERATOR acts on.
    */
    const junk = 'not-a-timestamp';
    expect(formatEndTime(junk)).toBe(junk);
    expect(formatEndTime(junk)).not.toContain('Invalid');

    /*
      🔴 POSITIVE CONTROL: a formatter that returned its argument unchanged for EVERYTHING
      would pass the two lines above. A parseable value must come back as a clock reading of
      THAT instant — checked against the `Date`'s own getters rather than against a second call
      to `Intl`, so this is an independent derivation and not a re-implementation. The hour is
      admitted in either spelling because the host's locale decides between a 24-hour clock and
      a padded 12-hour one, and the suite runs on both.
    */
    const d = new Date(Date.parse(EXPIRES_AT));
    const pad = (n: number): string => String(n).padStart(2, '0');
    const hour24 = pad(d.getHours());
    const hour12 = pad(((d.getHours() + 11) % 12) + 1);
    const reading = formatEndTime(EXPIRES_AT);
    expect(reading).not.toBe(EXPIRES_AT);
    expect(reading, 'the minutes are not this instant’s').toContain(pad(d.getMinutes()));
    expect(
      reading.includes(hour24) || reading.includes(hour12),
      `the hour is not this instant’s: ${reading}`,
    ).toBe(true);
  });
});

describe('R-066 — it is a Tag, not a control', () => {
  it('🔴 a state fact is written as a FACT — no button, no button role, nothing pressable', async () => {
    /*
      Golden rule 13's door, and `TAG-NOT-BUTTON-07`'s contract. A thing that does nothing when
      pressed must not look pressable and must not be reachable as a control: a greyed-out or
      inert button tells the operator they lack a permission, when the truth is that there was
      never anything to press. `Tag`'s TYPE makes `onClick`, `tabIndex` and `role="button"`
      inexpressible, so the compiler refuses the bad shape at the call site; this asserts the
      PROPERTY on the rendered surface, which is the half a type cannot see (a raw `<span>` that
      never came through `Tag` would type-check fine and fail here).

      ⚠ ALL THREE RENDERING STATES, not just one. The component has three separate `Tag` call
      sites, and a spec that asserted this on `signed-in` alone would leave the other two
      unmeasured — measured, not supposed: a planted `tabIndex` on the `signed-out` branch
      passed a version of this spec that only looked at `signed-in`.
    */
    const h = await mount(SIGNED_OUT);

    const assertInert = (where: string): void => {
      const tag = h.tag();
      // 🔴 POSITIVE CONTROL: the sweep below asks "is there a button?" of the rendered tree,
      // and an empty tree has no button either. Prove something rendered first.
      expect(tag, `${where}: nothing rendered — every negative below is vacuous`).not.toBeNull();
      expect(h.text().length).toBeGreaterThan(0);

      expect(tag?.tagName, where).toBe('SPAN');
      expect(h.el.querySelector('button'), `${where}: the pill is a control`).toBeNull();
      expect(tag?.getAttribute('role'), `${where}: a tag may not claim an interactive role`).toBe(
        'status',
      );
      expect(tag?.hasAttribute('tabindex'), `${where}: the pill is in the tab order`).toBe(false);
      expect(tag?.getAttribute('onclick'), where).toBeNull();
      expect(tag?.onclick ?? null, `${where}: the pill has a click handler`).toBeNull();
    };

    assertInert('signed-out');
    await h.push(EXPIRED);
    assertInert('expired');
    await h.push(SIGNED_IN);
    assertInert('signed-in');
  });
});

describe('R-066 — it reports ONE axis', () => {
  it('🔴 the `aria-label` is about SIGN-IN, and never about the bridge link', async () => {
    /*
      🔴 WHY THIS IS A SECOND PILL RATHER THAN A STATE OF `LinkIndicator`, pinned as a property.

      `LinkIndicator`'s own header forbids claiming, in the word and the colour that mean
      "connected", to report something it does not measure — golden rule 8's shape, and the
      reason `● LIVE` was once read as a claim about the plant. A signed-out console has a
      perfectly LIVE link: the socket is open, the bridge is answering, `bridge.capabilities`
      came back. Identity and link are two axes, so they are two instruments standing side by
      side, and neither one's label may reach into the other's subject.

      🔴 POSITIVE CONTROL: the label is asserted PRESENT and asserted to name its own axis
      before it is asserted silent about the other. "It does not say 'bridge'" is trivially
      true of an absent attribute, and an absent `aria-label` is the likeliest way this
      regresses.
    */
    const h = await mount(SIGNED_OUT);
    const label = h.tag()?.getAttribute('aria-label') ?? '';
    expect(label.length, 'the pill is unlabelled — the checks below are vacuous').toBeGreaterThan(
      0,
    );
    expect(label, 'the label does not name its own axis').toMatch(/sign[\s-]?in/i);
    for (const foreign of ['bridge', 'link', 'caspar', 'server', 'channel']) {
      expect(label.toLowerCase(), `the pill claims the ${foreign} axis`).not.toContain(foreign);
    }

    // The label is a CONSTANT across every rendering state — it names the INSTRUMENT, not the
    // reading. A label that changed with the state would be a second, quieter sentence, and
    // checking only one state would leave two of the three `Tag` call sites unmeasured.
    await h.push(EXPIRED);
    expect(h.tag()?.getAttribute('aria-label'), 'expired').toBe(label);
    await h.push(SIGNED_IN);
    expect(h.tag()?.getAttribute('aria-label'), 'signed-in').toBe(label);
  });

  it('the three states take three different inks, and EXPIRED takes the error ink', async () => {
    /*
      A `getComputedStyle` COLOUR is real in jsdom — `cssstyle` resolves the cascade — so this
      is one of the few visual claims that can honestly be made here (golden rule 12(c) forbids
      the geometry ones). Asserted by TOKEN IDENTITY rather than by hex, `B-153`'s idiom: the
      expired pill must fill with the ERROR ink, so the one state that means "the console
      stopped working mid-shift" does not read as quietly as the one that means "nobody has
      signed in yet".
    */
    const h = await mount(SIGNED_OUT);
    const read = (): string => {
      const node = h.ink();
      if (node === null) throw new Error('the pill rendered no inked span');
      return window.getComputedStyle(node).color;
    };
    const signedOutInk = read();
    await h.push(EXPIRED);
    const expiredInk = read();
    await h.push(SIGNED_IN);
    const signedInInk = read();

    // 🔴 CONTROL: the engine actually resolved a colour. An empty string would make the
    // inequality below pass for three states that were all unpainted.
    expect(
      signedOutInk.length,
      'no colour resolved — the comparisons below are void',
    ).toBeGreaterThan(0);
    expect(new Set([signedOutInk, expiredInk, signedInInk]).size).toBe(3);
    expect(expiredInk, 'an expired session is not painted as an error').toBe(
      inkFor(colors.errorText),
    );
    expect(signedOutInk).toBe(inkFor(colors.textMuted));
  });
});
