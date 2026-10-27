/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BrowserTextSourceAccess } from '../src/platform/BrowserTextSourceAccess.js';

function readableFile(name: string, content: string): File {
  return {
    name,
    size: new TextEncoder().encode(content).byteLength,
    text: vi.fn(() => Promise.resolve(content)),
  } as unknown as File;
}

afterEach(() => {
  Object.defineProperty(window, 'showOpenFilePicker', {
    configurable: true,
    value: undefined,
  });
  vi.restoreAllMocks();
});

describe('BrowserTextSourceAccess', () => {
  it('gets a fresh file snapshot from the retained handle on Reload', async () => {
    const first = readableFile('headlines.txt', 'old content');
    const changed = readableFile('headlines.txt', 'new content');
    const getFile = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(changed);
    Object.defineProperty(window, 'showOpenFilePicker', {
      configurable: true,
      value: vi.fn(() => Promise.resolve([{ name: 'headlines.txt', getFile }])),
    });

    const access = new BrowserTextSourceAccess();
    await expect(access.pick()).resolves.toEqual({
      name: 'headlines.txt',
      bridgePath: 'headlines.txt',
      sourcePath: 'headlines.txt',
      content: 'old content',
    });
    await expect(access.reload('headlines.txt')).resolves.toBe('new content');
    expect(getFile).toHaveBeenCalledTimes(2);
  });
});
