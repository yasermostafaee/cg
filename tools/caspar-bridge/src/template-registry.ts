import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  PageBuildSchema,
  TEMPLATE_SOURCE_MAX_BYTES,
  TemplateInfoSchema,
  type PageBuild,
  type TemplateInfo,
} from '@cg/shared-ipc';
import { compareSemver, parseSemver } from '@cg/shared-schema';
import type { ActorContext } from './actor-context.js';

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
  /**
   * 🔴 `PAGE-REBUILD-01` (`C-034`) — the template runtime that built this page. Absent on every page
   * built before the runtime was recorded.
   */
  readonly build?: PageBuild;
  /**
   * 🔴 `PAGE-REBUILD-01` — the SHA-256 of the `.vcg` this page was built from, kept in
   * {@link SOURCES_DIR}: the package the console VERIFIED at import. Absent ⇒ nothing was kept, so
   * this page cannot be built again and is listed for re-import once another runtime runs.
   */
  readonly sourceSha256?: string;
  /**
   * 🔴 `PAGE-REBUILD-01` — a rebuild by this runtime failed and the page was kept. A console with the
   * same runtime does not try again (the operator was told once); one with another runtime does.
   */
  readonly rebuildFailed?: { readonly runtimeBuild: string; readonly reason: string };
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
  /** `PAGE-REBUILD-01` — see {@link StoredVersion.build}. Absent on every record written before. */
  build: PageBuildSchema.optional(),
  /** `PAGE-REBUILD-01` — see {@link StoredVersion.sourceSha256}. */
  sourceSha256: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .optional(),
  /** `PAGE-REBUILD-01` — see {@link StoredVersion.rebuildFailed}. */
  rebuildFailed: z.object({ runtimeBuild: z.string().min(1), reason: z.string() }).optional(),
});

/**
 * 🔴 `PAGE-REBUILD-01` (`C-034`) — **THE KEPT PACKAGES**, a subdirectory of the template store: one
 * `<sha256>.vcg` per package, the exact bytes a console verified at import. A directory is never a
 * record (`B-116`'s {@link RECORD_NAME} matches files only), so the record loader cannot read one.
 */
const SOURCES_DIR = 'template-sources';
const SOURCE_NAME = /^([0-9a-f]{64})\.vcg$/;

/**
 * How long a package put by a console is kept before the import that names it arrives. The two are
 * separate frames, and a collection in between (another channel's removal) must not delete it.
 */
const SOURCE_GRACE_MS = 30 * 60_000;

/** One rebuild outcome the runtime records and announces. */
export interface AppliedRebuild {
  readonly from: {
    readonly versionId: string;
    readonly info: TemplateInfo;
    readonly build?: PageBuild;
  };
  readonly to: {
    readonly versionId: string;
    readonly info: TemplateInfo;
    readonly build: PageBuild;
  };
  /** The console's actor, captured when the page was sent (a deferred swap lands later). */
  readonly actor: ActorContext | null;
}

/**
 * 🔴 `PAGE-REBUILD-01` — **WAS THIS PAGE BUILT BY A NEWER CG CONTROL?** A console never rebuilds such
 * a page: two consoles of different patch releases on one bridge would otherwise rebuild each other's
 * pages back and forth. Fails OPEN on an unreadable version (a dev build's), like `runtimeShortfall`.
 */
/** A version with no failed-rebuild mark: a fresh build or package supersedes the old failure. */
function withoutFailure(version: StoredVersion): StoredVersion {
  return {
    templateId: version.templateId,
    versionId: version.versionId,
    serveKey: version.serveKey,
    info: version.info,
    html: version.html,
    importedAt: version.importedAt,
    file: version.file,
    ...(version.build !== undefined && { build: version.build }),
    ...(version.sourceSha256 !== undefined && { sourceSha256: version.sourceSha256 }),
  };
}

