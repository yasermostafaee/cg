// @vitest-environment jsdom
import { act, createElement, Fragment, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import type { SourceDefinition } from '@cg/shared-ipc';
import { InputThumbnail } from '../src/renderer/features/sources/InputThumbnail.js';
import {
  MediaThumbnail,
  createMediaThumbnailLoader,
} from '../src/renderer/features/sources/MediaThumbnail.js';
import { Modal } from '../src/renderer/ui/Modal.js';
import type { RuntimeBridge } from '../src/shared/runtime-bridge.js';

const input = (id: string): SourceDefinition => ({
  id,
  name: id,
  origin: 'input',
  producer: { kind: 'decklink', device: 1 },
});

it('bounds visible poster retries and cancels their timers behind another modal', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('IntersectionObserver', undefined);
  const load = vi.fn<() => Promise<string | null>>().mockResolvedValue(null);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const show = async (covered: boolean, id = 'clip'): Promise<void> => {
    await act(async () =>
      root.render(
        createElement(
          Fragment,
          null,
          createElement(MediaThumbnail, { id, load }),
          covered
            ? createElement(Modal, { title: 'Cover', footer: null, onClose: () => undefined })
            : null,
        ),
      ),
    );
  };
  try {
    await show(false);
    expect(load).toHaveBeenCalledTimes(1);
    await show(true);
    await act(async () => vi.advanceTimersByTimeAsync(10_000));
    expect(load).toHaveBeenCalledTimes(1);
    await show(false);
    expect(load).toHaveBeenCalledTimes(2);
    await act(async () => vi.advanceTimersByTimeAsync(30_000));
    expect(load).toHaveBeenCalledTimes(4);
    load
      .mockRejectedValueOnce(new Error('Temporary failure'))
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce('data:image/jpeg;base64,recovered');
    await show(false, 'recover');
    await act(async () => vi.advanceTimersByTimeAsync(3_000));
    expect(host.querySelector('img')?.getAttribute('src')).toBe('data:image/jpeg;base64,recovered');
    const count = load.mock.calls.length;
    await act(async () => vi.advanceTimersByTimeAsync(30_000));
    expect(load).toHaveBeenCalledTimes(count);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  }
});

it('evicts unsuccessful poster reads and shares successful cached posters', async () => {
  const previous = window.cg;
  const mediaThumbnail = vi
    .fn<RuntimeBridge['sources']['mediaThumbnail']>()
    .mockResolvedValueOnce({ ok: false })
    .mockRejectedValueOnce(new Error('Temporary failure'))
    .mockResolvedValue({ ok: true, dataUrl: 'data:image/jpeg;base64,recovered' });
  window.cg = { sources: { mediaThumbnail } } as unknown as RuntimeBridge;
  const load = createMediaThumbnailLoader();
  try {
    expect(await load('clip')).toBeNull();
    expect(await load('clip')).toBeNull();
    expect(await load('clip')).toBe('data:image/jpeg;base64,recovered');
    expect(await load('clip')).toBe('data:image/jpeg;base64,recovered');
    expect(mediaThumbnail).toHaveBeenCalledTimes(3);
  } finally {
    window.cg = previous;
  }
});

it('pauses covered picture demand and restores the parent picture until its refresh arrives', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(private readonly notify: (entries: { isIntersecting: boolean }[]) => void) {}
      observe() {
        this.notify([{ isIntersecting: true }]);
      }
      disconnect() {
        return undefined;
      }
    },
  );
  const previous = window.cg;
  let refresh = true;
  const thumbnails = vi
    .fn<RuntimeBridge['sourcePreviews']['thumbnails']>()
    .mockImplementation(async ({ sourceIds }) => ({
      frames: refresh
        ? sourceIds.map((sourceId) => ({ sourceId, signal: 'present', jpegBase64: sourceId }))
        : [],
    }));
  window.cg = { sourcePreviews: { thumbnails } } as unknown as RuntimeBridge;
  const load = vi.fn(async () => 'data:image/jpeg;base64,poster');
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  function View({ inner }: { inner: boolean }): JSX.Element {
    return createElement(
      Fragment,
      null,
      createElement(InputThumbnail, { source: input('background'), channel: 1, meterChannel: 1 }),
      createElement(
        Modal,
        { title: 'Parent', onClose: () => undefined, footer: null },
        createElement(InputThumbnail, { source: input('studio'), channel: 1, meterChannel: 1 }),
        createElement(MediaThumbnail, { id: 'clip', load }),
        inner
          ? createElement(
              Modal,
              { title: 'Picker', layer: 'sub', onClose: () => undefined, footer: null },
              createElement(InputThumbnail, {
                source: input('guest'),
                channel: 1,
                meterChannel: 1,
              }),
            )
          : null,
      ),
    );
  }
  const show = async (inner: boolean): Promise<void> => {
    await act(async () =>
      root.render(createElement(StrictMode, null, createElement(View, { inner }))),
    );
  };
  const parent = () => document.querySelector('[role="dialog"][aria-label="Parent"]')!;
  const picture = () => parent().querySelector('[data-input-thumbnail] img')?.getAttribute('src');
  try {
    await show(false);
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(thumbnails.mock.lastCall?.[0].sourceIds).toEqual(['studio']);
    expect(picture()).toBe('data:image/jpeg;base64,studio');
    expect(load).toHaveBeenCalledTimes(1);

    thumbnails.mockClear();
    await show(true);
    await act(async () => vi.advanceTimersByTimeAsync(7_000));
    expect(thumbnails.mock.calls.flatMap(([request]) => request.sourceIds)).not.toContain('studio');
    expect(thumbnails.mock.calls.flatMap(([request]) => request.sourceIds)).not.toContain(
      'background',
    );
    expect(thumbnails.mock.calls.flatMap(([request]) => request.sourceIds)).toContain('guest');
    expect(picture()).toBe('data:image/jpeg;base64,studio');

    refresh = false;
    thumbnails.mockClear();
    await show(false);
    expect(picture()).toBe('data:image/jpeg;base64,studio');
    await act(async () => vi.advanceTimersByTimeAsync(1_000));
    expect(thumbnails.mock.lastCall?.[0].sourceIds).toEqual(['studio']);
    expect(picture()).toBe('data:image/jpeg;base64,studio');
    expect(load).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTimeAsync(4_001));
    expect(picture()).toBeUndefined();
  } finally {
    await act(async () => root.unmount());
    host.remove();
    window.cg = previous;
    vi.unstubAllGlobals();
    vi.useRealTimers();
  }
});
