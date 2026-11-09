import type { IncomingMessage } from 'node:http';
import { z } from 'zod';
import type { LivePreviewStatus, LivePreviewStream } from '@cg/shared-ipc';
import { openPlayoutResponse } from './playout-http.js';

const id = z.string().regex(/^[\w-]{1,128}$/);
const generation = z.string().regex(/^[\w:-]{1,160}$/);
const capabilities = z.object({
  leaseContractVersion: z.literal(1),
  leaseRequired: z.literal(true),
  ttlSeconds: z.number().int().positive().max(90),
  renewAfterSeconds: z.number().int().positive().max(30),
  independentFeedsPerChannel: z.literal(1),
});
const ownerIdentity = z.object({
  leaseId: id,
  generation,
  coreGeneration: z.number().int().nonnegative(),
  channelCode: z.string(),
  previewChannel: z.number().int().positive(),
  layer: z.literal(5),
});
const leaseShape = ownerIdentity.extend({
  ok: z.boolean(),
  state: z.enum(['ready', 'pending']),
  requestId: id,
  input: z.object({ id: z.string() }),
  expiresAt: z.string().datetime({ offset: true }),
  renewAfterSeconds: z.number().int().positive().max(30),
  feeds: z.object({ video: z.string(), audio: z.string(), meters: z.string() }).optional(),
});
const meterShape = ownerIdentity.extend({
  dbFs: z.array(z.number().finite()).max(16).nullable(),
  meterFreshness: z.enum(['fresh', 'stale']),
  oscFresh: z.boolean(),
  sampleAgeMs: z.number().nonnegative().nullable(),
});
const errorShape = z.object({ error: z.string().max(80) });
const MAX_JSON_BYTES = 32 * 1024;

export type PlayoutPreviewLease = z.infer<typeof leaseShape>;
export interface PlayoutPreviewReply {
  status: number;
  code: string;
  body: unknown;
}

export function previewRefusal(
  reply: PlayoutPreviewReply,
): Pick<LivePreviewStatus, 'state' | 'message'> {
  if (reply.code === 'preview.leaseReplaced')
    return { state: 'replaced', message: 'Another check replaced this preview.' };
  if (reply.status === 410 || reply.code === 'preview.leaseNotFound') {
    return { state: 'expired', message: 'The input preview ended.' };
  }
  if (reply.status === 401 || reply.status === 403) {
    return { state: 'forbidden', message: 'Playout refused access to this input preview.' };
  }
  if (reply.status === 409) {
    return {
      state: 'conflict',
      message: ['live.onAirConflict', 'live.receiverBusy'].includes(reply.code)
        ? 'The input is in use on Playout.'
        : 'Playout could not switch the preview.',
    };
  }
  return { state: 'unavailable', message: 'Playout could not open this input preview.' };
}

export class PlayoutLivePreview {
  readonly #origin: string;
  readonly #path: string;
  readonly #bearer: string;
  readonly #code: string;

  constructor(origin: string, code: string, bearer: string) {
    this.#origin = new URL(origin).origin;
    this.#path = '/api/v1/channels/' + encodeURIComponent(code) + '/live-preview';
    this.#code = code;
    this.#bearer = bearer;
  }

  capabilities(): Promise<PlayoutPreviewReply> {
    return this.#request('GET', this.#path + '?capabilities=true', 2500);
  }

  supports(reply: PlayoutPreviewReply): boolean {
    const cap = capabilities.safeParse(reply.body);
    return reply.status === 200 && cap.success && cap.data.renewAfterSeconds < cap.data.ttlSeconds;
  }

  start(inputId: string, requestId: string): Promise<PlayoutPreviewReply> {
    return this.#request('POST', this.#path, 6000, { inputId, requestId });
  }

