import type {
  ChannelRequest,
  MediaPreviewFrame,
  SourceAudioLevelsChannel,
  SourceAudioReading,
  SourcePreviewFrame,
  SourcePreviewPvwChannel,
  SourcePreviewThumbnailsChannel,
} from '@cg/shared-ipc';
import type { AuthSession } from './auth-session.js';
import type { LivePreviewTarget } from './live-preview.js';
import type { SourcePreviewSelector } from './playout-source-previews.js';
import { SourceAudioService } from './source-audio.js';
import { SourcePreviewService } from './source-preview-service.js';
import type { PreviewEngine } from './source-read-routing.js';

const ENGINES = ['A', 'B'] as const;
type PvwRequest = ChannelRequest<typeof SourcePreviewPvwChannel>;
type ThumbnailRequest = ChannelRequest<typeof SourcePreviewThumbnailsChannel>;
type AudioRequest = ChannelRequest<typeof SourceAudioLevelsChannel>;
interface Frames {
  frames: SourcePreviewFrame[];
  mediaFrame?: MediaPreviewFrame;
}

interface WarmPictures {
  channel: number;
  viewId?: string;
  routes: ReadonlyMap<string, PreviewEngine>;
}

interface PictureScope {
  target: LivePreviewTarget | null;
  selectors: ReadonlyMap<string, string | null>;
  media?: { sourceId: string; atMs: number; mediaId: string | null };
}

interface Options {
  prepare: (
    owner: AuthSession,
    channel: number,
    sourceIds: readonly string[],
    stillCurrent: () => boolean,
  ) => Promise<ReadonlyMap<string, PreviewEngine>>;
  fallback?: (
    owner: AuthSession,
    channel: number,
    from: ReadonlyMap<string, PreviewEngine>,
    stillCurrent: () => boolean,
  ) => Promise<ReadonlyMap<string, PreviewEngine>>;
  target: (engine: PreviewEngine, owner: AuthSession, channel: number) => LivePreviewTarget | null;
  selector: (
    engine: PreviewEngine,
    owner: AuthSession,
    channel: number,
    sourceId: string,
  ) => SourcePreviewSelector | null;
  mediaId: (
    engine: PreviewEngine,
    owner: AuthSession,
    channel: number,
    sourceId: string,
    atMs: number,
  ) => string | null;
}

/** Each node owns its leases, throttles, selectors and bearer; only the logical source IDs join. */
export class RoutedSourceReads {
  readonly #previews: Record<PreviewEngine, SourcePreviewService>;
  readonly #audio: Record<PreviewEngine, SourceAudioService>;
  readonly #owners = new Set<AuthSession>();
  readonly #generations = new WeakMap<AuthSession, number>();
  readonly #pvwGenerations = new WeakMap<AuthSession, number>();
  readonly #warmPvw = new WeakMap<AuthSession, WarmPictures>();
  readonly #warmThumbnails = new WeakMap<AuthSession, WarmPictures>();
  #disposed = false;

  constructor(private readonly options: Options) {
    const preview = (engine: PreviewEngine): SourcePreviewService =>
      new SourcePreviewService(
        (owner, channel) => options.target(engine, owner, channel),
        (owner, channel, sourceId) => options.selector(engine, owner, channel, sourceId),
        (sourceId, atMs, owner, channel) => options.mediaId(engine, owner, channel, sourceId, atMs),
      );
    const audio = (engine: PreviewEngine): SourceAudioService =>
      new SourceAudioService(
        (owner, channel) => options.target(engine, owner, channel),
        (owner, channel, sourceId) => options.selector(engine, owner, channel, sourceId),
      );
    this.#previews = { A: preview('A'), B: preview('B') };
    this.#audio = { A: audio('A'), B: audio('B') };
  }

