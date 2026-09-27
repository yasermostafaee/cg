import type { MediaQuery, PlayoutSourcesProvider } from '../../src/playout-sources.js';
import {
  FAKE_INPUTS,
  answerFakeMediaQuery,
  fakeMediaLibrary,
  nextEpoch,
  renumberHolders,
  type FakeInput,
  type FakeMediaItem,
} from './fake-playout.js';

/**
 * 🔴 `PLAYOUT-SOURCES-01` §1.G — **THE AUTH-OFF PROVIDER: the Playout's two lists, served locally,
 * behind the SAME interface the Playout's HTTP reader implements.**
 *
 * With auth off there is no Playout, so nothing could ever be bound. A test (or a dev embedder) hands
 * this to `createBridge({ playoutSources })`, and from there on the path is the product's own: the
 * same `PlayoutSources` reader, the same persisted stores and the same ONE builder
 * (`buildPlayoutSourceCatalog`). Only the source of the two lists differs.
 *
 * ⚠ **TEST-ONLY, AND NEVER IN THE INSTALLER.** It lives under `tests/`, which `tsc -b` does not
 * build and the sidecar bundle (`scripts/bundle.mjs`) never reaches; `desktop-sidecar.test.ts`
 * reads the bundle the installer ships and asserts {@link LOCAL_PLAYOUT_SOURCES_MARKER} is not in it.
 * Its answers are the fake Playout's ({@link answerFakeMediaQuery}, {@link FAKE_INPUTS}), so an
 * in-process test and an HTTP one cannot come to disagree about what the Playout said.
 */

/** A string only this module carries — the bundle test's subject. */
export const LOCAL_PLAYOUT_SOURCES_MARKER = 'cg-local-playout-sources-test-only';

export interface LocalPlayoutSourcesOptions {
  readonly inputs?: readonly FakeInput[];
  readonly media?: readonly FakeMediaItem[];
  readonly epoch?: number | string | null;
}

export class LocalPlayoutSources implements PlayoutSourcesProvider {
  readonly marker = LOCAL_PLAYOUT_SOURCES_MARKER;
  #inputs: readonly FakeInput[];
  #epoch: number | string | null;
  #revision = 0;
  readonly #library: Map<string, FakeMediaItem>;
  readonly #removed = new Map<string, FakeMediaItem>();
  /** When set, every read fails — the Playout "down" with auth off. */
  #failing = false;
  /** Every `ids=` read, in order — the one retry's positive control. */
  readonly idsReads: string[][] = [];

  constructor(options: LocalPlayoutSourcesOptions = {}) {
    this.#inputs = options.inputs ?? FAKE_INPUTS;
    this.#epoch = options.epoch === undefined ? 'epoch-1' : options.epoch;
    this.#library = new Map((options.media ?? fakeMediaLibrary()).map((m) => [m.id, m]));
  }

  readInputs(etag: string | null): ReturnType<PlayoutSourcesProvider['readInputs']> {
    if (this.#failing) return Promise.resolve({ kind: 'failed' });
    const current = `"local-${String(this.#revision)}"`;
    if (etag === current) return Promise.resolve({ kind: 'not-modified' });
    return Promise.resolve({
      kind: 'ok',
      body: {
        ...(this.#epoch !== null ? { epoch: this.#epoch } : {}),
        inputs: this.#inputs,
      },
      etag: current,
    });
  }

  searchMedia(query: MediaQuery): ReturnType<PlayoutSourcesProvider['searchMedia']> {
    if (this.#failing) return Promise.resolve({ kind: 'failed', reason: 'playout-unreachable' });
    const params = new URLSearchParams();
    params.set('q', query.q);
    params.set('type', 'video,still');
    params.set('sort', query.sort ?? 'name');
    params.set('limit', String(query.limit ?? 50));
    if (query.cursor !== undefined) params.set('cursor', query.cursor);
    const page = answerFakeMediaQuery(this.#library.values(), params);
    return Promise.resolve(
      page === null ? { kind: 'failed', reason: 'playout-refused' } : { kind: 'ok', body: page },
    );
  }

  readMediaByIds(ids: readonly string[]): ReturnType<PlayoutSourcesProvider['readMediaByIds']> {
    this.idsReads.push([...ids]);
    if (this.#failing) return Promise.resolve({ kind: 'failed' });
    const page = answerFakeMediaQuery(
      this.#library.values(),
      new URLSearchParams({ ids: ids.join(',') }),
    );
    return Promise.resolve(page === null ? { kind: 'failed' } : { kind: 'ok', body: page });
  }

  // ── Test hooks, the fake Playout's own ────────────────────────────────────────────────────

  setFailing(failing: boolean): void {
    this.#failing = failing;
  }

  removeInput(id: string): void {
    this.#inputs = this.#inputs.filter((i) => i.id !== id);
    this.#revision += 1;
  }

  restoreInput(id: string): void {
    const wanted = new Set([...this.#inputs.map((i) => i.id), id]);
    this.#inputs = FAKE_INPUTS.filter((i) => wanted.has(i.id));
    this.#revision += 1;
  }

  setEpoch(epoch: number | string | null): void {
    this.#epoch = epoch;
    this.#revision += 1;
  }

  /**
   * `ROUTE-PLATES-01` — an input's signal comes or goes, as the Playout reports it: `available` and
   * its `reason`, on the entry it lists now (the list keeps its order).
   */
  setAvailable(id: string, available: boolean, reason?: string): void {
    this.#inputs = this.#inputs.map((i) => {
      if (i.id !== id) return i;
      const next: { -readonly [K in keyof FakeInput]: FakeInput[K] } = { ...i, available };
      delete next.reason;
      if (reason !== undefined) next.reason = reason;
      return next;
    });
    this.#revision += 1;
  }

  /**
   * `ROUTE-PLATES-01` §1.H — **a core restart, as the Playout lives it**: a new `epoch` (it never
   * repeats), every held input's holder LAYER renumbered, and — through `dropAmcp`, which the test
   * wires to the AMCP mock's `closeAllAmcpConnections` — the AMCP connection dropped. Answers the new
   * epoch.
   */
  simulateCoreRestart(options: { readonly dropAmcp?: () => void } = {}): number | string {
    const next = nextEpoch(this.#epoch);
    this.#epoch = next;
    this.#inputs = renumberHolders(this.#inputs);
    this.#revision += 1;
    options.dropAmcp?.();
    return next;
  }

  mediaItem(id: string): FakeMediaItem | undefined {
    return this.#library.get(id);
  }

  removeMedia(id: string): void {
    const item = this.#library.get(id);
    if (item === undefined) return;
    this.#library.delete(id);
    this.#removed.set(id, item);
  }

  restoreMedia(id: string): void {
    const item = this.#removed.get(id);
    if (item === undefined) return;
    this.#removed.delete(id);
    this.#library.set(id, item);
  }

  /** Point one item at another path (the cache ⇄ original move, §2.1). Answers the new clip. */
  setMediaClip(id: string, clip: string): string {
    const item = this.#library.get(id);
    if (item === undefined) throw new Error(`local Playout: no media item ${id}`);
    this.#library.set(id, { ...item, clip });
    return clip;
  }
}
