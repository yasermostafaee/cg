import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  BoundMediaStateSchema,
  EMPTY_PLAYOUT_INPUTS,
  LIVE_SOURCE_FORMATS,
  PlayoutInputsStateSchema,
  buildPlayoutSourceCatalog,
  foldPlayoutInputsRead,
  mediaSourceId,
  parsePlayoutInputs,
  parsePlayoutJson,
  parsePlayoutMediaPage,
  playoutMediaIdOf,
  toBoundMedia,
  type BoundMediaItem,
  type ConsoleMediaItem,
  type LiveSourceLayerRange,
  type MediaSearchFailure,
  type PlayoutInputsState,
  type PlayoutMediaItem,
  type SourceCatalog,
} from '@cg/shared-ipc';
import { playoutFetch } from './playout-http.js';

/**
 * 🔴 `PLAYOUT-SOURCES-01` — **THE PLAYOUT'S INPUTS (D10) AND MEDIA (D11), READ AND KEPT.**
 *
 * D4's reader is the pattern (`playout-catalogue.ts`): the bearer checked at USE, a tick that only
 * LOOKS for a due read, a read at sign-in, never in the path of a verb. **Except one rule, turned
 * over on purpose (ADR 0010 rule 14):** a failed read here does NOT make anything absent. D4's rows
 * are labels, and a stale label is worse than none; these lists decide what a plate PLAYS, and an
 * outage must never change a verdict — so the last good list is PERSISTED and stays in force across
 * an outage and a restart. A failed read, and a `304`, change nothing.
 *
 * What is kept is exactly two things: the last good input list (with the inputs that left it, never
 * deleted), and the media items this station has BOUND. Nothing else from the library is stored.
 */

/** D10 and the bound media are re-read at most this often while signed in (the contract's period). */
export const SOURCES_POLL_MS = 30_000;
/** A picker opening reads again only when the last read is older than this. */
export const PICKER_FRESH_MS = 5_000;
/** How often the tick LOOKS for a due read (not how often it reads). */
export const SOURCES_TICK_MS = 1_000;
/** A media search page, bounded. */
export const MEDIA_SEARCH_TIMEOUT_MS = 5_000;
/** The one retry's fresh read, bounded (§1.C). */
export const RETRY_READ_TIMEOUT_MS = 1_500;
/** D10 and `ids=` reads, bounded. */
const HTTP_TIMEOUT_MS = 5_000;
/** `ids=` takes at most 100 ids per call (the contract). */
export const IDS_PER_CALL = 100;
/** How many recent search answers are kept for binding — the bridge's own reads, never the console's. */
const RECENT_ANSWERS_MAX = 2_000;

/** One media search, as the console asks it. */
export interface MediaQuery {
  readonly q: string;
  readonly sort?: 'name' | 'recent' | undefined;
  readonly cursor?: string | undefined;
  readonly limit?: number | undefined;
}

/** What a media search answers the console. */
export type MediaSearchAnswer =
  | {
      readonly ok: true;
      readonly items: ConsoleMediaItem[];
      readonly total: number;
      readonly nextCursor: string | null;
    }
  | { readonly ok: false; readonly reason: MediaSearchFailure; readonly message: string };

/**
 * 🔴 `PLAYOUT-SOURCES-01` §1.G — **WHERE THE LISTS COME FROM.** The Playout over HTTP in production;
 * with auth off there is no Playout, and a test injects a local provider behind this SAME interface
 * (`tests/support/local-playout-sources.ts` — never under `src/`, so never in the installed app).
 * Whatever supplies them, the one builder after it is the same.
 */
export interface PlayoutSourcesProvider {
  /** D10. `etag` is the one held, for `If-None-Match`. */
  readInputs(
    etag: string | null,
  ): Promise<
    | { readonly kind: 'ok'; readonly body: unknown; readonly etag: string | null }
    | { readonly kind: 'not-modified' }
    | { readonly kind: 'failed' }
  >;
  /** D11 search: one page. */
  searchMedia(
    query: MediaQuery,
  ): Promise<
    | { readonly kind: 'ok'; readonly body: unknown }
    | { readonly kind: 'failed'; readonly reason: MediaSearchFailure }
  >;
  /** D11 by id (at most {@link IDS_PER_CALL}), bounded by `timeoutMs`. */
  readMediaByIds(
    ids: readonly string[],
    timeoutMs: number,
  ): Promise<{ readonly kind: 'ok'; readonly body: unknown } | { readonly kind: 'failed' }>;
}

