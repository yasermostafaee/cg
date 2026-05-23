#!/usr/bin/env node
// CLI wrapper around @cg/soak-runner.
//
// Defaults: 30-minute soak, one cycle every 250 ms, 1 s sampling, 50 MB budget.
// CI smoke mode (--duration 30s) is what runs nightly during M5 — full 30 min
// soaks land with M10's perf-validation milestone.
//
// Usage:
//   cg-soak                                          # 30 m soak
//   cg-soak --duration 30s                           # CI smoke
//   cg-soak --cycle-ms 100 --budget-mb 30
//   cg-soak --json soak.json                         # emit machine-readable report

import { runSoak, formatReport } from '../dist/index.js';
import { writeFileSync } from 'node:fs';

const args = parseArgs(process.argv.slice(2));

const durationMs = parseDuration(args.duration ?? '30m');
const cycleMs = Number(args['cycle-ms'] ?? 250);
const sampleMs = Number(args['sample-ms'] ?? 1000);
const leakBudgetMb = Number(args['budget-mb'] ?? 50);
const strategy = args.strategy ?? 'mirror-sync';

console.error(
  `[cg-soak] starting: duration=${durationMs}ms cycle=${cycleMs}ms sample=${sampleMs}ms budget=${leakBudgetMb}MB strategy=${strategy}`,
);

const report = await runSoak({
  durationMs,
  cycleMs,
  sampleMs,
  leakBudgetMb,
  strategy,
});

process.stdout.write(`${formatReport(report)}\n`);

if (args.json) {
  writeFileSync(args.json, JSON.stringify(report, null, 2));
  console.error(`[cg-soak] wrote ${args.json}`);
}

process.exit(report.passed ? 0 : 1);

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        out[key] = next;
        i++;
      } else {
        out[key] = true;
      }
    }
  }
  return out;
}

function parseDuration(v) {
  const n = Number(v);
  if (Number.isFinite(n)) return n;
  const m = /^(\d+(?:\.\d+)?)(ms|s|m|h)$/i.exec(String(v));
  if (!m) return 30 * 60 * 1000;
  const value = Number(m[1]);
  switch (m[2].toLowerCase()) {
    case 'ms':
      return value;
    case 's':
      return value * 1000;
    case 'm':
      return value * 60 * 1000;
    case 'h':
      return value * 60 * 60 * 1000;
    default:
      return 30 * 60 * 1000;
  }
}
