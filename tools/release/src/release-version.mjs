/**
 * 🔴 `CLIENT-TEST-RELEASE-01` B1 — **ONE VERSION FOR THE THREE PARTS A CLIENT INSTALLS**: CG Control,
 * CG Designer, and the bridge — since `CENTRAL-BRIDGE-01`, CG Bridge, the service with its own
 * installer (`tools/bridge-installer`, built with `/DVERSION=` from this number).
 *
 * Each part writes its version in more than one file, and each file feeds a different reader:
 *
 *   - `package.json` — the app's build stamp (`@cg/splash-kit`'s `createBuildStamp`), which is what
 *     the app shows in its version line; for the bridge, the version its first start line names;
 *   - `src-tauri/tauri.conf.json` — the installer's file name and the version Windows lists under
 *     Installed apps;
 *   - `src-tauri/Cargo.toml`, and its entry in the workspace `Cargo.lock` — the shell's own crate.
 *
 * Nine files, one number. They are read here rather than trusted to agree, because nothing else
 * would notice them drift: an installer named `0.9.1` around an app that says `0.9.0` builds and
 * installs cleanly.
 *
 *   node tools/release/src/release-version.mjs                 prints the version
 *   node tools/release/src/release-version.mjs --tag v0.9.0    and refuses a tag that is not it
 *   node tools/release/src/release-version.mjs --set 0.11.0    sets it in all nine, then prints it
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Every file that carries a part's version, relative to the repo root. */
export const VERSION_SOURCES = [
  { part: 'CG Control', file: 'apps/runtime/package.json', kind: 'package-json' },
  { part: 'CG Control', file: 'apps/runtime/src-tauri/tauri.conf.json', kind: 'tauri-conf' },
  { part: 'CG Control', file: 'apps/runtime/src-tauri/Cargo.toml', kind: 'cargo-toml' },
  { part: 'CG Control', file: 'Cargo.lock', kind: 'cargo-lock', crate: 'cg-control' },
  { part: 'CG Designer', file: 'apps/designer/package.json', kind: 'package-json' },
  { part: 'CG Designer', file: 'apps/designer/src-tauri/tauri.conf.json', kind: 'tauri-conf' },
  { part: 'CG Designer', file: 'apps/designer/src-tauri/Cargo.toml', kind: 'cargo-toml' },
  { part: 'CG Designer', file: 'Cargo.lock', kind: 'cargo-lock', crate: 'cg-designer' },
  { part: 'the bridge', file: 'tools/caspar-bridge/package.json', kind: 'package-json' },
];

/**
 * A version the release takes: three numbers, nothing after them. Tauri's NSIS bundler turns it
 * into the installer's four-part Windows version (`0.9.0.0`), which admits no pre-release label.
 */
export function isReleaseVersion(value) {
  return typeof value === 'string' && /^\d+\.\d+\.\d+$/.test(value) && value !== '0.0.0';
}

/** The version one source file carries, or `null` when it carries none. */
export function versionIn(text, source) {
  if (source.kind === 'package-json' || source.kind === 'tauri-conf') {
    const version = JSON.parse(text).version;
    return typeof version === 'string' ? version : null;
  }
  if (source.kind === 'cargo-toml') {
    // The first `version` under `[package]` — the crate's own, never a dependency's.
    const pkg = /^\[package\]\s*$([\s\S]*?)(?=^\[|(?![\s\S]))/m.exec(text)?.[1] ?? '';
    return /^version\s*=\s*"([^"]*)"/m.exec(pkg)?.[1] ?? null;
  }
  // `Cargo.lock`: the `[[package]]` block whose name is this crate.
  for (const block of text.split(/^\[\[package\]\]\s*$/m)) {
    if (/^name\s*=\s*"([^"]*)"/m.exec(block)?.[1] === source.crate) {
      return /^version\s*=\s*"([^"]*)"/m.exec(block)?.[1] ?? null;
    }
  }
  return null;
}

