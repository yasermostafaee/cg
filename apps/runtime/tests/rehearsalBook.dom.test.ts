// @vitest-environment jsdom
import { act, createElement, createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as pagePictures from '../src/renderer/features/book/pagePictures.js';
import type { BookPage } from '../src/renderer/features/layers/bookOf.js';
import {
  RehearsalFrame,
  type RehearsalFrameHandle,
} from '../src/renderer/features/monitors/RehearsalFrame.js';

vi.mock('../src/renderer/features/book/pagePictures.js', async (original) => ({
  ...(await original<typeof pagePictures>()),
  pictureDataUrl: vi.fn(),
}));

const { MISSING_PICTURE_URL, pictureDataUrl } = pagePictures;
const picture = 'data:image/png;base64,AA==';
const first: BookPage = {
  fieldId: 'pages',
  index: 0,
  step: true,
  media: 'a'.repeat(64),
};
const third: BookPage = { ...first, index: 2, media: 'b'.repeat(64) };
const rewound: BookPage = { ...first, rewound: true };

describe('PVW book rewinds', () => {
  let container: HTMLDivElement;
  let root: Root;
  const handle = createRef<RehearsalFrameHandle>();
  const update = vi.fn<(value: string) => void>();
  const play = vi.fn<(value: string) => void>();
  const stop = vi.fn();
  const offer = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    vi.clearAllMocks();
    vi.mocked(pictureDataUrl).mockReset().mockResolvedValue(picture);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  const render = (book: BookPage | undefined, headline = 'On preview') =>
    act(async () => {
      root.render(
        createElement(RehearsalFrame, {
          itemId: 'row',
          html: '<!doctype html><html><body></body></html>',
          raster: { width: 1920, height: 1080 },
          fit: 0.5,
          zIndex: 1,
          fields: { headline },
          position: undefined,
          rowName: 'Row',
          activeLookId: undefined,
          timing: undefined,
          book,
          livePlates: [],
          sourceFrames: new Map(),
          handleRef: handle,
        }),
      );
    });

  const boot = async () => {
    const frame = container.querySelector('iframe')!;
    Object.assign(frame.contentWindow!, {
      update,
      play,
      stop,
      CG: { providePagePicture: offer },
    });
    await act(async () => frame.dispatchEvent(new Event('load')));
  };

  const pageUpdates = () =>
    update.mock.calls
      .map(([value]) => (JSON.parse(value) as { __cg?: { page?: unknown } }).__cg?.page)
      .filter((page) => page !== undefined);

  it('keeps the live Preview page on a rewind and accepts an explicit Go to the same index', async () => {
    await render(undefined);
    await boot();
    await render(third);
    expect(pageUpdates()).toEqual([expect.objectContaining({ index: 2 })]);
    expect(offer).toHaveBeenLastCalledWith(third.media, picture);

    await render(rewound, 'Edited in preview');
    expect(pageUpdates()).toEqual([expect.objectContaining({ index: 2 })]);
    expect(update).toHaveBeenLastCalledWith(JSON.stringify({ headline: 'Edited in preview' }));
    expect(offer).toHaveBeenCalledTimes(1);
    expect(play).not.toHaveBeenCalled();

    handle.current?.play();
    expect(offer).toHaveBeenLastCalledWith(first.media, picture);
    expect(JSON.parse(play.mock.calls[0]![0])).toMatchObject({
      __cg: { page: { field: 'pages', index: 0 } },
    });

    await render(first, 'Edited in preview');
    expect(pageUpdates()).toEqual([
      expect.objectContaining({ index: 2 }),
      expect.objectContaining({ index: 0 }),
    ]);
  });

  it('shows a staged first-picture replacement and restores the applied picture on Discard', async () => {
    await render(undefined);
    await boot();
    await render(third);
    await render(rewound);
    const draft = { ...rewound, id: 'replacement', media: 'c'.repeat(64) };
    await render(draft);
    expect(pageUpdates()).toHaveLength(2);
    expect(offer).toHaveBeenLastCalledWith(draft.media, picture);

    await render(rewound);
    expect(pageUpdates()).toHaveLength(3);
    expect(offer).toHaveBeenLastCalledWith(first.media, picture);
  });

  it('does not push a rewind when a different first picture was already staged', async () => {
    await render(undefined);
    await boot();
    await render(third);
    const draft = { ...rewound, id: 'replacement', media: 'c'.repeat(64) };
    await render(draft);
    expect(pageUpdates()).toEqual([expect.objectContaining({ index: 2 })]);
    expect(offer).toHaveBeenLastCalledWith(third.media, picture);

    // A deliberate edit after Stop changes the currently staged destination.
    const updatedDraft = { ...draft, id: 'replacement-again' };
    await render(updatedDraft);
    expect(pageUpdates()).toHaveLength(2);
    expect(offer).toHaveBeenLastCalledWith(draft.media, picture);
  });

  it('waits for a cold rewind picture on deliberate Play and uses the placeholder on failure', async () => {
    let fail: (reason: Error) => void = () => undefined;
    vi.mocked(pictureDataUrl).mockReturnValueOnce(
      new Promise<string>((_resolve, reject) => {
        fail = reject;
      }),
    );
    await render(rewound);
    await boot();
    handle.current?.play();
    expect(play).not.toHaveBeenCalled();

    await act(async () => fail(new Error('Picture could not be read')));
    expect(pageUpdates()).toEqual([]);
    expect(offer).toHaveBeenCalledWith(first.media, MISSING_PICTURE_URL);
    expect(play).toHaveBeenCalledTimes(1);
    expect(JSON.parse(play.mock.calls[0]![0])).toMatchObject({
      __cg: { page: { field: 'pages', index: 0 } },
    });
  });

  it.each(['Stop', 'a different target'])('retires a pending Play after %s', async (action) => {
    let resolvePicture: (url: string) => void = () => undefined;
    vi.mocked(pictureDataUrl).mockReturnValueOnce(
      new Promise<string>((resolve) => {
        resolvePicture = resolve;
      }),
    );
    await render(rewound);
    await boot();
    handle.current?.play();
    if (action === 'Stop') {
      handle.current?.stop();
      expect(stop).toHaveBeenCalledTimes(1);
    } else {
      await render(third);
      expect(pageUpdates()).toEqual([expect.objectContaining({ index: 2 })]);
    }
    await act(async () => resolvePicture(picture));
    expect(play).not.toHaveBeenCalled();
  });
});
