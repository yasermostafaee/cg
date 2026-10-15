import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CalendarSettingsSchema,
  LUNAR_ADJUST_DAYS_MAX,
  LUNAR_ADJUST_DAYS_MIN,
  type CalendarSettings,
} from '@cg/shared-ipc';
import { LUNAR_ADJUST_MAX, LUNAR_ADJUST_MIN } from '@cg/text-shaping';
import { MockRuntime } from '../src/platform/MockRuntime.js';
import {
  __resetCalendarForTest,
  initCalendar,
  lunarAdjustDays,
  setLunarAdjustDays,
} from '../src/renderer/features/calendar/calendarStore.js';

/**
 * `DELTA-RUN-NEXT-VERSION-01-C` §1 — **the console's cache of the station's Lunar Hijri adjustment.**
 * CG Bridge owns it (`calendar.get` / `calendar.set` / `calendar.changed`); this pins that the cache
 * follows the pull and the pushes, moves on a set only once it is ACCEPTED, and says why when it is
 * not — and that the wire's range is the date rules' range.
 */

type Handler = (s: CalendarSettings) => void;

function fakeBridge(initial: CalendarSettings): {
  bridge: {
    calendar: {
      get: () => Promise<CalendarSettings>;
      onChanged: (h: Handler) => () => void;
    };
  };
  push: (s: CalendarSettings) => void;
} {
  let handler: Handler | null = null;
  return {
    bridge: {
      calendar: {
        get: () => Promise.resolve(initial),
        onChanged: (h) => {
          handler = h;
          return () => {
            handler = null;
          };
        },
      },
    },
    push: (s) => handler?.(s),
  };
}

const flush = async (): Promise<void> => {
  for (let i = 0; i < 4; i += 1) await Promise.resolve();
};

let set: (req: CalendarSettings) => Promise<{ ok: boolean; message?: string }> = () =>
  Promise.resolve({ ok: true });

beforeEach(() => {
  __resetCalendarForTest();
  (globalThis as unknown as { window: unknown }).window = {
    cg: { calendar: { set: (req: CalendarSettings) => set(req) } },
  };
});

afterEach(() => {
  delete (globalThis as unknown as { window?: unknown }).window;
});

describe('calendarStore', () => {
  it('0 — the calculation — until the bridge answers; then its value; then every push', async () => {
    expect(lunarAdjustDays()).toBe(0);
    const { bridge, push } = fakeBridge({ lunarAdjustDays: -1 });
    const stop = initCalendar(bridge);
    await flush();
    expect(lunarAdjustDays()).toBe(-1);
    push({ lunarAdjustDays: 2 });
    expect(lunarAdjustDays()).toBe(2);
    stop();
    push({ lunarAdjustDays: 1 });
    expect(lunarAdjustDays(), 'unsubscribed: no longer moved').toBe(2);
  });

  it('a set moves the cache only once ACCEPTED; a refusal says why and leaves it', async () => {
    set = () => Promise.resolve({ ok: true });
    expect(await setLunarAdjustDays(1)).toBeNull();
    expect(lunarAdjustDays()).toBe(1);

    set = () =>
      Promise.resolve({ ok: false, message: 'This sign-in does not allow that command.' });
    expect(await setLunarAdjustDays(-2)).toBe('This sign-in does not allow that command.');
    expect(lunarAdjustDays()).toBe(1);
  });

  it('a bridge older than the channel is named as such, not as `unknown channel`', async () => {
    set = () => Promise.reject(new Error('unknown channel: calendar.set'));
    const refusal = await setLunarAdjustDays(1);
    expect(refusal).toContain('can be read, but not changed');
    expect(refusal).not.toContain('calendar.set');
  });

  it('the wire’s range is the date rules’ range: −2 … +2, whole days', () => {
    expect([LUNAR_ADJUST_DAYS_MIN, LUNAR_ADJUST_DAYS_MAX]).toEqual([
      LUNAR_ADJUST_MIN,
      LUNAR_ADJUST_MAX,
    ]);
    expect(CalendarSettingsSchema.safeParse({ lunarAdjustDays: 3 }).success).toBe(false);
    expect(CalendarSettingsSchema.safeParse({ lunarAdjustDays: 0.5 }).success).toBe(false);
    expect(CalendarSettingsSchema.safeParse({ lunarAdjustDays: -2 }).success).toBe(true);
  });
});

describe('MockRuntime — test mode answers as CG Bridge does', () => {
  it('0 by default; a set is pushed and read back; outside the range is refused with the bridge’s words', () => {
    const mock = new MockRuntime();
    expect(mock.calendarGet()).toEqual({ lunarAdjustDays: 0 });
    const heard: CalendarSettings[] = [];
    mock.calendarChanged.subscribe((s) => heard.push(s));
    expect(mock.calendarSet({ lunarAdjustDays: 1 })).toEqual({ ok: true });
    expect(heard).toEqual([{ lunarAdjustDays: 1 }]);
    const refused = mock.calendarSet({ lunarAdjustDays: 5 });
    expect(refused.ok).toBe(false);
    expect(refused.message).toContain('−2 to +2');
    expect(heard).toHaveLength(1);
  });
});
