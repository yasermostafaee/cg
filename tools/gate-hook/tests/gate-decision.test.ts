import { describe, expect, it } from 'vitest';
import {
  classifyChangedSet,
  commandsFor,
  isDocsPath,
  isUiRenderPath,
  nextAttempt,
  normalizePath,
  parseNameOnly,
  parsePorcelain,
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
