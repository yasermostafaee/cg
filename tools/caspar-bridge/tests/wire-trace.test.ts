import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { completeTraceEntries, recvLines } from './support/wire-trace.js';

/**
 * 🔴 `CONSOLE-POLISH-01-A` (`B-307`) — **A TRACE READ DURING TRAFFIC SEES WHOLE LINES.** The positive
 * control first: handed a half-written last line, the reader every bridge test used to carry throws the
 * very error CI met; the shared reader returns the complete lines and leaves the partial one for the
 * next read, which finds it whole.
 */

const ONE = `${JSON.stringify({ ts: '2026-10-03T17:30:00.000Z', dir: 'recv', line: 'MIXER 1-50 VOLUME 1' })}\n`;
const TWO = JSON.stringify({
  ts: '2026-10-03T17:30:00.010Z',
  dir: 'recv',
  line: 'MIXER 1-51 VOLUME 1',
});
/** The mock caught mid-write: the second line's first 40 bytes, no newline yet. */
const TORN = `${ONE}${TWO.slice(0, 40)}`;

/** The reader fifty bridge tests carried before `B-307`, verbatim. */
function oldReader(text: string): string[] {
  return text
    .split('\n')
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as { dir: string; line: string })
    .filter((e) => e.dir === 'recv')
    .map((e) => e.line);
}

let dir: string | null = null;
afterEach(() => {
  if (dir !== null) fs.rmSync(dir, { recursive: true, force: true });
  dir = null;
});

describe('the wire trace reader', () => {
  it('🔴 positive control: the old reader throws on a half-written last line — the CI red', () => {
    expect(() => oldReader(TORN)).toThrow(/Unterminated string in JSON/);
  });

  it('🔴 the shared reader returns the complete lines and leaves the partial one', () => {
    expect(completeTraceEntries(TORN).map((e) => e.line)).toEqual(['MIXER 1-50 VOLUME 1']);
  });

  it('…and the next read, once the mock has finished the line, finds it whole', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-wire-trace-'));
    const trace = path.join(dir, 'trace.ndjson');
    fs.writeFileSync(trace, TORN);
    expect(recvLines(trace)).toEqual(['MIXER 1-50 VOLUME 1']);
    fs.appendFileSync(trace, `${TWO.slice(40)}\n`);
    expect(recvLines(trace)).toEqual(['MIXER 1-50 VOLUME 1', 'MIXER 1-51 VOLUME 1']);
  });

  it('control: a quiet wire after a flush reads every line, the flush’s bare newline included', () => {
    // `traceFlush()` writes a lone newline as its barrier: a blank line, skipped.
    expect(completeTraceEntries(`${ONE}\n${TWO}\n`).map((e) => e.line)).toEqual([
      'MIXER 1-50 VOLUME 1',
      'MIXER 1-51 VOLUME 1',
    ]);
    expect(completeTraceEntries('')).toEqual([]);
  });
});
