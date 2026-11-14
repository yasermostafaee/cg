import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  PGM_ENGINES,
  type PgmEngine,
  type PgmReturnStatus,
  type PgmTopology,
} from '@cg/shared-ipc';
import { pinnedIPv4 } from './playout-http.js';
import { PgmAudioRelay } from './pgm-audio.js';
import {
  PgmReturnRelay,
  pgmChannelInFirewallRule,
  type PgmReturnRelayOptions,
} from './pgm-return.js';
import { readPlayoutPgmTopology } from './playout-pgm-topology.js';

type PeerReader = typeof readPlayoutPgmTopology;
type RelayOptions = Pick<PgmReturnRelayOptions, 'portFor' | 'tuning'>;
type ApiMember = PgmTopology['members'][number];

interface Source {
  readonly member: ApiMember;
  readonly origin: string;
  readonly channel: number;
  readonly picture: PgmReturnRelay;
  readonly audio: PgmAudioRelay;
  readonly unsubscribe: () => void;
}

interface ChannelMonitors {
  readonly code: string;
  generation: number;
  readonly slots: Map<string, PgmEngine>;
  readonly sources: Map<string, Source>;
  topology: PgmTopology | null;
  nextRead: number;
  expiresAt?: number;
  expiryTimer?: ReturnType<typeof setTimeout>;
  pending?: Promise<PgmTopology | null>;
}

const REFRESH_MS = 5_000;
const MAPPING_TTL_MS = 15_000;

/** Logical-channel topology and demand-driven programme relays. Owns no playout commands. */
export class PlayoutPgmMonitors {
  readonly #channels = new Map<number, ChannelMonitors>();
  readonly #observers = new Set<() => void>();
  readonly #shutdown = new AbortController();

  constructor(
    readonly origin: URL,
    readonly options: RelayOptions,
    readonly readPeers: PeerReader = readPlayoutPgmTopology,
  ) {}

