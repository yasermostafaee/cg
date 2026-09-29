/**
 * 🔴 `CLIENT-TEST-RELEASE-01` B4 — **THE RELEASE'S FOUR FILES, NAMED ONCE.** The draft release holds
 * exactly: CG Control's installer, CG Designer's, the Persian install guide, and `SHA256SUMS.txt` over
 * the other three. Their names live here and nowhere else — the workflow assembles and reads back
 * with them, and the guide's test holds the guide to them.
 *
 * WHY THE INSTALLERS ARE RENAMED: Tauri names them `CG Control_<v>_x64-setup.exe`, and GitHub renames
 * a release asset whose name has a space — so the name a client downloads would not be the one
 * `SHA256SUMS.txt` and the guide give, and `sha256sum -c` would fail. The release names drop the space;
 * the version stays in them.
 *
 *   node tools/release/src/release-files.mjs expect <version>
 *   node tools/release/src/release-files.mjs assemble <version> <installers dir> <guide.pdf> <out dir>
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** The four files of release `version`: each installer's built name and release name, the guide, the sums. */
export function releaseFiles(version) {
  return {
    control: { built: `CG Control_${version}_x64-setup.exe`, name: `CG-Control_${version}_x64-setup.exe` },
    designer: {
      built: `CG Designer_${version}_x64-setup.exe`,
      name: `CG-Designer_${version}_x64-setup.exe`,
    },
    guide: `APASAI-CG-${version}-install-guide-fa.pdf`,
    sums: 'SHA256SUMS.txt',
  };
}

/** The four names, sorted — what the release must hold, no more and no fewer. */
export function expectedAssets(version) {
  const files = releaseFiles(version);
  return [files.control.name, files.designer.name, files.guide, files.sums].sort();
}

/** `sha256sum`'s own format: the hash, two spaces, the name; LF; one line per file, by name. */
export function sha256Sums(dir, names) {
  return [...names]
    .sort()
    .map((name) => {
      const hash = createHash('sha256').update(fs.readFileSync(path.join(dir, name))).digest('hex');
      return `${hash}  ${name}\n`;
    })
    .join('');
}

/**
 * Copy both installers under their release names and the guide into `outDir`, write
 * `SHA256SUMS.txt` over those three, and refuse unless `outDir` then holds exactly the four.
 */
export function assembleRelease({ version, installersDir, guidePdf, outDir }) {
  const files = releaseFiles(version);
  fs.mkdirSync(outDir, { recursive: true });
  for (const installer of [files.control, files.designer]) {
    const from = path.join(installersDir, installer.built);
    if (!fs.existsSync(from)) throw new Error(`${installer.built} is not in ${installersDir}`);
    fs.copyFileSync(from, path.join(outDir, installer.name));
  }
  if (path.resolve(guidePdf) !== path.resolve(outDir, files.guide)) {
    fs.copyFileSync(guidePdf, path.join(outDir, files.guide));
  }
  fs.writeFileSync(
    path.join(outDir, files.sums),
    sha256Sums(outDir, [files.control.name, files.designer.name, files.guide]),
  );
  const held = fs.readdirSync(outDir).sort();
  const expected = expectedAssets(version);
  if (held.join('|') !== expected.join('|')) {
    throw new Error(`${outDir} holds [${held.join(', ')}], not [${expected.join(', ')}]`);
  }
  return held;
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
        process.stdout.write(`${String(fs.statSync(path.join(outDir, name)).size).padStart(12)}  ${name}\n`);
      }
    } else {
      console.error(
        'usage: release-files.mjs expect <version>\n' +
          '       release-files.mjs assemble <version> <installers dir> <guide.pdf> <out dir>',
      );
      process.exit(2);
    }
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
