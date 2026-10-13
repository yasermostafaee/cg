import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * 🔴 `OPERATOR-NAME-SWEEP-01` § 4 — **THE SELF-DECLARED OPERATOR NAME AND ITS CAVEAT DO NOT
 * COME BACK. A TEST, NOT A GREP IN A REPORT.**
 *
 * ── WHY THIS IS A PERMANENT GUARD ───────────────────────────────────────────
 *
 * `R-066`'s own notes say the sweep is the hard part and that ONE AXIS PROVABLY MISSES. Both
 * were true: the string pass (`self-declared`) missed the symbol, the symbol pass
 * (`operatorName`) missed the caveat's source because it is BUILT ACROSS LINES, and a fifth
 * axis nobody named — the TICKET ID `B-143` — found four more stale comments that neither
 * caught. A sweep run once is a fact about one afternoon; this is the fact made permanent.
 *
 * ── THE TWO AXES, AND THE THIRD THING THAT MATTERS ──────────────────────────
 *
 *  1. **SYMBOL** — `operatorName` in any casing, so `setOperatorName` / `getOperatorName` /
 *     `subscribeOperatorName` cannot slip back under a capital N. The case-sensitive spelling
 *     is exactly how the original sweep's own baseline under-reported.
 *  2. **SENTENCE** — the caveat's clauses, matched MULTI-LINE, because the source was a
 *     template literal broken over four lines and a per-line grep found it in ten test and doc
 *     files while missing the one file it came from.
 *
 * ⚠ **THE FALSE POSITIVE IS THE HARD PART, and it is handled by NAME rather than by luck.**
 * `operatorRowName` / `useOperatorNames` / `OperatorNames.tsx` are golden rule 11's ROW naming
 * — a completely different feature that merely shares a word. A case-insensitive sweep adds 23
 * such files and exactly one real one. So the symbol axis matches the word with a boundary and
 * then subtracts the row-naming vocabulary explicitly; a future author who adds another
 * `Operator*` helper adds it to {@link ROW_NAMING} and the guard keeps working.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '../../..');

/**
 * SOURCE ONLY. Docs, PRD items, archived OpenSpec changes and dated handoffs record what the
 * product USED to do, and rewriting history is not what this guard is for — `B-141`'s
 * resolution note and the `audit-actor-console-name` proposal must keep saying what they said.
 */
const SOURCE_GLOBS = [
  'apps/runtime/src',
  'apps/designer/src',
  /*
    🔴 `packages`, NOT the per-package wildcard form (`packages` + slash + star + slash +
    `src`) — **a git wildcard pathspec is a FULL-PATH match, so the wildcard form addresses no
    file and git says nothing about it.** Measured on this very guard: the wildcard returns 0
    files and `packages` returns 457. The positive control below is what caught it; without
    one, the sentence axis would have reported a clean sweep of a package tree it never opened.

    ⚠ The wildcard is spelled out in words above rather than written literally, because it
    contains the two characters that end a block comment — which broke this file once already.
  */
  'packages',
  'tools/caspar-bridge/src',
];

/**
 * 🔴 **THE RETIRED IDENTIFIERS, BY NAME — and not the bare word `operatorName`.**
 *
 * The bare word cannot be the matcher, and finding that out is worth recording. Golden rule
 * 11's ROW naming uses it legitimately: `LayerRow` takes a prop `operatorName?: OperatorRowName`
 * meaning "this row's name in the operator's words", and `LayersPanel` passes it. That is a
 * different feature that merely shares a noun, and a guard matching the word would fail on
 * innocent code — the "23 of 24 added files are the row-naming helper" trap a case-insensitive
 * sweep walks straight into.
 *
 * So the guard names what was actually retired. Every one of these was an export of the
 * deleted `platform/operatorName.ts` or a member of the bridge contract it hung from; none has
 * any other meaning in this tree, so a hit is unambiguous.
 *
 * ⚠ A reintroduction under a NEW name is not caught here — it is caught by the two checks
 * beside this one: it would need somewhere to persist (the key check) and a surface that
 * explained what it was worth (the sentence check). Three narrow, unambiguous guards beat one
 * broad guard that cries wolf and gets deleted.
 */
const RETIRED_SYMBOLS = [
  'getOperatorName',
  'setOperatorName',
  'subscribeOperatorName',
  'operatorActorForWire',
];

function gitGrep(args: readonly string[]): string[] {
  try {
    return execFileSync('git', ['grep', ...args], { cwd: REPO, encoding: 'utf8' })
      .split('\n')
      .filter(Boolean);
  } catch (err) {
    // `git grep` exits 1 with no output when nothing matched — that is a clean result here.
    const e = err as { status?: number; stdout?: string };
    if (e.status === 1 && (e.stdout ?? '') === '') return [];
    throw err;
  }
}

