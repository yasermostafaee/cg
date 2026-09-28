import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { missingConsumerAddCommand } from '../src/output-check.js';

/**
 * `C-029` / `FOLLOWUPS-01` A — `--create-missing-consumers` is RETIRED (the owner, 2026-09-28): a
 * consumer `ADD` is one of the Playout's C5 commands this station never sends, so a missing output
 * is reported and never created. That half is held at the wire by `output-check.integration.test.ts`.
 *
 * This file holds the CLI half, by spawning the shipped `bin/caspar-bridge.mjs`: a station whose
 * start script still passes the flag — bare, or with a value the old parser refused — must BOOT,
 * and be told once that the flag does nothing. A station that will not start is worse than a flag
 * that no longer does anything.
 *
 * `missingConsumerAddCommand` stays, for the skew harness only (`C-033`); its grammar is held here.
 */

describe('C-033 · missingConsumerAddCommand — the declaration’s OWN parameters, verbatim', () => {
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

const CLI = fileURLToPath(new URL('../bin/caspar-bridge.mjs', import.meta.url));
const DIST = fileURLToPath(new URL('../dist/index.js', import.meta.url));

function tmpHome(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cg-output-policy-'));
}

/**
 * Run the real CLI with a private home against a deliberately dead CasparCG; resolve with
 * everything it printed once it has either reached its listening line or exited.
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
        reject(new Error(`the CLI never printed its listening line. stderr so far:\n${out}`));
      }, 30_000);
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (chunk: string) => {
        out += chunk;
        if (out.includes('WS listening on')) {
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

const RETIRED = /--create-missing-consumers is retired and ignored/;

describe('C-029 · the shipped CLI — `--create-missing-consumers` is retired', () => {
  it('a bridge started with no flag boots and says nothing about it', async () => {
    const { out, exitCode } = await runCli([]);
    expect(out).toMatch(/WS listening on/);
    expect(exitCode).toBeNull();
    expect(out).not.toMatch(/create-missing-consumers|missing-consumer creation/);
  }, 45_000);

  it('🔴 the bare flag still BOOTS, is named as retired and ignored, and turns nothing on', async () => {
    const { out, exitCode } = await runCli(['--create-missing-consumers']);
    expect(out).toMatch(RETIRED);
    expect(out).toMatch(/WS listening on/);
    expect(exitCode).toBeNull();
    expect(out).not.toMatch(/missing-consumer creation: ON/);
  }, 45_000);

  it('a VALUE on the flag, once a boot refusal, now boots the same way', async () => {
    const { out, exitCode } = await runCli(['--create-missing-consumers=yes']);
    expect(out).toMatch(RETIRED);
    expect(out).toMatch(/WS listening on/);
    expect(exitCode).toBeNull();
  }, 45_000);
});
