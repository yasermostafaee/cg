// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import type { MediaPlaybackPreview, PgmTopology } from '@cg/shared-ipc';
import type { RuntimeBridge } from '../src/shared/runtime-bridge.js';
import { SourceMediaPreview } from '../src/renderer/features/sources/SourceMediaPreview.js';
import type { MediaThumbnailLoader } from '../src/renderer/features/sources/MediaThumbnail.js';
import { Modal } from '../src/renderer/ui/Modal.js';

const FIRST = '10000000-0000-4000-8000-000000000001';
const SECOND = '10000000-0000-4000-8000-000000000002';
const THIRD = '10000000-0000-4000-8000-000000000003';

it('marks a preloaded paused video when playback starts without another loadeddata event', async () => {
  mockPlayer();
  const origin = vi.fn();
  const mediaOpen = vi
    .fn<NonNullable<RuntimeBridge['sourcePreviews']['mediaOpen']>>()
    .mockResolvedValue(ready());
  const view = await mount(mediaOpen, false, origin);
  try {
    const video = view.host.querySelector('video')!;
    await act(async () => video.dispatchEvent(new Event('loadeddata')));
    await act(async () => view.host.querySelector('img')!.dispatchEvent(new Event('load')));
    await act(async () => view.button('Play preview').click());
    await act(async () => video.dispatchEvent(new Event('playing')));
    expect(origin).toHaveBeenLastCalledWith('B');
  } finally {
    await view.close();
  }
});

it('marks the received poster and video origin only after each new picture decodes', async () => {
  mockPlayer();
  const origin = vi.fn();
  const mediaOpen = vi
    .fn<NonNullable<RuntimeBridge['sourcePreviews']['mediaOpen']>>()
    .mockResolvedValueOnce({ ...ready(), engine: 'A', host: '192.0.2.32' })
    .mockResolvedValue(ready(SECOND));
  const view = await mount(mediaOpen, false, origin);
  try {
    const poster = view.host.querySelector('.cg-source-media-preview__picture img')!;
    expect(origin).toHaveBeenLastCalledWith(undefined);
    await act(async () => poster.dispatchEvent(new Event('load')));
    expect(origin).toHaveBeenLastCalledWith('A');
    await act(async () => vi.advanceTimersByTimeAsync(15_000));
    expect(origin).toHaveBeenLastCalledWith('A');
    await act(async () => poster.dispatchEvent(new Event('load')));
    expect(origin).toHaveBeenLastCalledWith('B');
    await act(async () => view.button('Play preview').click());
    expect(origin).toHaveBeenLastCalledWith(undefined);
    await act(async () => view.host.querySelector('video')!.dispatchEvent(new Event('loadeddata')));
    expect(origin).toHaveBeenLastCalledWith('B');
    expect(view.take).not.toHaveBeenCalled();
    expect(view.update).not.toHaveBeenCalled();
  } finally {
    await view.close();
  }
});

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

it('plays the verified local original and renews it while paused', async () => {
  mockPlayer();
  const direct: MediaPlaybackPreview = { ...ready(), playbackMode: 'local-original' };
  const mediaOpen = vi
    .fn<NonNullable<RuntimeBridge['sourcePreviews']['mediaOpen']>>()
    .mockResolvedValue(direct);
  const view = await mount(mediaOpen, true);
  try {
    const original = view.host.querySelector('video')!;
    expect(original.src).toBe(direct.videoUrl);
    await act(async () => original.dispatchEvent(new Event('playing')));
    await act(async () => vi.advanceTimersByTimeAsync(8_000));
    expect(mediaOpen).toHaveBeenCalledOnce();
    await act(async () => view.button('Pause preview').click());
    await act(async () => vi.advanceTimersByTimeAsync(7_000));
    expect(mediaOpen).toHaveBeenLastCalledWith({
      channel: 1,
      sourceId: 'md-film',
      previewId: FIRST,
      prepare: false,
      tryLocalOriginal: true,
    });
    expect(view.host.querySelector('video')).toBe(original);
    expect(view.mediaClose).not.toHaveBeenCalled();
  } finally {
    await view.close();
  }
});

