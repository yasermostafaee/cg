import { describe, expect, it } from 'vitest';
import {
  applyConcurrencyFlag,
  defaultPlaywrightWorkers,
  e2eWorkerEnv,
  readConcurrencyFlag,
  resolveE2eWorkers,
  resolveTestBound,
  testWorkerEnv,
  toPositiveInt,
} from '../src/test-concurrency.mjs';

/**
 * B-098 — the gate's test-parallelism bound. The CLI beside it is plumbing (detect
 * cores, export the caps, spawn turbo), so everything worth trusting is here.
 *
 * The claim this suite exists to defend is a STRUCTURAL one, and it is the whole fix:
 * a monorepo-wide run can never put more concurrent vitest workers on the box than it
 * has cores. A streak of green gate runs does not prove that — the unbounded gate also
 * passes on a fresh machine, which is exactly why B-098 read as a phantom for three
 * sessions. The invariant does prove it, so it is asserted directly, and across the
 * whole plausible range of machines rather than just the 8-core box it was written on.
 */

/** Machine shapes worth pinning: tiny CI containers through a big workstation. */
const CORE_COUNTS = [1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 64, 128];

describe('resolveTestBound — the invariant', () => {
  it.each(CORE_COUNTS)('never oversubscribes a %i-core machine', (cores) => {
    const bound = resolveTestBound(cores);
    expect(bound.maxTestWorkers).toBe(bound.taskConcurrency * bound.forksPerTask);
    expect(bound.maxTestWorkers).toBeLessThanOrEqual(cores);
  });

  it.each(CORE_COUNTS)('still schedules real work on a %i-core machine', (cores) => {
    const bound = resolveTestBound(cores);
    expect(bound.taskConcurrency).toBeGreaterThanOrEqual(1);
    expect(bound.forksPerTask).toBeGreaterThanOrEqual(1);
  });

  it('leaves headroom on the reference 8-core box rather than filling it', () => {
    // The regression this pins: 8 cores must NOT resolve to 8 workers. Every task also
    // runs a vitest parent and a package-manager shim, and v8 coverage merges at the
    // end of each one -- B-098 is a headroom bug, so the budget reserves headroom.
    expect(resolveTestBound(8)).toMatchObject({
      cores: 8,
      forksPerTask: 2,
      taskConcurrency: 3,
      maxTestWorkers: 6,
    });
  });

  it('is a real reduction against the unbounded default it replaces', () => {
    // What shipped before: turbo's ~10 concurrent tasks x vitest's own default of
    // `availableParallelism - 1` forks each = ~70 workers wanted on 8 cores (64 were
    // measured). The bound has to be smaller than the machine, not merely smaller.
    const unbounded = 10 * (8 - 1);
    expect(resolveTestBound(8).maxTestWorkers).toBeLessThan(unbounded / 4);
  });
});

describe('resolveTestBound — degenerate input cannot widen the bound', () => {
  it.each([0, -4, 1.5, Number.NaN, Number.POSITIVE_INFINITY, null, undefined, '', 'lots', {}])(
    'falls back to a single core for %p',
    (cores) => {
      const bound = resolveTestBound(cores);
      expect(bound.cores).toBe(1);
      expect(bound.maxTestWorkers).toBe(1);
    },
  );

  it('clamps forks to the core count on a single-core machine', () => {
    expect(resolveTestBound(1).forksPerTask).toBe(1);
  });
});

describe('resolveTestBound — overrides only ever tighten', () => {
  it('accepts a tighter task concurrency', () => {
    expect(resolveTestBound(8, { taskConcurrency: 1 }).maxTestWorkers).toBe(2);
  });

  it('accepts a tighter fork count', () => {
    expect(resolveTestBound(8, { forksPerTask: 1 })).toMatchObject({
      forksPerTask: 1,
      maxTestWorkers: 6,
    });
  });

  it('refuses a task concurrency that would breach the core budget', () => {
    const bound = resolveTestBound(8, { taskConcurrency: 99 });
    expect(bound.taskConcurrency).toBe(3);
    expect(bound.maxTestWorkers).toBeLessThanOrEqual(8);
  });

  it('refuses a fork count that would breach the core budget', () => {
    const bound = resolveTestBound(8, { forksPerTask: 64 });
    expect(bound.maxTestWorkers).toBeLessThanOrEqual(8);
  });

  it.each([0, -1, 'two', '', null])('ignores the unusable override %p', (bad) => {
    expect(resolveTestBound(8, { forksPerTask: bad, taskConcurrency: bad })).toMatchObject({
      forksPerTask: 2,
      taskConcurrency: 3,
    });
  });
});

