import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  holdsPermissionClass,
  isPlaylistOutput,
  sourceLoopsOn,
  sourcePreviewable,
  sourceShowableOn,
  type SourceDefinition,
  type SourceNdiTarget,
} from '@cg/shared-ipc';
import type { NdiPreviewPacket, RuntimeBridge } from '../../../shared/runtime-bridge.js';
import { useSourcePreviewRoute } from '../../hooks/useProgramTopology.js';
import { PgmAudioPlayer, PGM_AUDIO_SAMPLE_RATE, type PcmOut } from '../monitors/pgmAudioPlayer.js';
import { currentSourceCatalog, subscribeSources } from './sourceStore.js';

type NativeOpen = NonNullable<RuntimeBridge['sourcePreviews']['openNdiStream']>;
type ReadTargets = NonNullable<RuntimeBridge['sourcePreviews']['ndiTargets']>;
type SelectedTarget = Extract<SourceNdiTarget, { kind: 'ndi' }>;
export type NdiTarget = SourceNdiTarget | { sourceId: string; kind: 'pending' | 'blocked' };
type Watch = () => void;
type Levels = readonly [number, number];

const NO_VIDEO = { state: 'connecting' } as const;
const EMPTY_TARGETS: ReadonlyMap<string, NdiTarget> = new Map();
const EMPTY_RECEIVERS: ReadonlyMap<string, NdiReceiver> = new Map();
const PICTURE_TIMEOUT_MS = 2500;
const LEVEL_TIMEOUT_MS = 300;
const TARGET_BATCH_SIZE = 8;
const TARGET_RESOLUTION_TIMEOUT_MS = 1500;

const RUNTIME_REQUIRED = 'Install the 64-bit NDI Runtime on this CG Control computer.';

function streamError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return /NDI Runtime/i.test(message) ? RUNTIME_REQUIRED : 'Direct NDI unavailable';
}

type StreamPicture =
  | typeof NO_VIDEO
  | { state: 'live'; width: number; height: number }
  | { state: 'no-signal' | 'error'; message?: string };

/** A route-backed input can be NDI; only the Bridge may identify its real sender. */
export function canResolveNdi(source: SourceDefinition, channel: number): boolean {
  return (
    source.origin === 'input' &&
    !isPlaylistOutput(source) &&
    sourcePreviewable(source) &&
    !sourceLoopsOn(source, channel) &&
    sourceShowableOn(source, channel) &&
    (source.producer.kind === 'ndi' || source.producer.kind === 'route')
  );
}

interface TargetRead {
  ids: readonly string[];
  resolve(targets: readonly SourceNdiTarget[]): void;
}

const pendingReads = new WeakMap<ReadTargets, Map<number, TargetRead[]>>();

/** Visible picker cards and PVW use one short, bounded identity lookup batch. */
function readNdiTargets(
  read: ReadTargets,
  channel: number,
  ids: readonly string[],
): Promise<readonly SourceNdiTarget[]> {
  const buckets = pendingReads.get(read) ?? new Map<number, TargetRead[]>();
  pendingReads.set(read, buckets);
  let bucket = buckets.get(channel);
  if (bucket === undefined) {
    bucket = [];
    buckets.set(channel, bucket);
    const pending = bucket;
    queueMicrotask(() => {
      buckets.delete(channel);
      const all = [...new Set(pending.flatMap(({ ids }) => ids))];
      const batches = [];
      for (let offset = 0; offset < all.length; offset += TARGET_BATCH_SIZE) {
        const sourceIds = all.slice(offset, offset + TARGET_BATCH_SIZE);
        batches.push(resolveNdiTargetBatch(read, channel, sourceIds));
      }
      void Promise.all(batches).then((results) => {
        const byId = new Map(results.flat().map((target) => [target.sourceId, target]));
        for (const request of pending) {
          request.resolve(
            request.ids.map((sourceId) => byId.get(sourceId) ?? { sourceId, kind: 'unknown' }),
          );
        }
      });
    });
  }
  const pending = bucket;
  return new Promise((resolve) => pending.push({ ids, resolve }));
}

