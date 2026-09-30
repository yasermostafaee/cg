import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { TemplateInfoSchema, type TemplateInfo } from '@cg/shared-ipc';

/**
 * One stored VERSION of a template: its registry metadata, the rendered self-contained HTML
 * (B-038 Phase 2), and where it is served and kept.
 *
 * 🔴 `CHANNEL-TEMPLATES-01` (the owner, 2026-09-28) — **A VERSION IS WHAT IS STORED; A CHANNEL'S
 * LIST IS WHAT IS OFFERED.** Before this change the registry held one entry per template id and a
 * re-import replaced it for the whole station. Now every channel keeps its own list of
 * `(template, version)`, over this shared store: one version is stored once however many channels
 * list it, and it is removed only when no channel lists it and no row holds it.
 */
interface StoredVersion {
  readonly templateId: string;
  /** {@link templateVersionId} of the info and the HTML — the content, never a counter. */
  readonly versionId: string;
  /**
   * The ONE path segment this version is served at, `GET /template/<serveKey>`. Fixed for the
   * version's whole life, which is what keeps a page on air served byte for byte whatever the
   * lists do (see {@link TemplateRegistry.serveKeyOf}).
   */
  readonly serveKey: string;
  readonly info: TemplateInfo;
  readonly html: string;
  readonly importedAt: string;
  /** The record file this version lives in; `null` with no persist dir (unit tests). */
  readonly file: string | null;
}

/**
 * One persisted version record. The template id is carried INSIDE the record (the LibraryStore
 * precedent) — the file name is a derived slug and is never decoded back into an id.
 *
 * `versionId` and `serveKey` are OPTIONAL because every record written before
 * `CHANNEL-TEMPLATES-01` lacks both: such a record is the one version its id had, its version is
 * its content's hash, and its serve key is the bare template id it has always been served at.
 */
const PersistedTemplateSchema = z.object({
  info: TemplateInfoSchema,
  html: z.string(),
  /**
   * When this record was imported (ISO). Hydration sorts on it so a list rebuilt from the records
   * alone (the upgrade copy) keeps import chronology — readdir order is slug-hash order,
   * uncorrelated with it. Optional: pre-stamp records sort first, as oldest.
   */
  importedAt: z.string().optional(),
  versionId: z
    .string()
    .regex(/^[0-9a-f]{16}$/)
    .optional(),
  serveKey: z.string().min(1).optional(),
});

/**
 * 🔴 `CHANNEL-TEMPLATES-01` — **THE LISTS AND THE HOLDS**, in one file beside the version records.
 * Its name does not match {@link RECORD_NAME}, so the record loader never reads it as a template
 * (`B-116`'s rule, unchanged).
 */
const INDEX_FILE = 'template-channels.json';

const PersistedIndexSchema = z.object({
  v: z.literal(1),
  /** channel → the templates it lists, in list order, each at the version it lists. */
  lists: z.record(
    z.string(),
    z.array(z.object({ templateId: z.string().min(1), versionId: z.string().min(1) })),
  ),
  /** item id → the version its last page was served from. */
  holds: z.record(z.string(), z.string().min(1)).default({}),
});

/**
 * 🔴 `B-116` — **a template record is a file THIS registry would have written, and nothing
 * else.** Every record is named `<slug>-<12 hex of sha256(key)>.json`
 * ({@link registryRecordFileName}); this is that shape as a predicate, and `loadPersisted` admits a
 * file iff it matches.
 *
 * Sibling stores persist INTO the same directory — `DelimiterStore` (`delimiters.json`),
 * `ChannelSettingsStore` (`channel-settings.json`) and this registry's own index
 * (`template-channels.json`) — and the loader used to read every `*.json` there as a template, so
 * each boot warned that a template was corrupt and told the operator to re-import it, on a
 * machine where nothing was wrong.
 *
 * It is a RULE about the writer's shape, deliberately not a list of filenames to skip: a list is
 * wrong on the day the next sibling lands. The slug is bounded at 60 characters of
 * `[A-Za-z0-9._-]`, the hash is exactly 12 lowercase hex — both from
 * {@link registryRecordFileName}, the only writer.
 */
