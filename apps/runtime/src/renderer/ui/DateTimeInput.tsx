import { useEffect, useId, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Clock } from 'lucide-react';
import { useMaskedDateTime, type MaskedInput } from '@cg/gesture';
import {
  CALENDAR_LABELS,
  CALENDAR_SYSTEMS,
  MONTH_NAMES,
  NOW_PLUS_SHORTCUTS,
  lunarHijriCalculation,
  nowPlus,
  partsOfInstant,
  writeFieldDigits,
  type CalendarSystem,
  type DateTimeParts,
  type DigitSet,
  type FieldDigits,
} from '@cg/text-shaping';
import { Button } from './Button.js';
import { Icon } from './Icon.js';
import { NumericInput } from './NumericInput.js';
import { Popover } from './Popover.js';
import { Tag } from './Tag.js';
import { useCalendarChoice } from './calendarChoice.js';
import {
  addMonths,
  dayInWords,
  lunarAdjustWords,
  lunarCalculationName,
  monthGrid,
  sameDayIn,
  segmentDigits,
  valueAt,
  type DateTimeMode,
} from './dateTimeInputModel.js';

/**
 * 🔴 `DELTA-RUN-NEXT-VERSION-01-B` §2 / `-C` §1–2, `RUN-NEXT-VERSION-03` 2.1 — **THE DATE AND TIME
 * CONTROL**, the one CG Control uses wherever an operator sets a countdown's target.
 *
 * - **One date input and one time input, masked** (the owner: six boxes were not good) —
 *   `YYYY/MM/DD` in the calendar shown and `HH:MM:SS`, 24-hour. The mask is `@cg/text-shaping`'s and
 *   the behaviour `@cg/gesture`'s `useMaskedDateTime`, shared with the Designer: digits in any set,
 *   written in the field's own (`segmentDigits`); separators the mask's; an impossible value REFUSED
 *   with its reason (month 13, the 31st of a 30-day month, 25 o'clock); typing in the middle; Up /
 *   Down step the part under the caret; a pasted date and/or time fills what it names.
 * - **A picker beside each**: the calendar icon opens the month in the calendar shown (right to left
 *   for Jalali and Lunar Hijri); the clock icon opens hours, minutes, seconds and `Now`.
 * - **Three calendars** — Jalali (the default), Gregorian, Lunar Hijri — chosen per browser
 *   (`calendarChoice`), and the same day in the OTHER two beside the field as facts.
 * - **`+1 min` · `+5 min` · `+1 h`** from now.
 * - **The stored value** is ISO with this console's offset for a date and time, `HH:mm[:ss]` for a
 *   time of day — whatever calendar is shown. Lunar Hijri reads and writes through the station's
 *   day adjustment (`lunarAdjust`), and nothing else does.
 *
 * Built only from the console's primitives (`NumericInput`, `Button`, `Popover`, `Icon`, `Tag`):
 * no raw `<input>`, no `style`. The inputs are LTR — a date is a run of numbers in a fixed order —
 * inside a surface whose own direction is inherited. No sentence explains it (the operator-surface
 * rule): labels, values, facts and a refusal.
 */
export interface DateTimeInputProps {
  /** `datetime` — date and time; `timeofday` — the time input only. */
  mode: DateTimeMode;
  /** The stored value: ISO, or `HH:mm[:ss]`; `''` shows empty inputs. */
  value: string;
  /** Receives every WHOLE, possible value the operator makes — never a half-typed one. */
  onChange: (value: string) => void;
  /** The field's own digits (`fieldDigitsOf`). */
  digits: FieldDigits;
  /** The station's Lunar Hijri day adjustment (−2 … +2). */
  lunarAdjust: number;
  /** The group's accessible name — the field's. */
  'aria-label': string;
  /** The value is staged and not yet applied: the inputs wear the dirty edge. */
  dirty?: boolean | undefined;
  /** Test seam — the clock the shortcuts, `Now` and an empty part's arrows read. */
  now?: (() => number) | undefined;
}