/** What every source says, in the order they are listed. */
export function readVersions(root) {
  return VERSION_SOURCES.map((source) => ({
    part: source.part,
    file: source.file,
    version: versionIn(fs.readFileSync(path.join(root, source.file), 'utf8'), source),
  }));
}

/**
 * The release's one version — or a throw that names every file and what it says, when they
 * disagree or when what they agree on is not a release version.
 */
export function releaseVersion(root) {
  const read = readVersions(root);
  const versions = new Set(read.map((entry) => entry.version));
  const [only] = versions;
  if (versions.size !== 1 || !isReleaseVersion(only)) {
    const lines = read.map((entry) => `  ${entry.file}: ${String(entry.version)}`).join('\n');
    throw new Error(
      versions.size !== 1
        ? `The parts do not carry one version:\n${lines}`
        : `${String(only)} is not a release version (three numbers, not 0.0.0):\n${lines}`,
    );
  }
  return only;
}

/**
 * 🔴 `RELEASE-0110-01` §1 — **SET the one version in every file that carries it**, so a release bump
 * is one command here rather than nine hand edits. Each file keeps its own shape: only the version
 * value is replaced (a JSON `"version"`, the `[package]` `version` of a crate, the crate's own
 * `[[package]]` block in `Cargo.lock`), and a file whose version could not be found is a throw that
 * names it — never a silent skip. Returns the files written.
 */
export function setVersion(root, version) {
  if (!isReleaseVersion(version)) {
    throw new Error(`${String(version)} is not a release version (three numbers, not 0.0.0)`);
  }
  const texts = new Map();
  for (const source of VERSION_SOURCES) {
    const file = path.join(root, source.file);
    const text = texts.get(file) ?? fs.readFileSync(file, 'utf8');
    texts.set(file, replaceVersion(text, source, version));
  }
  for (const [file, text] of texts) fs.writeFileSync(file, text);
  return [...texts.keys()].map((file) => path.relative(root, file).split(path.sep).join('/'));
}

/** `text` with this source's version replaced by `version`; a throw when it carries none. */
export function replaceVersion(text, source, version) {
  const replaced = (() => {
    if (source.kind === 'package-json' || source.kind === 'tauri-conf') {
      // The top-level `"version"` only: the first one, at two spaces of indent.
      return text.replace(/^(\s{2}"version":\s*")[^"]*(")/m, `$1${version}$2`);
    }
    if (source.kind === 'cargo-toml') {
      return text.replace(
        /(^\[package\]\s*$[\s\S]*?^version\s*=\s*")[^"]*(")/m,
        `$1${version}$2`,
      );
    }
    // `Cargo.lock`: inside the `[[package]]` block named for this crate.
    const crate = source.crate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return text.replace(
      new RegExp(`(^\\[\\[package\\]\\]\\s*\\r?\\nname\\s*=\\s*"${crate}"\\s*\\r?\\nversion\\s*=\\s*")[^"]*(")`, 'm'),
      `$1${version}$2`,
    );
  })();
  if (versionIn(replaced, source) !== version) {
    throw new Error(`${source.file}: no version found to set${source.crate ? ` for ${source.crate}` : ''}`);
  }
  return replaced;
}

/** `null` when `tag` names this version (`v` + the version), else why it does not. */
export function tagRefusal(tag, version) {
  return tag === `v${version}`
    ? null
    : `The tag ${tag} does not name this release: its version is ${version}, so its tag is v${version}.`;
}

const invokedAsScript =
  process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedAsScript) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
  const tagAt = process.argv.indexOf('--tag');
  const setAt = process.argv.indexOf('--set');
  try {
    if (setAt >= 0) {
      const written = setVersion(root, process.argv[setAt + 1] ?? '');
      for (const file of written) process.stdout.write(`set ${file}\n`);
    }
    const version = releaseVersion(root);
    const refusal = tagAt < 0 ? null : tagRefusal(process.argv[tagAt + 1] ?? '', version);
    if (refusal !== null) {
      console.error(refusal);
      process.exit(1);
    }
    process.stdout.write(`${version}\n`);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
