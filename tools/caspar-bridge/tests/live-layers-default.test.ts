import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { defaultLiveLayersPath, resolveLiveLayersPath } from '../src/live-layers-store.js';

/**
 * 🔴 **B-145's second half — persistence must be ON BY DEFAULT, and a test must be able to
 * TELL.**
 *
 * The first cut landed the store behind a `liveLayersPath` option that nothing defaulted.
 * Two defects, and the second is the worse one:
 *
 * 1. a station that never configured it still lost its ledger — a safety mechanism that
 *    defaults off is a safety mechanism the station does not have; and
 * 2. **every test passed either way.** Nothing could distinguish the protected
 *    configuration from the unprotected one, so nothing would have caught the default
 *    drifting back to off. That is the class this repo keeps paying for: `autoSqueeze` is
 *    a schema field with a Designer control that writes it and no reader (`B-147`);
 *    `resolvePlateAspect`'s `assumed` flag has zero readers (`B-143`).
 *
 * **This file is written to go RED if the default regresses to off**, and that property was
 * verified rather than asserted: flipping `resolveLiveLayersPath`'s final line to
 * `return null`, REBUILDING `dist/`, and re-running reddens FOUR of these — the two 🔴
 * resolver tests and both CLI tests that expect persistence — after which it was flipped
 * back and rebuilt again. The rebuild is the load-bearing half: the CLI tests drive
 * `dist/`, so a comparison without it would have measured the old artifact twice.
 */

const dirs: string[] = [];
function tmpHome(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-home-'));
  dirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe('B-145 · 1.1 — persistence is the DEFAULT, not an opt-in', () => {
  it('🔴 saying NOTHING resolves to the station ledger path — this reddens if the default flips to off', () => {
    const home = tmpHome();
    expect(resolveLiveLayersPath(undefined, home)).toBe(
      path.join(home, '.cg-runtime', 'bridge-live-layers.json'),
    );
  });

  it('the default follows the sibling stores’ convention, not a path of its own invention', () => {
    // Every other bridge store lives at ~/.cg-runtime/bridge-<thing>.json — the connection,
    // the fixed bank, the reserved layers, the template dir, the source catalog, the
    // assignments, the audit log. A ledger somewhere else is one more place an operator has
    // to be told about.
    const home = tmpHome();
    const resolved = defaultLiveLayersPath(home);
    expect(path.dirname(resolved)).toBe(path.join(home, '.cg-runtime'));
    expect(path.basename(resolved)).toMatch(/^bridge-.*\.json$/);
  });

  it('⚠ it is NOT inside the template directory — the registry reads every *.json there as a template (B-116)', () => {
    const home = tmpHome();
    expect(path.dirname(defaultLiveLayersPath(home))).not.toBe(
      path.join(home, '.cg-runtime', 'bridge-templates'),
    );
  });
});

describe('B-145 · 1.2 — OFF is a thing you SAY, never the absence of a thing you said', () => {
  it('🔴 only an explicit `false` switches persistence off', () => {
    const home = tmpHome();
    expect(resolveLiveLayersPath(false, home)).toBeNull();
    // …and the two ways of NOT saying it both stay on.
    expect(resolveLiveLayersPath(undefined, home)).not.toBeNull();
  });

  it('an explicit path is used exactly as given', () => {
    const explicit = path.join(tmpHome(), 'elsewhere', 'ledger.json');
    expect(resolveLiveLayersPath(explicit, tmpHome())).toBe(explicit);
  });
});

/**
 * 🔴 **1.3 — the WIRING guard, and the reason this file spawns a process.**
 *
 * The unit tests above hold `resolveLiveLayersPath` to its answer, but they cannot see the
 * one line that carries that answer into `createBridge`. Deleting `liveLayersPath` from
 * the CLI's options object would leave every one of them green while the station lost its
 * ledger again — which is precisely the "passes either way" defect this file exists to
 * close, reintroduced one layer up.
 *
 * So this runs the thing a station actually runs, with `HOME` pointed at a temp directory,
 * and reads the boot line. It needs `dist/`, which `turbo.json` guarantees: the `test` task
 * `dependsOn: ["^build", "build"]`.
 */
const CLI = fileURLToPath(new URL('../bin/caspar-bridge.mjs', import.meta.url));
const DIST = fileURLToPath(new URL('../dist/index.js', import.meta.url));

/** Boot the real CLI with a private home, and return the boot lines it printed. */
async function bootCli(home: string, extraArgs: readonly string[] = []): Promise<string> {
  if (!fs.existsSync(DIST)) {
    throw new Error(
      `${DIST} is missing — this test drives the shipped CLI, which imports dist/. ` +
        'Run `pnpm --filter @cg/caspar-bridge build` (the gate does this via turbo).',
    );
  }
  const child = spawn(
    process.execPath,
    [
      CLI,
      '--port',
      '0',
      // A deliberately dead CasparCG, exactly as the sibling integration tests use: the
      // bridge must boot and print its provenance whether or not a server answers, and a
      // test must never reach out to a real one that happens to be running on this host.
      '--caspar-host',
      '127.0.0.1',
      '--amcp-port',
      '1',
      '--osc-port',
      '0',
      ...extraArgs,
    ],
    {
      env: {
        ...process.env,
        // Node resolves os.homedir() from USERPROFILE on Windows and HOME on POSIX.
        HOME: home,
        USERPROFILE: home,
      },
      stdio: ['ignore', 'ignore', 'pipe'],
    },
  );
  let out = '';
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`the CLI never printed its ledger line. stderr so far:\n${out}`));
      }, 30_000);
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (chunk: string) => {
        out += chunk;
        if (out.includes('live layer ledger:')) {
          clearTimeout(timer);
          resolve();
        }
      });
      child.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
      child.on('exit', (code) => {
        clearTimeout(timer);
        reject(new Error(`the CLI exited (${String(code)}) before booting. stderr:\n${out}`));
      });
    });
  } finally {
    child.kill();
  }
  return out;
}

