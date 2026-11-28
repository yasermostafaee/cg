import {
  MAX_MEDIA_THUMBNAIL_BYTES,
  playoutMediaIdOf,
  probeImage,
  type ConsoleMediaItem,
  type ConsoleSourceCatalog,
} from '@cg/shared-ipc';
import type { RuntimeBridge } from '../../../shared/runtime-bridge.js';
import { seenMediaItem } from '../sources/sourceStore.js';
import type { PvwSourceFrame } from './usePvwSourceFrames.js';

interface PosterRead {
  identity?: string | ConsoleMediaItem | null;
  frame?: PvwSourceFrame;
}

/** A file poster is independent of a passive producer's availability, and grants no crop authority. */
export class PvwMediaPosters {
  readonly #reads = new Map<string, PosterRead>();
  readonly #stops: (() => void)[] = [];
  #channel: number | undefined;
  #ids = new Set<string>();
  #editorIds = new Set<string>();
  #scope = '';

  constructor(
    private readonly api: RuntimeBridge,
    private readonly changed: () => void,
  ) {}

  setDemand(
    channel: number | undefined,
    ids: readonly string[],
    editorIds: readonly string[] = [],
  ): void {
    if (channel !== this.#channel) {
      this.#reads.clear();
      for (const stop of this.#stops.splice(0)) stop();
      this.#channel = channel;
      this.#scope = this.#owner();
      if (channel !== undefined) this.#watch();
    }
    this.#ids = new Set(ids.filter((id) => playoutMediaIdOf(id) !== null));
    const nextEditorIds = new Set(editorIds);
    for (const [id, read] of this.#reads) {
      if (
        !this.#ids.has(id) ||
        (typeof read.identity !== 'string' && this.#editorIds.has(id) !== nextEditorIds.has(id))
      )
        this.#reads.delete(id);
    }
    this.#editorIds = nextEditorIds;
  }

  frames(): readonly PvwSourceFrame[] {
    if (this.#scope !== this.#owner() || window.cg !== this.api) return [];
    return [...this.#reads.values()].flatMap(({ frame }) => (frame === undefined ? [] : [frame]));
  }

  /** Called only after a normal snapshot supplied no picture; one attempt per demanded identity. */
  request(id: string): void {
    const channel = this.#channel;
    if (
      channel === undefined ||
      !this.#ids.has(id) ||
      this.#reads.has(id) ||
      this.api.sources?.mediaThumbnail === undefined ||
      this.api.sources.config === undefined
    )
      return;
    const scope = this.#owner();
    if (scope !== this.#scope) {
      this.#scope = scope;
      this.#reads.clear();
    }
    const read: PosterRead = {};
    this.#reads.set(id, read);
    const current = (): boolean =>
      window.cg === this.api &&
      this.#channel === channel &&
      this.#ids.has(id) &&
      this.#reads.get(id) === read &&
      this.#owner() === scope;
    void (async () => {
      try {
        const before = await this.api.sources.config();
        if (!current()) return;
        read.identity = this.#identity(before, id);
        if (read.identity === null) return;
        const reply = await this.api.sources.mediaThumbnail({ id, channel });
        if (!current() || !reply.ok || reply.dataUrl === undefined) return;
        const after = await this.api.sources.config();
        if (!current() || this.#identity(after, id) !== read.identity) return;
        const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/.exec(reply.dataUrl);
        const jpegBase64 = match?.[1];
        if (
          jpegBase64 === undefined ||
          jpegBase64.length > 4 * Math.ceil(MAX_MEDIA_THUMBNAIL_BYTES / 3)
        )
          return;
        const bytes = Uint8Array.from(atob(jpegBase64), (character) => character.charCodeAt(0));
        const size = probeImage(bytes);
        if (size?.mime !== 'image/jpeg') return;
        read.frame = {
          sourceId: id,
          signal: 'unknown',
          jpegBase64,
          width: size.width,
          height: size.height,
          ...(reply.engine === undefined ? {} : { engine: reply.engine }),
          snapshotOnly: true,
        };
        this.changed();
      } catch {
        // A failed poster does not create a retry loop or start a native preview/proxy job.
      }
    })();
  }

  #owner(): string {
    return JSON.stringify([
      this.api.auth?.state?.(),
      this.api.link?.bridgeAddress?.(),
      this.api.link?.status?.(),
    ]);
  }

  #identity(catalog: ConsoleSourceCatalog, id: string): string | ConsoleMediaItem | null {
    const source = catalog.sources.find((candidate) => candidate.id === id);
    if (source === undefined) {
      // The picker and the poster endpoint already support unsaved media selections.
      // Use that exact observed item only in the editor, before the layout creates a binding.
      return this.#editorIds.has(id) ? (seenMediaItem(id) ?? null) : null;
    }
    const fingerprint = source.media?.fingerprint;
    if (
      source.origin !== 'media' ||
      fingerprint === undefined ||
      fingerprint.length === 0 ||
      (source.channels !== undefined &&
        (this.#channel === undefined || !source.channels.includes(this.#channel)))
    )
      return null;
    return JSON.stringify([id, fingerprint, source.producer]);
  }

  #watch(): void {
    const ownerChanged = (): void => {
      const scope = this.#owner();
      if (scope === this.#scope) return;
      this.#scope = scope;
      this.#reads.clear();
      this.changed();
    };
    const authStop = this.api.auth?.onStateChanged?.(ownerChanged);
    const linkStop = this.api.link?.onStatusChanged?.(ownerChanged);
    const configStop = this.api.sources?.onConfigChanged?.((catalog) => {
      let changed = false;
      for (const [id, read] of this.#reads) {
        if (read.identity !== undefined && this.#identity(catalog, id) !== read.identity) {
          this.#reads.delete(id);
          changed = true;
        }
      }
      if (changed) this.changed();
    });
    for (const stop of [authStop, linkStop, configStop])
      if (stop !== undefined) this.#stops.push(stop);
  }
}
