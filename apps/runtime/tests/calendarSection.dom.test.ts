// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { signedInStub } from './support/authStub.js';
import { clearPortals } from './support/dialog.js';
import {
  renderStationSetup,
  sectionOf,
  stationSetupStub,
  unmountStationSetup,
  type StationSetupStubOptions,
} from './support/stationSetup.js';
import {
  __resetCalendarForTest,
  lunarAdjustDays,
} from '../src/renderer/features/calendar/calendarStore.js';

/**
 * `DELTA-RUN-NEXT-VERSION-01-C` §1 — **STATION SETUP · CALENDAR: the Lunar Hijri day adjustment.**
 *
 * A station-admin chooses −2 … +2 and it is sent as `calendar.set` on the press (the delimiter
 * list's contract: saves as you go), and the cache moves only on the bridge's yes. Anyone else
 * reads the value as a FACT — no chips at all (golden rule 13: absent, never offered-then-refused).
 * Beside it, as facts: the calculation in use and today's Lunar Hijri date.
 */

afterEach(async () => {
  await unmountStationSetup();
  clearPortals();
  vi.restoreAllMocks();
});

beforeEach(() => {
  __resetCalendarForTest();
});

const OPERATOR = signedInStub('علی رضایی', [1], ['operator', 'viewer']);
const ADMIN = signedInStub('زهرا موسوی', [1], ['station-admin', 'operator', 'viewer']);

async function open(options: StationSetupStubOptions): Promise<{
  pane: HTMLElement;
  calendarSet: ReturnType<typeof stationSetupStub>['calendarSet'];
}> {
  const stub = stationSetupStub(options);
  const dialog = await renderStationSetup({ section: 'calendar' });
  return { pane: sectionOf(dialog, 'calendar'), calendarSet: stub.calendarSet };
}

const chip = (pane: HTMLElement, days: number): HTMLButtonElement | null =>
  pane.querySelector<HTMLButtonElement>(`[data-lunar-adjust="${String(days)}"]`);

describe('Station setup · Calendar', () => {
  it('a station-admin sees −2 … +2, “As calculated” pressed; a press sends calendar.set and moves only on the yes', async () => {
    const { pane, calendarSet } = await open({ auth: ADMIN });
    expect([...pane.querySelectorAll('[data-lunar-adjust]')].map((b) => b.textContent)).toEqual([
      '−2 days',
      '−1 day',
      'As calculated',
      '+1 day',
      '+2 days',
    ]);
    expect(chip(pane, 0)?.getAttribute('aria-pressed')).toBe('true');

    await act(async () => {
      chip(pane, 1)?.click();
      for (let i = 0; i < 4; i += 1) await Promise.resolve();
    });
    expect(calendarSet).toHaveBeenCalledWith({ lunarAdjustDays: 1 });
    expect(lunarAdjustDays()).toBe(1);
    expect(chip(pane, 1)?.getAttribute('aria-pressed')).toBe('true');
  });

  it('a refused press leaves the value where it was', async () => {
    const { pane } = await open({
      auth: ADMIN,
      calendarSetResult: { ok: false, message: 'This sign-in does not allow that command.' },
    });
    await act(async () => {
      chip(pane, -1)?.click();
      for (let i = 0; i < 4; i += 1) await Promise.resolve();
    });
    expect(lunarAdjustDays()).toBe(0);
    expect(chip(pane, 0)?.getAttribute('aria-pressed')).toBe('true');
  });

  it('🔴 an operator reads the value as a fact — no chip exists', async () => {
    const { pane } = await open({ auth: OPERATOR });
    expect(pane.querySelector('[data-lunar-adjust]')).toBeNull();
    expect(pane.querySelector('[data-testid="lunar-adjust-fact"]')?.textContent).toContain(
      'As calculated',
    );
  });

  it('the calculation and today’s Lunar Hijri date stand beside it as facts', async () => {
    const { pane } = await open({ auth: ADMIN });
    expect(pane.querySelector('[data-testid="lunar-calculation"]')?.textContent).toMatch(
      /Calculation(Umm al-Qura|Civil \(tabular\)|Tabular)/,
    );
    expect(pane.querySelector('[data-testid="lunar-today"]')?.textContent).toMatch(/[۰-۹]/);
  });
});
