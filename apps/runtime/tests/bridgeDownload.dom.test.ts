// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadBridgeArchive } from '../src/platform/bridgeDownload.js';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('B-389 — CG Bridge logs stay inside CG Control until the local download', () => {
  it('fetches the one-use URL, then downloads a Blob URL with the bridge filename', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers({
          'content-disposition': 'attachment; filename="cg-bridge-logs-2026-11-04.zip"',
        }),
        blob: () => Promise.resolve(new Blob(['PK'], { type: 'application/zip' })),
      }),
    );
    vi.stubGlobal('fetch', fetcher);
    const createObjectURL = vi.fn(() => 'blob:cg-control-logs');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });
    let clicked: { href: string; download: string; connected: boolean } | null = null;
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked = { href: this.href, download: this.download, connected: this.isConnected };
    });

    await downloadBridgeArchive('http://bridge.local/logs.zip?ticket=one-use');

    expect(fetcher).toHaveBeenCalledWith('http://bridge.local/logs.zip?ticket=one-use', {
      cache: 'no-store',
    });
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(clicked).toEqual({
      href: 'blob:cg-control-logs',
      download: 'cg-bridge-logs-2026-11-04.zip',
      connected: true,
    });
    expect(document.querySelector('a')).toBeNull();
    expect(revokeObjectURL).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:cg-control-logs');
  });

  it('returns a useful failure when the ticketed archive is refused', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 403,
          text: () => Promise.resolve('forbidden'),
        }),
      ),
    );

    await expect(
      downloadBridgeArchive('http://bridge.local/logs.zip?ticket=spent'),
    ).rejects.toThrow(
      'CG Bridge did not provide the log archive (HTTP 403: forbidden). Try Download logs again.',
    );
  });

  it('explains a network/CORS failure instead of exposing Failed to fetch', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
    );

    await expect(downloadBridgeArchive('http://bridge.local/logs.zip?ticket=old')).rejects.toThrow(
      'CG Control could not reach the log archive. Restart CG Bridge with the matching build, then try Download logs again.',
    );
  });
});
