/**
 * P-040 — the gate persists its FULL output to a file, not its tail.
 *
 * The first push of `96090c49` failed its pre-push gate naming no failing task. Only the
 * tail of the output was captured, a standalone `pnpm gate` immediately after passed, the
 * retry passed, and the failure was recorded as transient-but-undiagnosed — which was the
 * honest record, and also the same blindness `P-038` had just closed one level UP: a tool
 * that failed and could not say why. The Stop hook already keeps its own full log
 * (`.gate-logs/<session>.log`); the pre-push path and a hand-run `pnpm gate` kept nothing
 * beyond the terminal scrollback, and a scrollback is exactly what a tool captures the
 * tail of.
 *
 * This lives at the SAME chokepoint as the lock (`gate-lock-cli.mjs`), for the same reason
 * P-013 put the lock there: every entry point — direct, `.husky/pre-push`, the Stop hook —
 * funnels through the `gate` / `gate:e2e` scripts, so one tee covers all of them. A copy
 * per caller would be the drift class this repo has paid for repeatedly (B-100, P-012).
 *
 * PURE parts here (names, header/footer text, the prune decision), side effects injected
 * so the unit tests need no clock and can use a throwaway directory. Logging is
 * FAIL-OPEN, unlike the gate itself: a full disk, a read-only checkout, or a missing
 * `.gate-logs/` must never turn a green gate red or block a push. The gate's exit code is
 * the gate's; the log is a courtesy that reports its own failure on stderr and steps
 * aside.
 *
 * ASCII only in everything this writes to the terminal — the Windows console this runs in
 * renders an en-dash as mojibake, and a line whose whole job is to be read must not.
 */

import { join } from 'node:path';

/** Where the logs live, relative to the repo root. Gitignored (see `.gitignore`). */
export const GATE_LOG_DIR = '.gate-logs';

/**
 * How many gate logs to keep. Each is a few hundred KB to a few MB (a full `pnpm gate`
 * prints every workspace's typecheck/lint/test/build); twenty is a week of ordinary work
 * and the last unexplained failure is always inside it. Pruned on every gate END, never
 * on start, so a gate that is still running cannot have its own file pruned from under
 * it, and the prune is by NAME order, which is timestamp order by construction.
 */
export const GATE_LOG_KEEP = 20;

const LOG_NAME = /^gate-\d{8}T\d{6}Z-\d+\.log$/;

/**
 * `20260902T211634Z` — an ISO instant with the separators removed, so the name sorts
 * chronologically and survives every filesystem's rules about `:`.
 *
 * @param {Date} at
 * @returns {string}
 */
export function gateLogStamp(at) {
  return at
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
}

/**
 * @param {Date} startedAt
 * @param {number} pid the gate-lock CLI's own pid, so two gates that start in the same
 *   second (the pre-push / Stop-hook double-fire the lock serializes) still get two files
 * @returns {string}
 */
export function gateLogFileName(startedAt, pid) {
  return `gate-${gateLogStamp(startedAt)}-${String(pid)}.log`;
}

/**
 * @param {string} root the repo root (the gate scripts run with cwd = root)
 * @param {Date} startedAt
 * @param {number} pid
 * @returns {string}
 */
export function gateLogPath(root, startedAt, pid) {
  return join(String(root), GATE_LOG_DIR, gateLogFileName(startedAt, pid));
}

/**
 * The first lines of every log: what ran, where, when — so a log found a week later can
 * be attributed without the terminal that produced it.
 *
 * @param {{ command: string, cwd: string, startedAt: Date }} args
 * @returns {string}
 */
export function gateLogHeader({ command, cwd, startedAt }) {
  return `---- gate started ${startedAt.toISOString()}\n---- cwd ${cwd}\n$ ${command}\n\n`;
}

/**
 * The last lines: exit code, signal if any, wall time. A log that ends WITHOUT this line
 * is a gate that died before it could say so — which is itself the diagnosis.
 *
 * @param {{ code: number | null, signal: string | null, startedAt: Date, endedAt: Date }} args
 * @returns {string}
 */
export function gateLogFooter({ code, signal, startedAt, endedAt }) {
  const seconds = Math.round((endedAt.getTime() - startedAt.getTime()) / 100) / 10;
  const outcome = signal ? `killed by ${signal}` : `exit ${String(code)}`;
  return `\n---- gate ended ${endedAt.toISOString()} (${outcome}, ${String(seconds)}s)\n`;
}

/**
 * Which files in the log directory to delete so that at most `keep` gate logs remain —
 * the OLDEST ones, by name (= by timestamp). Pure: takes a directory listing, returns
 * names. Files that are not gate logs (the Stop hook's `<session>.log`, anything else)
 * are never touched.
 *
 * @param {readonly string[]} names
 * @param {number} [keep]
 * @returns {string[]}
 */
export function logsToPrune(names, keep = GATE_LOG_KEEP) {
  const logs = names.filter((n) => LOG_NAME.test(n)).sort();
  if (logs.length <= keep) return [];
  return logs.slice(0, logs.length - keep);
}

/**
 * Open the gate log: create the directory, write the header, hand back a writer whose
 * every operation swallows its own failure (reporting it ONCE on `warn`) — logging is
 * fail-open, the gate is not.
 *
 * @param {{
 *   root: string,
 *   command: string,
 *   cwd: string,
 *   startedAt: Date,
 *   pid: number,
 *   fs: {
 *     mkdirSync: (dir: string, opts: { recursive: boolean }) => unknown,
 *     appendFileSync: (file: string, data: string | Uint8Array) => void,
 *     readdirSync: (dir: string) => string[],
 *     unlinkSync: (file: string) => void,
 *   },
 *   warn?: (message: string) => void,
 *   keep?: number,
 * }} args
 * @returns {{ path: string, write: (chunk: string | Uint8Array) => void, close: (result: { code: number | null, signal: string | null, endedAt: Date }) => void }}
 */
export function openGateLog({ root, command, cwd, startedAt, pid, fs, warn, keep }) {
  const dir = join(String(root), GATE_LOG_DIR);
  const path = gateLogPath(root, startedAt, pid);
  let broken = false;
  const fail = (what, err) => {
    if (broken) return;
    broken = true;
    warn?.(
      `gate-log: could not ${what} (${err instanceof Error ? err.message : String(err)}) - ` +
        `the gate still runs; its output is NOT being persisted\n`,
    );
  };

  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path, gateLogHeader({ command, cwd, startedAt }));
  } catch (err) {
    fail('open the gate log', err);
  }

  return {
    path,
    write(chunk) {
      if (broken) return;
      try {
        fs.appendFileSync(path, chunk);
      } catch (err) {
        fail('write the gate log', err);
      }
    },
    close({ code, signal, endedAt }) {
      if (!broken) {
        try {
          fs.appendFileSync(path, gateLogFooter({ code, signal, startedAt, endedAt }));
        } catch (err) {
          fail('close the gate log', err);
        }
      }
      // Prune AFTER the footer, and never the file just written: it is the newest by
      // name, so it is the last `logsToPrune` would ever pick.
      try {
        for (const name of logsToPrune(fs.readdirSync(dir), keep)) {
          fs.unlinkSync(join(dir, name));
        }
      } catch {
        // A failed prune costs disk, not evidence. Nothing to report.
      }
    },
  };
}