describe('toPositiveInt', () => {
  it.each([
    ['8', 8],
    [3, 3],
    ['1', 1],
  ])('reads %p as %i', (input, expected) => {
    expect(toPositiveInt(input)).toBe(expected);
  });

  it.each([0, -1, 2.5, '', ' ', 'x', null, undefined, Number.NaN])('rejects %p', (input) => {
    expect(toPositiveInt(input)).toBeNull();
  });
});

describe('testWorkerEnv', () => {
  /**
   * This block is the regression test for a real failure, not a hypothetical. The
   * first bounded gate run set only the two MAX names and every one of the 20 vitest
   * workspaces died before running a test:
   *
   *     RangeError: options.minThreads and options.maxThreads must not conflict
   *
   * Vitest resolves the ends independently, so an unset min stayed at the default
   * `availableParallelism - 1` (7) while max became 2, and Tinypool rejected the pair.
   */
  it('caps and floors BOTH pools, so no end is left at the default', () => {
    expect(testWorkerEnv(2)).toEqual({
      VITEST_MAX_FORKS: '2',
      VITEST_MIN_FORKS: '1',
      VITEST_MAX_THREADS: '2',
      VITEST_MIN_THREADS: '1',
    });
  });

  it.each([1, 2, 3, 6, 12])('keeps min <= max for a cap of %i', (forks) => {
    const env = testWorkerEnv(forks);
    expect(Number(env.VITEST_MIN_FORKS)).toBeLessThanOrEqual(Number(env.VITEST_MAX_FORKS));
    expect(Number(env.VITEST_MIN_THREADS)).toBeLessThanOrEqual(Number(env.VITEST_MAX_THREADS));
  });

  it('names every variable vitest reads, so neither pool escapes the cap', () => {
    expect(Object.keys(testWorkerEnv(2)).sort()).toEqual([
      'VITEST_MAX_FORKS',
      'VITEST_MAX_THREADS',
      'VITEST_MIN_FORKS',
      'VITEST_MIN_THREADS',
    ]);
  });

  it('emits strings, since a child environment holds no numbers', () => {
    for (const value of Object.values(testWorkerEnv(2))) expect(typeof value).toBe('string');
  });

  it.each([0, -1, 'x', null, undefined])('floors an unusable cap %p at 1', (bad) => {
    expect(testWorkerEnv(bad as unknown as number).VITEST_MAX_FORKS).toBe('1');
  });
});

describe('applyConcurrencyFlag', () => {
  it('appends the computed concurrency to a plain turbo argv', () => {
    expect(applyConcurrencyFlag(['run', 'test', '--force'], 3)).toEqual([
      'run',
      'test',
      '--force',
      '--concurrency=3',
    ]);
  });

  it.each([[['run', 'test:e2e', '--concurrency=1']], [['run', 'test:e2e', '--concurrency', '1']]])(
    'leaves an explicit caller concurrency alone: %p',
    (args) => {
      // gate:e2e sets --concurrency=1 for its own, stricter B-095 reason. This bound
      // must never quietly widen that back out.
      expect(applyConcurrencyFlag(args, 3)).toEqual(args);
    },
  );

  it('does not mutate the argv it was given', () => {
    const args = ['run', 'test'];
    applyConcurrencyFlag(args, 3);
    expect(args).toEqual(['run', 'test']);
  });
});

describe('readConcurrencyFlag', () => {
  it.each([
    [['run', 'test:e2e', '--concurrency=1'], 1],
    [['run', 'test:e2e', '--concurrency', '2'], 2],
    [['run', '--concurrency=4', 'test:e2e'], 4],
  ])('reads %p as %i', (args, expected) => {
    expect(readConcurrencyFlag(args)).toBe(expected);
  });

  it.each([
    [['run', 'test:e2e']],
    [['run', 'test:e2e', '--force']],
    [['run', 'test:e2e', '--concurrency']],
    [['run', 'test:e2e', '--concurrency=0']],
    [['run', 'test:e2e', '--concurrency', 'lots']],
  ])('returns null for %p', (args) => {
    expect(readConcurrencyFlag(args)).toBeNull();
  });

  it('agrees with applyConcurrencyFlag about whether the caller set one', () => {
    // The pair has to see the same argv the same way: applyConcurrencyFlag defers to a
    // caller's flag, and the e2e bound divides the budget by whatever turbo actually
    // ran on. If one of them read `--concurrency 1` and the other did not, the bound
    // would be computed for a machine the run is not on.
    for (const args of [
      ['run', 'test:e2e'],
      ['run', 'test:e2e', '--concurrency=1'],
      ['run', 'test:e2e', '--concurrency', '1'],
    ]) {
      const callerSet = readConcurrencyFlag(args) !== null;
      const untouched = applyConcurrencyFlag(args, 3).length === args.length;
      expect(untouched).toBe(callerSet);
    }
  });
});

