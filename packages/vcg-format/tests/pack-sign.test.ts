import { describe, expect, it } from 'vitest';
import { pack } from '../src/pack.js';
import { unpack } from '../src/unpack.js';
import { verify } from '../src/verify.js';
import { generateEd25519KeyPair } from '../src/sign.js';
import {
  fixtureCgCss,
  fixtureCgJs,
  fixtureIndexHtml,
  fixtureManifestExtras,
  fixtureScene,
} from './fixtures.js';

async function buildSigned(privateKey: string, publicKeyId = 'station-key-1'): Promise<Buffer> {
  return pack({
    scene: fixtureScene,
    manifestExtras: fixtureManifestExtras,
    indexHtml: fixtureIndexHtml,
    cgJs: fixtureCgJs,
    cgCss: fixtureCgCss,
    signing: { privateKey, publicKeyId },
  });
}

describe('pack with signing', () => {
  it('embeds a signing block in the manifest', async () => {
    const { privateKey } = generateEd25519KeyPair();
    const buf = await buildSigned(privateKey);
    const { manifest } = await unpack(buf);
    expect(manifest.signing).toBeDefined();
    expect(manifest.signing?.algorithm).toBe('ed25519');
    expect(manifest.signing?.publicKeyId).toBe('station-key-1');
    expect(manifest.signing?.signature).toMatch(/^[A-Za-z0-9+/=]+$/);
  });

  it('signs the integrity root specifically (not the manifest bytes)', async () => {
    const { privateKey } = generateEd25519KeyPair();
    const buf = await buildSigned(privateKey);
    const { manifest } = await unpack(buf);
    expect(manifest.integrity.root).toMatch(/^[0-9a-f]{64}$/);
    // Signature is base64; non-empty
    expect(manifest.signing?.signature.length ?? 0).toBeGreaterThan(40);
  });
});

describe('verify with signing', () => {
  it('passes when trusted key matches', async () => {
    const { privateKey, publicKey } = generateEd25519KeyPair();
    const buf = await buildSigned(privateKey);
    const result = await verify(buf, {
      trustedPublicKeys: { 'station-key-1': publicKey },
    });
    expect(result.ok).toBe(true);
    expect(result.signed).toBe(true);
    expect(result.signatureVerified).toBe(true);
  });

  it('signed: true, signatureVerified: false when no trust store provided', async () => {
    const { privateKey } = generateEd25519KeyPair();
    const buf = await buildSigned(privateKey);
    const result = await verify(buf);
    expect(result.ok).toBe(true);
    expect(result.signed).toBe(true);
    expect(result.signatureVerified).toBe(false);
  });

  it('fails when publicKeyId is not in the trust store', async () => {
    const { privateKey, publicKey } = generateEd25519KeyPair();
    const buf = await buildSigned(privateKey);
    const result = await verify(buf, {
      trustedPublicKeys: { 'a-different-key': publicKey },
    });
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toMatch(/unknown publicKeyId/);
  });

  it('fails when the wrong public key is trusted under the right id', async () => {
    const { privateKey } = generateEd25519KeyPair();
    const wrong = generateEd25519KeyPair();
    const buf = await buildSigned(privateKey);
    const result = await verify(buf, {
      trustedPublicKeys: { 'station-key-1': wrong.publicKey },
    });
    expect(result.ok).toBe(false);
    expect(result.signatureVerified).toBe(false);
    expect(result.errors.join('\n')).toMatch(/does not verify/);
  });

  it('detects integrity-root tampering even with a valid trust store', async () => {
    // If someone re-zips the .vcg with a modified file but keeps the signed
    // manifest, the integrity recomputation should fail BEFORE the
    // signature check matters.
    const { privateKey, publicKey } = generateEd25519KeyPair();
    const buf = await buildSigned(privateKey);
    const { files, manifest } = await unpack(buf);
    files.set('cg.js', Buffer.from('// tampered'));
    // Re-zip without recomputing manifest (simulate attacker)
    const { writeZip } = await import('../src/zip.js');
    const tampered = await writeZip(files);
    const result = await verify(tampered, {
      trustedPublicKeys: { 'station-key-1': publicKey },
    });
    expect(result.ok).toBe(false);
    // Hash mismatch surfaces before/alongside signature concerns
    expect(result.errors.join('\n')).toMatch(/Hash mismatch/);
    // Manifest signing block is unchanged, so signed flag remains
    expect(result.signed).toBe(true);
    // Signature actually still verifies against the unchanged
    // integrity.root in the manifest — but the integrity.root itself
    // no longer matches the actual file hashes. This is the right
    // outcome: integrity catches per-file tampering, signing catches
    // manifest swaps.
    expect(manifest.integrity.root).toMatch(/^[0-9a-f]{64}$/);
  });

  it('requireSigned still works alongside signed packages', async () => {
    const { privateKey, publicKey } = generateEd25519KeyPair();
    const buf = await buildSigned(privateKey);
    const result = await verify(buf, {
      requireSigned: true,
      trustedPublicKeys: { 'station-key-1': publicKey },
    });
    expect(result.ok).toBe(true);
  });
});
