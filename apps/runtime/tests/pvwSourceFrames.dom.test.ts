// @vitest-environment jsdom
import { act, createElement, Fragment, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import type { PlatePlacement } from '../src/renderer/features/monitors/livePlateGeometry.js';
import {
  followPvwPresetPictures,
  paintPvwPlatePictures,
} from '../src/renderer/features/monitors/pvwPlatePictures.js';
import {
  usePvwSourceFrames,
  type PvwSourceFrame,
} from '../src/renderer/features/monitors/usePvwSourceFrames.js';
import { subscribeInputThumbnail } from '../src/renderer/features/sources/inputThumbnailDemand.js';
import type { RuntimeBridge } from '../src/shared/runtime-bridge.js';

type Frames = ReturnType<typeof usePvwSourceFrames>;

function Consumer({
  ids,
  mode,
  publish,
}: {
  ids: string[];
  mode: 'stage' | 'editor';
  publish(frames: Frames): void;
}): null {
  const frames = usePvwSourceFrames(1, ids, true, mode);
  useEffect(() => {
    publish(frames);
  }, [publish, frames]);
  return null;
}

function sample(sourceId: string): PvwSourceFrame {
  return { sourceId, signal: 'present', jpegBase64: 'sample', width: 64, height: 36 };
}

it.each([false, true])(
  'refits a preview picture in the same paint as its moving frame (mask: %s)',
  async (masked) => {
    const doc = document.implementation.createHTMLDocument();
    const artwork = doc.createElement('div');
    artwork.dataset['cgFrameArtwork'] = 'camera-artwork';
    const node = doc.createElement('div');
    node.dataset['cgLiveSource'] = 'camera';
    artwork.append(node);
    doc.body.append(artwork);
    const original: PlatePlacement = {
      plateId: 'camera',
      elementId: 'plate',
      sourceId: 'input',
      sourceName: 'Studio',
      x: 0,
      y: 0,
      width: 90,
      height: 120,
      cropEdges: true,
      ...(masked && {
        mask: { mode: 'inside', rects: [{ x: 0.25, y: 0.2, width: 0.5, height: 0.6 }] },
      }),
    };
    const destination: PlatePlacement = {
      ...original,
      x: 10,
      y: 20,
      width: 192,
      height: 108,
    };
    delete destination.cropEdges;
    const bounds = vi
      .spyOn(node, 'getBoundingClientRect')
      .mockReturnValue(new DOMRect(0, 0, 90, 120));
    const frames = new Map([['input', sample('input')]]);
    const request = vi.spyOn(window, 'requestAnimationFrame');
    let stop: (() => void) | undefined;
    try {
      paintPvwPlatePictures(doc, [original], frames);
      const image = node.querySelector('img');
      const clip = image?.parentElement;
      if (image == null || clip == null) throw new Error('Preview picture was not mounted');
      const before = image.style.width;
      stop = followPvwPresetPictures(doc, [original], [destination], frames, new Set(['camera']));
      expect(stop).toBeDefined();
      bounds.mockReturnValue(new DOMRect(5, 10, 141, 114));
      artwork.style.transform = 'matrix(1.567,0,0,0.95,5,10)';
      await Promise.resolve();
      expect(request).not.toHaveBeenCalled();
      const width =
        (141 * Number.parseFloat(clip.style.width) * Number.parseFloat(image.style.width)) / 10_000;
      const height =
        (114 * Number.parseFloat(clip.style.height) * Number.parseFloat(image.style.height)) /
        10_000;
      expect(width / height).toBeCloseTo(16 / 9);
      expect(width).toBeCloseTo(202.67);
      if (masked) {
        expect(Number.parseFloat(clip.style.width)).toBeCloseTo(50);
        expect(Number.parseFloat(clip.style.height)).toBeCloseTo(60);
      }
      expect(image.style.width).not.toBe(before);
      stop?.();
      stop = undefined;
      expect(image.style.width).toBe(before);
    } finally {
      stop?.();
      request.mockRestore();
    }
  },
);

it('shares one station lease and retains common pictures while preview demand and sample batches change', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const previous = window.cg;
  const pvw = vi.fn<RuntimeBridge['sourcePreviews']['pvw']>();
  pvw.mockImplementation(async ({ sourceIds }) => ({ frames: sourceIds.map(sample) }));
  window.cg = { sourcePreviews: { pvw } } as unknown as RuntimeBridge;
  const root = createRoot(document.createElement('div'));
  let stage: Frames | undefined;
  let editor: Frames | undefined;
  const show = (stageIds: string[], editorIds?: string[]): void => {
    act(() =>
      root.render(
        createElement(
          Fragment,
          null,
          createElement(Consumer, {
            key: 'stage',
            ids: stageIds,
            mode: 'stage',
            publish: (frames) => (stage = frames),
          }),
          editorIds === undefined
            ? null
            : createElement(Consumer, {
                key: 'editor',
                ids: editorIds,
                mode: 'editor',
                publish: (frames) => (editor = frames),
              }),
        ),
      ),
    );
  };
  const advance = (ms: number) => act(async () => await vi.advanceTimersByTimeAsync(ms));

  try {
    show(['a', 'b']);
    await advance(0);
    const viewId = pvw.mock.calls[0]?.[0].viewId;
    expect(viewId).toEqual(expect.any(String));
    expect(stage?.get('a')).toEqual(sample('a'));

    show(['a', 'b'], ['b', 'c', 'd', 'e']);
    expect(editor?.get('b')).toEqual(sample('b'));
    await advance(0);
    expect(pvw.mock.lastCall?.[0]).toEqual({ channel: 1, viewId, sourceIds: ['b', 'c', 'd', 'e'] });
    expect(editor?.get('c')).toEqual(sample('c'));
    expect(stage?.has('c')).toBe(false);

    pvw.mockResolvedValue({ frames: [] });
    show(['a', 'b']);
    await advance(0);
    expect(stage?.get('b')).toEqual(sample('b'));
    expect(pvw.mock.lastCall?.[0]).toEqual({ channel: 1, viewId, sourceIds: ['a', 'b'] });

    pvw.mockResolvedValueOnce({ frames: [{ sourceId: 'b', signal: 'absent' }] });
    await advance(500);
    expect(stage?.get('b')).toEqual({ sourceId: 'b', signal: 'absent' });
    expect(stage?.get('a')).toEqual(sample('a'));
    await advance(2_501);
    expect(stage?.size).toBe(0);

    show([]);
    await advance(0);
    expect(pvw.mock.calls.filter(([request]) => request.sourceIds.length === 0)).toEqual([
      [{ channel: 1, viewId, sourceIds: [] }],
    ]);
    expect(pvw.mock.calls.every(([request]) => request.viewId === viewId)).toBe(true);
  } finally {
    act(() => root.unmount());
    await advance(0);
    window.cg = previous;
    vi.unstubAllGlobals();
    vi.useRealTimers();
  }
});

