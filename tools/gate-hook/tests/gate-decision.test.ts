import { describe, expect, it } from 'vitest';
import {
  DIFF_BASE_REFS,
  E2E_OPT_IN_ENV,
  affectsRender,
  classifyChangedSet,
  collectChangedPaths,
  commandsFor,
  e2eReminderFor,
  isDocsPath,
  isKnownNonRenderPath,
  isUiRenderPath,
  localE2eOptIn,
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

  // P-029 MOVED two of these INTO the render set, deliberately: `src/platform/` is the
  // browser implementation behind the bridge, and `@cg/shared-schema` is a runtime
  // dependency of both apps. They are asserted as render paths above/below rather than
  // deleted, so the change of verdict is visible in the diff rather than silent.
  it.each([
    'tools/gate-hook/src/gate-decision.mjs',
    'apps/designer/tests/inspector-color-hierarchy.test.ts',
  ])('%s is NOT in the KNOWN ui/render allowlist', (p) => {
    expect(isUiRenderPath(p)).toBe(false);
  });

  it.each(['apps/designer/src/platform/ProjectStore.ts', 'packages/shared-schema/src/scene.ts'])(
    '%s IS ui/render as of P-029 (it was not before)',
    (p) => {
      expect(isUiRenderPath(p)).toBe(true);
    },
  );
});

/**
 * P-029 — `needsE2e` was promoted from a local hint into the SOLE decision of whether the
 * authoritative Linux suite runs at all, so the predicate behind it is pinned here in
 * two halves: every workspace the apps actually import, and the unknown-path default.
 */
describe("the render set covers the apps' real runtime dependency closure (P-029)", () => {
  // Derived from apps/{designer,runtime}/package.json `dependencies`, not from memory.
  it.each([
    ['@cg/shared-schema', 'packages/shared-schema/src/scene.ts'],
    ['@cg/shared-ipc', 'packages/shared-ipc/src/channels.ts'],
    ['@cg/vcg-format', 'packages/vcg-format/src/pack.ts'],
    ['@cg/storage', 'packages/storage/src/index.ts'],
    ['@cg/text-shaping', 'packages/text-shaping/src/index.ts'],
    ['@cg/starter-templates', 'packages/starter-templates/src/index.ts'],
    ['@cg/caspar-client', 'packages/caspar-client/src/reconciler.ts'],
    ['@cg/splash-kit (under tools/, easy to miss)', 'tools/splash-kit/src/index.ts'],
    ['@cg/template-runtime', 'packages/template-runtime/src/runtime.ts'],
    ['@cg/lottie-bridge', 'packages/lottie-bridge/src/runtime.ts'],
    ['@cg/ui', 'packages/ui/src/tokens.ts'],
    ['@cg/single-file-export', 'packages/single-file-export/src/exporter-single-file.ts'],
  ])('%s owes the E2E', (_name, path) => {
    expect(isUiRenderPath(path)).toBe(true);
    expect(affectsRender(path)).toBe(true);
    expect(classifyChangedSet([path])).toEqual({ kind: 'code', needsE2e: true });
  });

  it.each([
    'apps/designer/src/renderer/App.tsx',
    'apps/designer/src/platform/Exporter.ts',
    'apps/runtime/src/platform/MockRuntime.ts',
    'apps/runtime/src/shared/runtime-bridge.ts',
    'apps/designer/index.html',
    'apps/runtime/public/fonts/vazirmatn.woff2',
    'apps/designer/vite.config.ts',
  ])('app source and shell owe the E2E: %s', (path) => {
    expect(affectsRender(path)).toBe(true);
  });
});