  async #routes(
    owner: AuthSession,
    channel: number,
    ids: readonly string[],
    current: () => boolean = () => true,
  ): Promise<ReadonlyMap<string, PreviewEngine>> {
    if (this.#disposed) return new Map<string, PreviewEngine>();
    this.#owners.add(owner);
    const generation = this.#generations.get(owner) ?? 0;
    const stillCurrent = (): boolean =>
      !this.#disposed && generation === (this.#generations.get(owner) ?? 0) && current();
    const routes = await this.options
      .prepare(owner, channel, ids, stillCurrent)
      .catch(() => new Map<string, PreviewEngine>());
    return !stillCurrent() ? new Map<string, PreviewEngine>() : routes;
  }

  async pvw(owner: AuthSession | null, request: PvwRequest): Promise<Frames> {
    if (owner === null || this.#disposed) return { frames: [] };
    const generation = (this.#pvwGenerations.get(owner) ?? 0) + 1;
    this.#pvwGenerations.set(owner, generation);
    const current = (): boolean =>
      !this.#disposed && this.#pvwGenerations.get(owner) === generation;
    const routes = await this.#routes(owner, request.channel, request.sourceIds, current);
    if (!current()) return { frames: [] };
    const prior = this.#warmPvw.get(owner);
    const warm = await this.#warmRoutes(
      owner,
      request.channel,
      routes,
      prior?.viewId === request.viewId ? prior : undefined,
      current,
    );
    if (!current()) return { frames: [] };
    const requested = (engine: PreviewEngine, extra: ReadonlyMap<string, PreviewEngine>) =>
      request.sourceIds.filter((id) => routes.get(id) === engine || extra.get(id) === engine);
    const targets = new Map(
      ENGINES.map((engine) => [
        engine,
        this.#pictureScope(engine, owner, request.channel, requested(engine, warm)),
      ]),
    );
    const replies = await Promise.all(
      ENGINES.map(async (engine) => {
        const ids = requested(engine, warm);
        const result = await this.#previews[engine].pvw(owner, { ...request, sourceIds: ids });
        return result.frames.map((frame) => ({ ...frame, engine }));
      }),
    );
    if (!current()) return { frames: [] };
    const first = replies.flat();
    const missing = this.#missingPictures(request.sourceIds, routes, first);
    const fallback = await this.#fallbackRoutes(owner, request.channel, missing, warm, current);
    if (!current()) return { frames: [] };
    // One union per node keeps another wanted source's lease when adding/removing a fallback.
    const extraTargets = new Map<PreviewEngine, PictureScope>();
    const extra = await Promise.all(
      ENGINES.map(async (engine) => {
        const ids = requested(engine, fallback);
        if (JSON.stringify(ids) === JSON.stringify(requested(engine, warm))) return [];
        if (!current()) return [];
        extraTargets.set(engine, this.#pictureScope(engine, owner, request.channel, ids));
        const result = await this.#previews[engine].pvw(owner, { ...request, sourceIds: ids });
        return result.frames.map((frame) => ({ ...frame, engine }));
      }),
    );
    if (!current()) return { frames: [] };
    this.#warmPvw.set(owner, {
      channel: request.channel,
      viewId: request.viewId,
      routes: fallback,
    });
    return {
      frames: this.#mergePictures(request.sourceIds, routes, fallback, [
        ...this.#authorizedFrames(owner, request.channel, first, targets),
        ...this.#authorizedFrames(owner, request.channel, extra.flat(), extraTargets),
      ]),
    };
  }

  async thumbnails(owner: AuthSession | null, request: ThumbnailRequest): Promise<Frames> {
    if (owner === null || this.#disposed) return { frames: [] };
    // Passive input batches and a positioned media read are independent requests.
    const generation = this.#generations.get(owner) ?? 0;
    const current = () => !this.#disposed && (this.#generations.get(owner) ?? 0) === generation;
    const ids = [
      ...request.sourceIds,
      ...(request.mediaPosition === undefined ? [] : [request.mediaPosition.sourceId]),
    ];
    const routes = await this.#routes(owner, request.channel, ids, current);
    if (!current()) return { frames: [] };
    const warm = await this.#warmRoutes(
      owner,
      request.channel,
      routes,
      this.#warmThumbnails.get(owner),
      current,
    );
    if (!current()) return { frames: [] };
    const called = new Set<PreviewEngine>();
    const targets = new Map<PreviewEngine, PictureScope>();
    const query = async (
      engine: PreviewEngine,
      extra: ReadonlyMap<string, PreviewEngine>,
    ): Promise<Frames> => {
      const sourceIds = request.sourceIds.filter(
        (id) => routes.get(id) === engine || extra.get(id) === engine,
      );
      const mediaPosition =
        request.mediaPosition !== undefined &&
        (routes.get(request.mediaPosition.sourceId) === engine ||
          extra.get(request.mediaPosition.sourceId) === engine)
          ? request.mediaPosition
          : undefined;
      if (sourceIds.length === 0 && mediaPosition === undefined) return { frames: [] };
      called.add(engine);
      targets.set(
        engine,
        this.#pictureScope(engine, owner, request.channel, sourceIds, mediaPosition),
      );
      const result = await this.#previews[engine].thumbnails(owner, {
        channel: request.channel,
        sourceIds,
        ...(mediaPosition === undefined ? {} : { mediaPosition }),
      });
      return {
        frames: result.frames.map((frame) => ({ ...frame, engine })),
        ...(result.mediaFrame === undefined
          ? {}
          : { mediaFrame: { ...result.mediaFrame, engine } }),
      };
    };
    const replies = await Promise.all(ENGINES.map((engine) => query(engine, warm)));
    if (!current()) return { frames: [] };
    const first = replies.flatMap((reply) => reply.frames);
    const mediaFrames = replies.flatMap((reply) =>
      reply.mediaFrame === undefined ? [] : [reply.mediaFrame],
    );
    const missing = this.#missingPictures(request.sourceIds, routes, first);
    const media = request.mediaPosition;
    const primaryMedia =
      media === undefined
        ? undefined
        : mediaFrames.find(
            (frame) =>
              frame.sourceId === media.sourceId &&
              frame.previewPositionMs === media.atMs &&
              frame.engine === routes.get(media.sourceId),
          );
    if (
      media !== undefined &&
      primaryMedia !== undefined &&
      primaryMedia.jpegBase64 === undefined
    ) {
      const engine = routes.get(media.sourceId);
      if (engine !== undefined) missing.set(media.sourceId, engine);
    }
    const fallback = await this.#fallbackRoutes(owner, request.channel, missing, warm, current);
    if (!current()) return { frames: [] };
    // A node already used its normal snapshot budget. Warm the union for the next normal poll.
    const extra = await Promise.all(
      ENGINES.map((engine) =>
        called.has(engine) ? Promise.resolve<Frames>({ frames: [] }) : query(engine, fallback),
      ),
    );
    if (!current()) return { frames: [] };
    const previousWarm = this.#warmThumbnails.get(owner);
    const nextWarm = new Map(previousWarm?.channel === request.channel ? previousWarm.routes : []);
    for (const id of ids) nextWarm.delete(id);
    for (const [id, engine] of fallback) nextWarm.set(id, engine);
    while (nextWarm.size > 128) {
      const oldest = nextWarm.keys().next().value;
      if (oldest === undefined) break;
      nextWarm.delete(oldest);
    }
    this.#warmThumbnails.set(owner, { channel: request.channel, routes: nextWarm });
    const allMedia = this.#authorizedFrames(
      owner,
      request.channel,
      [
        ...mediaFrames,
        ...extra.flatMap((reply) => (reply.mediaFrame === undefined ? [] : [reply.mediaFrame])),
      ],
      targets,
    );
    const authorizedPrimaryMedia = allMedia.find((frame) => frame === primaryMedia);
    const alternateMedia =
      media === undefined
        ? undefined
        : allMedia.find(
            (frame) =>
              frame.sourceId === media.sourceId &&
              frame.previewPositionMs === media.atMs &&
              frame.engine === fallback.get(media.sourceId) &&
              frame.jpegBase64 !== undefined,
          );
    const mediaFrame =
      authorizedPrimaryMedia?.jpegBase64 === undefined
        ? (alternateMedia ?? authorizedPrimaryMedia)
        : authorizedPrimaryMedia;
    return {
      frames: this.#mergePictures(
        request.sourceIds,
        routes,
        fallback,
        this.#authorizedFrames(
          owner,
          request.channel,
          [...first, ...extra.flatMap((reply) => reply.frames)],
          targets,
        ),
      ),
      ...(mediaFrame === undefined ? {} : { mediaFrame }),
    };
  }

  #missingPictures(
    ids: readonly string[],
    routes: ReadonlyMap<string, PreviewEngine>,
    frames: readonly SourcePreviewFrame[],
  ): Map<string, PreviewEngine> {
    const result = new Map<string, PreviewEngine>();
    for (const id of ids) {
      const engine = routes.get(id);
      const frame = frames.find(
        (candidate) => candidate.sourceId === id && candidate.engine === engine,
      );
      if (engine !== undefined && frame !== undefined && frame.jpegBase64 === undefined)
        result.set(id, engine);
    }
    return result;
  }

  #authorizedFrames<T extends SourcePreviewFrame>(
    owner: AuthSession,
    channel: number,
    frames: readonly T[],
    targets: ReadonlyMap<PreviewEngine, PictureScope>,
  ): T[] {
    return frames.filter((frame) => {
      if (frame.engine === undefined) return false;
      const scope = targets.get(frame.engine);
      const before = scope?.target;
      const current = this.options.target(frame.engine, owner, channel);
      const selector = this.options.selector(frame.engine, owner, channel, frame.sourceId);
      const samePosition =
        !('previewPositionMs' in frame) ||
        (scope?.media !== undefined &&
          scope.media.sourceId === frame.sourceId &&
          scope.media.atMs === frame.previewPositionMs &&
          scope.media.mediaId !== null &&
          this.options.mediaId(frame.engine, owner, channel, frame.sourceId, scope.media.atMs) ===
            scope.media.mediaId);
      return (
        before != null &&
        current !== null &&
        before.origin === current.origin &&
        before.code === current.code &&
        before.bearer === current.bearer &&
        selector !== null &&
        scope?.selectors.get(frame.sourceId) === JSON.stringify(selector) &&
        samePosition
      );
    });
  }

  #pictureScope(
    engine: PreviewEngine,
    owner: AuthSession,
    channel: number,
    ids: readonly string[],
    media?: NonNullable<ThumbnailRequest['mediaPosition']>,
  ): PictureScope {
    return {
      target: this.options.target(engine, owner, channel),
      selectors: new Map(
        [...new Set([...ids, ...(media === undefined ? [] : [media.sourceId])])].map((id) => {
          const selector = this.options.selector(engine, owner, channel, id);
          return [id, selector === null ? null : JSON.stringify(selector)];
        }),
      ),
      ...(media === undefined
        ? {}
        : {
            media: {
              ...media,
              mediaId: this.options.mediaId(engine, owner, channel, media.sourceId, media.atMs),
            },
          }),
    };
  }

  async #warmRoutes(
    owner: AuthSession,
    channel: number,
    routes: ReadonlyMap<string, PreviewEngine>,
    prior: WarmPictures | undefined,
    current: () => boolean,
  ): Promise<ReadonlyMap<string, PreviewEngine>> {
    const from = new Map<string, PreviewEngine>();
    if (prior?.channel === channel)
      for (const [id, engine] of prior.routes) {
        const preferred = routes.get(id);
        if (preferred !== undefined && preferred !== engine) from.set(id, preferred);
      }
    return this.#fallbackRoutes(owner, channel, from, new Map(), current);
  }

  async #fallbackRoutes(
    owner: AuthSession,
    channel: number,
    from: ReadonlyMap<string, PreviewEngine>,
    warm: ReadonlyMap<string, PreviewEngine>,
    current: () => boolean,
  ): Promise<ReadonlyMap<string, PreviewEngine>> {
    const result = new Map<string, PreviewEngine>();
    if (!current() || from.size === 0 || this.options.fallback === undefined) return result;
    const cold = new Map<string, PreviewEngine>();
    for (const [id, engine] of from) {
      const verified = warm.get(id);
      if (verified !== undefined && verified !== engine) result.set(id, verified);
      else cold.set(id, engine);
    }
    if (cold.size > 0) {
      const verified = await this.options
        .fallback(owner, channel, cold, current)
        .catch(() => new Map<string, PreviewEngine>());
      if (!current()) return new Map();
      for (const [id, engine] of verified)
        if (cold.has(id) && engine !== cold.get(id)) result.set(id, engine);
    }
    return result;
  }

  #mergePictures(
    ids: readonly string[],
    routes: ReadonlyMap<string, PreviewEngine>,
    fallback: ReadonlyMap<string, PreviewEngine>,
    frames: readonly SourcePreviewFrame[],
  ): SourcePreviewFrame[] {
    return [...new Set(ids)].flatMap((id) => {
      const preferred = frames.filter(
        (frame) => frame.sourceId === id && frame.engine === routes.get(id),
      );
      const primary = preferred.find((frame) => frame.jpegBase64 !== undefined) ?? preferred.at(-1);
      const alternate = frames.find(
        (frame) =>
          frame.sourceId === id &&
          frame.engine === fallback.get(id) &&
          frame.jpegBase64 !== undefined,
      );
      const picture = primary?.jpegBase64 === undefined ? (alternate ?? primary) : primary;
      return picture === undefined ? [] : [picture];
    });
  }

  async read(owner: AuthSession | null, request: AudioRequest): Promise<SourceAudioReading[]> {
    if (owner === null || this.#disposed) return [];
    const routes = await this.#routes(owner, request.channel, request.sourceIds);
    const replies = await Promise.all(
      ENGINES.map(async (engine) => {
        const sourceIds = request.sourceIds.filter((id) => routes.get(id) === engine);
        if (sourceIds.length === 0) return [];
        const readings = await this.#audio[engine].read(owner, { ...request, sourceIds });
        return readings.map((reading) => ({ ...reading, engine }));
      }),
    );
    return replies.flat();
  }

  async drop(owner: AuthSession): Promise<void> {
    this.#pvwGenerations.set(owner, (this.#pvwGenerations.get(owner) ?? 0) + 1);
    this.#generations.set(owner, (this.#generations.get(owner) ?? 0) + 1);
    this.#warmPvw.delete(owner);
    this.#warmThumbnails.delete(owner);
    this.#owners.delete(owner);
    for (const engine of ENGINES) this.#audio[engine].drop(owner);
    await Promise.all(ENGINES.map((engine) => this.#previews[engine].drop(owner)));
  }

  async dispose(): Promise<void> {
    this.#disposed = true;
    await Promise.all([...this.#owners].map((owner) => this.drop(owner)));
    for (const engine of ENGINES) this.#audio[engine].dispose();
    await Promise.all(ENGINES.map((engine) => this.#previews[engine].dispose()));
  }
}
