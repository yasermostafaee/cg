import { describe, expect, it } from 'vitest';
import { pack } from '../src/pack.js';
import { unpack } from '../src/unpack.js';
import { verify } from '../src/verify.js';
import { writeZip } from '../src/zip.js';
import {
  fixtureCgCss,
  fixtureCgJs,
  fixtureIndexHtml,
  fixtureManifestExtras,
  fixtureScene,
} from './fixtures.js';

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);

async function buildVcg(): Promise<Uint8Array> {
  return pack({
    scene: fixtureScene,
    manifestExtras: fixtureManifestExtras,
    indexHtml: fixtureIndexHtml,
    cgJs: fixtureCgJs,
    cgCss: fixtureCgCss,
  });
}

describe('verify', () => {
  it('passes a freshly-packed .vcg', async () => {
    const result = await verify(await buildVcg());
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.signed).toBe(false);
  });

  it('reports an unsigned package when signing is required', async () => {
    const result = await verify(await buildVcg(), { requireSigned: true });
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toMatch(/signing is required/i);
  });

  it('detects tampering with a payload file', async () => {
    const buf = await buildVcg();
    const { files } = await unpack(buf);
    // Tamper with cg.js
    files.set('cg.js', enc('// tampered'));
    const tamperedZip = await writeZip(files);
    const result = await verify(tamperedZip);
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toMatch(/Hash mismatch/);
  });

  it('detects a missing declared file', async () => {
    const buf = await buildVcg();
    const { files } = await unpack(buf);
    files.delete('cg.css');
    const stripped = await writeZip(files);
    const result = await verify(stripped);
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toMatch(/Missing file declared in integrity/);
  });

  it('detects a malformed zip', async () => {
    const result = await verify(enc('not a zip'));
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatch(/Unpack failed/);
  });
});

/*
  🔴 `BOOK-EXPORT-01` (`B-350`) — WHY it failed, so a console can say "damaged" only about a file
  that is: the owner's 0-byte `telavat.vcg` read "Unpack failed: End of data reached … Corrupted
  zip ?", and a template from a newer build must not be called damaged.
*/
describe('verify — the kind of failure', () => {
  it('🔴 an EMPTY file, text, and a cut-short package are UNREADABLE', async () => {
    const whole = await buildVcg();
    for (const bytes of [new Uint8Array(0), enc('not a zip'), whole.slice(0, whole.length >> 1)]) {
      expect((await verify(bytes)).failure).toBe('unreadable');
    }
  });

  it('a zip with no template in it is NOT A TEMPLATE', async () => {
    const zip = await writeZip(new Map([['readme.txt', enc('hello')]]));
    expect((await verify(zip)).failure).toBe('not-a-template');
    const { files } = await unpack(await buildVcg());
    files.set('manifest.json', enc('{ not json'));
    expect((await verify(await writeZip(files))).failure).toBe('not-a-template');
  });

  it('a template that does not parse is INVALID — it may be a newer build’s, not a damaged one', async () => {
    const { files } = await unpack(await buildVcg());
    files.set('template.json', enc(JSON.stringify({ schemaVersion: 99 })));
    expect((await verify(await writeZip(files))).failure).toBe('invalid');
  });

  it('changed bytes are INTEGRITY; a missing signature under a policy is TRUST; a good one is null', async () => {
    const { files } = await unpack(await buildVcg());
    files.set('cg.js', enc('// tampered'));
    expect((await verify(await writeZip(files))).failure).toBe('integrity');
    expect((await verify(await buildVcg(), { requireSigned: true })).failure).toBe('trust');
    expect((await verify(await buildVcg())).failure).toBeNull();
  });
});

describe('pack — progress', () => {
  it('reports the packing done, only forward, ending at 1', async () => {
    const shares: number[] = [];
    await pack({
      scene: fixtureScene,
      manifestExtras: fixtureManifestExtras,
      indexHtml: fixtureIndexHtml,
      cgJs: fixtureCgJs,
      cgCss: fixtureCgCss,
      assets: new Map([['assets/image/a.png', new Uint8Array(4096)]]),
      onProgress: (share) => shares.push(share),
    });
    expect(shares.length).toBeGreaterThan(2);
    expect(shares).toEqual([...shares].sort((x, y) => x - y));
    expect(shares.at(-1)).toBe(1);
  });
});
