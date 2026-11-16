import { useLayoutEffect, useRef, useState } from 'react';
import { METER_FLOOR_DBFS, type PgmEngine, type PgmLoudness } from '@cg/shared-ipc';
import {
  isLimiting,
  loudnessText,
  loudnessTone,
  METER_SCALE_MARKS,
  meterClip,
  meterPercent,
} from './meterScale.js';
import { meterStore, type MeterStore } from './meterStore.js';

/**
 * The programme meter shows one bar per measured output bus and a linear dBFS scale.
 *
 * The level is written straight onto each bar's `clip-path` by the store's writer — no React state, no
 * re-render per reading (`meterStore.ts`). React only updates when the number of output buses
 * changes. The last known count remains visible at the floor when readings go stale.
 */
export function VuMeter({
  channel,
  engine = 'A',
  displayEngine,
  label,
  watchPeaks,
}: {
  channel: number | null;
  engine?: PgmEngine | null;
  displayEngine?: PgmEngine;
  label?: string;
  watchPeaks?: MeterStore['watchAudio'];
}): JSX.Element {
  const fills = useRef<(HTMLSpanElement | null)[]>([]);
  const latest = useRef<readonly number[] | null>(null);
  const countRef = useRef(2);
  const [busCount, setBusCount] = useState(2);
  useLayoutEffect(() => {
    if (countRef.current !== 2) {
      countRef.current = 2;
      setBusCount(2);
    }
    const write = (dbfs: readonly number[] | null): void => {
      latest.current = dbfs;
      if (dbfs !== null && dbfs.length > 0 && countRef.current !== dbfs.length) {
        countRef.current = dbfs.length;
        setBusCount(dbfs.length);
      }
      fills.current.forEach((el, i) => {
        if (el !== null) el.style.clipPath = meterClip(dbfs?.[i] ?? METER_FLOOR_DBFS);
      });
    };
    if (channel === null || engine === null) {
      write(null);
      return undefined;
    }
    return watchPeaks === undefined
      ? meterStore().watchAudio(channel, write, engine)
      : watchPeaks(channel, write, engine);
  }, [channel, engine, watchPeaks]);
  const source =
    channel === null || engine === null
      ? 'unavailable'
      : watchPeaks === undefined
        ? 'playout'
        : 'stereo';
  const level =
    source === 'unavailable'
      ? 'Programme level unavailable, dBFS'
      : source === 'stereo'
        ? 'Programme stereo level, dBFS'
        : 'Programme level, dBFS';
  return (
    <div
      className="cg-vu"
      data-vu-meter=""
      data-vu-engine={displayEngine ?? engine ?? undefined}
      data-vu-source={source}
      role="img"
      aria-label={label === undefined ? level : `${label}, ${level}`}
      dir="ltr"
    >
      <span className="cg-vu__unit" aria-hidden="true" title={label}>
        {displayEngine === undefined ? 'dBFS' : `${displayEngine} · dBFS`}
      </span>
      <div className="cg-vu__body">
        <div className="cg-vu__bars" tabIndex={busCount > 16 ? 0 : undefined}>
          {Array.from({ length: busCount }, (_, i) => (
            <span key={i} className="cg-vu__bar" data-vu-bar={i + 1} title={`Bus ${i + 1}`}>
              <span
                className="cg-vu__fill"
                ref={(el) => {
                  fills.current[i] = el;
                  if (el !== null)
                    el.style.clipPath = meterClip(latest.current?.[i] ?? METER_FLOOR_DBFS);
                }}
              />
            </span>
          ))}
        </div>
        <div className="cg-vu__scale" aria-hidden="true">
          {METER_SCALE_MARKS.map((db) => (
            <span
              key={db}
              className="cg-vu__mark"
              style={{ bottom: `${String(meterPercent(db))}%` }}
            >
              {db === 0 ? '0' : `−${String(Math.abs(db))}`}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * 🔴 `PLAYOUT-FEATURES-01` E (`R-076`) — **THE LOUDNESS BADGE**: the Playout's short-term loudness with one
 * decimal, in its three tones (`meterScale.ts`), pulsing while the limiter works. Written by the store's
 * writer, like the bars: text and tone go onto the element directly.
 */
export function LoudnessBadge({
  channel,
  engine = 'A',
}: {
  channel: number | null;
  engine?: PgmEngine;
}): JSX.Element {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el === null) return undefined;
    const write = (loudness: PgmLoudness | null): void => {
      const shortterm = loudness?.shortterm ?? null;
      el.textContent = loudnessText(shortterm);
      el.dataset['loudnessTone'] = loudnessTone(shortterm);
      if (isLimiting(loudness?.limiterGrDb ?? null)) el.dataset['limiting'] = '';
      else delete el.dataset['limiting'];
    };
    if (channel === null) {
      write(null);
      return undefined;
    }
    return meterStore().watchLoudness(channel, write, engine);
  }, [channel, engine]);
  return (
    <span
      ref={ref}
      className="cg-loudness"
      data-loudness-badge=""
      data-loudness-engine={engine}
      title="Short-term loudness, EBU R128 — target −23 LUFS"
    />
  );
}
