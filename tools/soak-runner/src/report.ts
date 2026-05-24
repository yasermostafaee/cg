import type { SoakReport } from './harness.js';

/**
 * Format a soak report as a human-readable text block. Used by the CLI;
 * the JSON form (`JSON.stringify(report, null, 2)`) is what CI ingests.
 */
export function formatReport(r: SoakReport): string {
  const lines = [
    `cg soak report`,
    `  duration:      ${(r.durationMs / 1000).toFixed(1)}s`,
    `  cycles:        ${String(r.cycles)}`,
    `  samples:       ${String(r.samples.length)}`,
    `  heap start:    ${r.heapStartMb.toFixed(2)} MB`,
    `  heap end:      ${r.heapEndMb.toFixed(2)} MB`,
    `  heap delta:    ${signedMb(r.heapDeltaMb)} (budget: ${signedMb(r.leakBudgetMb)})`,
    `  rss start:     ${r.rssStartMb.toFixed(2)} MB`,
    `  rss end:       ${r.rssEndMb.toFixed(2)} MB`,
    `  rss delta:     ${signedMb(r.rssDeltaMb)}`,
    `  errors:        ${String(r.errors.length)}`,
    `  failovers:     ${String(r.failovers.length)}`,
    `  result:        ${r.passed ? 'PASS' : 'FAIL'}`,
  ];
  if (r.errors.length > 0) {
    lines.push(`  first error:   ${r.errors[0] ?? ''}`);
  }
  for (const f of r.failovers) {
    lines.push(`  failover:      ${(f.atMs / 1000).toFixed(1)}s — ${f.from} → ${f.to}`);
  }
  return lines.join('\n');
}

function signedMb(v: number): string {
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)} MB`;
}
