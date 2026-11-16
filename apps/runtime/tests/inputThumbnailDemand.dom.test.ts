// @vitest-environment jsdom
import type { MediaPreviewFrame, SourcePreviewFrame } from '@cg/shared-ipc';
import { expect, it, vi } from 'vitest';
import { subscribeInputThumbnail } from '../src/renderer/features/sources/inputThumbnailDemand.js';
import type { RuntimeBridge } from '../src/shared/runtime-bridge.js';

it('shares the batch budget and drops replies for a closed or replaced viewport demand', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
  const previous = window.cg;
  let release: ((value: { frames: SourcePreviewFrame[] }) => void) | undefined;
  const thumbnails = vi
    .fn<NonNullable<RuntimeBridge['sourcePreviews']>['thumbnails']>()
    .mockImplementationOnce(() => new Promise((resolve) => (release = resolve)))
    .mockResolvedValue({ frames: [] });
  window.cg = { sourcePreviews: { thumbnails } } as unknown as RuntimeBridge;

  const callbacks = Array.from({ length: 12 }, () => vi.fn());
  const stop = callbacks.map((publish, index) =>
    subscribeInputThumbnail({ channel: 1, sourceId: `input-${index}`, publish }),
  );
  const shared = vi.fn();
  stop.push(subscribeInputThumbnail({ channel: 1, sourceId: 'input-1', publish: shared }));
  try {
    expect(thumbnails).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(0);
    expect(thumbnails.mock.calls).toEqual([
      [{ channel: 1, sourceIds: Array.from({ length: 8 }, (_, index) => `input-${index}`) }],
    ]);
    stop[0]?.();
    const replacement = vi.fn();
    stop.push(subscribeInputThumbnail({ channel: 1, sourceId: 'input-0', publish: replacement }));
    await vi.advanceTimersByTimeAsync(999);
    expect(thumbnails).toHaveBeenCalledTimes(1);
    release?.({
      frames: [
        { sourceId: 'input-0', signal: 'present' },
        { sourceId: 'input-1', signal: 'unknown' },
      ],
    });
    await vi.advanceTimersByTimeAsync(1);

    expect(callbacks[0]).not.toHaveBeenCalled();
    expect(replacement).not.toHaveBeenCalled();
    expect(callbacks[1]?.mock.calls[0]).toEqual([{ sourceId: 'input-1', signal: 'unknown' }]);
    expect(shared.mock.calls[0]).toEqual([{ sourceId: 'input-1', signal: 'unknown' }]);
    expect(thumbnails.mock.calls[1]).toEqual([
      { channel: 1, sourceIds: [8, 9, 10, 11, 1, 2, 3, 4].map((index) => `input-${index}`) },
    ]);

    for (const unsubscribe of stop) unsubscribe();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(thumbnails).toHaveBeenCalledTimes(2);
  } finally {
    for (const unsubscribe of stop) unsubscribe();
    window.cg = previous;
    vi.useRealTimers();
  }
});

it('lets passive thumbnails pass a pending media seek and rejects a replaced seek reply', async () => {
  vi.resetModules();
  const { subscribeInputThumbnail: subscribeInput, subscribeMediaPreviewFrame } =
    await import('../src/renderer/features/sources/inputThumbnailDemand.js');
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
  const previous = window.cg;
  let release:
    | ((value: { frames: SourcePreviewFrame[]; mediaFrame: MediaPreviewFrame }) => void)
    | undefined;
  const media = { sourceId: 'md-preview', signal: 'unknown' as const, jpegBase64: 'sample' };
  const input = { sourceId: 'studio', signal: 'present' as const, jpegBase64: 'input' };
  const thumbnails = vi
    .fn<RuntimeBridge['sourcePreviews']['thumbnails']>()
    .mockImplementationOnce(() => new Promise((resolve) => (release = resolve)))
    .mockResolvedValueOnce({ frames: [input] })
    .mockResolvedValue({ frames: [], mediaFrame: { ...media, previewPositionMs: 7000 } });
  window.cg = { sourcePreviews: { thumbnails } } as unknown as RuntimeBridge;
  const replaced = vi.fn();
  const current = vi.fn();
  const passive = vi.fn();
  const seek = (at: number, publish: typeof current) =>
    subscribeMediaPreviewFrame({
      channel: 2,
      sourceId: media.sourceId,
      position: () => at,
      publish,
    });
  const stop = [seek(3000, replaced)];
  try {
    await vi.advanceTimersByTimeAsync(0);
    expect(thumbnails.mock.lastCall?.[0]).toEqual({
      channel: 2,
      sourceIds: [],
      mediaPosition: { sourceId: media.sourceId, atMs: 3000 },
    });
    stop[0]?.();
    stop.push(
      seek(7000, current),
      subscribeInput({ channel: 2, sourceId: 'studio', publish: passive }),
    );
    await vi.advanceTimersByTimeAsync(1000);
    expect(thumbnails.mock.lastCall?.[0]).toEqual({ channel: 2, sourceIds: ['studio'] });
    expect(passive).toHaveBeenCalledWith(input);
    stop[2]?.();
    release?.({ frames: [], mediaFrame: { ...media, previewPositionMs: 3000 } });
    await vi.advanceTimersByTimeAsync(1000);
    expect(replaced).not.toHaveBeenCalled();
    expect(current).toHaveBeenCalledWith({ ...media, previewPositionMs: 7000 });
  } finally {
    for (const unsubscribe of stop) unsubscribe();
    await vi.advanceTimersByTimeAsync(1);
    window.cg = previous;
    vi.useRealTimers();
  }
});
