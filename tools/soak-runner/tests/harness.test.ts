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
      failovers: [],
      events: { mirrorDivergence: 0, splitBrainPersistent: 0, correctiveResend: 0, health: 0 },
      journalEndSize: 0,
    });
    expect(text).toContain('first error:');
    expect(text).toContain('amcp send timed out');
    expect(text).toContain('FAIL');
  });

  it('fires a scheduled failover mid-run and records it in the report (M9.4)', async () => {
    const report = await runSoak({
      durationMs: 3000,
      cycleMs: 50,
      sampleMs: 500,
      leakBudgetMb: 50,
      scheduledFailoversAtMs: [1000],
    });
    expect(report.failovers).toHaveLength(1);
    const f = report.failovers[0];
    expect(f?.from).toBe('A');
    expect(f?.to).toBe('B');
    // Failover happened around the 1s mark but on slow CI it can drift —
    // assert ordering rather than exact timing.
    expect(f?.atMs).toBeGreaterThan(500);
    expect(f?.atMs).toBeLessThan(report.durationMs);
    // No state divergence at hour 24 → for the short variant: cycles
    // kept running after the failover, errors stayed empty.
    expect(report.errors).toEqual([]);
    expect(report.passed).toBe(true);
    expect(report.cycles).toBeGreaterThan(0);
  });

  it('ignores scheduled failovers past durationMs', async () => {
    const report = await runSoak({
      durationMs: 1000,
      cycleMs: 50,
      sampleMs: 500,
      leakBudgetMb: 50,
      scheduledFailoversAtMs: [5000, 10_000],
    });
    expect(report.failovers).toEqual([]);
  });

  it('formatReport renders failover lines when failovers occurred', () => {
    const text = formatReport({
      durationMs: 2000,
      cycles: 4,
      samples: [],
      heapStartMb: 1,
      heapEndMb: 2,
      heapDeltaMb: 1,
      leakBudgetMb: 50,
      rssStartMb: 1,
      rssEndMb: 2,
      rssDeltaMb: 1,
      errors: [],
      passed: true,
      failovers: [{ atMs: 1234, from: 'A', to: 'B' }],
      events: { mirrorDivergence: 2, splitBrainPersistent: 1, correctiveResend: 3, health: 0 },
      journalEndSize: 42,
    });
    expect(text).toContain('failovers:     1');
    expect(text).toContain('A → B');
    expect(text).toContain('split-brains:  1');
    expect(text).toContain('journal end:   42 entries');
  });
});

describe('runSoak — B-046 backup fidelity modes', () => {
  it("backup: 'absent' (declared single-server) is quiet and memory-bounded", async () => {
    const report = await runSoak({
      durationMs: 2500,
      cycleMs: 30,
      sampleMs: 200,
      leakBudgetMb: 50,
      backup: 'absent',
    });
    // The B-046 memory-risk proof: heap under budget over the sampled window…
    expect(report.passed).toBe(true);
    expect(report.errors).toEqual([]);
    expect(report.cycles).toBeGreaterThan(0);
    // …with ZERO split-brain / replay / divergence churn…
    expect(report.events.mirrorDivergence).toBe(0);
    expect(report.events.splitBrainPersistent).toBe(0);
    expect(report.events.correctiveResend).toBe(0);
    // …and a bounded journal (self-bounding cap, 500 default).
    expect(report.journalEndSize).toBeLessThanOrEqual(500);
  });

  it("backup: 'dead' (declared but down — the old phantom default) is equally quiet and bounded", async () => {
    const report = await runSoak({
      durationMs: 2500,
      cycleMs: 30,
      sampleMs: 200,
      leakBudgetMb: 50,
      backup: 'dead',
    });
    expect(report.passed).toBe(true);
    expect(report.errors).toEqual([]);
    expect(report.cycles).toBeGreaterThan(0);
    // Pre-fix this mode diverged on EVERY send and replayed the whole
    // journal every 3rd one — all of it must now be gone.
    expect(report.events.mirrorDivergence).toBe(0);
    expect(report.events.splitBrainPersistent).toBe(0);
    expect(report.events.correctiveResend).toBe(0);
    expect(report.journalEndSize).toBeLessThanOrEqual(500);
  });

  it("backup: 'diverging' (LIVE but wrong) still escalates to split-brain + corrective resend", async () => {
    const report = await runSoak({
      durationMs: 2500,
      cycleMs: 30,
      sampleMs: 200,
      leakBudgetMb: 50,
      backup: 'diverging',
    });
    expect(report.cycles).toBeGreaterThan(0);
    expect(report.events.mirrorDivergence).toBeGreaterThan(0);
    expect(report.events.splitBrainPersistent).toBeGreaterThan(0);
    expect(report.events.correctiveResend).toBeGreaterThan(0);
  });
});
