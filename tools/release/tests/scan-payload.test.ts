import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  DEV_ONLY_MARKERS,
  TEST_SECRETS,
  findingsIn,
  isPrivateV4,
  scanPayload,
  stringsOf,
} from '../src/scan-payload.mjs';

/**
 * 🔴 `RELEASE-0110-01` §3 — and no token and no dev-only code: the dev station's flags and the suite's
 * fakes. Proven both ways, as the rules above are.
 */
describe('RELEASE-0110-01 §3 — no token, no dev-only code', () => {
  it.each(DEV_ONLY_MARKERS.map((m) => [m.label]))('finds the dev-only marker %s', (label) => {
    expect(findingsIn(`run(['${label}']);`)).toContainEqual({
      kind: 'dev-only code',
      value: label,
      line: 1,
    });
  });

  it('CONTROL — CG Bridge’s own flags are not the dev station’s: --caspar-host and --playout-address pass', () => {
    expect(findingsIn("args = ['--caspar-host', '127.0.0.1', '--playout-address', x];")).toEqual([]);
  });

  it('finds a signed token by its shape, and nothing that merely starts like one', () => {
    // Built here, so this file carries no token-shaped literal of its own.
    const token = [`eyJ${'a'.repeat(12)}`, `eyJ${'b'.repeat(12)}`, 'c'.repeat(12)].join('.');
    expect(findingsIn(`const t = "${token}";`)).toEqual([
      { kind: 'token', value: `${token.slice(0, 16)}…`, line: 1 },
    ]);
    expect(findingsIn('const header = "eyJhbGciOi";')).toEqual([]);
  });

  it('reads a binary’s printable strings, ASCII and UTF-16, for what a program we build carries', () => {
    const ascii = Buffer.from('\u0000\u0001plain 192.168.1.20 text\u0000', 'latin1');
    const wide = Buffer.from('wide --fake word', 'utf16le');
    const strings = stringsOf(Buffer.concat([ascii, Buffer.from([0, 0, 0]), wide]));
    expect(findingsIn(strings).map((f) => f.kind)).toEqual(['private address', 'dev-only code']);
    // A run shorter than six characters is noise, not a string.
    expect(stringsOf(Buffer.from('\u0000abc\u0000', 'latin1'))).toBe('');
  });
});

/**
 * 🔴 `CLIENT-TEST-RELEASE-01` — the scan that stands between the installers and a real address or a
 * test secret. Every rule is proven both ways: a planted leak is found, with its line, and an address
 * that is not private — loopback, the documentation ranges, a public resolver — passes.
 */

let scratch: string | null = null;
afterEach(() => {
  if (scratch !== null) fs.rmSync(scratch, { recursive: true, force: true });
  scratch = null;
});

function tree(files: Record<string, string | Buffer>): string {
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-scan-payload-'));
  for (const [name, content] of Object.entries(files)) {
    const full = path.join(scratch, name);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return scratch;
}

describe('CLIENT-TEST-RELEASE-01 — the installers carry no real address and no test secret', () => {
  it.each([
    ['10.0.0.5'],
    ['172.16.4.2'],
    ['172.31.255.1'],
    ['172.27.36.59'],
    ['192.168.21.114'],
    ['192.168.1.20'],
  ])('finds the private address %s', (address) => {
    expect(findingsIn(`const host = "${address}";`)).toEqual([
      { kind: 'private address', value: address, line: 1 },
    ]);
  });

  it.each([
    ['127.0.0.1'],
    ['0.0.0.0'],
    ['192.0.2.10'],
    ['198.51.100.7'],
    ['203.0.113.9'],
    ['8.8.8.8'],
    ['172.15.0.1'],
    ['172.32.0.1'],
    ['192.169.0.1'],
  ])('passes %s — not private', (address) => {
    expect(findingsIn(`probe("${address}")`)).toEqual([]);
  });

  it('reads a dotted quad only where it stands alone — not inside a longer dotted number', () => {
    expect(findingsIn('version 1.10.0.0.1 and 10.0.0.1.2')).toEqual([]);
    expect(findingsIn('octets over 255: 10.300.1.1')).toEqual([]);
  });

  it.each(TEST_SECRETS.map((secret) => [secret]))('finds the test secret %s', (secret) => {
    expect(findingsIn(`a\nb ${secret} c`)).toEqual([{ kind: 'test secret', value: secret, line: 2 }]);
  });

  it('walks every text file, names each hit by file and line, and skips binaries by extension', () => {
    const root = tree({
      'console/assets/index.js': 'ok\nplaceholder:"192.168.21.115"',
      'console/index.html': '<p>fine</p>',
      'bridge/caspar-bridge.mjs': '// this bridge at 192.168.21.93',
      'binaries/cg-bridge.exe': Buffer.from('10.0.0.1 inside a binary'),
      'fonts/v.woff2': Buffer.from('192.168.0.1'),
    });
    const report = scanPayload([root]);
    expect(report.files).toBe(3);
    expect(report.findings.map((f) => [path.relative(root, f.file), f.line, f.value])).toEqual([
      [path.join('bridge', 'caspar-bridge.mjs'), 1, '192.168.21.93'],
      [path.join('console', 'assets', 'index.js'), 2, '192.168.21.115'],
    ]);
  });

  it('CONTROL — a folder that is not there is a finding, never a silent pass', () => {
    const missing = path.join(os.tmpdir(), 'cg-scan-payload-no-such-folder');
    expect(scanPayload([missing]).findings).toEqual([
      { file: missing, kind: 'missing folder', value: missing, line: 0 },
    ]);
  });

  it('the address classes, stated', () => {
    expect(isPrivateV4(10, 1, 2, 3)).toBe(true);
    expect(isPrivateV4(172, 16, 0, 1)).toBe(true);
    expect(isPrivateV4(192, 168, 0, 1)).toBe(true);
    expect(isPrivateV4(192, 0, 2, 1)).toBe(false);
  });
});
