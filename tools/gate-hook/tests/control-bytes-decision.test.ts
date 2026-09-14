import { describe, expect, it } from 'vitest';
import {
  BINARY_EXTENSIONS,
  describeOffence,
  escapeFor,
  EXEMPT_PATHS,
  findFirstOffence,
  isForbiddenByte,
  isTextPath,
  lineOfOffset,
} from '../src/control-bytes-decision.mjs';

/**
 * `GUARDS-18` §1 — the control-byte guard's decision.
 *
 * What is pinned here is not "does it find a byte" but the three choices that make it worth
 * having: that CR/LF/TAB are allowed and the rest of C0 is not, that a file is judged BINARY
 * by its EXTENSION and never by sniffing its content, and that the exemption list is empty.
 */
describe('which bytes a text file may carry', () => {
  it('allows tab, newline and carriage return, and nothing else in C0', () => {
    expect(isForbiddenByte(0x09)).toBe(false);
    expect(isForbiddenByte(0x0a)).toBe(false);
    // CR is allowed because this tree is developed on Windows and CRLF is not a defect.
    expect(isForbiddenByte(0x0d)).toBe(false);
    for (const byte of [0x00, 0x01, 0x07, 0x08, 0x0b, 0x0c, 0x1b, 0x1f]) {
      expect(isForbiddenByte(byte), `0x${byte.toString(16)} must be forbidden`).toBe(true);
    }
    expect(isForbiddenByte(0x7f)).toBe(true); // DEL
    expect(isForbiddenByte(0x20)).toBe(false); // space
    expect(isForbiddenByte(0x41)).toBe(false); // 'A'
  });

  /**
   * The four this tree has actually produced, each by a different accident.
   *
   * 🔴 **Every fixture is built from byte VALUES, never written as a literal.** The first
   * draft of this file typed the bytes directly and the guard failed on its own test — a
   * literal NUL in a test about literal NULs. That is the trap working, and the reason the
   * fixtures below look the way they do.
   */
  it('catches the bytes this repo has really grown', () => {
    const withByte = (before: string, byte: number, after: string): Buffer =>
      Buffer.concat([Buffer.from(before, 'utf8'), Buffer.from([byte]), Buffer.from(after, 'utf8')]);

    // A NUL separator (session BP, twice) — the one that makes grep go blind.
    expect(findFirstOffence(withByte('a', 0x00, 'b'))).toMatchObject({
      kind: 'control',
      byte: 0x00,
    });
    // A literal U+0001 join separator (`StationSetupDialog.tsx`).
    expect(findFirstOffence(withByte("].join('", 0x01, "');"))).toMatchObject({ byte: 0x01 });
    // A backspace eating the `b` of `border-radius` (`theme.ts`).
    expect(findFirstOffence(withByte('', 0x08, 'order-radius'))).toMatchObject({ byte: 0x08 });
    // A form feed, from a PowerShell here-string reading a backtick as an escape.
    expect(findFirstOffence(withByte('NO ', 0x0c, 'ullscreen'))).toMatchObject({ byte: 0x0c });
  });

  it('is clean on ordinary source, including CRLF and Persian', () => {
    expect(findFirstOffence(Buffer.from('const a = 1;\r\nconst b = 2;\r\n', 'utf8'))).toBeNull();
    expect(findFirstOffence(Buffer.from('// زیرنویس اصلی\tok\n', 'utf8'))).toBeNull();
    expect(findFirstOffence(Buffer.alloc(0))).toBeNull();
  });

  it('reports the FIRST offence only — the remedy is per file', () => {
    const bytes = Buffer.concat([
      Buffer.from('ok\n then ', 'utf8'),
      Buffer.from([0x01]),
      Buffer.from(' and ', 'utf8'),
      Buffer.from([0x07]),
      Buffer.from('\n', 'utf8'),
    ]);
    // The 0x07 never appears: one finding per file, because the fix is to open the file.
    expect(findFirstOffence(bytes)).toMatchObject({ byte: 0x01, line: 2 });
  });

  it('counts lines from LF so the report points at the right one', () => {
    const bytes = Buffer.from('one\ntwo\nthree', 'utf8');
    expect(lineOfOffset(bytes, 0)).toBe(1);
    expect(lineOfOffset(bytes, 4)).toBe(2);
    expect(lineOfOffset(bytes, 8)).toBe(3);
  });
});

