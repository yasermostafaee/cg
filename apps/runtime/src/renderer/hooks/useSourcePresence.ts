import { useCallback, useSyncExternalStore } from 'react';
import {
  MAX_SOURCE_PRESENCE_IDS,
  SourceCatalogIdSchema,
  type SourcePresenceView,
} from '@cg/shared-ipc';
import type { RuntimeBridge, Unsubscribe } from '../../shared/runtime-bridge.js';

const REFRESH_MS = 15_000;

interface Interest {
  ids: readonly string[];
  changed: () => void;
}
interface ChannelRead {
  interests: Set<Interest>;
  view: SourcePresenceView | null;
  read: object | null;
  queued: boolean;
}

/** One reader per console groups concurrent pickers and cards into station-channel requests. */
class SourcePresenceReader {
  readonly #channels = new Map<number, ChannelRead>();
  #stopListening: Unsubscribe[] = [];
  #batchTimer: ReturnType<typeof setTimeout> | undefined;
  #pollTimer: ReturnType<typeof setInterval> | undefined;

  constructor(private readonly bridge: RuntimeBridge) {}

  snapshot(channel: number): SourcePresenceView | null {
    const view = this.#channels.get(channel)?.view;
    return view?.engines.includes('B') === true ? view : null;
  }

  subscribe(channel: number, ids: readonly string[], changed: () => void): Unsubscribe {
    if (this.#channels.size === 0) this.#start();
    const state = this.#channels.get(channel) ?? {
      interests: new Set<Interest>(),
      view: null,
      read: null,
      queued: false,
    };
    this.#channels.set(channel, state);
    const interest = { ids, changed };
    state.interests.add(interest);
    this.#schedule();
    return () => {
      state.interests.delete(interest);
      if (state.interests.size === 0) this.#channels.delete(channel);
      if (this.#channels.size === 0) this.#stop();
    };
  }

  #start(): void {
    const invalidate = (sameStation: boolean): void => {
      for (const state of this.#channels.values()) {
        state.read = null;
        state.queued = false;
        const engines = state.view?.engines;
        const unknown = sameStation && engines?.includes('B') ? { engines, sources: {} } : null;
        this.#publish(state, unknown);
      }
      this.#schedule();
    };
    const target = (): string => {
      const caps = this.bridge.auth.capabilities();
      return JSON.stringify([
        this.bridge.link.bridgeAddress(),
        caps?.signInUrl,
        caps?.sourcePresence,
      ]);
    };
    let lastTarget = target();
    const connectionChanged = (): void => {
      const nextTarget = target();
      const sameStation = nextTarget === lastTarget;
      lastTarget = nextTarget;
      invalidate(sameStation);
    };
    this.#stopListening = [
      this.bridge.link.onStatusChanged(connectionChanged),
      this.bridge.auth.onStateChanged(() => invalidate(true)),
      this.bridge.auth.onCapabilitiesChanged(connectionChanged),
      this.bridge.connections.onConfigChanged(() => invalidate(false)),
    ];
    this.#pollTimer = setInterval(() => this.#schedule(), REFRESH_MS);
  }

  #stop(): void {
    for (const stop of this.#stopListening) stop();
    this.#stopListening = [];
    clearInterval(this.#pollTimer);
    clearTimeout(this.#batchTimer);
    this.#batchTimer = undefined;
  }

  #schedule(): void {
    if (this.#batchTimer !== undefined) return;
    this.#batchTimer = setTimeout(() => {
      this.#batchTimer = undefined;
      const auth = this.bridge.auth.state().kind;
      if (
        this.bridge.link.status() !== 'live' ||
        (auth !== 'signed-in' && auth !== 'off') ||
        this.bridge.auth.capabilities()?.sourcePresence !== true
      )
        return;
      for (const [channel, state] of this.#channels) {
        if (state.view?.engines.includes('B') === false) continue;
        if (state.read !== null) state.queued = true;
        else void this.#read(channel, state);
      }
    }, 0);
  }

  #publish(state: ChannelRead, view: SourcePresenceView | null): void {
    if (JSON.stringify(state.view) === JSON.stringify(view)) return;
    state.view = view;
    for (const interest of state.interests) interest.changed();
  }

  async #read(channel: number, state: ChannelRead): Promise<void> {
    const { sources } = this.bridge;
    if (sources.presence === undefined) return;
    const ids = [...new Set([...state.interests].flatMap((interest) => interest.ids))];
    const collected: SourcePresenceView['sources'] = {};
    const previous = state.view?.sources;
    for (const id of ids) {
      const presence =
        previous !== undefined && Object.hasOwn(previous, id) ? previous[id] : undefined;
      if (presence !== undefined) collected[id] = presence;
    }
    const token = {};
    const current = (): boolean => state.read === token && this.#channels.get(channel) === state;
    state.read = token;
    let start = 0;
    try {
      for (; start < ids.length; start += MAX_SOURCE_PRESENCE_IDS) {
        const batch = ids.slice(start, start + MAX_SOURCE_PRESENCE_IDS);
        const result = await sources.presence({ channel, sourceIds: batch });
        if (!current()) return;
        if (!result.engines.includes('B')) {
          this.#publish(state, { engines: result.engines, sources: {} });
          return;
        }
        for (const id of batch) {
          const presence = Object.hasOwn(result.sources, id) ? result.sources[id] : undefined;
          if (presence === undefined) delete collected[id];
          else collected[id] = presence;
        }
        this.#publish(state, { engines: result.engines, sources: { ...collected } });
      }
    } catch {
      if (current() && state.view !== null) {
        for (const id of ids.slice(start)) delete collected[id];
        this.#publish(state, { engines: state.view.engines, sources: collected });
      }
    } finally {
      if (current()) {
        state.read = null;
        if (state.queued) {
          state.queued = false;
          this.#schedule();
        }
      }
    }
  }
}

const readers = new WeakMap<RuntimeBridge, SourcePresenceReader>();

function readerFor(bridge: RuntimeBridge): SourcePresenceReader {
  const existing = readers.get(bridge);
  if (existing !== undefined) return existing;
  const reader = new SourcePresenceReader(bridge);
  readers.set(bridge, reader);
  return reader;
}

/** A/B catalogue presence, shown only after the Bridge confirms B is configured. */
export function useSourcePresence(
  channel: number | undefined,
  sourceIds: readonly string[],
): SourcePresenceView | null {
  const bridge = window.cg;
  const ids = [...new Set(sourceIds.filter((id) => SourceCatalogIdSchema.safeParse(id).success))]
    .sort()
    .join(' ');
  const reader =
    bridge?.sources?.presence === undefined || ids === '' || channel === undefined
      ? null
      : readerFor(bridge);
  const subscribe = useCallback(
    (changed: () => void) =>
      reader === null || channel === undefined
        ? () => undefined
        : reader.subscribe(channel, ids.split(' '), changed),
    [reader, channel, ids],
  );
  const getSnapshot = useCallback(
    () => (reader === null || channel === undefined ? null : reader.snapshot(channel)),
    [reader, channel],
  );
  return useSyncExternalStore(subscribe, getSnapshot);
}
