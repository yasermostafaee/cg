import * as fs from 'node:fs';
import * as os from 'node:os';
import { AmcpClient, isOkCode, replyCode } from './amcp-client.js';
import { ProbeServer } from './probe-server.js';
import { CANDIDATES, type BuildContext, type Candidate } from './candidates.js';

export interface ProbeOptions {
  casparHost: string;
  casparPort: number;
  /** Host CasparCG uses to reach THIS machine (for the served probe URL). */
  serveHost: string;
  servePort: number;
  channel: number;
  layer: number;
  /** Override the probe URL entirely (e.g. a `file://` path); disables serving. */
  probeUrl?: string;
  settleMs: number;
  loadWaitMs: number;
  updateWaitMs: number;
  /** Where to write the results JSON + wire NDJSON. */
  outPrefix: string;
}

// Distinct Persian payloads so the operator can SEE the update change the output.
const DATA_INITIAL = JSON.stringify({ headline: 'سلام دنیا', ticker: 'اخبار' });
const DATA_UPDATE = JSON.stringify({ headline: 'خبر فوری ۱۴۰۳', ticker: 'به‌روزرسانی زنده' });

export interface StepResult {
  cmd: string;
  code: number;
  reply: string;
}

export interface CandidateResult {
  id: string;
  title: string;
  note: string;
  loadSteps: StepResult[];
  updateSteps: StepResult[];
  amcpOk: boolean;
  helloObserved: boolean;
  updateObserved: boolean;
  payloadMatch: boolean;
  persianIntact: boolean;
  received: string | null;
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

/** A reachable LAN IPv4 for this machine (so a remote CasparCG can fetch the probe). */
export function guessLanHost(): string {
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family === 'IPv4' && !a.internal) return a.address;
    }
  }
  return '127.0.0.1';
}

async function runCandidate(
  candidate: Candidate,
  ctx: BuildContext,
  amcp: AmcpClient,
  probe: ProbeServer | null,
  opts: ProbeOptions,
): Promise<CandidateResult> {
  const steps = candidate.build(ctx);

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

  const loadSteps: StepResult[] = [];
  for (const cmd of steps.load) loadSteps.push(await runStep(cmd));

  // Wait for the probe page to load + connect its beacon (CEF can take a while).
  const helloObserved =
    probe === null ? false : await waitUntil(() => probe.helloSince(baseT), opts.loadWaitMs);

  const beforeUpdate = Date.now();
  const updateSteps: StepResult[] = [];
  for (const cmd of steps.update) updateSteps.push(await runStep(cmd));

  // The URL-query payload arrives at load; command-driven payloads after update.
  const since = steps.expectSource === 'url-query' ? baseT : beforeUpdate;
  if (probe !== null)
    await waitUntil(() => probe.lastUpdateSince(since) !== null, opts.updateWaitMs);
  const lastUpdate = probe?.lastUpdateSince(since) ?? null;

  for (const cmd of steps.stop) await runStep(cmd);

  const codes = [...loadSteps, ...updateSteps].map((s) => s.code);
  const received = lastUpdate?.payload ?? null;
  const containsPersian = received !== null && /[؀-ۿ]/.test(received);
  return {
    id: candidate.id,
    title: candidate.title,
    note: candidate.note,
    loadSteps,
    updateSteps,
    amcpOk: codes.length > 0 && codes.every(isOkCode),
    helloObserved,
    updateObserved: lastUpdate !== null,
    payloadMatch: received === steps.expectPayload,
    persianIntact: containsPersian && !received.includes('�'),
    received,
  };
}