function builtByNewer(version: StoredVersion, build: PageBuild): boolean {
  if (version.build === undefined) return false;
  const theirs = parseSemver(version.build.consoleVersion);
  const mine = parseSemver(build.consoleVersion);
  return theirs !== null && mine !== null && compareSemver(theirs, mine) > 0;
}

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
  /**
   * 🔴 `PAGE-REBUILD-01` — the kept packages: sha256 → when a console last put it in this process
   * (`null`: found on disk at boot) and, with no persist dir, the bytes themselves.
   */
  readonly #sources = new Map<string, { putAt: number | null; bytes: Buffer | null }>();
  /**
   * 🔴 `PAGE-REBUILD-01` — **REBUILT PAGES WAITING FOR THEIR OLD PAGE TO BE FREE**: old versionId →
   * the new one, and who built it. The new version is stored (and kept by {@link #collect}) but no
   * list names it until {@link settleRebuilds} finds no row with the old page on a layer. In memory
   * only: after a restart the next console builds it again.
   */
  readonly #pending = new Map<string, { to: string; actor: ActorContext | null }>();
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
        ...(record.build !== undefined && { build: record.build }),
        ...(record.sourceSha256 !== undefined && { sourceSha256: record.sourceSha256 }),
        ...(record.rebuildFailed !== undefined && { rebuildFailed: record.rebuildFailed }),
      });
      this.#byServeKey.set(serveKey, versionId);
    }
    this.#loadSources();
    this.#loadIndex();
    return { loaded: this.#versions.size, skipped };
  }

  /** `PAGE-REBUILD-01` — index the kept packages on disk (their bytes are read only when asked). */
  #loadSources(): void {
    const dir = this.#sourcesDir();
    if (dir === null) return;
    let names: string[];
    try {
      names = fs.readdirSync(dir);
    } catch {
      return; // none kept yet
    }
    for (const name of names) {
      const sha256 = SOURCE_NAME.exec(name)?.[1];
      if (sha256 !== undefined) this.#sources.set(sha256, { putAt: null, bytes: null });
    }
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
    meta: { build?: PageBuild; sourceSha256?: string } = {},
  ): { versionId: string; changed: number[] } {
    const versionId = templateVersionId(info, html);
    const changed: number[] = [];
    for (const channel of [...new Set(channels)].sort((a, b) => a - b)) {
      const list = this.#listFor(channel);
      if (list.get(info.templateId) === versionId) continue;
      list.set(info.templateId, versionId);
      changed.push(channel);
    }
    /*
      🔴 `PAGE-REBUILD-01` — a package reference is kept only when THIS store holds those bytes: a
      reference to a package that is not here would list a page as rebuildable that cannot be.
    */
    const kept = {
      ...(meta.build !== undefined && { build: meta.build }),
      ...(meta.sourceSha256 !== undefined &&
        this.#sources.has(meta.sourceSha256) && { sourceSha256: meta.sourceSha256 }),
    };
    const stored = this.#versions.get(versionId);
    if (stored === undefined) {
      /*
        ⚠ COLLECT FIRST, THEN STORE. A re-import with nothing holding the old version releases
        it, and its bare serve key with it — so the new version takes the bare id, and the next
        take's `CG ADD` line is the one it always was. Storing first would give the new version
        a qualified key for an old one about to vanish.
      */
      this.#collect();
      this.#store(info, html, versionId, kept);
    } else if (
      (kept.sourceSha256 !== undefined && stored.sourceSha256 === undefined) ||
      (kept.build !== undefined && stored.build === undefined)
    ) {
      // The same page imported again by a console that keeps what the first did not.
      this.#replace({ ...withoutFailure(stored), ...kept });
    }
    this.#persistIndex();
    this.#collect();
    return { versionId, changed };
  }

  // ── PAGE-REBUILD-01: THE KEPT PACKAGES ───────────────────────────────────────

  /**
   * 🔴 `PAGE-REBUILD-01` (`C-034`) — **KEEP ONE VERIFIED PACKAGE**, by the SHA-256 of the bytes as
   * received (never a hash a console claims). Idempotent. Refused above
   * {@link TEMPLATE_SOURCE_MAX_BYTES}; a failed write is reported and keeps nothing.
   */
  putSource(bytes: Buffer): { ok: true; sha256: string } | { ok: false; message: string } {
    if (bytes.byteLength > TEMPLATE_SOURCE_MAX_BYTES) {
      return { ok: false, message: 'The package is too large to keep for a rebuild.' };
    }
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const known = this.#sources.get(sha256);
    if (known !== undefined) {
      this.#sources.set(sha256, { ...known, putAt: Date.now() });
      return { ok: true, sha256 };
    }
    const dir = this.#sourcesDir();
    if (dir === null) {
      this.#sources.set(sha256, { putAt: Date.now(), bytes: Buffer.from(bytes) });
      return { ok: true, sha256 };
    }
    try {
      fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, `${sha256}.vcg`);
      const tmp = `${file}.${String(process.pid)}.tmp`;
      fs.writeFileSync(tmp, bytes);
      fs.renameSync(tmp, file);
    } catch (err) {
      process.stderr.write(
        `[caspar-bridge] ⚠ failed to keep a template package: ` +
          `${err instanceof Error ? err.message : String(err)} — its page cannot be rebuilt\n`,
      );
      return { ok: false, message: 'CG Bridge could not keep the package for a rebuild.' };
    }
    this.#sources.set(sha256, { putAt: Date.now(), bytes: null });
    return { ok: true, sha256 };
  }

  /** The kept package's bytes, or `null` when this store does not hold it. */
  readSource(sha256: string): Buffer | null {
    const entry = this.#sources.get(sha256);
    if (entry === undefined) return null;
    if (entry.bytes !== null) return entry.bytes;
    const dir = this.#sourcesDir();
    if (dir === null) return null;
    try {
      return fs.readFileSync(path.join(dir, `${sha256}.vcg`));
    } catch {
      return null;
    }
  }

  /** Every kept package's hash — for tests that count what is kept. */
  keptSources(): string[] {
    return [...this.#sources.keys()];
  }

  /** A stored version as the rebuild reads it, or `null`. */
  versionRecord(versionId: string): Readonly<StoredVersion> | null {
    return this.#versions.get(versionId) ?? null;
  }

  // ── PAGE-REBUILD-01: THE PLAN AND THE SWAP ───────────────────────────────────

  /**
   * 🔴 `PAGE-REBUILD-01` — **WHAT A CONSOLE RUNNING `build` SHOULD REBUILD, AND WHAT IT CANNOT.**
   * Over the pages a list names (with `channel`, that channel's list; without, every list):
   *
   * - built by `build`'s runtime → current, nothing to do;
   * - built by a NEWER CG Control → not this console's to touch;
   * - already rebuilt and waiting to be swapped in → in hand;
   * - its package kept, and no failed rebuild by this runtime → `rebuild`;
   * - otherwise → `reimport`: `failed` when this runtime's rebuild failed, else `no-source`.
   *
   * `reimport` names each template once, whatever versions or channels it is listed at.
   */
  rebuildPlan(
    build: PageBuild,
    channel?: number,
  ): {
    rebuild: { versionId: string; template: TemplateInfo; sourceSha256: string }[];
    reimport: { template: TemplateInfo; reason: 'no-source' | 'failed' }[];
  } {
    const lists =
      channel === undefined ? [...this.#lists.values()] : [this.#lists.get(channel) ?? new Map()];
    const seen = new Set<string>();
    const reimportIds = new Set<string>();
    const rebuild: { versionId: string; template: TemplateInfo; sourceSha256: string }[] = [];
    const reimport: { template: TemplateInfo; reason: 'no-source' | 'failed' }[] = [];
    for (const list of lists) {
      for (const versionId of list.values()) {
        if (seen.has(versionId)) continue;
        seen.add(versionId);
        const version = this.#versions.get(versionId);
        if (version === undefined) continue;
        if (version.build?.runtimeBuild === build.runtimeBuild) continue;
        if (builtByNewer(version, build) || this.#pending.has(versionId)) continue;
        const failed = version.rebuildFailed?.runtimeBuild === build.runtimeBuild;
        if (
          version.sourceSha256 !== undefined &&
          this.#sources.has(version.sourceSha256) &&
          !failed
        ) {
          rebuild.push({ versionId, template: version.info, sourceSha256: version.sourceSha256 });
        } else if (!reimportIds.has(version.templateId)) {
          reimportIds.add(version.templateId);
          reimport.push({ template: version.info, reason: failed ? 'failed' : 'no-source' });
        }
      }
    }
    return { rebuild, reimport };
  }

  /**
   * 🔴 `PAGE-REBUILD-01` — **ONE PAGE, BUILT AGAIN** (or the report that it could not be).
   *
   * `mayBeOnALayer(versionId)` is the caller's answer to "could a row have this page on a layer
   * now?" — only the runtime sees the rows. While it says yes, the rebuilt page is STORED and held
   * back ({@link settleRebuilds} swaps it in later); nothing a list names changes, so nothing on air
   * or loaded is touched. When it says no, every list naming the old page names the new one, at its
   * own new serve key; the old page stays stored and served while any row holds it.
   *
   * `stale` when there is nothing to do: the old page is gone or no list names it, it is current or
   * a newer CG Control built it, a rebuild of it is already waiting, or the new page is another
   * template.
   */
  rebuild(
    oldVersionId: string,
    build: PageBuild,
    result: { ok: true; info: TemplateInfo; html: string } | { ok: false; reason: string },
    mayBeOnALayer: (versionId: string) => boolean,
    actor: ActorContext | null,
  ):
    | { outcome: 'stale' }
    | { outcome: 'recorded'; from: StoredVersion }
    | { outcome: 'deferred' }
    | { outcome: 'rebuilt'; applied: AppliedRebuild } {
    const old = this.#versions.get(oldVersionId);
    if (
      old === undefined ||
      !this.#listed(oldVersionId) ||
      old.build?.runtimeBuild === build.runtimeBuild ||
      builtByNewer(old, build) ||
      this.#pending.has(oldVersionId) ||
      (result.ok && result.info.templateId !== old.templateId)
    ) {
      return { outcome: 'stale' };
    }
    if (!result.ok) {
      const failed: StoredVersion = {
        ...old,
        rebuildFailed: { runtimeBuild: build.runtimeBuild, reason: result.reason },
      };
      this.#replace(failed);
      return { outcome: 'recorded', from: failed };
    }
    const newVersionId = templateVersionId(result.info, result.html);
    const kept = {
      build,
      ...(old.sourceSha256 !== undefined && { sourceSha256: old.sourceSha256 }),
    };
    if (newVersionId === oldVersionId) {
      // The new runtime builds the very same page: nothing to serve anew, only the record moves on.
      this.#replace({ ...withoutFailure(old), ...kept });
      return {
        outcome: 'rebuilt',
        applied: {
          from: {
            versionId: oldVersionId,
            info: old.info,
            ...(old.build !== undefined && { build: old.build }),
          },
          to: { versionId: newVersionId, info: old.info, build },
          actor,
        },
      };
    }
    if (!this.#versions.has(newVersionId)) {
      this.#store(result.info, result.html, newVersionId, kept);
    }
    if (mayBeOnALayer(oldVersionId)) {
      this.#pending.set(oldVersionId, { to: newVersionId, actor });
      return { outcome: 'deferred' };
    }
    return { outcome: 'rebuilt', applied: this.#swap(oldVersionId, newVersionId, actor) };
  }

  /**
   * 🔴 `PAGE-REBUILD-01` — **SWAP IN EVERY WAITING REBUILD WHOSE OLD PAGE IS NOW FREE.** Called by the
   * runtime whenever a row's state changes, a row leaves the stack, or an ADD settles. Answers the
   * swaps made, for the audit and the push. Cheap when nothing waits.
   */
  settleRebuilds(mayBeOnALayer: (versionId: string) => boolean): AppliedRebuild[] {
    if (this.#pending.size === 0) return [];
    const applied: AppliedRebuild[] = [];
    let dropped = false;
    for (const [from, { to, actor }] of [...this.#pending]) {
      if (!this.#versions.has(from) || !this.#versions.has(to) || !this.#listed(from)) {
        // The old page left every list meanwhile (a re-import, a removal): nothing to swap, and
        // the rebuilt page nobody will list is collected below.
        this.#pending.delete(from);
        dropped = true;
        continue;
      }
      if (mayBeOnALayer(from)) continue;
      this.#pending.delete(from);
      applied.push(this.#swap(from, to, actor));
    }
    if (dropped && applied.length === 0) this.#collect();
    return applied;
  }

  /** The rows holding `versionId` (its last page was served from it). */
  holdersOf(versionId: string): string[] {
    return [...this.#holds.entries()].filter(([, v]) => v === versionId).map(([itemId]) => itemId);
  }

  /** Whether a `CG ADD` of `versionId` is in flight. */
  isPinned(versionId: string): boolean {
    return (this.#pins.get(versionId) ?? 0) > 0;
  }

  /** Whether a rebuild of `versionId` is waiting for it to be free — for tests. */
  isRebuildPending(versionId: string): boolean {
    return this.#pending.has(versionId);
  }

  #listed(versionId: string): boolean {
    for (const list of this.#lists.values()) {
      for (const v of list.values()) if (v === versionId) return true;
    }
    return false;
  }

  /** Every list naming `from` names `to` instead, in the same place. */
  #swap(from: string, to: string, actor: ActorContext | null): AppliedRebuild {
    for (const list of this.#lists.values()) {
      for (const [templateId, versionId] of list) {
        if (versionId === from) list.set(templateId, to);
      }
    }
    const old = this.#versions.get(from);
    const next = this.#versions.get(to);
    this.#persistIndex();
    this.#collect();
    if (old === undefined || next?.build === undefined) {
      throw new Error(`rebuild swap of ${from} → ${to} lost a version`);
    }
    return {
      from: {
        versionId: from,
        info: old.info,
        ...(old.build !== undefined && { build: old.build }),
      },
      to: { versionId: to, info: next.info, build: next.build },
      actor,
    };
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
  #store(
    info: TemplateInfo,
    html: string,
    versionId: string,
    kept: { build?: PageBuild; sourceSha256?: string } = {},
  ): void {
    const serveKey = this.#freeServeKey(info.templateId, versionId);
    const importedAt = new Date().toISOString();
    const file =
      this.#persistDir === null
        ? null
        : path.join(this.#persistDir, registryRecordFileName(serveKey));
    const version: StoredVersion = {
      templateId: info.templateId,
      versionId,
      serveKey,
      info,
      html,
      importedAt,
      file,
      ...(kept.build !== undefined && { build: kept.build }),
      ...(kept.sourceSha256 !== undefined && { sourceSha256: kept.sourceSha256 }),
    };
    this.#versions.set(versionId, version);
    this.#byServeKey.set(serveKey, versionId);
    this.#writeRecord(version);
  }

  /**
   * `PAGE-REBUILD-01` — a stored version's facts changed (a kept package attached, a failed rebuild
   * marked): same page, same serve key, same record file, rewritten.
   */
  #replace(version: StoredVersion): void {
    this.#versions.set(version.versionId, version);
    this.#writeRecord(version);
  }

  /** Write one version's record (atomic tmp + rename). Non-fatal on error. */
  #writeRecord(version: StoredVersion): void {
    const { file } = version;
    if (file === null || this.#persistDir === null) return;
    try {
      fs.mkdirSync(this.#persistDir, { recursive: true });
      const tmp = `${file}.tmp`;
      fs.writeFileSync(
        tmp,
        `${JSON.stringify({
          info: version.info,
          html: version.html,
          importedAt: version.importedAt,
          versionId: version.versionId,
          serveKey: version.serveKey,
          ...(version.build !== undefined && { build: version.build }),
          ...(version.sourceSha256 !== undefined && { sourceSha256: version.sourceSha256 }),
          ...(version.rebuildFailed !== undefined && { rebuildFailed: version.rebuildFailed }),
        } satisfies z.infer<typeof PersistedTemplateSchema>)}\n`,
        'utf8',
      );
      fs.renameSync(tmp, file);
    } catch (err) {
      process.stderr.write(
        `[caspar-bridge] ⚠ failed to persist template ${version.templateId}: ` +
          `${err instanceof Error ? err.message : String(err)} — the change is still live ` +
          `in memory but will not survive a bridge restart\n`,
      );
    }
  }

  #sourcesDir(): string | null {
    return this.#persistDir === null ? null : path.join(this.#persistDir, SOURCES_DIR);
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
    // `PAGE-REBUILD-01` — a rebuilt page waiting to be swapped in is kept until it is.
    for (const { to } of this.#pending.values()) kept.add(to);
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
    this.#collectSources();
  }

  /**
   * 🔴 `PAGE-REBUILD-01` — a kept package is deleted when no stored page names it, unless a console
   * put it within {@link SOURCE_GRACE_MS} (its import has not arrived yet). Found on disk at boot
   * and named by nothing, it goes at once.
   */
  #collectSources(now = Date.now()): void {
    if (this.#sources.size === 0) return;
    const named = new Set<string>();
    for (const version of this.#versions.values()) {
      if (version.sourceSha256 !== undefined) named.add(version.sourceSha256);
    }
    const dir = this.#sourcesDir();
    for (const [sha256, { putAt }] of [...this.#sources]) {
      if (named.has(sha256)) continue;
      if (putAt !== null && now - putAt < SOURCE_GRACE_MS) continue;
      this.#sources.delete(sha256);
      if (dir === null) continue;
      try {
        fs.rmSync(path.join(dir, `${sha256}.vcg`), { force: true });
      } catch (err) {
        process.stderr.write(
          `[caspar-bridge] ⚠ failed to delete a kept template package ${sha256}: ` +
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
