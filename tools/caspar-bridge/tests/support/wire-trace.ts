import * as fs from 'node:fs';

/**
 * 🔴 `CONSOLE-POLISH-01-A` (`B-307`) — **THE ONE READER OF THE AMCP MOCK'S WIRE TRACE.**
 *
 * The mock appends one JSON line per command through a write stream (`tracePath`), and
 * `traceFlush()` is a barrier for the writes queued BEFORE it — never for one that starts after. A
 * test that reads the file while CG Bridge is still sending (a boot blanket, a poll for a line to
 * arrive) can therefore meet a line the mock is still writing; parsed, it threw
 * `Unterminated string in JSON` and turned a CI run red (`plate-band.integration.test.ts:174`, run
 * 37140336493). Fifty copies of the same read lived in the tests, each one a place for it.
 *
 * So this parses only COMPLETE lines — those the mock has finished, which every one ends with a
 * newline. A trailing partial line is not a line yet: it is left for the next read, which finds it
 * whole. Nothing is skipped and nothing waits longer: a read after `traceFlush()` of a quiet wire sees
 * every line, exactly as before.
 */

/** One traced AMCP exchange, as the mock writes it. */
export interface TraceEntry {
  readonly ts?: string;
  /** `recv` — a line the mock received (what CG Bridge sent); `send` — the mock's answer. */
  readonly dir: string;
  readonly line: string;
}

/** The complete lines of a trace's text, parsed; a trailing partial line is left out. */
export function completeTraceEntries(text: string): TraceEntry[] {
  const end = text.lastIndexOf('\n');
  if (end < 0) return [];
  return text
    .slice(0, end)
    .split('\n')
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as TraceEntry);
}

/** Every complete entry of the trace file. */
export function readTrace(tracePath: string): TraceEntry[] {
  return completeTraceEntries(fs.readFileSync(tracePath, 'utf-8'));
}

/** The AMCP lines CG Bridge sent (the mock's `recv`), in order. */
export function recvLines(tracePath: string): string[] {
  return readTrace(tracePath)
    .filter((e) => e.dir === 'recv')
    .map((e) => e.line);
}
