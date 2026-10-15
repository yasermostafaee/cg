import {
  LUNAR_ADJUST_MAX,
  LUNAR_ADJUST_MIN,
  fromGregorian,
  lunarHijriCalculation,
} from '@cg/text-shaping';
import { useHoldsStationAdmin } from '../../hooks/useCanOperate.js';
import { Button } from '../../ui/Button.js';
import type { ModalMessage } from '../../ui/Modal.js';
import { Tag } from '../../ui/Tag.js';
import { dayInWords, lunarAdjustWords, lunarCalculationName } from '../../ui/dateTimeInputModel.js';
import { setLunarAdjustDays, useLunarAdjustDays } from './calendarStore.js';

/**
 * `DELTA-RUN-NEXT-VERSION-01-C` §1 — **STATION SETUP · CALENDAR: the Lunar Hijri day adjustment.**
 *
 * The officially announced lunar date in Iran can differ from any calculation by a day, so the
 * station chooses a whole-day adjustment, −2 … +2, applied to the display and entry of Lunar Hijri
 * dates only (CG Control's date and time control reads it). It is `calendar.set`, a `station-admin`
 * route, and it saves as it is pressed. For anyone else it is the value IN FORCE, as a fact — no
 * control at all (golden rule 13's door: absent, never offered-then-refused).
 *
 * Two facts stand beside it: which calculation this engine uses, and today's Lunar Hijri date as
 * the adjustment reads it — so the admin sees the result of the press, not a number.
 */

const CHOICES: readonly number[] = Array.from(
  { length: LUNAR_ADJUST_MAX - LUNAR_ADJUST_MIN + 1 },
  (_, i) => LUNAR_ADJUST_MIN + i,
);

export function CalendarSection({
  report,
  now = Date.now,
}: {
  report: (message: ModalMessage | null) => void;
  /** Test seam — the clock the "today" fact reads. */
  now?: () => number;
}): JSX.Element {
  const days = useLunarAdjustDays();
  const admin = useHoldsStationAdmin();
  const d = new Date(now());
  const today = fromGregorian(
    { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() },
    'lunar-hijri',
    days,
  );

  const choose = (next: number): void => {
    void setLunarAdjustDays(next).then((refusal) =>
      report(refusal === null ? null : { role: 'refusal', text: refusal }),
    );
  };

  return (
    <section className="cg-card" aria-label="Lunar Hijri day" data-calendar-section="">
      <div className="cg-card__head">
        <span className="cg-card__title">Lunar Hijri day</span>
      </div>
      <div className="cg-card__body cg-calendar-body">
        {admin ? (
          <div className="cg-lunar-adjust" role="group" aria-label="Lunar Hijri day adjustment">
            {CHOICES.map((choice) => (
              <Button
                key={choice}
                variant="neutral"
                aria-pressed={choice === days}
                data-lunar-adjust={String(choice)}
                onClick={() => choose(choice)}
              >
                {lunarAdjustWords(choice)}
              </Button>
            ))}
          </div>
        ) : (
          <Tag className="cg-meta-chip" data-testid="lunar-adjust-fact">
            <span className="cg-meta-chip__label">Adjustment</span>
            <span className="cg-meta-chip__value">{lunarAdjustWords(days)}</span>
          </Tag>
        )}
        <div className="cg-calendar-facts">
          <Tag className="cg-meta-chip" data-testid="lunar-calculation">
            <span className="cg-meta-chip__label">Calculation</span>
            <span className="cg-meta-chip__value">
              {lunarCalculationName(lunarHijriCalculation())}
            </span>
          </Tag>
          <Tag className="cg-meta-chip" data-testid="lunar-today">
            <span className="cg-meta-chip__label">Today</span>
            <span className="cg-meta-chip__value">
              <bdi>{dayInWords(today, 'lunar-hijri', 'persian')}</bdi>
            </span>
          </Tag>
        </div>
      </div>
    </section>
  );
}
