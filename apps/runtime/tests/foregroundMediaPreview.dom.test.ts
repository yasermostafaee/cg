// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { SourceMediaPreview } from '../src/renderer/features/sources/SourceMediaPreview.js';
import { Modal } from '../src/renderer/ui/Modal.js';
import type { RuntimeBridge } from '../src/shared/runtime-bridge.js';

it('pauses a covered media preview without dropping its picture or advancing its clock', async () => {
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance', 'Date'],
  });
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const previous = window.cg;
  const positions: number[] = [];
  const thumbnails = vi
    .fn<RuntimeBridge['sourcePreviews']['thumbnails']>()
    .mockImplementation(async ({ mediaPosition }) => {
      if (mediaPosition === undefined) return { frames: [] };
      positions.push(mediaPosition.atMs);
      return {
        frames: [],
        mediaFrame: {
          sourceId: mediaPosition.sourceId,
          signal: 'present',
          jpegBase64: 'movie',
          previewPositionMs: mediaPosition.atMs,
        },
      };
    });
  window.cg = { sourcePreviews: { thumbnails } } as unknown as RuntimeBridge;
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const show = async (covered: boolean): Promise<void> => {
    await act(async () =>
      root.render(
        createElement(
          Modal,
          { title: 'Parent', footer: null, onClose: () => undefined },
          createElement(SourceMediaPreview, {
            id: 'md-film',
            name: 'Film',
            channel: 1,
            durationMs: 30_000,
            poster: 'data:image/jpeg;base64,poster',
          }),
          covered
            ? createElement(Modal, {
                title: 'Cover',
                layer: 'sub',
                footer: null,
                onClose: () => undefined,
              })
            : null,
        ),
      ),
    );
  };
  const parent = () => document.querySelector('[role="dialog"][aria-label="Parent"]')!;
  const advance = (ms: number) => act(async () => vi.advanceTimersByTimeAsync(ms));
  try {
    await show(false);
    await act(async () =>
      parent().querySelector<HTMLButtonElement>('[aria-label="Play preview"]')?.click(),
    );
    await advance(2_500);
    const position = parent().querySelector<HTMLInputElement>(
      '[aria-label="Preview position"]',
    )!.value;
    expect(Number(position)).toBeGreaterThan(0);
    expect(parent().querySelector('img')?.getAttribute('src')).toBe('data:image/jpeg;base64,movie');
    const reads = positions.length;
    await show(true);
    await advance(20_000);
    expect(positions).toHaveLength(reads);
    expect(parent().querySelector<HTMLInputElement>('[aria-label="Preview position"]')!.value).toBe(
      position,
    );
    expect(parent().querySelector('img')?.getAttribute('src')).toBe('data:image/jpeg;base64,movie');
    await show(false);
    await advance(0);
    expect(positions.at(-1)).toBe(Number(position));
    await advance(1_000);
    expect(positions.at(-1)).toBeGreaterThan(Number(position));
    expect(positions.at(-1)).toBeLessThan(Number(position) + 2_000);
  } finally {
    await act(async () => root.unmount());
    await advance(0);
    host.remove();
    window.cg = previous;
    vi.unstubAllGlobals();
    vi.useRealTimers();
  }
});
