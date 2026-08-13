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
 * answer depends on — the CEF inside CasparCG 2.3.2, baseline Chromium
 * {@link CEF_CHROMIUM_BASELINE}. A probe that fails to BOOT there does not return a
 * null result; it returns a wasted trip, and 1.5c stays blocked for another week. It
 * is also the exact failure it was written to look for: `B-066` was a setting that
 * passed every local check and `SyntaxError`d on that CEF, on air.
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

  it('the README ships the two-criteria card and an UNFILLED result form', () => {
    // The card is the deliverable as much as the page is: §9.3 of this project
    // produced an instruction that could not be run as written, and a first attempt
    // scored a null run as a verdict. Both cost a trip.
    const readme = read(README);
    expect(readme).toContain('NOT YET RUN');
    expect(readme).toMatch(/Criterion 1/);
    expect(readme).toMatch(/Criterion 2/);
    expect(readme).toContain('Record the measurement, not the expectation');
    expect(readme).toContain('LIVE SOURCE PUNCH PROBE — RESULT');
  });
});
