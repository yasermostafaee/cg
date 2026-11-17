// @vitest-environment jsdom
import { act, createElement, Fragment, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import type { SourcePreviewFrame } from '@cg/shared-ipc';
import { usePvwSourceFrames } from '../src/renderer/features/monitors/usePvwSourceFrames.js';
import { Modal } from '../src/renderer/ui/Modal.js';
import { useModalForeground } from '../src/renderer/ui/modalForeground.js';
import type { RuntimeBridge } from '../src/shared/runtime-bridge.js';

it('pauses the covered authoring feed, preserves its picture briefly on return, and keeps PVW running', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const previous = window.cg;
  let studio: 'present' | 'missing' | 'unknown' | 'absent' = 'present';
  const pvw = vi
    .fn<RuntimeBridge['sourcePreviews']['pvw']>()
    .mockImplementation(async ({ sourceIds }) => ({
      frames: sourceIds.flatMap<SourcePreviewFrame>((sourceId) => {
        if (sourceId === 'studio' && studio === 'missing') return [];
        if (sourceId === 'studio' && studio === 'unknown')
          return [{ sourceId, signal: 'unknown' as const }];
        if (sourceId === 'studio' && studio === 'absent')
          return [{ sourceId, signal: 'absent' as const }];
        return [{ sourceId, signal: 'present' as const, jpegBase64: sourceId }];
      }),
    }));
  const thumbnails = vi
    .fn<RuntimeBridge['sourcePreviews']['thumbnails']>()
    .mockResolvedValue({ frames: [] });
  window.cg = { sourcePreviews: { pvw, thumbnails } } as unknown as RuntimeBridge;
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  let editor: ReturnType<typeof usePvwSourceFrames> | undefined;
  let stage: ReturnType<typeof usePvwSourceFrames> | undefined;
  function Stage(): null {
    const frames = usePvwSourceFrames(1, ['programme']);
    useEffect(() => {
      stage = frames;
    }, [frames]);
    return null;
  }
  function Editor({ covered }: { covered: boolean }): JSX.Element {
    const ref = useRef<HTMLElement>(null);
    const foreground = useModalForeground(ref);
    const frames = usePvwSourceFrames(1, ['studio'], foreground, 'editor', true);
    useEffect(() => {
      editor = frames;
    }, [frames]);
    return createElement(
      Modal,
      { title: 'Editor', footer: null, onClose: () => undefined },
      createElement('section', { ref }),
      covered
        ? createElement(Modal, {
            title: 'Picker',
            layer: 'sub',
            footer: null,
            onClose: () => undefined,
          })
        : null,
    );
  }
  const show = async (covered: boolean): Promise<void> => {
    await act(async () =>
      root.render(
        createElement(Fragment, null, createElement(Stage), createElement(Editor, { covered })),
      ),
    );
  };
  const advance = (ms: number) => act(async () => vi.advanceTimersByTimeAsync(ms));
  try {
    await show(false);
    await advance(0);
    expect(editor?.get('studio')?.jpegBase64).toBe('studio');
    expect(stage?.get('programme')?.jpegBase64).toBe('programme');
    pvw.mockClear();
    await show(true);
    await advance(6_000);
    expect(pvw.mock.calls.length).toBeGreaterThan(0);
    expect(pvw.mock.calls.every(([request]) => request.sourceIds.join() === 'programme')).toBe(
      true,
    );
    expect(stage?.get('programme')?.jpegBase64).toBe('programme');
    expect(editor?.get('studio')?.jpegBase64).toBe('studio');
    studio = 'unknown';
    await show(false);
    expect(editor?.get('studio')?.jpegBase64).toBe('studio');
    await advance(1_000);
    expect(editor?.get('studio')?.jpegBase64).toBe('studio');
    studio = 'missing';
    await advance(4_001);
    expect(editor?.has('studio')).toBe(false);
    studio = 'present';
    await advance(500);
    expect(editor?.get('studio')?.jpegBase64).toBe('studio');
    studio = 'absent';
    await advance(500);
    expect(editor?.get('studio')).toEqual({ sourceId: 'studio', signal: 'absent' });
  } finally {
    await act(async () => root.unmount());
    await advance(0);
    host.remove();
    window.cg = previous;
    vi.unstubAllGlobals();
    vi.useRealTimers();
  }
});
