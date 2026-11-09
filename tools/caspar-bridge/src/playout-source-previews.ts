import { probeImage } from '@cg/shared-ipc';
import { z } from 'zod';
import { openPlayoutResponse } from './playout-http.js';

const MAX_JPEG_BYTES = 128 * 1024;
const MAX_JPEG_BASE64 = Math.ceil(MAX_JPEG_BYTES / 3) * 4;
const MAX_DIMENSION = 640;
const MAX_BATCH = 8;
const MAX_SMALL_JSON = 16 * 1024;
const MAX_FRAME_JSON = MAX_JPEG_BASE64 + MAX_SMALL_JSON;
const REQUEST_TIMEOUT_MS = 10_000;

const shortText = z.string().min(1).max(256);
const id = z.string().regex(/^[\w-]{1,128}$/);
const generation = z.string().regex(/^[\w:-]{1,256}$/);
const requestIdShape = z.string().regex(/^[\w-]{16,128}$/);
const fingerprint = z.string().regex(/^[a-fA-F0-9]{64}$/);
const casparHost = z
  .string()
  .max(253)
  .regex(/^[A-Za-z0-9_.:[\]-]+$/);
const dateTime = z.string().max(64).datetime({ offset: true });
const wholeNumber = z.number().int().safe().nonnegative();
const positionMs = wholeNumber.max(86_400_000);
const liveSource = z.object({ kind: z.literal('live'), inputId: shortText });
const playlistSource = z.object({
  kind: z.literal('playlist'),
  playlistOf: z.object({ casparHost, casparChannel: z.number().int().min(1).max(4096) }).strict(),
});
const mediaSource = z.object({
  kind: z.literal('media'),
  mediaId: shortText.optional(),
  fingerprint: fingerprint.optional(),
  atMs: positionMs.optional(),
});
const selector = z
  .discriminatedUnion('kind', [liveSource.strict(), playlistSource.strict(), mediaSource.strict()])
  .refine((source) => source.kind !== 'media' || !!(source.mediaId || source.fingerprint));
const canonicalSource = z
  .discriminatedUnion('kind', [
    liveSource,
    playlistSource,
    mediaSource.extend({
      mediaId: shortText.nullish(),
      fingerprint: fingerprint.nullish(),
      atMs: positionMs.nullish(),
    }),
  ])
  .transform((source) => {
    if (source.kind !== 'media') return source;
    return {
      kind: source.kind,
      ...(source.mediaId ? { mediaId: source.mediaId } : {}),
      ...(source.fingerprint ? { fingerprint: source.fingerprint } : {}),
      atMs: source.atMs ?? 0,
    };
  })
  .refine((source) => source.kind !== 'media' || !!(source.mediaId || source.fingerprint));

const capability = z
  .object({
    contractVersion: z.literal(1),
    opensReceivers: z.literal(false),
    audio: z.literal(false),
    maxSubscriptionsPerChannel: z.number().int().positive().max(4),
    maxSubscriptions: z.number().int().positive().max(8),
    maxBatchSources: z.number().int().positive().max(MAX_BATCH),
    maxFramesPerSecond: z.number().int().positive().max(2),
    maxBytesPerSecond: z
      .number()
      .int()
      .positive()
      .max(2 * 1024 * 1024),
    burstBytes: z
      .number()
      .int()
      .positive()
      .max(2 * 1024 * 1024),
    ttlSeconds: z.number().int().positive().max(90),
    renewAfterSeconds: z.number().int().positive().max(30),
    maxWidth: z.number().int().positive().max(MAX_DIMENSION),
    maxHeight: z.number().int().positive().max(MAX_DIMENSION),
    maxJpegBytes: z.number().int().positive().max(MAX_JPEG_BYTES),
    sourceKinds: z
      .array(z.enum(['live', 'playlist', 'media']))
      .min(1)
      .max(3),
  })
  .refine(
    (value) =>
      value.renewAfterSeconds < value.ttlSeconds &&
      value.maxSubscriptionsPerChannel <= value.maxSubscriptions,
  );

