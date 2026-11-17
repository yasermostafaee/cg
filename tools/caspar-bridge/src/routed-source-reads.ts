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

interface Options {
  prepare: (
    owner: AuthSession,
    channel: number,
    sourceIds: readonly string[],
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
    const replies = await Promise.all(
      ENGINES.map(async (engine) => {
        const ids = request.sourceIds.filter((id) => routes.get(id) === engine);
        const result = await this.#previews[engine].pvw(owner, { ...request, sourceIds: ids });
        return result.frames.map((frame) => ({ ...frame, engine }));
      }),
    );
    return current() ? { frames: replies.flat() } : { frames: [] };
  }

  async thumbnails(owner: AuthSession | null, request: ThumbnailRequest): Promise<Frames> {
    if (owner === null || this.#disposed) return { frames: [] };
    const routes = await this.#routes(owner, request.channel, [
      ...request.sourceIds,
      ...(request.mediaPosition === undefined ? [] : [request.mediaPosition.sourceId]),
    ]);
    const replies = await Promise.all(
      ENGINES.map(async (engine): Promise<Frames> => {
        const sourceIds = request.sourceIds.filter((id) => routes.get(id) === engine);
        const mediaPosition =
          request.mediaPosition !== undefined &&
          routes.get(request.mediaPosition.sourceId) === engine
            ? request.mediaPosition
            : undefined;
        if (sourceIds.length === 0 && mediaPosition === undefined) return { frames: [] };
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
      }),
    );
    const mediaFrame = replies.find((reply) => reply.mediaFrame !== undefined)?.mediaFrame;
    return {
      frames: replies.flatMap((reply) => reply.frames),
      ...(mediaFrame === undefined ? {} : { mediaFrame }),
    };
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
