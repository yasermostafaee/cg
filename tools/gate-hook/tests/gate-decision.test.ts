import { describe, expect, it } from 'vitest';
import {
  DIFF_BASE_REFS,
  classifyChangedSet,
  collectChangedPaths,
  commandsFor,
  isDocsPath,
  isUiRenderPath,
  nextAttempt,
  normalizePath,
  parseNameOnly,
  parsePorcelain,
  pickDiffBaseRef,
} from '../src/gate-decision.mjs';

/**
 * P-009 — the Stop hook's PURE decision logic. These are the tests that make the
 * hook trustworthy: the hook itself is thin orchestration (spawn git/pnpm, write
 * logs, exit codes), while everything decidable is here and deterministic.
 */

describe('path normalization + git output parsing', () => {
  it('normalizes backslashes, ./ prefixes, and porcelain quoting', () => {
    expect(normalizePath('docs\\prd\\bugs.md')).toBe('docs/prd/bugs.md');
    expect(normalizePath('./docs/x.md')).toBe('docs/x.md');
    expect(normalizePath('"docs/with space.md"')).toBe('docs/with space.md');
  });

  it('parses porcelain lines, taking the NEW side of a rename', () => {
    const out = ' M apps/designer/src/a.ts\n?? docs/new.md\nR  old/name.ts -> new/name.ts\n';
    expect(parsePorcelain(out)).toEqual(['apps/designer/src/a.ts', 'docs/new.md', 'new/name.ts']);
  });

  it('parses name-only diffs and drops blanks', () => {
    expect(parseNameOnly('a.ts\n\ndocs/b.md\n')).toEqual(['a.ts', 'docs/b.md']);
  });
});

describe('docs-only carve-out membership (mirrors CLAUDE.md, does not redefine it)', () => {
  it('accepts openspec/**, docs/**, and any *.md', () => {
    expect(isDocsPath('openspec/changes/x/spec.md')).toBe(true);
    expect(isDocsPath('docs/prd/bugs.md')).toBe(true);
    expect(isDocsPath('README.md')).toBe(true);
    expect(isDocsPath('packages/ui/README.md')).toBe(true);
  });

  it('rejects source, tests, and config paths', () => {
    expect(isDocsPath('packages/ui/src/tokens.ts')).toBe(false);
    expect(isDocsPath('package.json')).toBe(false);
  });
});

describe('UI/render set membership', () => {
  it.each([
    'apps/designer/src/renderer/features/canvas/CanvasArea.tsx',
    'apps/runtime/src/renderer/App.tsx',
    'packages/template-runtime/src/runtime.ts',
    'packages/lottie-bridge/src/runtime.ts',
    'packages/ui/src/tokens.ts',
    'packages/single-file-export/src/exporter-single-file.ts',
    'apps/designer/src/renderer/theme.css.ts',
    'apps/designer/tests/e2e/lottie-element.spec.ts',
    'apps/runtime/playwright.config.ts',
  ])('%s IS ui/render', (p) => {
    expect(isUiRenderPath(p)).toBe(true);
  });

  it.each([
    'apps/designer/src/platform/ProjectStore.ts',
    'packages/shared-schema/src/scene.ts',
    'tools/gate-hook/src/gate-decision.mjs',
    'apps/designer/tests/inspector-color-hierarchy.test.ts',
  ])('%s is NOT ui/render', (p) => {
    expect(isUiRenderPath(p)).toBe(false);
  });
});