describe('B-145 · 1.3 — the shipped CLI persists by default, with nothing configured', () => {
  it('🔴 a bridge started with NO --live-layers-path adopts the station ledger — reddens if the default, or its wiring, regresses', async () => {
    const home = tmpHome();
    const file = defaultLiveLayersPath(home);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    // A ledger left behind by a bridge that stopped with three layers seated.
    fs.writeFileSync(
      file,
      JSON.stringify([
        [
          'item-a',
          [
            {
              slot: { channel: 1, layer: 10 },
              sourceId: 'guest-1',
              role: 'fill',
              producer: 'route://1-11',
              fill: { x: 0, y: 0, width: 1, height: 1 },
              clip: { x: 0, y: 0, width: 1, height: 1 },
              intendedVolume: 0,
            },
          ],
        ],
      ]),
      'utf8',
    );

    const out = await bootCli(home);

    // The claim is not "a line was printed" — it is that this bridge ADOPTED, from the
    // path nobody configured.
    expect(out).toMatch(/live layer ledger: adopted 1 item\(s\)/);
    expect(out).toContain(file);
    expect(out).not.toMatch(/NOT PERSISTED/);
  }, 45_000);

  it('with no file yet it says so and starts persisting — never silently unprotected', async () => {
    const out = await bootCli(tmpHome());
    expect(out).toMatch(/live layer ledger: nothing to adopt .* persisting from now on/);
    expect(out).not.toMatch(/NOT PERSISTED/);
  }, 45_000);

  it('--no-live-layers switches it off, and the boot line SAYS the consequence', async () => {
    const out = await bootCli(tmpHome(), ['--no-live-layers']);
    expect(out).toMatch(/live layer ledger: NOT PERSISTED/);
    // A station in this state must be able to read WHY it will hurt, on the line itself.
    expect(out).toMatch(/will NOT survive a restart/);
  }, 45_000);
});
