import { randomUUID } from 'node:crypto';
import type {
  ChannelRequest,
  SourcePreviewFrame,
  SourcePreviewPvwChannel,
  SourcePreviewThumbnailsChannel,
} from '@cg/shared-ipc';
import type { AuthSession } from './auth-session.js';
import type { LivePreviewTarget } from './live-preview.js';
import {
  PlayoutSourcePreviews,
  type SourcePreviewCapability,
  type SourcePreviewFrame as UpstreamFrame,
  type SourcePreviewSelector,
  type SourcePreviewSession,
} from './playout-source-previews.js';

type PvwRequest = ChannelRequest<typeof SourcePreviewPvwChannel>;
type ThumbnailRequest = ChannelRequest<typeof SourcePreviewThumbnailsChannel>;
interface Frames {
  frames: SourcePreviewFrame[];
}
type Target = LivePreviewTarget;
type SelectorFor = (
  owner: AuthSession,
  channel: number,
  sourceId: string,
) => SourcePreviewSelector | null;

interface Lease {
  selector: string;
  session: SourcePreviewSession;
  renewAt: number;
  readAt: number;
  frame: SourcePreviewFrame | null;
  frameAt: number;
}

interface Retry {
  requestId: string;
  selector: string;
  expiresAt: number;
  after: number;
}

interface Scope {
  target: Target;
  client: PlayoutSourcePreviews;
  capability: { until: number; result: Promise<SourcePreviewCapability | null> } | null;
}

interface View {
  channel: number;
  id: string;
  scope: Scope;
  seenAt: number;
  leases: Map<string, Lease>;
  retries: Map<string, Retry>;
  work: Promise<Frames> | null;
  demand: string;
  closed: boolean;
}

const EMPTY: Frames = { frames: [] };
const ABANDONED_VIEW_MS = 7000;
const CAPABILITY_TTL_MS = 30_000;
const LEASE_TTL_MS = 90_000;
const MAX_MOVING_FRAME_AGE_MS = 1500;

function sameTarget(a: Target, b: Target): boolean {
  return a.origin === b.origin && a.code === b.code && a.bearer === b.bearer;
}

function projectFrame(
  sourceId: string,
  frame: UpstreamFrame,
  kind: SourcePreviewSelector['kind'],
): SourcePreviewFrame {
  const result = { sourceId, signal: frame.signal };
  if (
    !frame.supported ||
    frame.state !== 'ready' ||
    frame.geometry === null ||
    frame.jpegBase64 === null ||
    (kind === 'live' && frame.signal !== 'present') ||
    (kind === 'playlist' && (frame.frameAgeMs ?? Infinity) > MAX_MOVING_FRAME_AGE_MS) ||
    frame.signal === 'absent'
  )
    return result;
  return {
    ...result,
    jpegBase64: frame.jpegBase64,
    width: frame.geometry.deliveredWidth,
    height: frame.geometry.deliveredHeight,
  };
}

/** Owns the non-playing Playout subscriptions of each authenticated console's PVW. */
export class SourcePreviewService {
  readonly #views = new Map<AuthSession, View>();
  readonly #closing = new Map<AuthSession, Promise<void>>();
  readonly #scopes = new WeakMap<AuthSession, Map<number, Scope>>();
  readonly #lastBatch = new Map<string, number>();
  readonly #targetFor: (owner: AuthSession, channel: number) => Target | null;
  readonly #selectorFor: SelectorFor;
  readonly #timer: ReturnType<typeof setInterval>;
  #disposed = false;

  constructor(
    targetFor: (owner: AuthSession, channel: number) => Target | null,
    selectorFor: SelectorFor,
  ) {
    this.#targetFor = targetFor;
    this.#selectorFor = selectorFor;
    this.#timer = setInterval(() => this.#sweep(), 1000);
    this.#timer.unref();
  }

