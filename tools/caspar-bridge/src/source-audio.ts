import { setTimeout as delay } from 'node:timers/promises';
import {
  MAX_SOURCE_AUDIO_CHANNELS,
  type ChannelRequest,
  type SourceAudioLevelsChannel,
  type SourceAudioReading,
} from '@cg/shared-ipc';
import { z } from 'zod';
import type { AuthSession } from './auth-session.js';
import type { LivePreviewTarget } from './live-preview.js';
import { playoutFetch } from './playout-http.js';
import type { SourcePreviewSelector } from './playout-source-previews.js';

const MAX_BATCH = 8;
// At most ten batch requests per second per upstream token. Allow for timer rounding.
const BATCH_INTERVAL_MS = 110;
const UNSUPPORTED_RETRY_MS = 30_000;
const MAX_RESPONSE_BYTES = 32 * 1024;
const LEGACY_MAX_CHANNELS = 16;
const VALID_FOR_MS = 300;
const EMPTY: SourceAudioReading[] = [];

type Request = ChannelRequest<typeof SourceAudioLevelsChannel>;
type Target = LivePreviewTarget;
type Selector = Exclude<SourcePreviewSelector, { kind: 'media' }>;

const text = z.string().min(1).max(256);
const selector = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('live'), inputId: text }),
  z.object({
    kind: z.literal('playlist'),
    playlistOf: z.object({ casparHost: text, casparChannel: z.number().int().positive() }),
  }),
]);
const observation = z.object({
  audio: z.object({
    status: z.enum(['has-audio', 'no-audio', 'unknown']),
    channels: z.number().int().min(0).max(MAX_SOURCE_AUDIO_CHANNELS).nullish(),
  }),
  signal: z.enum(['present', 'silent', 'stale', 'absent', 'unknown', 'no-audio']),
  peakDbfs: z.array(z.number().min(-120).max(60)).max(MAX_SOURCE_AUDIO_CHANNELS).nullish(),
  sampledAt: z.string().datetime({ offset: true }).nullish(),
  sampleAgeMs: z.number().int().safe().nonnegative().nullish(),
  validForMs: z.literal(500),
  stage: z.literal('decoded-source-before-filters-and-mixer'),
});
const batch = z.object({
  engineId: text,
  channelCode: text,
  items: z
    .array(z.object({ source: selector, status: z.number().int(), reading: z.unknown() }))
    .max(MAX_BATCH),
});

function selectorKey(source: Selector): string {
  return source.kind === 'live'
    ? JSON.stringify(['live', source.inputId])
    : JSON.stringify([
        'playlist',
        source.playlistOf.casparHost.toLowerCase(),
        source.playlistOf.casparChannel,
      ]);
}

function sameTarget(a: Target, b: Target | null): boolean {
  return b !== null && a.origin === b.origin && a.code === b.code && a.bearer === b.bearer;
}

type Sample =
  | { state: 'has-audio' | 'no-audio' | 'unknown' }
  | { state: 'measured'; dbFs: number[]; expiresAt: number };

function sampleOf(raw: unknown, started: number): Sample | null {
  const parsed = observation.safeParse(raw);
  if (!parsed.success) return null;
  const { audio, signal, peakDbfs, sampledAt, sampleAgeMs, validForMs } = parsed.data;
  const { status: state, channels } = audio;
  // sampleAgeMs is from the source's monotonic clock. Subtract the whole request time so
  // clocks on different engines cannot give an older peak a new lifetime at the Bridge.
  const expiresAt = started + validForMs - (sampleAgeMs ?? Infinity);
  if (
    state === 'has-audio' &&
    (signal === 'present' || signal === 'silent') &&
    sampledAt != null &&
    peakDbfs != null &&
    peakDbfs.length > 0 &&
    peakDbfs.length === channels &&
    expiresAt > performance.now()
  )
    return { state: 'measured', dbFs: peakDbfs, expiresAt };
  return { state };
}

interface Poll {
  target: Target;
  demand: string;
  controller: AbortController;
  result: Promise<Map<string, Sample>>;
}

/** Passive meter reads use the authenticated catalogue and never create a preview lease. */
export class SourceAudioService {
  readonly #polls = new Map<AuthSession, Poll>();
  readonly #unsupportedUntil = new Map<string, number>();
  readonly #nextBatch = new Map<string, number>();
  readonly #activeTokens = new Set<string>();

  constructor(
    private readonly targetFor: (owner: AuthSession, channel: number) => Target | null,
    private readonly selectorFor: (
      owner: AuthSession,
      channel: number,
      id: string,
    ) => SourcePreviewSelector | null,
  ) {}

