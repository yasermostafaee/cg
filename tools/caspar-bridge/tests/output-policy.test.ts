import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  creatableMissingConsumer,
  missingConsumerAddCommand,
  resolveCreateMissingConsumers,
} from '../src/output-check.js';

/**
 * `C-029` — the creation flag's DEFAULT, held to its answer three ways.
 *
 * The unit tests hold `resolveCreateMissingConsumers` and the command builder; the CLI test
 * spawns the shipped `bin/caspar-bridge.mjs` and reads the boot line, because a default
 * that is right in the resolver and wrong in the wiring (`createBridge({...})` with a
 * `?? true`, say) would leave every unit test green while a station's bridge started
 * `ADD`ing cards. Same shape as `live-layers-default.test.ts`, for the same reason.
 */

describe('C-029 · resolveCreateMissingConsumers — OFF is the default', () => {
  it('🔴 saying NOTHING resolves to OFF — this reddens if the default flips to on', () => {
    expect(resolveCreateMissingConsumers(undefined)).toBe(false);
  });

  it('an explicit false is OFF; only an explicit true is ON', () => {
    expect(resolveCreateMissingConsumers(false)).toBe(false);
    expect(resolveCreateMissingConsumers(true)).toBe(true);
  });
});

describe('C-029 · missingConsumerAddCommand — the declaration’s OWN parameters, verbatim', () => {
  it('the plant’s declaration: device, embedded audio, default keyer', () => {
    expect(
      missingConsumerAddCommand(1, {
        kind: 'decklink',
        device: '23487013',
        embeddedAudio: true,
        keyer: 'default',
      }),
    ).toBe('ADD 1 DECKLINK 23487013 EMBEDDED_AUDIO');
  });

  it('spells the keyer and key-only the way parse_amcp_config reads them', () => {
    expect(missingConsumerAddCommand(2, { kind: 'decklink', device: '1', keyer: 'internal' })).toBe(
      'ADD 2 DECKLINK 1 INTERNAL_KEY',
    );
    expect(
      missingConsumerAddCommand(2, {
        kind: 'decklink',
        device: '1',
        keyer: 'external',
        keyOnly: true,
        embeddedAudio: false,
      }),
    ).toBe('ADD 2 DECKLINK 1 EXTERNAL_KEY KEY_ONLY');
  });

  it('🔴 builds nothing for a kind it has not measured, and nothing for a DeckLink with no device', () => {
    expect(missingConsumerAddCommand(1, { kind: 'screen' })).toBeNull();
    expect(missingConsumerAddCommand(1, { kind: 'system-audio' })).toBeNull();
    expect(missingConsumerAddCommand(1, { kind: 'ndi' })).toBeNull();
    expect(missingConsumerAddCommand(1, { kind: 'decklink' })).toBeNull();
  });
});

describe('C-029 · creatableMissingConsumer', () => {
  it('picks the missing DeckLink, never a present one and never a monitor', () => {
    expect(
      creatableMissingConsumer({
        declared: [{ kind: 'decklink', device: '23487013' }, { kind: 'screen' }],
        missing: [{ kind: 'decklink', declared: 1, running: 0, devices: ['23487013'] }],
      }),
    ).toEqual({ kind: 'decklink', device: '23487013' });
    expect(
      creatableMissingConsumer({
        declared: [{ kind: 'decklink', device: '23487013' }, { kind: 'screen' }],
        missing: [{ kind: 'screen', declared: 1, running: 0, devices: [] }],
      }),
    ).toBeNull();
    expect(creatableMissingConsumer({ declared: null, missing: [] })).toBeNull();
  });
});

const CLI = fileURLToPath(new URL('../bin/caspar-bridge.mjs', import.meta.url));
const DIST = fileURLToPath(new URL('../dist/index.js', import.meta.url));

function tmpHome(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cg-output-policy-'));
}

/**
 * Run the real CLI with a private home against a deliberately dead CasparCG; resolve with
 * everything it printed once it has either booted past the creation line or exited.
 */
async function runCli(
  extraArgs: readonly string[],
): Promise<{ out: string; exitCode: number | null }> {
  if (!fs.existsSync(DIST)) {
    throw new Error(
      `${DIST} is missing — this test drives the shipped CLI, which imports dist/. ` +
        'Run `pnpm --filter @cg/caspar-bridge build` (the gate does this via turbo).',
    );
  }
  const home = tmpHome();
  const child = spawn(
    process.execPath,
    [
      CLI,
      '--port',
      '0',
      '--caspar-host',
      '127.0.0.1',
      '--amcp-port',
      '1',
      '--osc-port',
      '0',
      ...extraArgs,
    ],
    {
      env: { ...process.env, HOME: home, USERPROFILE: home },
      stdio: ['ignore', 'ignore', 'pipe'],
    },
  );
  let out = '';
  let exitCode: number | null = null;
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`the CLI never printed its creation line. stderr so far:\n${out}`));
      }, 30_000);
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (chunk: string) => {
        out += chunk;
        if (out.includes('missing-consumer creation:')) {
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
        exitCode = code;
        resolve();
      });
    });
  } finally {
    child.kill();
  }
  return { out, exitCode };
}

describe('C-029 · the shipped CLI — creation is OFF with nothing configured', () => {
  it('🔴 a bridge started with NO flag says creation is OFF — reddens if the default, or its wiring, flips', async () => {
    const { out } = await runCli([]);
    expect(out).toMatch(/missing-consumer creation: OFF \(default\)/);
    expect(out).toMatch(/REPORTED .* never created/);
    expect(out).not.toMatch(/missing-consumer creation: ON/);
  }, 45_000);

  it('--create-missing-consumers turns it on, and the boot line says what that means', async () => {
    const { out } = await runCli(['--create-missing-consumers']);
    expect(out).toMatch(/missing-consumer creation: ON \(--create-missing-consumers\)/);
    expect(out).toMatch(/never a substitute/);
  }, 45_000);

  it('a VALUE on the flag is refused at boot rather than read as on or off', async () => {
    const { out, exitCode } = await runCli(['--create-missing-consumers=yes']);
    expect(out).toMatch(/--create-missing-consumers takes no value/);
    expect(exitCode).toBe(1);
  }, 45_000);
});
