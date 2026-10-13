/**
 * 🔴 `CLIENT-TEST-RELEASE-01` — **NOTHING THE INSTALLERS SHIP CARRIES A REAL ADDRESS OR A TEST SECRET.**
 *
 * The client installs these on its own machines, so what they carry is read by people who are not us.
 * Two kinds of leak have been found in them, and both reached the bundles unnoticed because nothing
 * looked: the plant's addresses as UI copy (a placeholder, a hint) and in a source comment esbuild keeps.
 * This scans every TEXT file under the folders the installers are built from — CG Control's staged
 * payload and starting page, CG Designer's `dist` — for:
 *
 *   - a PRIVATE IPv4 address (RFC 1918: `10/8`, `172.16/12`, `192.168/16`) — a plant's, a developer's
 *     machine's, a remote desktop's. Loopback, `0.0.0.0` and the documentation ranges (RFC 5737:
 *     `192.0.2/24`, `198.51.100/24`, `203.0.113/24`) are not private and pass;
 *   - a secret the test suites use: the fake Playout's password, `sample-token`, the fake's camera
 *     credentials.
 *
 * A binary is skipped by EXTENSION, never by sniffing its bytes (the repo's `control-bytes` rule).
 *
 *   node tools/release/src/scan-payload.mjs <dir> [<dir> …]    one line per hit, exit 1 on any
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** The files the scan reads; everything else (node.exe, wasm, fonts, images) is skipped. */
export const TEXT_EXTENSIONS = new Set([
  '.js',
  '.mjs',
  '.cjs',
  '.html',
  '.css',
  '.json',
  '.txt',
  '.svg',
  '.map',
  '.md',
  '.xml',
]);

/** Secrets the suites use, which must never ride into an installer. ASCII, so a bundle keeps them verbatim. */
export const TEST_SECRETS = ['test-only-not-a-secret', 'sample-token', 'rtsp://cam:secret@'];

/**
 * 🔴 `RELEASE-0110-01` §3 — **DEV-ONLY CODE**, by the names it carries: the dev station's flags
 * (`pnpm dev:station --fake --caspar … --playout-only`) and the test suite's fakes. None of them is in
 * any source an installer is built from (measured 2026-10-04: zero files under the apps', the
 * packages' and CG Bridge's `src` and `bin`), so a hit is a leak, never a word an app uses. The flags
 * are matched whole: CG Bridge's own `--caspar-host` is not `--caspar`.
 */
export const DEV_ONLY_MARKERS = [
  { label: '--fake', re: /--fake(?![\w-])/g },
  { label: '--playout-only', re: /--playout-only(?![\w-])/g },
  { label: '--caspar', re: /--caspar(?![\w-])/g },
  { label: 'fake-playout', re: /fake-playout/g },
  { label: 'fake-station', re: /fake-station/g },
  { label: 'startFakePlayout', re: /startFakePlayout/g },
  { label: 'FAKE_ADMIN', re: /FAKE_ADMIN/g },
  { label: 'FAKE_PLAYOUT_PASSWORD', re: /FAKE_PLAYOUT_PASSWORD/g },
];

/** A signed token's shape (a JWT: three base64url parts, the first two JSON) — never shipped. */
const TOKEN = /eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g;

/** A dotted quad not inside a longer dotted number (so `1.10.0.0.1` is not read as `10.0.0.1`). */
const DOTTED_QUAD = /(?<![\d.])(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?!\.?\d)/g;

