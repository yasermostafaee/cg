import { test, expect } from './fixtures/designer.js';

/**
 * 🔴 `UI-ACCENT-12` — **THE DESIGNER DID NOT MOVE, AND THIS IS WHAT HOLDS IT STILL.**
 *
 * That prompt's acceptance was not "the Designer looks better". It was: **any pixel that moves
 * in the Designer means the approach was wrong.** The console's focus ring was painting the
 * wrong blue because `@cg/ui` declared an accent of its own (`#38bdf8`, the legacy sky) and
 * pushed it into both apps; the fix had to reach the Runtime WITHOUT reaching here, which is
 * why simply changing that hex was refused twice.
 *
 * The structural fix: `@cg/ui` declares no accent, its focus rule reads `var(--cg-accent,
 * #38bdf8)`, and each app supplies its own. **The Designer supplies NOTHING and therefore takes
 * the fallback — which is the exact value the package used to declare**, and which is also this
 * app's own accent (`renderer/theme.ts`'s `colors.accent`). Measured before and after the
 * change in Chromium: `rgb(56, 189, 248) 0px 0px 0px 2px`, identical.
 *
 * ⚠ THE FALLBACK IS A COMPATIBILITY FLOOR, NOT A PALETTE. If someone later "tidies" it into a
 * `:root` declaration in `@cg/ui`, or supplies a different accent here, this test goes red —
 * which is the whole point of pinning a NON-change. A silent drift in the Designer is precisely
 * the outcome the prompt forbade, and nothing else in either suite would notice it.
 */
test('the @cg/ui focus halo still resolves to the Designer accent, unchanged', async ({ app }) => {
  /*
    ⚠ THE `app` FIXTURE, NOT THE BARE `page` ONE. Only `app` navigates (`app.goto()`); a spec
    that destructures `page` runs against **about:blank**, where `document.styleSheets` is
    EMPTY — so every CSS assertion in it is vacuously true and the spec reports a pass having
    measured nothing at all.

    This spec was written that way first and PASSED against a planted drift, twice over: the
    blank page, and a circular probe that read back its own inline fallback. Neither was
    visible in a green run. Both were caught by planting the defect the guard exists to catch,
    which is the only thing that can distinguish a working guard from a decorative one.
  */
  const seen = await app.page.evaluate(() => {
    /*
      🔴 A BARE, REAL `<input>` — NOT an element carrying an inline copy of the declaration.

      The first version of this test built a probe with `style.boxShadow = '0 0 0 2px
      var(--cg-accent, #38bdf8)'` and read that back. It is circular: the fallback being
      measured is the one the TEST wrote, so the package's own fallback never enters the
      measurement. Proved by planting a drift (`@cg/ui`'s fallback changed to the console's
      blue) — that spec PASSED, which is the worst possible result for a guard whose entire
      job is to notice exactly that.

      A plain `<input>` appended to the body is matched by `@cg/ui`'s real
      `input:focus-visible` rule, so its computed `box-shadow` IS the shipped declaration
      resolving in the real cascade. It must be OUTSIDE `.cg-field` chrome, which deliberately
      suppresses the halo (`index.css`: "otherwise a focused field reads as two borders").

      ⚠ Chrome grants `:focus-visible` to a scripted `.focus()` on a control that expects typed
      input — verified here by asserting it, so a future Chrome that stops doing so fails loudly
      instead of silently measuring an unfocused element.
    */
    const probe = document.createElement('input');
    probe.type = 'text';
    document.body.appendChild(probe);
    probe.focus();
    const focusVisible = probe.matches(':focus-visible');
    const ring = getComputedStyle(probe).boxShadow;

    // Is @cg/ui's halo rule still IN the cascade and still matching? Without this, asserting
    // "no halo" would also pass if the shared rule were deleted outright.
    // Keyed on the DECLARATION, not on an exact selector string: the selector's spelling is
    // the bundler's to normalise, while "a rule that paints --cg-accent and applies to this
    // input" is the thing actually being asserted.
    let sharedRuleMatches = false;
    const walk = (list: CSSRuleList): void => {
      for (const r of list) {
        const kids = (r as CSSGroupingRule).cssRules;
        if (kids !== undefined && kids.length > 0) walk(kids);
        const rule = r as CSSStyleRule;
        const sel = rule.selectorText;
        if (typeof sel !== 'string') continue;
        if (!rule.style?.boxShadow?.includes('--cg-accent')) continue;
        try {
          if (probe.matches(sel)) sharedRuleMatches = true;
        } catch {
          /* an unsupported selector cannot match */
        }
      }
    };
    for (const s of document.styleSheets) {
      try {
        walk(s.cssRules);
      } catch {
        /* cross-origin */
      }
    }
    probe.remove();

    // The ring the Designer paints itself, on its own primary control.
    const btn = document.querySelector('button');
    let ownRing = '';
    if (btn !== null) {
      for (const s of document.styleSheets) {
        try {
          for (const r of s.cssRules) {
            const sel = (r as CSSStyleRule).selectorText;
            const shadow = (r as CSSStyleRule).style?.boxShadow;
            if (typeof sel !== 'string' || !shadow) continue;
            if (sel.endsWith(':focus-visible') && btn.matches(sel.replace(':focus-visible', ''))) {
              ownRing = shadow;
            }
          }
        } catch {
          /* cross-origin */
        }
      }
    }

    return {
      // Deliberately expected to be EMPTY: this app supplies nothing and rides the fallback.
      supplied: getComputedStyle(document.documentElement).getPropertyValue('--cg-accent').trim(),
      focusVisible,
      ring,
      sharedRuleMatches,
      ownRing,
    };
  });

  expect(seen.focusVisible, 'the probe never became :focus-visible — it measured nothing').toBe(
    true,
  );

  // 1. THE CONTRACT: this app supplies no accent and rides @cg/ui's documented fallback.
  expect(
    seen.supplied,
    'the Designer must supply no accent — it rides @cg/ui’s documented fallback',
  ).toBe('');

  /*
    2. AND THE REASON THE DESIGNER CANNOT MOVE, which is stronger than the fallback and was
       only found by measuring: this app OVERRIDES the shared halo to nothing on every input,
       select and textarea (`index.css` — "otherwise a focused field reads as two borders"),
       and paints its own ring from its own accent instead. So `@cg/ui`'s halo has no visible
       effect here at all, whatever its fallback says.

    ⚠ Asserting `none` ALONE would be vacuous — it stays true if the shared rule is deleted
    outright. So the rule's continued EXISTENCE is asserted too: it must still be in the
    cascade and still match this element, and be beaten by the app's own.
  */
  expect(seen.sharedRuleMatches, 'the @cg/ui halo rule is gone from the cascade').toBe(true);
  expect(seen.ring, 'the Designer’s input chrome MOVED — the approach was wrong').toBe('none');

  // 3. …and the ring the Designer DOES paint is its own accent, byte for byte what it was
  //    before this change. This is the actual "not a pixel moved" pin.
  expect(seen.ownRing, 'the Designer’s own focus ring MOVED').toContain('rgb(56, 189, 248)');
});
