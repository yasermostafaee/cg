// @vitest-environment jsdom
import { act, createElement, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import type { ConsoleSourceCatalog } from '@cg/shared-ipc';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PvwMediaPosters } from '../src/renderer/features/monitors/pvwMediaPosters.js';
import { usePvwSourceFrames } from '../src/renderer/features/monitors/usePvwSourceFrames.js';
import { searchPlayoutMedia } from '../src/renderer/features/sources/sourceStore.js';
import type { RuntimeBridge } from '../src/shared/runtime-bridge.js';

const media = 'md-file';
// JPEG SOF header: these tests exercise byte dimensions and scheduling, not browser decoding.
const jpegBase64 = btoa(
  String.fromCharCode(...[255, 216, 255, 192, 0, 11, 8, 0, 36, 0, 64, 1, 1, 0, 0]),
);
const dataUrl = `data:image/jpeg;base64,${jpegBase64}`;
const picture = {
  sourceId: media,
  signal: 'present' as const,
  jpegBase64: 'moving',
  width: 640,
  height: 360,
};
const previous = window.cg;

function catalog(fingerprint = 'verified-file'): ConsoleSourceCatalog {
  return {
    sources: [
      {
        id: media,
        name: 'File',
        origin: 'media',
        producer: { kind: 'media', file: 'file' },
        media: { fingerprint },
      },
    ],
  };
}

function fixture() {
  let config = catalog();
  let state: { kind: 'off' } | { kind: 'signed-out' } = { kind: 'off' };
  let address = 'ws://station-a:5280';
  const configListeners = new Set<(next: ConsoleSourceCatalog) => void>();
  const authListeners = new Set<() => void>();
  const linkListeners = new Set<() => void>();
  const mediaThumbnail = vi
    .fn<RuntimeBridge['sources']['mediaThumbnail']>()
    .mockResolvedValue({ ok: true, dataUrl, engine: 'B' });
  const pvw = vi.fn<RuntimeBridge['sourcePreviews']['pvw']>().mockResolvedValue({ frames: [] });
  const thumbnails = vi
    .fn<RuntimeBridge['sourcePreviews']['thumbnails']>()
    .mockResolvedValue({ frames: [] });
  const api = {
    sourcePreviews: { pvw, thumbnails },
    sources: {
      config: vi.fn(async () => config),
      mediaThumbnail,
      mediaSearch: vi.fn<RuntimeBridge['sources']['mediaSearch']>(),
      onConfigChanged: (listener: (next: ConsoleSourceCatalog) => void) => {
        configListeners.add(listener);
        return () => configListeners.delete(listener);
      },
    },
    auth: {
      state: () => state,
      onStateChanged: (listener: () => void) => {
        authListeners.add(listener);
        return () => authListeners.delete(listener);
      },
    },
    link: {
      status: () => 'live',
      bridgeAddress: () => address,
      onStatusChanged: (listener: () => void) => {
        linkListeners.add(listener);
        return () => linkListeners.delete(listener);
      },
    },
  } as unknown as RuntimeBridge;
  window.cg = api;
  return {
    api,
    pvw,
    thumbnails,
    mediaThumbnail,
    changeFile: (fingerprint: string) => {
      config = catalog(fingerprint);
      for (const listener of configListeners) listener(config);
    },
    signOut: () => {
      state = { kind: 'signed-out' };
      for (const listener of authListeners) listener();
    },
    changeBridge: () => {
      address = 'ws://station-b:5280';
      for (const listener of linkListeners) listener();
    },
    listeners: () => configListeners.size + authListeners.size + linkListeners.size,
  };
}