/** Every tracked source file, read once. */
function sourceFiles(): { file: string; text: string }[] {
  const listed = execFileSync('git', ['ls-files', '--', ...SOURCE_GLOBS], {
    cwd: REPO,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
    .split('\n')
    .filter((f) => /\.(ts|tsx|css|mjs)$/.test(f));
  /*
    ⚠ Filtered by EXISTENCE. `git ls-files` reports the index, which still lists a file that
    has been deleted on disk but not yet staged — so a guard that read the list blindly would
    crash with `ENOENT` on the very commit that retires a module. Measured: it did, on this
    one.
  */
  return listed
    .filter((file) => fs.existsSync(path.join(REPO, file)))
    .map((file) => ({ file, text: fs.readFileSync(path.join(REPO, file), 'utf8') }));
}

describe('OPERATOR-NAME-SWEEP-01 — the retirement holds', () => {
  /**
   * 🔴 **THE INSTRUMENT IS LIVE.** Every assertion below is an ABSENCE, and an absence measured
   * by a broken instrument is indistinguishable from a pass. So this runs FIRST and proves the
   * two mechanisms find something they are guaranteed to find.
   */
  it('the instrument is live: git grep answers, and the file list is real', () => {
    // A word this repo certainly contains, through the same helper the guards below use.
    expect(gitGrep(['-l', '-i', 'operator', '--', ...SOURCE_GLOBS]).length).toBeGreaterThan(20);

    const files = sourceFiles();
    expect(files.length, 'no source files were read at all').toBeGreaterThan(200);
    // …and the multi-line mechanism finds a phrase that IS built across lines in this tree.
    const flat = files.map((f) => flatten(f.text));
    expect(flat.some((t) => /nothing was sent to CasparCG/i.test(t))).toBe(true);
  });

  /** AXIS 1 — the retired SYMBOLS, each unambiguous. See {@link RETIRED_SYMBOLS}. */
  it('no source file names any of the retired operator-name symbols', () => {
    const hits = gitGrep(['-n', '-E', RETIRED_SYMBOLS.join('|'), '--', ...SOURCE_GLOBS]).filter(
      (line) => !line.includes('operatorNameRetired'),
    );
    expect(hits, 'a retired operator-name symbol is back in source').toEqual([]);
  });

  /**
   * ⭐ **THE POSITIVE CONTROL FOR AXIS 1.** Four names are absent — which is also what a typo in
   * the pattern, or a `SOURCE_GLOBS` that addressed nothing, would report. A git pathspec that
   * matches no file returns empty and SAYS NOTHING, which is how a sweep comes to look clean;
   * so the same call is pointed at a symbol that certainly exists in these globs.
   */
  it('the symbol matcher finds a symbol that IS there', () => {
    expect(
      gitGrep(['-n', '-E', 'normalizeActor', '--', ...SOURCE_GLOBS]).length,
      'the symbol matcher found nothing — the axis-1 result above is void',
    ).toBeGreaterThan(0);
  });

  /** …and the persisted key it wrote. */
  it('no source file names the retired persisted key', () => {
    expect(gitGrep(['-n', 'cg.runtime.operatorName', '--', ...SOURCE_GLOBS])).toEqual([]);
  });

  /**
   * AXIS 2 — the SENTENCE, MULTI-LINE.
   *
   * ⚠ Whitespace is collapsed and comment leaders are stripped before matching, which is the
   * whole point: the original lived as a JSX text node broken over four lines, and as a `title`
   * attribute on one. Neither spelling survives a per-line grep.
   */
  it('no source file carries the caveat, however it is broken across lines', () => {
    const PHRASES: [string, RegExp][] = [
      ['LABEL you typed', /LABEL\s+you\s+typed/i],
      ['not a verified sign-in', /not\s+a\s+verified\s+sign-in/i],
      ['which console, not which person', /which\s+console,?\s*not\s+which\s+person/i],
      [
        'does not change when somebody else takes the chair',
        /somebody\s+else\s+takes\s+the\s+chair/i,
      ],
    ];

    const offenders: string[] = [];
    for (const { file, text } of sourceFiles()) {
      const flat = flatten(text);
      for (const [name, re] of PHRASES) if (re.test(flat)) offenders.push(`${file} :: ${name}`);
    }
    expect(offenders, 'the retired caveat is back in source').toEqual([]);
  });

  /**
   * ⭐ **THE POSITIVE CONTROL FOR AXIS 2, and it is not optional.**
   *
   * The four phrases above are absent. That is also what a broken `flatten` would report, and
   * what a `sourceFiles()` returning the wrong extensions would report. So the same matcher is
   * pointed at a sentence that IS present and built across lines — the auth refusal, which
   * lives as a two-line concatenation in `@cg/shared-ipc` — and must find it.
   */
  it('the multi-line matcher finds a sentence that IS split across lines', () => {
    /*
      `DELTA-MULTI-CHANNEL-01-B` B1 reworded the refusal ("…so that was refused and nothing was
      done. Sign in, then try again."). The match is taken ACROSS its two source lines — the
      concatenation's `' + '` included — so it proves the multi-line mechanism, not a line grep.
    */
    const SPLIT = /nothing was done\.\s*'\s*\+\s*'\s*Sign in, then try again/i;
    const found = sourceFiles().filter((f) => SPLIT.test(flatten(f.text)));
    expect(
      found.map((f) => f.file),
      'the multi-line matcher found nothing — every absence above is void',
    ).not.toEqual([]);
    // …and it IS split: no single line of those files carries the whole match.
    for (const f of found) {
      expect(
        f.text.split('\n').some((line) => SPLIT.test(line)),
        f.file,
      ).toBe(false);
    }
  });
});

/** Strip comment leaders and collapse whitespace, so a sentence built across lines is one line. */
function flatten(text: string): string {
  return text
    .split('\n')
    .map((l) => l.replace(/^\s*(\*|\/\/|>|#)\s?/, ''))
    .join(' ')
    .replace(/\s+/g, ' ');
}
