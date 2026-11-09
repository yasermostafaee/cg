// @vitest-environment jsdom
import type { SourcePreviewFrame } from '@cg/shared-ipc';
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
