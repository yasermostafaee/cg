// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import type { MediaPlaybackPreview } from '@cg/shared-ipc';
import type { RuntimeBridge } from '../src/shared/runtime-bridge.js';
import { SourceMediaPreview } from '../src/renderer/features/sources/SourceMediaPreview.js';
import { Modal } from '../src/renderer/ui/Modal.js';

const FIRST = '10000000-0000-4000-8000-000000000001';
const SECOND = '10000000-0000-4000-8000-000000000002';
const THIRD = '10000000-0000-4000-8000-000000000003';

function ready(previewId = FIRST): MediaPlaybackPreview {
  return {
    state: 'ready',
    previewId,
    durationMs: 10_000,
    videoUrl: `http://bridge.test/media-preview/${previewId}/file?ticket=scoped`,
    posterUrl: `http://bridge.test/media-preview/${previewId}/poster?ticket=scoped`,
    engine: 'B',
    host: '192.0.2.43',
  };
}

function mockPlayer() {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance', 'Date'] });
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (
    this: HTMLMediaElement,
  ) {
    this.dispatchEvent(new Event('play'));
    return Promise.resolve();
  });
  const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
  return { play, pause };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function mount(
  mediaOpen: NonNullable<RuntimeBridge['sourcePreviews']['mediaOpen']>,
  inline = false,
) {
  const previous = window.cg;
  const mediaClose = vi.fn(async () => ({ closed: true }));
  const thumbnails = vi.fn(async () => ({ frames: [] }));
  const take = vi.fn();
  const update = vi.fn();
  window.cg = {
    sourcePreviews: { mediaOpen, mediaClose, thumbnails },
    stack: { take, update },
  } as unknown as RuntimeBridge;
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const show = (covered = false) =>
    act(async () =>
      root.render(
        createElement(
          Modal,
          { title: 'Parent', footer: null, onClose: () => undefined },
          createElement(SourceMediaPreview, {
            id: 'md-film',
            name: 'Film',
            durationMs: 10_000,
            channel: 1,
            inline,
            poster: 'data:image/jpeg;base64,original-poster',
          }),
          covered
            ? createElement(Modal, {
                title: 'Cover',
                footer: null,
                layer: 'sub',
                onClose: () => undefined,
              })
            : null,
        ),
      ),
    );
  await show();
  const parent = () => document.querySelector<HTMLElement>('[role="dialog"][aria-label="Parent"]')!;
  return {
    host: parent(),
    show,
    mediaClose,
    thumbnails,
    take,
    update,
    button: (label: string) =>
      parent().querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!,
    close: async () => {
      await act(async () => root.unmount());
      host.remove();
      window.cg = previous;
    },
  };
}

it('plays locally, releases Stop, retains the poster bitmap and opens a fresh lease on replay', async () => {
  const player = mockPlayer();
  const mediaOpen = vi
    .fn<NonNullable<RuntimeBridge['sourcePreviews']['mediaOpen']>>()
    .mockResolvedValueOnce(ready())
    .mockResolvedValue(ready(SECOND));
  const view = await mount(mediaOpen);
  try {
    const video = view.host.querySelector('video')!;
    const poster = view.host.querySelector('.cg-source-media-preview__picture img');
    expect(video.muted).toBe(true);
    expect(video.preload).toBe('metadata');
    expect(view.host.textContent).toContain('Server B');
    expect(mediaOpen).toHaveBeenCalledWith({ channel: 1, sourceId: 'md-film', prepare: true });
    await act(async () => view.button('Play preview').click());
    expect(player.play).toHaveBeenCalledOnce();
    expect(video.hidden).toBe(false);
    await act(async () => {
      video.currentTime = 2.5;
      video.dispatchEvent(new Event('timeupdate'));
    });
    expect(
      view.host.querySelector<HTMLInputElement>('[aria-label="Preview position"]')?.value,
    ).toBe('2500');
    await act(async () => view.button('Listen to preview').click());
    expect(video.muted).toBe(false);
    await act(async () => view.button('Pause preview').click());
    expect(player.pause).toHaveBeenCalled();
    await act(async () => view.button('Stop preview').click());
    expect(view.mediaClose).toHaveBeenCalledTimes(1);
    expect(view.mediaClose).toHaveBeenCalledWith({ previewId: FIRST });
    expect(video.currentTime).toBe(0);
    expect(video.hidden).toBe(true);
    expect(view.host.querySelector('.cg-source-media-preview__picture img')).toBe(poster);
    expect((poster as HTMLImageElement).hidden).toBe(false);
    await act(async () => vi.advanceTimersByTimeAsync(30_000));
    expect(mediaOpen).toHaveBeenCalledTimes(1);
    await act(async () => view.button('Play preview').click());
    expect(mediaOpen).toHaveBeenCalledTimes(2);
    expect(mediaOpen.mock.calls[1]?.[0].previewId).toBeUndefined();
    expect(view.host.querySelector('video')?.getAttribute('src')).toBe(ready(SECOND).videoUrl);
    expect(view.thumbnails).not.toHaveBeenCalled();
    expect(view.take).not.toHaveBeenCalled();
    expect(view.update).not.toHaveBeenCalled();
  } finally {
    await view.close();
  }
});

