import { useCallback, useMemo, useRef } from 'react';
import type { SourceDefinition } from '@cg/shared-ipc';
import { SourceMediaPreview } from '../sources/SourceMediaPreview.js';
import type { PreviewEngine } from '../sources/usePreviewOrigins.js';
import type { PlatePlacement } from './livePlateGeometry.js';
import { pvwPlateMediaKey } from './pvwPlatePictures.js';
import type { PvwSourceFrame } from './usePvwSourceFrames.js';
import './pvw-media-plate.css';

type MediaPixels = HTMLVideoElement | HTMLImageElement;
type PublishPicture = (picture: PvwSourceFrame) => void;

/** The player remains in Control. Its decoded pixels share the normal mask and crop path. */
function captureMediaPixels(element: MediaPixels, sourceId: string, publish: PublishPicture) {
  const canvases = new Set<HTMLCanvasElement>();
  const video = element instanceof HTMLVideoElement ? element : undefined;
  const image = element instanceof HTMLImageElement ? element : undefined;
  let animation: number | undefined;
  let lastTime = Number.NaN;
  let engine: PreviewEngine | undefined;
  let reportedWidth = 0;
  let reportedHeight = 0;
  let reportedEngine: PreviewEngine | undefined;

  function draw(canvas: HTMLCanvasElement, width: number, height: number): void {
    const scale = Math.min(1, 960 / width, 540 / height);
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    canvas.getContext('2d')?.drawImage(element, 0, 0, w, h);
  }

  function dimensions(): [number, number] {
    if (video !== undefined)
      return video.readyState < video.HAVE_CURRENT_DATA
        ? [0, 0]
        : [video.videoWidth, video.videoHeight];
    return image?.complete === true ? [image.naturalWidth, image.naturalHeight] : [0, 0];
  }

  const picture = {
    attach(canvas: HTMLCanvasElement): () => void {
      canvases.add(canvas);
      const [width, height] = dimensions();
      if (width > 0 && height > 0) draw(canvas, width, height);
      return () => canvases.delete(canvas);
    },
  };

  function paint(): void {
    const [width, height] = dimensions();
    if (width <= 0 || height <= 0) return;
    for (const canvas of canvases) draw(canvas, width, height);
    if (reportedWidth === width && reportedHeight === height && reportedEngine === engine) return;
    reportedWidth = width;
    reportedHeight = height;
    reportedEngine = engine;
    publish({
      sourceId,
      width,
      height,
      signal: 'present',
      mediaPicture: picture,
      snapshotOnly: true,
      ...(engine === undefined ? {} : { engine }),
    });
  }

  function schedule(): void {
    if (animation !== undefined || video === undefined || video.paused || video.ended) return;
    animation = requestAnimationFrame(() => {
      animation = undefined;
      if (lastTime !== video.currentTime) {
        lastTime = video.currentTime;
        paint();
      }
      schedule();
    });
  }

  function refresh(): void {
    paint();
    schedule();
  }

  const events = ['load', 'loadeddata', 'resize', 'play', 'playing', 'pause', 'seeked', 'ended'];
  for (const name of events) element.addEventListener(name, refresh);
  return {
    element,
    refresh(nextEngine: PreviewEngine | undefined): void {
      engine = nextEngine;
      refresh();
    },
    stop(): void {
      if (animation !== undefined) cancelAnimationFrame(animation);
      for (const name of events) element.removeEventListener(name, refresh);
      canvases.clear();
    },
  };
}

export function PvwMediaPlate({
  plate,
  source,
  channel,
  fit,
  onPicture,
}: {
  plate: PlatePlacement;
  source: SourceDefinition;
  channel: number;
  fit: number;
  onPicture: (key: string, picture: PvwSourceFrame | undefined) => void;
}): JSX.Element {
  const key = pvwPlateMediaKey(plate);
  const capture = useRef<ReturnType<typeof captureMediaPixels>>();
  const showPicture = useCallback(
    (element: MediaPixels | null, engine?: PreviewEngine) => {
      if (element !== capture.current?.element) {
        capture.current?.stop();
        capture.current =
          element === null
            ? undefined
            : captureMediaPixels(element, source.id, (picture) => onPicture(key, picture));
      }
      if (element === null) onPicture(key, undefined);
      else capture.current?.refresh(engine);
    },
    [key, onPicture, source.id],
  );
  const control = useMemo(
    () => ({
      name: plate.plateLabel ?? source.name,
      hasAudio: source.media?.hasAudio,
      showPicture,
    }),
    [plate.plateLabel, source.name, source.media?.hasAudio, showPicture],
  );

  return (
    <div
      className="cg-pvw-media-plate"
      style={{
        left: Math.max(0, plate.x),
        top: Math.max(0, plate.y),
        transform: 'scale(' + (1 / fit).toString() + ')',
      }}
    >
      <SourceMediaPreview
        id={source.id}
        name={source.name}
        channel={channel}
        durationMs={source.media?.durationMs}
        plate={control}
      />
    </div>
  );
}
