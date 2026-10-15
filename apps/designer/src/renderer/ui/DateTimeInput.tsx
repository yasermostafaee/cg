import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
} from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  CALENDAR_LABELS,
  CALENDAR_SYSTEMS,
  clampLunarAdjust,
  daysInMonth,
  DEFAULT_CALENDAR,
  formatTimeOfDay,
  fromGregorian,
  isCalendarSystem,
  isoOfInstant,
  isoOfParts,
  LUNAR_ADJUST_MAX,
  LUNAR_ADJUST_MIN,
  MONTH_NAMES,
  NOW_PLUS_SHORTCUTS,
  nowPlus,
  parsePastedDateTime,
  parseTimeOfDay,
  partsOfInstant,
  partsOfIso,
  readSegment,
  segmentRange,
  setSegment,
  stepSegment,
  toGregorian,
  weekdayOf,
  weekStartOf,
  writeSegment,
  type CalendarSystem,
  type DateTimeParts,
  type DateTimeSegment,
  type DigitSet,
} from '@cg/text-shaping';
import { Button } from './Button.js';
import { Control } from './Control.js';
import { Icon } from './Icon.js';
import { Select } from './Select.js';
import { Tag } from './Tag.js';
import * as s from './DateTimeInput.css.js';

/**
 * 🔴 `DELTA-RUN-NEXT-VERSION-01-B` §2 / `-C` §1 — **A DATE AND TIME THAT IS EASY TO TYPE.** Replaces
 * the browser's own picker (a month calendar plus hour / minute / AM-PM columns you scroll with the
 * wheel) with typed segments: `YYYY / MM / DD` and `HH : MM : SS`, 24-hour.
 *
 * - each segment takes digits in Persian, Latin or Arabic-Indic; ↑ / ↓ step it (wrapping inside its
 *   own range); Tab moves on; pasting a whole date or time fills every segment it names;
 * - a value out of a segment's range is refused, never clamped into a different time;
 * - the calendar — Solar Hijri (the default), Gregorian or Lunar Hijri — is a per-person choice kept
 *   in this browser, and the other two calendars' dates are shown as facts so the day is never in
 *   doubt; the Lunar Hijri reading takes this browser's day adjustment (−2 … +2);
 * - a month grid behind the calendar button, for anyone who prefers to click;
 * - `+1 min`, `+5 min`, `+1 h` set the target from now.
 *
 * What is STORED never changes with the calendar shown: an ISO instant with this machine's offset
 * (`datetime`), or `HH:mm[:ss]` (`timeofday`). The rules are `@cg/text-shaping`'s, shared with CG
 * Control's own control.
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

const DATE_ORDER: readonly DateTimeSegment[] = ['year', 'month', 'day'];

export interface DateTimeInputProps {
  /** `datetime` — a full date and time; `timeofday` — the time segments only. */
  mode: 'datetime' | 'timeofday';
  /** The stored value: ISO (`datetime`) or `HH:mm[:ss]` (`timeofday`); unparseable ⇒ now. */
  value: string;
  onCommit: (value: string) => void;
  /** The group's accessible name; each segment is named after it (`… hour`). */
  ariaLabel: string;
  /** The digits the segments are written in. */
  digits?: DigitSet;
  /** `timeofday` — show the seconds segment (a stored value with seconds always shows it). */
  withSeconds?: boolean;
}

