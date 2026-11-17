import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type Ref,
} from 'react';
import { isPlaylistOutput, type SourceAudioReading, type SourceDefinition } from '@cg/shared-ipc';
import { meterPercent } from '../monitors/meterScale.js';
import { subscribeInputAudio } from './inputAudioDemand.js';
import { useModalForeground } from '../../ui/modalForeground.js';
import { currentSourceCatalog, sourcesVersion, subscribeSources } from './sourceStore.js';
import './input-audio-meter.css';

const stereoLabels = ['L', 'R'] as const;

/** The same input and Playlist eligibility for a meter and its compact picture. */
export function inputAudioSource(sourceId: string): SourceDefinition | undefined {
  const source = currentSourceCatalog().sources.find((entry) => entry.id === sourceId);
  return source !== undefined &&
    (isPlaylistOutput(source) || (source.origin !== 'media' && source.producer.kind !== 'media'))
    ? source
    : undefined;
}

interface InputAudioSnapshot {
  channel: number;
  sourceId: string;
  reading: SourceAudioReading | undefined;
  count: number;
}

export function InputAudioMeter({
  sourceId,
  channel,
  name,
  edge = false,
  style,
}: {
  sourceId: string;
  channel: number | undefined;
  name: string;
  edge?: boolean;
  style?: CSSProperties;
}): JSX.Element | null {
  const foreground = useModalForeground();
  useSyncExternalStore(subscribeSources, sourcesVersion);
  const source = inputAudioSource(sourceId);
  const meterChannel =
    source !== undefined && source.status !== 'unavailable' ? channel : undefined;
  const ref = useRef<HTMLSpanElement>(null);
  const [snapshot, setSnapshot] = useState<InputAudioSnapshot>();
  useEffect(() => {
    const element = ref.current;
    if (
      !foreground ||
      meterChannel === undefined ||
      element === null ||
      typeof IntersectionObserver === 'undefined'
    )
      return;
    let stop: (() => void) | undefined;
    let expiry: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;
    const publish = (reading: SourceAudioReading | undefined): void => {
      clearTimeout(expiry);
      setSnapshot((previous) => {
        const previousCount =
          previous?.sourceId === sourceId && previous.channel === meterChannel
            ? previous.count
            : stereoLabels.length;
        return {
          channel: meterChannel,
          sourceId,
          reading,
          count: reading?.state === 'measured' ? reading.dbFs.length : previousCount,
        };
      });
      if (reading?.state === 'measured') {
        expiry = setTimeout(() => publish(undefined), reading.validForMs);
      }
    };
    const observer = new IntersectionObserver((entries) => {
      if (disposed) return;
      if (entries.at(-1)?.isIntersecting === true) {
        stop ??= subscribeInputAudio({ channel: meterChannel, sourceId, publish });
      } else if (stop !== undefined) {
        stop();
        stop = undefined;
        publish(undefined);
      }
    });
    observer.observe(element);
    return () => {
      disposed = true;
      observer.disconnect();
      stop?.();
      publish(undefined);
    };
  }, [foreground, meterChannel, sourceId]);
  if (source === undefined) return null;
  const current =
    snapshot?.channel === meterChannel && snapshot?.sourceId === sourceId ? snapshot : undefined;
  const reading = current?.reading;
  const count = current?.count ?? stereoLabels.length;
  const state = reading?.state ?? 'unknown';
  const levels = reading?.state === 'measured' ? reading.dbFs : [];
  return (
    <InputAudioRails
      elementRef={ref}
      name={name}
      state={state}
      levels={levels}
      count={count}
      edge={edge}
      style={style}
    />
  );
}

/** Vertical rails shared between a passive thumbnail and its active preview. */
export function InputAudioRails({
  elementRef,
  name,
  state,
  levels,
  count,
  edge = false,
  preview = false,
  style,
}: {
  elementRef?: Ref<HTMLSpanElement>;
  name: string;
  state: SourceAudioReading['state'] | 'unknown';
  levels: readonly number[];
  count: number;
  edge?: boolean;
  preview?: boolean;
  style?: CSSProperties | undefined;
}): JSX.Element {
  const peak = levels.length === 0 ? null : Math.max(...levels);
  const label =
    state === 'no-audio'
      ? 'No audio stream'
      : state === 'has-audio'
        ? 'Audio stream present, level unavailable'
        : peak === null
          ? 'Audio level unavailable'
          : `Audio peak ${peak.toFixed(0)} dBFS`;
  return (
    <span
      ref={elementRef}
      className="cg-input-meter"
      data-input-meter={preview ? '' : undefined}
      data-source-audio-meter={state}
      data-input-meter-orientation="vertical"
      data-input-meter-edge={edge ? '' : undefined}
      role="img"
      aria-label={`${name} · ${label}`}
      title={label}
      dir="ltr"
      style={{ ...style, '--cg-input-meter-channel-count': count } as CSSProperties}
    >
      {Array.from({ length: count }, (_, index) => {
        const side =
          (count === stereoLabels.length ? stereoLabels[index] : undefined) ?? String(index + 1);
        const level = levels[index];
        return (
          <span
            key={side}
            className="cg-input-meter__rail"
            data-input-meter-channel={side}
            title={level === undefined ? undefined : `${side}: ${level.toFixed(0)} dBFS`}
          >
            <span
              className="cg-input-meter__level"
              style={
                level === undefined
                  ? undefined
                  : {
                      clipPath: `inset(${100 - meterPercent(level)}% 0 0)`,
                    }
              }
            />
          </span>
        );
      })}
    </span>
  );
}