export async function runProbe(opts: ProbeOptions): Promise<CandidateResult[]> {
  const traceLines: string[] = [];
  const amcp = new AmcpClient((dir, line) =>
    traceLines.push(JSON.stringify({ ts: new Date().toISOString(), dir, line })),
  );

  let probe: ProbeServer | null = null;
  let probeUrl = opts.probeUrl ?? '';
  if (opts.probeUrl === undefined) {
    probe = new ProbeServer();
    await probe.start('0.0.0.0', opts.servePort);
    probeUrl = probe.probeUrl(opts.serveHost);
  }

  process.stderr.write(`[probe] AMCP → ${opts.casparHost}:${String(opts.casparPort)}\n`);
  process.stderr.write(`[probe] probe URL CasparCG will load: ${probeUrl}\n`);
  if (probe !== null) {
    process.stderr.write(
      `[probe] serving probe + beacon on http://${opts.serveHost}:${String(probe.port)} ` +
        `(bound 0.0.0.0) — CasparCG must be able to reach this host\n`,
    );
  }

  await amcp.connect(opts.casparHost, opts.casparPort);
  amcp.send('VERSION');
  await sleep(opts.settleMs);

  const ctx: BuildContext = {
    target: `${String(opts.channel)}-${String(opts.layer)}`,
    flashLayer: 0,
    probeUrl,
    dataInitial: DATA_INITIAL,
    dataUpdate: DATA_UPDATE,
  };

  const results: CandidateResult[] = [];
  for (const candidate of CANDIDATES) {
    process.stderr.write(`\n[probe] ── ${candidate.id}: ${candidate.title} ──\n`);
    const result = await runCandidate(candidate, ctx, amcp, probe, opts);
    printCandidate(result);
    results.push(result);
  }

  await amcp.close();
  await probe?.stop();

  fs.writeFileSync(`${opts.outPrefix}.results.json`, JSON.stringify(results, null, 2), 'utf-8');
  fs.writeFileSync(`${opts.outPrefix}.wire.ndjson`, traceLines.join('\n') + '\n', 'utf-8');
  printSummary(results, ctx);
  process.stderr.write(
    `\n[probe] wrote ${opts.outPrefix}.results.json and ${opts.outPrefix}.wire.ndjson\n`,
  );
  return results;
}

function printCandidate(r: CandidateResult): void {
  const w = (s: string): void => {
    process.stderr.write(s);
  };
  for (const s of [...r.loadSteps, ...r.updateSteps]) {
    w(`    ${isOkCode(s.code) ? '✓' : '✗'} ${String(s.code).padStart(3)}  ${s.cmd}\n`);
    if (s.reply !== '' && replyCode(s.reply) !== s.code) w(`         ↳ ${s.reply}\n`);
  }
  w(`    beacon: hello=${yn(r.helloObserved)} update=${yn(r.updateObserved)}\n`);
  if (r.received !== null) w(`    window.update received: ${truncate(r.received, 120)}\n`);
  else w(`    window.update received: (none observed — read the CasparCG OUTPUT screen)\n`);
}

function printSummary(results: CandidateResult[], ctx: BuildContext): void {
  const w = (s: string): void => {
    process.stderr.write(s);
  };
  w(
    `\n${'═'.repeat(96)}\n  RESULTS (expected update payload: ${truncate(ctx.dataUpdate, 60)})\n${'═'.repeat(96)}\n`,
  );
  const cols = ['amcp', 'hello', 'update', 'match', 'persian'];
  w(`  ${'candidate'.padEnd(28)} ${cols.map((h) => h.padEnd(8)).join('')}\n`);
  for (const r of results) {
    w(
      `  ${r.id.padEnd(28)} ${yn(r.amcpOk).padEnd(8)}${yn(r.helloObserved).padEnd(8)}` +
        `${yn(r.updateObserved).padEnd(8)}${yn(r.payloadMatch).padEnd(8)}${yn(r.persianIntact).padEnd(8)}\n`,
    );
  }
  w(`${'─'.repeat(96)}\n`);
  w(
    '  match = window.update received the EXACT sent JSON · persian = Persian present + no  replacement char.\n' +
      '  If beacon columns are blank but the CasparCG OUTPUT shows the Persian update, the page\n' +
      '  loaded from file:// or could not reach this harness — record what you SEE on screen.\n',
  );
}

function yn(b: boolean): string {
  return b ? 'YES' : 'no';
}
function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n)}…`;
}
