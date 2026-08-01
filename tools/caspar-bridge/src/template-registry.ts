import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { TemplateInfoSchema, type TemplateInfo } from '@cg/shared-ipc';

/** One registered template: its registry metadata + the rendered self-contained HTML. */
interface RegisteredTemplate {
  readonly info: TemplateInfo;
  /** The browser-produced self-contained HTML (B-038 Phase 2). */
  readonly html: string;
}

/**
 * One persisted registry record. The template id is carried INSIDE the record
 * (the LibraryStore precedent) — the file name is a derived slug and is never
 * decoded back into an id.
 */
const PersistedTemplateSchema = z.object({
  info: TemplateInfoSchema,
  html: z.string(),
  /**
   * When this record was (last) imported (ISO). Hydration sorts on it so the
   * registry's insertion order — which the Library's newest-first display
   * derives from — survives a restart (readdir order is slug-hash order,
   * uncorrelated with import chronology). Optional: pre-stamp records sort
   * first, as oldest.
   */
  importedAt: z.string().optional(),
});

/**
 * Store of imported templates for the bridge (B-038 Phase 2), PERSISTED to
 * disk since R-028 (owner call o1: the BRIDGE owns the template catalogue —
 * one bridge, many browsers, and a bridge restart must not empty the library).
 *
 * Holds each template's `TemplateInfo` AND the browser-produced self-contained
 * HTML keyed by `templateId`. `html(id)` is the serve seam (`GET
 * /template/<id>`) and the `CG ADD` URL resolves against it. Re-importing an
 * id **replaces** its entry (info + html).
 *
 * PERSISTENCE (R-028 3.2): when constructed with a directory, every import
 * writes one JSON file per template (atomic tmp+rename, the connection-store
 * pattern) and every removal deletes it; `loadPersisted()` re-hydrates the
 * set at boot. Persistence is the durability layer, never a gate — a failed
 * write warns loudly and the in-memory registry still serves (the R-010
 * `savePersistedConnection` stance). A corrupt individual file at boot is
 * warned about and SKIPPED, never fatal: losing one template's durability
 * must not take the whole bridge down, and the browser that imported it can
 * re-deliver it on reconnect.
 *
 * Registry contents are DURABILITY, not row identity: what is ON A LAYER
 * after a bridge restart is decided by restore/occupancy, never inferred from
 * this store (R-028 3.3 — identity that cannot be established is reported
 * unknown, not guessed from what happens to be on disk).
 */
export class TemplateRegistry {
  readonly #byId = new Map<string, RegisteredTemplate>();
  readonly #persistDir: string | null;

  constructor(persistDir?: string) {
    this.#persistDir = persistDir ?? null;
  }