/** The Playout's own D10/D11 over HTTP — server-side, no `Origin`, no proxy (B1.4), bearer at use. */
export class HttpPlayoutSources implements PlayoutSourcesProvider {
  readonly #inputsUrl: string;
  readonly #mediaUrl: string;
  readonly #bearer: () => string | null;
  readonly #fetch: typeof fetch;

  constructor(
    urls: { readonly inputsUrl: string; readonly mediaUrl: string },
    bearer: () => string | null,
    fetchImpl: typeof fetch = playoutFetch,
  ) {
    this.#inputsUrl = urls.inputsUrl;
    this.#mediaUrl = urls.mediaUrl;
    this.#bearer = bearer;
    this.#fetch = fetchImpl;
  }

  async readInputs(etag: string | null): ReturnType<PlayoutSourcesProvider['readInputs']> {
    const bearer = this.#bearer();
    if (bearer === null) return { kind: 'failed' };
    try {
      const headers: Record<string, string> = { Authorization: `Bearer ${bearer}` };
      if (etag !== null) headers['If-None-Match'] = etag;
      const res = await this.#fetch(this.#inputsUrl, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
      });
      if (res.status === 304) return { kind: 'not-modified' };
      if (!res.ok) return { kind: 'failed' };
      // `ROUTE-PLATES-01` — from the TEXT, so the 64-bit `epoch` arrives digit for digit.
      return {
        kind: 'ok',
        body: parsePlayoutJson(await res.text()),
        etag: res.headers.get('etag'),
      };
    } catch {
      return { kind: 'failed' };
    }
  }

  async searchMedia(query: MediaQuery): ReturnType<PlayoutSourcesProvider['searchMedia']> {
    const bearer = this.#bearer();
    if (bearer === null) return { kind: 'failed', reason: 'playout-refused' };
    const params = new URLSearchParams();
    params.set('q', query.q);
    params.set('type', 'video,still');
    params.set('sort', query.sort ?? 'name');
    params.set('limit', String(query.limit ?? 50));
    if (query.cursor !== undefined) params.set('cursor', query.cursor);
    try {
      const res = await this.#fetch(`${this.#mediaUrl}?${params.toString()}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${bearer}` },
        signal: AbortSignal.timeout(MEDIA_SEARCH_TIMEOUT_MS),
      });
      if (res.status >= 400 && res.status < 500)
        return { kind: 'failed', reason: 'playout-refused' };
      if (!res.ok) return { kind: 'failed', reason: 'playout-unreachable' };
      return { kind: 'ok', body: await res.json() };
    } catch {
      return { kind: 'failed', reason: 'playout-unreachable' };
    }
  }

  async readMediaByIds(
    ids: readonly string[],
    timeoutMs: number,
  ): ReturnType<PlayoutSourcesProvider['readMediaByIds']> {
    const bearer = this.#bearer();
    if (bearer === null) return { kind: 'failed' };
    try {
      const res = await this.#fetch(
        `${this.#mediaUrl}?ids=${ids.map(encodeURIComponent).join(',')}`,
        {
          method: 'GET',
          headers: { Authorization: `Bearer ${bearer}` },
          signal: AbortSignal.timeout(timeoutMs),
        },
      );
      if (!res.ok) return { kind: 'failed' };
      return { kind: 'ok', body: await res.json() };
    } catch {
      return { kind: 'failed' };
    }
  }
}

// ── The two stores ──────────────────────────────────────────────────────────

/**
 * Load a persisted store. ABSENT → the empty value. PRESENT but unusable → the empty value AND a
 * boot line: unlike the hand-made catalogue, these files are the bridge's own cache of the Playout's
 * answers, and the next good read rebuilds them — a station must not refuse to boot over one.
 */
