import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  VERSION_SOURCES,
  isReleaseVersion,
  readVersions,
  releaseVersion,
  tagRefusal,
  versionIn,
} from '../src/release-version.mjs';

/**
 * 🔴 `CLIENT-TEST-RELEASE-01` B1 — the three parts a client installs carry ONE version, read from
 * every file that writes it. The instrument is proven both ways: the real tree reads one release
 * version, and a copy of it with one file changed is refused by name.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const RELEASE = '0.9.0';

let scratch: string | null = null;

afterEach(() => {
  if (scratch !== null) fs.rmSync(scratch, { recursive: true, force: true });
  scratch = null;
});

/** A copy of just the version files, to plant a drift in without touching the tree. */
function copyOfTheSources(): string {
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-release-version-'));
  for (const { file } of VERSION_SOURCES) {
    const to = path.join(scratch, file);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(path.join(ROOT, file), to);
  }
  return scratch;
}

describe('CLIENT-TEST-RELEASE-01 B1 — one version for CG Control, CG Designer and the bridge', () => {
  it(`every file that carries a part's version says ${RELEASE}`, () => {
    const read = readVersions(ROOT);
    // Positive control: every source was found and parsed — none reads as missing.
    expect(read).toHaveLength(9);
    for (const entry of read) expect(entry.version, entry.file).not.toBeNull();
    expect(new Set(read.map((entry) => entry.part))).toEqual(
      new Set(['CG Control', 'CG Designer', 'the bridge']),
    );
    expect(releaseVersion(ROOT)).toBe(RELEASE);
  });

  it('CONTROL — one file drifting is refused, and the refusal names every file and its value', () => {
    const root = copyOfTheSources();
    const conf = path.join(root, 'apps/designer/src-tauri/tauri.conf.json');
    fs.writeFileSync(conf, fs.readFileSync(conf, 'utf8').replace(`"${RELEASE}"`, '"0.9.1"'));
    expect(() => releaseVersion(root)).toThrow(/do not carry one version/);
    expect(() => releaseVersion(root)).toThrow(/apps\/designer\/src-tauri\/tauri\.conf\.json: 0\.9\.1/);
    expect(() => releaseVersion(root)).toThrow(/tools\/caspar-bridge\/package\.json: 0\.9\.0/);
  });

  it('CONTROL — the parts agreeing on a placeholder is not a release', () => {
    const root = copyOfTheSources();
    for (const { file } of VERSION_SOURCES) {
      const full = path.join(root, file);
      fs.writeFileSync(full, fs.readFileSync(full, 'utf8').replaceAll(RELEASE, '0.0.0'));
    }
    expect(() => releaseVersion(root)).toThrow(/0\.0\.0 is not a release version/);
  });

  it("the Cargo readers take the crate's own version, never a dependency's", () => {
    const toml = VERSION_SOURCES.find((s) => s.kind === 'cargo-toml');
    const lock = VERSION_SOURCES.find((s) => s.kind === 'cargo-lock' && s.crate === 'cg-control');
    if (toml === undefined || lock === undefined) throw new Error('the Cargo sources are listed');
    expect(
      versionIn('[package]\nname = "x"\nversion = "1.2.3"\n\n[dependencies]\ntauri = { version = "2.11" }\n', toml),
    ).toBe('1.2.3');
    expect(
      versionIn(
        '[[package]]\nname = "cg-designer"\nversion = "4.0.0"\n\n[[package]]\nname = "cg-control"\nversion = "1.2.3"\n',
        lock,
      ),
    ).toBe('1.2.3');
  });

  it('a release version is three numbers — no label, and never the 0.0.0 placeholder', () => {
    expect(isReleaseVersion('0.9.0')).toBe(true);
    expect(isReleaseVersion('0.9.0-rc.1')).toBe(false);
    expect(isReleaseVersion('0.9')).toBe(false);
    expect(isReleaseVersion('0.0.0')).toBe(false);
  });

  it('the release tag is v + the version, and nothing else is', () => {
    expect(tagRefusal('v0.9.0', '0.9.0')).toBeNull();
    expect(tagRefusal('v0.9.1', '0.9.0')).toMatch(/its tag is v0\.9\.0/);
    expect(tagRefusal('0.9.0', '0.9.0')).not.toBeNull();
  });
});
