// @vitest-environment jsdom
import { act, createElement, useLayoutEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import type { LivePreviewStatus } from '@cg/shared-ipc';
import { useLiveInputPicture } from '../src/renderer/features/monitors/useLiveInputPicture.js';

it('uses one picture stream for multiple canvases and stops publishing on session change', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers();
  const view = {
    channel: 1,
    previewId: 'check-1',
    state: 'ready',
    engine: 'A',
    sourceName: 'UDP',
    dbFs: null,
  } satisfies LivePreviewStatus;
  const url = vi.fn(async (): Promise<string> => '/input-picture');
  vi.stubGlobal('cg', { livePreview: { url } });
  let stream: ReadableStreamDefaultController<Uint8Array> | undefined;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      stream = controller;
    },
  });
  let fetchSignal: AbortSignal | null | undefined;
  const fetchPicture = vi.fn(async (_url: string, init: RequestInit) => {
    fetchSignal = init.signal;
    init.signal?.addEventListener('abort', () => stream?.close(), { once: true });
    return { ok: true, body };
  });
  vi.stubGlobal('fetch', fetchPicture);
  const bitmap = () => ({ width: 320, height: 180, close: vi.fn() });
  const first = bitmap();
  const second = bitmap();
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn().mockResolvedValueOnce(first).mockResolvedValue(second),
  );
  const contexts = new Map<
    HTMLCanvasElement,
    { drawImage: ReturnType<typeof vi.fn>; clearRect: ReturnType<typeof vi.fn> }
  >();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
    this: HTMLCanvasElement,
  ) {
    const context = contexts.get(this) ?? { drawImage: vi.fn(), clearRect: vi.fn() };
    contexts.set(this, context);
    return context as unknown as CanvasRenderingContext2D;
  });

  const stalled = vi.fn();
  let renders = 0;
  function Harness({ check }: { check: LivePreviewStatus }): JSX.Element {
    renders++;
    const picture = useLiveInputPicture(check, stalled);
    const a = useRef<HTMLCanvasElement>(null);
    const b = useRef<HTMLCanvasElement>(null);
    const attach = picture?.attach;
    useLayoutEffect(() => {
      if (attach === undefined || a.current === null || b.current === null) return;
      const detachA = attach(a.current);
      const detachB = attach(b.current);
      return () => {
        detachA();
        detachB();
      };
    }, [attach]);
    return createElement(
      'div',
      null,
      createElement('canvas', { ref: a }),
      createElement('canvas', { ref: b }),
    );
  }

  const host = document.createElement('div');
  const root = createRoot(host);
  const sendFrame = () => stream?.enqueue(Uint8Array.of(0, 0, 0, 1, 1));
  try {
    await act(async () => root.render(createElement(Harness, { check: view })));
    await act(async () => sendFrame());
    expect(contexts.size).toBe(2);
    for (const entry of contexts.values())
      expect(entry.drawImage).toHaveBeenLastCalledWith(first, 0, 0);

    await act(async () => root.render(createElement(Harness, { check: { ...view, dbFs: [-10] } })));
    const afterMeter = renders;
    await act(async () => sendFrame());
    expect(renders).toBe(afterMeter);
    expect(url).toHaveBeenCalledTimes(1);
    expect(url).toHaveBeenCalledWith({ channel: 1, previewId: 'check-1' }, 'picture');
    expect(fetchPicture).toHaveBeenCalledTimes(1);
    for (const entry of contexts.values())
      expect(entry.drawImage).toHaveBeenLastCalledWith(second, 0, 0);
    expect(first.close).toHaveBeenCalledTimes(1);

    await act(async () =>
      root.render(
        createElement(Harness, { check: { ...view, state: 'connecting', previewId: 'check-2' } }),
      ),
    );
    expect(fetchSignal?.aborted).toBe(true);
    expect(second.close).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTimeAsync(2_500));
    expect(stalled).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  }
});
