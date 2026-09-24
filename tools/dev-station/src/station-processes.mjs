/**
 * `DEV-STATION-01` — **WHO IS RUNNING, AND STOPPING IT**, for the launcher. Separate from the
 * sequence so the tests stop a real process with the real code.
 */
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  CONSOLE_URL,
  STATION_PORTS,
  assess,
  parseNetstat,
  parseTasklist,
} from './station-plan.mjs';

/**
 * The one page the bridge's own console listener serves (it will not start without an
 * `index.html`): a pointer to the real console, which is Vite's on 5174.
 */
export function writeConsoleStub(consoleDir) {
  fs.mkdirSync(consoleDir, { recursive: true });
  fs.writeFileSync(
    path.join(consoleDir, 'index.html'),
    `<!doctype html><meta charset="utf-8"><title>CG Control dev station</title>` +
      `<p>The console is at <a href="${CONSOLE_URL}">${CONSOLE_URL}</a>.</p>\n`,
    'utf8',
  );
}

function run(file, args) {
  return new Promise((resolve) => {
    execFile(file, args, { windowsHide: true, encoding: 'utf8', timeout: 10_000 }, (err, stdout) =>
      resolve(err === null ? stdout : ''),
    );
  });
}

/**
 * The installed CG Control's processes, and any other program on the station's ports. Windows
 * reads `tasklist` and `netstat -ano` (the readers `sidecar.rs` uses). Elsewhere there is no
 * installed CG Control, and a held port is reported by the process that fails to bind it.
 */
export async function probeStation(platform = process.platform, ports = STATION_PORTS) {
  if (platform !== 'win32') return { installed: [], blocked: [] };
  const [tasks, table] = await Promise.all([
    run('tasklist', ['/FO', 'CSV', '/NH']),
    run('netstat', ['-ano']),
  ]);
  return assess(parseTasklist(tasks), parseNetstat(table), ports);
}

/** Is this process still there? */
export function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM: it exists and belongs to someone else — still alive.
    return err instanceof Error && 'code' in err && err.code === 'EPERM';
  }
}

async function waitGone(pids, ms) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (pids.every((pid) => !isAlive(pid))) return true;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  return pids.every((pid) => !isAlive(pid));
}

/**
 * Stop these processes: ASKED to close first (on Windows `taskkill /T` without `/F`, which a
 * window receives as a close, so CG Control shuts its own bridge down), then ended if they have
 * not gone within `graceMs`. Called only after the operator said yes.
 */
export async function stopProcesses(pids, { platform = process.platform, graceMs = 8000 } = {}) {
  if (pids.length === 0) return;
  if (platform === 'win32') {
    await Promise.all(pids.map((pid) => run('taskkill', ['/PID', String(pid), '/T'])));
  } else {
    for (const pid of pids) {
      try {
        process.kill(pid, 'SIGTERM');
      } catch {
        // Already gone.
      }
    }
  }
  if (await waitGone(pids, graceMs)) return;
  const left = pids.filter((pid) => isAlive(pid));
  if (platform === 'win32') {
    await Promise.all(left.map((pid) => run('taskkill', ['/PID', String(pid), '/T', '/F'])));
  } else {
    for (const pid of left) {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        // Already gone.
      }
    }
  }
  await waitGone(left, 5000);
}