it.each(['decode error', 'startup timeout'])(
  'falls back from a local original once after a %s without another Play',
  async (failure) => {
    mockPlayer();
    const direct: MediaPlaybackPreview = { ...ready(), playbackMode: 'local-original' };
    const proxy: MediaPlaybackPreview = {
      ...ready(),
      playbackMode: 'proxy',
      videoUrl: direct.videoUrl?.replace('/file?', '/proxy?'),
    };
    const mediaOpen = vi
      .fn<NonNullable<RuntimeBridge['sourcePreviews']['mediaOpen']>>()
      .mockResolvedValueOnce(direct)
      .mockResolvedValue(proxy);
    const view = await mount(mediaOpen, true);
    try {
      const original = view.host.querySelector('video')!;
      if (failure === 'decode error')
        await act(async () => original.dispatchEvent(new Event('error')));
      else await act(async () => vi.advanceTimersByTimeAsync(8_000));
      expect(mediaOpen).toHaveBeenCalledTimes(2);
      expect(mediaOpen).toHaveBeenLastCalledWith({
        channel: 1,
        sourceId: 'md-film',
        previewId: FIRST,
        prepare: true,
        tryLocalOriginal: false,
      });
      expect(view.host.querySelector('video')?.src).toBe(proxy.videoUrl);
      expect(view.button('Pause preview')).not.toBeNull();
      expect(view.mediaClose).not.toHaveBeenCalled();
    } finally {
      await view.close();
    }
  },
);

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
  onPreviewEngineChange?: (engine: 'A' | 'B' | undefined) => void,
  playRequest?: number,
  loadThumbnail?: MediaThumbnailLoader,
  readTopology?: () => Promise<PgmTopology>,
) {
  const previous = window.cg;
  const mediaClose = vi.fn(async () => ({ closed: true }));
  const thumbnails = vi.fn(async () => ({ frames: [] }));
  const take = vi.fn();
  const update = vi.fn();
  window.cg = {
    sourcePreviews: { mediaOpen, mediaClose, thumbnails },
    stack: { take, update },
    ...(readTopology !== undefined && {
      pgmReturn: { topology: readTopology },
      link: { status: () => 'live', onStatusChanged: () => () => undefined },
      auth: { state: () => ({ kind: 'off' }), onStateChanged: () => () => undefined },
    }),
  } as unknown as RuntimeBridge;
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const show = (covered = false, id = 'md-film', request = playRequest, load = loadThumbnail) =>
    act(async () =>
      root.render(
        createElement(
          Modal,
          { title: 'Parent', footer: null, onClose: () => undefined },
          createElement(SourceMediaPreview, {
            id,
            name: 'Film',
            durationMs: 10_000,
            channel: 1,
            inline,
            playRequest: request,
            ...(load === undefined
              ? { poster: 'data:image/jpeg;base64,original-poster' }
              : { loadThumbnail: load }),
            onPreviewEngineChange,
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

it('retains one explicit list Play request through a delayed proxy without another click', async () => {
  const player = mockPlayer();
  let resolveFirst!: (preview: MediaPlaybackPreview) => void;
  const mediaOpen = vi
    .fn<NonNullable<RuntimeBridge['sourcePreviews']['mediaOpen']>>()
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
    )
    .mockResolvedValue(ready());
  const view = await mount(mediaOpen, false, undefined, 1);
  try {
    expect(view.button('Pause preview')).not.toBeNull();
    await act(async () =>
      resolveFirst({
        ...ready(),
        state: 'preparing',
        videoUrl: undefined,
        message: 'The media proxy queue is busy. Waiting for capacity.',
      }),
    );
    expect(view.host.textContent).toContain('Waiting for capacity.');
    expect(player.play).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTimeAsync(1_000));
    expect(player.play).toHaveBeenCalledOnce();
    expect(view.host.querySelector('video')?.hidden).toBe(false);
    expect(view.take).not.toHaveBeenCalled();
    expect(view.update).not.toHaveBeenCalled();
  } finally {
    await view.close();
  }
});

it('reads a selected media preview without preparing it until Play', async () => {
  const player = mockPlayer();
  const mediaOpen = vi
    .fn<NonNullable<RuntimeBridge['sourcePreviews']['mediaOpen']>>()
    .mockResolvedValueOnce({ ...ready(), state: 'preparing', videoUrl: undefined })
    .mockResolvedValue(ready());
  const view = await mount(mediaOpen);
  try {
    expect(mediaOpen).toHaveBeenLastCalledWith({
      channel: 1,
      sourceId: 'md-film',
      prepare: false,
      tryLocalOriginal: true,
    });
    await act(async () => vi.advanceTimersByTimeAsync(5_000));
    expect(mediaOpen).toHaveBeenCalledOnce();
    expect(view.host.textContent).not.toContain('Preparing preview…');
    expect(player.play).not.toHaveBeenCalled();
    await act(async () => view.button('Play preview').click());
    expect(mediaOpen).toHaveBeenLastCalledWith({
      channel: 1,
      sourceId: 'md-film',
      previewId: FIRST,
      prepare: true,
      tryLocalOriginal: true,
    });
    expect(player.play).toHaveBeenCalledOnce();
  } finally {
    await view.close();
  }
});

it('keeps an explicit Play queued behind a failed passive preview read', async () => {
  const player = mockPlayer();
  let finishPassive!: (result: MediaPlaybackPreview) => void;
  const mediaOpen = vi
    .fn<NonNullable<RuntimeBridge['sourcePreviews']['mediaOpen']>>()
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishPassive = resolve;
        }),
    )
    .mockResolvedValue(ready());
  const view = await mount(mediaOpen);
  try {
    await act(async () => view.button('Play preview').click());
    expect(mediaOpen).toHaveBeenCalledOnce();
    await act(async () => finishPassive({ state: 'unavailable' }));
    expect(mediaOpen).toHaveBeenLastCalledWith({
      channel: 1,
      sourceId: 'md-film',
      prepare: true,
      tryLocalOriginal: true,
    });
    expect(player.play).toHaveBeenCalledOnce();
  } finally {
    await view.close();
  }
});

it('keeps a terminal proxy reason visible and only requests preparation again on Play', async () => {
  const player = mockPlayer();
  const reason = "This media exceeds Playout's preview proxy size limit.";
  const mediaOpen = vi
    .fn<NonNullable<RuntimeBridge['sourcePreviews']['mediaOpen']>>()
    .mockResolvedValueOnce({ ...ready(), state: 'error', videoUrl: undefined, message: reason })
    .mockResolvedValueOnce({ ...ready(), state: 'preparing', videoUrl: undefined })
    .mockResolvedValue(ready());
  const view = await mount(mediaOpen, false, undefined, 1);
  try {
    expect(view.host.textContent).toContain(reason);
    await act(async () => vi.advanceTimersByTimeAsync(15_000));
    expect(mediaOpen).toHaveBeenLastCalledWith({
      channel: 1,
      sourceId: 'md-film',
      previewId: FIRST,
      prepare: false,
      tryLocalOriginal: true,
    });
    expect(view.host.textContent).toContain(reason);
    expect(player.play).not.toHaveBeenCalled();
    await act(async () => view.button('Play preview').click());
    expect(mediaOpen.mock.lastCall?.[0].prepare).toBe(true);
    expect(view.host.textContent).not.toContain(reason);
    expect(player.play).toHaveBeenCalledOnce();
  } finally {
    await view.close();
  }
});

it('revalidates the held media on a verified role switch without waiting for its next renewal', async () => {
  const player = mockPlayer();
  let active: PgmTopology['active'] = 'A';
  const readTopology = vi.fn(
    async (): Promise<PgmTopology> => ({
      channel: 1,
      active,
      members: [
        { engine: 'A', name: 'A', physicalChannel: 1, resourceKey: 'primary' },
        { engine: 'B', name: 'B', physicalChannel: 2, resourceKey: 'backup' },
      ],
    }),
  );
  const mediaOpen = vi
    .fn<NonNullable<RuntimeBridge['sourcePreviews']['mediaOpen']>>()
    .mockResolvedValueOnce({ ...ready(), engine: 'A' })
    .mockResolvedValueOnce({ state: 'unavailable', recovery: 'target-changed' })
    .mockResolvedValue(ready(SECOND));
  const view = await mount(mediaOpen, false, undefined, 1, undefined, readTopology);
  try {
    const original = view.host.querySelector('video')!;
    await act(async () => {
      original.currentTime = 2;
      original.dispatchEvent(new Event('timeupdate'));
      view.button('Listen to preview').click();
    });
    active = null;
    await act(async () => vi.advanceTimersByTimeAsync(5_000));
    expect(mediaOpen).toHaveBeenCalledOnce();
    active = 'B';
    await act(async () => vi.advanceTimersByTimeAsync(5_000));
    expect(mediaOpen).toHaveBeenNthCalledWith(2, {
      channel: 1,
      sourceId: 'md-film',
      previewId: FIRST,
      prepare: true,
      tryLocalOriginal: true,
    });
    expect(view.mediaClose).toHaveBeenCalledWith({ previewId: FIRST });
    const resumed = view.host.querySelector('video')!;
    await act(async () => resumed.dispatchEvent(new Event('loadedmetadata')));
    expect(resumed.getAttribute('src')).toBe(ready(SECOND).videoUrl);
    expect(resumed.currentTime).toBe(2);
    expect(resumed.muted).toBe(false);
    expect(player.play).toHaveBeenCalled();
  } finally {
    await view.close();
  }
});

it('rechecks an existing preview when the first confirmed route is already on the other server', async () => {
  mockPlayer();
  let resolveTopology!: (topology: PgmTopology) => void;
  const readTopology = () =>
    new Promise<PgmTopology>((resolve) => {
      resolveTopology = resolve;
    });
  const mediaOpen = vi
    .fn<NonNullable<RuntimeBridge['sourcePreviews']['mediaOpen']>>()
    .mockResolvedValueOnce({ ...ready(), engine: 'A' })
    .mockResolvedValue(ready());
  const view = await mount(mediaOpen, false, undefined, 1, undefined, readTopology);
  try {
    expect(mediaOpen).toHaveBeenCalledOnce();
    await act(async () =>
      resolveTopology({
        channel: 1,
        active: 'B',
        members: [{ engine: 'B', name: 'B', physicalChannel: 2, resourceKey: 'backup' }],
      }),
    );
    expect(mediaOpen).toHaveBeenCalledTimes(2);
    expect(mediaOpen.mock.lastCall?.[0].previewId).toBe(FIRST);
  } finally {
    await view.close();
  }
});

it('an explicit row Play request resumes the same paused player without losing seek or listening', async () => {
  const player = mockPlayer();
  const mediaOpen = vi
    .fn<NonNullable<RuntimeBridge['sourcePreviews']['mediaOpen']>>()
    .mockResolvedValue(ready());
  const view = await mount(mediaOpen, false, undefined, 1);
  try {
    const video = view.host.querySelector('video')!;
    await act(async () => {
      video.currentTime = 2.5;
      video.dispatchEvent(new Event('timeupdate'));
    });
    await act(async () => view.button('Listen to preview').click());
    await act(async () => view.button('Pause preview').click());
    player.play.mockClear();
    await view.show(false, 'md-film', 2);
    expect(player.play).toHaveBeenCalledOnce();
    expect(view.host.querySelector('video')).toBe(video);
    expect(video.currentTime).toBe(2.5);
    expect(video.muted).toBe(false);
    expect(mediaOpen).toHaveBeenCalledOnce();
  } finally {
    await view.close();
  }
});

it.each(['Pause preview', 'Stop preview'] as const)(
  '%s cancels a pending explicit Play request',
  async (control) => {
    const player = mockPlayer();
    let resolveFirst!: (preview: MediaPlaybackPreview) => void;
    const mediaOpen = vi
      .fn<NonNullable<RuntimeBridge['sourcePreviews']['mediaOpen']>>()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          }),
      );
    const view = await mount(mediaOpen, false, undefined, 1);
    try {
      await act(async () => view.button(control).click());
      await act(async () => resolveFirst(ready()));
      expect(player.play).not.toHaveBeenCalled();
      expect(view.button('Play preview')).not.toBeNull();
      if (control === 'Stop preview')
        expect(view.mediaClose).toHaveBeenCalledWith({ previewId: FIRST });
      expect(view.take).not.toHaveBeenCalled();
      expect(view.update).not.toHaveBeenCalled();
    } finally {
      await view.close();
    }
  },
);

