import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createBuildStamp } from '../src/buildStamp.mjs';

let scratch: string | null = null;

afterEach(() => {
  if (scratch !== null) fs.rmSync(scratch, { recursive: true, force: true });
  scratch = null;
});

function app(version: string): string {
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-splash-stamp-'));
  fs.writeFileSync(path.join(scratch, 'package.json'), JSON.stringify({ version }));
  return `${scratch}${path.sep}`;
}

describe('the startup build stamp', () => {
  it('puts a real release version on the first frame', () => {
    expect(createBuildStamp(app('0.12.6')).stampText).toMatch(
      /^v0\.12\.6 · .+ · \d{4}-\d{2}-\d{2}$/,
    );
  });

  it('does not advertise the development placeholder as a release', () => {
    expect(createBuildStamp(app('0.0.0')).stampText).not.toContain('0.0.0');
  });
});