  async pvw(owner: AuthSession | null, req: PvwRequest): Promise<Frames> {
    if (owner === null || this.#disposed) return EMPTY;
    let view = this.#views.get(owner);
    if (req.sourceIds.length === 0) {
      if (view !== undefined && view.id === req.viewId && view.channel === req.channel)
        await this.drop(owner);
      return EMPTY;
    }
    const pendingClose = this.#closing.get(owner);
    if (pendingClose !== undefined) {
      await pendingClose;
      view = this.#views.get(owner);
    }
    const scope = this.#scope(owner, req.channel);
    if (scope === null) {
      await this.drop(owner);
      return EMPTY;
    }
    if (
      view !== undefined &&
      (view.channel !== req.channel || view.id !== req.viewId || view.scope !== scope)
    ) {
      await this.drop(owner);
      // A concurrent request may already have installed the replacement.
      if (this.#views.has(owner) || !this.#authorized(owner, req.channel, scope)) return EMPTY;
      view = undefined;
    }
    if (view === undefined) {
      view = {
        channel: req.channel,
        id: req.viewId,
        scope,
        seenAt: Date.now(),
        leases: new Map(),
        retries: new Map(),
        work: null,
        demand: '',
        closed: false,
      };
      this.#views.set(owner, view);
    }
    view.seenAt = Date.now();
    const wanted = this.#selectors(owner, req.channel, req.sourceIds);
    const demand = JSON.stringify([...wanted]);
    if (view.work !== null) return view.demand === demand ? view.work : EMPTY;
    view.demand = demand;
    const current = view;
    const work = this.#poll(owner, current, wanted).finally(() => {
      current.work = null;
    });
    current.work = work;
    return work;
  }

