import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CalendarSettings } from '@cg/shared-ipc';
import { CalendarStore } from '../src/calendar-store.js';

/**
 * `DELTA-RUN-NEXT-VERSION-01-C` §1 — **the station's Lunar Hijri day adjustment survives a restart,
 * and nothing outside −2 … +2 is ever stored.** The `DelimiterStore` shape: `calendar.json` beside
 * the templates, tmp-then-rename, an unusable file leaving the default (0 — the calculation).
 */

let dir = '';
let stderr: string[] = [];
let restore: (() => void) | null = null;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-calendar-store-'));
  stderr = [];
  const spy = vi.spyOn(process.stderr, 'write').mockImplementation(((chunk: unknown) => {
    stderr.push(String(chunk));
    return true;
  }) as typeof process.stderr.write);
  restore = () => spy.mockRestore();
});

afterEach(() => {
  restore?.();
  restore = null;
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('CalendarStore', () => {
  it('a station that never set anything answers 0 — the calculation, unadjusted', () => {
    const store = new CalendarStore(dir);
    expect(store.hydrate()).toEqual({ loaded: false });
    expect(store.get()).toEqual({ lunarAdjustDays: 0 });
  });

  it('a set is persisted as calendar.json and a fresh store (a restart) reads it back', () => {
    expect(new CalendarStore(dir).set({ lunarAdjustDays: -1 })).toBeNull();
    const file = path.join(dir, 'calendar.json');
    expect(fs.existsSync(file)).toBe(true);
    expect(fs.existsSync(`${file}.tmp`), 'the tmp file was renamed, not left').toBe(false);
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toMatchObject({ lunarAdjustDays: -1 });

    const restarted = new CalendarStore(dir);
    expect(restarted.hydrate()).toEqual({ loaded: true });
    expect(restarted.get()).toEqual({ lunarAdjustDays: -1 });
  });

  it('every whole day from −2 to +2 is accepted; anything else is refused and stores nothing', () => {
    const store = new CalendarStore(dir);
    for (const days of [-2, -1, 0, 1, 2]) {
      expect(store.set({ lunarAdjustDays: days })).toBeNull();
      expect(store.get().lunarAdjustDays).toBe(days);
    }
    for (const days of [3, -3, 0.5]) {
      const refusal = store.set({ lunarAdjustDays: days } as CalendarSettings);
      expect(refusal).toContain('−2 to +2');
      expect(store.get().lunarAdjustDays, 'the setting in force is unchanged').toBe(2);
    }
  });

  it('an unusable file leaves the default and says so — it never stops the boot', () => {
    fs.writeFileSync(path.join(dir, 'calendar.json'), '{"lunarAdjustDays": 9, "updatedAt": "x"}\n');
    const store = new CalendarStore(dir);
    expect(store.hydrate()).toEqual({ loaded: false });
    expect(store.get()).toEqual({ lunarAdjustDays: 0 });
    expect(stderr.join('')).toContain('unusable');
  });

  it('without a directory it holds the value in memory and writes nothing', () => {
    const store = new CalendarStore();
    expect(store.set({ lunarAdjustDays: 1 })).toBeNull();
    expect(store.get()).toEqual({ lunarAdjustDays: 1 });
    expect(fs.readdirSync(dir)).toEqual([]);
  });
});
