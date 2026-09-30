import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { crc32, entriesUnder, zipEntries } from '../src/zip.js';

/**
 * `CENTRAL-BRIDGE-01` §1 A — the logs download's zip. Read back by an INDEPENDENT reader (Windows'
 * .NET `ZipFile` here, Python's `zipfile` on the Linux CI runner): a writer and a reader written
 * together could agree on a wrong format, so neither of this file's own helpers is the judge. At
 * least one independent reader must run — the positive control — or the test fails, never skips.
 */

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

function scratch(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-zip-'));
  dirs.push(d);
  return d;
}

/** Each entry's name and text, as an independent reader sees them. */
function readIndependently(file: string): Record<string, string> | null {
  if (process.platform === 'win32') {
    const script =
      'Add-Type -AssemblyName System.IO.Compression.FileSystem; ' +
      `$z = [System.IO.Compression.ZipFile]::OpenRead('${file.replace(/'/g, "''")}'); ` +
      '$out = @{}; foreach ($e in $z.Entries) { $r = New-Object System.IO.StreamReader($e.Open()); ' +
      '$out[$e.FullName] = $r.ReadToEnd(); $r.Close() }; $z.Dispose(); $out | ConvertTo-Json -Compress';
    const json = execFileSync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      {
        encoding: 'utf8',
      },
    );
    return JSON.parse(json) as Record<string, string>;
  }
  try {
    const json = execFileSync(
      'python3',
      [
        '-c',
        'import json,sys,zipfile\n' +
          'z = zipfile.ZipFile(sys.argv[1])\n' +
          'assert z.testzip() is None\n' +
          'print(json.dumps({n: z.read(n).decode("utf-8") for n in z.namelist()}))',
        file,
      ],
      { encoding: 'utf8' },
    );
    return JSON.parse(json) as Record<string, string>;
  } catch {
    return null;
  }
}

describe('the logs zip', () => {
  it('CRC-32 is the standard one', () => {
    expect(crc32(Buffer.from('123456789'))).toBe(0xcbf43926);
    expect(crc32(Buffer.alloc(0))).toBe(0);
  });

  it('🔴 an independent reader reads back every file, name and bytes — a subfolder and a Persian line included', async () => {
    const logs = scratch();
    fs.mkdirSync(path.join(logs, 'shawl'), { recursive: true });
    fs.writeFileSync(path.join(logs, 'amcp.log'), 'CG 1-80 PLAY\r\n202 CG OK\r\n'.repeat(200));
    fs.writeFileSync(path.join(logs, 'install.log'), '[writing the configuration] exit 0\r\n');
    fs.writeFileSync(path.join(logs, 'shawl', 'cg-bridge_rCURRENT.log'), 'لایسنس — ok\n');
    const entries = await entriesUnder(logs);
    expect(entries.map((e) => e.name)).toEqual([
      'amcp.log',
      'install.log',
      'shawl/cg-bridge_rCURRENT.log',
    ]);
    const file = path.join(scratch(), 'logs.zip');
    fs.writeFileSync(file, await zipEntries(entries));

    const read = readIndependently(file);
    expect(read, 'no independent reader ran — the zip was judged by nobody').not.toBeNull();
    expect(read).toEqual({
      'amcp.log': 'CG 1-80 PLAY\r\n202 CG OK\r\n'.repeat(200),
      'install.log': '[writing the configuration] exit 0\r\n',
      'shawl/cg-bridge_rCURRENT.log': 'لایسنس — ok\n',
    });
  });

  it('an empty folder is an empty, valid zip; a missing one too', async () => {
    const file = path.join(scratch(), 'empty.zip');
    fs.writeFileSync(file, await zipEntries(await entriesUnder(path.join(scratch(), 'missing'))));
    expect(readIndependently(file)).toEqual({});
  });
});