  recover(requestId: string): Promise<PlayoutPreviewReply> {
    return this.#request(
      'GET',
      this.#path + '?' + new URLSearchParams({ requestId }).toString(),
      1000,
    );
  }

  renew(lease: PlayoutPreviewLease): Promise<PlayoutPreviewReply> {
    return this.#request('POST', this.#path + '/renew', 2500, {
      leaseId: lease.leaseId,
      generation: lease.generation,
    });
  }

  stop(lease: PlayoutPreviewLease): Promise<PlayoutPreviewReply> {
    const query = new URLSearchParams({ leaseId: lease.leaseId, generation: lease.generation });
    return this.#request('DELETE', this.#path + '?' + query.toString(), 2500);
  }

  lease(
    reply: PlayoutPreviewReply,
    requestId: string,
    inputId: string,
  ): PlayoutPreviewLease | null {
    if (reply.status !== 200 && reply.status !== 202) return null;
    const result = leaseShape.safeParse(reply.body);
    if (!result.success) return null;
    const lease = result.data;
    if (
      lease.channelCode.toLowerCase() !== this.#code.toLowerCase() ||
      lease.requestId !== requestId ||
      lease.input.id !== inputId ||
      lease.ok !== (lease.state === 'ready') ||
      lease.ok !== (reply.status === 200)
    )
      return null;
    const feed = this.#feedBase(lease);
    if (
      lease.state === 'ready' &&
      (lease.feeds?.video !== feed + '/video.mjpeg' ||
        lease.feeds.audio !== feed + '/audio' ||
        lease.feeds.meters !== feed + '/meters')
    )
      return null;
    return lease;
  }

  async meters(lease: PlayoutPreviewLease): Promise<PlayoutPreviewReply> {
    return this.#request('GET', this.#feedBase(lease) + '/meters/snapshot', 1000);
  }

  levels(
    reply: PlayoutPreviewReply,
    lease: PlayoutPreviewLease,
    elapsedMs: number,
  ): { dbFs: number[] | null; meterValidForMs: number } {
    const silent = { dbFs: null, meterValidForMs: 0 };
    const parsed = meterShape.safeParse(reply.body);
    if (reply.status !== 200 || !parsed.success) return silent;
    const m = parsed.data;
    if (
      m.leaseId !== lease.leaseId ||
      m.generation !== lease.generation ||
      m.coreGeneration !== lease.coreGeneration ||
      m.channelCode !== lease.channelCode ||
      m.previewChannel !== lease.previewChannel ||
      m.layer !== lease.layer ||
      m.meterFreshness !== 'fresh' ||
      !m.oscFresh ||
      m.sampleAgeMs === null ||
      m.sampleAgeMs + elapsedMs >= 300
    )
      return silent;
    return { dbFs: m.dbFs, meterValidForMs: 300 - m.sampleAgeMs - elapsedMs };
  }

  open(
    lease: PlayoutPreviewLease,
    stream: LivePreviewStream,
    signal: AbortSignal,
  ): Promise<IncomingMessage> {
    const path = this.#feedBase(lease) + (stream === 'picture' ? '/video.mjpeg' : '/audio');
    return this.#open('GET', path, signal);
  }

  #feedBase(lease: PlayoutPreviewLease): string {
    return this.#path + '/' + lease.leaseId;
  }

  #open(
    method: string,
    path: string,
    signal: AbortSignal,
    body?: string,
  ): Promise<IncomingMessage> {
    return openPlayoutResponse(new URL(path, this.#origin), {
      method,
      signal,
      connectTimeoutMs: 1500,
      headers: {
        Authorization: 'Bearer ' + this.#bearer,
        ...(body !== undefined && { 'Content-Type': 'application/json' }),
      },
      ...(body !== undefined && { body }),
    });
  }

  async #request(
    method: string,
    path: string,
    timeout: number,
    body?: object,
  ): Promise<PlayoutPreviewReply> {
    try {
      const response = await this.#open(
        method,
        path,
        AbortSignal.timeout(timeout),
        JSON.stringify(body),
      );
      const chunks: Buffer[] = [];
      let total = 0;
      for await (const chunk of response as AsyncIterable<Buffer>) {
        total += chunk.length;
        if (total > MAX_JSON_BYTES) {
          response.destroy();
          break;
        }
        chunks.push(chunk);
      }
      let parsed: unknown = null;
      if (total <= MAX_JSON_BYTES) {
        try {
          parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        } catch {
          /* Bare framework replies are valid failures. */
        }
      }
      const error = errorShape.safeParse(parsed);
      return {
        status: response.statusCode ?? 0,
        code: error.success ? error.data.error : '',
        body: parsed,
      };
    } catch {
      return { status: 0, code: '', body: null };
    }
  }
}
