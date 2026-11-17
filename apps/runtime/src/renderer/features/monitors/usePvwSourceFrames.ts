import { useEffect, useMemo, useState } from 'react';
import { playoutMediaIdOf, type SourcePreviewFrame } from '@cg/shared-ipc';
import type { RuntimeBridge } from '../../../shared/runtime-bridge.js';
import { uuid } from '../../lib/uuid.js';
import { subscribeInputThumbnail } from '../sources/inputThumbnailDemand.js';

export type PvwSourceFrame = SourcePreviewFrame & { snapshotOnly?: true };

type ReadFrames = RuntimeBridge['sourcePreviews']['pvw'];
type Frames = ReadonlyMap<string, PvwSourceFrame>;
interface Reader {
  channel: number;
  sourceIds: readonly string[];
  mode: 'stage' | 'editor';
  receive(snapshot: Snapshot): void;
}
interface Snapshot {
  channel: number | undefined;
  frames: Frames;
}
interface Demand {
  channel: number;
  sourceIds: string[];
  key: string;
}
interface CachedFrame {
  frame: PvwSourceFrame;
  expires: number;
}

const EMPTY_FRAMES: Frames = new Map();
const EMPTY_SNAPSHOT: Snapshot = { channel: undefined, frames: EMPTY_FRAMES };
const POLL_MS = 500;
const EXPIRE_MS = 2500;
const SNAPSHOT_LEAD_MS = 1250;
const SNAPSHOT_EXPIRE_MS = 5000;
const POSTER_EXPIRE_MS = 15000;
const MAX_SOURCES = 4;
const feeds = new WeakMap<ReadFrames, PreviewFeed>();

/** The Bridge owns one preview view per console. Keep its leases across renderer consumers. */
class PreviewFeed {
  readonly #viewId = uuid();
  readonly #readers = new Set<Reader>();
  readonly #cache = new Map<string, CachedFrame>();
  readonly #snapshots = new Map<string, CachedFrame>();
  readonly #snapshotReaders = new Map<string, () => void>();
  #demand: Demand | undefined;
  #sentChannel: number | undefined;
  #snapshot = EMPTY_SNAPSHOT;
  #pollTimer: ReturnType<typeof setTimeout> | undefined;
  #expiryTimer: ReturnType<typeof setTimeout> | undefined;
  #inFlight = false;

  constructor(private readonly readFrames: ReadFrames) {}

