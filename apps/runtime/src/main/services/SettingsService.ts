import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod';

/**
 * SettingsService — operator-facing toggles persisted to JSON on disk
 * (Phase 8 §12 / M9.3).
 *
 * v1 only exposes the telemetry mode. The schema is intentionally
 * additive — new toggles can be appended without migration code because
 * unknown keys are dropped on read and defaults fill the gaps.
 *
 * Telemetry modes:
 *   - 'off'        — no outbound requests, ever. Default for v1.
 *   - 'on'         — anonymized usage stats (deferred; no transport ships
 *                    in v1 — the toggle exists so policy is explicit).
 *   - 'air-gapped' — same outbound behavior as 'off', but surfaced
 *                    differently in the UI for stations on segregated
 *                    networks. Code paths that consider attempting
 *                    network IO should treat both as "do not call out".
 */

export const TelemetryModeSchema = z.enum(['off', 'on', 'air-gapped']);
export type TelemetryMode = z.infer<typeof TelemetryModeSchema>;

export const SettingsSchema = z.object({
  telemetry: TelemetryModeSchema,
});
export type Settings = z.infer<typeof SettingsSchema>;

const DEFAULTS: Settings = {
  telemetry: 'off',
};

export interface SettingsServiceEvents {
  'settings-changed': [settings: Settings];
}

export interface SettingsServiceOptions {
  /** Absolute path to the JSON file. Parent dir is created on first write. */
  filePath: string;
}

export class SettingsService extends EventEmitter<SettingsServiceEvents> {
  private readonly filePath: string;
  private settings: Settings = { ...DEFAULTS };
  private loaded = false;

  constructor(options: SettingsServiceOptions) {
    super();
    this.filePath = options.filePath;
  }

  /** Synchronously load from disk. Safe to call repeatedly. */
  load(): Settings {
    if (this.loaded) return this.settings;
    let raw: string;
    try {
      raw = fs.readFileSync(this.filePath, 'utf-8');
    } catch (err) {
      const e = err as NodeJS.ErrnoException;
      if (e.code !== 'ENOENT') {
        // Re-throw on anything other than missing file so deployment
        // issues (perm denied etc.) surface in the boot logs.
        throw err;
      }
      this.settings = { ...DEFAULTS };
      this.loaded = true;
      return this.settings;
    }
    // Operator-writable JSON that's gone bad doesn't crash the runtime;
    // fall back to defaults and the next save() heals the file. We only
    // distinguish ENOENT (legitimate first-run) from anything else,
    // including JSON parse failures and Zod-shape mismatches.
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      this.settings = { ...DEFAULTS };
      this.loaded = true;
      return this.settings;
    }
    const result = SettingsSchema.safeParse(parsed);
    this.settings = result.success ? result.data : { ...DEFAULTS };
    this.loaded = true;
    return this.settings;
  }

  /** Current snapshot — load on first call, cached after. */
  get(): Settings {
    if (!this.loaded) this.load();
    return this.settings;
  }

  /**
   * Patch one or more settings, persist, and emit. Throws Zod error
   * on invalid input (caller is expected to have validated via the
   * IPC channel already, but we double-check at the service boundary).
   */
  set(patch: { telemetry?: TelemetryMode | undefined }): Settings {
    if (!this.loaded) this.load();
    // Strip undefined keys before merging — `exactOptionalPropertyTypes`
    // treats `{ telemetry: undefined }` as a legal Partial input, but
    // SettingsSchema doesn't allow undefined and we shouldn't overwrite
    // a real value with one.
    const merged: Settings = { ...this.settings };
    if (patch.telemetry !== undefined) merged.telemetry = patch.telemetry;
    const next = SettingsSchema.parse(merged);
    this.settings = next;
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, `${JSON.stringify(next, null, 2)}\n`, 'utf-8');
    this.emit('settings-changed', next);
    return next;
  }

  /**
   * Pure helper for code paths considering an outbound network call.
   * Both 'off' and 'air-gapped' return false. v1 release criterion
   * (Phase 8 §15): "Telemetry off mode performs zero outbound network
   * requests" — anywhere that contemplates a fetch() / http.request()
   * gates on this.
   */
  isOutboundAllowed(): boolean {
    return this.get().telemetry === 'on';
  }
}