  async topology(channel: number, code: string): Promise<PgmTopology | null> {
    if (this.#shutdown.signal.aborted) return null;
    let state = this.#channels.get(channel);
    if (state !== undefined && state.code !== code) {
      this.clear(channel);
      state = undefined;
    }
    if (state === undefined) {
      state = {
        code,
        generation: 0,
        slots: new Map(),
        sources: new Map(),
        topology: null,
        nextRead: 0,
      };
      this.#channels.set(channel, state);
    }
    this.#expireIfDue(state);
    if (state.pending !== undefined) return state.pending;
    if (Date.now() < state.nextRead) return state.topology;
    const generation = state.generation;
    state.pending = this.#refresh(channel, state, generation).finally(() => {
      if (state.generation === generation) delete state.pending;
    });
    return state.pending;
  }

  clear(channel: number): void {
    const state = this.#channels.get(channel);
    if (state === undefined) return;
    this.#channels.delete(channel);
    this.#markUnavailable(state);
  }

  retainChannels(codeFor: (channel: number) => string | null): void {
    for (const [channel, state] of this.#channels) {
      const code = codeFor(channel);
      if (code === null) this.unavailableFor(channel);
      else if (code !== state.code) this.clear(channel);
    }
  }

  unavailableFor(channel: number): PgmTopology | null {
    const state = this.#channels.get(channel);
    return state === undefined ? null : this.#invalidate(state);
  }

  #invalidate(state: ChannelMonitors): PgmTopology | null {
    state.generation += 1;
    delete state.pending;
    state.nextRead = 0;
    return this.#markUnavailable(state);
  }

  #expireIfDue(state: ChannelMonitors): void {
    if (state.expiresAt !== undefined && Date.now() >= state.expiresAt) this.#invalidate(state);
  }

  #clearExpiry(state: ChannelMonitors): void {
    if (state.expiryTimer !== undefined) clearTimeout(state.expiryTimer);
    delete state.expiryTimer;
    delete state.expiresAt;
  }

  #renewExpiry(state: ChannelMonitors): void {
    this.#clearExpiry(state);
    const deadline = Date.now() + MAPPING_TTL_MS;
    state.expiresAt = deadline;
    const expire = (): void => {
      if (state.expiresAt !== deadline) return;
      const remaining = deadline - Date.now();
      if (remaining > 0) {
        state.expiryTimer = setTimeout(expire, remaining).unref();
      } else {
        this.#invalidate(state);
      }
    };
    state.expiryTimer = setTimeout(expire, MAPPING_TTL_MS).unref();
  }

  #markUnavailable(state: ChannelMonitors): PgmTopology | null {
    this.#clearExpiry(state);
    if (state.topology !== null) {
      state.topology = {
        ...state.topology,
        active: null,
        members: state.topology.members.map((member) => ({ ...member, physicalChannel: null })),
      };
    }
    this.#retain(state, new Set());
    return state.topology;
  }

  hasSource(channel: number, engine: PgmEngine, resourceKey: string): boolean {
    return this.#source(channel, engine, resourceKey) !== undefined;
  }

  sourceOrigin(channel: number, engine: PgmEngine, resourceKey: string): string | undefined {
    return this.#source(channel, engine, resourceKey)?.origin;
  }

  #source(channel: number, engine: PgmEngine, resourceKey: string): Source | undefined {
    const state = this.#channels.get(channel);
    if (state === undefined) return undefined;
    // Ticket issue and redemption remain closed even if the Node timer has not fired yet.
    this.#expireIfDue(state);
    return [...state.sources.values()].find(
      ({ member }) => member.engine === engine && member.resourceKey === resourceKey,
    );
  }

  serve(
    req: IncomingMessage,
    res: ServerResponse,
    channel: number,
    engine: PgmEngine,
    resourceKey: string,
    stream: 'picture' | 'audio',
  ): boolean {
    const entry = this.#source(channel, engine, resourceKey);
    if (entry === undefined) return false;
    if (stream === 'audio') res.setHeader('access-control-allow-origin', '*');
    entry[stream].serve(req, res, entry.channel);
    return true;
  }

  status(): PgmReturnStatus[] {
    const statuses: PgmReturnStatus[] = [];
    for (const [channel, state] of this.#channels) {
      if (state.expiresAt !== undefined && Date.now() >= state.expiresAt) continue;
      for (const { member, picture } of state.sources.values()) {
        for (const { state } of picture.status()) {
          statuses.push({ channel, engine: member.engine, resourceKey: member.resourceKey, state });
        }
      }
    }
    return statuses;
  }

  subscribe(observer: () => void): () => void {
    this.#observers.add(observer);
    return () => this.#observers.delete(observer);
  }

  dispose(): void {
    this.#shutdown.abort();
    this.#observers.clear();
    for (const state of this.#channels.values()) this.#markUnavailable(state);
    this.#channels.clear();
  }

  async #refresh(
    channel: number,
    state: ChannelMonitors,
    generation: number,
  ): Promise<PgmTopology | null> {
    const result = await this.readPeers(this.origin, state.code, {
      signal: this.#shutdown.signal,
    }).catch(() => null);
    if (this.#shutdown.signal.aborted || this.#channels.get(channel) !== state) return null;
    this.#expireIfDue(state);
    if (state.generation !== generation) return state.topology;
    state.nextRead = Date.now() + REFRESH_MS;
    if (result === null || result.members[0]?.physicalChannel !== channel) {
      return this.#markUnavailable(state);
    }

    const currentKeys = new Set(result.members.map((member) => member.key));
    const taken = new Set(
      [...state.slots].flatMap(([key, slot]) => (currentKeys.has(key) ? [slot] : [])),
    );
    const members: ApiMember[] = [];
    const keep = new Set<string>();
    let active: PgmEngine | null = null;
    for (const peer of result.members) {
      const engine = state.slots.get(peer.key) ?? PGM_ENGINES.find((slot) => !taken.has(slot));
      if (engine === undefined) continue;
      for (const [key, slot] of state.slots) {
        if (slot === engine && key !== peer.key) state.slots.delete(key);
      }
      taken.add(engine);
      state.slots.set(peer.key, engine);
      if (peer.key === result.activeMemberKey) active = engine;
      const physicalChannel = peer.physicalChannel;
      if (
        physicalChannel === null ||
        !pgmChannelInFirewallRule(physicalChannel) ||
        peer.pgmHost === null
      ) {
        members.push({ engine, name: peer.name, physicalChannel: null, resourceKey: peer.key });
        continue;
      }
      const binding = JSON.stringify([
        peer.key,
        peer.pgmHost,
        peer.channelCode,
        physicalChannel,
        engine,
      ]);
      const key = state.sources.get(binding)?.member.resourceKey ?? randomUUID();
      if (!state.sources.has(binding)) {
        const host = peer.pgmHost;
        const resolveTarget = async () => {
          const address = await pinnedIPv4(host);
          return address === null ? null : { address, hostHeader: host };
        };
        const picture = new PgmReturnRelay({ ...this.options, resolveTarget });
        const audio = new PgmAudioRelay({ ...this.options, resolveTarget });
        const member = { engine, name: peer.name, physicalChannel, resourceKey: key };
        const unsubscribe = picture.subscribe(() => this.#publish());
        state.sources.set(binding, {
          member,
          origin: peer.key,
          channel: physicalChannel,
          picture,
          audio,
          unsubscribe,
        });
      }
      keep.add(binding);
      members.push({ engine, name: peer.name, physicalChannel, resourceKey: key });
    }
    state.topology = {
      channel,
      members: members.sort((a, b) => a.engine.localeCompare(b.engine)),
      active,
    };
    this.#renewExpiry(state);
    this.#retain(state, keep);
    return state.topology;
  }

  #retain(state: ChannelMonitors, keep: ReadonlySet<string>): void {
    let changed = false;
    for (const [binding, entry] of state.sources) {
      if (keep.has(binding)) continue;
      changed = true;
      state.sources.delete(binding);
      entry.unsubscribe();
      entry.picture.dispose();
      entry.audio.dispose();
    }
    if (changed) this.#publish();
  }

  #publish(): void {
    for (const observer of this.#observers) observer();
  }
}
