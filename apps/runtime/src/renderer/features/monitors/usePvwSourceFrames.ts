import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { playoutMediaIdOf, type SourcePreviewFrame } from '@cg/shared-ipc';
import type { RuntimeBridge } from '../../../shared/runtime-bridge.js';
import { uuid } from '../../lib/uuid.js';
import { subscribeInputThumbnail } from '../sources/inputThumbnailDemand.js';
import { PvwMediaPosters } from './pvwMediaPosters.js';
import { useModalForeground } from '../../ui/modalForeground.js';
import {
  canResolveNdi,
  confirmedNdiTarget,
  ndiPreviewAvailable,
  useNdiReceivers,
  useNdiTargets,
  type NdiReceiver,
} from '../sources/directNdiPreview.js';
import { currentSourceCatalog, subscribeSources } from '../sources/sourceStore.js';
import { usePictureOriginPublisher } from '../sources/observedPictureOrigins.js';

export type PvwSourceFrame = SourcePreviewFrame & {
  snapshotOnly?: true;
  directNdi?: NdiReceiver;
  isDirectNdi?: true;
};

export function hasPvwSourcePicture(frame: PvwSourceFrame | undefined): boolean {
  return (
    frame?.jpegBase64 !== undefined ||
    (frame?.directNdi !== undefined && frame.signal === 'present')
  );
}

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
  readonly #posters = new PvwMediaPosters(window.cg, () => this.#publish());
  readonly #readCompleted = new Set<string>();
  readonly #missingSnapshots = new Set<string>();
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
        this.#readCompleted.clear();
        this.#missingSnapshots.clear();
      }
    }
    this.#demand = demand;
    if (demand !== undefined) this.#posters.setDemand(channel, sourceIds);
    for (const ids of [this.#readCompleted, this.#missingSnapshots])
      for (const id of ids) if (!sourceIds.includes(id)) ids.delete(id);
    if (demand !== undefined) this.#publish();
    this.#schedule(0);
  }

  #publish(): void {
    clearTimeout(this.#expiryTimer);
    const now = Date.now();
    for (const cache of [this.#cache, this.#snapshots])
      for (const [id, entry] of cache) if (entry.expires <= now) cache.delete(id);
    const nextSnapshotCheck = this.#reconcileSnapshots(now);
    this.#requestPosters();
    const frames = new Map([...this.#cache].map(([id, { frame }]) => [id, frame]));
    for (const [id, { frame }] of this.#snapshots) {
      const current = frames.get(id);
      if (current?.jpegBase64 === undefined) frames.set(id, frame);
    }
    for (const frame of this.#posters.frames())
      if (frames.get(frame.sourceId)?.jpegBase64 === undefined) frames.set(frame.sourceId, frame);
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
      // A missing native media producer says nothing about the independent file snapshot/poster.
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
          if (this.#demand?.channel !== channel || !this.#demand.sourceIds.includes(id)) return;
          if (frame?.jpegBase64 === undefined) this.#missingSnapshots.add(id);
          else this.#missingSnapshots.delete(id);
          if (frame === undefined) {
            this.#requestPosters();
            return;
          }
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
          this.#requestPosters();
        },
      });
      this.#snapshotReaders.set(id, stop);
    }
    return nextCheck;
  }

  #requestPosters(): void {
    for (const id of this.#missingSnapshots)
      if (
        this.#readCompleted.has(id) &&
        this.#demand?.sourceIds.includes(id) &&
        this.#cache.get(id)?.frame.jpegBase64 === undefined &&
        this.#snapshots.get(id)?.frame.jpegBase64 === undefined
      )
        this.#posters.request(id);
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
      this.#posters.setDemand(undefined, []);
      this.#readCompleted.clear();
      this.#missingSnapshots.clear();
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
      if (demand !== undefined && this.#demand?.channel === channel) {
        for (const id of demand.sourceIds)
          if (this.#demand.sourceIds.includes(id)) this.#readCompleted.add(id);
        this.#requestPosters();
      }
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
  retainWhilePaused = false,
  liveSources: readonly string[] = [],
): Frames {
  const pvw = window.cg?.sourcePreviews?.pvw;
  const foreground = useModalForeground();
  const catalog = useSyncExternalStore(subscribeSources, currentSourceCatalog);
  const candidates = useMemo(() => {
    if (channel === undefined || !ndiPreviewAvailable() || mode !== 'stage') return [];
    const shown = new Set(visibleSources);
    return catalog.sources.filter(
      (source) => shown.has(source.id) && canResolveNdi(source, channel),
    );
  }, [channel, mode, visibleSources, catalog]);
  const targets = useNdiTargets(
    channel,
    candidates.map(({ id }) => id),
    enabled && foreground,
  );
  const liveKey = JSON.stringify(liveSources);
  const liveTargets = useMemo(() => {
    const wanted = new Set(JSON.parse(liveKey) as string[]);
    return new Map([...targets].filter(([id]) => wanted.has(id)));
  }, [liveKey, targets]);
  const directReceivers = useNdiReceivers(liveTargets, enabled && foreground);
  const directIds = useMemo(
    () =>
      new Set(
        candidates.flatMap((source) => {
          const target = targets.get(source.id);
          return !foreground ||
            (source.producer.kind === 'ndi' && target?.kind !== 'other') ||
            target?.kind === 'ndi' ||
            target?.kind === 'pending' ||
            target?.kind === 'blocked'
            ? [source.id]
            : [];
        }),
      ),
    [candidates, foreground, targets],
  );
  const sourceKey = JSON.stringify(
    [...new Set(visibleSources)].filter((id) => !directIds.has(id)).slice(0, MAX_SOURCES),
  );
  const sourceIds = useMemo(() => JSON.parse(sourceKey) as string[], [sourceKey]);
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY_SNAPSHOT);
  const previousApi = useRef<ReadFrames>();
  const [directRevision, publishDirect] = useState(0);
  useEffect(() => {
    if (directReceivers.size === 0) return;
    const refresh = (): void => publishDirect((revision) => revision + 1);
    const stops = [...new Set(directReceivers.values())].map((receiver) =>
      receiver.subscribe(refresh),
    );
    refresh();
    return () => {
      for (const stop of stops) stop();
    };
  }, [directReceivers]);

  useEffect(() => {
    if (!enabled || pvw === undefined || channel === undefined || sourceIds.length === 0) return;
    let feed = feeds.get(pvw);
    if (feed === undefined) {
      feed = new PreviewFeed(pvw);
      feeds.set(pvw, feed);
    }
    let retain = retainWhilePaused && previousApi.current === pvw;
    previousApi.current = pvw;
    let received = EMPTY_SNAPSHOT;
    const stop = feed.subscribe({
      channel,
      sourceIds,
      mode,
      receive: (next) => {
        received = next;
        setSnapshot((previous) => {
          if (!retain || previous.channel !== next.channel) return next;
          const frames = new Map(previous.frames);
          for (const [id, frame] of next.frames) {
            if (
              frame.signal !== 'absent' &&
              frame.jpegBase64 === undefined &&
              frames.get(id)?.jpegBase64 !== undefined
            )
              continue;
            frames.set(id, frame);
          }
          return { channel: next.channel, frames };
        });
      },
    });
    const expiry = retain
      ? setTimeout(() => {
          retain = false;
          setSnapshot(received);
        }, SNAPSHOT_EXPIRE_MS)
      : undefined;
    return () => {
      stop();
      clearTimeout(expiry);
    };
  }, [enabled, pvw, channel, sourceIds, mode, retainWhilePaused]);

  const passiveFrames = useMemo(() => {
    if (snapshot.channel !== channel || sourceIds.length === 0) return EMPTY_FRAMES;
    return new Map(
      sourceIds.flatMap((id) => {
        const frame = snapshot.frames.get(id);
        return frame === undefined ? [] : [[id, frame] as const];
      }),
    );
  }, [snapshot, channel, sourceIds]);
  const frames = useMemo(() => {
    if (directIds.size === 0) return passiveFrames;
    const frames = new Map(passiveFrames);
    for (const id of directIds) {
      const target = confirmedNdiTarget(targets.get(id));
      const receiver = directReceivers.get(id);
      const picture = receiver?.picture();
      frames.set(id, {
        sourceId: id,
        isDirectNdi: true,
        ...(target !== undefined && { engine: target.engine }),
        ...(receiver !== undefined && { directNdi: receiver }),
        signal:
          picture?.state === 'live'
            ? 'present'
            : picture?.state === 'no-signal'
              ? 'absent'
              : 'unknown',
        ...(picture?.state === 'live' && { width: picture.width, height: picture.height }),
      });
    }
    return frames;
  }, [directIds, directReceivers, targets, directRevision, passiveFrames]);
  const observePicture = usePictureOriginPublisher(channel);
  const observed = useRef(new WeakSet<PvwSourceFrame>());
  useEffect(() => {
    if (!enabled || !foreground) return;
    for (const [sourceId, frame] of frames) {
      if (
        frame.engine === undefined ||
        frame.signal === 'absent' ||
        !hasPvwSourcePicture(frame) ||
        observed.current.has(frame)
      )
        continue;
      observed.current.add(frame);
      observePicture(sourceId, frame.engine);
    }
  }, [enabled, foreground, frames, observePicture]);
  return frames;
}