function loadStore<T>(
  file: string | undefined,
  schema: { safeParse: (v: unknown) => { success: true; data: T } | { success: false } },
  empty: T,
  log: (line: string) => void,
): T {
  if (file === undefined) return empty;
  let raw: string;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT')
      log(`cannot read ${file}; starting empty`);
    return empty;
  }
  try {
    const parsed = schema.safeParse(JSON.parse(raw));
    if (parsed.success) return parsed.data;
  } catch {
    // fall through
  }
  log(`${file} is unusable; starting empty until the next good read`);
  return empty;
}

/** `promise`'s value, or `undefined` once `ms` passed first. The timer is released either way. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), ms);
    timer.unref?.();
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** Atomically persist (mkdir -p + tmp + rename), the store precedent. */
function saveStore(file: string | undefined, value: unknown): void {
  if (file === undefined) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, file);
}

// ── The reader ──────────────────────────────────────────────────────────────

export interface PlayoutSourcesOptions {
  /** Where the lists come from; `null` = nowhere (auth off with nothing injected). */
  readonly provider: PlayoutSourcesProvider | null;
  /** Whether a bearer is usable NOW — the "while signed in" of every cadence. */
  readonly signedIn: () => boolean;
  /** D4's join, for an input's `casparHost` and for `compatibleChannels` (§0.9). */
  readonly hostIsOurs: (casparHost: string) => boolean;
  readonly channelFor: (casparHost: string, casparChannel: number) => number | null;
  /** The persisted stores; absent = memory only (tests, embedders). */
  readonly inputsPath?: string | undefined;
  readonly boundMediaPath?: string | undefined;
  /** The plate band in force, carried on the catalogue. */
  readonly layerRange?: LiveSourceLayerRange | undefined;
  /** TEST-ONLY. */
  readonly now?: () => number;
  readonly tickMs?: number;
  readonly log?: (line: string) => void;
}

export class PlayoutSources {
  readonly #provider: PlayoutSourcesProvider | null;
  readonly #signedIn: () => boolean;
  readonly #hostIsOurs: (casparHost: string) => boolean;
  readonly #channelFor: (casparHost: string, casparChannel: number) => number | null;
  readonly #inputsPath: string | undefined;
  readonly #boundMediaPath: string | undefined;
  readonly #now: () => number;
  readonly #tickMs: number;
  readonly #log: (line: string) => void;

  #inputs: PlayoutInputsState;
  #etag: string | null = null;
  readonly #media = new Map<string, BoundMediaItem>();
  readonly #recent = new Map<string, PlayoutMediaItem>();
  #layerRange: LiveSourceLayerRange | undefined;
  #catalog: SourceCatalog;
  #lastInputsReadMs = Number.NEGATIVE_INFINITY;
  #lastMediaReadMs = Number.NEGATIVE_INFINITY;
  #inputsInFlight: Promise<boolean> | null = null;
  #mediaInFlight: Promise<void> | null = null;
  #ticker: ReturnType<typeof setInterval> | null = null;
  #inputReads = 0;
  #mediaReads = 0;
  readonly #handlers = new Set<(catalog: SourceCatalog) => void>();

  constructor(options: PlayoutSourcesOptions) {
    this.#provider = options.provider;
    this.#signedIn = options.signedIn;
    this.#hostIsOurs = options.hostIsOurs;
    this.#channelFor = options.channelFor;
    this.#inputsPath = options.inputsPath;
    this.#boundMediaPath = options.boundMediaPath;
    this.#now = options.now ?? ((): number => Date.now());
    this.#tickMs = options.tickMs ?? SOURCES_TICK_MS;
    this.#log =
      options.log ??
      ((line: string): void => void process.stderr.write(`[caspar-bridge] ${line}\n`));
    this.#layerRange = options.layerRange;
    this.#inputs = loadStore(
      this.#inputsPath,
      PlayoutInputsStateSchema,
      EMPTY_PLAYOUT_INPUTS,
      this.#log,
    );
    const media = loadStore(this.#boundMediaPath, BoundMediaStateSchema, { items: [] }, this.#log);
    for (const item of media.items) this.#media.set(item.id, item);
    this.#catalog = this.#build();
  }

  /** The catalogue in force — synchronous; nothing waits on the Playout. */
  catalog(): SourceCatalog {
    return this.#catalog;
  }

