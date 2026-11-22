import { sourceDisplayName } from '../../ui/operatorNaming.js';
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { VideoOff, Volume2, VolumeX } from 'lucide-react';
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
import { InputAudioMeter, InputAudioRails } from './InputAudioMeter.js';
import {
  canResolveNdi,
  confirmedNdiTarget,
  ndiPreviewAvailable,
  stopNdiAudio,
  toggleNdiAudio,
  useNdiAudioReceiver,
  useNdiLevels,
  useNdiPicture,
  useNdiReceivers,
  useNdiTargets,
  type NdiReceiver,
} from './directNdiPreview.js';
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
  const canRequestPicture =
    previewChannel !== undefined &&
    window.cg?.sourcePreviews !== undefined &&
    typeof IntersectionObserver !== 'undefined';
  const pictureRequestKey =
    previewChannel === undefined ? undefined : `${previewChannel}:${sourceId}`;
  const checkable = inputCheck !== undefined;
  const [inView, setInView] = useState(false);
  const ndiCandidate =
    !compact &&
    previewChannel !== undefined &&
    canResolveNdi(source, previewChannel) &&
    ndiPreviewAvailable();
  const ndiTargets = useNdiTargets(
    previewChannel,
    ndiCandidate ? [sourceId] : [],
    foreground && inView,
  );
  const target = ndiTargets.get(sourceId);
  const direct = confirmedNdiTarget(target);
  const resolvingTarget = ndiCandidate && target?.kind === 'pending';
  const waitForNdi = ndiCandidate && inView && source.producer.kind === 'ndi' && resolvingTarget;
  const knownNdi = ndiCandidate && source.producer.kind === 'ndi' && target?.kind === 'ndi';
  // Route inputs need one identity lookup before a direct NDI receiver can be opened.
  // Offscreen routes must not be mislabeled as waiting for NDI or hold up the normal preview.
  const waitForTarget = ndiCandidate && inView && resolvingTarget;
  const directChosen = direct !== undefined || waitForTarget || knownNdi;
  const previewBlocked = target?.kind === 'blocked';
  // Let the same visibility decision start the identity lookup before a snapshot can subscribe.
  const passiveBlocked = (ndiCandidate && !inView) || previewBlocked;
  const directReceiver = useNdiReceivers(ndiTargets, foreground && inView).get(sourceId);
  const control = useLiveInputCheck();
  const check = control?.check;
  const active =
    inputCheck !== undefined &&
    check?.surface === inputCheck.surface &&
    check.sourceId === sourceId;
  const element = useRef<HTMLElement | null>(null);
  const [tile, setTile] = useState<HTMLElement | null>(null);
  const image = useRef<HTMLImageElement>(null);
  const attach = useCallback((node: HTMLElement | null) => {
    element.current = node;
    setTile(node);
  }, []);
  const [snapshot, setSnapshot] = useState<{
    channel: number;
    frame: SourcePreviewFrame;
  }>();
  const [answeredPictureKey, setAnsweredPictureKey] = useState<string>();
  const [brokenPicture, setBrokenPicture] = useState<string>();
  const [decodedOrigin, setDecodedOrigin] = useState<{
    sourceId: string;
    src: string;
    engine?: PreviewEngine;
  }>();
  const frame =
    !previewBlocked && snapshot?.channel === previewChannel && snapshot?.frame.sourceId === sourceId
      ? snapshot.frame
      : undefined;
  const src =
    frame?.signal !== 'absent' && frame?.jpegBase64
      ? `data:image/jpeg;base64,${frame.jpegBase64}`
      : undefined;
  const picture = src === undefined || src === brokenPicture ? null : src;
  const awaitingPicture =
    !previewBlocked &&
    frame === undefined &&
    foreground &&
    canRequestPicture &&
    answeredPictureKey !== pictureRequestKey;

  useEffect(() => {
    if (picture === null || active || directChosen) setDecodedOrigin(undefined);
    else if (
      decodedOrigin?.sourceId === sourceId &&
      decodedOrigin.src === picture &&
      decodedOrigin.engine !== frame?.engine &&
      image.current?.complete === true &&
      image.current.naturalWidth > 0
    ) {
      setDecodedOrigin({
        sourceId,
        src: picture,
        ...(frame?.engine === undefined ? {} : { engine: frame.engine }),
      });
    }
    if (!active && !directChosen)
      onPreviewEngineChange?.(
        picture !== null && decodedOrigin?.sourceId === sourceId ? decodedOrigin.engine : undefined,
      );
  }, [
    active,
    directChosen,
    picture,
    decodedOrigin,
    sourceId,
    onPreviewEngineChange,
    frame?.engine,
  ]);

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
    if (
      !foreground ||
      !ndiCandidate ||
      tile === null ||
      typeof IntersectionObserver === 'undefined'
    ) {
      setInView(false);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      // A passive image and a direct player have different nodes. A final
      // callback from the detached image must not stop the replacement.
      if (element.current === tile) setInView(entries.at(-1)?.isIntersecting === true);
    });
    observer.observe(tile);
    return () => observer.disconnect();
  }, [foreground, ndiCandidate, sourceId, tile]);

  useEffect(() => {
    if (
      !foreground ||
      !canRequestPicture ||
      passiveBlocked ||
      directChosen ||
      previewChannel === undefined ||
      active ||
      tile === null
    ) {
      return;
    }
    let observing = true;
    let unsubscribe: (() => void) | undefined;
    const observer = new IntersectionObserver((entries) => {
      if (!observing || element.current !== tile) return;
      if (entries.at(-1)?.isIntersecting === true) {
        unsubscribe ??= subscribeInputThumbnail({
          channel: previewChannel,
          sourceId,
          publish: (frame) => {
            setAnsweredPictureKey(pictureRequestKey);
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
  }, [
    active,
    directChosen,
    passiveBlocked,
    foreground,
    previewChannel,
    sourceId,
    checkable,
    canRequestPicture,
    pictureRequestKey,
    tile,
  ]);

  if (directChosen) {
    return (
      <DirectNdiInputTile
        attach={attach}
        sourceName={sourceDisplayName(source.name, 'input')}
        receiver={directReceiver}
        engine={direct?.engine}
        connecting={waitForNdi || (direct !== undefined && directReceiver === undefined)}
        resolvingTarget={waitForTarget && source.producer.kind !== 'ndi'}
        visible={inView}
        onPreviewEngineChange={onPreviewEngineChange}
        onPick={onCheck === undefined ? undefined : () => onCheck(source)}
      />
    );
  }
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
        : awaitingPicture
          ? 'Loading preview…'
          : PLACEHOLDER_DESCRIPTION;
  const className =
    picture === null ? 'cg-input-thumbnail' : 'cg-input-thumbnail cg-media-thumbnail';
  const content =
    picture !== null ? (
      <img
        ref={image}
        src={picture}
        alt=""
        onLoad={(event) => {
          if (event.currentTarget.getAttribute('src') === picture)
            setDecodedOrigin({
              sourceId,
              src: picture,
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
    ) : awaitingPicture ? (
      'Loading preview…'
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
        channel={passiveBlocked ? undefined : meterChannel}
        name={sourceDisplayName(source.name, 'input')}
      />
    </span>
  );
}

function DirectNdiInputTile({
  attach,
  sourceName,
  receiver,
  engine,
  connecting,
  resolvingTarget,
  visible,
  onPreviewEngineChange,
  onPick,
}: {
  attach: (tile: HTMLElement | null) => void;
  sourceName: string;
  receiver: NdiReceiver | undefined;
  engine: PreviewEngine | undefined;
  connecting: boolean;
  resolvingTarget: boolean;
  visible: boolean;
  onPreviewEngineChange: PreviewOriginChanged | undefined;
  onPick: (() => void) | undefined;
}): JSX.Element {
  const picture = useNdiPicture(receiver);
  const levels = useNdiLevels(receiver);
  const listening = useNdiAudioReceiver();
  const canvas = useRef<HTMLCanvasElement>(null);
  const live = receiver !== undefined && picture.state === 'live';
  const audible = receiver !== undefined && receiver === listening;
  const caption = live
    ? 'Direct NDI'
    : resolvingTarget
      ? 'Checking source…'
      : !visible
        ? 'Preview paused'
        : connecting || (receiver !== undefined && picture.state === 'connecting')
          ? 'Waiting for NDI'
          : picture.state === 'no-signal'
            ? 'No NDI signal'
            : picture.state === 'error'
              ? (picture.message ?? 'Direct NDI unavailable')
              : 'Direct NDI unavailable';
  useEffect(() => {
    const part = canvas.current;
    if (receiver === undefined || part === null) return;
    return receiver.attach(part);
  }, [receiver]);
  useEffect(() => {
    onPreviewEngineChange?.(live ? engine : undefined);
  }, [engine, live, onPreviewEngineChange]);
  useEffect(
    () => () => {
      if (receiver !== undefined) stopNdiAudio(receiver);
    },
    [receiver],
  );

  const onActionKey = (event: KeyboardEvent<HTMLButtonElement>): void => {
    if (event.key === 'Enter' || event.key === ' ') event.stopPropagation();
  };
  return (
    <span className="cg-input-picture-meter" data-direct-ndi-input="">
      <span
        ref={attach}
        className="cg-input-thumbnail cg-input-check-tile"
        data-input-thumbnail="direct"
        role="region"
        aria-label={`Direct NDI preview · ${sourceName}`}
        title={picture.state === 'error' ? caption : undefined}
      >
        <canvas
          ref={canvas}
          hidden={!live}
          className="cg-input-check-tile__picture"
          aria-hidden="true"
        />
        {!live && <span className="cg-input-check-tile__placeholder">{caption}</span>}
        {onPick !== undefined && (
          <Button
            variant="ghost"
            className="cg-direct-ndi-input-select"
            aria-label={'Select input · ' + sourceName}
            onClick={onPick}
            onKeyDown={onActionKey}
          >
            {null}
          </Button>
        )}
        <span className="cg-input-check-tile__top">
          {live && <span className="cg-input-check-tile__status">{caption}</span>}
          <span className="cg-input-check-tile__actions">
            <Button
              variant="icon"
              aria-label={`Listen to ${sourceName}`}
              aria-pressed={audible}
              disabled={!live}
              title={audible ? 'Mute input preview' : 'Listen to input preview'}
              onKeyDown={onActionKey}
              onClick={(event) => {
                event.stopPropagation();
                if (receiver !== undefined) toggleNdiAudio(receiver);
              }}
            >
              <Icon icon={audible ? Volume2 : VolumeX} size={14} />
            </Button>
          </span>
        </span>
      </span>
      <InputAudioRails
        name={sourceName}
        count={2}
        levels={levels ?? []}
        state={levels === undefined ? 'unknown' : 'measured'}
        preview
      />
    </span>
  );
}