  async read(
    owner: AuthSession | null,
    { channel, sourceIds, maxChannels = LEGACY_MAX_CHANNELS }: Request,
  ): Promise<SourceAudioReading[]> {
    if (owner === null) return EMPTY;
    const target = this.targetFor(owner, channel);
    const tokenId = owner.token?.jti;
    if (target === null || tokenId == null) return EMPTY;
    const now = performance.now();
    const route = JSON.stringify([target.origin, target.code]);
    for (const [key, until] of this.#unsupportedUntil)
      if (now >= until) this.#unsupportedUntil.delete(key);
    if (this.#unsupportedUntil.has(route)) return EMPTY;

    const ids = new Map<string, string>();
    const sources = new Map<string, Selector>();
    for (const id of new Set(sourceIds)) {
      const source = this.selectorFor(owner, channel, id);
      if (source === null || source.kind === 'media') continue;
      const key = selectorKey(source);
      ids.set(id, key);
      sources.set(key, source);
    }
    if (ids.size === 0) return EMPTY;

    const demand = JSON.stringify([...sources.keys()].sort());
    let poll = this.#polls.get(owner);
    if (poll !== undefined && !sameTarget(poll.target, target)) {
      this.drop(owner);
      poll = undefined;
    }
    if (poll !== undefined && poll.demand !== demand) return EMPTY;
    if (poll === undefined) {
      const controller = new AbortController();
      const stillCurrent = (): boolean =>
        !controller.signal.aborted && sameTarget(target, this.targetFor(owner, channel));
      const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(4500)]);
      const result = this.#read(
        target,
        tokenId,
        route,
        [...sources.values()],
        signal,
        stillCurrent,
      );
      poll = { target, demand, controller, result };
      this.#polls.set(owner, poll);
      const started = poll;
      void result.finally(() => {
        if (this.#polls.get(owner) === started) this.#polls.delete(owner);
      });
    }

    const samples = await poll.result;
    if (poll.controller.signal.aborted || !sameTarget(target, this.targetFor(owner, channel)))
      return EMPTY;
    const readings: SourceAudioReading[] = [];
    for (const [sourceId, key] of ids) {
      const current = this.selectorFor(owner, channel, sourceId);
      const sample = samples.get(key);
      if (
        current === null ||
        current.kind === 'media' ||
        selectorKey(current) !== key ||
        sample === undefined
      )
        continue;
      if (sample.state === 'measured') {
        const validForMs = Math.min(VALID_FOR_MS, sample.expiresAt - performance.now());
        if (validForMs > 0) {
          readings.push({
            sourceId,
            state: 'measured',
            dbFs: sample.dbFs.slice(0, maxChannels),
            validForMs,
          });
          continue;
        }
        readings.push({ sourceId, state: 'has-audio' });
      } else {
        readings.push({ sourceId, state: sample.state });
      }
    }
    return readings;
  }

  drop(owner: AuthSession): void {
    this.#polls.get(owner)?.controller.abort();
    this.#polls.delete(owner);
  }

  dispose(): void {
    for (const owner of this.#polls.keys()) this.drop(owner);
    this.#nextBatch.clear();
    this.#unsupportedUntil.clear();
  }

  async #read(
    target: Target,
    tokenId: string,
    route: string,
    sources: Selector[],
    signal: AbortSignal,
    stillCurrent: () => boolean,
  ): Promise<Map<string, Sample>> {
    const samples = new Map<string, Sample>();
    const token = JSON.stringify([target.origin, tokenId]);
    if (this.#activeTokens.has(token)) return samples;
    this.#activeTokens.add(token);
    try {
      const url = new URL(
        `/api/v1/channels/${encodeURIComponent(target.code)}/source-audio/meters`,
        target.origin,
      );
      for (let offset = 0; offset < sources.length && stillCurrent(); offset += MAX_BATCH) {
        const now = performance.now();
        for (const [key, next] of this.#nextBatch) if (next <= now) this.#nextBatch.delete(key);
        const next = Math.max(now, this.#nextBatch.get(token) ?? 0);
        if (next - now > 1000) break;
        this.#nextBatch.set(token, next + BATCH_INTERVAL_MS);
        if (next > now) await delay(next - now, undefined, { signal });
        if (!stillCurrent()) break;
        const more = sources.slice(offset, offset + MAX_BATCH);
        const started = performance.now();
        const response = await playoutFetch(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${target.bearer}`,
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ sources: more }),
          signal,
          maxResponseBytes: MAX_RESPONSE_BYTES,
        });
        const { status } = response;
        const json =
          response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ===
          'application/json';
        if (status !== 200 || !json) {
          if (status === 405 || (status === 404 && !json))
            this.#unsupportedUntil.set(route, started + UNSUPPORTED_RETRY_MS);
          if (status === 429) {
            const seconds = Number(response.headers.get('retry-after'));
            const pause =
              Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 10) * 1000 : 1000;
            this.#nextBatch.set(token, performance.now() + pause);
          }
          // Other independent chunks can survive a source removed between catalogue and read.
          if ((status === 404 && json) || status === 409) continue;
          break;
        }
        const raw: unknown = await response.json();
        const decoded = batch.safeParse(raw);
        if (
          !decoded.success ||
          decoded.data.channelCode.toLowerCase() !== target.code.toLowerCase()
        )
          break;
        const wanted = new Set(more.map(selectorKey));
        const observed = new Set<string>();
        for (const item of decoded.data.items) {
          const key = selectorKey(item.source);
          if (!wanted.has(key)) continue;
          if (observed.has(key)) {
            samples.delete(key);
            continue;
          }
          observed.add(key);
          if (item.status !== 200) continue;
          const sample = sampleOf(item.reading, started);
          if (sample !== null) samples.set(key, sample);
        }
      }
    } catch {
      // Transport or parse faults are unavailable observations, including before the API shipped.
    } finally {
      this.#activeTokens.delete(token);
    }
    return samples;
  }
}
