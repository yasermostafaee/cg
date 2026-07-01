import * as fs from 'node:fs';
import { AmcpClient, isOkCode, replyCode } from './amcp-client.js';
import { ProbeServer } from './probe-server.js';
import {
  ESCAPE_CANDIDATES,
  HARD_PAYLOAD,
  CLASS_LABEL,
  expectedJson,
  evaluateReceived,
  type CandidateEval,
  type EscapeCandidate,
  type HardKey,
} from './escape-candidates.js';

/**
 * B-041 escape-matrix harness. Fixed command sequence (the ADR-0006-validated
 * `CG ADD` + `CG UPDATE`); the ONLY variable is how the JSON data argument is
 * escaped. For each candidate the served probe reports (via the beacon) the raw
 * string its `window.update` received; the harness compares it to the original
 * payload — per character class, byte-exact, and whether the template's own
 * `JSON.parse` succeeded. The single all-PASS candidate IS the canonical rule.
 *
 * Mirrors `run.ts` (the update-mechanism harness): same ProbeServer + AmcpClient,
 * same output files, same operator workflow.
 */
export interface SweepOptions {
  casparHost: string;
  casparPort: number;
  /** Host CasparCG uses to reach THIS machine (for the served probe URL). */
  serveHost: string;
  servePort: number;
  channel: number;
  layer: number;
  flashLayer: number;
  settleMs: number;
  loadWaitMs: number;
  updateWaitMs: number;
  /** Output file prefix for the results JSON + wire NDJSON. */
  outPrefix: string;
}

export interface SweepResult {
  id: string;
  title: string;
  note: string;
  loadSteps: StepResult[];
  updateSteps: StepResult[];
  amcpOk: boolean;
  helloObserved: boolean;
  beaconParseOk: boolean | null;
  evaluation: CandidateEval;
}

interface StepResult {
  cmd: string;
  code: number;
  reply: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitUntil(predicate: () => boolean, timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) return false;
    await sleep(50);
  }
  return true;
}

function firstCode(replies: string[]): { code: number; reply: string } {
  const reply = replies[0] ?? '';
  return { code: replyCode(reply), reply };
}

