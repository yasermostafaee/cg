import { describe, expect, it } from 'vitest';
import { formatReport, runSoak } from '../src/index.js';

describe('runSoak (short scenario)', () => {
  it('completes a 3-second soak and returns a populated report', async () => {
    const report = await runSoak({
      durationMs: 3000,
      cycleMs: 50,
      sampleMs: 200,
      leakBudgetMb: 50,
    });
    expect(report.cycles).toBeGreaterThan(0);
    expect(report.samples.length).toBeGreaterThanOrEqual(2);
    expect(report.heapStartMb).toBeGreaterThan(0);
    expect(report.heapEndMb).toBeGreaterThan(0);
    expect(report.passed).toBe(true);
    expect(report.errors).toEqual([]);
  });

  it('reports queue-depth zero at end (no leaked in-flight commands)', async () => {
    const report = await runSoak({
      durationMs: 2000,
      cycleMs: 50,
      sampleMs: 200,
      leakBudgetMb: 50,
    });
    const last = report.samples[report.samples.length - 1];
    expect(last?.queueDepth).toBe(0);
  });

  it('marks failed when heap exceeds the configured budget', async () => {
    // 0 MB budget = any growth at all fails. Even a quick soak allocates
    // enough transient strings to exceed this.
    const report = await runSoak({
      durationMs: 1500,
      cycleMs: 30,
      sampleMs: 200,
      leakBudgetMb: 0,
    });
    expect(report.passed).toBe(report.heapDeltaMb <= 0);
  });

  it('honors the strategy override', async () => {
    const report = await runSoak({
      durationMs: 1000,
      cycleMs: 50,
      sampleMs: 200,
      leakBudgetMb: 50,
      strategy: 'journal-replay',
    });
    expect(report.passed).toBe(true);
    expect(report.cycles).toBeGreaterThan(0);
  });

  it('formatReport renders all the fields', async () => {
    const report = await runSoak({
      durationMs: 1000,
      cycleMs: 50,
      sampleMs: 200,
      leakBudgetMb: 50,
    });
    const text = formatReport(report);
    expect(text).toContain('cg soak report');
    expect(text).toContain('cycles:');
    expect(text).toContain('heap delta:');
    expect(text).toContain('result:');
    expect(text).toContain('PASS');
  });

  it('formatReport includes the first error line when errors are present', () => {
    // Construct a synthetic SoakReport with errors so we cover the
    // r.errors.length > 0 branch in report.ts (otherwise CI's branch
    // coverage threshold trips on this rarely-hit path).
    const text = formatReport({
      durationMs: 1000,
      cycles: 10,
      samples: [],
      heapStartMb: 1,
      heapEndMb: 2,
      heapDeltaMb: 1,
      leakBudgetMb: 50,
      rssStartMb: 1,
      rssEndMb: 2,
      rssDeltaMb: 1,
      errors: ['amcp send timed out'],
      passed: false,
    });
    expect(text).toContain('first error:');
    expect(text).toContain('amcp send timed out');
    expect(text).toContain('FAIL');
  });
});
