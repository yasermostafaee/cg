import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBuildStamp } from '../src/buildStamp.mjs';

const { gitRevision } = vi.hoisted(() => ({
  gitRevision: vi.fn<(...args: unknown[]) => string>(),
}));
vi.mock('node:child_process', () => ({ execFileSync: gitRevision }));

let scratch: string | null = null;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-05T09:10:11.000Z'));
  gitRevision.mockReset();
  gitRevision.mockReturnValue('1a2b3c4d\n');
});

afterEach(() => {
  if (scratch !== null) fs.rmSync(scratch, { recursive: true, force: true });
  scratch = null;
  vi.useRealTimers();
});

function app(version: string): string {
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-splash-stamp-'));
  fs.writeFileSync(path.join(scratch, 'package.json'), JSON.stringify({ version }));
  return `${scratch}${path.sep}`;
}

describe('the startup build stamp', () => {
  it('labels the exact release, known revision and build date on the first frame', () => {
    const result = createBuildStamp(app('0.12.6'));
    expect(result.stamp).toEqual({
      version: '0.12.6',
      sha: '1a2b3c4d',
      builtAt: '2026-11-05',
    });
    expect(result.stampText).toBe('Version 0.12.6 · Revision 1a2b3c4d · Build date 2026-11-05');
  });

  it('retains a known revision when the release version is unavailable', () => {
    const result = createBuildStamp(app('0.0.0'));
    expect(result.stamp.version).toBe('0.0.0');
    expect(result.stampText).toBe('Revision 1a2b3c4d · Build date 2026-11-05');
  });

  it('retains the release version when Git is unavailable', () => {
    gitRevision.mockImplementation(() => {
      throw new Error('Git unavailable');
    });
    const result = createBuildStamp(app('0.12.6'));
    expect(result.stamp.sha).toBe('nogit');
    expect(result.stampText).toBe('Version 0.12.6 · Build date 2026-11-05');
  });

  it('does not advertise unavailable development identities', () => {
    gitRevision.mockReturnValue(' \n');
    const result = createBuildStamp(app('0.0.0'));
    expect(result.stamp.sha).toBe('nogit');
    expect(result.stampText).toBe('Build date 2026-11-05');
  });
});
