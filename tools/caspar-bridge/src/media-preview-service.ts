import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { pipeline } from 'node:stream/promises';
import { z } from 'zod';
import {
  HTTP_TICKET_TTL_MS,
  type ChannelRequest,
  type MediaPlaybackPreview,
  type SourceMediaOpenChannel,
} from '@cg/shared-ipc';
import type { AuthSession } from './auth-session.js';
import type { HttpTickets, TicketGrant } from './http-tickets.js';
import { openPlayoutResponse, playoutFetch } from './playout-http.js';

export const MEDIA_PREVIEW_HTTP_PREFIX = '/media-preview/';
/** Verified Playout topology wins over the legacy AMCP sender's last selection. Read-only. */
export function mediaPreviewEngine(
  active: 'A' | 'B' | 'C' | 'D' | null | undefined,
  legacy: 'A' | 'B',
  primaryAvailable = true,
): 'A' | 'B' | null {
  if (active === 'C' || active === 'D') return null;
  return active ?? (primaryAvailable ? legacy : 'B');
}
type Resource = 'file' | 'proxy' | 'poster';
type OpenRequest = ChannelRequest<typeof SourceMediaOpenChannel>;

export interface MediaPreviewTarget {
  origin: string;
  code: string;
  bearer: string;
  mediaId: string;
  fingerprint?: string;
  engine: 'A' | 'B';
  host: string;
}

const manifestSchema = z.object({
  mediaId: z.string().min(1).max(256),
  fingerprint: z
    .string()
    .regex(/^[a-fA-F0-9]{64}$/)
    .transform((value) => value.toLowerCase()),
  durationMs: z.number().finite().nonnegative().nullable().optional(),
  browserMode: z.enum(['direct', 'proxy']),
  proxy: z.object({
    state: z.enum(['notPrepared', 'preparing', 'ready', 'error']),
  }),
  fileUrl: z.string(),
  proxyUrl: z.string(),
  prepareUrl: z.string(),
  posterUrl: z.string(),
});
type Manifest = z.infer<typeof manifestSchema>;

interface Preview {
  id: string;
  owner: AuthSession;
  actor: string | undefined;
  channel: number;
  sourceId: string;
  target: MediaPreviewTarget;
  manifest: Manifest | null;
  tickets: Record<Resource, string>;
  expiresAt: number;
  streams: Set<AbortController>;
  abort: AbortController;
  work: Promise<MediaPlaybackPreview> | null;
}

export interface MediaPreviewOptions {
  targetFor: (
    owner: AuthSession,
    channel: number,
    sourceId: string,
  ) => Promise<MediaPreviewTarget | null>;
  tickets: HttpTickets;
  fetch?: typeof playoutFetch;
  openStream?: typeof openPlayoutResponse;
  now?: () => number;
}

function sameMedia(a: MediaPreviewTarget, b: MediaPreviewTarget): boolean {
  return (
    a.origin === b.origin &&
    a.code === b.code &&
    a.mediaId === b.mediaId &&
    a.engine === b.engine &&
    (a.fingerprint === undefined || b.fingerprint === undefined || a.fingerprint === b.fingerprint)
  );
}

function rootPath(target: MediaPreviewTarget): string {
  return `/api/v1/channels/${encodeURIComponent(target.code)}/media-previews/${encodeURIComponent(target.mediaId)}`;
}

function validManifest(target: MediaPreviewTarget, value: unknown): Manifest | null {
  const parsed = manifestSchema.safeParse(value);
  if (!parsed.success) return null;
  const manifest = parsed.data;
  if (
    manifest.mediaId !== target.mediaId ||
    (target.fingerprint !== undefined && manifest.fingerprint !== target.fingerprint.toLowerCase())
  )
    return null;
  const root = rootPath(target);
  const revision = `?revision=${manifest.fingerprint}`;
  const expected = {
    fileUrl: `${root}/file${revision}`,
    proxyUrl: `${root}/proxy${revision}`,
    prepareUrl: `${root}/proxy`,
    posterUrl: `${root}/poster`,
  };
  for (const key of ['fileUrl', 'proxyUrl', 'prepareUrl', 'posterUrl'] as const) {
    const offered = manifest[key];
    if (!offered.startsWith('/') || offered.startsWith('//')) return null;
    if (new URL(offered, target.origin).href !== new URL(expected[key], target.origin).href)
      return null;
  }
  return manifest;
}