it('carries the explicit Play request into the sampled fallback when native preview is unsupported', async () => {
  mockPlayer();
  const mediaOpen = vi
    .fn<NonNullable<RuntimeBridge['sourcePreviews']['mediaOpen']>>()
    .mockResolvedValue({ state: 'unsupported' });
  const view = await mount(mediaOpen, false, undefined, 1);
  try {
    expect(view.host.querySelector('[data-media-file-preview]')).toBeNull();
    expect(view.button('Pause preview')).not.toBeNull();
    await act(async () => view.button('Pause preview').click());
    await view.show(false, 'md-film', 2);
    expect(view.button('Pause preview')).not.toBeNull();
    expect(mediaOpen).toHaveBeenCalledOnce();
  } finally {
    await view.close();
  }
});

it('carries the player Play click into a sampled fallback discovered after the click', async () => {
  mockPlayer();
  let finishLookup!: (result: MediaPlaybackPreview) => void;
  const mediaOpen = vi
    .fn<NonNullable<RuntimeBridge['sourcePreviews']['mediaOpen']>>()
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishLookup = resolve;
        }),
    );
  const view = await mount(mediaOpen);
  try {
    await act(async () => view.button('Play preview').click());
    await act(async () => finishLookup({ state: 'unsupported' }));
    expect(view.host.textContent).toContain('Silent preview · sampled frames');
    expect(view.button('Pause preview')).not.toBeNull();
    expect(mediaOpen).toHaveBeenCalledOnce();
  } finally {
    await view.close();
  }
});

