import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { offendingPaths, patternToRegExp, readPatterns } from '../src/never-stage-decision.mjs';

/**
 * P-035 — the never-stage guard's PURE decision.
 *
 * The hook itself asks git what is staged and turns this function's answer into
 * an exit code, so everything worth trusting is here. That the real `git commit`
 * actually refuses is proven end-to-end and recorded in the change — a unit test
 * cannot show that the hook is WIRED.
 */

describe('readPatterns', () => {
  it('drops comments and blanks, keeps paths', () => {
    expect(
      readPatterns(
        ['# a comment', '', 'tools/x.ts', '  spaced/y.ts  ', 'z.ts # trailing'].join('\n'),
      ),
    ).toEqual(['tools/x.ts', 'spaced/y.ts', 'z.ts']);
  });
});

describe('patternToRegExp', () => {
  it('matches an exact path and nothing near it', () => {
    const re = patternToRegExp('tools/caspar-bridge/src/template-http-server.ts');
    expect(re.test('tools/caspar-bridge/src/template-http-server.ts')).toBe(true);
    // A neighbour in the same directory must NOT trip it: the guard forbids one
    // FILE, not the directory that was mis-staged around it.
    expect(re.test('tools/caspar-bridge/src/template-registry.ts')).toBe(false);
    // Nor a path that merely CONTAINS it.
    expect(re.test('a/tools/caspar-bridge/src/template-http-server.ts')).toBe(false);
  });

  it('`*` stays inside one segment', () => {
    const re = patternToRegExp('tools/*/secret.ts');
    expect(re.test('tools/a/secret.ts')).toBe(true);
    expect(re.test('tools/a/b/secret.ts')).toBe(false);
  });

  it('`**` crosses segments', () => {
    const re = patternToRegExp('tools/**/secret.ts');
    expect(re.test('tools/a/secret.ts')).toBe(true);
    expect(re.test('tools/a/b/c/secret.ts')).toBe(true);
    expect(re.test('other/a/secret.ts')).toBe(false);
  });

  it('treats regex metacharacters in a path as literals', () => {
    const re = patternToRegExp('a+b/c.ts');
    expect(re.test('a+b/c.ts')).toBe(true);
    // `.` must not match an arbitrary character, or the list would over-forbid.
    expect(re.test('a+b/cXts')).toBe(false);
  });
});

describe("offendingPaths — the guard's actual decision", () => {
  const PATTERNS = ['tools/caspar-bridge/src/template-http-server.ts'];

  it('🔴 REFUSES when a never-stage path is staged', () => {
    const staged = [
      'docs/prd/platform.md',
      'tools/caspar-bridge/src/template-http-server.ts',
      'tools/caspar-bridge/src/bridge.ts',
    ];
    expect(offendingPaths(staged, PATTERNS)).toEqual([
      'tools/caspar-bridge/src/template-http-server.ts',
    ]);
  });

  it('PASSES an unrelated staged set — including its own directory', () => {
    // The case that must never become a false positive: the accident was a
    // `git add tools/caspar-bridge`, and legitimate work in that directory has to
    // stay committable, or the guard would block the bridge work itself.
    expect(
      offendingPaths(
        [
          'tools/caspar-bridge/src/bridge.ts',
          'tools/caspar-bridge/src/caspar-runtime.ts',
          'docs/prd/platform.md',
        ],
        PATTERNS,
      ),
    ).toEqual([]);
  });

  it('names EVERY offender, not just the first', () => {
    expect(offendingPaths(['a.ts', 'x.ts', 'b.ts'], ['a.ts', 'b.ts'])).toEqual(['a.ts', 'b.ts']);
  });

  it('an empty pattern list forbids nothing', () => {
    expect(offendingPaths(['anything.ts'], [])).toEqual([]);
  });
});

describe('the shipped list is wired to the real file', () => {
  it('exists, parses, and no longer names the deleted hack (C-024 closed 2026-09-04)', () => {
    // Reading the REAL list, so a rename fails here rather than silently disarming
    // the guard. Until 2026-09-04 this asserted the list CONTAINED
    // `template-http-server.ts`; that entry was dropped in the same commit that
    // deleted the owner's `guessLanHost()` pin (C-024's "never before" rule), so
    // the list is legitimately EMPTY now — an empty list forbids nothing, by
    // P-035's own acceptance. What must not happen is the entry drifting back
    // without the hack: a listed file with nothing to protect is a file nobody
    // may edit, for no reason.
    const url = new URL('../../../.claude/never-stage', import.meta.url);
    const patterns = readPatterns(readFileSync(url, 'utf8'));
    expect(Array.isArray(patterns)).toBe(true);
    expect(patterns).not.toContain('tools/caspar-bridge/src/template-http-server.ts');
  });
});
