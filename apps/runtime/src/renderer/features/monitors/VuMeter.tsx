import { useLayoutEffect, useRef } from 'react';
import { METER_FLOOR_DBFS, type PgmLoudness } from '@cg/shared-ipc';
import {
  isLimiting,
  loudnessText,
  loudnessTone,
  METER_BARS,
  METER_SCALE_MARKS,
  meterClip,
  meterPercent,
} from './meterScale.js';
import { meterStore } from './meterStore.js';

/**
 * 🔴 `PLAYOUT-FEATURES-01` E (`R-076`) — **THE PROGRAMME METER, BESIDE THE PROGRAM MONITOR**: eight bars (the
 * first eight buses, as the Playout's own screen draws them) and a linear dBFS scale.
 *
 * The level is written straight onto each bar's `clip-path` by the store's writer — no React state, no
 * re-render per reading (`meterStore.ts`). The gradient is fixed in CSS; the clip reveals it from the
 * bottom. The bars run left to right whatever the page's direction (bus 1 is always the left one).
 *
 * ⚠ Where the PROGRAM panel is too narrow for eight beside a full-height picture — never at the desktop's
 * smallest window (1100 × 700, measured), only in a narrower browser — a container query in `controls.css`
 * shows the first TWO (the programme's left and right) and hides the rest.
 */
export function VuMeter({ channel }: { channel: number | null }): JSX.Element {
  const fills = useRef<(HTMLSpanElement | null)[]>([]);
  useLayoutEffect(() => {
    const write = (dbfs: readonly number[] | null): void => {
      fills.current.forEach((el, i) => {
        if (el !== null) el.style.clipPath = meterClip(dbfs?.[i] ?? METER_FLOOR_DBFS);
      });
    };
    if (channel === null) {
      write(null);
      return undefined;
    }
    return meterStore().watchAudio(channel, write);
  }, [channel]);
  return (
    <div className="cg-vu" data-vu-meter="" role="img" aria-label="Programme level, dBFS" dir="ltr">
      <span className="cg-vu__unit" aria-hidden="true">
        dBFS
      </span>
      <div className="cg-vu__body">
        <div className="cg-vu__bars">
          {Array.from({ length: METER_BARS }, (_, i) => (
            <span key={i} className="cg-vu__bar" data-vu-bar={i + 1}>
              <span
                className="cg-vu__fill"
                ref={(el) => {
                  fills.current[i] = el;
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
export function LoudnessBadge({ channel }: { channel: number | null }): JSX.Element {
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
    return meterStore().watchLoudness(channel, write);
  }, [channel]);
  return (
    <span
      ref={ref}
      className="cg-loudness"
      data-loudness-badge=""
      title="Short-term loudness, EBU R128 — target −23 LUFS"
    />
  );
}