/** Is this dotted quad a private (RFC 1918) address? */
export function isPrivateV4(a, b, c, d) {
  if ([a, b, c, d].some((octet) => octet > 255)) return false;
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

/** Every private address and test secret in `text`, with the 1-based line it is on. */
export function findingsIn(text) {
  const lineAt = (index) => text.slice(0, index).split('\n').length;
  const found = [];
  for (const match of text.matchAll(DOTTED_QUAD)) {
    const [a, b, c, d] = match.slice(1, 5).map(Number);
    if (isPrivateV4(a, b, c, d)) {
      found.push({ kind: 'private address', value: match[0], line: lineAt(match.index) });
    }
  }
  for (const secret of TEST_SECRETS) {
    for (let at = text.indexOf(secret); at >= 0; at = text.indexOf(secret, at + 1)) {
      found.push({ kind: 'test secret', value: secret, line: lineAt(at) });
    }
  }
  for (const match of text.matchAll(TOKEN)) {
    found.push({ kind: 'token', value: `${match[0].slice(0, 16)}…`, line: lineAt(match.index) });
  }
  for (const { label, re } of DEV_ONLY_MARKERS) {
    for (const match of text.matchAll(re)) {
      found.push({ kind: 'dev-only code', value: label, line: lineAt(match.index) });
    }
  }
  return found;
}

/**
 * The printable runs of a BINARY — its ASCII strings of six or more characters, and its UTF-16LE
 * ones — one per line, so {@link findingsIn} can read what a program we build carries uncompressed.
 * Used for CG Setup's own front end (`--binaries`), never for a third party's program.
 */
export function stringsOf(bytes) {
  const runs = [];
  let ascii = '';
  for (const byte of bytes) {
    if (byte >= 0x20 && byte < 0x7f) ascii += String.fromCharCode(byte);
    else {
      if (ascii.length >= 6) runs.push(ascii);
      ascii = '';
    }
  }
  if (ascii.length >= 6) runs.push(ascii);
  // UTF-16LE at BOTH alignments: a string need not start on an even offset of the file.
  for (const start of [0, 1]) {
    let wide = '';
    for (let i = start; i + 1 < bytes.length; i += 2) {
      const lo = bytes[i];
      if (bytes[i + 1] === 0 && lo >= 0x20 && lo < 0x7f) wide += String.fromCharCode(lo);
      else {
        if (wide.length >= 6) runs.push(wide);
        wide = '';
      }
    }
    if (wide.length >= 6) runs.push(wide);
  }
  return runs.join('\n');
}

/** Every text file under `dir`, in a stable order. */
function textFiles(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...textFiles(full));
    else if (TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) files.push(full);
  }
  return files.sort();
}

/**
 * Scan each folder; a folder that does not exist is itself a finding — a scan of nothing proves
 * nothing, and a renamed output folder must not turn this into a silent pass.
 */
export function scanPayload(dirs) {
  const report = { files: 0, findings: [] };
  for (const dir of dirs) {
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
      report.findings.push({ file: dir, kind: 'missing folder', value: dir, line: 0 });
      continue;
    }
    for (const file of textFiles(dir)) {
      report.files += 1;
      for (const hit of findingsIn(fs.readFileSync(file, 'utf8'))) report.findings.push({ file, ...hit });
    }
  }
  return report;
}

const invokedAsScript =
  process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedAsScript) {
  // `--binaries <file>[,<file>…]`: programs WE build, read for their printable strings (`stringsOf`).
  const rest = process.argv.slice(2);
  const at = rest.indexOf('--binaries');
  const binaries = at < 0 ? [] : (rest[at + 1] ?? '').split(',').filter(Boolean);
  const dirs = at < 0 ? rest : [...rest.slice(0, at), ...rest.slice(at + 2)];
  if (dirs.length === 0 && binaries.length === 0) {
    console.error(
      'usage: node tools/release/src/scan-payload.mjs <dir> [<dir> …] [--binaries <exe>[,<exe>…]]',
    );
    process.exit(2);
  }
  const report = scanPayload(dirs);
  for (const file of binaries) {
    if (!fs.existsSync(file)) {
      report.findings.push({ file, kind: 'missing file', value: file, line: 0 });
      continue;
    }
    report.files += 1;
    for (const hit of findingsIn(stringsOf(fs.readFileSync(file)))) report.findings.push({ file, ...hit });
  }
  const { files, findings } = report;
  for (const hit of findings) {
    console.error(`${hit.file}:${String(hit.line)}: ${hit.kind} ${hit.value}`);
  }
  if (findings.length > 0 || files === 0) {
    console.error(
      files === 0
        ? 'Scanned no text file — nothing was proven.'
        : `${String(findings.length)} finding(s) in what the installers ship.`,
    );
    process.exit(1);
  }
  process.stdout.write(
    `Scanned ${String(files)} files in ${[...dirs, ...binaries].join(', ')}: no private address, ` +
      'no test secret, no token, no dev-only code.\n',
  );
}
