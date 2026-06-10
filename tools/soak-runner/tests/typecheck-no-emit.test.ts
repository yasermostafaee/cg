// Regression pin for B-012 (CI: soak-runner "Reconciler is not a constructor").
//
// Root cause: lib packages had `typecheck: tsc -b`, which EMITS dist/ — the
// same files their `build` task emits. Turbo's graph has no edge between a
// package's own `typecheck` and `build` tasks, so both `tsc -b` processes ran
// concurrently in the same package, tearing dist/ while turbo snapshotted the
// build task's outputs into its cache. The poisoned artifact was restored in
// the CI Test step, and soak-runner's vitest then imported a half-written
// `@cg/caspar-client/dist` — `Reconciler` resolved to undefined.
//
// The invariant: a `typecheck` script must never write build state another
// task owns. Build mode is out entirely — `tsc -b --noEmit` rejects the graph
// with TS6310 whenever a referenced project is out of date, and when it does
// run it updates tsbuildinfo across the whole reference closure (other
// packages' build state). So every typecheck script must be a plain-mode
// `tsc --noEmit` with its own private `typecheck.tsbuildinfo`, turbo's
// `typecheck` task must declare no outputs (nothing to restore stale over a
// build's coherent dist + tsbuildinfo pair), and the build task's outputs
// must exclude the typecheck state file so build artifacts stay deterministic.

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

interface PackageJson {
  name?: string;
  scripts?: Record<string, string>;
}

function workspaceRoots(): string[] {
  const yaml = readFileSync(path.join(REPO_ROOT, 'pnpm-workspace.yaml'), 'utf8');
  const roots: string[] = [];
  for (const line of yaml.split('\n')) {
    const m = /^\s*-\s*'?([\w./-]+)\/\*'?\s*$/.exec(line);
    if (m?.[1]) roots.push(m[1]);
  }
  return roots;
}

function workspacePackages(): { dir: string; pkg: PackageJson }[] {
  const out: { dir: string; pkg: PackageJson }[] = [];
  for (const root of workspaceRoots()) {
    const abs = path.join(REPO_ROOT, root);
    if (!existsSync(abs)) continue;
    for (const entry of readdirSync(abs, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const pj = path.join(abs, entry.name, 'package.json');
      if (!existsSync(pj)) continue;
      out.push({
        dir: `${root}/${entry.name}`,
        pkg: JSON.parse(readFileSync(pj, 'utf8')) as PackageJson,
      });
    }
  }
  return out;
}

describe('typecheck must never emit (B-012)', () => {
  const packages = workspacePackages();
  const withTypecheck = packages.filter(({ pkg }) => pkg.scripts?.typecheck !== undefined);

  it('finds the workspace roots and packages (guards against vacuous pass)', () => {
    expect(workspaceRoots()).toEqual(['apps', 'packages', 'tools']);
    expect(withTypecheck.length).toBeGreaterThanOrEqual(16);
  });

  it.each(withTypecheck)('$dir typecheck script is non-emitting', ({ pkg }) => {
    const script = pkg.scripts?.typecheck ?? '';
    // \b so the emitting --noEmitOnError does not satisfy the pin.
    expect(script).toMatch(/--noEmit\b/);
    // Build mode would write tsbuildinfo across the reference closure (and
    // TS6310-fails on out-of-date references) — typecheck must use plain tsc.
    expect(script).not.toMatch(/tsc\s+(-b|--build)\b/);
    // State must live in a file no build task captures.
    expect(script).toMatch(/--tsBuildInfoFile typecheck\.tsbuildinfo\b/);
  });

  it('turbo typecheck task declares no outputs (nothing to restore stale)', () => {
    const turbo = JSON.parse(readFileSync(path.join(REPO_ROOT, 'turbo.json'), 'utf8')) as {
      tasks: Record<string, { outputs?: string[] }>;
    };
    expect(turbo.tasks['typecheck']?.outputs).toEqual([]);
    // Build artifacts must not snapshot typecheck's state file either.
    expect(turbo.tasks['build']?.outputs).toContain('!typecheck.tsbuildinfo');
  });
});
