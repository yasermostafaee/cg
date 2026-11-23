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

    await downloadBridgeArchive(() =>
      Promise.resolve('http://bridge.local/logs.zip?ticket=one-use'),
    );

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

  it('waits for the native save confirmation and passes ZIP bytes without a download navigation', async () => {
    const archive = Uint8Array.of(0x50, 0x4b, 0x05, 0x06);
    const savedPath = 'C:\\Users\\operator\\Downloads\\cg-bridge logs.zip';
    const invoke = vi.fn(async () => savedPath);
    vi.stubGlobal('__TAURI_INTERNALS__', { invoke });
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(archive, {
            headers: { 'content-disposition': 'attachment; filename="cg-bridge logs.zip"' },
          }),
      ),
    );
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click');

    await expect(
      downloadBridgeArchive(() => Promise.resolve('http://bridge.local/logs.zip?ticket=one-use')),
    ).resolves.toEqual({ kind: 'saved', location: savedPath });
    expect(invoke).toHaveBeenCalledOnce();
    expect(invoke).toHaveBeenCalledWith('save_bridge_archive', archive.buffer, {
      headers: { 'x-cg-archive-name': 'cg-bridge%20logs.zip' },
    });
    expect(click).not.toHaveBeenCalled();
  });

  it('reports a failed native save without switching to a browser download', async () => {
    const invoke = vi.fn().mockRejectedValueOnce('Disk full.');
    vi.stubGlobal('__TAURI_INTERNALS__', { invoke });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(Uint8Array.of(0x50, 0x4b))),
    );
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click');

    await expect(
      downloadBridgeArchive(() => Promise.resolve('http://bridge.local/logs.zip?ticket=error')),
    ).rejects.toThrow('CG Control could not save the log archive. Disk full.');
    expect(click).not.toHaveBeenCalled();
  });

  it('reports a native cancel without issuing a browser download', async () => {
    const invoke = vi.fn().mockResolvedValueOnce(null);
    vi.stubGlobal('__TAURI_INTERNALS__', { invoke });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(Uint8Array.of(0x50, 0x4b))),
    );
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click');

    await expect(
      downloadBridgeArchive(() => Promise.resolve('http://bridge.local/logs.zip?ticket=cancel')),
    ).resolves.toEqual({ kind: 'cancelled' });
    expect(click).not.toHaveBeenCalled();
  });

  it('opens the browser picker before obtaining a ticket and aborts on cancel', async () => {
    const ticketUrl = vi.fn(async () => 'http://bridge.local/logs.zip?ticket=not-created');
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const choose = vi.fn().mockRejectedValueOnce(new DOMException('Cancelled', 'AbortError'));
    vi.stubGlobal('showSaveFilePicker', choose);

    await expect(downloadBridgeArchive(ticketUrl)).resolves.toEqual({ kind: 'cancelled' });
    expect(choose).toHaveBeenCalledOnce();
    expect(ticketUrl).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('reports the browser filename after the chosen handle closes the write', async () => {
    const events: string[] = [];
    const archive = Uint8Array.of(0x50, 0x4b, 0x05, 0x06);
    const choose = vi.fn(async () => {
      events.push('picker');
      return {
        name: 'chosen browser logs.zip',
        createWritable: async () => ({
          write: async (body: Blob) => {
            expect(new Uint8Array(await body.arrayBuffer())).toEqual(archive);
            events.push('write');
          },
          close: async () => {
            events.push('close');
          },
        }),
      };
    });
    vi.stubGlobal('showSaveFilePicker', choose);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(archive)),
    );

    await expect(
      downloadBridgeArchive(async () => {
        events.push('ticket');
        return 'http://bridge.local/logs.zip?ticket=one-use';
      }),
    ).resolves.toEqual({ kind: 'saved', location: 'chosen browser logs.zip' });
    expect(events).toEqual(['picker', 'ticket', 'write', 'close']);
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
      downloadBridgeArchive(() => Promise.resolve('http://bridge.local/logs.zip?ticket=spent')),
    ).rejects.toThrow(
      'CG Bridge did not provide the log archive (HTTP 403: forbidden). Try Download logs again.',
    );
  });

  it('explains a network/CORS failure instead of exposing Failed to fetch', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
    );

    await expect(
      downloadBridgeArchive(() => Promise.resolve('http://bridge.local/logs.zip?ticket=old')),
    ).rejects.toThrow(
      'CG Control could not reach the log archive. Restart CG Bridge with the matching build, then try Download logs again.',
    );
  });
});
