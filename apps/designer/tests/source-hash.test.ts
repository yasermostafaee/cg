/** @vitest-environment node */
import { describe, expect, it, vi } from 'vitest';
import { sha256Hex } from '@cg/vcg-format';
import { hashSourceStream } from '../src/renderer/features/assets/source-hash.js';

/**
 * D-128 — the pre-convert dedupe hash CORE. Streams the picked File through an
 * incremental sha256 (bounded memory), reports progress, and honours abort.
 * Runs in the `node` env so the global File / Blob.stream() are real.
 *
 * These tests target `hashSourceStream` — the pure streaming logic. In the app
 * it runs inside a dedicated Worker (`source-hash.worker.ts`) behind
 * `hashSourceFile`, because hundreds of megabytes of pure-JS hashing on the
 * MAIN thread starve paint and trip Chrome's page-unresponsive dialog (the
 * owner's 150–740 MB archive clips). The worker shell is a thin
 * message-forwarding wrapper exercised by the E2E import flows; the logic
 * under test here is identical in both.
 */

function fileOf(bytes: Uint8Array<ArrayBuffer>, name = 'clip.avi'): File {
  return new File([bytes], name, { type: 'video/x-msvideo' });
}

describe('hashSourceStream (D-128 pre-convert dedupe core)', () => {
  it('produces the sha256 of the file bytes (equals the one-shot digest)', async () => {
    const bytes = new TextEncoder().encode('the quick brown fox');
    expect(await hashSourceStream(fileOf(bytes))).toBe(sha256Hex(bytes));
  });

  it('reports monotonic 0..1 progress that ends at 1', async () => {
    // 512 KiB forces the browser/node stream to deliver multiple chunks
    const bytes = new Uint8Array(512 * 1024).map((_, i) => i & 0xff);
    const ratios: number[] = [];
    const hash = await hashSourceStream(fileOf(bytes), { onProgress: (r) => ratios.push(r) });
    expect(hash).toBe(sha256Hex(bytes));
    expect(ratios.length).toBeGreaterThan(0);
    for (let i = 1; i < ratios.length; i++)
      expect(ratios[i]!).toBeGreaterThanOrEqual(ratios[i - 1]!);
    expect(ratios.at(-1)).toBe(1);
    expect(ratios.every((r) => r >= 0 && r <= 1)).toBe(true);
  });

  it('rejects with AbortError when the signal is already aborted (reads nothing)', async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(
      hashSourceStream(fileOf(new Uint8Array(1024)), { signal: ctrl.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('empty file hashes to the empty-string digest', async () => {
    expect(await hashSourceStream(fileOf(new Uint8Array(0)))).toBe(sha256Hex(new Uint8Array(0)));
  });

  it('does not hold the whole file in memory — reads via a bounded stream reader', async () => {
    // guard the contract: we go through File.stream(), not file.arrayBuffer()
    const bytes = new Uint8Array(256 * 1024);
    const f = fileOf(bytes);
    const arrayBufferSpy = vi.spyOn(f, 'arrayBuffer');
    await hashSourceStream(f);
    expect(arrayBufferSpy).not.toHaveBeenCalled(); // never slurps the whole file
  });
});

describe('hashSourceStream — an image sequence (D-164)', () => {
  /** The key by hand: each frame's length (8 bytes, big-endian), then its bytes, in order. */
  function framed(frames: readonly Uint8Array[]): Uint8Array {
    const total = frames.reduce((n, b) => n + 8 + b.length, 0);
    const out = new Uint8Array(total);
    const view = new DataView(out.buffer);
    let at = 0;
    for (const b of frames) {
      view.setBigUint64(at, BigInt(b.length));
      out.set(b, at + 8);
      at += 8 + b.length;
    }
    return out;
  }
  const enc = (s: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(s);

  it('🔴 hashes the frames IN ORDER, each length-prefixed', async () => {
    const a = enc('frame one');
    const b = enc('frame two');
    const hash = await hashSourceStream([fileOf(a, 'f1.png'), fileOf(b, 'f2.png')]);
    expect(hash).toBe(sha256Hex(framed([a, b])));
    // Control: the order is part of the key.
    expect(await hashSourceStream([fileOf(b, 'f2.png'), fileOf(a, 'f1.png')])).not.toBe(hash);
  });

  it('🔴 a byte moved across a frame boundary is a DIFFERENT key (bare concatenation would collide)', async () => {
    const one = await hashSourceStream([fileOf(enc('ab')), fileOf(enc('c'))]);
    const two = await hashSourceStream([fileOf(enc('a')), fileOf(enc('bc'))]);
    expect(one).not.toBe(two);
    // Both concatenate to `abc`; each is its own FRAMED digest, so the prefix is what told them apart.
    expect(one).toBe(sha256Hex(framed([enc('ab'), enc('c')])));
    expect(two).toBe(sha256Hex(framed([enc('a'), enc('bc')])));
  });

  it('a held frame repeated in the list is hashed each time it plays', async () => {
    const a = enc('A');
    const b = enc('B');
    expect(await hashSourceStream([fileOf(a), fileOf(a), fileOf(b)])).toBe(
      sha256Hex(framed([a, a, b])),
    );
  });

  it('progress counts every frame and ends at 1', async () => {
    const ratios: number[] = [];
    await hashSourceStream(
      [fileOf(new Uint8Array(200 * 1024)), fileOf(new Uint8Array(100 * 1024))],
      { onProgress: (r) => ratios.push(r) },
    );
    expect(ratios.at(-1)).toBe(1);
    for (let i = 1; i < ratios.length; i++)
      expect(ratios[i]!).toBeGreaterThanOrEqual(ratios[i - 1]!);
  });

  it('an abort stops a sequence too', async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(
      hashSourceStream([fileOf(new Uint8Array(16)), fileOf(new Uint8Array(16))], {
        signal: ctrl.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});
