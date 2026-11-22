import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { defaultFixedLayerBank } from '@cg/shared-ipc';
import { loadManagedCgPilotConfig } from '../src/managed-cg-pilot-config.js';

const env = {
  TEST_OPERATOR_A: 'test-A',
  TEST_OPERATOR_B: 'test-B',
};
const alpha = {
  origin: 'http://127.0.0.1:8080',
  engineId: 'A',
  channelCode: 'isolated-a',
  nativeChannel: 1,
  operatorTokenEnv: 'TEST_OPERATOR_A',
};
const beta = {
  origin: 'http://127.0.0.1:8081',
  engineId: 'B',
  channelCode: 'isolated-b',
  nativeChannel: 2,
  operatorTokenEnv: 'TEST_OPERATOR_B',
};
const config = { groupId: 'isolated-test', channel: 6, members: [alpha, beta] };

const scratchHomes: string[] = [];
function profile(input: unknown = config) {
  const directory = mkdtempSync(join(tmpdir(), 'cg-managed-pilot-config-'));
  scratchHomes.push(directory);
  const file = join(directory, 'pilot.json');
  writeFileSync(file, JSON.stringify(input));
  return { file, directory };
}

afterEach(() => {
  for (const directory of scratchHomes.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe('the isolated managed CG pilot launcher', () => {
  it('uses an isolated state home and a bank on its single channel', () => {
    const { file, directory } = profile();
    const loaded = loadManagedCgPilotConfig(file, directory, env);
    expect(loaded.stateHome).toBe(join(directory, 'external-cg-pilot', 'isolated-test'));
    expect(loaded.pilot.channel).toBe(6);
    expect(loaded.fixedLayers).toEqual({ ...defaultFixedLayerBank(), channel: 6 });
    expect(JSON.stringify(loaded)).not.toContain(env.TEST_OPERATOR_A);
    expect(JSON.stringify(loaded)).not.toContain(env.TEST_OPERATOR_B);
  });

  it('uses the pilot bank rather than the parent station bank, and refuses a wrong pilot channel', () => {
    const { file, directory } = profile();
    const parentBankFile = join(directory, '.cg-runtime', 'bridge-fixed-layers.json');
    mkdirSync(dirname(parentBankFile), { recursive: true });
    writeFileSync(parentBankFile, JSON.stringify(defaultFixedLayerBank()));
    const loaded = loadManagedCgPilotConfig(file, directory, env);
    expect(loaded.fixedLayers.channel).toBe(6);
    const localBankFile = join(loaded.stateHome, '.cg-runtime', 'bridge-fixed-layers.json');
    mkdirSync(dirname(localBankFile), { recursive: true });
    writeFileSync(localBankFile, JSON.stringify(defaultFixedLayerBank()));
    expect(() => loadManagedCgPilotConfig(file, directory, env)).toThrow(
      'single configured channel',
    );
  });

  it.each([
    { ...beta, origin: alpha.origin + '/' },
    { ...beta, engineId: alpha.engineId.toLowerCase() },
    { ...beta, operatorTokenEnv: alpha.operatorTokenEnv },
  ])('will not use an overlapping Engine mapping or token variable', (member) => {
    const { file, directory } = profile({ ...config, members: [alpha, member] });
    expect(() => loadManagedCgPilotConfig(file, directory, env)).toThrow('distinct Engine');
  });

  it.each([
    { ...beta, channelCode: '..' },
    { ...beta, token: 'should-not-leak' },
    { ...beta, origin: 'http://operator:should-not-leak@127.0.0.1:8081' },
  ])('refuses unsafe or unknown configuration fields without echoing their values', (member) => {
    const { file, directory } = profile({ ...config, members: [alpha, member] });
    expect(() => loadManagedCgPilotConfig(file, directory, env)).toThrow(
      /^Invalid managed CG pilot group, channel or member configuration\.$/,
    );
  });

  it('requires both tokens and refuses to duplicate a token through two environment variables', () => {
    const { file, directory } = profile();
    expect(() => loadManagedCgPilotConfig(file, directory, { TEST_OPERATOR_A: 'secret' })).toThrow(
      /^Managed CG pilot needs a separate operator token for each configured Engine\.$/,
    );
    expect(() =>
      loadManagedCgPilotConfig(file, directory, { ...env, TEST_OPERATOR_B: env.TEST_OPERATOR_A }),
    ).toThrow(/^Managed CG pilot needs a separate operator token for each configured Engine\.$/);
  });
});

describe('the real CLI entry point', () => {
  const cli = fileURLToPath(new URL('../bin/caspar-bridge.mjs', import.meta.url));
  it.each([
    [['--host', '0.0.0.0'], 'Control must bind to 127.0.0.1'],
    [['--auth', 'playout'], 'separate Engine operator sessions'],
    [['--service-config', 'missing-service-config.json'], 'cannot be combined with service'],
    [['--write-service-config', 'must-not-be-written.json'], 'cannot be combined with service'],
  ])('refuses incompatible pilot arguments %j before boot', (extra, reason) => {
    const { file, directory } = profile();
    const started = spawnSync(
      process.execPath,
      [cli, '--managed-cg-pilot', file, '--state-home', directory, ...extra],
      {
        cwd: directory,
        env: { ...process.env, ...env },
        encoding: 'utf8',
        timeout: 5_000,
      },
    );
    expect(started.status).toBe(1);
    expect(started.stderr).toContain(reason);
    expect(started.stderr).not.toContain('WS listening');
    expect(started.stderr).not.toContain(env.TEST_OPERATOR_A);
    expect(started.stderr).not.toContain(env.TEST_OPERATOR_B);
  });
});
