import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import {
  CalendarSettingsSchema,
  DEFAULT_CALENDAR_SETTINGS,
  type CalendarSettings,
} from '@cg/shared-ipc';

/**
 * `DELTA-RUN-NEXT-VERSION-01-C` §1 — the station's calendar settings (the Lunar Hijri day
 * adjustment), owned by CG Bridge and persisted to disk as `calendar.json` beside the templates.
 *
 * Modelled exactly on `DelimiterStore`: hydrated ONCE at boot, before the first client connects;
 * written tmp-then-rename so a crash mid-write leaves the previous file intact; a failure to persist
 * is reported and NON-FATAL (the setting stays in force in memory for the life of the process). An
 * unreadable file leaves the default — the calculation, unadjusted — never a refusal to boot.
 *
 * The file name cannot be mistaken for a template record (`B-116`: the registry admits only names of
 * its own shape, `isRegistryRecordName`).
 */

const FILE_NAME = 'calendar.json';

const PersistedSchema = CalendarSettingsSchema.extend({ updatedAt: z.string() });

export class CalendarStore {
  readonly #persistDir: string | null;
  #settings: CalendarSettings = { ...DEFAULT_CALENDAR_SETTINGS };

  constructor(persistDir?: string) {
    this.#persistDir = persistDir ?? null;
  }

  /** Hydrate from disk. An unreadable or out-of-range file leaves the default in place. */
  hydrate(): { loaded: boolean } {
    if (this.#persistDir === null) return { loaded: false };
    const file = path.join(this.#persistDir, FILE_NAME);
    if (!fs.existsSync(file)) return { loaded: false };
    try {
      const parsed = PersistedSchema.parse(JSON.parse(fs.readFileSync(file, 'utf8')));
      this.#settings = { lunarAdjustDays: parsed.lunarAdjustDays };
      return { loaded: true };
    } catch (err) {
      process.stderr.write(
        `[caspar-bridge] ⚠ unusable ${file}: ` +
          `${err instanceof Error ? err.message : String(err)} — using the calculated Lunar Hijri date\n`,
      );
      return { loaded: false };
    }
  }

  get(): CalendarSettings {
    return { ...this.#settings };
  }

  /**
   * Replace the settings. Returns the refusal sentence, or `null` when applied. The channel's
   * request schema already bounds the value; this re-checks it so a direct caller cannot store
   * what no client could send.
   */
  set(settings: CalendarSettings): string | null {
    const parsed = CalendarSettingsSchema.safeParse(settings);
    if (!parsed.success) return 'The Lunar Hijri adjustment is a whole number of days, −2 to +2.';
    this.#settings = { lunarAdjustDays: parsed.data.lunarAdjustDays };
    this.#persist();
    return null;
  }

  /** Atomically persist (mkdir -p + tmp + rename). Non-fatal on error. */
  #persist(): void {
    if (this.#persistDir === null) return;
    try {
      fs.mkdirSync(this.#persistDir, { recursive: true });
      const file = path.join(this.#persistDir, FILE_NAME);
      const tmp = `${file}.tmp`;
      fs.writeFileSync(
        tmp,
        `${JSON.stringify({
          ...this.#settings,
          updatedAt: new Date().toISOString(),
        } satisfies z.infer<typeof PersistedSchema>)}\n`,
        'utf8',
      );
      fs.renameSync(tmp, file);
    } catch (err) {
      process.stderr.write(
        `[caspar-bridge] ⚠ failed to persist the calendar settings: ` +
          `${err instanceof Error ? err.message : String(err)} — the change is still live ` +
          `in memory but will not survive a bridge restart\n`,
      );
    }
  }
}