it.each(['cover', 'source', 'unmount'] as const)(
  'closes the late initial Play lease after %s without restarting the cancelled player',
  async (cancel) => {
    const player = mockPlayer();
    let resolveFirst!: (preview: MediaPlaybackPreview) => void;
    const mediaOpen = vi
      .fn<NonNullable<RuntimeBridge['sourcePreviews']['mediaOpen']>>()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValue(ready(SECOND));
    const view = await mount(mediaOpen, false, undefined, 1);
    let closed = false;
    try {
      if (cancel === 'unmount') {
        await view.close();
        closed = true;
      } else await view.show(cancel === 'cover', cancel === 'source' ? 'md-other' : 'md-film');
      const plays = player.play.mock.calls.length;
      await act(async () => resolveFirst(ready()));
      expect(view.mediaClose).toHaveBeenCalledWith({ previewId: FIRST });
      expect(player.play).toHaveBeenCalledTimes(plays);
      expect(view.host.querySelector('video')?.getAttribute('src')).not.toBe(ready().videoUrl);
      if (cancel === 'source')
        expect(view.host.querySelector('video')?.getAttribute('src')).toBe(ready(SECOND).videoUrl);
    } finally {
      if (!closed) await view.close();
    }
  },
);

function targetChanged(): MediaPlaybackPreview & { recovery: 'target-changed' } {
  return { state: 'unavailable', recovery: 'target-changed' };
}