it('closes a late open response and resumes a covered player from its paused local position', async () => {
  const player = mockPlayer();
  let resolveFirst!: (value: MediaPlaybackPreview) => void;
  let resolveReopen!: (value: MediaPlaybackPreview) => void;
  let rejectOldPlay!: (error: Error) => void;
  player.play.mockImplementationOnce(function (this: HTMLMediaElement) {
    this.dispatchEvent(new Event('play'));
    return new Promise<void>((_resolve, reject) => (rejectOldPlay = reject));
  });
  const mediaOpen = vi
    .fn<NonNullable<RuntimeBridge['sourcePreviews']['mediaOpen']>>()
    .mockImplementationOnce(() => new Promise((resolve) => (resolveFirst = resolve)))
    .mockResolvedValueOnce(ready(SECOND))
    .mockImplementationOnce(() => new Promise((resolve) => (resolveReopen = resolve)));
  const view = await mount(mediaOpen, true);
  try {
    await view.show(true);
    await act(async () => resolveFirst(ready()));
    expect(view.mediaClose).toHaveBeenCalledTimes(1);
    expect(view.mediaClose).toHaveBeenCalledWith({ previewId: FIRST });
    expect(view.host.querySelector('video')).toBeNull();
    await view.show(false);
    const video = view.host.querySelector('video')!;
    await act(async () => {
      video.currentTime = 3;
      video.dispatchEvent(new Event('timeupdate'));
    });
    await view.show(true);
    expect(view.mediaClose).toHaveBeenCalledWith({ previewId: SECOND });
    expect(player.pause).toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTimeAsync(30_000));
    expect(mediaOpen).toHaveBeenCalledTimes(2);
    player.play.mockImplementation(function (this: HTMLMediaElement) {
      if (this.getAttribute('src') === ready(SECOND).videoUrl) {
        return Promise.reject(new Error('the old grant was revoked'));
      }
      this.dispatchEvent(new Event('play'));
      return Promise.resolve();
    });
    const plays = player.play.mock.calls.length;
    await view.show(false);
    expect(mediaOpen).toHaveBeenCalledTimes(3);
    await act(async () => video.dispatchEvent(new Event('error')));
    expect(player.play).toHaveBeenCalledTimes(plays);
    expect(view.button('Pause preview').disabled).toBe(false);
    await act(async () => resolveReopen(ready(THIRD)));
    await act(async () => video.dispatchEvent(new Event('loadedmetadata')));
    expect(video.currentTime).toBe(3);
    expect(player.play).toHaveBeenCalled();
    await act(async () => rejectOldPlay(new Error('the old loading operation was aborted')));
    expect(view.button('Pause preview').disabled).toBe(false);
    expect(view.host.textContent).not.toContain('Preview could not play');
    expect(view.thumbnails).not.toHaveBeenCalled();
  } finally {
    await view.close();
  }
});

