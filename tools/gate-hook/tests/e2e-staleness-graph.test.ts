import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  bundleInputDirs,
  readWorkspacePackages,
  resolveWorkspaceDeps,
} from '../src/e2e-staleness.mjs';

/**
 * ⭐ **P-036, WIDENED — THE INPUT SET IS THE DEPENDENCY GRAPH.**
 *
 * The first cut compared `dist/` against the app's own `src` only, which left the
 * guard blind to every workspace package the app bundles: edit `@cg/gesture`, run
 * the suite, and a stale bundle reads as CURRENT. Same false green, one level out,
 * and it would be found the same way — not at all.
 *
 * 🔴 **These tests are about the RESOLVER, not about a list.** A hand-kept list of
 * packages fails in one specific way — the next package added is the one nobody
 * adds to it — so the property worth pinning is that a NEW dependency is covered
 * without anyone touching this file. Every fixture below therefore builds a
 * throwaway workspace and asserts what the walk FINDS, never what it was told.
 *
 * **The costs are asymmetric**: a wrong refusal costs one rebuild, a wrong green
 * costs a wrong conclusion. So the unresolvable case is asserted to THROW.
 */

let tmp: string | null = null;

afterEach(() => {
  if (tmp !== null && fs.existsSync(tmp)) fs.rmSync(tmp, { recursive: true, force: true });
  tmp = null;
});

/** A throwaway workspace: `{ '<group>/<dir>': manifest }`. */
function workspace(pkgs: Record<string, Record<string, unknown>>): string {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-ws-'));
  for (const [rel, manifest] of Object.entries(pkgs)) {
    const dir = path.join(tmp, rel);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(manifest));
  }
  return tmp;
}

const rel = (root: string, dirs: readonly string[]): string[] =>
  dirs.map((d) => path.relative(root, d).split(path.sep).join('/'));

describe('readWorkspacePackages', () => {
  it('maps by the manifest NAME, not by the directory name', () => {
    /*
      The two diverge in this repo — `@cg/caspar-bridge` lives in
      `tools/caspar-bridge` — so a resolver that derived the path from the scope
      would be right by coincidence until it was not.
    */
    const root = workspace({
      'tools/caspar-bridge': { name: '@cg/caspar-bridge' },
      'packages/ui': { name: '@cg/ui' },
    });
    const byName = readWorkspacePackages(root);
    expect(byName.get('@cg/caspar-bridge')).toBe(path.join(root, 'tools/caspar-bridge'));
    expect(byName.get('@cg/ui')).toBe(path.join(root, 'packages/ui'));
  });

  it('skips a directory with no readable manifest instead of failing the scan', () => {
    const root = workspace({ 'packages/ui': { name: '@cg/ui' } });
    fs.mkdirSync(path.join(root, 'packages/not-a-package'), { recursive: true });
    fs.writeFileSync(path.join(root, 'packages/not-a-package/package.json'), '{ broken');
    expect([...readWorkspacePackages(root).keys()]).toEqual(['@cg/ui']);
  });
});

