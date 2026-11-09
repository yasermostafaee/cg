import { useCallback, useEffect, useRef, useState } from 'react';
import {
  sourceSeatable,
  sourceShowableOn,
  type SourceDefinition,
  type SourcePreviewFrame,
} from '@cg/shared-ipc';
import { Button } from '../../ui/Button.js';
import { subscribeInputThumbnail } from './inputThumbnailDemand.js';

const PLACEHOLDER_DESCRIPTION = 'Picture placeholder. Input signal status is unknown.';

/** A silent snapshot which can also open the separate, interactive input check. */
export function InputThumbnail({
  source,
  channel,
  onCheck,
}: {
  source: SourceDefinition;
  channel?: number | undefined;
  onCheck?: ((source: SourceDefinition) => void) | undefined;
}): JSX.Element {
  const previewChannel =
    channel !== undefined &&
    source.origin === 'input' &&
    source.departed !== true &&
    sourceSeatable(source) &&
    sourceShowableOn(source, channel)
      ? channel
      : undefined;
  const sourceId = source.id;
  const checkable = onCheck !== undefined;
  const element = useRef<HTMLElement | null>(null);
  const attach = useCallback((tile: HTMLElement | null) => {
    element.current = tile;
  }, []);
  const [snapshot, setSnapshot] = useState<{ channel: number; frame: SourcePreviewFrame }>();
  const [brokenPicture, setBrokenPicture] = useState<string>();
  const frame =
    snapshot?.channel === previewChannel && snapshot?.frame.sourceId === sourceId
      ? snapshot.frame
      : undefined;
  const src =
    frame?.signal !== 'absent' && frame?.jpegBase64
      ? `data:image/jpeg;base64,${frame.jpegBase64}`
      : undefined;
  const picture = src === undefined || src === brokenPicture ? null : src;

  useEffect(() => {
    const tile = element.current;
    if (
      previewChannel === undefined ||
      tile === null ||
      window.cg?.sourcePreviews === undefined ||
      typeof IntersectionObserver === 'undefined'
    ) {
      return;
    }
    let active = true;
    let unsubscribe: (() => void) | undefined;
    const observer = new IntersectionObserver((entries) => {
      if (!active) return;
      if (entries.at(-1)?.isIntersecting === true) {
        unsubscribe ??= subscribeInputThumbnail({
          channel: previewChannel,
          sourceId,
          publish: (frame) =>
            setSnapshot(frame === undefined ? undefined : { channel: previewChannel, frame }),
        });
      } else if (unsubscribe !== undefined) {
        unsubscribe();
        unsubscribe = undefined;
        setSnapshot(undefined);
        setBrokenPicture(undefined);
      }
    });
    observer.observe(tile);
    return () => {
      active = false;
      observer.disconnect();
      unsubscribe?.();
    };
  }, [previewChannel, sourceId, checkable]);

  const description =
    picture !== null
      ? 'Input picture.'
      : frame?.signal === 'absent'
        ? 'No current input signal.'
        : PLACEHOLDER_DESCRIPTION;
  const className =
    picture === null ? 'cg-input-thumbnail' : 'cg-input-thumbnail cg-media-thumbnail';
  const content =
    picture === null ? (
      'No signal'
    ) : (
      <img src={picture} alt="" onError={() => setBrokenPicture(picture)} />
    );

  if (onCheck === undefined) {
    return (
      <span
        ref={attach}
        className={className}
        data-input-thumbnail="passive"
        role="img"
        aria-label={description}
        title={description}
      >
        {content}
      </span>
    );
  }
  return (
    <Button
      ref={attach}
      variant="ghost"
      className={className}
      data-input-thumbnail="checkable"
      aria-label={`Check input · ${source.name}`}
      title={`${description} Select to check this input.`}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') event.stopPropagation();
      }}
      onClick={() => onCheck(source)}
    >
      {content}
    </Button>
  );
}