const RECORD_NAME = /^[A-Za-z0-9._-]{1,60}-[0-9a-f]{12}\.json$/;

/** Whether a directory entry is a record this registry wrote (see {@link RECORD_NAME}). */
export function isRegistryRecordName(name: string): boolean {
  return RECORD_NAME.test(name);
}

/**
 * The file name for a record key (a version's serve key): a bounded sanitised slug plus a hash of
 * the FULL key for uniqueness — never decoded back (the id lives in the record). `IdSchema` permits
 * filename-hostile strings of any length, which is why the slug is sanitised and bounded.
 *
 * ⚠ A version served at the bare template id is kept in exactly the file every record was named
 * before `CHANNEL-TEMPLATES-01` — which is why the upgrade moves no file at all.
 *
 * Exported so a test that plants a record on disk names it the way the registry does; the loader
 * admits nothing else (`B-116`).
 */
export function registryRecordFileName(key: string): string {
  const slug = key.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 60);
  const hash = createHash('sha256').update(key, 'utf8').digest('hex').slice(0, 12);
  return `${slug}-${hash}.json`;
}

/**
 * JSON with every object's keys in sorted order, so two copies of the same info hash the same
 * whatever order their keys were written in.
 */
function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) => {
    if (v === null || typeof v !== 'object' || Array.isArray(v)) return v;
    const sorted: Record<string, unknown> = {};
    for (const k of Object.keys(v).sort()) sorted[k] = (v as Record<string, unknown>)[k];
    return sorted;
  });
}

/**
 * 🔴 `CHANNEL-TEMPLATES-01` decision 3 — **A VERSION IS ITS CONTENT.** 16 hex of the sha256 of the
 * info (canonical) and the HTML. Importing the same `.vcg` on a second channel produces the same
 * two things, so it names the same version and reuses its one stored file; a changed package
 * names a new one. Nothing about who imported it or when is part of it.
 */
export function templateVersionId(info: TemplateInfo, html: string): string {
  return createHash('sha256')
    .update(canonicalJson(info), 'utf8')
    .update('\u0000', 'utf8')
    .update(html, 'utf8')
    .digest('hex')
    .slice(0, 16);
}

/**
 * The separator of a qualified serve key, `<templateId>~<versionId>`. `~` is left alone by
 * `encodeURIComponent`, so the URL stays readable in the AMCP log, and a version id is hex, so the
 * LAST `~` always splits one unambiguously.
 */
const SERVE_KEY_SEPARATOR = '~';

/**
 * Store of imported templates for the bridge (B-038 Phase 2), PERSISTED to disk since R-028 (owner
 * call o1: the BRIDGE owns the template catalogue — one bridge, many browsers, and a bridge restart
 * must not empty the library), and PER CHANNEL since `CHANNEL-TEMPLATES-01`.
 *
 * ── THREE THINGS, KEPT APART ────────────────────────────────────────────────
 *
 *   - **VERSIONS** — each `(info, html)` stored once, keyed by its content
 *     ({@link templateVersionId}), with one record file and one serve key for life.
 *   - **LISTS** — each channel's `templateId → versionId`, in list order. What a channel's picker
 *     shows, what a load on that channel resolves, and what a row on it takes.
 *   - **HOLDS** — `itemId → versionId`: the version a row's last page was served from. A page on
 *     air was fetched from its version's serve path, so that version must outlive every list
 *     change until the row takes another version or leaves the stack.
 *
 * A version is COLLECTED — record and all — only when no channel lists it and no row holds it
 * (the owner's decision 3). Persistence is the durability layer, never a gate: a failed write
 * warns loudly and the in-memory registry still serves (the R-010 `savePersistedConnection`
 * stance); a corrupt record at boot is warned about and SKIPPED, never fatal.
 *
 * Registry contents are DURABILITY, not row identity: what is ON A LAYER after a bridge restart is
 * decided by restore/occupancy, never inferred from this store (R-028 3.3).
 *
 * The registry does NOT decide whether a removal is allowed; `CasparRuntime.templateRemove` owns
 * the refuse-while-referenced policy, because only it can see the stack.
 */
