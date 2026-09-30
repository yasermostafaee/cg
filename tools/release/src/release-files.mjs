/**
 * 🔴 `CLIENT-TEST-RELEASE-01` B4 — **THE RELEASE'S FILES, NAMED ONCE.** The draft release holds
 * exactly: `CENTRAL-BRIDGE-01` — CG Bridge's installer (the service, installed first, on the Playout
 * machine or beside it), CG Control's, CG Designer's, the Persian install guide, and `SHA256SUMS.txt`
 * over the other four. Their names live here and nowhere else — the workflow assembles and reads back
 * with them, and the guide's test holds the guide to them.
 *
 * WHY THE APPS' INSTALLERS ARE RENAMED: Tauri names them `CG Control_<v>_x64-setup.exe`, and GitHub
 * renames a release asset whose name has a space — so the name a client downloads would not be the one
 * `SHA256SUMS.txt` and the guide give, and `sha256sum -c` would fail. The release names drop the space;
 * the version stays in them. CG Bridge's own installer is built with no space (`cg-bridge.nsi`), so its
 * built name IS its release name.
 *
 *   node tools/release/src/release-files.mjs expect <version>
 *   node tools/release/src/release-files.mjs assemble <version> <installers dir> <guide.pdf> <out dir>
 *   node tools/release/src/release-files.mjs verify <downloaded dir> [--assets <assets.json>]
 *
 * `P-060` — `verify` checks the release's `SHA256SUMS.txt` against the assets as UPLOADED
 * ({@link sumsProblems}); the release job runs it after the draft is created.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** The sums' own name — the same in every release. */
const SUMS_NAME = 'SHA256SUMS.txt';

/** The five files of release `version`: each installer's built name and release name, the guide, the sums. */
export function releaseFiles(version) {
  return {
    bridge: {
      built: `CG-Bridge_${version}_x64-setup.exe`,
      name: `CG-Bridge_${version}_x64-setup.exe`,
    },
    control: {
      built: `CG Control_${version}_x64-setup.exe`,
      name: `CG-Control_${version}_x64-setup.exe`,
    },
    designer: {
      built: `CG Designer_${version}_x64-setup.exe`,
      name: `CG-Designer_${version}_x64-setup.exe`,
    },
    guide: `APASAI-CG-${version}-install-guide-fa.pdf`,
    sums: SUMS_NAME,
  };
}

/** The five names, sorted — what the release must hold, no more and no fewer. */
export function expectedAssets(version) {
  const files = releaseFiles(version);
  return [
    files.bridge.name,
    files.control.name,
    files.designer.name,
    files.guide,
    files.sums,
  ].sort();
}

/** `sha256sum`'s own format: the hash, two spaces, the name; LF; one line per file, by name. */
export function sha256Sums(dir, names) {
  return [...names]
    .sort()
    .map((name) => {
      const hash = createHash('sha256')
        .update(fs.readFileSync(path.join(dir, name)))
        .digest('hex');
      return `${hash}  ${name}\n`;
    })
    .join('');
}

/**
 * Copy the three installers under their release names and the guide into `outDir`, write
 * `SHA256SUMS.txt` over those four, and refuse unless `outDir` then holds exactly the five.
 */
export function assembleRelease({ version, installersDir, guidePdf, outDir }) {
  const files = releaseFiles(version);
  fs.mkdirSync(outDir, { recursive: true });
  for (const installer of [files.bridge, files.control, files.designer]) {
    const from = path.join(installersDir, installer.built);
    if (!fs.existsSync(from)) throw new Error(`${installer.built} is not in ${installersDir}`);
    fs.copyFileSync(from, path.join(outDir, installer.name));
  }
  if (path.resolve(guidePdf) !== path.resolve(outDir, files.guide)) {
    fs.copyFileSync(guidePdf, path.join(outDir, files.guide));
  }
  fs.writeFileSync(
    path.join(outDir, files.sums),
    sha256Sums(outDir, [files.bridge.name, files.control.name, files.designer.name, files.guide]),
  );
  const held = fs.readdirSync(outDir).sort();
  const expected = expectedAssets(version);
  if (held.join('|') !== expected.join('|')) {
    throw new Error(`${outDir} holds [${held.join(', ')}], not [${expected.join(', ')}]`);
  }
  return held;
}

/** One `sha256sum` line: the hash, a space, then a space (text mode) or `*` (binary), then the name. */
const SUM_LINE = /^([0-9a-f]{64}) [ *](.+)$/;

/**
 * 🔴 `P-060` (`RELEASE-091-01` §5) — **WHAT IS WRONG WITH A RELEASE'S `SHA256SUMS.txt`**, against the
 * assets the release holds, one line each; `[]` when every line names an asset by its EXACT name with
 * that asset's hash, every asset but the sums has a line, and GitHub's own digest of each (when it
 * reports one) agrees.
 *
 * The owner held a `SHA256SUMS.txt` naming `CG Control_0.9.0_x64-setup.exe` — with a space, a file no
 * release holds: the installer job's own, uploaded inside both CI artifacts. `assets` is the release as
 * UPLOADED: each asset's name, the SHA-256 of the file downloaded back from the release (`null` when it
 * could not be), and GitHub's `digest` (`sha256:<hex>`) when the API gives one.
 */
