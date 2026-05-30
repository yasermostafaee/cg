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
