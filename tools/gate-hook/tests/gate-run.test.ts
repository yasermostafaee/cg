import { spawnSync } from 'node:child_process';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runGateCommand, TAIL_READ_BYTES } from '../src/gate-run.mjs';

/**
 * P-045 — the Stop hook's gate runner cannot be killed by its own capture buffer.
 *
 * The defect: `spawnSync(cmd, { shell: true, encoding: 'utf8' })` with no `maxBuffer` kills
 * the child at 1 MiB of piped output, returns `status: null`, and the hook reads that as a
 * RED gate. Every green tee log on 2026-09-06 sat between 954,627 and 1,013,268 bytes, so
 * the margin was under 40 KB and a failing gate — the case with MORE output — crossed it.
 *
 * ⭐ The proof is a RUN, not a read of a constant: a child that prints 2 MiB is run through
 * the exact code the hook runs, and its exit code, its complete output and its last line all
 * survive. The POSITIVE CONTROL is the same child through the OLD shape, which must die the
 * way the defect describes — otherwise "the new runner survives" proves only that the child
 * was not chatty enough to matter.
 */

const TWO_MIB = 2 * 1024 * 1024;

let dir = '';
let chatty = '';

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'cg-gate-run-'));
  chatty = join(dir, 'chatty.mjs');
  // 2 MiB to stdout, a marker line to stderr, a last line to stdout, exit 3 — every stream
  // and the exit code are all things the hook must see intact.
  //
  // ⚠ `process.exitCode`, never `process.exit()`: a pipe is ASYNCHRONOUS on Linux, and an
  // explicit exit drops the write still in flight — the first CI run lost the last line that
  // way, on the fallback path alone (the streamed path writes to a FILE, which is synchronous
  // everywhere). Letting the process drain is what a real gate does.
  writeFileSync(
    chatty,
    [
      `process.stdout.write('x'.repeat(${String(TWO_MIB)}));`,
      "process.stdout.write('\\n');",
      "process.stderr.write('STDERR MARKER\\n');",
      "process.stdout.write('LAST LINE OF THE GATE\\n');",
      'process.exitCode = 3;',
      '',
    ].join('\n'),
  );
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('P-045 — the positive control: the OLD shape dies on this child', () => {
  it('spawnSync with a pipe and the default maxBuffer kills a 2 MiB child and reports no status', () => {
    const run = spawnSync(`node "${chatty}"`, { shell: true, encoding: 'utf8', windowsHide: true });
    /*
      The signature of the defect, on every platform: an ENOBUFS error and a capture cut
      short of the child's own output — the last line is gone.

      What DIFFERS by platform is the exit status, and the first CI run measured it: on
      win32 (where the hook runs for the owner, and where the red gates were measured) the
      child is killed mid-write — `status: null`, `signal: SIGTERM`; on Linux the child can
      have finished before the kill lands, so `status` is its own exit code beside the same
      ENOBUFS. Both are the capture dying; only the Windows shape is what the hook misread
      as a failing task, so only there is it asserted.
    */
    expect(run.error).toBeDefined();
    expect((run.error as NodeJS.ErrnoException).code).toBe('ENOBUFS');
    expect(run.stdout.length).toBeLessThan(TWO_MIB);
    expect(run.stdout).not.toContain('LAST LINE OF THE GATE');
    if (process.platform === 'win32') {
      expect(run.status).toBeNull();
      expect(run.signal).toBe('SIGTERM');
    }
  });
});

describe('P-045 — the runner the hook uses streams to the log and survives', () => {
  it('a 2 MiB child runs to completion: its own exit code, every byte in the log, the last line in the tail', () => {
    const logFile = join(dir, 'session.log');
    writeFileSync(logFile, 'EARLIER TURN\n');
    const before = statSync(logFile).size;

    const result = runGateCommand({ command: `node "${chatty}"`, cwd: dir, logFile });

    // The exit code is the GATE's, never a capture death.
    expect(result.status).toBe(3);
    expect(result.signal).toBeNull();
    expect(result.streamed).toBe(true);

    // Every byte landed in the file — the 2 MiB, the stderr line, the last line.
    const text = readFileSync(logFile, 'utf8');
    expect(text.startsWith('EARLIER TURN\n')).toBe(true);
    expect(statSync(logFile).size - before).toBeGreaterThan(TWO_MIB);
    expect(result.bytes).toBe(statSync(logFile).size - before);
    expect(text).toContain('STDERR MARKER');
    expect(text.trimEnd().endsWith('LAST LINE OF THE GATE')).toBe(true);

    // The tail is THIS command's end, bounded at read time, and never the earlier turn.
    expect(result.tail.length).toBeLessThanOrEqual(TAIL_READ_BYTES);
    expect(result.tail).toContain('LAST LINE OF THE GATE');
    expect(result.tail).toContain('STDERR MARKER');
    expect(result.tail).not.toContain('EARLIER TURN');
  });

  it('a green child reports 0, and the tail is only what it printed', () => {
    const logFile = join(dir, 'green.log');
    const quiet = join(dir, 'quiet.mjs');
    writeFileSync(quiet, "process.stdout.write('all green\\n');\n");
    const result = runGateCommand({ command: `node "${quiet}"`, cwd: dir, logFile });
    expect(result.status).toBe(0);
    expect(result.tail).toBe('all green\n');
    expect(readFileSync(logFile, 'utf8')).toBe('all green\n');
  });

  it('a tail bound smaller than the output slices the END of this command only', () => {
    const logFile = join(dir, 'bounded.log');
    const result = runGateCommand({
      command: `node "${chatty}"`,
      cwd: dir,
      logFile,
      tailBytes: 64,
    });
    expect(result.status).toBe(3);
    expect(result.tail.length).toBeLessThanOrEqual(64);
    expect(result.tail).toContain('LAST LINE OF THE GATE');
  });

  it('FAIL-OPEN: a log that cannot be opened still runs the gate, through the explicit-buffer fallback, and says so', () => {
    // A log under a directory that does not exist — the checkout that cannot create
    // `.gate-logs/` — refuses to open on every platform. (A DIRECTORY as the log path is not
    // the case to use: Windows opens one for append without complaint.)
    const result = runGateCommand({
      command: `node "${chatty}"`,
      cwd: dir,
      logFile: join(dir, 'no-such-dir', 'session.log'),
    });
    expect(result.streamed).toBe(false);
    expect(result.bytes).toBe(0);
    // The fallback's buffer is EXPLICIT and wide, so even this child completes under it.
    expect(result.status).toBe(3);
    expect(result.signal).toBeNull();
    expect(result.tail).toContain('could not open');
    expect(result.tail).toContain('LAST LINE OF THE GATE');
  });
});