const sessionIdentity = z.object({
  subscriptionId: id,
  generation,
  source: canonicalSource,
  sourceRevision: shortText,
});
const sessionShape = sessionIdentity.extend({
  coreGeneration: wholeNumber,
  channelCode: shortText,
  requestId: requestIdShape,
  expiresAt: dateTime,
  renewAfterSeconds: z.number().int().positive().max(30),
  frameUrl: z.string().max(1024),
  receiverOpened: z.literal(false),
  audioSubscribed: z.literal(false),
});
const axis = z.number().finite();
const rect = z.object({
  x: axis.nonnegative(),
  y: axis.nonnegative(),
  width: axis.positive(),
  height: axis.positive(),
});
const sar = z.object({
  numerator: wholeNumber.positive(),
  denominator: wholeNumber.positive(),
});
const geometry = z
  .object({
    sourceWidth: wholeNumber.positive().max(16_384),
    sourceHeight: wholeNumber.positive().max(16_384),
    sourceSar: sar.nullable(),
    sourceRotationDegrees: axis.nullish(),
    appliedRotationDegrees: z.number().int().optional(),
    visibleSourceRect: rect,
    deliveredWidth: wholeNumber.positive().max(MAX_DIMENSION),
    deliveredHeight: wholeNumber.positive().max(MAX_DIMENSION),
    deliveredSar: sar.nullish(),
    activeRect: rect,
    coversFullVisibleSource: z.boolean(),
    geometryRevision: shortText,
    sourceToDelivered: z.object({
      scaleX: axis.positive(),
      scaleY: axis.positive(),
      translateX: axis,
      translateY: axis,
    }),
    captureStage: z.literal('decoded-source-before-filters-and-mixer').optional(),
    coordinateSpace: z.enum(['decoded-frame-raster', 'decoded-visible-raster']).optional(),
  })
  .refine((g) => {
    const fits = (r: z.infer<typeof rect>, w: number, h: number): boolean =>
      r.x + r.width <= w + 1e-6 && r.y + r.height <= h + 1e-6;
    return (
      fits(g.visibleSourceRect, g.sourceWidth, g.sourceHeight) &&
      fits(g.activeRect, g.deliveredWidth, g.deliveredHeight)
    );
  });
const frame = z
  .object({
    schemaVersion: z.literal(1),
    supported: z.boolean(),
    state: z.enum(['ready', 'pending', 'capacity', 'unavailable']),
    signal: z.enum(['present', 'absent', 'unknown']),
    signalReason: shortText,
    signalScope: shortText.optional(),
    producerGeneration: shortText.nullish(),
    decodedVideoFrames: wholeNumber.nullish(),
    sampleSequence: wholeNumber.nullish(),
    sourceAgeMs: wholeNumber.nullish(),
    frameAgeMs: wholeNumber.nullish(),
    capturedAtUtc: dateTime.nullish(),
    requestedPositionMs: positionMs.nullish(),
    actualPositionMs: wholeNumber.nullish(),
    positionAccuracy: shortText.optional(),
    jpegBase64: z.string().min(4).max(MAX_JPEG_BASE64).nullable(),
    mimeType: z.literal('image/jpeg').optional(),
    geometry: geometry.nullable(),
  })
  .refine(({ jpegBase64, geometry: g }) => {
    if (jpegBase64 === null || g === null) return jpegBase64 === null && g === null;
    const bytes = Buffer.from(jpegBase64, 'base64');
    if (
      bytes.length > MAX_JPEG_BYTES ||
      bytes.toString('base64') !== jpegBase64 ||
      bytes.at(-2) !== 0xff ||
      bytes.at(-1) !== 0xd9
    )
      return false;
    const image = probeImage(bytes);
    return (
      image?.mime === 'image/jpeg' &&
      image.width === g.deliveredWidth &&
      image.height === g.deliveredHeight
    );
  });
const observation = sessionIdentity.extend({ observedAt: dateTime, frame });
const errorCode = z.string().regex(/^[A-Za-z][\w.-]{0,79}$/);
const batch = z.object({
  observedAt: dateTime,
  items: z
    .array(
      z
        .object({
          source: canonicalSource,
          sourceRevision: shortText.nullish(),
          status: z.number().int().min(200).max(599),
          error: errorCode.nullish(),
          frame: frame.nullish(),
        })
        .refine((item) =>
          item.status === 200 ? !!(item.frame && item.sourceRevision) : !item.frame,
        ),
    )
    .min(1)
    .max(MAX_BATCH),
});

export type SourcePreviewSelector = z.infer<typeof selector>;
export type SourcePreviewCapability = z.infer<typeof capability>;
export type SourcePreviewFrame = z.infer<typeof frame>;
export type SourcePreviewObservation = z.infer<typeof observation>;
export type SourcePreviewBatch = z.infer<typeof batch>;
type SessionWire = z.infer<typeof sessionShape>;
export type SourcePreviewSession = Readonly<Omit<SessionWire, 'frameUrl'>>;
interface OwnedSession {
  identity: SessionWire;
  closed: boolean;
}
export type SourcePreviewReply<T> =
  | { ok: true; value: T }
  | { ok: false; status: number; code: string; retryAfterMs?: number };

