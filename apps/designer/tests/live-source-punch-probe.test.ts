import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CEF_BANNED_BUILTINS, CEF_CHROMIUM_BASELINE } from '@cg/eslint-config';

/**
 * Task 1.5b — the **backdrop-punch probe** (`tools/live-source-punch-probe/`) held to
 * the repo's own CEF baseline.
 *
 * 🔴 **Why a probe gets a test at all.** The probe is the artifact the owner carries
 * to the plant to answer 1.5b, and its whole value is that it runs on the browser the
 * answer depends on. A probe that fails to BOOT there does not return a null result;
 * it returns a wasted trip. It is also the exact failure it was written to look for:
 * `B-066` was a setting that passed every local check and `SyntaxError`d on that CEF,
 * on air.
 *
 * ⭐ **THE PROBE HAS NOW RUN (2026-08-15) and both mechanisms failed criterion 1.** The
 * baseline assertions below are KEPT rather than retired, and the reason is not
 * sentiment: the page is now a RECORD of how a measurement was taken, and a record whose
 * artifact has silently drifted off the baseline it claims to have run on is worse than
 * no record. They also cover the case where this kit is copied to ask a new question.
 *
 * ⚠ **The run also showed the plant is on CasparCG 2.5.0 (`69e8ad5`) with Chromium 142,
 * NOT 2.3.2 / CEF {@link CEF_CHROMIUM_BASELINE}.** That does not weaken the baseline
 * checks — the whole point of a floor is that it is below what you meet — and it does not
 * weaken the run's own conclusion, which is robust DOWNWARD: a modern Chromium failing
 * means CEF 71 certainly fails. See the README's "what happens next".
 *
 * The banned list is the SAME curated one the lint and the bundle scan use
 * (`@cg/eslint-config`), imported rather than restated, so a built-in added there
 * covers this file too.
 *
 * ⚠ This lives in the Designer's suite, not beside the probe: `tools/…` is a bare
 * directory with no test runner of its own, and the Designer is where the Live Source
 * work is. If the probe moves, this test fails on the read with the path it wanted.
 */

const PROBE = fileURLToPath(
  new URL('../../../tools/live-source-punch-probe/punch-probe.html', import.meta.url),
);
const README = fileURLToPath(
  new URL('../../../tools/live-source-punch-probe/README.md', import.meta.url),
);

function read(path: string): string {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    throw new Error(
      `The 1.5b punch probe is missing at ${path}. If the kit moved, update this test — ` +
        'do not delete it: it is what keeps the probe bootable on the CEF it exists to measure.',
    );
  }
}

function occurrences(haystack: string, needle: string): number {
  let count = 0;
  let i = haystack.indexOf(needle);
  while (i !== -1) {
    count += 1;
    i = haystack.indexOf(needle, i + 1);
  }
  return count;
}

