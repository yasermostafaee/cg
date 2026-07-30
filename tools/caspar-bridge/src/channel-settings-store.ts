import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import {
  ChannelSettingsSchema,
  REFERENCE_RASTER,
  rasterVerdict,
  type ChannelSettings,
  type ChannelSettingsState,
  type ChannelVideoMode,
} from '@cg/shared-ipc';

/**
 * R-030 — the per-channel output raster, owned by the bridge and persisted to
 * disk beside the templates and the delimiter list.
 *
 * ON DISK, not in a browser: several browsers share one bridge, and two
 * operators disagreeing about the channel's raster would mean two different
 * beliefs about where every graphic lands. It must also survive a bridge
 * restart, because the raster is install configuration, not a session choice.
 *
 * ALSO HOLDS WHAT THE SERVER REPORTS, and holds it SEPARATELY from what is
 * configured. The two are different kinds of claim and the store must never let
 * one overwrite the other: config is the operator's declaration, `observed` is
 * `INFO <channel>` read back off the wire. Keeping them apart is what makes the
 * mismatch check possible at all — collapse them and the check silently becomes
 * a comparison of config with itself.
 *
 * The write follows `DelimiterStore`'s (mkdir -p, tmp file, rename) so a crash
 * mid-write leaves the previous settings intact; a failure to persist is
 * reported and NON-FATAL.
 */

const FILE_NAME = 'channel-settings.json';

const PersistedSchema = z.object({
  settings: z.array(ChannelSettingsSchema),
  updatedAt: z.string(),
});

/**
 * The default for a channel nobody has configured: the reference raster.
 *
 * This is the SAME fallback `resolveChannelRaster` lands on, deliberately — a
 * fresh install therefore behaves exactly as it did before R-030 (scale 1,
 * 1920×1080) rather than acquiring a new default nobody chose. The mismatch
 * check is what turns a wrong default into a visible problem instead of a silent
 * one.
 */
export function defaultChannelSettings(channel: number): ChannelSettings {
  return { channel, raster: { ...REFERENCE_RASTER } };
}

export interface SetRefusal {
  reason: 'unknown-channel';
  message: string;
}

export class ChannelSettingsStore {
  readonly #persistDir: string | null;
  /** Configured settings, keyed by channel. */
  readonly #settings = new Map<number, ChannelSettings>();
  /** What `INFO <channel>` reported, keyed by channel. Never merged into #settings. */
  readonly #observed = new Map<number, ChannelVideoMode>();
  /** The channels this install declares — the `unknown-channel` guard's world. */
  #declared: readonly number[] = [];

  constructor(persistDir?: string) {
    this.#persistDir = persistDir ?? null;
  }