it('polls proxy readiness with the same lease and stops polling when covered', async () => {
  mockPlayer();
  const preparing: MediaPlaybackPreview = { ...ready(), state: 'preparing', videoUrl: undefined };
  const mediaOpen = vi
    .fn<NonNullable<RuntimeBridge['sourcePreviews']['mediaOpen']>>()
    .mockResolvedValue(preparing);
  const view = await mount(mediaOpen, true);
  try {
    expect(view.host.textContent).toContain('Preparing preview…');
    expect(view.host.querySelector('video')).toBeNull();
    expect(view.host.querySelector('img')?.src).toBe(preparing.posterUrl);
    await act(async () => vi.advanceTimersByTimeAsync(1_000));
    expect(mediaOpen).toHaveBeenLastCalledWith({
      channel: 1,
      sourceId: 'md-film',
      previewId: FIRST,
      prepare: true,
    });
    await view.show(true);
    expect(view.mediaClose).toHaveBeenCalledWith({ previewId: FIRST });
    const reads = mediaOpen.mock.calls.length;
    await act(async () => vi.advanceTimersByTimeAsync(60_000));
    expect(mediaOpen).toHaveBeenCalledTimes(reads);
  } finally {
    await view.close();
  }
});

it('keeps the poster visible and permits preparation when a renewed proxy needs rebuilding', async () => {
  mockPlayer();
  const preparing: MediaPlaybackPreview = { ...ready(), state: 'preparing', videoUrl: undefined };
  const mediaOpen = vi
    .fn<NonNullable<RuntimeBridge['sourcePreviews']['mediaOpen']>>()
    .mockResolvedValueOnce(ready())
    .mockResolvedValueOnce(preparing)
    .mockResolvedValue(ready());
  const view = await mount(mediaOpen, true);
  try {
    await act(async () => vi.advanceTimersByTimeAsync(15_000));
    expect(view.host.textContent).toContain('Preparing preview…');
    expect(view.host.querySelector('video')).toBeNull();
    expect(view.host.querySelector('img')?.hidden).toBe(false);
    expect(mediaOpen).toHaveBeenLastCalledWith({
      channel: 1,
      sourceId: 'md-film',
      previewId: FIRST,
      prepare: true,
    });
    await act(async () => vi.advanceTimersByTimeAsync(1_000));
    expect(view.host.querySelector('video')?.hidden).toBe(false);
    expect(mediaOpen).toHaveBeenLastCalledWith({
      channel: 1,
      sourceId: 'md-film',
      previewId: FIRST,
      prepare: true,
    });
  } finally {
    await view.close();
  }
});

it('keeps the sampled preview available when the Engine does not support file previews', async () => {
  mockPlayer();
  const mediaOpen = vi
    .fn<NonNullable<RuntimeBridge['sourcePreviews']['mediaOpen']>>()
    .mockResolvedValue({ state: 'unsupported' });
  const view = await mount(mediaOpen);
  try {
    expect(view.host.querySelector('[data-media-file-preview]')).toBeNull();
    expect(view.host.textContent).toContain('Silent preview · sampled frames');
    expect(view.button('Play preview').disabled).toBe(false);
  } finally {
    await view.close();
  }
});

it('releases a failed player and retries through a fresh lease', async () => {
  mockPlayer();
  const mediaOpen = vi
    .fn<NonNullable<RuntimeBridge['sourcePreviews']['mediaOpen']>>()
    .mockResolvedValueOnce(ready())
    .mockResolvedValue(ready(SECOND));
  const view = await mount(mediaOpen, true);
  try {
    await act(async () => view.host.querySelector('video')!.dispatchEvent(new Event('error')));
    expect(view.mediaClose).toHaveBeenCalledWith({ previewId: FIRST });
    expect(view.host.textContent).toContain('Preview cannot play in this browser.');
    await act(async () => view.button('Play preview').click());
    expect(mediaOpen).toHaveBeenCalledTimes(2);
    expect(mediaOpen.mock.calls[1]?.[0].previewId).toBeUndefined();
    expect(view.host.querySelector('video')?.getAttribute('src')).toBe(ready(SECOND).videoUrl);
  } finally {
    await view.close();
  }
});