  /**
   * Hydrate the registry from the persist directory. Call ONCE at boot,
   * before the WebSocket binds, so the first `templates.list` any browser
   * pulls is already complete. No-op without a persist dir or when the
   * directory does not exist yet.
   */
  loadPersisted(): { loaded: number; skipped: number } {
    if (this.#persistDir === null) return { loaded: 0, skipped: 0 };
    let names: string[];
    try {
      names = fs.readdirSync(this.#persistDir);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { loaded: 0, skipped: 0 };
      process.stderr.write(
        `[caspar-bridge] ⚠ cannot read templates dir ${this.#persistDir}: ` +
          `${err instanceof Error ? err.message : String(err)} — starting with an empty registry\n`,
      );
      return { loaded: 0, skipped: 0 };
    }
    let skipped = 0;
    const records: { info: TemplateInfo; html: string; importedAt: string }[] = [];
    for (const name of names) {
      if (!name.endsWith('.json')) continue;
      const file = path.join(this.#persistDir, name);
      try {
        const record = PersistedTemplateSchema.parse(JSON.parse(fs.readFileSync(file, 'utf8')));
        records.push({ info: record.info, html: record.html, importedAt: record.importedAt ?? '' });
      } catch (err) {
        skipped++;
        process.stderr.write(
          `[caspar-bridge] ⚠ skipping unusable persisted template ${file}: ` +
            `${err instanceof Error ? err.message : String(err)} — re-import it to restore ` +
            `durability\n`,
        );
      }
    }
    // Re-create import CHRONOLOGY as insertion order (ISO strings sort
    // lexically; un-stamped records land first, as oldest). The Library's
    // newest-first display is a reverse of this order.
    records.sort((a, b) => a.importedAt.localeCompare(b.importedAt));
    for (const record of records) {
      this.#byId.set(record.info.templateId, { info: record.info, html: record.html });
    }
    return { loaded: records.length, skipped };
  }

  /** Register (or replace) a template by id with its info + rendered HTML. */
  import(info: TemplateInfo, html: string): { registered: boolean; templateId: string } {
    this.#byId.set(info.templateId, { info, html });
    this.#persist(info.templateId);
    return { registered: true, templateId: info.templateId };
  }

  /** The template's info, or `null` if not registered. */
  get(templateId: string): TemplateInfo | null {
    return this.#byId.get(templateId)?.info ?? null;
  }

  /** Every registered template's info. */
  list(): TemplateInfo[] {
    return [...this.#byId.values()].map((e) => e.info);
  }

  /**
   * The retained self-contained HTML for a template, or `null` if not registered.
   * Phase 3 serves this at `GET /template/<id>`; Phase 4 resolves the `CG ADD`
   * URL to it.
   */
  html(templateId: string): string | null {
    return this.#byId.get(templateId)?.html ?? null;
  }

  /**
   * R-005 — drop a template (info + retained HTML + its persisted file).
   * Returns whether it was registered.
   *
   * Un-serving is free: `TemplateHttpServer` keeps no map of its own, it reads through
   * `html(id)` on every request — so `GET /template/<id>` 404s the moment this returns.
   *
   * The registry does NOT decide whether a removal is allowed; `CasparRuntime.templateRemove`
   * owns the refuse-while-referenced policy, because only it can see the stack.
   */
  remove(templateId: string): boolean {
    const existed = this.#byId.delete(templateId);
    if (existed && this.#persistDir !== null) {
      try {
        fs.rmSync(this.#fileFor(templateId), { force: true });
      } catch (err) {
        process.stderr.write(
          `[caspar-bridge] ⚠ failed to delete persisted template for ${templateId}: ` +
            `${err instanceof Error ? err.message : String(err)}\n`,
        );
      }
    }
    return existed;
  }

  /** Whether a template id is registered. */
  has(templateId: string): boolean {
    return this.#byId.has(templateId);
  }

  /** Atomically persist one entry (mkdir -p + tmp + rename). Non-fatal on error. */
  #persist(templateId: string): void {
    if (this.#persistDir === null) return;
    const entry = this.#byId.get(templateId);
    if (entry === undefined) return;
    try {
      fs.mkdirSync(this.#persistDir, { recursive: true });
      const file = this.#fileFor(templateId);
      const tmp = `${file}.tmp`;
      fs.writeFileSync(
        tmp,
        `${JSON.stringify({
          info: entry.info,
          html: entry.html,
          importedAt: new Date().toISOString(),
        } satisfies z.infer<typeof PersistedTemplateSchema>)}\n`,
        'utf8',
      );
      fs.renameSync(tmp, file);
    } catch (err) {
      process.stderr.write(
        `[caspar-bridge] ⚠ failed to persist template ${templateId}: ` +
          `${err instanceof Error ? err.message : String(err)} — the import is still live ` +
          `in memory but will not survive a bridge restart\n`,
      );
    }
  }

  /**
   * The persisted file for an id. `IdSchema` permits filename-hostile strings
   * of any length, so the name is a bounded sanitised slug plus a hash of the
   * FULL id for uniqueness — never decoded back (the id lives in the record).
   */
  #fileFor(templateId: string): string {
    const slug = templateId.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 60);
    const hash = createHash('sha256').update(templateId, 'utf8').digest('hex').slice(0, 12);
    // this.#persistDir is checked by every caller before reaching here.
    return path.join(this.#persistDir ?? '', `${slug}-${hash}.json`);
  }
}