describe('resolveWorkspaceDeps', () => {
  it('🔴 follows the graph TRANSITIVELY — a dependency-of-a-dependency is covered', () => {
    /*
      The whole point. `@cg/gesture` is consumed by the app directly, and
      `@cg/text-shaping` only through `@cg/template-runtime` — an edit to the
      second is just as capable of making the bundle stale as an edit to the first,
      and a one-level walk would miss it entirely.
    */
    const root = workspace({
      'apps/designer': {
        name: '@cg/designer',
        dependencies: { '@cg/template-runtime': 'workspace:*' },
      },
      'packages/template-runtime': {
        name: '@cg/template-runtime',
        dependencies: { '@cg/text-shaping': 'workspace:*' },
      },
      'packages/text-shaping': { name: '@cg/text-shaping' },
    });
    const dirs = resolveWorkspaceDeps(
      path.join(root, 'apps/designer'),
      readWorkspacePackages(root),
    );
    expect(rel(root, dirs)).toEqual(['packages/template-runtime', 'packages/text-shaping']);
  });

  it('follows devDependencies too — the rule is one it cannot get wrong', () => {
    // Deciding per dependency KIND which ones can reach a bundle is a judgement
    // the resolver would have to get right every time. Following both is a rule,
    // and it errs the cheap way.
    const root = workspace({
      'apps/designer': { name: '@cg/designer', devDependencies: { '@cg/ui': 'workspace:*' } },
      'packages/ui': { name: '@cg/ui' },
    });
    const dirs = resolveWorkspaceDeps(
      path.join(root, 'apps/designer'),
      readWorkspacePackages(root),
    );
    expect(rel(root, dirs)).toEqual(['packages/ui']);
  });

  it('ignores dependencies outside the scope', () => {
    const root = workspace({
      'apps/designer': { name: '@cg/designer', dependencies: { react: '^18', zod: '^3' } },
    });
    const dirs = resolveWorkspaceDeps(
      path.join(root, 'apps/designer'),
      readWorkspacePackages(root),
    );
    expect(dirs).toEqual([]);
  });

  it('terminates on a CYCLE and lists each package once', () => {
    const root = workspace({
      'apps/designer': { name: '@cg/designer', dependencies: { '@cg/a': 'workspace:*' } },
      'packages/a': { name: '@cg/a', dependencies: { '@cg/b': 'workspace:*' } },
      'packages/b': { name: '@cg/b', dependencies: { '@cg/a': 'workspace:*' } },
    });
    const dirs = resolveWorkspaceDeps(
      path.join(root, 'apps/designer'),
      readWorkspacePackages(root),
    );
    expect(rel(root, dirs)).toEqual(['packages/a', 'packages/b']);
  });

  it('🔴 THROWS on a scoped dependency it cannot locate, rather than skipping it', () => {
    /*
      Skipping would make an unresolvable package indistinguishable from a fresh
      one — a silent hole in a guard whose entire premise is that silence is not
      evidence. The costs are asymmetric: refusing costs a look at the manifest,
      skipping costs a wrong conclusion.
    */
    const root = workspace({
      'apps/designer': { name: '@cg/designer', dependencies: { '@cg/ghost': 'workspace:*' } },
    });
    expect(() =>
      resolveWorkspaceDeps(path.join(root, 'apps/designer'), readWorkspacePackages(root)),
    ).toThrow(/@cg\/ghost/);
  });
});

describe('bundleInputDirs', () => {
  it('covers the app AND each dependency’s src + manifest', () => {
    const root = workspace({
      'apps/designer': { name: '@cg/designer', dependencies: { '@cg/gesture': 'workspace:*' } },
      'packages/gesture': { name: '@cg/gesture' },
    });
    const dirs = rel(
      root,
      bundleInputDirs({ appDir: path.join(root, 'apps/designer'), repoRoot: root }),
    );
    expect(dirs).toEqual([
      'apps/designer/src',
      'apps/designer/index.html',
      'apps/designer/vite.config.ts',
      'packages/gesture/src',
      'packages/gesture/package.json',
    ]);
  });

  it('⚠ does NOT include a dependency’s dist or tests, and both exclusions are decisions', () => {
    /*
      - NOT `dist`: a turbo CACHE RESTORE rewrites a package's dist mtimes with
        nothing having been edited, so including it would refuse on ordinary
        builds — and a guard that refuses routinely is one whose override becomes
        habit.
      - NOT `tests`: a package's tests are never bundled, the same reason the app's
        own `tests/` is absent.
    */
    const root = workspace({
      'apps/designer': { name: '@cg/designer', dependencies: { '@cg/gesture': 'workspace:*' } },
      'packages/gesture': { name: '@cg/gesture' },
    });
    const dirs = rel(
      root,
      bundleInputDirs({ appDir: path.join(root, 'apps/designer'), repoRoot: root }),
    );
    expect(dirs.some((d) => d.endsWith('/dist'))).toBe(false);
    expect(dirs.some((d) => d.endsWith('/tests'))).toBe(false);
  });

  it('🔴 THE REGRESSION THIS EXISTS FOR — this repo’s real graph reaches @cg/gesture from BOTH apps', () => {
    /*
      Not a fixture: the actual workspace. `@cg/gesture` is the package created two
      sessions ago and consumed by both apps' dividers, and it is precisely the
      edit that used to leave a stale bundle looking current.

      Asserted through the RESOLVER rather than by naming a path, so this stays
      true for the next package too — which is the property a hand-kept list can
      never have.
    */
    const repoRoot = path.resolve(__dirname, '..', '..', '..');
    for (const app of ['designer', 'runtime']) {
      const dirs = bundleInputDirs({ appDir: path.join(repoRoot, 'apps', app), repoRoot });
      expect(dirs, `${app} covers @cg/gesture`).toContain(
        path.join(repoRoot, 'packages', 'gesture', 'src'),
      );
      // …and a transitive one the app does not name itself.
      expect(dirs, `${app} covers @cg/shared-schema`).toContain(
        path.join(repoRoot, 'packages', 'shared-schema', 'src'),
      );
      // The app's own sources are still there — widening must not replace them.
      expect(dirs).toContain(path.join(repoRoot, 'apps', app, 'src'));
    }
  });
});