it('shows the shared input snapshot and keeps the media poster while the PVW lease stalls', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const previous = window.cg;
  const media = 'md-video';
  const ids = ['studio', media];
  let release: ((reply: { frames: PvwSourceFrame[] }) => void) | undefined;
  const pvw = vi
    .fn<RuntimeBridge['sourcePreviews']['pvw']>()
    .mockImplementationOnce(() => new Promise((resolve) => (release = resolve)))
    .mockResolvedValue({ frames: [] });
  const thumbnails = vi
    .fn<RuntimeBridge['sourcePreviews']['thumbnails']>()
    .mockResolvedValueOnce({ frames: ids.map(sample) })
    .mockResolvedValue({ frames: [] });
  window.cg = { sourcePreviews: { pvw, thumbnails } } as unknown as RuntimeBridge;
  const root = createRoot(document.createElement('div'));
  const inspector = vi.fn();
  const stop = subscribeInputThumbnail({ channel: 1, sourceId: 'studio', publish: inspector });
  let shown: Frames | undefined;
  const advance = (ms: number) => act(async () => await vi.advanceTimersByTimeAsync(ms));
  try {
    act(() =>
      root.render(
        createElement(Consumer, { ids, mode: 'stage', publish: (frames) => (shown = frames) }),
      ),
    );
    await advance(0);
    expect(pvw.mock.calls[0]?.[0].sourceIds).toEqual(ids);
    expect(thumbnails.mock.calls).toEqual([[{ channel: 1, sourceIds: ids }]]);
    expect(inspector).toHaveBeenCalledWith(sample('studio'));
    expect(shown?.get('studio')).toEqual({ ...sample('studio'), snapshotOnly: true });
    expect(shown?.get(media)).toEqual({ ...sample(media), snapshotOnly: true });

    await advance(5_001);
    expect(pvw).toHaveBeenCalledTimes(1);
    expect(shown?.has('studio')).toBe(false);
    expect(shown?.get(media)?.jpegBase64).toBe('sample');

    const recovered = { ...sample('studio'), jpegBase64: 'live' };
    release?.({ frames: [recovered, { sourceId: media, signal: 'absent' }] });
    await advance(0);
    expect(shown?.get('studio')).toEqual(recovered);
    expect(shown?.get(media)).toEqual({ ...sample(media), snapshotOnly: true });

    const absent = { sourceId: 'studio', signal: 'absent' as const };
    pvw.mockResolvedValue({ frames: [absent] });
    thumbnails.mockResolvedValue({ frames: [sample('studio')] });
    await advance(2_000);
    expect(shown?.get('studio')).toEqual({ ...sample('studio'), snapshotOnly: true });
    thumbnails.mockResolvedValue({ frames: [absent] });
    await advance(2_000);
    expect(shown?.get('studio')).toEqual(absent);
  } finally {
    stop();
    act(() => root.unmount());
    release?.({ frames: [] });
    await advance(0);
    window.cg = previous;
    vi.unstubAllGlobals();
    vi.useRealTimers();
  }
});