  subscribe(reader: Reader): () => void {
    this.#readers.add(reader);
    this.#reconcile();
    reader.receive(this.#snapshot);
    return () => {
      this.#readers.delete(reader);
      this.#reconcile();
    };
  }

  #reconcile(): void {
    const readers = [...this.#readers].reverse();
    const primary = readers.find(({ mode }) => mode === 'editor') ?? readers[0];
    const channel = primary?.channel;
    const sourceIds =
      primary === undefined
        ? []
        : [
            ...new Set([
              ...primary.sourceIds,
              ...readers
                .filter((reader) => reader !== primary && reader.channel === channel)
                .flatMap(({ sourceIds }) => sourceIds),
            ]),
          ].slice(0, MAX_SOURCES);
    const demand =
      channel === undefined
        ? undefined
        : { channel, sourceIds, key: JSON.stringify([channel, sourceIds]) };
    if (demand?.key === this.#demand?.key) return;
    // Closing/reopening effects in the same render can briefly remove the last reader.
    // Keep its pictures until the corresponding empty release actually starts.
    if (channel !== this.#snapshot.channel) {
      for (const stop of this.#snapshotReaders.values()) stop();
      this.#snapshotReaders.clear();
      if (channel !== undefined) {
        this.#cache.clear();
        this.#snapshots.clear();
      }
    }
    this.#demand = demand;
    if (demand !== undefined) this.#publish();
    this.#schedule(0);
  }

  #publish(): void {
    clearTimeout(this.#expiryTimer);
    const now = Date.now();
    for (const cache of [this.#cache, this.#snapshots])
      for (const [id, entry] of cache) if (entry.expires <= now) cache.delete(id);
    const nextSnapshotCheck = this.#reconcileSnapshots(now);
    const frames = new Map([...this.#cache].map(([id, { frame }]) => [id, frame]));
    for (const [id, { frame }] of this.#snapshots) {
      const current = frames.get(id);
      if (current?.jpegBase64 === undefined) frames.set(id, frame);
    }
    this.#snapshot = {
      channel: this.#demand?.channel,
      frames,
    };
    for (const reader of this.#readers) reader.receive(this.#snapshot);
    const expires = Math.min(
      nextSnapshotCheck,
      ...[...this.#cache.values(), ...this.#snapshots.values()].map((entry) => entry.expires),
    );
    if (Number.isFinite(expires))
      this.#expiryTimer = setTimeout(() => this.#publish(), expires - now);
  }

  /** A stalled PVW lease must not hide snapshots already available to the input picker. */
  #reconcileSnapshots(now: number): number {
    const channel = this.#demand?.channel;
    const ids = this.#demand?.sourceIds ?? [];
    for (const id of this.#snapshots.keys()) if (!ids.includes(id)) this.#snapshots.delete(id);
    const needsSnapshot = new Set<string>();
    let nextCheck = Infinity;
    for (const id of ids) {
      const primary = this.#cache.get(id);
      // The PVW decoder can lose its lease while a separate input snapshot still has signal.
      // Media has no live-input snapshot to use after an explicit absence.
      if (primary?.frame.signal === 'absent' && playoutMediaIdOf(id) !== null) {
        this.#snapshots.delete(id);
        continue;
      }
      if (primary?.frame.jpegBase64 === undefined || primary.expires - SNAPSHOT_LEAD_MS <= now) {
        needsSnapshot.add(id);
      } else {
        nextCheck = Math.min(nextCheck, primary.expires - SNAPSHOT_LEAD_MS);
      }
    }
    for (const [id, stop] of this.#snapshotReaders) {
      if (needsSnapshot.has(id)) continue;
      stop();
      this.#snapshotReaders.delete(id);
    }
    if (channel === undefined || window.cg?.sourcePreviews?.thumbnails === undefined)
      return Infinity;
    for (const id of needsSnapshot) {
      if (this.#snapshotReaders.has(id)) continue;
      const stop = subscribeInputThumbnail({
        channel,
        sourceId: id,
        publish: (frame) => {
          if (frame === undefined) return;
          if (frame.signal === 'absent') {
            if (this.#snapshots.delete(id)) this.#publish();
          } else if (frame.jpegBase64 !== undefined) {
            const expires = playoutMediaIdOf(id) === null ? SNAPSHOT_EXPIRE_MS : POSTER_EXPIRE_MS;
            this.#snapshots.set(id, {
              frame: { ...frame, snapshotOnly: true },
              expires: Date.now() + expires,
            });
            this.#publish();
          }
        },
      });
      this.#snapshotReaders.set(id, stop);
    }
    return nextCheck;
  }

  #schedule(delay: number): void {
    clearTimeout(this.#pollTimer);
    if (!this.#inFlight) this.#pollTimer = setTimeout(() => void this.#poll(), delay);
  }

  async #poll(): Promise<void> {
    const demand = this.#demand;
    const channel = demand?.channel ?? this.#sentChannel;
    if (channel === undefined) return;
    this.#inFlight = true;
    this.#sentChannel = demand?.channel;
    if (demand === undefined) {
      this.#cache.clear();
      this.#snapshots.clear();
      this.#publish();
    }
    try {
      const { frames } = await this.readFrames({
        channel,
        viewId: this.#viewId,
        sourceIds: demand?.sourceIds ?? [],
      });
      const current = this.#demand;
      if (demand !== undefined && current?.channel === channel) {
        for (const frame of frames) {
          if (
            !demand.sourceIds.includes(frame.sourceId) ||
            !current.sourceIds.includes(frame.sourceId)
          )
            continue;
          // A missing/partial batch is not loss of signal. An explicit absent observation is.
          const prior = this.#cache.get(frame.sourceId)?.frame;
          if (
            frame.signal !== 'absent' &&
            frame.jpegBase64 === undefined &&
            prior?.jpegBase64 !== undefined
          )
            continue;
          this.#cache.set(frame.sourceId, { frame, expires: Date.now() + EXPIRE_MS });
        }
        this.#publish();
      }
    } catch {
      // The independent expiry timer drops old pictures if the service stops responding.
    } finally {
      this.#inFlight = false;
      if (this.#demand !== undefined || this.#sentChannel !== undefined)
        this.#schedule(demand?.key === this.#demand?.key ? POLL_MS : 0);
    }
  }
}

export function usePvwSourceFrames(
  channel: number | undefined,
  visibleSources: readonly string[],
  enabled = true,
  mode: Reader['mode'] = 'stage',
): Frames {
  const pvw = window.cg?.sourcePreviews?.pvw;
  const sourceKey = JSON.stringify([...new Set(visibleSources)].slice(0, MAX_SOURCES));
  const sourceIds = useMemo(() => JSON.parse(sourceKey) as string[], [sourceKey]);
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY_SNAPSHOT);

  useEffect(() => {
    if (!enabled || pvw === undefined || channel === undefined || sourceIds.length === 0) return;
    let feed = feeds.get(pvw);
    if (feed === undefined) {
      feed = new PreviewFeed(pvw);
      feeds.set(pvw, feed);
    }
    return feed.subscribe({ channel, sourceIds, mode, receive: setSnapshot });
  }, [enabled, pvw, channel, sourceIds, mode]);

  return useMemo(() => {
    if (snapshot.channel !== channel || sourceIds.length === 0) return EMPTY_FRAMES;
    return new Map(
      sourceIds.flatMap((id) => {
        const frame = snapshot.frames.get(id);
        return frame === undefined ? [] : [[id, frame]];
      }),
    );
  }, [snapshot, channel, sourceIds]);
}
