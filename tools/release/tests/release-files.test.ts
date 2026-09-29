import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  assembleRelease,
  expectedAssets,
  releaseFiles,
  sumsProblems,
  verifyDownloaded,
  type UploadedAsset,
} from '../src/release-files.mjs';

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
function built(
  version: string,
  skip: readonly string[] = [],
): { installers: string; guide: string } {
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
    expect(
      assembleRelease({
        version: '0.9.0',
        installersDir: installers,
        guidePdf: guide,
        outDir: out,
      }),
    ).toEqual(expectedAssets('0.9.0'));
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
      assembleRelease({
        version: '0.9.0',
        installersDir: installers,
        guidePdf: guide,
        outDir: out,
      }),
    ).toThrow(/holds \[.*stray\.txt.*\], not/);
  });
});

/**
 * 🔴 `P-060` (`RELEASE-091-01` §5) — the release's `SHA256SUMS.txt`, checked against the assets as
 * UPLOADED. The owner held a sums file naming `CG Control_0.9.0_x64-setup.exe` — the installer job's,
 * with a space, a name no release holds — so the check that matters is the one that refuses a name.
 */
describe('P-060 — SHA256SUMS.txt against the uploaded assets', () => {
  const VERSION = '0.9.1';
  const names = releaseFiles(VERSION);
  const CONTROL = 'control-installer';
  const DESIGNER = 'designer-installer';
  const GUIDE = '%PDF-1.7 guide';
  const bytes: readonly (readonly [string, string])[] = [
    [names.control.name, CONTROL],
    [names.designer.name, DESIGNER],
    [names.guide, GUIDE],
  ];
  const goodSums =
    `${sha(GUIDE)}  ${names.guide}\n` +
    `${sha(CONTROL)}  ${names.control.name}\n` +
    `${sha(DESIGNER)}  ${names.designer.name}\n`;
  const uploaded = (
    over: Partial<Record<string, { sha256?: string | null; digest?: string | null }>> = {},
  ): UploadedAsset[] =>
    [...bytes, [names.sums, goodSums] as const].map(([name, content]) => ({
      name,
      sha256: over[name]?.sha256 !== undefined ? over[name].sha256 : sha(content),
      digest: over[name]?.digest ?? null,
    }));

  it('the sums the release job writes match what it uploads', () => {
    expect(sumsProblems(goodSums, uploaded())).toEqual([]);
    // GitHub's digest, when reported, agreeing is not a problem either.
    expect(
      sumsProblems(
        goodSums,
        uploaded({ [names.control.name]: { digest: `sha256:${sha(CONTROL)}` } }),
      ),
    ).toEqual([]);
  });

  it('🔴 CONTROL — a line naming a file the release does not hold fails, naming the line: the 0.9.0 job’s own sums', () => {
    const jobs = goodSums.replace(names.control.name, names.control.built);
    expect(jobs).toContain('CG Control_0.9.1_x64-setup.exe');
    expect(sumsProblems(jobs, uploaded())).toEqual([
      'line 2 names "CG Control_0.9.1_x64-setup.exe", which the release does not hold',
      `"${names.control.name}" has no line in SHA256SUMS.txt`,
    ]);
  });

  it('a hash that is not the uploaded file’s fails, and so does GitHub’s digest disagreeing', () => {
    expect(
      sumsProblems(
        goodSums,
        uploaded({ [names.designer.name]: { sha256: sha('something else') } }),
      ),
    ).toEqual([
      `line 3: "${names.designer.name}" is ${sha('something else')} as uploaded, not ${sha(DESIGNER)}`,
    ]);
    expect(
      sumsProblems(goodSums, uploaded({ [names.guide]: { digest: `sha256:${sha('other')}` } })),
    ).toEqual([
      `line 1: GitHub's digest of "${names.guide}" is sha256:${sha('other')}, not sha256:${sha(GUIDE)}`,
    ]);
  });

  it('a missing line, a repeated one, a malformed one and an unreadable asset each fail', () => {
    const [first = '', second = ''] = goodSums.split('\n');
    expect(sumsProblems(`${first}\n${second}\n`, uploaded())).toEqual([
      `"${names.designer.name}" has no line in SHA256SUMS.txt`,
    ]);
    expect(sumsProblems(`${goodSums}${second}\n`, uploaded())).toEqual([
      `line 4 names "${names.control.name}" a second time`,
    ]);
    expect(sumsProblems(`${goodSums}not a sum\n`, uploaded())).toEqual([
      'line 4 is not "<sha256>  <name>": "not a sum"',
    ]);
    expect(sumsProblems(goodSums, uploaded({ [names.guide]: { sha256: null } }))).toEqual([
      `line 1: "${names.guide}" could not be read back from the release`,
    ]);
  });

  it('reads a downloaded release folder and GitHub’s asset list, as the release job hands them over', () => {
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-release-verify-'));
    const dir = path.join(scratch, 'uploaded');
    fs.mkdirSync(dir);
    for (const [name, content] of bytes) fs.writeFileSync(path.join(dir, name), content);
    fs.writeFileSync(path.join(dir, names.sums), goodSums);
    const list = path.join(scratch, 'assets.json');
    // `gh release view --json assets`, written by pwsh (a BOM is tolerated).
    const assets = [...bytes.map(([name]) => name), names.sums].map((name) => ({ name, size: 1 }));
    fs.writeFileSync(list, `\uFEFF${JSON.stringify({ assets })}`);
    expect(verifyDownloaded({ dir, assetsJson: list })).toEqual([]);

    // The release lists an asset the download lacks: it cannot be read back.
    fs.rmSync(path.join(dir, names.designer.name));
    expect(verifyDownloaded({ dir, assetsJson: list })).toEqual([
      `line 3: "${names.designer.name}" could not be read back from the release`,
    ]);
  });
});