/** A stalled identity lookup must not leave every route preview waiting forever. */
async function resolveNdiTargetBatch(
  read: ReadTargets,
  channel: number,
  sourceIds: string[],
): Promise<readonly SourceNdiTarget[]> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const response = await Promise.race([
      Promise.resolve().then(() => read({ channel, sourceIds })),
      new Promise<undefined>((resolve) => {
        timer = setTimeout(() => resolve(undefined), TARGET_RESOLUTION_TIMEOUT_MS);
      }),
    ]);
    return response?.targets.filter(({ sourceId }) => sourceIds.includes(sourceId)) ?? [];
  } catch {
    return [];
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export function ndiPreviewAvailable(): boolean {
  const previews = window.cg?.sourcePreviews;
  return previews?.ndiTargets !== undefined && previews.openNdiStream !== undefined;
}

export async function resolvesToDirectNdi(
  source: SourceDefinition,
  channel: number,
): Promise<boolean> {
  const previews = window.cg?.sourcePreviews;
  const read = previews?.ndiTargets;
  if (
    previews?.openNdiStream === undefined ||
    read === undefined ||
    !canResolveNdi(source, channel)
  )
    return false;
  const [target] = await readNdiTargets(read, channel, [source.id]);
  return target?.kind === 'ndi' || (source.producer.kind === 'ndi' && target?.kind !== 'other');
}

const noAuthSubscription = (): (() => void) => () => undefined;

interface ResolvedTarget {
  definition: string;
  target: SourceNdiTarget;
}

export function useNdiTargets(
  channel: number | undefined,
  sourceIds: readonly string[],
  enabled: boolean,
): ReadonlyMap<string, NdiTarget> {
  const previews = window.cg?.sourcePreviews;
  const read = previews?.openNdiStream === undefined ? undefined : previews.ndiTargets;
  const authApi =
    enabled && read !== undefined && sourceIds.length > 0 ? window.cg?.auth : undefined;
  const authorizedPrincipal = useSyncExternalStore(
    authApi?.onStateChanged ?? noAuthSubscription,
    useCallback(() => {
      const auth = authApi?.state();
      if (auth === undefined || auth.kind === 'off') return 'off';
      if (
        auth.kind === 'signed-in' &&
        channel !== undefined &&
        auth.permittedChannels.includes(channel) &&
        holdsPermissionClass(auth.principal.roles, 'operator')
      )
        return `user:${auth.principal.sub}`;
      return null;
    }, [authApi, channel]),
  );
  const demand = enabled && channel !== undefined && read !== undefined && sourceIds.length > 0;
  const active = demand && authorizedPrincipal !== null;
  const route = useSourcePreviewRoute(active ? channel : undefined);
  const catalog = useSyncExternalStore(subscribeSources, currentSourceCatalog);
  const scope = JSON.stringify([channel, route, authorizedPrincipal]);
  const idsKey = JSON.stringify(sourceIds);
  const ids = useMemo(() => JSON.parse(idsKey) as string[], [idsKey]);
  const definitions = useMemo(() => {
    if (!active) return new Map<string, string>();
    const byId = new Map(catalog.sources.map((source) => [source.id, source]));
    return new Map(
      ids.map((id) => {
        const source = byId.get(id);
        return [id, JSON.stringify([source?.producer, source?.status, source?.departed])];
      }),
    );
  }, [active, catalog, ids]);
  const [result, setResult] = useState<{
    scope: string;
    read: ReadTargets;
    targets: ReadonlyMap<string, ResolvedTarget>;
  }>();
  useEffect(() => {
    if (!active || read === undefined || channel === undefined) {
      setResult(undefined);
      return;
    }
    let disposed = false;
    void readNdiTargets(read, channel, ids).then((targets) => {
      if (disposed) return;
      setResult((previous) => {
        const held =
          previous?.scope === scope && previous.read === read ? previous.targets : undefined;
        const next = new Map<string, ResolvedTarget>();
        for (const target of targets) {
          const definition = definitions.get(target.sourceId);
          if (definition === undefined) continue;
          const prior = held?.get(target.sourceId);
          // A partial or timed-out read is not a new sender. Its existing stream
          // still reports genuine loss independently of the catalog.
          next.set(
            target.sourceId,
            target.kind === 'unknown' &&
              prior?.definition === definition &&
              prior.target.kind === 'ndi'
              ? prior
              : { definition, target },
          );
        }
        return { scope, read, targets: next };
      });
    });
    return () => {
      disposed = true;
    };
  }, [active, channel, definitions, ids, read, scope]);
  return useMemo(() => {
    if (!demand) return EMPTY_TARGETS;
    if (!active) {
      // Passive previews require operator access too.
      return new Map<string, NdiTarget>(
        ids.map((sourceId) => [sourceId, { sourceId, kind: 'blocked' }]),
      );
    }
    const held = result?.scope === scope && result.read === read ? result.targets : undefined;
    return new Map(
      [...definitions].map(([sourceId, definition]): [string, NdiTarget] => {
        // D10 publishes even for an unchanged list with a new read time.
        const target = held?.get(sourceId);
        return [
          sourceId,
          target?.definition === definition ? target.target : { sourceId, kind: 'pending' },
        ];
      }),
    );
  }, [active, definitions, demand, ids, read, result, scope]);
}

interface CanvasSubscription {
  canvas: WeakRef<HTMLCanvasElement>;
  draw: (bitmap: ImageBitmap) => void;
}

const receivers = new WeakMap<NativeOpen, Map<string, NdiReceiver>>();
const audioListeners = new Set<Watch>();
let listening: { receiver: NdiReceiver; context: AudioContext } | undefined;
function publishAudio(): void {
  for (const listener of audioListeners) listener();
}

/** All surfaces share a receiver and one decoded bitmap per sender. */
export class NdiReceiver {
  readonly #watches = new Set<Watch>();
  readonly #levelWatches = new Set<Watch>();
  readonly #canvases = new Set<CanvasSubscription>();
  readonly #speaker = new PgmAudioPlayer({ url: () => Promise.resolve(null) });
  #picture: StreamPicture = NO_VIDEO;
  #levels: Levels | undefined;
  #bitmap: ImageBitmap | undefined;
  #queued: Uint8Array | undefined;
  #generation = 0;
  #decoding = false;
  #stop: (() => void) | undefined;
  #pictureExpiry: ReturnType<typeof setTimeout> | undefined;
  #levelExpiry: ReturnType<typeof setTimeout> | undefined;
  #disposed = false;
  users = 0;

  constructor(open: NativeOpen, senderName: string) {
    this.#speaker.setPeakWriter((levels) => {
      if (this.#picture.state !== 'live') return;
      this.#setLevels(levels);
      clearTimeout(this.#levelExpiry);
      this.#levelExpiry = setTimeout(() => this.#setLevels(undefined), LEVEL_TIMEOUT_MS);
    });
    this.#pictureExpiry = setTimeout(
      () => this.#losePicture({ state: 'no-signal' }),
      PICTURE_TIMEOUT_MS,
    );
    void Promise.resolve()
      .then(() => {
        if (!this.#disposed) return open(senderName, this.#packet);
        return undefined;
      })
      .then((stop) => {
        if (this.#disposed) stop?.();
        else this.#stop = stop;
      })
      .catch((error: unknown) => {
        if (!this.#disposed) this.#losePicture({ state: 'error', message: streamError(error) });
      });
  }

  picture = (): StreamPicture => this.#picture;
  levels = (): Levels | undefined => this.#levels;
  subscribe = (watch: Watch): (() => void) => {
    this.#watches.add(watch);
    return () => this.#watches.delete(watch);
  };
  subscribeLevels = (watch: Watch): (() => void) => {
    this.#levelWatches.add(watch);
    return () => this.#levelWatches.delete(watch);
  };

  attach(canvas: HTMLCanvasElement): () => void {
    if (this.#disposed) return () => undefined;
    const reference = new WeakRef(canvas);
    const entry = {
      canvas: reference,
      draw: (bitmap: ImageBitmap): void => {
        const element = reference.deref();
        if (element === undefined) return;
        const context = element.getContext('2d');
        if (context === null) return;
        if (element.width !== bitmap.width) element.width = bitmap.width;
        if (element.height !== bitmap.height) element.height = bitmap.height;
        context.drawImage(bitmap, 0, 0);
      },
    };
    this.#canvases.add(entry);
    if (this.#bitmap !== undefined) entry.draw(this.#bitmap);
    return () => this.#canvases.delete(entry);
  }

  setLocalSpeaker(context: AudioContext | null): void {
    this.#speaker.setSpeaker(context as unknown as PcmOut | null);
  }

  dispose(): void {
    this.#disposed = true;
    this.#stop?.();
    this.#losePicture({ state: 'no-signal' });
    this.#watches.clear();
    this.#levelWatches.clear();
    this.#canvases.clear();
  }

  #setLevels(levels: Levels | undefined): void {
    if (this.#levels === levels) return;
    this.#levels = levels;
    for (const notify of this.#levelWatches) notify();
  }

  #losePicture(next: StreamPicture): void {
    this.#generation += 1;
    this.#queued = undefined;
    this.#bitmap?.close();
    this.#bitmap = undefined;
    clearTimeout(this.#pictureExpiry);
    clearTimeout(this.#levelExpiry);
    if (listening?.receiver === this) stopNdiAudio(this);
    this.#setLevels(undefined);
    if (this.#picture.state === next.state && this.#picture.state !== 'live') return;
    this.#picture = next;
    for (const notify of this.#watches) notify();
  }

  #packet = (packet: NdiPreviewPacket): void => {
    if (this.#disposed) return;
    switch (packet.kind) {
      case 'picture':
        this.#queued = packet.bytes;
        if (!this.#decoding) void this.#decode();
        return;
      case 'audio':
        if (this.#picture.state === 'live') this.#speaker.ingestStereoPacket(packet.bytes);
        return;
      case 'no-signal':
        this.#losePicture({ state: 'no-signal' });
        return;
      case 'error':
        this.#losePicture({ state: 'error', message: streamError(packet.message) });
        return;
    }
  };

  async #decode(): Promise<void> {
    this.#decoding = true;
    while (this.#queued !== undefined && !this.#disposed) {
      const bytes = this.#queued;
      this.#queued = undefined;
      const generation = this.#generation;
      let bitmap: ImageBitmap;
      try {
        const buffer = Uint8Array.from(bytes);
        bitmap = await createImageBitmap(new Blob([buffer], { type: 'image/jpeg' }));
      } catch {
        continue;
      }
      if (this.#disposed || generation !== this.#generation) {
        bitmap.close();
        continue;
      }
      this.#bitmap?.close();
      this.#bitmap = bitmap;
      for (const canvas of this.#canvases) {
        if (canvas.canvas.deref()?.isConnected !== true) this.#canvases.delete(canvas);
        else canvas.draw(bitmap);
      }
      clearTimeout(this.#pictureExpiry);
      this.#pictureExpiry = setTimeout(
        () => this.#losePicture({ state: 'no-signal' }),
        PICTURE_TIMEOUT_MS,
      );
      if (
        this.#picture.state !== 'live' ||
        this.#picture.width !== bitmap.width ||
        this.#picture.height !== bitmap.height
      ) {
        this.#picture = { state: 'live', width: bitmap.width, height: bitmap.height };
        for (const notify of this.#watches) notify();
      }
    }
    this.#decoding = false;
  }
}

function holdReceiver(
  open: NativeOpen,
  sender: string,
): { receiver: NdiReceiver; release: () => void } {
  const bySender = receivers.get(open) ?? new Map<string, NdiReceiver>();
  receivers.set(open, bySender);
  const receiver = bySender.get(sender) ?? new NdiReceiver(open, sender);
  bySender.set(sender, receiver);
  receiver.users++;
  const release = (): void => {
    receiver.users--;
    if (receiver.users > 0) return;
    bySender.delete(sender);
    receiver.dispose();
  };
  return { receiver, release };
}

export function useNdiReceivers(
  targets: ReadonlyMap<string, NdiTarget>,
  enabled: boolean,
): ReadonlyMap<string, NdiReceiver> {
  const open = window.cg?.sourcePreviews?.openNdiStream;
  const key = JSON.stringify(
    [...targets.values()].flatMap((target) =>
      target.kind === 'ndi' ? [[target.sourceId, target.senderName]] : [],
    ),
  );
  const entries = useMemo(() => JSON.parse(key) as [string, string][], [key]);
  const holds = useRef(new Map<string, ReturnType<typeof holdReceiver>>());
  const [resolved, setResolved] = useState<{
    open: NativeOpen;
    bySender: ReadonlyMap<string, NdiReceiver>;
  }>();
  useEffect(() => {
    const retained = holds.current;
    return () => {
      for (const held of retained.values()) held.release();
      retained.clear();
    };
  }, [enabled, open]);
  useEffect(() => {
    if (!enabled || open === undefined) {
      setResolved(undefined);
      return;
    }
    const wanted = new Set(entries.map(([, sender]) => sender));
    const retained = holds.current;
    for (const sender of wanted) {
      if (!retained.has(sender)) retained.set(sender, holdReceiver(open, sender));
    }
    for (const [sender, held] of retained) {
      if (wanted.has(sender)) continue;
      held.release();
      retained.delete(sender);
    }
    setResolved({
      open,
      bySender: new Map([...retained].map(([sender, held]) => [sender, held.receiver])),
    });
  }, [enabled, entries, open]);
  return useMemo(() => {
    if (!enabled || entries.length === 0 || resolved === undefined || resolved.open !== open)
      return EMPTY_RECEIVERS;
    return new Map(
      entries.flatMap(([sourceId, sender]) => {
        const receiver = resolved.bySender.get(sender);
        return receiver === undefined ? [] : [[sourceId, receiver] as const];
      }),
    );
  }, [enabled, entries, open, resolved]);
}

export function confirmedNdiTarget(target: NdiTarget | undefined): SelectedTarget | undefined {
  return target?.kind === 'ndi' ? target : undefined;
}

const noopSubscribe = (): (() => void) => () => undefined;
const noPicture = (): StreamPicture => NO_VIDEO;
const noLevels = (): undefined => undefined;
export function useNdiPicture(receiver: NdiReceiver | undefined): StreamPicture {
  return useSyncExternalStore(receiver?.subscribe ?? noopSubscribe, receiver?.picture ?? noPicture);
}

export function useNdiLevels(receiver: NdiReceiver | undefined): Levels | undefined {
  return useSyncExternalStore(
    receiver?.subscribeLevels ?? noopSubscribe,
    receiver?.levels ?? noLevels,
  );
}

function subscribeNdiAudio(notify: Watch): () => void {
  audioListeners.add(notify);
  return () => audioListeners.delete(notify);
}

const audioReceiver = (): NdiReceiver | undefined => listening?.receiver;
export function useNdiAudioReceiver(): NdiReceiver | undefined {
  return useSyncExternalStore(subscribeNdiAudio, audioReceiver);
}

export function stopNdiAudio(receiver?: NdiReceiver): void {
  if (listening === undefined || (receiver !== undefined && listening.receiver !== receiver))
    return;
  const previous = listening;
  listening = undefined;
  previous.receiver.setLocalSpeaker(null);
  void previous.context.close().catch(() => undefined);
  publishAudio();
}

export function toggleNdiAudio(receiver: NdiReceiver): void {
  const already = listening?.receiver === receiver;
  stopNdiAudio();
  if (already || receiver.picture().state !== 'live') return;
  let context: AudioContext;
  try {
    context = new AudioContext({ sampleRate: PGM_AUDIO_SAMPLE_RATE, latencyHint: 'interactive' });
  } catch {
    return;
  }
  listening = { receiver, context };
  publishAudio();
  void context.resume().then(
    () => {
      if (listening?.context === context) receiver.setLocalSpeaker(context);
    },
    () => {
      if (listening?.context === context) stopNdiAudio(receiver);
    },
  );
}
