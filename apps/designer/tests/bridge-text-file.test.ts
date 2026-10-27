/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest';
import {
  bridgeTextSourceFiles,
  isVisibleWindowsSourcePath,
  MAX_BRIDGE_TEXT_SOURCE_BYTES,
  readBridgeTextPreview,
} from '../src/renderer/features/inspector/bridgeTextFile.js';

function pickedFile(name: string, content = 'sample', type = 'text/plain'): File {
  return new File([content], name, { type });
}

describe('R-102 — shared text-file browse', () => {
  it('stores direct picks by safe basename and naturally sorts supported text files', () => {
    const files = bridgeTextSourceFiles([
      pickedFile('item10.txt'),
      pickedFile('item2.txt'),
      pickedFile('logo.png', 'png', 'image/png'),
      pickedFile('../escape.txt'),
    ]);
    expect(files.map((entry) => entry.path)).toEqual(['item2.txt', 'item10.txt']);
  });

  it('omits files larger than the same 1 MiB ceiling enforced by CG Bridge', () => {
    const file = pickedFile('large.txt');
    Object.defineProperty(file, 'size', {
      configurable: true,
      value: MAX_BRIDGE_TEXT_SOURCE_BYTES + 1,
    });
    expect(bridgeTextSourceFiles([file])).toEqual([]);
  });

  it('reads current bytes for preview without putting them in the template', async () => {
    const file = pickedFile('live.txt');
    Object.defineProperty(file, 'text', { value: vi.fn(() => Promise.resolve('خبر تازه')) });
    await expect(readBridgeTextPreview(file)).resolves.toBe('خبر تازه');
  });

  it('distinguishes a native Windows/UNC path from the browser basename fallback', () => {
    expect(isVisibleWindowsSourcePath(String.raw`C:\newsroom\live.txt`)).toBe(true);
    expect(isVisibleWindowsSourcePath(String.raw`\\newsroom\shared\live.txt`)).toBe(true);
    expect(isVisibleWindowsSourcePath('live.txt')).toBe(false);
    expect(isVisibleWindowsSourcePath('folder/live.txt')).toBe(false);
  });
});