export function sumsProblems(sumsText, assets, sumsName = SUMS_NAME) {
  const problems = [];
  const byName = new Map(assets.map((asset) => [asset.name, asset]));
  const listed = new Set();
  const lines = sumsText.replace(/^\uFEFF/, '').split('\n');
  if (lines.at(-1) === '') lines.pop();
  lines.forEach((raw, i) => {
    const line = raw.replace(/\r$/, '');
    const at = `line ${String(i + 1)}`;
    const match = SUM_LINE.exec(line);
    if (match === null) {
      problems.push(`${at} is not "<sha256>  <name>": ${JSON.stringify(line)}`);
      return;
    }
    const [, hash, name] = match;
    if (listed.has(name)) {
      problems.push(`${at} names "${name}" a second time`);
      return;
    }
    listed.add(name);
    const asset = byName.get(name);
    if (asset === undefined) {
      problems.push(`${at} names "${name}", which the release does not hold`);
      return;
    }
    if (name === sumsName) {
      problems.push(`${at} lists ${sumsName} itself`);
      return;
    }
    if (asset.sha256 === null) {
      problems.push(`${at}: "${name}" could not be read back from the release`);
    } else if (asset.sha256 !== hash) {
      problems.push(`${at}: "${name}" is ${asset.sha256} as uploaded, not ${hash}`);
    }
    if (asset.digest !== null && asset.digest !== `sha256:${hash}`) {
      problems.push(`${at}: GitHub's digest of "${name}" is ${asset.digest}, not sha256:${hash}`);
    }
  });
  for (const asset of assets) {
    if (asset.name !== sumsName && !listed.has(asset.name)) {
      problems.push(`"${asset.name}" has no line in ${sumsName}`);
    }
  }
  if (!byName.has(sumsName)) problems.push(`the release holds no ${sumsName}`);
  return problems;
}

/**
 * `P-060` — {@link sumsProblems} over a folder the release was downloaded into (`gh release download`)
 * and, when given, the release's own asset list (`gh release view --json assets`): the list says what
 * the release HOLDS and carries GitHub's digests; the folder gives each file's bytes as served.
 */
export function verifyDownloaded({ dir, assetsJson }) {
  const read = (file) => fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  const listed = assetsJson === undefined ? null : JSON.parse(read(assetsJson)).assets;
  const names = (listed === null ? fs.readdirSync(dir) : listed.map((a) => String(a.name))).sort();
  const assets = names.map((name) => {
    const file = path.join(dir, name);
    const meta = listed?.find((a) => a.name === name);
    return {
      name,
      sha256: fs.existsSync(file)
        ? createHash('sha256').update(fs.readFileSync(file)).digest('hex')
        : null,
      digest: typeof meta?.digest === 'string' && meta.digest !== '' ? meta.digest : null,
    };
  });
  const sumsFile = path.join(dir, SUMS_NAME);
  if (!fs.existsSync(sumsFile)) return [`${SUMS_NAME} was not downloaded from the release`];
  return sumsProblems(read(sumsFile), assets);
}

const invokedAsScript =
  process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedAsScript) {
  const [command, version, ...rest] = process.argv.slice(2);
  try {
    if (command === 'expect' && version !== undefined) {
      process.stdout.write(`${expectedAssets(version).join('\n')}\n`);
    } else if (command === 'assemble' && version !== undefined && rest.length === 3) {
      const [installersDir, guidePdf, outDir] = rest;
      for (const name of assembleRelease({ version, installersDir, guidePdf, outDir })) {
        process.stdout.write(
          `${String(fs.statSync(path.join(outDir, name)).size).padStart(12)}  ${name}\n`,
        );
      }
    } else if (command === 'verify' && version !== undefined) {
      // `verify <downloaded dir> [--assets <gh release view --json assets>]` — `version` is the dir.
      const at = rest.indexOf('--assets');
      const problems = verifyDownloaded({
        dir: version,
        ...(at >= 0 && rest[at + 1] !== undefined ? { assetsJson: rest[at + 1] } : {}),
      });
      if (problems.length > 0) {
        console.error(`SHA256SUMS.txt does not match the release:\n  ${problems.join('\n  ')}`);
        process.exit(1);
      }
      process.stdout.write('SHA256SUMS.txt matches every asset the release holds\n');
    } else {
      console.error(
        'usage: release-files.mjs expect <version>\n' +
          '       release-files.mjs assemble <version> <installers dir> <guide.pdf> <out dir>\n' +
          '       release-files.mjs verify <downloaded dir> [--assets <assets.json>]',
      );
      process.exit(2);
    }
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