describe('defaultPlaywrightWorkers', () => {
  it.each([
    [1, 1],
    [2, 1],
    [4, 2],
    [8, 4],
    [12, 6],
    [16, 8],
  ])('matches Playwright’s own 50%% default on %i cores', (cores, expected) => {
    expect(defaultPlaywrightWorkers(cores)).toBe(expected);
  });

  it.each([0, -1, 'x', null, undefined, Number.NaN])('floors an unusable %p at 1', (bad) => {
    expect(defaultPlaywrightWorkers(bad)).toBe(1);
  });
});

describe('resolveE2eWorkers — the invariant', () => {
  it.each(CORE_COUNTS)('never oversubscribes a %i-core machine', (cores) => {
    const bound = resolveTestBound(cores);
    const workers = resolveE2eWorkers(cores, bound.taskConcurrency);
    expect(bound.taskConcurrency * workers).toBeLessThanOrEqual(bound.workerBudget);
    expect(bound.taskConcurrency * workers).toBeLessThanOrEqual(cores);
  });

  it.each(CORE_COUNTS)('still schedules real work on a %i-core machine', (cores) => {
    expect(
      resolveE2eWorkers(cores, resolveTestBound(cores).taskConcurrency),
    ).toBeGreaterThanOrEqual(1);
  });

  it.each(CORE_COUNTS)('never widens past Playwright’s own default on %i cores', (cores) => {
    // The property that makes this a BOUND. `gate:e2e` runs `--concurrency=1`, so the
    // whole budget would otherwise fall to a single suite and it would run WIDER than
    // it does unbounded today. A bound that can widen something is B-073's longer rope.
    for (const concurrency of [1, 2, 3, 4, 8]) {
      expect(resolveE2eWorkers(cores, concurrency)).toBeLessThanOrEqual(
        defaultPlaywrightWorkers(cores),
      );
    }
  });

  it('closes the measured P-034 case on the 12-core reference box', () => {
    // What shipped before: a bare `turbo run test:e2e` started both apps' suites at
    // Playwright's full default -- measured 6 + 6 = 12 workers for 12 cores, the whole
    // machine claimed by browsers before the two vite preview servers and turbo itself.
    const bound = resolveTestBound(12);
    const workers = resolveE2eWorkers(12, bound.taskConcurrency);
    expect(defaultPlaywrightWorkers(12) * 2).toBe(12); // the unbounded shape, for contrast
    expect(workers).toBe(2);
    expect(workers * 2).toBe(4); // the two e2e tasks, bounded
  });

  it('leaves a serialised gate:e2e at the width it already ran', () => {
    // gate:e2e passes --concurrency=1 for B-095's stricter reason. Bounding it further
    // would slow the one command whose fan-out was never the problem.
    expect(resolveE2eWorkers(12, 1)).toBe(defaultPlaywrightWorkers(12));
    expect(resolveE2eWorkers(8, 1)).toBe(defaultPlaywrightWorkers(8));
  });
});

describe('resolveE2eWorkers — degenerate input and overrides', () => {
  it.each([0, -4, 1.5, Number.NaN, null, undefined, '', 'lots', {}])(
    'falls back to a single worker for cores %p',
    (cores) => {
      expect(resolveE2eWorkers(cores, 1)).toBe(1);
    },
  );

  it.each([0, -1, 'x', null, undefined])(
    'treats an unusable concurrency %p as one task',
    (concurrency) => {
      expect(resolveE2eWorkers(12, concurrency)).toBe(resolveE2eWorkers(12, 1));
    },
  );

  it('accepts an override that tightens', () => {
    expect(resolveE2eWorkers(12, 1, 2)).toBe(2);
  });

  it('refuses an override that would widen', () => {
    expect(resolveE2eWorkers(12, 4, 99)).toBe(resolveE2eWorkers(12, 4));
  });

  it.each([0, -1, 'two', '', null])('ignores the unusable override %p', (bad) => {
    expect(resolveE2eWorkers(12, 4, bad)).toBe(2);
  });
});

describe('e2eWorkerEnv', () => {
  it('names the ONE variable the Playwright configs read', () => {
    // Also the name that must appear in `test:e2e`'s passThroughEnv in turbo.json --
    // turbo's strict env mode would otherwise filter it and the bound would be a
    // silent no-op, the same way the vitest names would be.
    expect(e2eWorkerEnv(2)).toEqual({ CG_E2E_WORKERS: '2' });
  });

  it('emits a string, since a child environment holds no numbers', () => {
    expect(typeof e2eWorkerEnv(4).CG_E2E_WORKERS).toBe('string');
  });

  it.each([0, -1, 'x', null, undefined])('floors an unusable cap %p at 1', (bad) => {
    expect(e2eWorkerEnv(bad as unknown as number).CG_E2E_WORKERS).toBe('1');
  });
});