it.each(['A', 'B'] as const)(
  'recovers a verified %s handoff through proxy preparation without losing playback, position or audio intent',
  async (from) => {
    const player = mockPlayer();
    const to = from === 'A' ? 'B' : 'A';
    const mediaOpen = vi
      .fn<NonNullable<RuntimeBridge['sourcePreviews']['mediaOpen']>>()
      .mockResolvedValueOnce({ ...ready(), engine: from })
      .mockResolvedValueOnce(targetChanged())
      .mockResolvedValueOnce({
        ...ready(SECOND),
        state: 'preparing',
        videoUrl: undefined,
        engine: to,
      })
      .mockResolvedValue({ ...ready(SECOND), engine: to });
    const view = await mount(mediaOpen, true);
    try {
      await act(async () => view.button('Listen to preview').click());
      const old = view.host.querySelector('video')!;
      await act(async () => {
        old.currentTime = 4.25;
        old.dispatchEvent(new Event('error'));
      });
      expect(mediaOpen).toHaveBeenCalledTimes(3);
      expect(mediaOpen.mock.calls[1]?.[0].previewId).toBe(FIRST);
      expect(mediaOpen.mock.calls[2]?.[0].previewId).toBeUndefined();
      expect(view.button('Pause preview')).not.toBeNull();
      expect(view.host.textContent).toContain('Preparing preview');
      const plays = player.play.mock.calls.length;
      await act(async () => vi.advanceTimersByTimeAsync(1_000));
      const resumed = view.host.querySelector('video')!;
      await act(async () => resumed.dispatchEvent(new Event('loadedmetadata')));
      expect(resumed.getAttribute('src')).toBe(ready(SECOND).videoUrl);
      expect(resumed.currentTime).toBe(4.25);
      expect(resumed.muted).toBe(false);
      expect(player.play.mock.calls.length).toBeGreaterThan(plays);
      expect(view.button('Pause preview')).not.toBeNull();
      expect(view.host.textContent).not.toContain('cannot play');
      expect(view.take).not.toHaveBeenCalled();
      expect(view.update).not.toHaveBeenCalled();
    } finally {
      await view.close();
    }
  },
);