export class TemplateRegistry {
  /** versionId → the stored version. */
  readonly #versions = new Map<string, StoredVersion>();
  /** serveKey → versionId: the ONE map the HTTP server resolves a path segment through. */
  readonly #byServeKey = new Map<string, string>();
  /** channel → templateId → versionId, in list order. */
  readonly #lists = new Map<number, Map<string, string>>();
  /** itemId → the version its last page was served from. */
  readonly #holds = new Map<string, string>();
  /** versionId → `CG ADD`s of it in flight. In memory only: a restart has none in flight. */
  readonly #pins = new Map<string, number>();
  readonly #persistDir: string | null;
  /**
   * 🔴 `CHANNEL-TEMPLATES-01` decision 5 — has the ONE-TIME COPY happened? False only while this
   * directory holds records written before the per-channel lists existed and no channel has been
   * declared to copy them to (a station still in first-run). Until it happens nothing is
   * collected: those records are the station's library and must not disappear at the upgrade.
   */
  #migrated = true;

  constructor(persistDir?: string) {
    this.#persistDir = persistDir ?? null;
  }

  /**
   * Hydrate the registry from the persist directory. Call ONCE at boot, before the WebSocket
   * binds, so the first `templates.list` any browser pulls is already complete. No-op without a
   * persist dir or when the directory does not exist yet.
   *
   * `loaded` counts the version records hydrated; `skipped` the unusable ones.
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
    const records: {
      record: z.infer<typeof PersistedTemplateSchema>;
      importedAt: string;
      file: string;
    }[] = [];
    for (const name of names) {
      // `B-116` — only the registry's OWN records. A sibling store's config file in this
      // directory is not a template and must not be reported as a corrupt one.
      if (!isRegistryRecordName(name)) continue;
      const file = path.join(this.#persistDir, name);
      try {
        const record = PersistedTemplateSchema.parse(JSON.parse(fs.readFileSync(file, 'utf8')));
        records.push({ record, importedAt: record.importedAt ?? '', file });
      } catch (err) {
        skipped++;
        process.stderr.write(
          `[caspar-bridge] ⚠ skipping unusable persisted template ${file}: ` +
            `${err instanceof Error ? err.message : String(err)} — re-import it to restore ` +
            `durability\n`,
        );
      }
    }
    // Import CHRONOLOGY as insertion order (ISO strings sort lexically; un-stamped records land
    // first, as oldest) — the order the upgrade copy lists them in.
    records.sort((a, b) => a.importedAt.localeCompare(b.importedAt));
    for (const { record, importedAt, file } of records) {
      const versionId = record.versionId ?? templateVersionId(record.info, record.html);
      if (this.#versions.has(versionId)) continue; // the same content twice: one version.
      const wanted = record.serveKey ?? record.info.templateId;
      const serveKey = this.#byServeKey.has(wanted)
        ? this.#freeServeKey(record.info.templateId, versionId)
        : wanted;
      this.#versions.set(versionId, {
        templateId: record.info.templateId,
        versionId,
        serveKey,
        info: record.info,
        html: record.html,
        importedAt,
        file,
      });
      this.#byServeKey.set(serveKey, versionId);
    }
    this.#loadIndex();
    return { loaded: this.#versions.size, skipped };
  }

  /**
   * Read the lists and holds. ABSENT with records present ⇒ a library written before
   * `CHANNEL-TEMPLATES-01`: not yet copied to any channel ({@link migrate}). UNUSABLE ⇒ warned,
   * and treated as absent, so the upgrade copy runs again rather than a library disappearing: a
   * station loses its channels' differences, never its templates.
   */
  #loadIndex(): void {
    const file = this.#indexFile();
    if (file === null) return;
    let raw: string;
    try {
      raw = fs.readFileSync(file, 'utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        process.stderr.write(
          `[caspar-bridge] ⚠ cannot read ${file}: ` +
            `${err instanceof Error ? err.message : String(err)} — every declared channel will list every stored template\n`,
        );
      }
      this.#migrated = this.#versions.size === 0;
      return;
    }
    let index: z.infer<typeof PersistedIndexSchema>;
    try {
      index = PersistedIndexSchema.parse(JSON.parse(raw));
    } catch (err) {
      process.stderr.write(
        `[caspar-bridge] ⚠ unusable ${file}: ` +
          `${err instanceof Error ? err.message : String(err)} — every declared channel will list every stored template\n`,
      );
      this.#migrated = this.#versions.size === 0;
      return;
    }
    for (const [key, entries] of Object.entries(index.lists)) {
      const channel = Number(key);
      if (!Number.isInteger(channel) || channel < 1) continue;
      const list = this.#listFor(channel);
      for (const { templateId, versionId } of entries) {
        const version = this.#versions.get(versionId);
        if (version === undefined || version.templateId !== templateId) {
          process.stderr.write(
            `[caspar-bridge] ⚠ channel ${String(channel)} lists template ${templateId} at a version ` +
              `that is not stored — it is left off that channel's list; re-import it there\n`,
          );
          continue;
        }
        list.set(templateId, versionId);
      }
    }
    for (const [itemId, versionId] of Object.entries(index.holds)) {
      if (this.#versions.has(versionId)) this.#holds.set(itemId, versionId);
    }
    this.#migrated = true;
  }

  /**
   * 🔴 `CHANNEL-TEMPLATES-01` decision 5 — **THE ONE-TIME COPY: every declared channel lists every
   * template in the station's library**, at the version it has, in import order. Nothing on air
   * changes: the versions keep their records and their serve keys, and every take resolves the
   * same HTML as before.
   *
   * Idempotent — a registry already copied (or one that never held a pre-channel record) copies
   * nothing, which is why a second load copies nothing. With no channel declared there is nowhere
   * to copy to, and the library stays as it is until one is (a station in first-run). A channel
   * declared AFTER the copy starts with an empty list.
   */
  migrate(channels: readonly number[]): number {
    if (this.#migrated || channels.length === 0) return 0;
    // One version per template: the newest, the one the station-wide registry was serving.
    const newest = new Map<string, StoredVersion>();
    for (const version of [...this.#versions.values()].sort((a, b) =>
      a.importedAt.localeCompare(b.importedAt),
    )) {
      newest.delete(version.templateId);
      newest.set(version.templateId, version);
    }
    let listed = 0;
    for (const channel of [...new Set(channels)].sort((a, b) => a - b)) {
      const list = this.#listFor(channel);
      for (const version of newest.values()) {
        if (list.has(version.templateId)) continue;
        list.set(version.templateId, version.versionId);
        listed++;
      }
    }
    this.#migrated = true;
    this.#persistIndex();
    this.#collect();
    return listed;
  }

  /** Whether the one-time copy has happened (see {@link migrate}). */
  get migrated(): boolean {
    return this.#migrated;
  }

  // ── A CHANNEL'S LIST ─────────────────────────────────────────────────────────

  /** `channel`'s templates, in list order, each at the version it lists. */
  listOn(channel: number): TemplateInfo[] {
    const list = this.#lists.get(channel);
    if (list === undefined) return [];
    return [...list.values()].flatMap((versionId) => {
      const info = this.#versions.get(versionId)?.info;
      return info === undefined ? [] : [info];
    });
  }

  /** The template as `channel` lists it, or `null` when `channel` does not list it. */
  getOn(channel: number, templateId: string): TemplateInfo | null {
    const versionId = this.versionOn(channel, templateId);
    return versionId === null ? null : (this.#versions.get(versionId)?.info ?? null);
  }

  /** The version `channel` lists `templateId` at, or `null`. */
  versionOn(channel: number, templateId: string): string | null {
    return this.#lists.get(channel)?.get(templateId) ?? null;
  }

  /** Whether `channel` lists `templateId`. */
  hasOn(channel: number, templateId: string): boolean {
    return this.versionOn(channel, templateId) !== null;
  }

  /** The channels that list `templateId`, in channel order. */
  channelsListing(templateId: string): number[] {
    return [...this.#lists.entries()]
      .filter(([, list]) => list.has(templateId))
      .map(([channel]) => channel)
      .sort((a, b) => a - b);
  }

  // ── THE STATION-WIDE VIEW (reads that name no channel) ──────────────────────

  /**
   * Every template listed on ANY channel, once each: the version on the lowest channel listing
   * it. The reading for a caller that names no channel — a console that predates the lists, the
   * audit panel's names, an item with no layer. Before the one-time copy, the library itself.
   */
  listAll(): TemplateInfo[] {
    return [...this.#stationWide().values()].map((v) => v.info);
  }

  /** {@link listAll}'s entry for one id, or `null`. */
  getAny(templateId: string): TemplateInfo | null {
    return this.#stationWide().get(templateId)?.info ?? null;
  }

  /** Whether any channel lists `templateId` (before the copy: whether it is stored). */
  hasAny(templateId: string): boolean {
    return this.#stationWide().has(templateId);
  }

  /** {@link listAll}'s version of one id, or `null`. */
  versionAny(templateId: string): string | null {
    return this.#stationWide().get(templateId)?.versionId ?? null;
  }

  #stationWide(): Map<string, StoredVersion> {
    const out = new Map<string, StoredVersion>();
    if (!this.#migrated) {
      for (const version of this.#versions.values()) {
        out.delete(version.templateId);
        out.set(version.templateId, version);
      }
      return out;
    }
    for (const channel of [...this.#lists.keys()].sort((a, b) => a - b)) {
      for (const [templateId, versionId] of this.#lists.get(channel) ?? []) {
        if (out.has(templateId)) continue;
        const version = this.#versions.get(versionId);
        if (version !== undefined) out.set(templateId, version);
      }
    }
    return out;
  }

  // ── THE ACTIONS ──────────────────────────────────────────────────────────────

  /**
   * Import `(info, html)` onto `channels`: store its version (or reuse the one already stored —
   * decision 3) and list it there, replacing whatever version those channels listed. No other
   * channel's list is touched. Answers the version and the channels whose list CHANGED (a channel
   * that already listed exactly this version did not).
   */
  importOn(
    channels: readonly number[],
    info: TemplateInfo,
    html: string,
  ): { versionId: string; changed: number[] } {
    const versionId = templateVersionId(info, html);
    const changed: number[] = [];
    for (const channel of [...new Set(channels)].sort((a, b) => a - b)) {
      const list = this.#listFor(channel);
      if (list.get(info.templateId) === versionId) continue;
      list.set(info.templateId, versionId);
      changed.push(channel);
    }
    if (!this.#versions.has(versionId)) {
      /*
        ⚠ COLLECT FIRST, THEN STORE. A re-import with nothing holding the old version releases
        it, and its bare serve key with it — so the new version takes the bare id, and the next
        take's `CG ADD` line is the one it always was. Storing first would give the new version
        a qualified key for an old one about to vanish.
      */
      this.#collect();
      this.#store(info, html, versionId);
    }
    this.#persistIndex();
    this.#collect();
    return { versionId, changed };
  }

  /**
   * Take `templateId` off `channels`' lists. Answers the channels it was on. Its version is
   * collected only if no other channel lists it and no row holds it.
   */
  removeFrom(channels: readonly number[], templateId: string): number[] {
    const removed: number[] = [];
    for (const channel of [...new Set(channels)].sort((a, b) => a - b)) {
      if (this.#lists.get(channel)?.delete(templateId) === true) removed.push(channel);
    }
    if (removed.length > 0) {
      this.#persistIndex();
      this.#collect();
    }
    return removed;
  }

  // ── SERVING ──────────────────────────────────────────────────────────────────

  /**
   * The serve key of a stored version — the one path segment `GET /template/<key>` serves it at.
   *
   * 🔴 **FIXED FOR THE VERSION'S LIFE, and the BARE template id whenever it is free.** A version
   * is given the bare id when it is stored unless another stored version of that id already has
   * it, and `<templateId>~<versionId>` otherwise. So a station with one version of each template
   * — every station on the day of the upgrade, and every template never re-imported while its old
   * page was on air — serves and `CG ADD`s exactly the URL it always did; only a second version
   * alive beside the first gets a qualified path, and neither ever moves.
   */
  serveKeyOf(versionId: string): string | null {
    return this.#versions.get(versionId)?.serveKey ?? null;
  }

  /** The HTML served at `GET /template/<serveKey>`, or `null` (a 404). */
  htmlForServeKey(serveKey: string): string | null {
    const versionId = this.#byServeKey.get(serveKey);
    return versionId === undefined ? null : (this.#versions.get(versionId)?.html ?? null);
  }

  /** A stored version's HTML, or `null`. */
  htmlOf(versionId: string): string | null {
    return this.#versions.get(versionId)?.html ?? null;
  }

  // ── HOLDS ────────────────────────────────────────────────────────────────────

  /**
   * 🔴 **A ROW HOLDS THE VERSION ITS PAGE WAS SERVED FROM** — recorded at every `CG ADD`, so a page
   * on air keeps its record and its serve path whatever any channel's list does afterwards. The
   * row's next ADD of another version moves the hold (and frees the old version if nothing else
   * keeps it).
   */
  hold(itemId: string, versionId: string): void {
    if (this.#holds.get(itemId) === versionId) return;
    this.#holds.set(itemId, versionId);
    this.#persistIndex();
    this.#collect();
  }

  /** The row left the stack: it holds nothing any more. */
  release(itemId: string): void {
    if (!this.#holds.delete(itemId)) return;
    this.#persistIndex();
    this.#collect();
  }

  /** The version `itemId`'s last page was served from, or `undefined`. */
  heldVersion(itemId: string): string | undefined {
    return this.#holds.get(itemId);
  }

  /**
   * A `CG ADD` of `versionId` is in flight: CasparCG fetches the page AFTER the command, so the
   * version must survive until the ADD has landed and the row holds it — a re-import on the
   * row's channel mid-take would otherwise collect the page being fetched.
   */
  pin(versionId: string): void {
    this.#pins.set(versionId, (this.#pins.get(versionId) ?? 0) + 1);
  }

  /** The ADD {@link pin}ned for has settled; collect what nothing keeps any more. */
  unpin(versionId: string): void {
    const left = (this.#pins.get(versionId) ?? 0) - 1;
    if (left > 0) this.#pins.set(versionId, left);
    else this.#pins.delete(versionId);
    this.#collect();
  }

  /** Every stored version id — for tests that count what is kept. */
  storedVersions(): string[] {
    return [...this.#versions.keys()];
  }

  // ── INTERNALS ────────────────────────────────────────────────────────────────

  #listFor(channel: number): Map<string, string> {
    let list = this.#lists.get(channel);
    if (list === undefined) {
      list = new Map();
      this.#lists.set(channel, list);
    }
    return list;
  }

  /**
   * 🔴 `CENTRAL-BRIDGE-01` (`B-293`) — **A NEW VERSION IS ALWAYS SERVED AT ITS OWN KEY,
   * `<templateId>~<versionId>`.** It used to take the BARE id whenever that was free, so once an
   * older version was collected a later version of the same template was served at the URL the
   * older one had — and CasparCG's CEF keeps pages on disk (the Playout team's rule 12), so a take
   * could air the cached old page. The version id is the content's, so a URL now names one page for
   * life. A record written before keeps the key it has (bare or qualified), which no later version
   * is ever given. The `~n` suffix only guards a key some legacy record already holds.
   */
  #freeServeKey(templateId: string, versionId: string): string {
    const qualified = `${templateId}${SERVE_KEY_SEPARATOR}${versionId}`;
    let key = qualified;
    for (let n = 2; this.#byServeKey.has(key); n++)
      key = `${qualified}${SERVE_KEY_SEPARATOR}${String(n)}`;
    return key;
  }

  /** Store a new version: memory, then its record (atomic tmp + rename). Non-fatal on error. */
  #store(info: TemplateInfo, html: string, versionId: string): void {
    const serveKey = this.#freeServeKey(info.templateId, versionId);
    const importedAt = new Date().toISOString();
    const file =
      this.#persistDir === null
        ? null
        : path.join(this.#persistDir, registryRecordFileName(serveKey));
    this.#versions.set(versionId, {
      templateId: info.templateId,
      versionId,
      serveKey,
      info,
      html,
      importedAt,
      file,
    });
    this.#byServeKey.set(serveKey, versionId);
    if (file === null || this.#persistDir === null) return;
    try {
      fs.mkdirSync(this.#persistDir, { recursive: true });
      const tmp = `${file}.tmp`;
      fs.writeFileSync(
        tmp,
        `${JSON.stringify({
          info,
          html,
          importedAt,
          versionId,
          serveKey,
        } satisfies z.infer<typeof PersistedTemplateSchema>)}\n`,
        'utf8',
      );
      fs.renameSync(tmp, file);
    } catch (err) {
      process.stderr.write(
        `[caspar-bridge] ⚠ failed to persist template ${info.templateId}: ` +
          `${err instanceof Error ? err.message : String(err)} — the import is still live ` +
          `in memory but will not survive a bridge restart\n`,
      );
    }
  }

  /**
   * 🔴 THE OWNER'S DECISION 3, AS CODE — a version is removed when no channel lists it and no row
   * holds it, and not before. Nothing is collected before the one-time copy: until then the
   * records ARE the station's library.
   */
  #collect(): void {
    if (!this.#migrated) return;
    const kept = new Set<string>([...this.#holds.values(), ...this.#pins.keys()]);
    for (const list of this.#lists.values())
      for (const versionId of list.values()) kept.add(versionId);
    for (const [versionId, version] of this.#versions) {
      if (kept.has(versionId)) continue;
      this.#versions.delete(versionId);
      if (this.#byServeKey.get(version.serveKey) === versionId) {
        this.#byServeKey.delete(version.serveKey);
      }
      if (version.file === null) continue;
      try {
        fs.rmSync(version.file, { force: true });
      } catch (err) {
        process.stderr.write(
          `[caspar-bridge] ⚠ failed to delete template record ${version.file}: ` +
            `${err instanceof Error ? err.message : String(err)}\n`,
        );
      }
    }
  }

  #indexFile(): string | null {
    return this.#persistDir === null ? null : path.join(this.#persistDir, INDEX_FILE);
  }

  /** Atomically persist the lists and holds. Non-fatal on error. */
  #persistIndex(): void {
    const file = this.#indexFile();
    if (file === null || this.#persistDir === null) return;
    const lists: Record<string, { templateId: string; versionId: string }[]> = {};
    for (const [channel, list] of [...this.#lists.entries()].sort((a, b) => a[0] - b[0])) {
      lists[String(channel)] = [...list.entries()].map(([templateId, versionId]) => ({
        templateId,
        versionId,
      }));
    }
    const holds: Record<string, string> = Object.fromEntries(this.#holds);
    try {
      fs.mkdirSync(this.#persistDir, { recursive: true });
      const tmp = `${file}.tmp`;
      fs.writeFileSync(
        tmp,
        `${JSON.stringify({ v: 1, lists, holds } satisfies z.input<typeof PersistedIndexSchema>, null, 2)}\n`,
        'utf8',
      );
      fs.renameSync(tmp, file);
    } catch (err) {
      process.stderr.write(
        `[caspar-bridge] ⚠ failed to persist the template lists ${file}: ` +
          `${err instanceof Error ? err.message : String(err)} — the change is live in memory ` +
          `but will not survive a bridge restart\n`,
      );
    }
  }
}