describe('classification → commands', () => {
  it('empty set runs nothing', () => {
    expect(commandsFor(classifyChangedSet([]))).toEqual([]);
    expect(commandsFor(classifyChangedSet(['', '  ']))).toEqual([]);
  });

  it('docs-only runs EXACTLY the carve-out (validate strict + format:check)', () => {
    const c = classifyChangedSet(['docs/prd/platform.md', 'openspec/changes/x/tasks.md']);
    expect(c).toEqual({ kind: 'docs-only', needsE2e: false });
    expect(commandsFor(c)).toEqual(['pnpm openspec validate --all --strict', 'pnpm format:check']);
  });

  it('one non-docs path makes it a code change (full gate, no e2e off the UI set)', () => {
    const c = classifyChangedSet(['docs/prd/platform.md', 'packages/shared-schema/src/scene.ts']);
    expect(c).toEqual({ kind: 'code', needsE2e: false });
    expect(commandsFor(c)).toEqual(['pnpm gate']);
  });

  it('a UI/render path adds gate:e2e AFTER the fast gate', () => {
    const c = classifyChangedSet(['packages/template-runtime/src/runtime.ts']);
    expect(c).toEqual({ kind: 'code', needsE2e: true });
    expect(commandsFor(c)).toEqual(['pnpm gate', 'pnpm gate:e2e']);
  });

  it('deduplicates and normalizes before classifying', () => {
    const c = classifyChangedSet(['docs\\a.md', 'docs/a.md']);
    expect(c.kind).toBe('docs-only');
  });
});

/**
 * P-026 — WHICH ref the turn's diff is measured against. All work lands on `dev`; the
 * owner merges `dev` -> `main` by hand at the end of a day, so `origin/main` is a
 * high-water mark of finished DAYS, not of this turn.
 */
describe('diff base ref selection (P-026)', () => {
  it('prefers origin/dev over origin/main when both resolve', () => {
    const resolved = new Set(['origin/dev', 'origin/main']);
    expect(pickDiffBaseRef((ref) => resolved.has(ref))).toBe('origin/dev');
    expect(DIFF_BASE_REFS[0]).toBe('origin/dev');
  });

  it('falls back to origin/main when origin/dev does not resolve', () => {
    const resolved = new Set(['origin/main']);
    expect(pickDiffBaseRef((ref) => resolved.has(ref))).toBe('origin/main');
  });

  it('returns null when neither resolves - the caller uses the working tree alone', () => {
    expect(pickDiffBaseRef(() => false)).toBeNull();
  });

  it('treats a THROWING probe as "does not resolve" and keeps looking', () => {
    // A probe must never be able to fail the turn; an unprobeable ref falls through.
    const explodeOnDev = (ref: string) => {
      if (ref === 'origin/dev') throw new Error('git exploded');
      return true;
    };
    expect(pickDiffBaseRef(explodeOnDev)).toBe('origin/main');
    const alwaysExplodes = () => {
      throw new Error('git exploded');
    };
    expect(pickDiffBaseRef(alwaysExplodes)).toBeNull();
  });

  it('probes the candidates IN ORDER and stops at the first hit', () => {
    const seen: string[] = [];
    pickDiffBaseRef((ref) => {
      seen.push(ref);
      return ref === 'origin/dev';
    });
    expect(seen).toEqual(['origin/dev']);
  });
});

/**
 * A fake `spawnSync`-shaped git for `collectChangedPaths`. The hook calls that same
 * function with the real runner, so these drive the implementation that ships - not a
 * re-derivation of it (P-023: a control test that reaches a different implementation
 * than the one under test is not a control test).
 */
interface GitResult {
  status: number | null;
  stdout?: string;
}
interface FakeGitOptions {
  statusOut?: string;
  statusFails?: boolean;
  refs?: readonly string[];
  diffOut?: string;
  mergeBaseFails?: boolean;
  diffFails?: boolean;
  calls?: string[][];
}

function fakeGit(opts: FakeGitOptions) {
  const refs = new Set(opts.refs ?? ['origin/dev', 'origin/main']);
  return (args: readonly string[]): GitResult => {
    opts.calls?.push([...args]);
    if (args[0] === 'status') {
      return opts.statusFails ? { status: 1 } : { status: 0, stdout: opts.statusOut ?? '' };
    }
    if (args[0] === 'rev-parse') {
      // The probe peels with `<ref>^{commit}`; strip that suffix to look the ref up.
      const ref = String(args[args.length - 1]).replace('^{commit}', '');
      return { status: refs.has(ref) ? 0 : 1 };
    }
    if (args[0] === 'merge-base') {
      return opts.mergeBaseFails ? { status: 1 } : { status: 0, stdout: 'basesha' };
    }
    if (args[0] === 'diff') {
      return opts.diffFails ? { status: 1 } : { status: 0, stdout: opts.diffOut ?? '' };
    }
    return { status: 1 };
  };
}