function matchesSource(actual: SourcePreviewSelector, expected: SourcePreviewSelector): boolean {
  switch (expected.kind) {
    case 'live':
      return actual.kind === 'live' && actual.inputId === expected.inputId;
    case 'playlist':
      return (
        actual.kind === 'playlist' &&
        actual.playlistOf.casparHost.toLowerCase() ===
          expected.playlistOf.casparHost.toLowerCase() &&
        actual.playlistOf.casparChannel === expected.playlistOf.casparChannel
      );
    case 'media':
      return (
        actual.kind === 'media' &&
        (expected.mediaId === undefined || actual.mediaId === expected.mediaId) &&
        (expected.fingerprint === undefined ||
          actual.fingerprint?.toLowerCase() === expected.fingerprint.toLowerCase()) &&
        (actual.atMs ?? 0) === (expected.atMs ?? 0)
      );
  }
}

function sameIdentity(a: z.infer<typeof sessionIdentity>, b: SessionWire): boolean {
  return (
    a.subscriptionId === b.subscriptionId &&
    a.generation === b.generation &&
    a.sourceRevision === b.sourceRevision &&
    matchesSource(a.source, b.source)
  );
}

function invalidResponse(): SourcePreviewReply<never> {
  return { ok: false, status: 502, code: 'sourcePreview.invalidResponse' };
}

function unknownSession(): SourcePreviewReply<never> {
  return { ok: false, status: 404, code: 'sourcePreview.notFound' };
}

/**
 * One Engine, D4 channel, and acting operator's bearer. Keep this instance with its
 * subscription handles. Demand, polling, rate budgets, and auth lifecycle live with its caller.
 */
export class PlayoutSourcePreviews {
  readonly #origin: string;
  readonly #path: string;
  readonly #code: string;
  readonly #bearer: string;
  readonly #sessions = new WeakMap<SourcePreviewSession, OwnedSession>();

  constructor(origin: string, code: string, bearer: string) {
    this.#origin = new URL(origin).origin;
    this.#path = '/api/v1/channels/' + encodeURIComponent(code) + '/source-previews';
    this.#code = code;
    this.#bearer = bearer;
  }

  capabilities(signal?: AbortSignal): Promise<SourcePreviewReply<SourcePreviewCapability>> {
    return this.#request('GET', this.#path, capability, MAX_SMALL_JSON, signal);
  }

