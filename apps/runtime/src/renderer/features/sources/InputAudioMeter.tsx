import { useEffect, useRef, useState } from 'react';
import type { SourceAudioReading } from '@cg/shared-ipc';
import { meterPercent } from '../monitors/meterScale.js';
import { subscribeInputAudio } from './inputAudioDemand.js';
import './input-audio-meter.css';

export function InputAudioMeter({
  sourceId,
  channel,
  name,
  hasAudio,
}: {
  sourceId: string;
  channel: number | undefined;
  name: string;
  hasAudio?: boolean | undefined;
}): JSX.Element {
  const ref = useRef<HTMLSpanElement>(null);
  const [snapshot, setSnapshot] = useState<{ channel: number; data: SourceAudioReading }>();
  useEffect(() => {
    const element = ref.current;
    if (
      hasAudio === false ||
      channel === undefined ||
      element === null ||
      typeof IntersectionObserver === 'undefined'
    )
      return;
    let stop: (() => void) | undefined;
    let expiry: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;
    const publish = (data: SourceAudioReading | undefined): void => {
      clearTimeout(expiry);
      setSnapshot(data === undefined ? undefined : { channel, data });
      if (data?.state === 'measured') {
        expiry = setTimeout(() => setSnapshot(undefined), data.validForMs);
      }
    };
    const observer = new IntersectionObserver((entries) => {
      if (disposed) return;
      if (entries.at(-1)?.isIntersecting === true) {
        stop ??= subscribeInputAudio({ channel, sourceId, publish });
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
  }, [channel, sourceId, hasAudio]);
  const reading =
    hasAudio !== false && snapshot?.channel === channel && snapshot?.data.sourceId === sourceId
      ? snapshot.data
      : undefined;
  const fact = hasAudio === undefined ? 'unknown' : hasAudio ? 'has-audio' : 'no-audio';
  const state = reading?.state === undefined || reading.state === 'unknown' ? fact : reading.state;
  const peak = reading?.state === 'measured' ? Math.max(...reading.dbFs) : null;
  const level = peak !== null && Number.isFinite(peak) ? peak : null;
  const label =
    state === 'no-audio'
      ? 'No audio stream'
      : state === 'has-audio'
        ? 'Audio stream present, level unavailable'
        : level === null
          ? 'Audio level unavailable'
          : `Audio peak ${level.toFixed(0)} dBFS`;
  return (
    <span
      ref={ref}
      className="cg-input-meter"
      data-source-audio-meter={state}
      role="img"
      aria-label={`${name} · ${label}`}
      title={label}
      dir="ltr"
    >
      <span
        className="cg-input-meter__level"
        style={
          level === null ? undefined : { clipPath: `inset(0 ${100 - meterPercent(level)}% 0 0)` }
        }
      />
    </span>
  );
}