it('keeps a manually paused preview paused when renewal discovers an authorized target handoff', async () => {
  const player = mockPlayer();
  const mediaOpen = vi
    .fn<NonNullable<RuntimeBridge['sourcePreviews']['mediaOpen']>>()
    .mockResolvedValueOnce({ ...ready(), engine: 'A' })
    .mockResolvedValueOnce(targetChanged())
    .mockResolvedValue({ ...ready(SECOND), engine: 'B' });
  const view = await mount(mediaOpen);
  try {
    view.host.querySelector('video')!.currentTime = 2.25;
    await act(async () => vi.advanceTimersByTimeAsync(15_000));
    const video = view.host.querySelector('video')!;
    await act(async () => video.dispatchEvent(new Event('loadedmetadata')));
    expect(mediaOpen).toHaveBeenCalledTimes(3);
    expect(video.getAttribute('src')).toBe(ready(SECOND).videoUrl);
    expect(video.currentTime).toBe(2.25);
    expect(player.play).not.toHaveBeenCalled();
    expect(view.button('Play preview')).not.toBeNull();
  } finally {
    await view.close();
  }
});

it.each(['stop', 'cover', 'select'] as const)(
  'closes a delayed fresh handoff lease after %s without adopting or playing it',
  async (cancel) => {
    const player = mockPlayer();
    let resolveFresh!: (value: MediaPlaybackPreview) => void;
    const mediaOpen = vi
      .fn<NonNullable<RuntimeBridge['sourcePreviews']['mediaOpen']>>()
      .mockResolvedValueOnce({ ...ready(), engine: 'A' })
      .mockResolvedValueOnce(targetChanged())
      .mockImplementationOnce(() => new Promise((resolve) => (resolveFresh = resolve)))
      .mockResolvedValue(ready(THIRD));
    const view = await mount(mediaOpen, true);
    try {
      await act(async () => view.host.querySelector('video')!.dispatchEvent(new Event('error')));
      expect(mediaOpen).toHaveBeenCalledTimes(3);
      if (cancel === 'stop') await act(async () => view.button('Stop preview').click());
      else await view.show(cancel === 'cover', cancel === 'select' ? 'md-other' : 'md-film');
      const plays = player.play.mock.calls.length;
      await act(async () => resolveFresh({ ...ready(SECOND), engine: 'B' }));
      expect(view.mediaClose).toHaveBeenCalledWith({ previewId: SECOND });
      expect(view.host.querySelector('video')?.getAttribute('src')).not.toBe(
        ready(SECOND).videoUrl,
      );
      expect(player.play).toHaveBeenCalledTimes(plays);
    } finally {
      await view.close();
    }
  },
);

it('does not retry a terminal unavailable reply after probing a failed stream', async () => {
  mockPlayer();
  const mediaOpen = vi
    .fn<NonNullable<RuntimeBridge['sourcePreviews']['mediaOpen']>>()
    .mockResolvedValueOnce(ready())
    .mockResolvedValue({ state: 'unavailable', message: 'No longer authorized.' });
  const view = await mount(mediaOpen, true);
  try {
    await act(async () => view.host.querySelector('video')!.dispatchEvent(new Event('error')));
    await act(async () => vi.advanceTimersByTimeAsync(60_000));
    expect(mediaOpen).toHaveBeenCalledTimes(2);
    expect(view.button('Play preview')).not.toBeNull();
    expect(view.mediaClose).toHaveBeenCalledWith({ previewId: FIRST });
  } finally {
    await view.close();
  }
});

it('keeps an unchanged-target codec decode failure terminal after its diagnostic probe', async () => {
  mockPlayer();
  const mediaOpen = vi
    .fn<NonNullable<RuntimeBridge['sourcePreviews']['mediaOpen']>>()
    .mockResolvedValue(ready());
  const view = await mount(mediaOpen, true);
  try {
    const video = view.host.querySelector('video')!;
    Object.defineProperty(video, 'error', { configurable: true, value: { code: 3 } });
    await act(async () => video.dispatchEvent(new Event('error')));
    await act(async () => vi.advanceTimersByTimeAsync(60_000));
    expect(mediaOpen).toHaveBeenCalledTimes(2);
    expect(mediaOpen.mock.calls[1]?.[0].previewId).toBe(FIRST);
    expect(view.button('Play preview')).not.toBeNull();
    expect(view.host.textContent).toContain('Preview cannot play in this browser.');
  } finally {
    await view.close();
  }
});

