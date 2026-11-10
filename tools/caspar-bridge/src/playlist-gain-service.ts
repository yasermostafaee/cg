import { randomUUID } from 'node:crypto';
import type {
  ChannelRequest,
  PlaylistGainFailure,
  PlaylistGainReply,
  PlaylistGainSetChannel,
  PlaylistGainState,
  SourceCatalog,
} from '@cg/shared-ipc';
import type { AuthSession } from './auth-session.js';
import { CommandBuilder } from './command-builder.js';
import type { LiveLayerRecord } from './live-layers.js';
import { isPlayoutRouteRecord } from './route-plates.js';
import { PlayoutProgrammeGain, type PlayoutProgrammeGainState } from './playout-programme-gain.js';

const EDIT_TTL_MS = 60_000;
const command = new CommandBuilder();

/** The active ledger is the source of truth for a routed picture, including reveal slices. */
export function playlistFrameUsage(
  catalog: SourceCatalog,
  records: Iterable<readonly LiveLayerRecord[]>,
  unverified: ReadonlySet<string>,
  channel: number,
): PlaylistGainState['usage'] {
  const routes = new Set(
    catalog.sources.flatMap((source) =>
      source.playlistOf === channel && source.producer.kind === 'route'
        ? [command.sourceArgument(source.producer)]
        : [],
    ),
  );
  let unknown = false;
  for (const group of records) {
    for (const record of group) {
      if (
        record.role !== 'fill' ||
        record.held === true ||
        record.audioLocked !== true ||
        !isPlayoutRouteRecord(record)
      ) {
        continue;
      }
      const key = `${String(record.slot.channel)}-${String(record.slot.layer)}`;
      const current =
        record.epoch !== undefined && record.epoch === catalog.inputsEpoch && !unverified.has(key);
      if (routes.has(record.producer)) {
        if (current) return 'used';
        unknown = true;
      } else if (!current && record.revealOverlay !== true) {
        unknown = true;
      }
    }
  }
  return unknown ? 'unknown' : 'unused';
}

export interface PlaylistGainTarget {
  origin: string;
  code: string;
  casparChannel: number;
  bearer: string;
  generation: string;
}

type TargetResult =
  | { ok: true; target: PlaylistGainTarget }
  | { ok: false; reason: PlaylistGainFailure };

interface Edit {
  id: string;
  target: PlaylistGainTarget;
  revision: number;
  expiresAt: number;
}

function sameTarget(a: PlaylistGainTarget, b: PlaylistGainTarget): boolean {
  return (
    a.origin === b.origin &&
    a.code === b.code &&
    a.casparChannel === b.casparChannel &&
    a.bearer === b.bearer &&
    a.generation === b.generation
  );
}

/** R-110. No AMCP dependency, and a revision can only be written against its original owner. */
export class PlaylistGainService {
  readonly #edits = new WeakMap<AuthSession, Map<number, Edit>>();

  constructor(
    private readonly targetFor: (owner: AuthSession, channel: number) => TargetResult,
    private readonly usageOf: (channel: number) => PlaylistGainState['usage'],
    private readonly now: () => number = Date.now,
  ) {}

  drop(owner: AuthSession): void {
    this.#edits.delete(owner);
  }

  async get(owner: AuthSession | null, channel: number): Promise<PlaylistGainReply> {
    if (owner === null) return { ok: false, reason: 'unavailable' };
    const resolved = this.targetFor(owner, channel);
    if (!resolved.ok) return resolved;
    const target = resolved.target;
    const read = await this.#client(target).get();
    if (!this.#stillOwns(owner, channel, target)) return { ok: false, reason: 'owner-changed' };
    if (!read.ok) return { ok: false, reason: read.reason };
    return { ok: true, state: this.#project(owner, channel, target, read.state) };
  }

  async set(
    owner: AuthSession | null,
    request: ChannelRequest<typeof PlaylistGainSetChannel>,
  ): Promise<PlaylistGainReply> {
    if (owner === null) return { ok: false, reason: 'unavailable' };
    const { channel } = request;
    const resolved = this.targetFor(owner, channel);
    if (!resolved.ok) return resolved;
    const edits = this.#edits.get(owner);
    const edit = edits?.get(channel);
    if (edit?.id !== request.editToken) return { ok: false, reason: 'conflict' };
    edits?.delete(channel);
    if (!sameTarget(edit.target, resolved.target)) return { ok: false, reason: 'owner-changed' };
    if (edit.expiresAt <= this.now()) return { ok: false, reason: 'conflict' };

    const target = resolved.target;
    const written = await this.#client(target).set({
      gainDb: request.gainDb,
      expectedRevision: edit.revision,
      ...(request.rampMs !== undefined && { rampMs: request.rampMs }),
    });
    if (!this.#stillOwns(owner, channel, target)) return { ok: false, reason: 'owner-changed' };
    if (written.ok)
      return { ok: true, state: this.#project(owner, channel, target, written.state) };
    if (!written.reconcile || written.reason === 'peer-owner') {
      return { ok: false, reason: written.reason };
    }
    const current = await this.get(owner, channel);
    return { ok: false, reason: written.reason, ...(current.ok && { current: current.state }) };
  }

  #client(target: PlaylistGainTarget): PlayoutProgrammeGain {
    return new PlayoutProgrammeGain(
      target.origin,
      target.code,
      target.bearer,
      target.casparChannel,
    );
  }

  #stillOwns(owner: AuthSession, channel: number, target: PlaylistGainTarget): boolean {
    const current = this.targetFor(owner, channel);
    return current.ok && sameTarget(current.target, target);
  }

  #project(
    owner: AuthSession,
    channel: number,
    target: PlaylistGainTarget,
    state: PlayoutProgrammeGainState,
  ): PlaylistGainState {
    let edits = this.#edits.get(owner);
    if (edits === undefined) {
      edits = new Map();
      this.#edits.set(owner, edits);
    }
    const id = randomUUID();
    edits.set(channel, {
      id,
      target,
      revision: state.revision,
      expiresAt: this.now() + EDIT_TTL_MS,
    });
    return {
      gainDb: state.gainDb,
      application: state.application.state,
      usage: this.usageOf(channel),
      editToken: id,
    };
  }
}
