import { useLayoutEffect, useRef, useState } from 'react';
import type { LivePreviewStatus } from '@cg/shared-ipc';
import type { PreviewEngine } from '../sources/usePreviewOrigins.js';
import { liveInputPictures } from './liveInputPicture.js';

const PICTURE_TIMEOUT_MS = 2_500;

export interface LiveInputPicture {
  readonly width: number;
  readonly height: number;
  readonly engine: PreviewEngine | undefined;
  attach(canvas: HTMLCanvasElement): () => void;
}

interface DecodedPicture extends LiveInputPicture {
  readonly channel: number;
  readonly previewId: string;
}

function drawPicture(canvas: HTMLCanvasElement, bitmap: ImageBitmap): void {
  const context = canvas.getContext('2d');
  if (context === null) return;
  if (canvas.width !== bitmap.width) canvas.width = bitmap.width;
  if (canvas.height !== bitmap.height) canvas.height = bitmap.height;
  context.drawImage(bitmap, 0, 0);
}

/** One reader for the surface's owned check, shared by all of its picture canvases. */
export function useLiveInputPicture(
  view: LivePreviewStatus | undefined,
  onStall: (previewId: string) => void,
): LiveInputPicture | undefined {
  const channel = view?.channel;
  const previewId = view?.previewId;
  const engine = view?.engine;
  const ready = view?.state === 'ready';
  const stalled = useRef(onStall);
  stalled.current = onStall;
  const [picture, setPicture] = useState<DecodedPicture>();

  useLayoutEffect(() => {
    setPicture(undefined);
    if (!ready || channel === undefined || previewId === undefined) return;

    const abort = new AbortController();
    const canvases = new Set<WeakRef<HTMLCanvasElement>>();
    let latest: ImageBitmap | undefined;
    const attach = (canvas: HTMLCanvasElement): (() => void) => {
      if (abort.signal.aborted) return () => undefined;
      const reference = new WeakRef(canvas);
      canvases.add(reference);
      if (latest !== undefined) drawPicture(canvas, latest);
      return () => canvases.delete(reference);
    };
    const stop = (): void => {
      abort.abort();
      clearTimeout(deadline);
      latest?.close();
      latest = undefined;
      for (const reference of canvases) {
        const canvas = reference.deref();
        if (canvas !== undefined)
          canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
      }
      canvases.clear();
    };
    const failed = (): void => {
      if (abort.signal.aborted) return;
      stop();
      setPicture(undefined);
      stalled.current(previewId);
    };
    let deadline = setTimeout(failed, PICTURE_TIMEOUT_MS);
    const run = async (): Promise<void> => {
      const url = await window.cg.livePreview.url({ channel, previewId }, 'picture');
      if (url === null || abort.signal.aborted) return;
      const response = await fetch(url, {
        signal: abort.signal,
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
      });
      if (!response.ok || response.body === null) return;
      for await (const jpeg of liveInputPictures(response.body)) {
        const bitmap = await createImageBitmap(new Blob([jpeg], { type: 'image/jpeg' })).catch(
          () => null,
        );
        if (bitmap === null) continue;
        if (abort.signal.aborted) {
          bitmap.close();
          return;
        }
        const { width, height } = bitmap;
        const resized = latest?.width !== width || latest.height !== height;
        latest?.close();
        latest = bitmap;
        for (const reference of canvases) {
          const canvas = reference.deref();
          if (canvas === undefined) canvases.delete(reference);
          else drawPicture(canvas, bitmap);
        }
        if (resized) setPicture({ channel, previewId, engine, width, height, attach });
        clearTimeout(deadline);
        deadline = setTimeout(failed, PICTURE_TIMEOUT_MS);
      }
    };
    void run().then(failed, failed);
    return stop;
  }, [channel, engine, previewId, ready]);

  return ready &&
    picture !== undefined &&
    picture.channel === channel &&
    picture.previewId === previewId &&
    picture.engine === engine
    ? picture
    : undefined;
}
