/**
 * `DEV-STATION-01` — **WHO HOLDS THE STATION'S PORTS**, for the launcher: read, and never stopped.
 * `CENTRAL-BRIDGE-01` took the stop code out: a CG Bridge service holding those ports is not the
 * dev station's to end (`assess` in `station-plan.mjs` says why).
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
 * Every program on one of the station's ports, by name. Windows reads `tasklist` and `netstat -ano`
 * (the readers the bridge's connection check uses, `connection-check.ts`). Elsewhere there is no CG
 * Bridge service, and a held port is reported by the process that fails to bind it.
 */
export async function probeStation(platform = process.platform, ports = STATION_PORTS) {
  if (platform !== 'win32') return { blocked: [] };
  const [tasks, table] = await Promise.all([
    run('tasklist', ['/FO', 'CSV', '/NH']),
    run('netstat', ['-ano']),
  ]);
  return assess(parseTasklist(tasks), parseNetstat(table), ports);
}
