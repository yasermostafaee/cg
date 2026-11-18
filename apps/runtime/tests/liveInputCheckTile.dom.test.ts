// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { LivePreviewStatus } from '@cg/shared-ipc';
import type { RuntimeBridge } from '../src/shared/runtime-bridge.js';
import { LiveInputCheckTile } from '../src/renderer/features/monitors/LiveInputCheckTile.js';

const previous = window.cg;
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const drawImage = vi.fn();
const clearRect = vi.fn();
const url = vi
  .fn()
  .mockResolvedValue('http://bridge.test/input-preview/held/picture?ticket=opaque');
const origin = vi.fn();
const stall = vi.fn();
const view: LivePreviewStatus = {
  channel: 1,
  previewId: '38c2b92a-9dfd-4832-9272-6f83bff7e4d2',
  sourceName: 'MTA (APASAI)',
  state: 'ready',
  engine: 'A',
  dbFs: [-18, -20],
};
const bitmap = () => ({ width: 640, height: 360, close: vi.fn() });

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers();
  vi.clearAllMocks();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  window.cg = { livePreview: { url } } as unknown as RuntimeBridge;
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage,
    clearRect,
    // Decoding a black picture proves receipt, never source-signal health.
    getImageData: () => {
      throw new Error('Picture colour must not infer physical input signal.');
    },
  } as unknown as CanvasRenderingContext2D);
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn().mockImplementation(async () => bitmap()),
  );
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  window.cg = previous;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function show(next: LivePreviewStatus) {
  await act(async () =>
    root.render(
      createElement(LiveInputCheckTile, {
        view: next,
        onClose: vi.fn(),
        onStall: stall,
        onPreviewEngineChange: origin,
      }),
    ),
  );
}

function feed(frame: boolean) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          // The actual JPEG decoder is stubbed, not the length-framed stream parser.
          if (frame) controller.enqueue(new Uint8Array([0, 0, 0, 3, 1, 2, 3]));
          init.signal?.addEventListener('abort', () => controller.error(new Error('aborted')));
        },
      });
      return new Response(body);
    }),
  );
}

const status = () => host.querySelector<HTMLElement>('[data-input-check-state]')!;
const picture = () => host.querySelector<HTMLCanvasElement>('[data-input-picture]')!;
const sound = () => host.querySelector<HTMLButtonElement>('[aria-label="Input preview sound"]')!;

it('does not call a ready lease live until a current picture decodes, and bounds a missing stream', async () => {
  feed(false);
  await show(view);
  expect(status().textContent).toBe('Connecting · Server A');
  expect(picture().hidden).toBe(true);
  expect(sound().disabled).toBe(true);
  expect(origin).toHaveBeenLastCalledWith(undefined);
  await act(async () => vi.advanceTimersByTime(2_500));
  expect(stall).toHaveBeenCalledOnce();
  expect(stall).toHaveBeenCalledWith(view.previewId);
});

it('describes a decoded picture as received without claiming authoritative input signal', async () => {
  feed(true);
  await show(view);
  expect(drawImage).toHaveBeenCalledOnce();
  expect(status().textContent).toBe('Picture received · Server A');
  expect(picture().hidden).toBe(false);
  expect(sound().disabled).toBe(false);
  expect(origin).toHaveBeenLastCalledWith('A');
  expect(host.textContent).not.toMatch(/No signal|\bLive\b/);
});

it.each(['A', 'B', undefined] as const)(
  'surfaces a forbidden reason for server %s without keeping a prior picture, meter or listening action',
  async (engine) => {
    feed(true);
    await show(view);
    expect(picture().hidden).toBe(false);
    await show({
      ...view,
      state: 'forbidden',
      engine,
      message: 'Playout refused access to this input preview.',
    });
    expect(status().textContent).toBe(
      engine === undefined ? 'Access denied' : `Access denied · Server ${engine}`,
    );
    expect(host.querySelector('[data-input-check-detail]')?.textContent).toBe(
      'Playout refused access to this input preview.',
    );
    expect(host.querySelector('.cg-input-check-tile__placeholder')?.textContent).toBe(
      'Playout refused access to this input preview.',
    );
    expect(picture().hidden).toBe(true);
    expect(sound().disabled).toBe(true);
    expect(sound().getAttribute('aria-pressed')).toBe('false');
    expect(origin).toHaveBeenLastCalledWith(undefined);
    expect(host.querySelectorAll('[data-input-meter-state="measured"]')).toHaveLength(0);
    expect(url).toHaveBeenCalledOnce();
  },
);

it('refuses a late old-engine decode after the same handle changes engine', async () => {
  let resolveOld: ((value: ImageBitmap) => void) | undefined;
  const old = bitmap();
  vi.mocked(createImageBitmap).mockImplementationOnce(
    () => new Promise<ImageBitmap>((resolve) => (resolveOld = resolve)),
  );
  feed(true);
  await show(view);
  feed(false);
  await show({ ...view, engine: 'B' });
  await act(async () => resolveOld?.(old as ImageBitmap));
  expect(old.close).toHaveBeenCalledOnce();
  expect(drawImage).not.toHaveBeenCalled();
  expect(picture().hidden).toBe(true);
  expect(status().textContent).toBe('Connecting · Server B');
  expect(origin).not.toHaveBeenCalledWith('A');
});
