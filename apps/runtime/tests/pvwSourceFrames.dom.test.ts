// @vitest-environment jsdom
import { act, createElement, Fragment, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import {
  usePvwSourceFrames,
  type PvwSourceFrame,
} from '../src/renderer/features/monitors/usePvwSourceFrames.js';
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
