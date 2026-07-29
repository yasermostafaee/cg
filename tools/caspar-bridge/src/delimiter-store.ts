import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { DelimiterOptionSchema, type DelimiterOption } from '@cg/shared-ipc';

/**
 * R-034 — the station's split-delimiter list, owned by the bridge and persisted
 * to disk.
 *
 * ON DISK, not in memory beside the `settings` values: an operator who adds a
 * delimiter must find it there after a bridge restart, and after moving to a
 * different browser in the gallery. Those two requirements are what make this a
 * bridge resource at all — a browser-local list satisfies neither.
 *
 * The write follows `TemplateRegistry`'s: tmp file then rename, so a crash
 * mid-write leaves the previous list intact rather than a truncated one. A
 * failure to persist is reported and NON-FATAL — the list stays correct in
 * memory for the life of the process, which is strictly better than refusing the
 * edit.
 */

const FILE_NAME = 'delimiters.json';

const PersistedSchema = z.object({
  delimiters: z.array(DelimiterOptionSchema),
  updatedAt: z.string(),
});

/** The list a station starts with — the five R-018 shipped, Persian comma included. */
export const DEFAULT_DELIMITERS: readonly DelimiterOption[] = [
  { id: 'newline', label: 'new line', value: '\\n' },
  { id: 'pipe', label: 'pipe', value: '|' },
  { id: 'persian-comma', label: 'Persian comma', value: '،' },
  { id: 'comma', label: 'comma', value: ',' },
  { id: 'semicolon', label: 'semicolon', value: ';' },
];

export interface SetRefusal {
  reason: 'empty-list' | 'duplicate-value';
  message: string;
}

export class DelimiterStore {
  readonly #persistDir: string | null;
  #delimiters: DelimiterOption[] = [...DEFAULT_DELIMITERS];

  constructor(persistDir?: string) {
    this.#persistDir = persistDir ?? null;
  }

  /**
   * Hydrate from disk. Call ONCE at boot, before the first client connects.
   * An unreadable or unusable file leaves the DEFAULT list in place — a station
   * with a corrupt file gets the shipped delimiters, never an empty picker.
   */
  hydrate(): { loaded: number } {
    if (this.#persistDir === null) return { loaded: 0 };
    const file = path.join(this.#persistDir, FILE_NAME);
    if (!fs.existsSync(file)) return { loaded: 0 };
    try {
      const parsed = PersistedSchema.parse(JSON.parse(fs.readFileSync(file, 'utf8')));
      // An empty persisted list is not honoured, for the same reason `set`
      // refuses one: it is a state the product has no way out of.
      if (parsed.delimiters.length > 0) this.#delimiters = parsed.delimiters;
      return { loaded: parsed.delimiters.length };
    } catch (err) {
      process.stderr.write(
        `[caspar-bridge] ⚠ unusable ${file}: ` +
          `${err instanceof Error ? err.message : String(err)} — using the default delimiters\n`,
      );
      return { loaded: 0 };
    }
  }

  list(): DelimiterOption[] {
    return [...this.#delimiters];
  }

  /**
   * Replace the list. Returns the refusal, or `null` when applied.
   *
   * Both refusals are enforced HERE and not only in the UI: a second browser, a
   * stale client or a hand-written call must not be able to create a state the
   * UI is careful to prevent.
   */
  set(delimiters: readonly DelimiterOption[]): SetRefusal | null {
    if (delimiters.length === 0) {
      return {
        reason: 'empty-list',
        message: 'At least one delimiter must remain — a split field needs something to split on.',
      };
    }
    const values = new Set<string>();
    for (const d of delimiters) {
      if (values.has(d.value)) {
        return {
          reason: 'duplicate-value',
          message: `“${d.value}” appears twice — two delimiters that split identically cannot be told apart.`,
        };
      }
      values.add(d.value);
    }
    this.#delimiters = [...delimiters];
    this.#persist();
    return null;
  }

  /** Atomically persist the list (mkdir -p + tmp + rename). Non-fatal on error. */
  #persist(): void {
    if (this.#persistDir === null) return;
    try {
      fs.mkdirSync(this.#persistDir, { recursive: true });
      const file = path.join(this.#persistDir, FILE_NAME);
      const tmp = `${file}.tmp`;
      fs.writeFileSync(
        tmp,
        `${JSON.stringify({
          delimiters: this.#delimiters,
          updatedAt: new Date().toISOString(),
        } satisfies z.infer<typeof PersistedSchema>)}\n`,
        'utf8',
      );
      fs.renameSync(tmp, file);
    } catch (err) {
      process.stderr.write(
        `[caspar-bridge] ⚠ failed to persist delimiters: ` +
          `${err instanceof Error ? err.message : String(err)} — the change is still live ` +
          `in memory but will not survive a bridge restart\n`,
      );
    }
  }
}