  /** D10 requests actually issued — a cadence test's positive control. */
  get inputReadCount(): number {
    return this.#inputReads;
  }

  /** `ids=` requests actually issued (the retry's included). */
  get mediaReadCount(): number {
    return this.#mediaReads;
  }

  /** Called with the catalogue whenever it CHANGES. Returns an unsubscribe. */
  onCatalogChanged(handler: (catalog: SourceCatalog) => void): () => void {
    this.#handlers.add(handler);
    return () => {
      this.#handlers.delete(handler);
    };
  }

  /** Arm the tick. `unref`'d, so it never holds the process open. */
  start(): void {
    if (this.#ticker !== null || this.#provider === null) return;
    this.#ticker = setInterval(() => {
      void this.refresh(SOURCES_POLL_MS);
    }, this.#tickMs);
    this.#ticker.unref();
  }

  dispose(): void {
    if (this.#ticker !== null) clearInterval(this.#ticker);
    this.#ticker = null;
  }

  /** The plate band moved: carried on the catalogue, nothing read. */
  setLayerRange(range: LiveSourceLayerRange | undefined): void {
    this.#layerRange = range;
    this.#rebuild();
  }

  /**
   * Read D10 and the bound media if the last read is at least `floorMs` old — the tick passes the
   * 30 s period; a sign-in and a picker opening pass {@link PICKER_FRESH_MS}. Never rejects, and a
   * console never waits on it (`sources.refresh` answers at once).
   */
  refresh(floorMs: number = PICKER_FRESH_MS): Promise<void> {
    if (this.#provider === null || !this.#signedIn()) return Promise.resolve();
    return Promise.all([this.#refreshInputs(floorMs), this.#refreshMedia(floorMs)]).then(
      () => undefined,
    );
  }

  #refreshInputs(floorMs: number): Promise<void> {
    if (this.#inputsInFlight !== null) return this.#inputsInFlight.then(() => undefined);
    if (this.#now() - this.#lastInputsReadMs < floorMs) return Promise.resolve();
    return this.#startInputsRead().then(() => undefined);
  }

  /** Start one D10 read now; it is the one in flight until it settles. Answers whether it succeeded. */
  #startInputsRead(): Promise<boolean> {
    this.#lastInputsReadMs = this.#now();
    this.#inputReads += 1;
    const read: Promise<boolean> = this.#readInputs().finally(() => {
      if (this.#inputsInFlight === read) this.#inputsInFlight = null;
    });
    this.#inputsInFlight = read;
    return read;
  }

  /**
   * 🔴 `ROUTE-PLATES-01` rule 5 — **READ D10 NOW, BOUNDED**: after an AMCP reconnect, when an epoch
   * change is seen, and before a route plate is seated again. A read already in flight began BEFORE
   * the question was asked, so it cannot answer it: a fresh read starts after it. Answers the
   * catalogue's canonical epoch once a successful read (a `304` included) lands within `timeoutMs`,
   * else `{ ok: false }` — the read itself runs on and lands whenever it lands, like every other.
   */
  confirmInputs(
    timeoutMs: number = RETRY_READ_TIMEOUT_MS,
  ): Promise<{ readonly ok: true; readonly epoch?: string } | { readonly ok: false }> {
    if (this.#provider === null || !this.#signedIn()) return Promise.resolve({ ok: false });
    const before = this.#inputsInFlight ?? Promise.resolve(true);
    const read = before.then(() => this.#startInputsRead());
    return withTimeout(read, timeoutMs).then((ok) => {
      if (ok !== true) return { ok: false } as const;
      const epoch = this.#catalog.inputsEpoch;
      return epoch === undefined ? { ok: true as const } : { ok: true as const, epoch };
    });
  }

  async #readInputs(): Promise<boolean> {
    const provider = this.#provider;
    if (provider === null) return false;
    const held = this.#inputs.readAt === undefined ? null : this.#etag;
    const result = await provider.readInputs(held);
    const at = new Date(this.#now()).toISOString();
    if (result.kind === 'failed') return false; // A failed read changes nothing — rule 14.
    if (result.kind === 'not-modified') {
      this.#inputs = { ...this.#inputs, readAt: at };
    } else {
      const read = parsePlayoutInputs(result.body);
      if (read === null) return false; // A body we cannot read is a failed read.
      // §1.B — an unknown format is read as AUTO plus the Playout's aspect, and reported.
      const known = new Set(LIVE_SOURCE_FORMATS.map((f) => f.toLowerCase()));
      for (const input of read.inputs) {
        if (input.format !== undefined && !known.has(input.format.trim().toLowerCase())) {
          this.#log(
            `D10 input ${input.id}: format ${JSON.stringify(input.format)} is not one this product ` +
              `knows; read as AUTO with the Playout's aspect`,
          );
        }
      }
      this.#inputs = foldPlayoutInputsRead(this.#inputs, read, at);
      this.#etag = result.etag;
    }
    saveStore(this.#inputsPath, this.#inputs);
    this.#rebuild();
    return true;
  }

  #refreshMedia(floorMs: number): Promise<void> {
    if (this.#mediaInFlight !== null) return this.#mediaInFlight;
    if (this.#media.size === 0) return Promise.resolve();
    if (this.#now() - this.#lastMediaReadMs < floorMs) return Promise.resolve();
    this.#lastMediaReadMs = this.#now();
    this.#mediaInFlight = this.#readBound([...this.#media.keys()], HTTP_TIMEOUT_MS)
      .then(() => undefined)
      .finally(() => {
        this.#mediaInFlight = null;
      });
    return this.#mediaInFlight;
  }

  /**
   * Re-read bound items by `ids=`, at most 100 per call. A SUCCESSFUL read updates each item it lists
   * (its `clip` above all, which moves between cache and original) and marks the ones it leaves out
   * `unavailable`; a failed one changes nothing. Answers whether every call succeeded.
   */
  async #readBound(ids: readonly string[], timeoutMs: number): Promise<boolean> {
    const provider = this.#provider;
    if (provider === null) return false;
    let allOk = true;
    let changed = false;
    for (let at = 0; at < ids.length; at += IDS_PER_CALL) {
      const batch = ids.slice(at, at + IDS_PER_CALL);
      this.#mediaReads += 1;
      const result = await provider.readMediaByIds(batch, timeoutMs);
      const page = result.kind === 'ok' ? parsePlayoutMediaPage(result.body) : null;
      if (page === null) {
        allOk = false;
        continue;
      }
      const listed = new Map(page.items.map((i) => [i.id, i] as const));
      for (const id of batch) {
        const held = this.#media.get(id);
        if (held === undefined) continue;
        const fresh = listed.get(id);
        const next =
          fresh === undefined
            ? { ...held, unavailable: true as const }
            : toBoundMedia(fresh, held.lastBoundAt);
        if (JSON.stringify(next) !== JSON.stringify(held)) {
          this.#media.set(id, next);
          changed = true;
        }
      }
    }
    if (changed) {
      this.#saveMedia();
      this.#rebuild();
    }
    return allOk;
  }

  /** Search D11 on the Playout's side; the answer is kept for binding, the `clip` never sent on. */
  async searchMedia(query: MediaQuery): Promise<MediaSearchAnswer> {
    const provider = this.#provider;
    if (provider === null) {
      return { ok: false, reason: 'playout-unreachable', message: 'The Playout did not answer.' };
    }
    const result = await provider.searchMedia(query);
    if (result.kind === 'failed') {
      return {
        ok: false,
        reason: result.reason,
        message:
          result.reason === 'playout-refused'
            ? 'The Playout refused the search.'
            : 'The Playout did not answer.',
      };
    }
    const page = parsePlayoutMediaPage(result.body);
    if (page === null) {
      return { ok: false, reason: 'playout-unreachable', message: 'The Playout did not answer.' };
    }
    for (const item of page.items) this.#remember(item);
    return {
      ok: true,
      items: page.items.map((i) => ({
        id: mediaSourceId(i.id),
        name: i.name,
        ...(i.durationMs !== undefined ? { durationMs: i.durationMs } : {}),
        ...(i.width !== undefined ? { width: i.width } : {}),
        ...(i.height !== undefined ? { height: i.height } : {}),
        ...(i.folder !== undefined ? { folder: i.folder } : {}),
      })),
      total: page.total,
      nextCursor: page.nextCursor,
    };
  }

  #remember(item: PlayoutMediaItem): void {
    this.#recent.delete(item.id);
    this.#recent.set(item.id, item);
    while (this.#recent.size > RECENT_ANSWERS_MAX) {
      const oldest = this.#recent.keys().next().value;
      if (oldest === undefined) break;
      this.#recent.delete(oldest);
    }
  }

  /**
   * 🔴 §1.B — **A MEDIA ID IS BOUND FROM THE BRIDGE'S OWN READS ONLY.** Called before a binding that
   * names `md-<id>` is applied: the item comes from this bridge's recent search answers or an `ids=`
   * read, never from anything the console sent. With neither, and the Playout not answering, the bind
   * is refused in one sentence. A non-media id answers ok at once (inputs are checked by the catalogue).
   */
  async ensureBound(sourceId: string): Promise<{ ok: true } | { ok: false; message: string }> {
    const playoutId = playoutMediaIdOf(sourceId);
    if (playoutId === null) return { ok: true };
    const at = new Date(this.#now()).toISOString();
    const held = this.#media.get(playoutId);
    if (held !== undefined && held.unavailable === true) {
      return { ok: false, message: `“${held.name}” is not available in the Playout right now.` };
    }
    if (held !== undefined) {
      this.#media.set(playoutId, { ...held, lastBoundAt: at });
      this.#saveMedia();
      this.#rebuild();
      return { ok: true };
    }
    let item = this.#recent.get(playoutId);
    if (item === undefined && this.#provider !== null) {
      this.#mediaReads += 1;
      const result = await this.#provider.readMediaByIds([playoutId], HTTP_TIMEOUT_MS);
      const page = result.kind === 'ok' ? parsePlayoutMediaPage(result.body) : null;
      item = page?.items.find((i) => i.id === playoutId);
    }
    if (item === undefined) {
      return { ok: false, message: 'That media item could not be checked with the Playout.' };
    }
    this.#media.set(playoutId, toBoundMedia(item, at));
    // The item was JUST read (a search answer or an `ids=` read): the first bind starts the bound
    // set's 30 s clock, so the next periodic read is a period away rather than immediate.
    if (this.#lastMediaReadMs === Number.NEGATIVE_INFINITY) this.#lastMediaReadMs = this.#now();
    this.#saveMedia();
    this.#rebuild();
    return { ok: true };
  }

  /**
   * 🔴 §1.C — **THE ONE RETRY'S READ.** A media `PLAY` of `played` was answered `404`: read this one
   * item by `ids=`, bounded at 1.5 s, and answer its `clip` when it differs from the path played,
   * else `null` (unchanged, gone, not bound, or the Playout did not answer). The only Playout read
   * ever made inside a verb, and only on its failure path. A successful read also updates the bound
   * set, so the catalogue — and the next take — carry the fresh path.
   */
  async freshClipFor(
    sourceId: string,
    played: string,
    timeoutMs: number = RETRY_READ_TIMEOUT_MS,
  ): Promise<string | null> {
    const playoutId = playoutMediaIdOf(sourceId);
    if (playoutId === null || !this.#media.has(playoutId)) return null;
    const ok = await this.#readBound([playoutId], timeoutMs);
    if (!ok) return null;
    const after = this.#media.get(playoutId);
    return after !== undefined && after.unavailable !== true && after.clip !== played
      ? after.clip
      : null;
  }

  #saveMedia(): void {
    saveStore(this.#boundMediaPath, { items: [...this.#media.values()] });
  }

  #build(): SourceCatalog {
    return buildPlayoutSourceCatalog({
      inputs: this.#inputs,
      media: [...this.#media.values()],
      layerRange: this.#layerRange,
      hostIsOurs: this.#hostIsOurs,
      channelFor: this.#channelFor,
    });
  }

  #rebuild(): void {
    const next = this.#build();
    if (JSON.stringify(next) === JSON.stringify(this.#catalog)) return;
    this.#catalog = next;
    for (const handler of [...this.#handlers]) handler(next);
  }
}
