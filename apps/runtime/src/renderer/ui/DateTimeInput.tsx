import { useId, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  CALENDAR_LABELS,
  CALENDAR_SYSTEMS,
  MONTH_NAMES,
  NOW_PLUS_SHORTCUTS,
  SEGMENT_WIDTH,
  lunarHijriCalculation,
  nowPlus,
  partsOfInstant,
  readSegment,
  writeFieldDigits,
  type CalendarSystem,
  type DateTimeSegment,
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
  draftsOfValue,
  lunarAdjustWords,
  lunarCalculationName,
  monthGrid,
  normalizeDrafts,
  pasteDrafts,
  readDrafts,
  sameDayIn,
  segmentDigits,
  segmentsOf,
  stepDrafts,
  valueAt,
  writeDraft,
  type DateTimeMode,
  type Drafts,
} from './dateTimeInputModel.js';

/**
 * 🔴 `DELTA-RUN-NEXT-VERSION-01-B` §2 / `-C` §1–2 — **THE DATE AND TIME CONTROL**, the one CG Control
 * uses wherever an operator sets a countdown's target.
 *
 * - **Typed segments**, `YYYY / MM / DD` and `HH : MM : SS`, 24-hour. Each takes digits in any set
 *   and is written in the field's own (`segmentDigits`); Up / Down step the focused segment by one,
 *   wrapping; Tab moves to the next; a paste of a whole date and/or time fills every segment it
 *   names. A focused segment selects its text, so typing replaces it.
 * - **A month grid** behind the calendar button, for whoever prefers to click — never the only way.
 * - **Three calendars** — Solar Hijri (the default), Gregorian, Lunar Hijri — chosen per browser
 *   (`calendarChoice`), and the same day in the OTHER two beside the field as facts.
 * - **`+1 min` · `+5 min` · `+1 h`** from now.
 * - **The stored value** is ISO with this console's offset for a date and time, `HH:mm[:ss]` for a
 *   time of day — whatever calendar is shown. Lunar Hijri reads and writes through the station's
 *   day adjustment (`lunarAdjust`), and nothing else does.
 *
 * Built only from the console's primitives (`NumericInput`, `Button`, `Popover`, `Icon`, `Tag`):
 * no raw `<input>`, no `style`. The segment rows are LTR — a date is a run of numbers in a fixed
 * order — inside a surface whose own direction is inherited, so the control sits correctly in an
 * RTL layout. No sentence explains it (the operator-surface rule): labels, values and facts.
 */
export interface DateTimeInputProps {
  /** `datetime` — date and time; `timeofday` — the time segments only. */
  mode: DateTimeMode;
  /** The stored value: ISO, or `HH:mm[:ss]`; `''` shows empty segments. */
  value: string;
  /** Receives every COMPLETE, valid value the operator makes — never a half-typed one. */
  onChange: (value: string) => void;
  /** The field's own digits (`fieldDigitsOf`). */
  digits: FieldDigits;
  /** The station's Lunar Hijri day adjustment (−2 … +2). */
  lunarAdjust: number;
  /** The group's accessible name — the field's. */
  'aria-label': string;
  /** The value is staged and not yet applied: the segments wear the dirty edge. */
  dirty?: boolean | undefined;
  /** Test seam — the clock the shortcuts and an empty segment's arrows read. */
  now?: (() => number) | undefined;
}

const SEGMENT_LABEL: Readonly<Record<DateTimeSegment, string>> = {
  year: 'Year',
  month: 'Month',
  day: 'Day',
  hour: 'Hours',
  minute: 'Minutes',
  second: 'Seconds',
};

const SEGMENT_PLACEHOLDER: Readonly<Record<DateTimeSegment, string>> = {
  year: 'YYYY',
  month: 'MM',
  day: 'DD',
  hour: 'HH',
  minute: 'MM',
  second: 'SS',
};

