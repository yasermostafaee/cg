import { sourceDisplayName } from '../../ui/operatorNaming.js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { VideoOff } from 'lucide-react';
import {
  sourcePreviewable,
  sourceShowableOn,
  type SourceDefinition,
  type SourcePreviewFrame,
} from '@cg/shared-ipc';
import { Button } from '../../ui/Button.js';
import { Icon } from '../../ui/Icon.js';
import { useModalForeground } from '../../ui/modalForeground.js';
import { LiveInputCheckTile } from '../monitors/LiveInputCheckTile.js';
import { useLiveInputCheck, type InputCheckSurface } from '../monitors/liveInputCheckContext.js';
import { InputAudioMeter } from './InputAudioMeter.js';
import { subscribeInputThumbnail } from './inputThumbnailDemand.js';
import type { PreviewEngine, PreviewOriginChanged } from './usePreviewOrigins.js';

const PLACEHOLDER_DESCRIPTION = 'Picture placeholder. Input signal status is unknown.';
const SNAPSHOT_HOLD_MS = 5_000;

/** An input's silent snapshot and its interactive check share the same picture tile. */
export function InputThumbnail({
  source,
  channel,
  meterChannel,
  compact = false,
  inputCheck,
  onCheck,
  onPreviewEngineChange,
}: {
  source: SourceDefinition;
  channel?: number | undefined;
  meterChannel: number | undefined;
  compact?: boolean;
  inputCheck?: InputCheckSurface | undefined;
  onCheck?: ((source: SourceDefinition) => void) | undefined;
  onPreviewEngineChange?: PreviewOriginChanged | undefined;
}): JSX.Element {
  const foreground = useModalForeground();
  const previewChannel =
    channel !== undefined &&
    source.origin === 'input' &&
    sourcePreviewable(source) &&
    sourceShowableOn(source, channel)
      ? channel
      : undefined;
  const sourceId = source.id;
  const checkable = inputCheck !== undefined;
  const control = useLiveInputCheck();
  const check = control?.check;
  const active =
    inputCheck !== undefined &&
    check?.surface === inputCheck.surface &&
    check.sourceId === sourceId;
  const element = useRef<HTMLElement | null>(null);
  const attach = useCallback((tile: HTMLElement | null) => {
    element.current = tile;
  }, []);
  const [snapshot, setSnapshot] = useState<{
    channel: number;
    frame: SourcePreviewFrame;
  }>();
  const [brokenPicture, setBrokenPicture] = useState<string>();
  const [decodedOrigin, setDecodedOrigin] = useState<{
    sourceId: string;
    engine?: PreviewEngine;
  }>();
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
    if (picture === null) setDecodedOrigin(undefined);
    if (!active)
      onPreviewEngineChange?.(
        picture !== null && decodedOrigin?.sourceId === sourceId ? decodedOrigin.engine : undefined,
      );
  }, [active, picture, decodedOrigin, sourceId, onPreviewEngineChange]);

  useEffect(() => {
    if (snapshot === undefined || !foreground || active) return;
    // Pause expiration while covered, then allow one refresh window after returning.
    const timer = setTimeout(
      () => setSnapshot((previous) => (previous === snapshot ? undefined : previous)),
      SNAPSHOT_HOLD_MS,
    );
    return () => clearTimeout(timer);
  }, [snapshot, foreground, active]);

  useEffect(() => {
    const tile = element.current;
    if (
      !foreground ||
      previewChannel === undefined ||
      active ||
      tile === null ||
      window.cg?.sourcePreviews === undefined ||
      typeof IntersectionObserver === 'undefined'
    ) {
      return;
    }
    let observing = true;
    let unsubscribe: (() => void) | undefined;
    const observer = new IntersectionObserver((entries) => {
      if (!observing) return;
      if (entries.at(-1)?.isIntersecting === true) {
        unsubscribe ??= subscribeInputThumbnail({
          channel: previewChannel,
          sourceId,
          publish: (frame) => {
            if (
              frame === undefined ||
              (frame.signal !== 'absent' && frame.jpegBase64 === undefined)
            )
              return;
            setSnapshot({ channel: previewChannel, frame });
          },
        });
      } else if (unsubscribe !== undefined) {
        unsubscribe();
        unsubscribe = undefined;
        setBrokenPicture(undefined);
      }
    });
    observer.observe(tile);
    return () => {
      observing = false;
      observer.disconnect();
      unsubscribe?.();
    };
  }, [active, foreground, previewChannel, sourceId, checkable]);

  if (active && check != null && control !== null) {
    return (
      <LiveInputCheckTile
        key={check.view.previewId}
        view={check.view}
        onClose={() => {
          control.stop(check.surface, check.view.previewId);
          requestAnimationFrame(() => element.current?.focus());
        }}
        onStall={control.stall}
        onPreviewEngineChange={onPreviewEngineChange}
      />
    );
  }

  const description =
    picture !== null
      ? 'Input picture.'
      : frame?.signal === 'absent'
        ? 'No current input signal.'
        : PLACEHOLDER_DESCRIPTION;
  const className =
    picture === null ? 'cg-input-thumbnail' : 'cg-input-thumbnail cg-media-thumbnail';
  const content =
    picture !== null ? (
      <img
        src={picture}
        alt=""
        onLoad={(event) => {
          if (event.currentTarget.getAttribute('src') === picture)
            setDecodedOrigin({
              sourceId,
              ...(frame?.engine === undefined ? {} : { engine: frame.engine }),
            });
        }}
        onError={() => {
          setDecodedOrigin(undefined);
          setBrokenPicture(picture);
        }}
      />
    ) : compact ? (
      <Icon icon={VideoOff} size={12} />
    ) : frame?.signal === 'absent' ? (
      'No signal'
    ) : (
      'Preview unavailable'
    );

  const thumbnail =
    inputCheck === undefined ? (
      <span
        ref={attach}
        className={className}
        data-input-thumbnail="passive"
        data-input-thumbnail-compact={compact ? '' : undefined}
        role="img"
        aria-label={description}
        title={description}
      >
        {content}
      </span>
    ) : (
      <Button
        ref={attach}
        variant="ghost"
        className={className}
        data-input-thumbnail="checkable"
        aria-label={`Check input · ${sourceDisplayName(source.name, 'input')}`}
        title={`${description} Select to check this input.`}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') event.stopPropagation();
        }}
        onClick={() => (onCheck ?? inputCheck.start)(source)}
      >
        {content}
      </Button>
    );
  return (
    <span className="cg-input-picture-meter">
      {thumbnail}
      <InputAudioMeter
        sourceId={sourceId}
        previewEngine={
          picture !== null && decodedOrigin?.sourceId === sourceId
            ? decodedOrigin.engine
            : undefined
        }
        channel={meterChannel}
        name={sourceDisplayName(source.name, 'input')}
      />
    </span>
  );
}
