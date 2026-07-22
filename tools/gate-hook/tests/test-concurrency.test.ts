import { describe, expect, it } from 'vitest';
import {
  applyConcurrencyFlag,
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