const TIME_GAP = ':';
const DATE_GAP = '/';

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
  const segments = segmentsOf(mode);

  /*
    The drafts are the operator's TEXT; the value is what is staged. They re-seed from the value
    when it changes from OUTSIDE (a Discard, an apply, another row) or when the calendar, the
    adjustment or the digits change what the same instant looks like — never on the echo of the
    operator's own edit, which would throw away a segment still being typed.
  */
  const seedKey = `${calendar}|${String(lunarAdjust)}|${shown}|${mode}`;
  const [drafts, setDrafts] = useState<Drafts>(() =>
    draftsOfValue(value, mode, calendar, lunarAdjust, shown),
  );
  const [seen, setSeen] = useState({ value, seedKey });
  const [emitted, setEmitted] = useState<string | null>(null);
  if (seen.value !== value || seen.seedKey !== seedKey) {
    const ownEcho = seen.seedKey === seedKey && value === emitted;
    setSeen({ value, seedKey });
    if (!ownEcho) setDrafts(draftsOfValue(value, mode, calendar, lunarAdjust, shown));
  }

  const reading = readDrafts(drafts, mode, calendar, lunarAdjust);

  const commit = (next: Drafts): void => {
    setDrafts(next);
    const r = readDrafts(next, mode, calendar, lunarAdjust);
    if (r.value !== null && r.value !== value) {
      setEmitted(r.value);
      onChange(r.value);
    }
  };

  const setValue = (next: string): void => {
    setDrafts(draftsOfValue(next, mode, calendar, lunarAdjust, shown));
    if (next !== value) {
      setEmitted(next);
      onChange(next);
    }
  };

  const onSegmentKey = (seg: DateTimeSegment, e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const delta = e.key === 'ArrowUp' ? 1 : -1;
    commit(stepDrafts(drafts, seg, delta, mode, calendar, lunarAdjust, shown, now()));
  };

  const onSegmentPaste = (e: ClipboardEvent<HTMLInputElement>): void => {
    const next = pasteDrafts(
      e.clipboardData.getData('text'),
      drafts,
      mode,
      calendar,
      lunarAdjust,
      shown,
    );
    if (next === null) return;
    e.preventDefault();
    commit(next);
  };

  const segmentInput = (seg: DateTimeSegment): JSX.Element => (
    <NumericInput
      key={seg}
      className={[
        'cg-field',
        'cg-datetime__seg',
        SEGMENT_WIDTH[seg] === 4 ? 'cg-datetime__seg--year' : '',
        dirty ? 'is-dirty' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      digits="as-typed"
      value={drafts[seg]}
      onValueChange={(raw) => commit({ ...drafts, [seg]: writeDraft(raw, seg, shown) })}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={() => commit(normalizeDrafts(drafts, mode, calendar, lunarAdjust, shown))}
      onKeyDown={(e) => onSegmentKey(seg, e)}
      onPaste={onSegmentPaste}
      maxLength={SEGMENT_WIDTH[seg]}
      placeholder={SEGMENT_PLACEHOLDER[seg]}
      aria-label={SEGMENT_LABEL[seg]}
      aria-invalid={reading.invalid.has(seg) ? true : undefined}
      data-datetime-segment={seg}
    />
  );

  const run = (segs: readonly DateTimeSegment[], gap: string): JSX.Element[] =>
    segs.flatMap((seg, i) =>
      i === 0
        ? [segmentInput(seg)]
        : [
            <span key={`${seg}-gap`} className="cg-datetime__gap" aria-hidden="true">
              {gap}
            </span>,
            segmentInput(seg),
          ],
    );

  const dateSegs = segments.filter((s) => s === 'year' || s === 'month' || s === 'day');
  const timeSegs = segments.filter((s) => s === 'hour' || s === 'minute' || s === 'second');

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
          <div className="cg-datetime__run" dir="ltr" data-datetime-date="">
            {run(dateSegs, DATE_GAP)}
          </div>
        )}
        <div className="cg-datetime__run" dir="ltr" data-datetime-time="">
          {run(timeSegs, TIME_GAP)}
        </div>
        {mode === 'datetime' && (
          <MonthGridButton
            calendar={calendar}
            drafts={drafts}
            lunarAdjust={lunarAdjust}
            shown={shown}
            now={now}
            onPick={(day) =>
              commit({
                ...drafts,
                year: writeDraft(String(day.year), 'year', shown),
                month: writeDraft(String(day.month).padStart(2, '0'), 'month', shown),
                day: writeDraft(String(day.day).padStart(2, '0'), 'day', shown),
              })
            }
          />
        )}
      </div>
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
              onClick={() => setValue(valueAt(nowPlus(now(), s.ms), mode))}
            >
              {s.label}
            </Button>
          ))}
        </div>
      </div>
      {mode === 'datetime' && reading.gregorian !== null && (
        <div className="cg-datetime__facts" data-datetime-facts="">
          {sameDayIn(
            reading.gregorian,
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
 * The calendar button and its month grid: the month the drafts hold (or this one), in the chosen
 * calendar, the week starting where that calendar's does. A Hijri grid reads right to left.
 */
function MonthGridButton({
  calendar,
  drafts,
  lunarAdjust,
  shown,
  now,
  onPick,
}: {
  calendar: CalendarSystem;
  drafts: Drafts;
  lunarAdjust: number;
  shown: ReturnType<typeof segmentDigits>;
  now: () => number;
  onPick: (day: { year: number; month: number; day: number }) => void;
}): JSX.Element {
  const anchor = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const [view, setView] = useState<{ year: number; month: number } | null>(null);

  const open = (): void => {
    const year = readSegment(drafts.year);
    const month = readSegment(drafts.month);
    if (year !== null && month !== null && month >= 1 && month <= 12) {
      setView({ year, month });
      return;
    }
    const today = partsOfInstant(now(), calendar, lunarAdjust);
    setView({ year: today.year, month: today.month });
  };

  const picked = {
    year: readSegment(drafts.year),
    month: readSegment(drafts.month),
    day: readSegment(drafts.day),
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
            picked={picked}
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
  shown: ReturnType<typeof segmentDigits>;
  picked: { year: number | null; month: number | null; day: number | null };
  onView: (view: { year: number; month: number }) => void;
  onPick: (day: { year: number; month: number; day: number }) => void;
}): JSX.Element {
  const grid = monthGrid(calendar, view.year, view.month, lunarAdjust);
  const rtl = calendar !== 'gregorian';
  const inMonth = picked.year === view.year && picked.month === view.month;
  const focusDay = inMonth && picked.day !== null && picked.day <= grid.days ? picked.day : 1;
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