it('ignores a delayed handoff hint after Stop rather than starting another lease', async () => {
  mockPlayer();
  let resolveProbe!: (value: MediaPlaybackPreview) => void;
  const mediaOpen = vi
    .fn<NonNullable<RuntimeBridge['sourcePreviews']['mediaOpen']>>()
    .mockResolvedValueOnce(ready())
    .mockImplementationOnce(() => new Promise((resolve) => (resolveProbe = resolve)));
  const view = await mount(mediaOpen, true);
  try {
    await act(async () => view.host.querySelector('video')!.dispatchEvent(new Event('error')));
    await act(async () => view.button('Stop preview').click());
    await act(async () => resolveProbe(targetChanged()));
    await act(async () => vi.advanceTimersByTimeAsync(60_000));
    expect(mediaOpen).toHaveBeenCalledTimes(2);
    expect(view.button('Play preview')).not.toBeNull();
    expect(view.host.querySelector('video')!.currentTime).toBe(0);
  } finally {
    await view.close();
  }
});

it('recovers an aborted pending Play only after verifying the held lease changed target', async () => {
  const player = mockPlayer();
  player.play.mockRejectedValueOnce(new DOMException('Old source aborted.', 'AbortError'));
  const mediaOpen = vi
    .fn<NonNullable<RuntimeBridge['sourcePreviews']['mediaOpen']>>()
    .mockResolvedValueOnce({ ...ready(), engine: 'A' })
    .mockResolvedValueOnce(targetChanged())
    .mockResolvedValue({ ...ready(SECOND), engine: 'B' });
  const view = await mount(mediaOpen, true);
  try {
    expect(mediaOpen).toHaveBeenCalledTimes(3);
    expect(mediaOpen.mock.calls[1]?.[0].previewId).toBe(FIRST);
    expect(mediaOpen.mock.calls[2]?.[0].previewId).toBeUndefined();
    expect(view.host.querySelector('video')?.getAttribute('src')).toBe(ready(SECOND).videoUrl);
    expect(view.button('Pause preview')).not.toBeNull();
    expect(view.host.textContent).not.toContain('could not play');
  } finally {
    await view.close();
  }
});

it('keeps an autoplay-policy refusal terminal without reacquiring a lease', async () => {
  const player = mockPlayer();
  player.play.mockRejectedValueOnce(new DOMException('A gesture is required.', 'NotAllowedError'));
  const mediaOpen = vi
    .fn<NonNullable<RuntimeBridge['sourcePreviews']['mediaOpen']>>()
    .mockResolvedValue(ready());
  const view = await mount(mediaOpen, true);
  try {
    expect(mediaOpen).toHaveBeenCalledTimes(1);
    expect(view.button('Play preview')).not.toBeNull();
    expect(view.host.textContent).toContain('Preview could not play. Try again.');
  } finally {
    await view.close();
  }
});