describe("assembling the turn's changed set (P-026)", () => {
  it('THE REGRESSION: a docs-only turn on a dev far ahead of main stays docs-only', () => {
    // `dev` carries days of unmerged product work; THIS turn touched only a PRD file.
    // Measured against origin/dev the set is that one doc; against origin/main it would
    // be the whole unmerged backlog - which is how the docs-only carve-out silently died.
    const calls: string[][] = [];
    const git = fakeGit({
      statusOut: ' M docs/prd/platform.md',
      refs: ['origin/dev', 'origin/main'],
      diffOut: '', // origin/dev is HEAD's pushed tip: no unpushed commits this turn
      calls,
    });

    const paths = collectChangedPaths(git);
    expect(paths).toEqual(['docs/prd/platform.md']);
    const classification = classifyChangedSet(paths ?? []);
    expect(classification).toEqual({ kind: 'docs-only', needsE2e: false });
    expect(commandsFor(classification)).toEqual([
      'pnpm openspec validate --all --strict',
      'pnpm format:check',
    ]);
    // And it really did measure against origin/dev, never origin/main.
    expect(calls).toContainEqual(['merge-base', 'HEAD', 'origin/dev']);
    expect(calls).not.toContainEqual(['merge-base', 'HEAD', 'origin/main']);
  });

  it('the SAME turn measured against origin/main would have been a full code gate', () => {
    // The bug, pinned so nobody reinstates it: the unmerged commits enter the set and a
    // one-line docs edit pays `pnpm gate` plus `pnpm gate:e2e`.
    const git = fakeGit({
      statusOut: ' M docs/prd/platform.md',
      refs: ['origin/main'], // origin/dev absent => the old base is what is left
      diffOut: [
        'apps/designer/src/renderer/features/canvas/CanvasArea.tsx',
        'packages/template-runtime/src/runtime.ts',
        'docs/prd/runtime.md',
      ].join('\n'),
    });
    const paths = collectChangedPaths(git);
    expect(classifyChangedSet(paths ?? [])).toEqual({ kind: 'code', needsE2e: true });
  });

  it('unions the working tree with the commits beyond the base', () => {
    const git = fakeGit({
      statusOut: '?? docs/new.md',
      diffOut: 'packages/storage/src/index.ts',
    });
    expect(collectChangedPaths(git)).toEqual(['docs/new.md', 'packages/storage/src/index.ts']);
  });

  it('returns null when git status fails - the hook stands down, never guesses', () => {
    expect(collectChangedPaths(fakeGit({ statusFails: true }))).toBeNull();
  });

  it('with NO resolvable base ref, the working tree alone is the set', () => {
    const calls: string[][] = [];
    const git = fakeGit({ statusOut: ' M src/a.ts', refs: [], calls });
    expect(collectChangedPaths(git)).toEqual(['src/a.ts']);
    expect(calls.some((c) => c[0] === 'merge-base')).toBe(false);
  });

  it('degrades to the working tree when merge-base or diff fails', () => {
    const wt = ' M docs/a.md';
    expect(collectChangedPaths(fakeGit({ statusOut: wt, mergeBaseFails: true }))).toEqual([
      'docs/a.md',
    ]);
    expect(collectChangedPaths(fakeGit({ statusOut: wt, diffFails: true }))).toEqual(['docs/a.md']);
  });
});

describe('attempt counting', () => {
  it('counts up from absent/garbage content, never throws', () => {
    expect(nextAttempt(null)).toBe(1);
    expect(nextAttempt(undefined)).toBe(1);
    expect(nextAttempt('')).toBe(1);
    expect(nextAttempt('not a number')).toBe(1);
    expect(nextAttempt('1')).toBe(2);
    expect(nextAttempt(' 2 \n')).toBe(3);
    expect(nextAttempt('-5')).toBe(1);
  });
});