describe('the BOM half (P-025)', () => {
  it('is a finding at offset 0, and only there', () => {
    expect(findFirstOffence(Buffer.from([0xef, 0xbb, 0xbf, 0x61]))).toMatchObject({ kind: 'bom' });
    // The same three bytes mid-file are legitimate UTF-8 (U+FEFF as content), not a BOM.
    expect(findFirstOffence(Buffer.from([0x61, 0xef, 0xbb, 0xbf]))).toBeNull();
  });

  it('says what to do, and why nothing else catches it', () => {
    const text = describeOffence('a/b.ts', { kind: 'bom', offset: 0, line: 1 });
    expect(text).toContain('UTF-8 BOM');
    expect(text).toContain('Prettier does not strip one');
    expect(text).toContain('WITHOUT a BOM');
  });
});

describe('binary files are judged by EXTENSION, never by content', () => {
  /**
   * 🔴 The whole point. Content sniffing is the judgement `grep` makes, and it fails the
   * same way: a text file with one stray byte sniffs as binary and gets skipped — which is
   * precisely the file this guard exists to catch.
   */
  it('skips the binary formats this tree carries', () => {
    for (const p of ['a/b.png', 'f/x.woff2', 'p.vcg', 'c.avi', 'd.webm', 'e.zip', 'g.mp4']) {
      expect(isTextPath(p), `${p} must be treated as binary`).toBe(false);
    }
  });

  it('reads everything else as text, including dotfiles and extensionless files', () => {
    for (const p of ['a/b.ts', 'x.md', 'y.json', '.npmrc', 'LICENSE', 'tools/bin/cg']) {
      expect(isTextPath(p), `${p} must be treated as text`).toBe(true);
    }
  });

  it('is case-insensitive about the extension', () => {
    expect(isTextPath('A/B.PNG')).toBe(false);
  });

  it('does not read a .ts as binary just because its bytes look odd', () => {
    // The inverse of sniffing, stated as a test: the path decides, not the content.
    expect(isTextPath('apps/x/theme.ts')).toBe(true);
  });
});

describe('the exemption list', () => {
  /**
   * `GUARDS-18` §4 — a file that trips this guard is FIXED, not exempted. Five BOMs were
   * found on the first run and all five were stripped. If this ever has a member, it is a
   * decision with a reason beside it, and this test is where somebody notices.
   */
  it('is EMPTY', () => {
    expect([...EXEMPT_PATHS.keys()]).toEqual([]);
  });
});

describe('the message tells you what to write instead', () => {
  it('names the byte, the line and the escape', () => {
    const text = describeOffence('x/y.ts', { kind: 'control', offset: 41, byte: 0x01, line: 3 });
    expect(text).toContain('x/y.ts:3');
    expect(text).toContain('0x01');
    expect(text).toContain('\\u0001');
    // The reason, not just the verdict: a guard whose message omits WHY gets deleted.
    expect(text).toContain('SILENCE');
  });

  it('prefers the familiar escape where one exists', () => {
    expect(escapeFor(0x00)).toBe('\\0');
    expect(escapeFor(0x08)).toBe('\\b');
    expect(escapeFor(0x0c)).toBe('\\f');
    expect(escapeFor(0x01)).toBe('\\u0001');
  });
});

describe('the allowlist itself', () => {
  it('does not accidentally contain a text extension', () => {
    for (const ext of ['ts', 'tsx', 'md', 'json', 'mjs', 'yaml', 'yml', 'css', 'html', 'txt']) {
      expect(BINARY_EXTENSIONS.has(ext), `${ext} must not be skipped`).toBe(false);
    }
  });
});