describe(`1.5b punch probe — bootable on Chromium ${String(CEF_CHROMIUM_BASELINE)}`, () => {
  it('uses no built-in newer than the CEF baseline', () => {
    const html = read(PROBE);
    const hits: string[] = [];
    for (const banned of CEF_BANNED_BUILTINS) {
      for (const needle of banned.needles) {
        const n = occurrences(html, needle);
        if (n > 0) {
          hits.push(`${banned.name} (Chromium ${String(banned.minChromium)}+): "${needle}" ×${n}`);
        }
      }
    }
    expect(hits, `banned built-ins in the punch probe:\n  ${hits.join('\n  ')}`).toEqual([]);
  });

  it('uses no SYNTAX newer than the baseline either', () => {
    // The bundle scan covers built-ins because esbuild lowers syntax for it. Nothing
    // lowers anything here — the probe is hand-written and shipped verbatim — so the
    // two forms that shipped in Chromium 80 are checked directly. `?.` and `??` are
    // the ones a modern habit reaches for without noticing.
    const html = read(PROBE);
    expect(html, 'optional chaining (`?.`) is Chromium 80+; the CEF baseline is 71').not.toMatch(
      /\?\.[A-Za-z_[(]/,
    );
    expect(html, 'nullish coalescing (`??`) is Chromium 80+; the CEF baseline is 71').not.toContain(
      '??',
    );
  });

  it('is SELF-CONTAINED — nothing to fetch at a plant with no network', () => {
    // One file copied into `templates/`. An external stylesheet, script or image
    // would resolve differently (or not at all) under CasparCG's `file://` load, and
    // a probe that half-loads is worse than one that does not load: it measures
    // something, and nobody can tell what.
    const html = read(PROBE);
    expect(html).not.toMatch(/<link\b/);
    expect(html).not.toMatch(/<script[^>]+\bsrc=/);
    expect(html).not.toMatch(/\bfetch\(/);
    expect(html).not.toMatch(/https?:\/\/(?!www\.w3\.org)/);
  });

  it('offers BOTH candidate mechanisms plus the control, and chooses neither', () => {
    // 1.5b's whole point is that the choice is made on the measurement. A kit that
    // shipped one mechanism would answer the question by omission.
    const html = read(PROBE);
    expect(html).toContain('destination-out');
    expect(html).toContain('maskImage');
    // The control state, which is what makes A and B readable at all.
    expect(html).toContain('m-none');
    // …and `CG NEXT` cycles them, so no typing is needed at the plant.
    expect(html).toContain('window.next');
  });

  it('the README carries the FILLED result, not an invitation to run it again', () => {
    // ⭐ REDONE 2026-08-15. This assertion used to require `NOT YET RUN` and an UNFILLED
    // form, which was right for exactly as long as the probe was unrun. The probe RAN at
    // the plant on 2026-08-15 and both mechanisms failed criterion 1, so the old
    // assertion now pins the OPPOSITE of the truth. A test asserting superseded behaviour
    // is the thing to redo, not to delete.
    //
    // What it asserts NOW is the property that matters to the next reader: the file is a
    // RECORD rather than a kit, and it states its verdict rather than leaving it to be
    // inferred from a half-filled form.
    const readme = read(README);
    expect(readme, 'the README must no longer advertise itself as unrun').not.toContain(
      'NOT YET RUN',
    );
    expect(readme).toContain('LIVE SOURCE PUNCH PROBE — RESULT');
    expect(readme, 'the run date is what makes the record citable').toContain('2026-08-15');
    // The SETTLED verdict, in words, so a later edit cannot soften it into "inconclusive".
    //
    // ⚠ This assertion has now been rewritten TWICE in one day, and that is the point
    // rather than an embarrassment: it first required `NOT YET RUN`, then `BOTH
    // MECHANISMS FAILED` (the hand-run's reading), and now the measured outcome — A
    // fails, B works. Each rewrite happened because the file's claim genuinely changed,
    // and a test that pins a claim is SUPPOSED to fail when the claim moves. It caught
    // this edit.
    expect(readme).toMatch(/MECHANISM A FAILS\. MECHANISM B WORKS/);
    // …and the superseded reading is still present, because a measurement record that
    // has been tidied is not a record.
    expect(readme, 'the hand-run reading must survive its own correction').toMatch(/SUPERSEDED/);
    // The two-criteria card survives the run: it is what any re-read must be judged
    // against, and criterion 2's PASS outlives the mechanism it was measured on.
    expect(readme).toMatch(/Criterion 1/);
    expect(readme).toMatch(/Criterion 2/);
    expect(readme).toContain('Record the measurement, not the expectation');
  });

  it("the README's AMCP examples are in the form the server actually parses", () => {
    // 🔴 THE REGRESSION THIS EXISTS TO PREVENT, and it is not hypothetical: every `CG`
    // example in the first edition of this README put the VERB before the channel-layer
    // (`CG ADD 1-10 "punch-probe" 1`), and every one returned #400 ERROR at the plant.
    // The trip still produced its measurement, but only because the owner worked the
    // right form out standing at the rack.
    //
    // Assert the CLAIM — "nothing a reader would RETYPE is in the broken order" — rather
    // than the presence of a corrected line, which would pass with a broken line sitting
    // beside it.
    //
    // 🔴 SCOPED TO THE RECIPE, and the scoping is the whole subtlety. A whole-file scan
    // is the obvious assertion and it is WRONG here: the broken forms legitimately appear
    // elsewhere in this README — once in the correction note that names what was wrong,
    // and three times inside the owner's result form, which is reproduced VERBATIM
    // because a measurement record that has been tidied is not a record. Failing on those
    // would push the next author to edit the evidence to make a test pass.
    //
    // What must be clean is the "Running it" section: the fenced recipe someone reads at
    // a rack. That is where the defect actually cost a trip.
    //
    // The product itself was never wrong: `tools/caspar-bridge/src/command-builder.ts`
    // emits `CG <target> ADD …` and is hardware-validated (ADR 0006). This guards the
    // DOC, which is the surface a human retypes.
    const readme = read(README);
    const start = readme.indexOf('## Running it');
    expect(
      start,
      'the README lost its "Running it" section — this test cannot scope itself',
    ).toBeGreaterThan(-1);
    const recipe = readme.slice(start, readme.indexOf('\n## ', start + 1));
    const verbFirst = /\bCG\s+(?:ADD|PLAY|NEXT|UPDATE|STOP|REMOVE|INVOKE)\s+\d+-\d+/g;
    const offenders = recipe.match(verbFirst) ?? [];
    expect(
      offenders,
      `the run recipe still tells someone to type the verb before the channel-layer: ` +
        `${offenders.join(' · ')} — AMCP is \`CG <ch>-<layer> <VERB> <flash> …\`, ` +
        'see tools/caspar-bridge/src/command-builder.ts',
    ).toEqual([]);
    // …and the working form is present, so the file still tells someone what to type.
    expect(recipe).toMatch(/CG\s+1-10\s+ADD\s+1\s+"punch-probe"/);
    expect(recipe).toMatch(/CG\s+1-10\s+NEXT\s+1/);
  });

  it("mechanism B's mask declares LUMINANCE, because its holes are black", () => {
    // 🔴 THE DEFECT THAT COST A WHOLE CONCLUSION, pinned so it cannot come back.
    //
    // `maskUri()` builds mechanism B's mask as an SVG whose own comment says "white
    // keeps, black punches" — that is LUMINANCE masking. CSS `mask-image` masks by
    // ALPHA by default, where `#fff` and `#000` are BOTH fully opaque. So the mask
    // applied perfectly and punched NOTHING.
    //
    // A no-op mask and a mask that never applied have the SAME signature — "no visible
    // effect at all" — which is why the 2026-08-15 hand-run could not tell them apart,
    // scored B as a failure, and very nearly forced a whole second-channel architecture
    // (design.md §9b) on the strength of it. Measured on 2.5.0 / Chromium 142: the same
    // SVG with `mask-mode: luminance` punches both plate rects and the punch reaches the
    // page's root alpha.
    //
    // ⭐ SUPERSEDED AS THE PRIMARY GUARD, and kept deliberately. The mask now has ONE
    // spelling — `liveSourceMask` in `@cg/shared-schema` — and
    // `packages/shared-schema/tests/live-source-mask.test.ts` asserts this probe's
    // `maskUri()` is byte-identical to it AND that the shared builder declares
    // luminance. That test guards the SHIPPING builder, which is what the brief asked
    // for; this one guards the artifact the owner physically carries to the plant.
    // Both are wanted: the probe is a static file that cannot import the builder, so
    // nothing but a test keeps them in step.
    //
    // Assert the PAIRING, not the presence of a line: a luminance-encoded mask without a
    // luminance mask-mode is the bug, and either half alone is meaningless.
    const html = read(PROBE);
    const usesBlackHoles = /fill='#000'/.test(html) || /fill="#000"/.test(html);
    expect(usesBlackHoles, 'mechanism B is expected to encode its holes as black rects').toBe(true);
    expect(
      html,
      'the mask encodes holes in LUMINANCE (black rects) but does not declare mask-mode: ' +
        'luminance — under the default ALPHA masking that mask is a NO-OP, which is ' +
        'indistinguishable from a mask that never applied. See design.md §9a-R.',
    ).toMatch(/maskMode\s*=\s*[^;]*luminance/);
    expect(html, 'the prefixed spelling carries the same rule').toMatch(
      /webkitMaskSourceType\s*=\s*[^;]*luminance/,
    );
  });
});