const flush = async (): Promise<void> => {
  for (let n = 0; n < 8; n++) await Promise.resolve();
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});
afterEach(() => {
  window.cg = previous;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it.each(['empty', 'absent'] as const)(
  'the Live Layout editor uses one independently verified B file poster after %s reads',
  async (state) => {
    const f = fixture();
    if (state === 'absent') {
      f.pvw.mockResolvedValue({ frames: [{ sourceId: media, signal: 'absent' }] });
      f.thumbnails.mockResolvedValue({ frames: [{ sourceId: media, signal: 'absent' }] });
    }
    let shown: ReturnType<typeof usePvwSourceFrames> = new Map();
    function Consumer(): null {
      const frames = usePvwSourceFrames(1, [media, 'in-camera'], true, 'editor');
      useEffect(() => {
        shown = frames;
      }, [frames]);
      return null;
    }
    const root = createRoot(document.createElement('div'));
    const advance = (ms: number) => act(async () => await vi.advanceTimersByTimeAsync(ms));
    try {
      act(() => root.render(createElement(Consumer)));
      // The shared input budget may retain the previous consumer's one-second deadline.
      await advance(1_100);
      expect(f.thumbnails).toHaveBeenCalled();
      expect(f.mediaThumbnail.mock.calls).toEqual([[{ id: media, channel: 1 }]]);
      expect(shown.get(media)).toEqual({
        sourceId: media,
        signal: 'unknown',
        jpegBase64,
        width: 64,
        height: 36,
        engine: 'B',
        snapshotOnly: true,
      });
      expect(shown.has('in-camera')).toBe(false);
      expect(f.mediaThumbnail.mock.calls).toEqual([[{ id: media, channel: 1 }]]);
      await advance(60_000);
      expect(shown.get(media)?.jpegBase64).toBe(jpegBase64);
      expect(f.mediaThumbnail).toHaveBeenCalledTimes(1);
      f.pvw.mockResolvedValue({ frames: [picture] });
      await advance(500);
      for (const [request] of f.pvw.mock.calls) expect(request.sourceIds).not.toContain(media);
      expect(shown.get(media)?.jpegBase64).toBe(jpegBase64);
      expect(f.mediaThumbnail).toHaveBeenCalledTimes(1);
    } finally {
      act(() => root.unmount());
      await advance(500);
      expect(f.listeners()).toBe(0);
    }
  },
);

it('does not request another file poster while a snapshot already supplies a picture', async () => {
  const f = fixture();
  f.thumbnails.mockResolvedValue({ frames: [picture] });
  function Consumer(): null {
    usePvwSourceFrames(1, [media], true, 'stage');
    return null;
  }
  const root = createRoot(document.createElement('div'));
  try {
    act(() => root.render(createElement(Consumer)));
    await act(async () => await vi.advanceTimersByTimeAsync(10_000));
    expect(f.mediaThumbnail).not.toHaveBeenCalled();
  } finally {
    act(() => root.unmount());
    await act(async () => await vi.advanceTimersByTimeAsync(500));
  }
});

it('keeps a verified still in PVW without opening a live lease for its assigned clip', async () => {
  const f = fixture();
  // An unsolicited moving observation must not replace the clip's still.
  f.pvw.mockResolvedValue({ frames: [picture] });
  let shown: ReturnType<typeof usePvwSourceFrames> = new Map();
  function Consumer(): null {
    const frames = usePvwSourceFrames(1, [media, 'in-camera']);
    useEffect(() => {
      shown = frames;
    }, [frames]);
    return null;
  }
  const root = createRoot(document.createElement('div'));
  const advance = (ms: number) => act(async () => await vi.advanceTimersByTimeAsync(ms));
  try {
    act(() => root.render(createElement(Consumer)));
    await advance(2_000);
    expect(f.pvw).toHaveBeenCalled();
    for (const [request] of f.pvw.mock.calls) expect(request.sourceIds).toEqual(['in-camera']);
    expect(f.mediaThumbnail.mock.calls).toEqual([[{ id: media, channel: 1 }]]);
    expect(shown.get(media)).toEqual({
      ...picture,
      signal: 'unknown',
      jpegBase64,
      width: 64,
      height: 36,
      engine: 'B',
      snapshotOnly: true,
    });
  } finally {
    act(() => root.unmount());
    await advance(500);
  }
});

it.each(['removed', 'channel', 'signed-out', 'bridge', 'fingerprint'] as const)(
  'discards an awaited file poster after %s changes',
  async (change) => {
    const f = fixture();
    let release: ((value: { ok: boolean; dataUrl: string; engine: 'B' }) => void) | undefined;
    f.mediaThumbnail.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const changed = vi.fn();
    const posters = new PvwMediaPosters(f.api, changed);
    posters.setDemand(1, [media]);
    posters.request(media);
    await flush();
    expect(f.mediaThumbnail).toHaveBeenCalledTimes(1);
    if (change === 'removed') posters.setDemand(1, []);
    if (change === 'channel') posters.setDemand(2, [media]);
    if (change === 'signed-out') f.signOut();
    if (change === 'bridge') f.changeBridge();
    if (change === 'fingerprint') f.changeFile('different-file');
    changed.mockClear();
    release?.({ ok: true, dataUrl, engine: 'B' });
    await flush();
    expect(posters.frames()).toEqual([]);
    expect(changed).not.toHaveBeenCalled();
    posters.setDemand(undefined, []);
    expect(f.listeners()).toBe(0);
  },
);

it('revalidates the content identity after the official poster read even without a config event', async () => {
  const f = fixture();
  vi.mocked(f.api.sources.config)
    .mockResolvedValueOnce(catalog())
    .mockResolvedValueOnce(catalog('replacement'));
  const posters = new PvwMediaPosters(f.api, vi.fn());
  posters.setDemand(1, [media]);
  posters.request(media);
  await flush();
  expect(posters.frames()).toEqual([]);
  expect(f.api.sources.config).toHaveBeenCalledTimes(2);
  posters.setDemand(undefined, []);
});

it('reads the official poster for an unsaved editor selection observed in the picker', async () => {
  const f = fixture();
  const draft = 'md-editor-draft';
  vi.mocked(f.api.sources.mediaSearch).mockResolvedValue({
    ok: true,
    items: [{ id: draft, name: 'Draft clip', durationMs: 12_000 }],
    total: 1,
    nextCursor: null,
  });
  await searchPlayoutMedia({ q: 'Draft clip' });

  const posters = new PvwMediaPosters(f.api, vi.fn());
  try {
    posters.setDemand(1, [draft]);
    posters.request(draft);
    await flush();
    expect(f.mediaThumbnail).not.toHaveBeenCalled();

    posters.setDemand(1, [draft], [draft]);
    posters.request(draft);
    await flush();
    expect(f.mediaThumbnail.mock.calls).toEqual([[{ id: draft, channel: 1 }]]);
    expect(posters.frames()).toEqual([
      {
        sourceId: draft,
        signal: 'unknown',
        jpegBase64,
        width: 64,
        height: 36,
        engine: 'B',
        snapshotOnly: true,
      },
    ]);

    posters.setDemand(1, [draft]);
    expect(posters.frames()).toEqual([]);
  } finally {
    posters.setDemand(undefined, []);
  }
});

it.each(['failed', 'malformed', 'unknown-fingerprint'] as const)(
  'does not turn a %s poster into repeated polling or crop authority',
  async (state) => {
    const f = fixture();
    if (state === 'failed') f.mediaThumbnail.mockResolvedValue({ ok: false });
    if (state === 'malformed')
      f.mediaThumbnail.mockResolvedValue({
        ok: true,
        dataUrl: 'data:image/jpeg;base64,bm90YW5pbWFnZQ==',
      });
    if (state === 'unknown-fingerprint') f.changeFile('');
    const posters = new PvwMediaPosters(f.api, vi.fn());
    posters.setDemand(1, [media, 'in-camera']);
    for (let n = 0; n < 5; n++) {
      posters.request(media);
      posters.request('in-camera');
      await flush();
    }
    expect(posters.frames()).toEqual([]);
    expect(f.mediaThumbnail).toHaveBeenCalledTimes(state === 'unknown-fingerprint' ? 0 : 1);
    posters.setDemand(undefined, []);
  },
);