it('discards the old handoff reply if Stop is followed by a new explicit Play', async () => {
  mockPlayer();
  let resolveFresh!: (value: MediaPlaybackPreview) => void;
  const mediaOpen = vi
    .fn<NonNullable<RuntimeBridge['sourcePreviews']['mediaOpen']>>()
    .mockResolvedValueOnce(ready())
    .mockResolvedValueOnce(targetChanged())
    .mockImplementationOnce(() => new Promise((resolve) => (resolveFresh = resolve)))
    .mockResolvedValue(ready(THIRD));
  const view = await mount(mediaOpen, true);
  try {
    await act(async () => view.host.querySelector('video')!.dispatchEvent(new Event('error')));
    await act(async () => view.button('Stop preview').click());
    await act(async () => view.button('Play preview').click());
    await act(async () => resolveFresh(ready(SECOND)));
    expect(view.mediaClose).toHaveBeenCalledWith({ previewId: SECOND });
    expect(mediaOpen).toHaveBeenCalledTimes(4);
    expect(view.host.querySelector('video')?.getAttribute('src')).toBe(ready(THIRD).videoUrl);
    expect(view.button('Pause preview')).not.toBeNull();
  } finally {
    await view.close();
  }
});

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
    await act(async () => poster?.dispatchEvent(new Event('load')));
    expect(view.host.textContent).toContain('Server B');
    expect(mediaOpen).toHaveBeenCalledWith({
      channel: 1,
      sourceId: 'md-film',
      prepare: false,
      tryLocalOriginal: true,
    });
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
    expect(mediaOpen.mock.calls[1]?.[0]).toEqual({
      channel: 1,
      sourceId: 'md-film',
      prepare: true,
      tryLocalOriginal: true,
    });
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
      tryLocalOriginal: true,
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
      tryLocalOriginal: true,
    });
    await act(async () => vi.advanceTimersByTimeAsync(1_000));
    expect(view.host.querySelector('video')?.hidden).toBe(false);
    expect(mediaOpen).toHaveBeenLastCalledWith({
      channel: 1,
      sourceId: 'md-film',
      previewId: FIRST,
      prepare: true,
      tryLocalOriginal: true,
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

it('replaces a sampled player poster when the source route gives it a new loader', async () => {
  mockPlayer();
  const origin = vi.fn();
  const mediaOpen = vi
    .fn<NonNullable<RuntimeBridge['sourcePreviews']['mediaOpen']>>()
    .mockResolvedValue({ state: 'unsupported' });
  const aPoster = 'data:image/jpeg;base64,cG9zdGVyQQ==';
  const bPoster = 'data:image/jpeg;base64,cG9zdGVyQg==';
  const loadA = Object.assign(
    vi.fn(async () => aPoster),
    { origin: () => 'A' as const },
  );
  const loadB = Object.assign(
    vi.fn(async () => bPoster),
    { origin: () => 'B' as const },
  );
  const view = await mount(mediaOpen, false, origin, undefined, loadA);
  const image = () => view.host.querySelector('img');
  try {
    expect(image()?.getAttribute('src')).toBe(aPoster);
    await act(async () => image()?.dispatchEvent(new Event('load')));
    expect(origin).toHaveBeenLastCalledWith('A');
    await view.show(false, 'md-film', undefined, loadB);
    expect(loadB).toHaveBeenCalledOnce();
    expect(loadB).toHaveBeenCalledWith('md-film');
    expect(image()?.getAttribute('src')).toBe(bPoster);
    await act(async () => image()?.dispatchEvent(new Event('load')));
    expect(origin).toHaveBeenLastCalledWith('B');
    expect(mediaOpen).toHaveBeenCalledOnce();
  } finally {
    await view.close();
  }
});

it('updates the sampled origin for an identical decoded frame from another server', async () => {
  mockPlayer();
  const mediaOpen = vi
    .fn<NonNullable<RuntimeBridge['sourcePreviews']['mediaOpen']>>()
    .mockResolvedValue({ state: 'unsupported' });
  const origin = vi.fn();
  const view = await mount(mediaOpen, false, origin);
  let engine: 'A' | 'B' = 'A';
  window.cg.sourcePreviews.thumbnails = async ({ mediaPosition }) =>
    mediaPosition === undefined
      ? { frames: [] }
      : {
          frames: [],
          mediaFrame: {
            sourceId: 'md-film',
            signal: 'present',
            jpegBase64: 'same-frame',
            engine,
            previewPositionMs: mediaPosition.atMs,
          },
        };
  try {
    await act(async () => view.button('Play preview').click());
    await act(async () => vi.advanceTimersByTimeAsync(0));
    const image = view.host.querySelector('img')!;
    await act(async () => image.dispatchEvent(new Event('load')));
    expect(origin).toHaveBeenLastCalledWith('A');
    Object.defineProperties(image, {
      complete: { configurable: true, value: true },
      naturalWidth: { configurable: true, value: 64 },
    });
    engine = 'B';
    await act(async () => vi.advanceTimersByTimeAsync(1_000));
    expect(origin).toHaveBeenLastCalledWith('B');
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
    expect(mediaOpen).toHaveBeenCalledTimes(2);
    expect(mediaOpen.mock.calls[1]?.[0].previewId).toBe(FIRST);
    await act(async () => view.button('Play preview').click());
    expect(mediaOpen).toHaveBeenCalledTimes(3);
    expect(mediaOpen.mock.calls[2]?.[0].previewId).toBeUndefined();
    expect(view.host.querySelector('video')?.getAttribute('src')).toBe(ready(SECOND).videoUrl);
  } finally {
    await view.close();
  }
});
