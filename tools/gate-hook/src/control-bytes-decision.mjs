/**
 * `GUARDS-18` §1 — the CONTROL-BYTE guard's PURE decision, separated from its CLI exactly
 * as `never-stage-decision.mjs` is from `never-stage-cli.mjs`.
 *
 * ── WHY THIS EXISTS, AND WHY IT CANNOT BE A GREP ───────────────────────────
 *
 * A control byte in a text file is invisible in every normal view and changes what tools do
 * with the file. The one that matters most: **a NUL makes `grep -r` and ripgrep treat the
 * file as BINARY and skip it IN SILENCE** — no warning, no non-zero exit, just a match count
 * that is quietly short. A sweep then reports clean on a file it never read, which is worse
 * than not sweeping at all, because the clean answer is believed.
 *
 * Golden rule 9 names the shape ("write separators as escapes, never as literal bytes") and
 * says `git grep` rather than `grep -r`, because git samples the first 8000 bytes for binary
 * detection and a NUL past that mark stays visible. That is a mitigation, not a fix: it
 * depends on where in the file the byte happens to land.
 *
 * Four have now been found in this tree by hand, across two sessions:
 *   - two NULs (session BP) — `@cg/shared-ipc`'s `channels/sources.ts` and the OSC probe;
 *   - a literal U+0001 join separator in `StationSetupDialog.tsx`, and a backspace byte
 *     eating the `b` of `border-radius` in `theme.ts` (session `LAYER-BANDS-16`).
 *
 * 🔴 **So this guard READS BYTES. It must never be reimplemented on top of grep or ripgrep**
 * — that blindness is the entire hole it closes.
 *
 * ── WHY AN EXTENSION ALLOWLIST AND NOT CONTENT SNIFFING ────────────────────
 *
 * "Is this file binary?" answered by looking at the CONTENT is the same judgement `grep`
 * makes, and it fails the same way: a text file with one stray byte sniffs as binary and is
 * skipped — precisely the file this guard exists to catch. So binaries are exempted by
 * EXTENSION, declared below, and anything not on that list is read as text. A new binary
 * format arriving in the tree announces itself as a loud failure rather than a silent skip.
 */

/**
 * Extensions read as BINARY and skipped, lower-cased, without the dot.
 *
 * The first block is what this tree actually contains (measured with `git ls-files`); the
 * rest are ordinary binary formats listed ahead of time so that adding one is not also a
 * gate failure. Adding an extension here is a deliberate, reviewable act — which is the
 * point of a list over a sniff.
 */
export const BINARY_EXTENSIONS = new Set([
  // Present in this tree today.
  'png',
  'woff2',
  'vcg',
  'avi',
  'webm',
  'zip',
  'mp4',
  // Images.
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'ico',
  'bmp',
  'tiff',
  'tif',
  'avif',
  'psd',
  // Fonts.
  'woff',
  'ttf',
  'otf',
  'eot',
  // Audio / video.
  'mov',
  'mkv',
  'mp3',
  'wav',
  'ogg',
  'flac',
  'm4a',
  'aac',
  // Archives and compiled artefacts.
  'gz',
  'tgz',
  'bz2',
  'xz',
  '7z',
  'rar',
  'tar',
  'jar',
  'class',
  'wasm',
  'node',
  'exe',
  'dll',
  'so',
  'dylib',
  'pyc',
  'pdf',
  'bin',
]);

/**
 * 🔴 **EXPLICIT, NAMED exemptions — and the list is EMPTY, deliberately.**
 *
 * `GUARDS-18` §4: a file that trips this guard is FIXED, not exempted, and never made to
 * pass by weakening the rule. Five BOMs were found when the guard was first run and all five
 * were stripped rather than listed here.
 *
 * An entry is a repo-relative path mapped to the REASON it is allowed to carry what it
 * carries. If this list ever has a member, that member is a decision somebody can read.
 */
export const EXEMPT_PATHS = new Map();

/** The UTF-8 byte-order mark, which is only ever a finding at offset 0. */
export const BOM = Object.freeze([0xef, 0xbb, 0xbf]);

/**
 * Is this byte forbidden in a text file?
 *
 * C0 except TAB / LF / CR, plus DEL. CR is allowed because this tree is developed on Windows
 * and a CRLF line ending is not a defect; the rest of C0 has no business in source.
 */
export function isForbiddenByte(byte) {
  if (byte === 0x09 || byte === 0x0a || byte === 0x0d) return false;
  return byte < 0x20 || byte === 0x7f;
}

/** Is this path read as text? Extension-only — see the header for why never the content. */
export function isTextPath(filePath, binaryExtensions = BINARY_EXTENSIONS) {
  const base = filePath.slice(filePath.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  // A dotfile (`.npmrc`) and an extensionless file (`LICENSE`) are both text: `dot <= 0`
  // covers the leading-dot case, which `lastIndexOf` would otherwise report as an extension.
  if (dot <= 0) return true;
  return !binaryExtensions.has(base.slice(dot + 1).toLowerCase());
}

/** The escape a source file should have used for this byte. */
export function escapeFor(byte) {
  const named = { 0x00: '\\0', 0x08: '\\b', 0x0b: '\\v', 0x0c: '\\f', 0x1b: '\\x1b' };
  return named[byte] ?? `\\u${byte.toString(16).padStart(4, '0')}`;
}

/** 1-based line number of a byte offset, counting LF. */
export function lineOfOffset(bytes, offset) {
  let line = 1;
  for (let i = 0; i < offset && i < bytes.length; i += 1) if (bytes[i] === 0x0a) line += 1;
  return line;
}

/**
 * The FIRST finding in a file's bytes, or `null`.
 *
 * First rather than all, on purpose: the remedy is per FILE (open it and fix the byte), and
 * a guard that prints forty lines for one bad file buries the next file's finding.
 */
export function findFirstOffence(bytes) {
  if (bytes.length >= 3 && bytes[0] === BOM[0] && bytes[1] === BOM[1] && bytes[2] === BOM[2]) {
    return { kind: 'bom', offset: 0, line: 1 };
  }
  for (let i = 0; i < bytes.length; i += 1) {
    if (isForbiddenByte(bytes[i])) {
      return { kind: 'control', offset: i, byte: bytes[i], line: lineOfOffset(bytes, i) };
    }
  }
  return null;
}

/** One finding as the line the gate prints. */
export function describeOffence(filePath, offence) {
  if (offence.kind === 'bom') {
    return (
      `  ✖ ${filePath}:1 — UTF-8 BOM (EF BB BF) at byte 0.\n` +
      '      Prettier does not strip one and no other gate step fails on one, which is how ' +
      'seven survived (P-025).\n' +
      '      Remedy: re-save the file as UTF-8 WITHOUT a BOM.'
    );
  }
  const hex = `0x${offence.byte.toString(16).padStart(2, '0')}`;
  return (
    `  ✖ ${filePath}:${String(offence.line)} — control byte ${hex} at byte ` +
    `${String(offence.offset)}.\n` +
    `      Remedy: write it as the escape \`${escapeFor(offence.byte)}\`, never as a literal ` +
    'byte.\n' +
    '      A literal control byte can make `grep -r` / ripgrep skip this file in SILENCE ' +
    '(golden rule 9).'
  );
}
