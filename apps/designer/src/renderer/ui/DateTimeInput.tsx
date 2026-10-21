import { useEffect, useId, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Clock } from 'lucide-react';
import { useMaskedDateTime, type MaskedInput } from '@cg/gesture';
import {
  CALENDAR_LABELS,
  CALENDAR_SYSTEMS,
  clampLunarAdjust,
  DEFAULT_CALENDAR,
  fromGregorian,
  isCalendarSystem,
  isoOfInstant,
  LUNAR_ADJUST_MAX,
  LUNAR_ADJUST_MIN,
  MONTH_NAMES,
  NOW_PLUS_SHORTCUTS,
  nowPlus,
  partsOfInstant,
  pickerMonth,
  weekStartOf,
  writeSegment,
  formatTimeOfDay,
  type CalendarSystem,
  type DateTimeParts,
  type DigitSet,
} from '@cg/text-shaping';
import { Button } from './Button.js';
import { Control } from './Control.js';
import { Icon } from './Icon.js';
import { Popover } from './Popover.js';
import { Select } from './Select.js';
import { Tag } from './Tag.js';
import * as s from './DateTimeInput.css.js';

/**
 * 🔴 `DELTA-RUN-NEXT-VERSION-01-B` §2 / `-C` §1, `RUN-NEXT-VERSION-03` 2.1 — **A DATE AND TIME THAT IS
 * EASY TO TYPE**, the same control CG Control's operators use:
 *
 * - **one date input and one time input, masked** — `YYYY/MM/DD` in the calendar shown and
 *   `HH:MM:SS`, 24-hour (`@cg/text-shaping`'s mask, `@cg/gesture`'s `useMaskedDateTime`): digits in
 *   Persian, Latin or Arabic-Indic, written in the field's own; separators the mask's; an impossible
 *   value REFUSED with its reason, never clamped into a different time; typing in the middle; ↑ / ↓
 *   step the part under the caret; a pasted date or time fills what it names;
 * - **a picker beside each** — the month in the calendar shown (right to left for Jalali and Lunar
 *   Hijri), and hours / minutes / seconds with `Now` — in the Designer's anchored panel (`Popover`);
 * - the calendar — Jalali (the default), Gregorian or Lunar Hijri — is a per-person choice kept in this
 *   browser, and the other two calendars' dates are shown as facts so the day is never in doubt; the
 *   Lunar Hijri reading takes this browser's day adjustment (−2 … +2);
 * - `+1 min`, `+5 min`, `+1 h` set the target from now.
 *
 * What is STORED never changes with the calendar shown: an ISO instant with this machine's offset
 * (`datetime`), or `HH:mm[:ss]` (`timeofday`).
 */

const CALENDAR_KEY = 'cg.designer.calendar.v1';
const LUNAR_ADJUST_KEY = 'cg.designer.lunarAdjust.v1';

function readStored<T>(key: string, parse: (v: string | null) => T): T {
  try {
    return parse(window.localStorage.getItem(key));
  } catch {
    return parse(null);
  }
}
function writeStored(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* a private window or blocked storage: the choice lasts this session only */
  }
}

export interface DateTimeInputProps {
  /** `datetime` — a full date and time; `timeofday` — the time input only. */
  mode: 'datetime' | 'timeofday';
  /** The stored value: ISO (`datetime`) or `HH:mm[:ss]` (`timeofday`). */
  value: string;
  onCommit: (value: string) => void;
  /** The group's accessible name; each input is named after it (`… date`, `… time`). */
  ariaLabel: string;
  /** The digits the inputs are written in. */
  digits?: DigitSet;
}