  /**
   * Hydrate from disk and seed a default for every DECLARED channel that the
   * file does not cover. Call ONCE at boot, before the first client connects.
   *
   * An unusable file leaves the defaults in place and warns — the
   * `DelimiterStore` stance, not `fixed-layers-store`'s hard failure. The
   * difference is deliberate and worth stating: a dropped fixed bank or a
   * dropped layer RESERVATION silently unfences layers another system owns,
   * which can put our graphics on top of live playout. A dropped raster falls
   * back to 1920×1080 — the pre-R-030 behaviour — and the mismatch check then
   * reports the disagreement out loud. Degrading to the old behaviour plus a
   * loud warning beats refusing to boot the operator's only control surface.
   */
  hydrate(declaredChannels: readonly number[]): { loaded: number } {
    this.#declared = [...declaredChannels];
    let loaded = 0;
    if (this.#persistDir !== null) {
      const file = path.join(this.#persistDir, FILE_NAME);
      if (fs.existsSync(file)) {
        try {
          const parsed = PersistedSchema.parse(JSON.parse(fs.readFileSync(file, 'utf8')));
          for (const entry of parsed.settings) this.#settings.set(entry.channel, entry);
          loaded = parsed.settings.length;
        } catch (err) {
          process.stderr.write(
            `[caspar-bridge] ⚠ unusable ${file}: ` +
              `${err instanceof Error ? err.message : String(err)} — every channel falls back to ` +
              `${String(REFERENCE_RASTER.width)}×${String(REFERENCE_RASTER.height)} ` +
              `(the pre-R-030 behaviour). Placement will be WRONG on any channel that is not ` +
              `that raster, until this file is fixed.\n`,
          );
        }
      }
    }
    for (const channel of this.#declared) {
      if (!this.#settings.has(channel))
        this.#settings.set(channel, defaultChannelSettings(channel));
    }
    return { loaded };
  }

  /** The full state pushed to browsers: what is configured AND what was read. */
  state(): ChannelSettingsState {
    return {
      settings: [...this.#settings.values()].sort((a, b) => a.channel - b.channel),
      observed: [...this.#observed.values()].sort((a, b) => a.channel - b.channel),
    };
  }

  /**
   * The raster placement should use for a channel. Falls back to the reference
   * raster for an unconfigured channel — never to the OBSERVED value.
   *
   * Not falling back to `observed` is a deliberate choice and the reason is the
   * mismatch check itself: if an unconfigured channel silently adopted whatever
   * `INFO` reported, config and reality could never disagree, and the check
   * would report `match` on every install while proving nothing. Placement uses
   * the DECLARED value; the reading exists to contradict it out loud.
   */
  rasterFor(channel: number): { width: number; height: number } {
    const configured = this.#settings.get(channel);
    return configured?.raster ?? { ...REFERENCE_RASTER };
  }

  /**
   * Record what `INFO <channel>` reported. Returns true when this is NEW
   * information (so the caller publishes), false when it repeats what is already
   * held — an idle re-read must not churn a publish to every browser.
   */
  observe(reading: ChannelVideoMode): boolean {
    const previous = this.#observed.get(reading.channel);
    if (
      previous !== undefined &&
      previous.mode === reading.mode &&
      previous.raster?.width === reading.raster?.width &&
      previous.raster?.height === reading.raster?.height
    ) {
      return false;
    }
    this.#observed.set(reading.channel, reading);
    return true;
  }

  /**
   * Apply a channel's settings. Returns the refusal, or null when applied.
   *
   * The `unknown-channel` guard is enforced HERE and not only in the UI: a
   * second browser, a stale client or a hand-written call must not be able to
   * introduce a channel this install never declared. The ON-AIR refusal is NOT
   * here — it needs the reconciler's view of what is live, so it sits in
   * `CasparRuntime` where that view lives, and this store is reached only after
   * it passes.
   */
  set(settings: ChannelSettings): SetRefusal | null {
    if (!this.#declared.includes(settings.channel)) {
      return {
        reason: 'unknown-channel',
        message:
          `Channel ${String(settings.channel)} is not declared by this install ` +
          `(declared: ${this.#declared.length === 0 ? 'none' : this.#declared.join(', ')}).`,
      };
    }
    this.#settings.set(settings.channel, settings);
    this.#persist();
    return null;
  }

  /**
   * The stderr line for a channel whose configured raster contradicts the
   * server's. Returns null when there is nothing to shout about.
   *
   * The wording names BOTH rasters and says what the consequence is, because
   * "raster mismatch on channel 1" tells an operator nothing actionable. Reads
   * the canonical `rasterVerdict` rather than re-comparing locally.
   */
  mismatchWarning(channel: number): string | null {
    const state = this.state();
    if (rasterVerdict(state, channel) !== 'mismatch') return null;
    const configured = state.settings.find((s) => s.channel === channel);
    const observed = state.observed.find((o) => o.channel === channel);
    if (configured === undefined || observed?.raster == null) return null;
    return (
      `[caspar-bridge] ⚠ CHANNEL ${String(channel)} RASTER MISMATCH — configured ` +
      `${String(configured.raster.width)}×${String(configured.raster.height)}, but the server ` +
      `reports video-mode ${observed.mode} (${String(observed.raster.width)}×${String(observed.raster.height)}). ` +
      `EVERY graphic on this channel is mis-placed until one of them is corrected.\n`
    );
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
          settings: [...this.#settings.values()].sort((a, b) => a.channel - b.channel),
          updatedAt: new Date().toISOString(),
        } satisfies z.infer<typeof PersistedSchema>)}\n`,
        'utf8',
      );
      fs.renameSync(tmp, file);
    } catch (err) {
      process.stderr.write(
        `[caspar-bridge] ⚠ failed to persist channel settings: ` +
          `${err instanceof Error ? err.message : String(err)} — the change is still live ` +
          `in memory but will not survive a bridge restart\n`,
      );
    }
  }
}