  async thumbnails(owner: AuthSession | null, req: ThumbnailRequest): Promise<Frames> {
    if (owner === null || this.#disposed) return EMPTY;
    const scope = this.#scope(owner, req.channel);
    const ownerKey = owner.token?.jti;
    if (scope === null || ownerKey == null) return EMPTY;
    const requested = [...this.#selectors(owner, req.channel, req.sourceIds)];
    if (requested.length === 0 || Date.now() < (this.#lastBatch.get(ownerKey) ?? 0)) return EMPTY;
    const capability = await this.#capability(scope);
    if (capability === null || !this.#authorized(owner, req.channel, scope)) return EMPTY;
    const wanted = requested
      .filter(([, source]) => capability.sourceKinds.includes(source.kind))
      .slice(0, capability.maxBatchSources);
    const now = Date.now();
    if (wanted.length === 0 || now < (this.#lastBatch.get(ownerKey) ?? 0)) return EMPTY;
    this.#lastBatch.set(ownerKey, now + 1000);
    const result = await scope.client.snapshots(wanted.map(([, source]) => source));
    if (!result.ok || !this.#authorized(owner, req.channel, scope)) return EMPTY;
    return {
      frames: wanted.flatMap(([sourceId, source], index) => {
        const frame = result.value.items[index]?.frame;
        return frame == null || !this.#sameSelector(owner, req.channel, sourceId, source)
          ? []
          : [projectFrame(sourceId, frame, source.kind)];
      }),
    };
  }

  async drop(owner: AuthSession): Promise<void> {
    const view = this.#views.get(owner);
    if (view === undefined) return this.#closing.get(owner);
    this.#views.delete(owner);
    view.closed = true;
    const closing = this.#closeView(view).finally(() => this.#closing.delete(owner));
    this.#closing.set(owner, closing);
    await closing;
  }

  async dispose(): Promise<void> {
    this.#disposed = true;
    clearInterval(this.#timer);
    await Promise.all([...this.#views.keys()].map((owner) => this.drop(owner)));
    await Promise.all(this.#closing.values());
  }

  async #closeView(view: View): Promise<void> {
    await view.work?.catch(() => EMPTY);
    await Promise.allSettled(
      [...view.leases.values()].map((lease) => view.scope.client.stop(lease.session)),
    );
  }

  #scope(owner: AuthSession, channel: number): Scope | null {
    const target = this.#targetFor(owner, channel);
    if (target === null) return null;
    let byChannel = this.#scopes.get(owner);
    if (byChannel === undefined) {
      byChannel = new Map();
      this.#scopes.set(owner, byChannel);
    }
    const prior = byChannel.get(channel);
    if (prior !== undefined && sameTarget(prior.target, target)) return prior;
    const scope = {
      target,
      client: new PlayoutSourcePreviews(target.origin, target.code, target.bearer),
      capability: null,
    };
    byChannel.set(channel, scope);
    return scope;
  }

  #authorized(owner: AuthSession, channel: number, scope: Scope): boolean {
    const target = this.#targetFor(owner, channel);
    return !this.#disposed && target !== null && sameTarget(scope.target, target);
  }

  #capability(scope: Scope): Promise<SourcePreviewCapability | null> {
    const now = Date.now();
    if (scope.capability !== null && scope.capability.until > now) return scope.capability.result;
    const result = scope.client.capabilities().then((reply) => (reply.ok ? reply.value : null));
    scope.capability = { until: now + CAPABILITY_TTL_MS, result };
    return result;
  }

  #selectors(
    owner: AuthSession,
    channel: number,
    ids: readonly string[],
  ): Map<string, SourcePreviewSelector> {
    const selectors = new Map<string, SourcePreviewSelector>();
    for (const id of new Set(ids)) {
      const selector = this.#selectorFor(owner, channel, id);
      if (selector !== null) selectors.set(id, selector);
    }
    return selectors;
  }

  #sameSelector(
    owner: AuthSession,
    channel: number,
    id: string,
    source: SourcePreviewSelector,
  ): boolean {
    return JSON.stringify(this.#selectorFor(owner, channel, id)) === JSON.stringify(source);
  }

  async #poll(
    owner: AuthSession,
    view: View,
    requested: ReadonlyMap<string, SourcePreviewSelector>,
  ): Promise<Frames> {
    const { channel, scope } = view;
    const active = (): boolean => !view.closed && this.#authorized(owner, channel, scope);
    const capability = await this.#capability(scope);
    if (capability === null || !active()) return EMPTY;
    const wanted = new Map(
      [...requested]
        .filter(([, source]) => capability.sourceKinds.includes(source.kind))
        .slice(0, capability.maxSubscriptionsPerChannel),
    );
    for (const id of view.retries.keys()) {
      if (!wanted.has(id)) view.retries.delete(id);
    }
    await Promise.all(
      [...view.leases].map(async ([id, lease]) => {
        if (lease.selector === JSON.stringify(wanted.get(id))) return;
        view.leases.delete(id);
        await scope.client.stop(lease.session);
      }),
    );
    if (!active()) return EMPTY;
    const frames = await Promise.all(
      [...wanted].map(async ([id, source]) => {
        const frame = await this.#frame(
          view,
          id,
          source,
          Math.ceil(1000 / capability.maxFramesPerSecond),
        );
        return this.#sameSelector(owner, channel, id, source) ? frame : null;
      }),
    );
    return active() ? { frames: frames.filter((frame) => frame !== null) } : EMPTY;
  }

  async #frame(
    view: View,
    id: string,
    source: SourcePreviewSelector,
    periodMs: number,
  ): Promise<SourcePreviewFrame | null> {
    const { client } = view.scope;
    let lease = view.leases.get(id);
    const now = Date.now();
    if (lease === undefined) {
      const selector = JSON.stringify(source);
      const prior = view.retries.get(id);
      const retry =
        prior?.selector === selector && prior.expiresAt > now
          ? prior
          : { requestId: randomUUID(), selector, expiresAt: now + LEASE_TTL_MS, after: 0 };
      if (now < retry.after) return null;
      const started = await client.start(source, retry.requestId);
      if (!started.ok) {
        view.retries.set(id, {
          ...retry,
          after: Date.now() + Math.max(2000, started.retryAfterMs ?? 0),
        });
        return null;
      }
      view.retries.delete(id);
      lease = {
        selector,
        session: started.value,
        renewAt: Date.now() + started.value.renewAfterSeconds * 1000,
        readAt: 0,
        frame: null,
        frameAt: 0,
      };
      view.leases.set(id, lease);
    }
    if (view.closed) return null;
    if (Date.now() >= lease.renewAt) {
      const renewed = await client.renew(lease.session);
      if (!renewed.ok) {
        view.leases.delete(id);
        await client.stop(lease.session);
        return null;
      }
      lease.session = renewed.value;
      lease.renewAt = Date.now() + renewed.value.renewAfterSeconds * 1000;
    }
    if (view.closed) return null;
    if (Date.now() < lease.readAt)
      return Date.now() - lease.frameAt <= MAX_MOVING_FRAME_AGE_MS ? lease.frame : null;
    lease.readAt = Date.now() + periodMs;
    const result = await client.readFrame(lease.session);
    if (!result.ok) {
      lease.readAt = Math.max(lease.readAt, Date.now() + (result.retryAfterMs ?? 0));
      if (result.status === 429)
        return Date.now() - lease.frameAt <= MAX_MOVING_FRAME_AGE_MS ? lease.frame : null;
      lease.frame = null;
      if ([401, 403, 404, 409, 410].includes(result.status)) {
        view.leases.delete(id);
        await client.stop(lease.session);
      }
      return null;
    }
    lease.frame = projectFrame(id, result.value.frame, source.kind);
    lease.frameAt = Date.now();
    return lease.frame;
  }

  #sweep(): void {
    const now = Date.now();
    for (const [owner, view] of this.#views) {
      if (
        now - view.seenAt > ABANDONED_VIEW_MS ||
        !this.#authorized(owner, view.channel, view.scope)
      )
        void this.drop(owner);
    }
    for (const [key, after] of this.#lastBatch) {
      if (now >= after) this.#lastBatch.delete(key);
    }
  }
}