/** AMCP quoting for the simple, escape-free tokens (the probe URL). */
function quoteUrl(s: string): string {
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

async function runCandidate(
  candidate: EscapeCandidate,
  ctx: { target: string; flashLayer: number; probeUrl: string },
  amcp: AmcpClient,
  probe: ProbeServer,
  opts: SweepOptions,
): Promise<SweepResult> {
  const json = expectedJson();
  const dataArg = candidate.encodeArg(json);

  // Reset the slot, then mark a baseline for the beacon.
  amcp.send(`CLEAR ${ctx.target}`);
  await sleep(opts.settleMs);
  const baseT = Date.now();

  const runStep = async (cmd: string): Promise<StepResult> => {
    const t = Date.now();
    amcp.send(cmd);
    await sleep(opts.settleMs);
    const { code, reply } = firstCode(amcp.linesSince(t));
    return { cmd, code, reply };
  };

  // Fixed verbs (ADR 0006); only `dataArg`'s escaping varies. play-on-load = 1 so
  // the page loads + the FIRST update fires from ADD; then CG UPDATE re-delivers.
  const loadSteps: StepResult[] = [];
  loadSteps.push(
    await runStep(
      `CG ${ctx.target} ADD ${String(ctx.flashLayer)} ${quoteUrl(ctx.probeUrl)} 1 ${dataArg}`,
    ),
  );

  // Wait for the probe page to load + connect its beacon (CEF can be slow).
  const helloObserved = await waitUntil(() => probe.helloSince(baseT), opts.loadWaitMs);

  const beforeUpdate = Date.now();
  const updateSteps: StepResult[] = [];
  updateSteps.push(await runStep(`CG ${ctx.target} UPDATE ${String(ctx.flashLayer)} ${dataArg}`));

  // The CG UPDATE result is what B-041 is about — wait for the update beacon AFTER it.
  await waitUntil(() => probe.lastUpdateSince(beforeUpdate) !== null, opts.updateWaitMs);
  const lastUpdate = probe.lastUpdateSince(beforeUpdate);

  await runStep(`CG ${ctx.target} STOP ${String(ctx.flashLayer)}`);
  await runStep(`CLEAR ${ctx.target}`);

  const received = lastUpdate?.payload ?? null;
  const beaconParseOk = lastUpdate?.parseOk ?? null;
  const codes = [...loadSteps, ...updateSteps].map((s) => s.code);
  return {
    id: candidate.id,
    title: candidate.title,
    note: candidate.note,
    loadSteps,
    updateSteps,
    amcpOk: codes.length > 0 && codes.every(isOkCode),
    helloObserved,
    beaconParseOk,
    evaluation: evaluateReceived(candidate.id, received),
  };
}

export async function runEscapeSweep(opts: SweepOptions): Promise<SweepResult[]> {
  const traceLines: string[] = [];
  const amcp = new AmcpClient((dir, line) =>
    traceLines.push(JSON.stringify({ ts: new Date().toISOString(), dir, line })),
  );

  const probe = new ProbeServer();
  await probe.start('0.0.0.0', opts.servePort);
  const probeUrl = probe.probeUrl(opts.serveHost);

  process.stderr.write(`[escape-sweep] AMCP → ${opts.casparHost}:${String(opts.casparPort)}\n`);
  process.stderr.write(`[escape-sweep] probe URL CasparCG will load: ${probeUrl}\n`);
  process.stderr.write(
    `[escape-sweep] serving probe + beacon on http://${opts.serveHost}:${String(probe.port)} ` +
      `(bound 0.0.0.0) — CasparCG must reach this host\n`,
  );

  await amcp.connect(opts.casparHost, opts.casparPort);
  amcp.send('VERSION');
  await sleep(opts.settleMs);

  const ctx = {
    target: `${String(opts.channel)}-${String(opts.layer)}`,
    flashLayer: opts.flashLayer,
    probeUrl,
  };

  const results: SweepResult[] = [];
  for (const candidate of ESCAPE_CANDIDATES) {
    process.stderr.write(`\n[escape-sweep] ── ${candidate.id}: ${candidate.title} ──\n`);
    const result = await runCandidate(candidate, ctx, amcp, probe, opts);
    printCandidate(result);
    results.push(result);
  }

  await amcp.close();
  await probe.stop();

  fs.writeFileSync(`${opts.outPrefix}.results.json`, JSON.stringify(results, null, 2), 'utf-8');
  fs.writeFileSync(`${opts.outPrefix}.wire.ndjson`, traceLines.join('\n') + '\n', 'utf-8');
  printMatrix(results);
  process.stderr.write(
    `\n[escape-sweep] wrote ${opts.outPrefix}.results.json and ${opts.outPrefix}.wire.ndjson\n`,
  );
  return results;
}

function printCandidate(r: SweepResult): void {
  const w = (s: string): void => {
    process.stderr.write(s);
  };
  for (const s of [...r.loadSteps, ...r.updateSteps]) {
    w(
      `    ${isOkCode(s.code) ? '✓' : '✗'} ${String(s.code).padStart(3)}  ${truncate(s.cmd, 110)}\n`,
    );
  }
  const e = r.evaluation;
  w(`    fired=${yn(e.fired)} parseOk=${yn(e.parseOk)} byteExact=${yn(e.byteExact)}\n`);
  if (e.received !== null) w(`    window.update received: ${truncate(e.received, 140)}\n`);
  else w(`    window.update received: (none — page didn't load or CasparCG rejected the token)\n`);
}

/** The results table: one row per candidate, one column per character class. */
function printMatrix(results: SweepResult[]): void {
  const w = (s: string): void => {
    process.stderr.write(s);
  };
  const keys = Object.keys(HARD_PAYLOAD) as HardKey[];
  const short: Record<HardKey, string> = {
    quote: '"',
    bs1: '\\1',
    bs2: '\\2',
    bs3: '\\3',
    bs4: '\\4',
    newline: 'NL',
    tab: 'TAB',
    persian: 'FA',
    combo: 'MIX',
  };

  w(
    `\n${'═'.repeat(108)}\n  B-041 ESCAPE MATRIX — which escaping round-trips ALL hard characters byte-exact?\n`,
  );
  w(`  expected JSON: ${truncate(expectedJson(), 96)}\n${'═'.repeat(108)}\n`);
  const head = ['candidate'.padEnd(36), 'fire'.padEnd(5), 'parse'.padEnd(6), 'bytes'.padEnd(6)];
  for (const k of keys) head.push(short[k].padEnd(4));
  head.push('ALL');
  w(`  ${head.join('')}\n`);
  w(`  ${'─'.repeat(104)}\n`);

  for (const r of results) {
    const e = r.evaluation;
    const cells = [
      r.id.padEnd(36),
      yn(e.fired).padEnd(5),
      yn(e.parseOk).padEnd(6),
      yn(e.byteExact).padEnd(6),
    ];
    for (const k of keys) {
      const cls = e.classes.find((c) => c.cls === k);
      cells.push((cls?.pass ? '✓' : '✗').padEnd(4));
    }
    cells.push(e.allPass ? 'PASS' : 'fail');
    w(`  ${cells.join('')}\n`);
  }
  w(`  ${'─'.repeat(104)}\n`);

  const winners = results.filter((r) => r.evaluation.allPass);
  if (winners.length === 1) {
    const winner = winners[0];
    w(`\n  ✅ WINNER: ${winner?.id ?? ''} — "${winner?.title ?? ''}"\n`);
    w(`     This escaping round-trips every hard character byte-exact. Lock it into the\n`);
    w(`     canonical @cg/caspar-client escape() (see README → "Recording the result").\n`);
  } else if (winners.length === 0) {
    w(`\n  ⚠ NO candidate passed all classes. Add more candidates to escape-candidates.ts\n`);
    w(
      `    (column legend: " quote · \\1-\\4 backslash counts · NL newline · TAB · FA persian · MIX combo)\n`,
    );
  } else {
    w(
      `\n  ⚠ ${String(winners.length)} candidates passed (${winners.map((r) => r.id).join(', ')}) — pick the simplest.\n`,
    );
  }
  w(
    `\n  Column legend: ${keys.map((k) => `${short[k]}=${CLASS_LABEL[k]}`).join(' · ')}\n` +
      `  fire=window.update fired · parse=template JSON.parse ok · bytes=received===JSON.stringify\n`,
  );
}

function yn(b: boolean): string {
  return b ? 'YES' : 'no';
}
function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n)}…`;
}
