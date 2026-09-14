import { test, expect } from './fixtures/runtime.js';

/**
 * 🔴 `UI-ACCENT-12` — **THE CONSOLE RINGS IN THE CONSOLE'S OWN BLUE.**
 *
 * `@cg/ui` used to declare an accent of its own (`#38bdf8`, the legacy sky) and paint it
 * around every focused input in BOTH apps through one package-wide selector. The Runtime's
 * accent has been `#74cdf6` since the palette moved, so every focused field in the console
 * rang in a blue the console does not use anywhere else. The package now holds NO accent: its
 * focus treatment reads `--cg-accent` and the consuming app supplies it.
 *
 * ── WHY A BROWSER TEST AND NOT A UNIT ONE ────────────────────────────────────────────────
 *
 * The claim is about what a CASCADE resolves, across two stylesheets from two packages, one of
 * which is injected at runtime. `var(--cg-accent)` resolving to nothing does not throw, does
 * not fail a typecheck, and does not fail a jsdom test — it just paints the wrong colour, or
 * none. Only a real engine can answer it (golden rule 12).
 *
 * ── WHY A BARE `<input>` AND NOT ONE OF THE APP'S OWN FIELDS ─────────────────────────────
 *
 * Because the Runtime's own `.cg-field:focus-visible` outranks `input:focus-visible` on
 * specificity: a `.cg-field` measures the APP's rule and would stay green with the package's
 * rule broken. A bare input is matched by the package's rule and nothing else, so its computed
 * `box-shadow` IS the shipped declaration resolving in the real cascade.
 *
 * ⚠ AND NOT A PROBE CARRYING AN INLINE COPY of the declaration. The first version of this spec
 * did that — `style.boxShadow = '0 0 0 2px var(--cg-accent, #38bdf8)'` — which measures the
 * fallback the TEST wrote rather than the one the package ships. Circular, and proved so: a
 * planted drift in `@cg/ui`'s fallback passed it.
 */
test('the @cg/ui focus halo resolves to the CONSOLE accent, not the legacy sky', async ({
  app,
}) => {
  const page = app.page;

  const seen = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    /*
      🔴 A BARE, REAL `<input>`, never one carrying an inline copy of the declaration. A probe
      built as `style.boxShadow = '0 0 0 2px var(--cg-accent, #38bdf8)'` measures the fallback
      the TEST wrote, not the one the package ships — circular, and proved so by planting a
      drift in `@cg/ui`'s fallback, which such a spec passed.

      Bare, because the Runtime's own `.cg-field:focus-visible` outranks `input:focus-visible`
      on specificity: a `.cg-field` would measure the app's rule instead of the package's.
    */
    const probe = document.createElement('input');
    probe.type = 'text';
    document.body.appendChild(probe);
    probe.focus();
    const focusVisible = probe.matches(':focus-visible');
    const ring = getComputedStyle(probe).boxShadow;
    probe.remove();
    return {
      supplied: cs.getPropertyValue('--cg-accent').trim().toLowerCase(),
      accent: cs.getPropertyValue('--r-accent').trim().toLowerCase(),
      focusVisible,
      ring,
    };
  });

  expect(seen.focusVisible, 'the probe never became :focus-visible — it measured nothing').toBe(
    true,
  );

  // 1. THE APP SUPPLIES IT. An empty string here means the Runtime stopped supplying the
  //    contract and the ring silently fell back to the Designer's accent.
  expect(seen.supplied, 'the Runtime must supply --cg-accent to @cg/ui').toBe('#74cdf6');

  // 2. …FROM ITS OWN TOKEN. Pinned as an EQUALITY, not a second literal: the point of the
  //    contract is that the ring cannot drift from the accent, so this stays true through any
  //    future palette move while a hard-coded copy would not.
  expect(seen.supplied, 'the ring must BE the accent, not a copy of it').toBe(seen.accent);

  // 3. …and it actually resolves that way in the cascade.
  expect(seen.ring).toBe('rgb(116, 205, 246) 0px 0px 0px 2px');
  expect(seen.ring, 'the legacy sky is still being painted').not.toContain('56, 189, 248');
});

/**
 * 🔴 THE OTHER HALF OF §3, PINNED AS A FINDING RATHER THAN CHANGED.
 *
 * `UI-ACCENT-12` §3 asked whether the global halo keys on `:focus` or `:focus-visible`, and
 * said to REPORT rather than change it — tightening a plain `:focus` alters what pointer users
 * see in both apps, which is a second decision for the owner.
 *
 * The answer for the Runtime, measured: every focus treatment that PAINTS is `:focus-visible`,
 * and there are no plain-`:focus` painters at all. This test pins that answer so the finding
 * cannot quietly stop being true between now and whenever the owner rules on it — a plain
 * `:focus` painter added here is the `B-100`-class defect the `.cg-field` and fader fixes
 * already cost this tree once.
 */
test('no focus treatment in the console paints on plain :focus', async ({ app }) => {
  const offenders = await app.page.evaluate(() => {
    const bad: string[] = [];
    let scanned = 0;
    const walk = (rules: CSSRuleList): void => {
      for (const r of rules) {
        // ⚠ NOT `if (r.cssRules)`. Chrome gives every CSSStyleRule an EMPTY `cssRules` list
        // now that CSS nesting exists, and an empty list is truthy — so that test sends every
        // style rule down the recursion branch and the scan silently reports ZERO.
        const kids = (r as CSSGroupingRule).cssRules;
        if (kids !== undefined && kids.length > 0) walk(kids);
        const sel = (r as CSSStyleRule).selectorText;
        if (typeof sel !== 'string') continue;
        scanned++;
        const style = (r as CSSStyleRule).style;
        const paints = style.boxShadow || style.outline || style.outlineColor || style.borderColor;
        if (!paints) continue;
        for (const part of sel.split(',')) {
          const p = part.trim().replace(/:not\([^)]*\)/g, '');
          if (!p.includes(':focus')) continue;
          // `:focus-visible` is correct; `:focus-within` is a different pseudo and not the
          // subject. What is forbidden is a bare `:focus` that paints.
          if (/:focus(?![-a-z])/.test(p))
            bad.push(`${part.trim()} {${String(paints).slice(0, 40)}}`);
        }
      }
    };
    for (const sheet of document.styleSheets) {
      try {
        walk(sheet.cssRules);
      } catch {
        /* a cross-origin sheet cannot be read; there are none in this app */
      }
    }
    return { bad, scanned };
  });

  // THE POSITIVE CONTROL, and it is not decorative: the first version of this scan returned
  // "0 plain :focus painters" having walked ZERO rules, which reads exactly like a pass.
  expect(offenders.scanned, 'the scan read no rules at all — it proves nothing').toBeGreaterThan(
    300,
  );
  expect(offenders.bad, 'a plain :focus painter fires on a POINTER press').toEqual([]);
});
