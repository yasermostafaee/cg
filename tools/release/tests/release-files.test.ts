import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { assembleRelease, expectedAssets, releaseFiles } from '../src/release-files.mjs';

/**
 * 🔴 `CLIENT-TEST-RELEASE-01` B4 — the draft release's four files, assembled from what the installer
 * job built: renamed without the space GitHub would rewrite, hashed in `sha256sum`'s own format, and
 * refused unless exactly four are there.
 */

let scratch: string | null = null;
afterEach(() => {
  if (scratch !== null) fs.rmSync(scratch, { recursive: true, force: true });
  scratch = null;
});

/** A job's download folder, with both installers as Tauri names them, and a guide PDF. */
function built(version: string, skip: readonly string[] = []): { installers: string; guide: string } {
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-release-files-'));
  const installers = path.join(scratch, 'installers');
  fs.mkdirSync(installers);
  const names = releaseFiles(version);
  for (const [name, bytes] of [
    [names.control.built, 'control-installer'],
    [names.designer.built, 'designer-installer'],
    ['SHA256SUMS.txt', 'the installer job’s own sums'],
  ] as const) {
    if (!skip.includes(name)) fs.writeFileSync(path.join(installers, name), bytes);
  }
  const guide = path.join(scratch, 'guide.pdf');
  fs.writeFileSync(guide, '%PDF-1.7 guide');
  return { installers, guide };
}

const sha = (text: string): string => createHash('sha256').update(text).digest('hex');

describe('CLIENT-TEST-RELEASE-01 B4 — the release’s four files', () => {
  it('names them for the version, with no space in any', () => {
    expect(expectedAssets('0.9.0')).toEqual([
      'APASAI-CG-0.9.0-install-guide-fa.pdf',
      'CG-Control_0.9.0_x64-setup.exe',
      'CG-Designer_0.9.0_x64-setup.exe',
      'SHA256SUMS.txt',
    ]);
    for (const name of expectedAssets('0.9.0')) expect(name).not.toMatch(/\s/);
    // The built names are Tauri's — the ones the smoke checks.
    expect(releaseFiles('0.9.0').control.built).toBe('CG Control_0.9.0_x64-setup.exe');
  });

  it('assembles exactly the four, and SHA256SUMS.txt is sha256sum’s own format over the other three', () => {
    const { installers, guide } = built('0.9.0');
    const out = path.join(scratch as string, 'release');
    expect(assembleRelease({ version: '0.9.0', installersDir: installers, guidePdf: guide, outDir: out })).toEqual(
      expectedAssets('0.9.0'),
    );
    expect(fs.readFileSync(path.join(out, 'SHA256SUMS.txt'), 'utf8')).toBe(
      `${sha('%PDF-1.7 guide')}  APASAI-CG-0.9.0-install-guide-fa.pdf\n` +
        `${sha('control-installer')}  CG-Control_0.9.0_x64-setup.exe\n` +
        `${sha('designer-installer')}  CG-Designer_0.9.0_x64-setup.exe\n`,
    );
    // The installer job's own sums (over its built names) never rides along.
    expect(fs.readFileSync(path.join(out, 'CG-Control_0.9.0_x64-setup.exe'), 'utf8')).toBe(
      'control-installer',
    );
  });

  it('CONTROL — a missing installer is refused, naming it', () => {
    const { installers, guide } = built('0.9.0', ['CG Designer_0.9.0_x64-setup.exe']);
    expect(() =>
      assembleRelease({
        version: '0.9.0',
        installersDir: installers,
        guidePdf: guide,
        outDir: path.join(scratch as string, 'release'),
      }),
    ).toThrow(/CG Designer_0\.9\.0_x64-setup\.exe is not in/);
  });

  it('CONTROL — a fifth file in the release folder is refused', () => {
    const { installers, guide } = built('0.9.0');
    const out = path.join(scratch as string, 'release');
    fs.mkdirSync(out);
    fs.writeFileSync(path.join(out, 'stray.txt'), 'x');
    expect(() =>
      assembleRelease({ version: '0.9.0', installersDir: installers, guidePdf: guide, outDir: out }),
    ).toThrow(/holds \[.*stray\.txt.*\], not/);
  });
});
