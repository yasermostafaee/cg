import { useCallback, useSyncExternalStore } from 'react';
import type { PgmTopology } from '@cg/shared-ipc';
import type { AuthSessionState, RuntimeBridge, Unsubscribe } from '../../shared/runtime-bridge.js';

const POLL_MS = 5_000;
type Snapshot = PgmTopology | null | undefined;

function authReadScope(auth: AuthSessionState, channel: number): string {
  if (auth.kind !== 'signed-in') return auth.kind;
  return JSON.stringify([
    auth.kind,
    auth.principal.sub,
    [...auth.principal.roles].sort(),
    auth.permittedChannels.includes(channel),
  ]);
}

/** The monitor and preview surfaces share one topology poll for each open station channel. */
class ChannelTopology {
  snapshot: Snapshot;
  readonly #listeners = new Set<() => void>();
  #stops: Unsubscribe[] = [];
  #timer: ReturnType<typeof setTimeout> | undefined;
  #generation = 0;

  constructor(
    private readonly bridge: RuntimeBridge,
    private readonly channel: number,
  ) {}

  subscribe(listener: () => void): Unsubscribe {
    const notify = (): void => listener();
    this.#listeners.add(notify);
    if (this.#listeners.size === 1) {
      let authScope = authReadScope(this.bridge.auth.state(), this.channel);
      this.#stops = [
        this.bridge.link.onStatusChanged(this.#reset),
        this.bridge.auth.onStateChanged((auth) => {
          const nextScope = authReadScope(auth, this.channel);
          if (nextScope === authScope) return;
          authScope = nextScope;
          this.#reset();
        }),
      ];
      const stopConfig = this.bridge.connections?.onConfigChanged?.(this.#reset);
      if (stopConfig !== undefined) this.#stops.push(stopConfig);
      this.#reset();
    }
    return () => {
      this.#listeners.delete(notify);
      if (this.#listeners.size === 0) {
        for (const stop of this.#stops) stop();
        this.#stops = [];
        this.#reset();
      }
    };
  }

  get idle(): boolean {
    return this.#listeners.size === 0;
  }

  #reset = (): void => {
    const generation = ++this.#generation;
    clearTimeout(this.#timer);
    this.#publish(undefined);
    const auth = this.bridge.auth.state().kind;
    if (
      !this.idle &&
      this.bridge.link.status() !== 'disconnected' &&
      auth !== 'signed-out' &&
      auth !== 'expired'
    ) {
      void this.#poll(generation);
    }
  };

  #publish(snapshot: Snapshot): void {
    if (JSON.stringify(this.snapshot) === JSON.stringify(snapshot)) return;
    this.snapshot = snapshot;
    for (const listener of this.#listeners) listener();
  }

  async #poll(generation: number): Promise<void> {
    try {
      const topology = await this.bridge.pgmReturn.topology?.(this.channel);
      if (
        generation === this.#generation &&
        (topology === null || topology?.channel === this.channel)
      ) {
        this.#publish(topology);
      }
    } catch {
      if (generation === this.#generation && this.snapshot != null) {
        this.#publish({
          channel: this.channel,
          active: null,
          members: this.snapshot.members.map((member) => ({ ...member, physicalChannel: null })),
        });
      }
    }
    if (generation === this.#generation)
      this.#timer = setTimeout(() => void this.#poll(generation), POLL_MS);
  }
}

const readers = new WeakMap<RuntimeBridge, Map<number, ChannelTopology>>();

export function getProgramTopology(bridge: RuntimeBridge, channel: number): Snapshot {
  if (bridge.pgmReturn?.topology === undefined) return null;
  return readers.get(bridge)?.get(channel)?.snapshot;
}

export function subscribeProgramTopology(
  bridge: RuntimeBridge,
  channel: number,
  changed: () => void,
): Unsubscribe {
  const read = bridge.pgmReturn?.topology;
  if (read === undefined) return () => undefined;
  const channels = readers.get(bridge) ?? new Map<number, ChannelTopology>();
  readers.set(bridge, channels);
  const state = channels.get(channel) ?? new ChannelTopology(bridge, channel);
  channels.set(channel, state);
  const stop = state.subscribe(changed);
  return () => {
    stop();
    if (state.idle) channels.delete(channel);
  };
}

/** Undefined means waiting for the bridge; null means the channel uses legacy mapping. */
export function useProgramTopology(channel: number | null): Snapshot {
  const bridge = window.cg;
  const subscribe = useCallback(
    (changed: () => void) =>
      channel === null ? () => undefined : subscribeProgramTopology(bridge, channel, changed),
    [bridge, channel],
  );
  const getSnapshot = useCallback(
    () => (channel === null ? null : getProgramTopology(bridge, channel)),
    [bridge, channel],
  );
  return useSyncExternalStore(subscribe, getSnapshot);
}

/** The verified Playout programme member for this channel, if one is known. */
export function activeProgrammeMember(
  topology: Snapshot,
): PgmTopology['members'][number] | undefined {
  if (topology?.active == null) return undefined;
  return topology.members.find(({ engine }) => engine === topology.active);
}

/** Only compare the programme member that can change a preview's preferred route. */
export function sourcePreviewRoute(topology: Snapshot): string | undefined {
  const active = activeProgrammeMember(topology);
  return active === undefined ? undefined : JSON.stringify([active.engine, active.resourceKey]);
}

export function useSourcePreviewRoute(channel: number | undefined): string | undefined {
  return sourcePreviewRoute(useProgramTopology(channel ?? null));
}