describe('an UNRECOGNISED path owes the E2E (P-029 — fail toward running)', () => {
  it.each([
    'packages/brand-new-package/src/index.ts',
    'some/unknown/path.txt',
    'package.json',
    'turbo.json',
    'tsconfig.base.json',
    'pnpm-lock.yaml',
    'tools/caspar-bridge/src/index.ts',
  ])('%s is not in either list, so it counts as render-affecting', (path) => {
    expect(isUiRenderPath(path)).toBe(false);
    expect(isKnownNonRenderPath(path)).toBe(false);
    expect(affectsRender(path)).toBe(true);
    expect(classifyChangedSet([path]).needsE2e).toBe(true);
  });

  it('root config is NOT treated as harmless — B-066 was a root tsconfig setting', () => {
    expect(affectsRender('tsconfig.base.json')).toBe(true);
  });

  it('only the SHORT known-safe list can skip the suite', () => {
    for (const p of [
      'docs/prd/bugs.md',
      'openspec/specs/x/spec.md',
      'README.md',
      '.github/workflows/pr.yml',
      '.husky/pre-push',
      '.claude/hooks/gate-stop.mjs',
      'tools/gate-hook/src/gate-decision.mjs',
    ]) {
      expect(isKnownNonRenderPath(p)).toBe(true);
      expect(affectsRender(p)).toBe(false);
    }
  });

  it('ONE render path in a set of safe ones still owes the E2E', () => {
    const c = classifyChangedSet([
      '.github/workflows/pr.yml',
      'tools/gate-hook/src/gate-decision.mjs',
      'packages/shared-schema/src/scene.ts',
    ]);
    expect(c).toEqual({ kind: 'code', needsE2e: true });
  });

  it('a code set that is entirely known-safe does NOT owe the E2E', () => {
    expect(classifyChangedSet(['.github/workflows/pr.yml'])).toEqual({
      kind: 'code',
      needsE2e: false,
    });
    expect(
      classifyChangedSet(['tools/gate-hook/src/gate-decision.mjs', '.claude/hooks/gate-stop.mjs']),
    ).toEqual({ kind: 'code', needsE2e: false });
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

  it('one non-docs path makes it a code change (full gate, no e2e off the render set)', () => {
    // P-029: the non-render example must now come from the SHORT known-safe list -
    // `packages/shared-schema` is a runtime dependency of both apps and owes an E2E.
    const c = classifyChangedSet(['docs/prd/platform.md', '.github/workflows/pr.yml']);
    expect(c).toEqual({ kind: 'code', needsE2e: false });
    expect(commandsFor(c)).toEqual(['pnpm gate']);
  });

  it('a UI/render path runs the fast gate ONLY — the E2E moved to CI (P-028)', () => {
    const c = classifyChangedSet(['packages/template-runtime/src/runtime.ts']);
    // The CLASSIFICATION is unchanged: the debt is still owed, and still detected.
    expect(c).toEqual({ kind: 'code', needsE2e: true });
    expect(commandsFor(c)).toEqual(['pnpm gate']);
    expect(commandsFor(c, {})).toEqual(['pnpm gate']);
    expect(commandsFor(c, { localE2e: false })).toEqual(['pnpm gate']);
  });

  it('the opt-in puts gate:e2e back, AFTER the fast gate', () => {
    const c = classifyChangedSet(['apps/designer/src/renderer/theme.css.ts']);
    expect(commandsFor(c, { localE2e: true })).toEqual(['pnpm gate', 'pnpm gate:e2e']);
  });

  it('the opt-in NEVER invents an E2E for a diff that does not owe one', () => {
    const code = classifyChangedSet(['.github/workflows/pr.yml']);
    expect(commandsFor(code, { localE2e: true })).toEqual(['pnpm gate']);
    const docs = classifyChangedSet(['docs/prd/platform.md']);
    expect(commandsFor(docs, { localE2e: true })).toEqual([
      'pnpm openspec validate --all --strict',
      'pnpm format:check',
    ]);
    expect(commandsFor(classifyChangedSet([]), { localE2e: true })).toEqual([]);
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

/**
 * P-028 — the local `gate:e2e` left the hook. The OBLIGATION did not: the classification
 * still detects it and the reminder still states it. Only who runs the suite changed.
 */
describe('the owed-E2E reminder (P-028)', () => {
  it('is emitted for a UI/render diff and names the conditions for discharge', () => {
    const msg = e2eReminderFor(classifyChangedSet(['apps/runtime/src/renderer/App.tsx']));
    expect(msg).not.toBeNull();
    const text = String(msg);
    expect(text).toContain('OWED');
    expect(text).toContain('COMPLETED');
    expect(text).toContain('GREEN');
    expect(text).toContain('run URL');
    expect(text).toContain('tasks.md');
    expect(text).toContain(E2E_OPT_IN_ENV);
  });

  it('is silent for a code diff off the render set, for docs-only, and for an empty set', () => {
    // P-029: `packages/storage` moved INTO the render set (both apps depend on it), so
    // the silent example now comes from the known-safe list.
    expect(e2eReminderFor(classifyChangedSet(['.github/workflows/pr.yml']))).toBeNull();
    expect(e2eReminderFor(classifyChangedSet(['docs/prd/bugs.md']))).toBeNull();
    expect(e2eReminderFor(classifyChangedSet([]))).toBeNull();
  });

  it('does not block: it is a message, and the commands are unaffected by it', () => {
    const c = classifyChangedSet(['packages/ui/src/tokens.ts']);
    expect(e2eReminderFor(c)).not.toBeNull();
    expect(commandsFor(c)).toEqual(['pnpm gate']);
  });
});

describe('the local E2E opt-in (P-028)', () => {
  it('is OFF by default — unset, empty, and unrelated values all mean off', () => {
    expect(localE2eOptIn(undefined)).toBe(false);
    expect(localE2eOptIn({})).toBe(false);
    expect(localE2eOptIn({ [E2E_OPT_IN_ENV]: '' })).toBe(false);
    expect(localE2eOptIn({ [E2E_OPT_IN_ENV]: '0' })).toBe(false);
    expect(localE2eOptIn({ [E2E_OPT_IN_ENV]: 'false' })).toBe(false);
    expect(localE2eOptIn({ [E2E_OPT_IN_ENV]: 'maybe' })).toBe(false);
  });

  it('accepts the usual truthy spellings, case- and whitespace-insensitively', () => {
    for (const v of ['1', 'true', 'TRUE', 'yes', 'on', ' true ']) {
      expect(localE2eOptIn({ [E2E_OPT_IN_ENV]: v })).toBe(true);
    }
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