  async start(
    source: SourcePreviewSelector,
    requestId: string,
    signal?: AbortSignal,
  ): Promise<SourcePreviewReply<SourcePreviewSession>> {
    const checked = selector.safeParse(source);
    if (!checked.success || !requestIdShape.safeParse(requestId).success)
      return { ok: false, status: 400, code: 'sourcePreview.invalidSelector' };
    const reply = await this.#request('POST', this.#path, sessionShape, MAX_SMALL_JSON, signal, {
      source: checked.data,
      requestId,
    });
    if (!reply.ok) return reply;
    return reply.value.requestId === requestId && matchesSource(reply.value.source, checked.data)
      ? this.#hold(reply.value)
      : invalidResponse();
  }

  async readFrame(
    session: SourcePreviewSession,
    signal?: AbortSignal,
  ): Promise<SourcePreviewReply<SourcePreviewObservation>> {
    const owned = this.#sessions.get(session);
    if (!owned || owned.closed) return unknownSession();
    const reply = await this.#request(
      'GET',
      this.#endpoint(owned.identity) + '/frame',
      observation,
      MAX_FRAME_JSON,
      signal,
    );
    if (owned.closed) return unknownSession();
    return reply.ok && !sameIdentity(reply.value, owned.identity) ? invalidResponse() : reply;
  }

  inspect(
    session: SourcePreviewSession,
    signal?: AbortSignal,
  ): Promise<SourcePreviewReply<SourcePreviewSession>> {
    return this.#readSession(session, 'GET', signal);
  }

  renew(
    session: SourcePreviewSession,
    signal?: AbortSignal,
  ): Promise<SourcePreviewReply<SourcePreviewSession>> {
    return this.#readSession(session, 'POST', signal);
  }

  async stop(
    session: SourcePreviewSession,
    signal?: AbortSignal,
  ): Promise<SourcePreviewReply<{ ok: true }>> {
    const owned = this.#sessions.get(session);
    if (!owned || owned.closed) return unknownSession();
    const query = new URLSearchParams({ generation: owned.identity.generation });
    const reply = await this.#request(
      'DELETE',
      this.#endpoint(owned.identity) + '?' + query.toString(),
      z.object({ ok: z.literal(true) }),
      MAX_SMALL_JSON,
      signal,
    );
    if (reply.ok || reply.status === 404 || reply.status === 410) owned.closed = true;
    return reply;
  }

  async snapshots(
    sources: readonly SourcePreviewSelector[],
    signal?: AbortSignal,
  ): Promise<SourcePreviewReply<SourcePreviewBatch>> {
    const checked = z.array(selector).min(1).max(MAX_BATCH).safeParse(sources);
    if (!checked.success) return { ok: false, status: 400, code: 'sourcePreview.invalidSelector' };
    const reply = await this.#request(
      'POST',
      this.#path + '/snapshots',
      batch,
      MAX_FRAME_JSON * checked.data.length,
      signal,
      { sources: checked.data },
    );
    if (!reply.ok) return reply;
    const remaining = [...reply.value.items];
    if (remaining.length !== checked.data.length) return invalidResponse();
    const items: SourcePreviewBatch['items'] = [];
    for (const source of checked.data) {
      const index = remaining.findIndex((item) => matchesSource(item.source, source));
      if (index === -1) return invalidResponse();
      items.push(...remaining.splice(index, 1));
    }
    return { ok: true, value: { observedAt: reply.value.observedAt, items } };
  }

  #endpoint(session: SessionWire): string {
    return this.#path + '/' + session.subscriptionId;
  }

  #hold(value: SessionWire, owned?: OwnedSession): SourcePreviewReply<SourcePreviewSession> {
    if (
      value.channelCode.toLowerCase() !== this.#code.toLowerCase() ||
      value.frameUrl !== this.#endpoint(value) + '/frame'
    )
      return invalidResponse();
    const { frameUrl: _, ...session } = value;
    const handle = Object.freeze(structuredClone(session));
    this.#sessions.set(handle, owned ?? { identity: value, closed: false });
    return { ok: true, value: handle };
  }

  async #readSession(
    session: SourcePreviewSession,
    method: 'GET' | 'POST',
    signal?: AbortSignal,
  ): Promise<SourcePreviewReply<SourcePreviewSession>> {
    const owned = this.#sessions.get(session);
    if (!owned || owned.closed) return unknownSession();
    const identity = owned.identity;
    const renewing = method === 'POST';
    const reply = await this.#request(
      method,
      this.#endpoint(identity) + (renewing ? '/renew' : ''),
      sessionShape,
      MAX_SMALL_JSON,
      signal,
      renewing ? { generation: identity.generation } : undefined,
    );
    if (owned.closed) return unknownSession();
    if (!reply.ok) return reply;
    const value = reply.value;
    return sameIdentity(value, identity) &&
      value.coreGeneration === identity.coreGeneration &&
      value.requestId === identity.requestId
      ? this.#hold(value, owned)
      : invalidResponse();
  }

  async #request<T>(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    schema: z.ZodType<T, z.ZodTypeDef, unknown>,
    maxBytes: number,
    signal: AbortSignal | undefined,
    payload?: object,
  ): Promise<SourcePreviewReply<T>> {
    const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    const requestSignal = signal === undefined ? timeout : AbortSignal.any([signal, timeout]);
    try {
      const response = await openPlayoutResponse(new URL(path, this.#origin), {
        method,
        headers: {
          Authorization: 'Bearer ' + this.#bearer,
          Accept: 'application/json',
          ...(payload === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
        signal: requestSignal,
      });
      const status = response.statusCode ?? 502;
      const retrySeconds = Number(response.headers['retry-after']);
      const refusal: SourcePreviewReply<never> = {
        ok: false,
        status,
        code: 'sourcePreview.refused',
        ...(Number.isFinite(retrySeconds) && retrySeconds > 0
          ? { retryAfterMs: Math.min(retrySeconds, 90) * 1000 }
          : {}),
      };
      const limit = status === 200 ? maxBytes : MAX_SMALL_JSON;
      const mime = response.headers['content-type']?.split(';')[0]?.trim().toLowerCase();
      if (mime !== 'application/json' || Number(response.headers['content-length']) > limit) {
        response.destroy();
        return status === 200 ? invalidResponse() : refusal;
      }

      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of response as AsyncIterable<Buffer>) {
        size += chunk.length;
        if (size > limit) {
          response.destroy();
          return status === 200 ? invalidResponse() : refusal;
        }
        chunks.push(chunk);
      }
      let raw: unknown;
      try {
        raw = JSON.parse(Buffer.concat(chunks, size).toString('utf8')) as unknown;
      } catch {
        return status === 200 ? invalidResponse() : refusal;
      }
      if (status !== 200) {
        const error = z.object({ error: errorCode }).safeParse(raw);
        return error.success ? { ...refusal, code: error.data.error } : refusal;
      }
      const value = schema.safeParse(raw);
      return value.success ? { ok: true, value: value.data } : invalidResponse();
    } catch {
      return {
        ok: false,
        status: 0,
        code: requestSignal.aborted ? 'sourcePreview.aborted' : 'sourcePreview.transportFailed',
      };
    }
  }
}
