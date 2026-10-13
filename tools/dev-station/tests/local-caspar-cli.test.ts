import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * 🔴 `DEV-LOCAL-CASPAR-01` — **REFUSED AT START, IN ONE LINE.** The launcher, run as the owner runs it,
 * with a `--caspar` that is not this machine: it answers in one line with exit 2 BEFORE it probes,
 * builds or starts anything — its state folder is not even made, and nothing is dialled. The rule
 * itself (`parseCasparTarget`, `local-caspar-station.ts`) is pinned in the bridge's suite; this pins
 * that the launcher asks it first.
 *
 * ⚠ The rule is TypeScript the launcher runs by type stripping (Node 23+). On an older Node — CI pins
 * 22 — the launcher refuses `--caspar` for THAT reason instead: still one line, still before anything
 * runs. Each spec says which refusal it met, so a run on either Node is read for what it measured.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(here, '../src/dev-station-cli.mjs');
const STRIPS = Number(process.versions.node.split('.')[0]) >= 23;
const NODE_REFUSAL =
  /^--caspar needs Node 23 or newer \(it runs the test suite's fakes from their TypeScript\) — this is Node /;

const homes: string[] = [];
afterEach(() => {
  for (const home of homes.splice(0)) fs.rmSync(home, { recursive: true, force: true });
});

/** The launcher, with its state under a scratch folder. Node's own warning lines are not ours. */
function launch(args: readonly string[]): {
  status: number | null;
  lines: string[];
  state: string;
} {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-dev-caspar-'));
  homes.push(home);
  const state = path.join(home, 'dev');
  const result = spawnSync(process.execPath, [CLI, ...args], {
    env: { ...process.env, CG_DEV_STATION_HOME: state },
    encoding: 'utf8',
    timeout: 30_000,
  });
  const lines = (result.stderr ?? '')
    .split(/\r?\n/)
    .filter((l) => l.trim() !== '')
    .filter((l) => !/^\(node:\d+\)|ExperimentalWarning|--trace-warnings/.test(l));
  return { status: result.status, lines, state };
}

describe('`--fake --caspar` names a machine that is not this one: one line, exit 2, nothing started', () => {
  it.each([
    [
      '192.168.21.111:5250',
      "192.168.21.111 is the test Playout's machine — --caspar never connects there. --caspar takes this machine's CasparCG only: 127.0.0.1:5250.",
    ],
    [
      '192.168.21.114:5250',
      "192.168.21.114 is the plant's CasparCG — --caspar never connects there. --caspar takes this machine's CasparCG only: 127.0.0.1:5250.",
    ],
    [
      '10.0.0.5:5250',
      "10.0.0.5 is not this machine — --caspar takes this machine's CasparCG only: 127.0.0.1:5250 (127.0.0.1, ::1 or localhost).",
    ],
    [
      '127.0.0.1:5251',
      '--caspar takes port 5250 only: first-run connects the station to CasparCG on 5250, whatever the Playout lists.',
    ],
  ])('%s', (given, refusal) => {
    const run = launch(['--fake', '--caspar', given, '--no-open']);
    expect(run.status).toBe(2);
    expect(run.lines).toHaveLength(1);
    if (STRIPS) expect(run.lines[0]).toBe(refusal);
    else expect(run.lines[0]).toMatch(NODE_REFUSAL);
    // Before anything ran: not even the state folder was made.
    expect(fs.existsSync(run.state)).toBe(false);
  });

  it('--caspar without --fake is refused before anything else, on any Node', () => {
    const run = launch(['--caspar', '127.0.0.1:5250']);
    expect(run.status).toBe(2);
    expect(run.lines).toEqual([
      '--caspar goes with --fake: pnpm dev:station --fake --caspar 127.0.0.1:5250.',
    ]);
    expect(fs.existsSync(run.state)).toBe(false);
  });
});
