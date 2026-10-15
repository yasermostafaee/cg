import { useEffect, useState } from 'react';
import { clockWords, machineClock, sameClock, type BridgeClock } from '@cg/shared-ipc';
import {
  fieldDigitsOf,
  type AfterZero,
  type CountdownTargetField as CountdownTarget,
  type DynamicField,
  type FieldValue,
} from '@cg/shared-schema';
import { parseIsoInstant } from '@cg/text-shaping';
import { useAuthCapabilities } from '../../hooks/useAuthCapabilities.js';
import { DateTimeInput } from '../../ui/DateTimeInput.js';
import { Tag } from '../../ui/Tag.js';
import { useLunarAdjustDays } from '../calendar/calendarStore.js';

/**
 * 🔴 `DELTA-RUN-NEXT-VERSION-01-C` §2 — **A COUNTDOWN'S TARGET, SET BY THE OPERATOR.**
 *
 * One template (the countdown with its steps) is reused for many events; only the target changes,
 * per row, per day. A `text` field the import marked `countdown` (`countdownTargetFieldsOf` — the
 * template's own `clock-target` binding) is set here through the shared date and time control
 * instead of a text box, and STAGED through the Inspector's ordinary path exactly as the text box
 * stages: Update / Update on air send the row's normal `CG UPDATE` with the field value — nothing
 * new on the wire, and a row that is not on air sends nothing at all (golden rule 10).
 *
 * Two facts, in the operator's words and never as a refusal:
 *
 * - **A passed target** (date and time only — a time of day is always the next occurrence):
 *   `Target passed 12 min ago · holds at 00:00`, its tail the author's After zero (`afterZero`,
 *   designer-owned, ADR 0009 / golden rule 13). Re-read every 15 s. The Take is NEVER refused.
 * - **Two clocks**, when the machine CG Bridge runs on keeps another zone than this console:
 *   `Playout clock … · This console …`. Equal (or a bridge too old to say), nothing is shown.
 */

/** How often the passed-target fact is re-read. */
export const PAST_TARGET_REFRESH_MS = 15_000;

/** The author's After zero, as the tail of the passed-target fact. */
export const AFTER_ZERO_WORDS: Readonly<Record<AfterZero, string>> = {
  hold: 'holds at 00:00',
  'count-past': 'counts past zero',
  'hide-digits': 'digits hidden',
  close: 'will close at once',
};

/** How long ago, in the fact's words: `40 s`, `12 min`, `2 h 5 min`, `3 d 4 h`. */
export function agoWords(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${String(s)} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${String(m)} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return m % 60 === 0 ? `${String(h)} h` : `${String(h)} h ${String(m % 60)} min`;
  const d = Math.floor(h / 24);
  return h % 24 === 0 ? `${String(d)} d` : `${String(d)} d ${String(h % 24)} h`;
}

/**
 * The passed-target fact for a stored value at `nowMs`, or `null` when the target is not passed
 * (or is not a date and time at all).
 */
export function pastTargetLine(value: string, afterZero: AfterZero, nowMs: number): string | null {
  const iso = parseIsoInstant(value);
  if (iso === undefined) return null;
  const at = Date.parse(iso);
  if (Number.isNaN(at) || at > nowMs) return null;
  return `Target passed ${agoWords(nowMs - at)} ago · ${AFTER_ZERO_WORDS[afterZero]}`;
}

/** The two clocks to state, or `null` when there is nothing to say. */
export function clocksToState(
  bridge: BridgeClock | null | undefined,
  console_: BridgeClock,
): { playout: string; console: string } | null {
  if (bridge === null || bridge === undefined || sameClock(bridge, console_)) return null;
  return { playout: clockWords(bridge), console: clockWords(console_) };
}

export function CountdownTargetField({
  field,
  countdown,
  value,
  fieldId,
  dirty,
  onStage,
}: {
  field: Extract<DynamicField, { type: 'text' }>;
  countdown: CountdownTarget;
  value: FieldValue | undefined;
  fieldId: string;
  dirty: boolean;
  onStage: (next: FieldValue) => void;
}): JSX.Element {
  const lunarAdjust = useLunarAdjustDays();
  const caps = useAuthCapabilities();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (countdown.target !== 'datetime') return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), PAST_TARGET_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [countdown.target]);

  const text = typeof value === 'string' ? value : '';
  const past =
    countdown.target === 'datetime' ? pastTargetLine(text, countdown.afterZero, now) : null;
  const clocks = clocksToState(caps?.bridgeClock, machineClock());

  return (
    <>
      <DateTimeInput
        mode={countdown.target}
        value={text}
        onChange={(next) => onStage(next)}
        digits={fieldDigitsOf(field)}
        lunarAdjust={lunarAdjust}
        aria-label={fieldId}
        dirty={dirty}
      />
      {past !== null && (
        <p className="cg-field-fact" data-countdown-past="">
          {past}
        </p>
      )}
      {clocks !== null && (
        <div className="cg-datetime__facts" data-countdown-clocks="">
          <Tag className="cg-meta-chip" data-testid="playout-clock">
            <span className="cg-meta-chip__label">Playout clock</span>
            <span className="cg-meta-chip__value">
              <bdi>{clocks.playout}</bdi>
            </span>
          </Tag>
          <Tag className="cg-meta-chip" data-testid="console-clock">
            <span className="cg-meta-chip__label">This console</span>
            <span className="cg-meta-chip__value">
              <bdi>{clocks.console}</bdi>
            </span>
          </Tag>
        </div>
      )}
    </>
  );
}
