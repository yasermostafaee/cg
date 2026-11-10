import type { IncomingMessage } from 'node:http';
import { z } from 'zod';
import { openPlayoutResponse } from './playout-http.js';

const MAX_JSON_BYTES = 16 * 1024;
const revision = z.number().int().nonnegative().safe();
const gainDb = z.number().finite().min(-60).max(12);
const rampMs = z.number().int().min(0).max(5_000);
const requestSchema = z.object({ gainDb, expectedRevision: revision, rampMs: rampMs.optional() });
const stateSchema = z.object({
  contractVersion: z.literal(1),
  channelCode: z.string().min(1),
  unit: z.literal('dB').optional(),
  gainDb,
  rampMs: rampMs.optional(),
  revision,
  limits: z
    .object({ minDb: z.literal(-60), maxDb: z.literal(12), maxRampMs: z.literal(5_000) })
    .optional(),
  target: z.object({ casparChannel: z.number().int().positive().safe(), layer: revision }),
  application: z.object({
    desiredRevision: revision,
    appliedRevision: revision.nullable(),
    state: z.enum(['pending', 'ramping', 'applied']),
    limited: z.boolean().optional(),
    rampEndsAt: z.string().datetime({ offset: true }).nullable().optional(),
    coreGeneration: revision.optional(),
  }),
});
const errorSchema = z.object({ error: z.string().max(80), currentRevision: revision.optional() });

export type PlayoutProgrammeGainRequest = z.infer<typeof requestSchema>;
export type PlayoutProgrammeGainState = z.infer<typeof stateSchema>;
export type PlayoutProgrammeGainResult =
  | { ok: true; status: 200 | 202; state: PlayoutProgrammeGainState }
  | {
      ok: false;
      status: number;
      reason:
        | 'invalid-request'
        | 'forbidden'
        | 'unavailable'
        | 'conflict'
        | 'busy'
        | 'peer-owner'
        | 'uncertain';
      /** Read the current owner again before offering another write. Never replay the PUT. */
      reconcile: boolean;
      currentRevision?: number;
    };

/** Playout 2.18.17 R-110. Use the acting operator's bearer on the verified D4 owner only. */
export class PlayoutProgrammeGain {
  readonly #url: URL;
  readonly #code: string;
  readonly #bearer: string;
  readonly #casparChannel: number;

  constructor(origin: string, code: string, bearer: string, casparChannel: number) {
    this.#url = new URL(`/api/v1/channels/${encodeURIComponent(code)}/programme-gain`, origin);
    this.#code = code;
    this.#bearer = bearer;
    this.#casparChannel = casparChannel;
  }

  get(signal?: AbortSignal): Promise<PlayoutProgrammeGainResult> {
    return this.#request(signal);
  }

  async set(
    request: PlayoutProgrammeGainRequest,
    signal?: AbortSignal,
  ): Promise<PlayoutProgrammeGainResult> {
    const parsed = requestSchema.safeParse(request);
    if (!parsed.success) {
      return { ok: false, status: 0, reason: 'invalid-request', reconcile: false };
    }
    return this.#request(signal, parsed.data);
  }

  async #request(
    signal: AbortSignal | undefined,
    request?: PlayoutProgrammeGainRequest,
  ): Promise<PlayoutProgrammeGainResult> {
    const timeout = AbortSignal.timeout(request === undefined ? 2_500 : 6_000);
    try {
      const response = await openPlayoutResponse(this.#url, {
        method: request === undefined ? 'GET' : 'PUT',
        signal: signal === undefined ? timeout : AbortSignal.any([signal, timeout]),
        connectTimeoutMs: 1_500,
        headers: {
          Authorization: `Bearer ${this.#bearer}`,
          Accept: 'application/json',
          'Cache-Control': 'no-store',
          ...(request === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(request === undefined ? {} : { body: JSON.stringify(request) }),
      });
      const status = response.statusCode ?? 0;
      const body = await readJson(response);
      if (status === 200 || (status === 202 && request !== undefined)) {
        const parsed = stateSchema.safeParse(body);
        if (parsed.success && this.#matches(parsed.data, status, request)) {
          return { ok: true, status, state: parsed.data };
        }
      }
      return refusal(status, body, request !== undefined);
    } catch {
      return refusal(0, null, request !== undefined);
    }
  }

  #matches(
    state: PlayoutProgrammeGainState,
    status: 200 | 202,
    request: PlayoutProgrammeGainRequest | undefined,
  ): boolean {
    const { application } = state;
    if (
      state.channelCode.toLowerCase() !== this.#code.toLowerCase() ||
      state.target.casparChannel !== this.#casparChannel ||
      application.desiredRevision !== state.revision ||
      (application.state !== 'pending' && application.appliedRevision !== state.revision)
    ) {
      return false;
    }
    if (request === undefined) return true;
    return (
      state.gainDb === request.gainDb &&
      state.revision > request.expectedRevision &&
      (state.rampMs === undefined || state.rampMs === (request.rampMs ?? 0)) &&
      (application.state === 'pending') === (status === 202)
    );
  }
}

async function readJson(response: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of response as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > MAX_JSON_BYTES) {
      response.destroy();
      return null;
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch {
    return null;
  }
}

function refusal(status: number, body: unknown, write: boolean): PlayoutProgrammeGainResult {
  if (status === 401 || status === 403) {
    return { ok: false, status, reason: 'forbidden', reconcile: false };
  }
  if (status === 400 || status === 428) {
    return { ok: false, status, reason: 'invalid-request', reconcile: false };
  }
  if (write && status === 409) {
    const parsed = errorSchema.safeParse(body);
    const code = parsed.success ? parsed.data.error : null;
    const reason =
      code === 'control.peerOwner'
        ? 'peer-owner'
        : code === 'programmeGain.busy'
          ? 'busy'
          : 'conflict';
    return {
      ok: false,
      status,
      reason,
      reconcile: true,
      ...(code === 'programmeGain.revisionConflict' &&
      parsed.success &&
      parsed.data.currentRevision !== undefined
        ? { currentRevision: parsed.data.currentRevision }
        : {}),
    };
  }
  if (write && status !== 404) {
    return { ok: false, status, reason: 'uncertain', reconcile: true };
  }
  return { ok: false, status, reason: 'unavailable', reconcile: false };
}
