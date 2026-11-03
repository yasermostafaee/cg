/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BrowserTextSourceAccess,
  textSourceSampleMimeType,
} from '../src/platform/BrowserTextSourceAccess.js';

function readableFile(name: string, content: string): File {
  const bytes = new TextEncoder().encode(content);
  return {
    name,
    size: bytes.byteLength,
    text: vi.fn(() => Promise.resolve(content)),
    arrayBuffer: vi.fn(() => Promise.resolve(Uint8Array.from(bytes).buffer)),
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
  it('uses MIME essence values that Chromium accepts in save-file picker options', () => {
    expect(textSourceSampleMimeType('csv')).toBe('text/csv');
    expect(textSourceSampleMimeType('json')).toBe('application/json');
    expect(textSourceSampleMimeType('xlsx')).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
  });

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

  it('keeps an Excel row source binary and reloadable', async () => {
    const file = readableFile('weather.xlsx', 'PK workbook bytes');
    const getFile = vi.fn(() => Promise.resolve(file));
    const picker = vi.fn((_options: unknown) => Promise.resolve([{ name: file.name, getFile }]));
    Object.defineProperty(window, 'showOpenFilePicker', {
      configurable: true,
      value: picker,
    });

    const access = new BrowserTextSourceAccess();
    const selected = await access.pickStructuredRows();
    expect(selected?.content).toBeInstanceOf(Uint8Array);
    await expect(access.reloadStructuredRows('weather.xlsx')).resolves.toBeInstanceOf(Uint8Array);
    expect(picker.mock.calls[0]?.[0]).toMatchObject({
      types: [
        {
          accept: {
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
          },
        },
      ],
    });
  });

  it('reloads a generated workbook from the handle retained after Save and connect', async () => {
    const changed = readableFile('weather.xlsx', 'edited workbook bytes');
    const handle = {
      name: 'weather.xlsx',
      getFile: vi.fn(() => Promise.resolve(changed)),
    } as unknown as FileSystemFileHandle;
    const access = new BrowserTextSourceAccess();

    access.rememberStructuredRowsHandle(handle);

    await expect(access.reloadStructuredRows('weather.xlsx')).resolves.toBeInstanceOf(Uint8Array);
  });
});
