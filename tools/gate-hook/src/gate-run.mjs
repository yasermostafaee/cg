/**
 * P-045 — run a gate command with its output STREAMED to the log file, never buffered.
 *
 * `.claude/hooks/gate-stop.mjs` used to run each gate as
 * `spawnSync(command, { shell: true, encoding: 'utf8' })` with no `maxBuffer`, so Node's
 * default of 1 MiB applied to the piped stdout+stderr. Past that byte `spawnSync` KILLS the
 * child (`ENOBUFS`, `SIGTERM`, `status: null`) and hands back what it had — and because
 * `status !== 0` the hook then reported a GREEN gate as RED, blocked the turn, and pointed
 * the reader at a log (`.gate-logs/<session>.log`, and the gate's own P-040 tee) that ended
 * mid-line with no footer. Measured 2026-09-06: every complete tee log sat at 954,627 to
 * 1,013,268 bytes — 91 to 97 % of the cap — and the two truncated ones within 300 bytes of it.
 *
 * ── STREAM, NOT A BIGGER BUFFER ─────────────────────────────────────────────
 *
 * The obvious one-line fix is `maxBuffer: 256 * 1024 * 1024`. It was declined, because it
 * keeps the SHAPE of the defect: a limit that nobody measures, that bites only when output
 * grows, and output grows precisely when a gate FAILS. A limit moved is a limit deferred.
 *
 * So the child's stdout and stderr are handed a FILE DESCRIPTOR — the hook's own log file,
 * opened for append — and the child writes straight into it. There is no pipe, so there is
 * no `maxBuffer`, so there is nothing to cross. The tail the hook prints on a red gate is then
 * sliced FROM THE FILE after the child exits, bounded at read time rather than at capture
 * time. The child's exit code is the gate's, always: a signal death here can only be the
 * gate's own.
 *
 * FAIL-OPEN on the log, like P-040's tee: if the log file cannot be opened the command still
 * runs, through a pipe with an explicit, generous `maxBuffer`, and says so in the tail. A
 * checkout that cannot write `.gate-logs/` must never lose its gate over it — but the
 * fallback is named as a fallback, because it is the shape being retired.
 *
 * Zero dependencies, plain ESM, imported by the hook via relative path (like its siblings) so
 * a fresh clone runs it with no build step.
 */

import { spawnSync } from 'node:child_process';
import { closeSync, fstatSync, openSync, readSync } from 'node:fs';

/**
 * How much of the log to read back for the tail. The hook prints the last 120 lines; a turbo
 * line is rarely past 300 characters, so 256 KiB is a wide margin — and it is a bound on a
 * READ, which is the safe side to bound on.
 */
export const TAIL_READ_BYTES = 256 * 1024;

/**
 * The buffer the PIPED fallback runs with. Generous rather than clever: the fallback exists
 * for a checkout that cannot write its log, and it should still survive any gate this repo has
 * produced (the largest Stop-hook log on record is 14 MB).
 */
export const FALLBACK_MAX_BUFFER = 256 * 1024 * 1024;

/**
 * Read at most `maxBytes` from the END of the region `[from, end)` of an open file.
 *
 * @param {number} fd
 * @param {number} from byte offset where this command's output began
 * @param {number} maxBytes
 * @returns {string}
 */
export function readTailFromFd(fd, from, maxBytes = TAIL_READ_BYTES) {
  const end = fstatSync(fd).size;
  if (end <= from) return '';
  const start = Math.max(from, end - maxBytes);
  const length = end - start;
  const buffer = Buffer.alloc(length);
  let read = 0;
  while (read < length) {
    const n = readSync(fd, buffer, read, length - read, start + read);
    if (n === 0) break;
    read += n;
  }
  return buffer.subarray(0, read).toString('utf8');
}

/**
 * Run one gate command, streaming its output into `logFile`.
 *
 * @param {{
 *   command: string,
 *   cwd: string,
 *   logFile: string,
 *   env?: NodeJS.ProcessEnv,
 *   tailBytes?: number,
 * }} args
 * @returns {{
 *   status: number | null,
 *   signal: NodeJS.Signals | null,
 *   tail: string,
 *   streamed: boolean,
 *   bytes: number,
 * }} `tail` is the end of THIS command's output (bounded by `tailBytes`); `streamed` is false
 *   only when the log could not be opened and the piped fallback ran; `bytes` is how much this
 *   command wrote to the log (0 under the fallback).
 */
export function runGateCommand({ command, cwd, logFile, env, tailBytes = TAIL_READ_BYTES }) {
  let fd = null;
  try {
    // `a+`, not `a`: the child APPENDS through it, and the tail is READ back through the
    // same descriptor afterwards — an append-only descriptor answers that read with EBADF.
    fd = openSync(logFile, 'a+');
  } catch {
    fd = null;
  }

  if (fd === null) {
    // The fallback: the shape being retired, with its limit made explicit and wide.
    const run = spawnSync(command, {
      cwd,
      shell: true,
      encoding: 'utf8',
      windowsHide: true,
      maxBuffer: FALLBACK_MAX_BUFFER,
      ...(env !== undefined ? { env } : {}),
    });
    const output = `${run.stdout ?? ''}${run.stderr ?? ''}`;
    const tail =
      `[gate-run] could not open ${logFile} - output was NOT streamed to the log; ` +
      `this tail is from a ${String(FALLBACK_MAX_BUFFER)}-byte pipe buffer\n` +
      output.slice(-tailBytes);
    return { status: run.status, signal: run.signal, tail, streamed: false, bytes: 0 };
  }

  try {
    const from = fstatSync(fd).size;
    // `shell: true` so `pnpm` resolves on Windows (pnpm.cmd) and POSIX alike; the command
    // strings are the hook's own constants, never user input. stdin is closed: a gate that
    // waits on a prompt has already failed.
    const run = spawnSync(command, {
      cwd,
      shell: true,
      stdio: ['ignore', fd, fd],
      windowsHide: true,
      ...(env !== undefined ? { env } : {}),
    });
    const bytes = fstatSync(fd).size - from;
    const tail = readTailFromFd(fd, from, tailBytes);
    return { status: run.status, signal: run.signal, tail, streamed: true, bytes };
  } finally {
    try {
      closeSync(fd);
    } catch {
      /* already closed */
    }
  }
}
