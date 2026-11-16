import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { isPlaylistOutput, type SourceAudioReading } from '@cg/shared-ipc';
import { meterPercent } from '../monitors/meterScale.js';
import { subscribeInputAudio } from './inputAudioDemand.js';
import { currentSourceCatalog, sourcesVersion, subscribeSources } from './sourceStore.js';
import './input-audio-meter.css';

const channels = ['L', 'R'] as const;

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
  useSyncExternalStore(subscribeSources, sourcesVersion);
  const source = currentSourceCatalog().sources.find((entry) => entry.id === sourceId);
  const eligible =
    source !== undefined &&
    (isPlaylistOutput(source) || (source.origin !== 'media' && source.producer.kind !== 'media'));
  const meterChannel = eligible && source.status !== 'unavailable' ? channel : undefined;
  const ref = useRef<HTMLSpanElement>(null);
  const [snapshot, setSnapshot] = useState<{ channel: number; data: SourceAudioReading }>();
  useEffect(() => {
    const element = ref.current;
    if (
      meterChannel === undefined ||
      element === null ||
      typeof IntersectionObserver === 'undefined'
    )
      return;
    let stop: (() => void) | undefined;
    let expiry: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;
    const publish = (data: SourceAudioReading | undefined): void => {
      clearTimeout(expiry);
      setSnapshot(data === undefined ? undefined : { channel: meterChannel, data });
      if (data?.state === 'measured') {
        expiry = setTimeout(() => setSnapshot(undefined), data.validForMs);
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
      clearTimeout(expiry);
    };
  }, [meterChannel, sourceId]);
  if (!eligible) return null;
  const reading =
    meterChannel !== undefined &&
    snapshot?.channel === meterChannel &&
    snapshot.data.sourceId === sourceId
      ? snapshot.data
      : undefined;
  const state = reading?.state ?? 'unknown';
  const levels = reading?.state === 'measured' ? reading.dbFs.slice(0, channels.length) : [];
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
      ref={ref}
      className="cg-input-meter"
      data-source-audio-meter={state}
      data-input-meter-orientation="vertical"
      data-input-meter-edge={edge ? '' : undefined}
      role="img"
      aria-label={`${name} · ${label}`}
      title={label}
      dir="ltr"
      style={style}
    >
      {channels.map((side, index) => {
        const level = levels[index];
        return (
          <span key={side} className="cg-input-meter__rail" data-input-meter-channel={side}>
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
