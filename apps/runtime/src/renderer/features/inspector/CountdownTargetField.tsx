import { useEffect, useId, useState } from 'react';
import { masksOfValue } from '@cg/gesture';
import { clockWords, machineClock, sameClock, type BridgeClock } from '@cg/shared-ipc';
import {
  fieldDigitsOf,
  type AfterZero,
  type CountdownTargetField as CountdownTarget,
  type DynamicField,
  type FieldValue,
} from '@cg/shared-schema';
import { isEmptyMask, maskText, nowPlus, parseDurationMs, parseIsoInstant } from '@cg/text-shaping';
import { useAuthCapabilities } from '../../hooks/useAuthCapabilities.js';
import { Button } from '../../ui/Button.js';
import { DateTimeInput } from '../../ui/DateTimeInput.js';
import { Modal, ModalAction } from '../../ui/Modal.js';
import { Tag } from '../../ui/Tag.js';
import { TextInput } from '../../ui/TextInput.js';
import { useCalendarChoice } from '../../ui/calendarChoice.js';
import { segmentDigits, valueAt } from '../../ui/dateTimeInputModel.js';
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

/** Resolve a custom duration with the same clock and precision as the presets. */
function targetAfterDuration(duration: string, mode: CountdownTarget['target']): string | null {
  const ms = parseDurationMs(duration);
  if (ms === null || ms < 1000 || ms % 1000 !== 0) return null;
  if (mode === 'timeofday' && ms >= 86_400_000) return null;
  const instant = nowPlus(Date.now(), ms);
  const year = new Date(instant).getFullYear();
  return Number.isFinite(year) && year <= 9999 ? valueAt(instant, mode) : null;
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
  const [calendar] = useCalendarChoice();
  const [draft, setDraft] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [editorRevision, setEditorRevision] = useState(0);
  const [duration, setDuration] = useState('');
  const durationHintId = useId();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (countdown.target !== 'datetime') return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), PAST_TARGET_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [countdown.target]);

  const text = typeof value === 'string' ? value : '';
  const mode = countdown.target;
  const digits = fieldDigitsOf(field);
  const shown = segmentDigits(digits, calendar);
  const masks = masksOfValue(text, mode, calendar, lunarAdjust);
  const target = isEmptyMask(masks.time)
    ? 'No target'
    : [
        ...(mode === 'datetime' ? [maskText('date', masks.date, shown)] : []),
        maskText('time', masks.time, shown),
      ].join(' · ');
  const durationInvalid = duration.trim() !== '' && targetAfterDuration(duration, mode) === null;
  const addDuration = (): void => {
    const next = targetAfterDuration(duration, mode);
    if (next === null) return;
    setDraft(next);
    // Clear the visible incomplete edit even when a repeated add lands on the same second.
    setEditorRevision((revision) => revision + 1);
    setDuration('');
  };
  const past =
    countdown.target === 'datetime' ? pastTargetLine(text, countdown.afterZero, now) : null;
  const clocks = clocksToState(caps?.bridgeClock, machineClock());

  return (
    <>
      <div className="cg-datetime__row">
        <bdi dir="ltr" data-countdown-target="">
          {target}
        </bdi>
        <Button
          variant="neutral"
          aria-haspopup="dialog"
          aria-label="Edit countdown target"
          onClick={() => {
            setReady(false);
            setDuration('');
            setDraft(text);
          }}
        >
          Edit…
        </Button>
      </div>
      {draft !== null && (
        <Modal
          title="Edit countdown target"
          onClose={() => setDraft(null)}
          footer={
            <>
              <ModalAction actionRole="cancel" onClick={() => setDraft(null)}>
                Cancel
              </ModalAction>
              <ModalAction
                actionRole="primary"
                disabled={!ready || draft === text}
                onClick={() => {
                  onStage(draft);
                  setDraft(null);
                }}
              >
                Done
              </ModalAction>
            </>
          }
        >
          <div className="cg-datetime">
            <DateTimeInput
              key={editorRevision}
              mode={mode}
              value={draft}
              onChange={setDraft}
              onReadyChange={setReady}
              digits={digits}
              lunarAdjust={lunarAdjust}
              aria-label={fieldId}
              dirty={dirty || draft !== text}
            />
            <div className="cg-datetime__row" role="group" aria-label="Custom duration from now">
              <TextInput
                aria-label="Custom duration"
                aria-describedby={durationHintId}
                className="cg-datetime__mask"
                dir="ltr"
                value={duration}
                onChange={setDuration}
                placeholder="h:mm:ss"
                invalid={durationInvalid}
              />
              <Button
                variant="neutral"
                disabled={duration.trim() === '' || durationInvalid}
                onClick={addDuration}
              >
                Add time
              </Button>
            </div>
            <p className="cg-field-fact" id={durationHintId}>
              h:mm:ss, m:ss or seconds
            </p>
            {durationInvalid && (
              <p className="cg-field-fact" role="status">
                {mode === 'timeofday'
                  ? 'Enter a duration from one second to less than 24 hours.'
                  : 'Enter a positive duration in whole seconds.'}
              </p>
            )}
          </div>
        </Modal>
      )}
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