export function DateTimeInput(props: DateTimeInputProps): JSX.Element {
  const { mode, value, onCommit, ariaLabel, digits = 'latin' } = props;
  const [calendar, setCalendar] = useState<CalendarSystem>(() =>
    readStored(CALENDAR_KEY, (v) => (isCalendarSystem(v) ? v : DEFAULT_CALENDAR)),
  );
  const [adjust, setAdjust] = useState<number>(() =>
    readStored(LUNAR_ADJUST_KEY, (v) => clampLunarAdjust(v === null ? 0 : Number(v))),
  );
  const parsed = useMemo((): DateTimeParts => {
    if (mode === 'timeofday') {
      const t = parseTimeOfDay(value) ?? '00:00';
      const [h = 0, m = 0, sec = 0] = t.split(':').map(Number);
      return { year: 1, month: 1, day: 1, hour: h, minute: m, second: sec };
    }
    return partsOfIso(value, calendar, adjust) ?? partsOfInstant(Date.now(), calendar, adjust);
  }, [mode, value, calendar, adjust]);
  const seconds = mode === 'datetime' || props.withSeconds === true || parsed.second !== 0;
  const [gridOpen, setGridOpen] = useState(false);

  const commitParts = (parts: DateTimeParts): void => {
    if (mode === 'timeofday') {
      onCommit(
        formatTimeOfDay(parts.hour, parts.minute, parts.second, seconds || parts.second !== 0),
      );
      return;
    }
    const iso = isoOfParts(parts, calendar, adjust);
    if (iso !== null) onCommit(iso);
  };

  // The date and the time are two boxes on a wrapping row, so a narrow panel — or 200 % text —
  // puts the time under the date instead of pushing the segments past the panel's edge.
  const boxes: (readonly DateTimeSegment[])[] = [
    ...(mode === 'datetime' ? [DATE_ORDER] : []),
    ['hour', 'minute', ...(seconds ? (['second'] as const) : [])],
  ];

  const otherCalendars = CALENDAR_SYSTEMS.filter((c) => c !== calendar);
  const gregorian = mode === 'datetime' ? toGregorian(parsed, calendar, adjust) : null;

  return (
    <div className={s.group} role="group" aria-label={ariaLabel} data-testid="datetime-input">
      <div className={s.row}>
        {boxes.map((list) => (
          <span key={list[0]} className={`cg-field ${s.box}`}>
            {list.map((seg, i) => (
              <SegmentBox
                key={seg}
                segment={seg}
                parts={parsed}
                calendar={calendar}
                adjust={adjust}
                digits={digits}
                ariaLabel={`${ariaLabel} ${seg}`}
                separator={i === 0 ? null : DATE_ORDER.includes(seg) ? '/' : ':'}
                onParts={commitParts}
              />
            ))}
          </span>
        ))}
        {mode === 'datetime' && (
          <Control
            variant="ghost"
            size="sm"
            aria-label="Month grid"
            aria-expanded={gridOpen}
            onClick={() => setGridOpen((o) => !o)}
          >
            <Icon icon={CalendarDays} size={14} />
          </Control>
        )}
      </div>

      {mode === 'datetime' && gridOpen && (
        <MonthGrid
          parts={parsed}
          calendar={calendar}
          adjust={adjust}
          digits={digits}
          onPick={(day) => {
            commitParts({ ...parsed, ...day });
            setGridOpen(false);
          }}
        />
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
              if (mode === 'datetime') onCommit(isoOfInstant(at));
              else {
                const p = partsOfInstant(at, 'gregorian');
                onCommit(formatTimeOfDay(p.hour, p.minute, p.second, true));
              }
            }}
          >
            {sc.label}
          </Button>
        ))}
      </div>

      {gregorian !== null && (
        <div className={s.row} data-testid="datetime-other-calendars">
          {otherCalendars.map((c) => {
            const d = fromGregorian(gregorian, c, adjust);
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

/** One typed segment. A value out of range is refused (the stored one comes back), never clamped. */
function SegmentBox(props: {
  segment: DateTimeSegment;
  parts: DateTimeParts;
  calendar: CalendarSystem;
  adjust: number;
  digits: DigitSet;
  ariaLabel: string;
  separator: string | null;
  onParts: (parts: DateTimeParts) => void;
}): JSX.Element {
  const { segment, parts, calendar, adjust, digits } = props;
  const shown = writeSegment(parts[segment], segment, digits);
  const [text, setText] = useState(shown);
  const editing = useRef(false);
  useEffect(() => {
    if (!editing.current) setText(shown);
  }, [shown]);

  const commitText = (): void => {
    editing.current = false;
    const n = readSegment(text);
    const { min, max } = segmentRange(parts, segment, calendar, adjust);
    if (n === null || n < min || n > max) {
      setText(shown);
      return;
    }
    props.onParts(setSegment(parts, segment, n, calendar, adjust));
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      editing.current = false;
      props.onParts(stepSegment(parts, segment, e.key === 'ArrowUp' ? 1 : -1, calendar, adjust));
    } else if (e.key === 'Enter') {
      commitText();
    } else if (e.key === 'Escape') {
      editing.current = false;
      setText(shown);
    }
  };

  const onPaste = (e: ClipboardEvent<HTMLInputElement>): void => {
    const pasted = parsePastedDateTime(e.clipboardData.getData('text'), calendar, adjust);
    if (pasted === null) return; // a single segment's digits paste as typing
    e.preventDefault();
    editing.current = false;
    props.onParts({ ...parts, ...pasted });
  };

  return (
    <>
      {props.separator !== null && <span className={s.separator}>{props.separator}</span>}
      {/* A primitive: the raw input lives here, in renderer/ui, and nowhere in a feature. */}
      <input
        className={segment === 'year' ? s.yearSegment : s.segment}
        aria-label={props.ariaLabel}
        inputMode="numeric"
        value={text}
        onChange={(e) => {
          editing.current = true;
          setText(e.target.value);
        }}
        // The focused segment is the one whose digits are selected — typing replaces them.
        onFocus={(e) => e.currentTarget.select()}
        onBlur={commitText}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
      />
    </>
  );
}

/** The month grid behind the calendar button: the shown calendar's month, a week per row. */
function MonthGrid(props: {
  parts: DateTimeParts;
  calendar: CalendarSystem;
  adjust: number;
  digits: DigitSet;
  onPick: (day: { year: number; month: number; day: number }) => void;
}): JSX.Element {
  const { calendar, adjust, digits } = props;
  const [view, setView] = useState({ year: props.parts.year, month: props.parts.month });
  const length = daysInMonth(calendar, view.year, view.month, adjust);
  const first = toGregorian({ ...view, day: 1 }, calendar, adjust);
  const lead = first === null ? 0 : (weekdayOf(first) - weekStartOf(calendar) + 7) % 7;
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
  return (
    <div className={s.grid} data-testid="datetime-grid">
      <div className={s.gridHead}>
        <Control variant="ghost" size="sm" aria-label="Previous month" onClick={() => step(-1)}>
          <Icon icon={ChevronLeft} size={14} />
        </Control>
        <bdi>
          {MONTH_NAMES[calendar][view.month - 1]} {writeSegment(view.year, 'year', digits)}
        </bdi>
        <Control variant="ghost" size="sm" aria-label="Next month" onClick={() => step(1)}>
          <Icon icon={ChevronRight} size={14} />
        </Control>
      </div>
      {Array.from({ length: lead }, (_, i) => (
        <span key={`lead-${String(i)}`} />
      ))}
      {Array.from({ length }, (_, i) => {
        const day = i + 1;
        const chosen =
          view.year === props.parts.year &&
          view.month === props.parts.month &&
          day === props.parts.day;
        return (
          <Button
            key={day}
            variant="ghost"
            size="sm"
            selected={chosen}
            aria-pressed={chosen}
            onClick={() => props.onPick({ year: view.year, month: view.month, day })}
          >
            {writeSegment(day, 'day', digits)}
          </Button>
        );
      })}
    </div>
  );
}