export function DateTimeInput({
  mode,
  value,
  onChange,
  digits,
  lunarAdjust,
  'aria-label': ariaLabel,
  dirty = false,
  now = Date.now,
}: DateTimeInputProps): JSX.Element {
  const [calendar, setCalendar] = useCalendarChoice();
  const shown = segmentDigits(digits, calendar);
  const m = useMaskedDateTime({
    mode,
    value,
    onChange,
    calendar,
    adjust: lunarAdjust,
    digits: shown,
    now,
  });
  const refusalId = useId();

  const field = (kind: 'date' | 'time', label: string, input: MaskedInput): JSX.Element => (
    <NumericInput
      className={[
        'cg-field',
        'cg-datetime__mask',
        `cg-datetime__mask--${kind}`,
        dirty ? 'is-dirty' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      digits="as-typed"
      dir="ltr"
      value={input.value}
      onValueChange={input.onText}
      onKeyDown={input.onKeyDown}
      onPaste={input.onPaste}
      placeholder={input.placeholder}
      maxLength={input.maxLength}
      spellCheck={false}
      autoComplete="off"
      aria-label={label}
      aria-describedby={m.refusal !== null ? refusalId : undefined}
      data-datetime-mask={kind}
    />
  );

  return (
    <div
      className="cg-datetime"
      role="group"
      aria-label={ariaLabel}
      data-datetime-input={mode}
      data-datetime-calendar={mode === 'datetime' ? calendar : undefined}
    >
      <div className="cg-datetime__row">
        {mode === 'datetime' && (
          <div className="cg-datetime__entry" data-datetime-date="">
            {field('date', 'Date', m.date)}
            <DatePickerButton
              calendar={calendar}
              parts={m.parts}
              lunarAdjust={lunarAdjust}
              shown={shown}
              now={now}
              onPick={m.setDate}
            />
          </div>
        )}
        <div className="cg-datetime__entry" data-datetime-time="">
          {field('time', 'Time', m.time)}
          <TimePickerButton
            parts={m.parts}
            shown={shown}
            now={now}
            calendar={calendar}
            lunarAdjust={lunarAdjust}
            onPick={m.setTime}
          />
        </div>
      </div>
      {m.refusal !== null && (
        <p className="cg-field-fact" id={refusalId} role="status" data-datetime-refusal="">
          {m.refusal}
        </p>
      )}
      <div className="cg-datetime__choices">
        {mode === 'datetime' && (
          <div className="cg-datetime__calendars" role="group" aria-label="Calendar">
            {CALENDAR_SYSTEMS.map((system) => (
              <Button
                key={system}
                variant="neutral"
                aria-pressed={calendar === system}
                data-calendar-choice={system}
                onClick={() => setCalendar(system)}
              >
                {CALENDAR_LABELS[system]}
              </Button>
            ))}
          </div>
        )}
        <div className="cg-datetime__shortcuts" role="group" aria-label="From now">
          {NOW_PLUS_SHORTCUTS.map((s) => (
            <Button
              key={s.label}
              variant="neutral"
              data-now-plus={s.label}
              onClick={() => m.setValue(valueAt(nowPlus(now(), s.ms), mode))}
            >
              {s.label}
            </Button>
          ))}
        </div>
      </div>
      {mode === 'datetime' && m.gregorian !== null && (
        <div className="cg-datetime__facts" data-datetime-facts="">
          {sameDayIn(
            m.gregorian,
            CALENDAR_SYSTEMS.filter((s) => s !== calendar),
            lunarAdjust,
          ).map(({ system, day }) => (
            <Tag
              key={system}
              className="cg-meta-chip"
              data-testid={`datetime-fact-${system}`}
              title={system === 'lunar-hijri' ? lunarTitle(lunarAdjust) : CALENDAR_LABELS[system]}
            >
              <span className="cg-meta-chip__label">{CALENDAR_LABELS[system]}</span>
              <span className="cg-meta-chip__value">
                <bdi>{dayInWords(day, system, segmentDigits(digits, system))}</bdi>
              </span>
            </Tag>
          ))}
        </div>
      )}
    </div>
  );
}

/** The long form of the Lunar Hijri fact: which calculation, and the station's adjustment. */
function lunarTitle(adjust: number): string {
  const name = `${lunarCalculationName(lunarHijriCalculation())} calculation`;
  return adjust === 0 ? name : `${name}, station adjustment ${lunarAdjustWords(adjust)}`;
}

/**
 * The calendar icon and its month grid: the month the date input holds (or this one), in the chosen
 * calendar, the week starting where that calendar's does. A Hijri grid reads right to left.
 */
function DatePickerButton({
  calendar,
  parts,
  lunarAdjust,
  shown,
  now,
  onPick,
}: {
  calendar: CalendarSystem;
  parts: Partial<DateTimeParts>;
  lunarAdjust: number;
  shown: DigitSet;
  now: () => number;
  onPick: (day: { year: number; month: number; day: number }) => void;
}): JSX.Element {
  const anchor = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const [view, setView] = useState<{ year: number; month: number } | null>(null);

  const open = (): void => {
    if (parts.year !== undefined && parts.month !== undefined) {
      setView({ year: parts.year, month: parts.month });
      return;
    }
    const today = partsOfInstant(now(), calendar, lunarAdjust);
    setView({ year: today.year, month: today.month });
  };

  return (
    <>
      <Button
        ref={anchor}
        variant="icon"
        aria-label="Pick a date"
        aria-haspopup="dialog"
        aria-expanded={view !== null}
        aria-controls={view !== null ? panelId : undefined}
        data-datetime-grid-button=""
        onClick={open}
      >
        <Icon icon={CalendarDays} />
      </Button>
      {view !== null && (
        <Popover
          anchor={anchor}
          onClose={() => setView(null)}
          id={panelId}
          aria-label="Pick a date"
          minWidth={260}
          maxHeight={360}
          initialFocusSelector="[data-grid-focus]"
        >
          <MonthGridPanel
            calendar={calendar}
            view={view}
            lunarAdjust={lunarAdjust}
            shown={shown}
            picked={parts}
            onView={setView}
            onPick={(day) => {
              onPick(day);
              setView(null);
            }}
          />
        </Popover>
      )}
    </>
  );
}

function MonthGridPanel({
  calendar,
  view,
  lunarAdjust,
  shown,
  picked,
  onView,
  onPick,
}: {
  calendar: CalendarSystem;
  view: { year: number; month: number };
  lunarAdjust: number;
  shown: DigitSet;
  picked: Partial<DateTimeParts>;
  onView: (view: { year: number; month: number }) => void;
  onPick: (day: { year: number; month: number; day: number }) => void;
}): JSX.Element {
  const grid = monthGrid(calendar, view.year, view.month, lunarAdjust);
  const rtl = calendar !== 'gregorian';
  const inMonth = picked.year === view.year && picked.month === view.month;
  const focusDay = inMonth && picked.day !== undefined && picked.day <= grid.days ? picked.day : 1;
  const n = (v: number): string => writeFieldDigits(String(v), shown);
  return (
    <div className="cg-datetime-grid" dir={rtl ? 'rtl' : 'ltr'} data-datetime-grid={calendar}>
      <div className="cg-datetime-grid__head">
        <Button
          variant="icon"
          aria-label="Previous month"
          onClick={() => onView(addMonths(view, -1))}
        >
          <Icon icon={rtl ? ChevronRight : ChevronLeft} />
        </Button>
        <span className="cg-datetime-grid__title" data-datetime-grid-title="">
          <bdi>{`${MONTH_NAMES[calendar][view.month - 1] ?? ''} ${n(view.year)}`}</bdi>
        </span>
        <Button variant="icon" aria-label="Next month" onClick={() => onView(addMonths(view, 1))}>
          <Icon icon={rtl ? ChevronLeft : ChevronRight} />
        </Button>
      </div>
      <div className="cg-datetime-grid__days" role="group" aria-label="Days">
        {grid.heads.map((h, i) => (
          <span key={`head-${String(i)}`} className="cg-datetime-grid__weekday" aria-hidden="true">
            {h}
          </span>
        ))}
        {Array.from({ length: grid.leading }, (_, i) => (
          <span key={`blank-${String(i)}`} aria-hidden="true" />
        ))}
        {Array.from({ length: grid.days }, (_, i) => {
          const day = i + 1;
          const isPicked = inMonth && picked.day === day;
          return (
            <Button
              key={day}
              variant="neutral"
              aria-pressed={isPicked}
              aria-label={dayInWords({ year: view.year, month: view.month, day }, calendar, shown)}
              data-datetime-day={String(day)}
              {...(day === focusDay ? { 'data-grid-focus': '' } : {})}
              onClick={() => onPick({ year: view.year, month: view.month, day })}
            >
              {n(day)}
            </Button>
          );
        })}
      </div>
    </div>
  );
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const SIXTY = Array.from({ length: 60 }, (_, i) => i);

/**
 * `RUN-NEXT-VERSION-03` 2.1 — the clock icon and its time picker: hours, minutes and seconds as three
 * columns (the time the input holds pressed), and `Now`. A press sets that part at once.
 */
function TimePickerButton({
  parts,
  shown,
  now,
  calendar,
  lunarAdjust,
  onPick,
}: {
  parts: Partial<DateTimeParts>;
  shown: DigitSet;
  now: () => number;
  calendar: CalendarSystem;
  lunarAdjust: number;
  onPick: (time: { hour: number; minute: number; second: number }) => void;
}): JSX.Element {
  const anchor = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const time = { hour: parts.hour ?? 0, minute: parts.minute ?? 0, second: parts.second ?? 0 };
  return (
    <>
      <Button
        ref={anchor}
        variant="icon"
        aria-label="Pick a time"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        data-datetime-clock-button=""
        onClick={() => setOpen(true)}
      >
        <Icon icon={Clock} />
      </Button>
      {open && (
        <Popover
          anchor={anchor}
          onClose={() => setOpen(false)}
          id={panelId}
          aria-label="Pick a time"
          minWidth={240}
          maxHeight={340}
          initialFocusSelector="[data-clock-focus]"
        >
          <div className="cg-datetime-clock" data-datetime-clock="">
            <div className="cg-datetime-clock__cols">
              <TimeColumn
                label="Hours"
                values={HOURS}
                picked={parts.hour}
                shown={shown}
                focus
                onPick={(hour) => onPick({ ...time, hour })}
              />
              <TimeColumn
                label="Minutes"
                values={SIXTY}
                picked={parts.minute}
                shown={shown}
                onPick={(minute) => onPick({ ...time, minute })}
              />
              <TimeColumn
                label="Seconds"
                values={SIXTY}
                picked={parts.second}
                shown={shown}
                onPick={(second) => onPick({ ...time, second })}
              />
            </div>
            <Button
              variant="neutral"
              data-datetime-clock-now=""
              onClick={() => {
                const p = partsOfInstant(now(), calendar, lunarAdjust);
                onPick({ hour: p.hour, minute: p.minute, second: p.second });
                setOpen(false);
              }}
            >
              Now
            </Button>
          </div>
        </Popover>
      )}
    </>
  );
}

function TimeColumn({
  label,
  values,
  picked,
  shown,
  focus = false,
  onPick,
}: {
  label: string;
  values: readonly number[];
  picked: number | undefined;
  shown: DigitSet;
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
  const target = picked ?? 0;
  return (
    <div className="cg-datetime-clock__col" role="group" aria-label={label} ref={column}>
      <span className="cg-datetime-clock__head" aria-hidden="true">
        {label}
      </span>
      {values.map((v) => (
        <Button
          key={v}
          variant="neutral"
          aria-pressed={picked === v}
          aria-label={`${label} ${String(v).padStart(2, '0')}`}
          data-datetime-clock-value={String(v)}
          {...(focus && v === target ? { 'data-clock-focus': '' } : {})}
          onClick={() => onPick(v)}
        >
          {writeFieldDigits(String(v).padStart(2, '0'), shown)}
        </Button>
      ))}
    </div>
  );
}