/** Streams a verified library item through a socket-owned, renewable HTTP grant. */
export class MediaPreviewService {
  readonly #options: MediaPreviewOptions;
  readonly #previews = new Map<string, Preview>();
  readonly #opening = new WeakMap<AuthSession, number>();
  readonly #now: () => number;
  readonly #timer: ReturnType<typeof setInterval>;
  #disposed = false;

  constructor(options: MediaPreviewOptions) {
    this.#options = options;
    this.#now = options.now ?? Date.now;
    this.#timer = setInterval(() => {
      for (const preview of this.#previews.values()) {
        if (this.#now() >= preview.expiresAt) this.#close(preview);
      }
    }, 1000);
    this.#timer.unref();
  }

  async open(owner: AuthSession | null, request: OpenRequest): Promise<MediaPlaybackPreview> {
    if (owner === null || this.#disposed) return { state: 'unavailable' };
    const actor = owner.token?.principal.sub;
    const generation = (this.#opening.get(owner) ?? 0) + (request.previewId === undefined ? 1 : 0);
    this.#opening.set(owner, generation);
    let preview =
      request.previewId === undefined ? undefined : this.#previews.get(request.previewId);
    if (request.previewId !== undefined) {
      if (preview?.owner !== owner) return { state: 'unavailable' };
      if (preview.channel !== request.channel || preview.sourceId !== request.sourceId) {
        this.#close(preview);
        return { state: 'unavailable', message: 'Open the preview for the selected media again.' };
      }
    }
    const target = await this.#options
      .targetFor(owner, request.channel, request.sourceId)
      .catch(() => null);
    if (this.#opening.get(owner) !== generation) return { state: 'unavailable' };
    if (
      preview !== undefined &&
      (this.#previews.get(preview.id) !== preview || this.#now() >= preview.expiresAt)
    ) {
      this.#close(preview);
      return { state: 'unavailable' };
    }
    if (target === null || this.#disposed || owner.token?.principal.sub !== actor) {
      if (preview !== undefined) this.#close(preview);
      return {
        state: 'unavailable',
        message: 'This media preview is unavailable on the source server.',
      };
    }
    if (preview !== undefined && !sameMedia(preview.target, target)) {
      this.#close(preview);
      preview = undefined;
    }
    if (preview === undefined) {
      this.#dropPreviews(owner);
      const id = randomUUID();
      const issue = (resource: Resource) =>
        this.#options.tickets.issue({
          kind: 'media-preview',
          channel: request.channel,
          previewId: id,
          resource,
        });
      preview = {
        id,
        owner,
        actor: owner.token?.principal.sub,
        channel: request.channel,
        sourceId: request.sourceId,
        target,
        manifest: null,
        tickets: { file: issue('file'), proxy: issue('proxy'), poster: issue('poster') },
        expiresAt: this.#now() + HTTP_TICKET_TTL_MS,
        streams: new Set(),
        abort: new AbortController(),
        work: null,
      };
      this.#previews.set(id, preview);
    } else {
      preview.target = target;
      const renewed = Object.values(preview.tickets).every((ticket) =>
        this.#options.tickets.renew(ticket),
      );
      if (!renewed) {
        this.#close(preview);
        return { state: 'unavailable', message: 'The media preview expired. Open it again.' };
      }
      preview.expiresAt = this.#now() + HTTP_TICKET_TTL_MS;
    }
    if (preview.work !== null) return preview.work;
    const current = preview;
    const work = this.#readManifest(current, request.prepare === true).finally(() => {
      if (current.work === work) current.work = null;
    });
    current.work = work;
    return work;
  }

  close(owner: AuthSession | null, previewId: string): { closed: boolean } {
    const preview = this.#previews.get(previewId);
    if (preview === undefined || preview.owner !== owner) return { closed: false };
    this.#close(preview);
    return { closed: true };
  }

  drop(owner: AuthSession): void {
    this.#opening.set(owner, (this.#opening.get(owner) ?? 0) + 1);
    this.#dropPreviews(owner);
  }

  #dropPreviews(owner: AuthSession): void {
    for (const preview of this.#previews.values()) {
      if (preview.owner === owner) this.#close(preview);
    }
  }

  dispose(): void {
    this.#disposed = true;
    clearInterval(this.#timer);
    for (const preview of this.#previews.values()) this.#close(preview);
  }

  async serve(
    req: IncomingMessage,
    res: ServerResponse,
    grant: Extract<TicketGrant, { kind: 'media-preview' }>,
  ): Promise<void> {
    const preview = this.#previews.get(grant.previewId);
    const target = preview === undefined ? null : await this.#currentTarget(preview);
    if (preview === undefined || target === null || preview.manifest === null) {
      res.writeHead(403).end();
      return;
    }
    if (req.aborted || res.destroyed) return;
    const resource = grant.resource;
    const manifest = preview.manifest;
    if (
      (resource === 'proxy' && manifest.proxy.state !== 'ready') ||
      (resource === 'file' && manifest.browserMode !== 'direct')
    ) {
      res.writeHead(409).end();
      return;
    }
    const controller = new AbortController();
    preview.streams.add(controller);
    const abort = () => controller.abort();
    req.once('aborted', abort);
    res.once('close', abort);
    let checking = false;
    const check = setInterval(() => {
      if (checking) return;
      checking = true;
      void this.#currentTarget(preview)
        .then((current) => {
          if (current === null) controller.abort();
        })
        .catch(() => controller.abort())
        .finally(() => {
          checking = false;
        });
    }, 3000);
    check.unref();
    try {
      const headers: Record<string, string> = { authorization: `Bearer ${target.bearer}` };
      for (const name of ['range', 'if-range'] as const) {
        const value = req.headers[name];
        if (typeof value === 'string') headers[name] = value;
      }
      const relative =
        resource === 'poster'
          ? manifest.posterUrl
          : resource === 'file'
            ? manifest.fileUrl
            : manifest.proxyUrl;
      const upstream = await (this.#options.openStream ?? openPlayoutResponse)(
        new URL(relative, target.origin),
        {
          method: req.method === 'HEAD' ? 'HEAD' : 'GET',
          headers,
          signal: controller.signal,
          connectTimeoutMs: 5000,
        },
      );
      const responseHeaders: Record<string, string> = {
        'cache-control': 'private, no-store',
        'access-control-allow-origin': '*',
      };
      for (const name of [
        'content-type',
        'content-length',
        'content-range',
        'accept-ranges',
        'etag',
        'last-modified',
      ]) {
        const value = upstream.headers[name];
        if (typeof value === 'string') responseHeaders[name] = value;
      }
      res.writeHead(upstream.statusCode ?? 502, responseHeaders);
      if (req.method === 'HEAD') {
        upstream.destroy();
        res.end();
      } else await pipeline(upstream, res, { signal: controller.signal });
    } finally {
      clearInterval(check);
      req.off('aborted', abort);
      res.off('close', abort);
      preview.streams.delete(controller);
    }
  }

  async #currentTarget(preview: Preview): Promise<MediaPreviewTarget | null> {
    const held = () =>
      !this.#disposed &&
      this.#previews.get(preview.id) === preview &&
      this.#now() < preview.expiresAt &&
      preview.owner.token?.principal.sub === preview.actor;
    if (!held()) {
      this.#close(preview);
      return null;
    }
    const current = await this.#options
      .targetFor(preview.owner, preview.channel, preview.sourceId)
      .catch(() => null);
    if (!held() || current === null || !sameMedia(preview.target, current)) {
      this.#close(preview);
      return null;
    }
    return current;
  }

  #view(preview: Preview, state: MediaPlaybackPreview['state']): MediaPlaybackPreview {
    const { manifest, target } = preview;
    if (manifest === null) return { state: 'unavailable' };
    const resource = manifest.browserMode === 'direct' ? 'file' : 'proxy';
    const url = (kind: Resource) =>
      `${MEDIA_PREVIEW_HTTP_PREFIX}${preview.id}/${kind}?ticket=${preview.tickets[kind]}`;
    return {
      state,
      previewId: preview.id,
      expiresAtMs: preview.expiresAt,
      ...(manifest.durationMs == null ? {} : { durationMs: manifest.durationMs }),
      ...(state === 'ready' ? { videoUrl: url(resource) } : {}),
      posterUrl: url('poster'),
      engine: target.engine,
      host: target.host,
    };
  }

  async #readManifest(preview: Preview, prepare: boolean): Promise<MediaPlaybackPreview> {
    try {
      const target = preview.target;
      const fetch = this.#options.fetch ?? playoutFetch;
      const signal = () => AbortSignal.any([preview.abort.signal, AbortSignal.timeout(8000)]);
      const response = await fetch(new URL(rootPath(target), target.origin), {
        headers: { authorization: `Bearer ${target.bearer}` },
        signal: signal(),
        maxResponseBytes: 128 * 1024,
      });
      if ([404, 405, 501].includes(response.status)) {
        this.#close(preview);
        return { state: 'unsupported' };
      }
      if (!response.ok) {
        this.#close(preview);
        return {
          state: 'unavailable',
          message: 'The source server could not open this media preview.',
        };
      }
      const manifest = validManifest(target, await response.json());
      if (manifest === null) {
        this.#close(preview);
        return { state: 'error', message: 'The media preview response could not be verified.' };
      }
      if (preview.manifest !== null && preview.manifest.fingerprint !== manifest.fingerprint) {
        this.#close(preview);
        return { state: 'unavailable', message: 'The media changed. Open its preview again.' };
      }
      if ((await this.#currentTarget(preview)) === null) return { state: 'unavailable' };
      preview.manifest = manifest;
      if (manifest.browserMode === 'proxy' && manifest.proxy.state === 'notPrepared' && prepare) {
        const prepared = await fetch(new URL(manifest.prepareUrl, target.origin), {
          method: 'POST',
          headers: { authorization: `Bearer ${target.bearer}`, 'content-type': 'application/json' },
          body: '{}',
          signal: signal(),
          maxResponseBytes: 128 * 1024,
        });
        if ((await this.#currentTarget(preview)) === null) return { state: 'unavailable' };
        if (prepared.status !== 200 && prepared.status !== 202)
          return {
            ...this.#view(preview, 'error'),
            message: 'The media proxy could not be prepared. Try again shortly.',
          };
        manifest.proxy.state = 'preparing';
      }
      const ready = manifest.browserMode === 'direct' || manifest.proxy.state === 'ready';
      return {
        ...this.#view(
          preview,
          manifest.proxy.state === 'error' && !ready ? 'error' : ready ? 'ready' : 'preparing',
        ),
        ...(manifest.proxy.state === 'error' && !ready
          ? { message: 'The media proxy could not be prepared.' }
          : {}),
      };
    } catch {
      this.#close(preview);
      return {
        state: 'unavailable',
        message: 'The source server did not answer the media preview request.',
      };
    }
  }

  #close(preview: Preview): void {
    this.#previews.delete(preview.id);
    preview.abort.abort();
    for (const ticket of Object.values(preview.tickets)) this.#options.tickets.revoke(ticket);
    for (const stream of preview.streams) stream.abort();
    preview.streams.clear();
  }
}