export function DateTimeInput(props: DateTimeInputProps): JSX.Element {
  const { mode, value, onCommit, ariaLabel, digits = 'latin' } = props;
  const [calendar, setCalendar] = useState<CalendarSystem>(() =>
    readStored(CALENDAR_KEY, (v) => (isCalendarSystem(v) ? v : DEFAULT_CALENDAR)),
  );
  const [adjust, setAdjust] = useState<number>(() =>
    readStored(LUNAR_ADJUST_KEY, (v) => clampLunarAdjust(v === null ? 0 : Number(v))),
  );
  const m = useMaskedDateTime({ mode, value, onChange: onCommit, calendar, adjust, digits });
  const refusalId = useId();
  const dateAnchor = useRef<HTMLButtonElement>(null);
  const timeAnchor = useRef<HTMLButtonElement>(null);
  const [picker, setPicker] = useState<'date' | 'time' | null>(null);

  const field = (kind: 'date' | 'time', input: MaskedInput): JSX.Element => (
    <span className={`cg-field ${s.box}`}>
      {/* A primitive: the raw input lives here, in renderer/ui, and nowhere in a feature. */}
      <input
        className={kind === 'date' ? s.dateMask : s.timeMask}
        aria-label={`${ariaLabel} ${kind}`}
        aria-describedby={m.refusal !== null ? refusalId : undefined}
        inputMode="numeric"
        dir="ltr"
        spellCheck={false}
        autoComplete="off"
        data-datetime-mask={kind}
        value={input.value}
        placeholder={input.placeholder}
        maxLength={input.maxLength}
        onKeyDown={input.onKeyDown}
        onPaste={input.onPaste}
        onChange={(e) => input.onText(e.target.value)}
      />
    </span>
  );

  const otherCalendars = CALENDAR_SYSTEMS.filter((c) => c !== calendar);

  return (
    <div className={s.group} role="group" aria-label={ariaLabel} data-testid="datetime-input">
      <div className={s.row}>
        {mode === 'datetime' && (
          <span className={s.entry}>
            {field('date', m.date)}
            <Control
              ref={dateAnchor}
              variant="ghost"
              size="sm"
              aria-label="Pick a date"
              title="Pick a date"
              aria-haspopup="dialog"
              aria-expanded={picker === 'date'}
              onClick={() => setPicker((p) => (p === 'date' ? null : 'date'))}
            >
              <Icon icon={CalendarDays} size={14} />
            </Control>
          </span>
        )}
        <span className={s.entry}>
          {field('time', m.time)}
          <Control
            ref={timeAnchor}
            variant="ghost"
            size="sm"
            aria-label="Pick a time"
            title="Pick a time"
            aria-haspopup="dialog"
            aria-expanded={picker === 'time'}
            onClick={() => setPicker((p) => (p === 'time' ? null : 'time'))}
          >
            <Icon icon={Clock} size={14} />
          </Control>
        </span>
      </div>

      {m.refusal !== null && (
        <p className={s.refusal} id={refusalId} role="status" data-datetime-refusal="">
          {m.refusal}
        </p>
      )}

      {picker === 'date' && (
        <Popover
          anchor={dateAnchor}
          onClose={() => setPicker(null)}
          aria-label="Pick a date"
          dir={calendar === 'gregorian' ? 'ltr' : 'rtl'}
          initialFocusSelector="[data-grid-focus]"
        >
          <MonthGrid
            parts={m.parts}
            calendar={calendar}
            adjust={adjust}
            digits={digits}
            onPick={(day) => {
              m.setDate(day);
              setPicker(null);
            }}
          />
        </Popover>
      )}
      {picker === 'time' && (
        <Popover
          anchor={timeAnchor}
          onClose={() => setPicker(null)}
          aria-label="Pick a time"
          initialFocusSelector="[data-clock-focus]"
        >
          <TimePicker
            parts={m.parts}
            digits={digits}
            onPick={m.setTime}
            onNow={() => {
              const p = partsOfInstant(Date.now(), calendar, adjust);
              m.setTime({ hour: p.hour, minute: p.minute, second: p.second });
              setPicker(null);
            }}
          />
        </Popover>
      )}

      <div className={s.row}>
        {mode === 'datetime' && (
          <Select
            aria-label="Calendar"
            data-testid="datetime-calendar"
            value={calendar}
            onChange={(e) => {
              const next = e.target.value;
              if (!isCalendarSystem(next)) return;
              setCalendar(next);
              writeStored(CALENDAR_KEY, next);
            }}
          >
            {CALENDAR_SYSTEMS.map((c) => (
              <option key={c} value={c}>
                {CALENDAR_LABELS[c]}
              </option>
            ))}
          </Select>
        )}
        {mode === 'datetime' && calendar === 'lunar-hijri' && (
          <Select
            aria-label="Lunar day adjustment"
            data-testid="datetime-lunar-adjust"
            value={String(adjust)}
            onChange={(e) => {
              const next = clampLunarAdjust(Number(e.target.value));
              setAdjust(next);
              writeStored(LUNAR_ADJUST_KEY, String(next));
            }}
          >
            {Array.from({ length: LUNAR_ADJUST_MAX - LUNAR_ADJUST_MIN + 1 }, (_, k) => {
              const d = LUNAR_ADJUST_MIN + k;
              return (
                <option key={d} value={String(d)}>
                  {d > 0 ? `+${String(d)}` : String(d)} d
                </option>
              );
            })}
          </Select>
        )}
        {NOW_PLUS_SHORTCUTS.map((sc) => (
          <Button
            key={sc.label}
            variant="ghost"
            size="sm"
            onClick={() => {
              const at = nowPlus(Date.now(), sc.ms);
              if (mode === 'datetime') m.setValue(isoOfInstant(at));
              else {
                const p = partsOfInstant(at, 'gregorian');
                m.setValue(formatTimeOfDay(p.hour, p.minute, p.second, true));
              }
            }}
          >
            {sc.label}
          </Button>
        ))}
      </div>

      {m.gregorian !== null && (
        <div className={s.row} data-testid="datetime-other-calendars">
          {otherCalendars.map((c) => {
            const d = fromGregorian(m.gregorian ?? { year: 1, month: 1, day: 1 }, c, adjust);
            const text = `${writeSegment(d.year, 'year', digits)}/${writeSegment(d.month, 'month', digits)}/${writeSegment(d.day, 'day', digits)}`;
            return (
              <Tag key={c} title={CALENDAR_LABELS[c]} data-testid={`datetime-fact-${c}`}>
                <bdi>{text}</bdi> {CALENDAR_LABELS[c]}
              </Tag>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Short weekday heads, by weekday (0 = Sunday). */
const WEEKDAY_HEADS: Readonly<Record<'fa' | 'en', readonly string[]>> = {
  fa: ['ی', 'د', 'س', 'چ', 'پ', 'ج', 'ش'],
  en: ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'],
};

/**
 * The month grid in the date picker: the shown calendar's month, a week per row, starting where that
 * calendar's week does (`pickerMonth` — one conversion per month, `RUN-NEXT-VERSION-03` 2.2).
 */
function MonthGrid(props: {
  parts: Partial<DateTimeParts>;
  calendar: CalendarSystem;
  adjust: number;
  digits: DigitSet;
  onPick: (day: { year: number; month: number; day: number }) => void;
}): JSX.Element {
  const { calendar, adjust, digits, parts } = props;
  const [view, setView] = useState(() => {
    if (parts.year !== undefined && parts.month !== undefined) {
      return { year: parts.year, month: parts.month };
    }
    const today = partsOfInstant(Date.now(), calendar, adjust);
    return { year: today.year, month: today.month };
  });
  const start = weekStartOf(calendar);
  const { days, leading } = pickerMonth(calendar, view.year, view.month, adjust, start);
  const heads = WEEKDAY_HEADS[calendar === 'gregorian' ? 'en' : 'fa'];
  const rtl = calendar !== 'gregorian';
  const step = (by: 1 | -1): void => {
    const m = view.month + by;
    setView(
      m < 1
        ? { year: view.year - 1, month: 12 }
        : m > 12
          ? { year: view.year + 1, month: 1 }
          : { ...view, month: m },
    );
  };
  const inMonth = view.year === parts.year && view.month === parts.month;
  const focusDay = inMonth && parts.day !== undefined && parts.day <= days ? parts.day : 1;
  return (
    <div className={s.grid} data-testid="datetime-grid" data-datetime-grid={calendar}>
      <div className={s.gridHead}>
        <Control variant="ghost" size="sm" aria-label="Previous month" onClick={() => step(-1)}>
          <Icon icon={rtl ? ChevronRight : ChevronLeft} size={14} />
        </Control>
        <bdi>
          {MONTH_NAMES[calendar][view.month - 1]} {writeSegment(view.year, 'year', digits)}
        </bdi>
        <Control variant="ghost" size="sm" aria-label="Next month" onClick={() => step(1)}>
          <Icon icon={rtl ? ChevronLeft : ChevronRight} size={14} />
        </Control>
      </div>
      {Array.from({ length: 7 }, (_, i) => (
        <span key={`head-${String(i)}`} className={s.weekday} aria-hidden="true">
          {heads[(start + i) % 7]}
        </span>
      ))}
      {Array.from({ length: leading }, (_, i) => (
        <span key={`lead-${String(i)}`} />
      ))}
      {Array.from({ length: days }, (_, i) => {
        const day = i + 1;
        const chosen = inMonth && day === parts.day;
        return (
          <Button
            key={day}
            variant="ghost"
            size="sm"
            selected={chosen}
            aria-pressed={chosen}
            data-datetime-day={String(day)}
            {...(day === focusDay ? { 'data-grid-focus': '' } : {})}
            onClick={() => props.onPick({ year: view.year, month: view.month, day })}
          >
            {writeSegment(day, 'day', digits)}
          </Button>
        );
      })}
    </div>
  );
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const SIXTY = Array.from({ length: 60 }, (_, i) => i);

/** `RUN-NEXT-VERSION-03` 2.1 — the time picker: hours, minutes and seconds, the time held pressed; `Now`. */
function TimePicker(props: {
  parts: Partial<DateTimeParts>;
  digits: DigitSet;
  onPick: (time: { hour: number; minute: number; second: number }) => void;
  onNow: () => void;
}): JSX.Element {
  const time = {
    hour: props.parts.hour ?? 0,
    minute: props.parts.minute ?? 0,
    second: props.parts.second ?? 0,
  };
  return (
    <div className={s.clock} data-datetime-clock="">
      <div className={s.clockCols}>
        <TimeColumn
          label="Hours"
          values={HOURS}
          picked={props.parts.hour}
          digits={props.digits}
          focus
          onPick={(hour) => props.onPick({ ...time, hour })}
        />
        <TimeColumn
          label="Minutes"
          values={SIXTY}
          picked={props.parts.minute}
          digits={props.digits}
          onPick={(minute) => props.onPick({ ...time, minute })}
        />
        <TimeColumn
          label="Seconds"
          values={SIXTY}
          picked={props.parts.second}
          digits={props.digits}
          onPick={(second) => props.onPick({ ...time, second })}
        />
      </div>
      <Button variant="secondary" size="sm" data-datetime-clock-now="" onClick={props.onNow}>
        Now
      </Button>
    </div>
  );
}

function TimeColumn(props: {
  label: string;
  values: readonly number[];
  picked: number | undefined;
  digits: DigitSet;
  focus?: boolean;
  onPick: (value: number) => void;
}): JSX.Element {
  const column = useRef<HTMLDivElement>(null);
  // The picked value is in view when the panel opens.
  useEffect(() => {
    const el = column.current?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (el !== null && el !== undefined && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'center' });
    }
  }, []);
  const target = props.picked ?? 0;
  return (
    <div className={s.clockCol} role="group" aria-label={props.label} ref={column}>
      <span className={s.clockHead} aria-hidden="true">
        {props.label}
      </span>
      {props.values.map((v) => (
        <Button
          key={v}
          variant="ghost"
          size="sm"
          selected={props.picked === v}
          aria-pressed={props.picked === v}
          aria-label={`${props.label} ${String(v).padStart(2, '0')}`}
          {...(props.focus === true && v === target ? { 'data-clock-focus': '' } : {})}
          onClick={() => props.onPick(v)}
        >
          {writeSegment(v, 'hour', props.digits)}
        </Button>
      ))}
    </div>
  );
}
