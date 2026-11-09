import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { FRAME_A, FRAME_B, pgmFeedPart, toneChunk, wavHeader } from './fake-pgm-feed.js';

interface Lease {
  readonly owner: string;
  readonly inputId: string;
  readonly requestId: string;
  readonly leaseId: string;
  readonly generation: string;
  readonly channelCode: string;
  readonly previewChannel: number;
  readonly feeds: Set<ServerResponse>;
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body));
}

/** Playout 2.18.12 handoff shapes. The containing fake verifies the actual signed CG bearer. */
export class FakeLivePreview {
  readonly starts: { owner: string; body: unknown; channelCode: string }[] = [];
  readonly stops: { owner: string; leaseId: string | null; generation: string | null }[] = [];
  readonly paths: string[] = [];
  readonly leases = new Map<string, Lease>();
  legacy = false;
  inUse = false;
  pending = false;
  staleMeter = false;
  otherMeter = false;
  stalledVideo = false;
  audioOpens = 0;
  audioCloses = 0;
  renews = 0;
  renewAfter = 30;

  revoke(channelCode: string): void {
    const lease = this.leases.get(channelCode);
    this.leases.delete(channelCode);
    for (const response of lease?.feeds ?? []) response.end();
  }

  readonly handle = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    this.paths.push(url.pathname + url.search);
    const [, , , , channelCode, , leaseOrRenew, feed, subfeed] = url.pathname.split('/');
    if (channelCode === undefined) return json(res, 404, {});
    const owner = req.headers.authorization ?? '';
    const lease = this.leases.get(channelCode);
    const base = `/api/v1/channels/${channelCode}/live-preview`;
    const body = async (): Promise<unknown> => {
      const chunks: Buffer[] = [];
      for await (const chunk of req as AsyncIterable<Buffer>) chunks.push(chunk);
      return JSON.parse(Buffer.concat(chunks).toString()) as unknown;
    };
    const identity = (owned: Lease): object => ({
      leaseId: owned.leaseId,
      generation: owned.generation,
      coreGeneration: 2,
      channelCode: owned.channelCode,
      previewChannel: owned.previewChannel,
      layer: 5,
    });
    const state = (owned: Lease): void => {
      json(res, this.pending ? 202 : 200, {
        ...identity(owned),
        ok: !this.pending,
        state: this.pending ? 'pending' : 'ready',
        requestId: owned.requestId,
        input: { id: owned.inputId, address: 'udp://127.0.0.1:4333' },
        expiresAt: new Date(Date.now() + 90_000).toISOString(),
        renewAfterSeconds: this.renewAfter,
        ...(!this.pending && {
          feeds: {
            video: `${base}/${owned.leaseId}/video.mjpeg`,
            audio: `${base}/${owned.leaseId}/audio`,
            meters: `${base}/${owned.leaseId}/meters`,
          },
        }),
      });
    };
    if (req.method === 'GET' && url.searchParams.get('capabilities') === 'true') {
      if (this.legacy) return json(res, 405, {});
      return json(res, 200, {
        leaseContractVersion: 1,
        leaseRequired: true,
        ttlSeconds: 90,
        renewAfterSeconds: this.renewAfter,
        independentFeedsPerChannel: 1,
      });
    }
    if (req.method === 'POST' && leaseOrRenew === undefined) {
      const data = await body();
      this.starts.push({ owner, body: data, channelCode });
      if (this.inUse) return json(res, 409, { error: 'live.onAirConflict' });
      if (
        typeof data !== 'object' ||
        data === null ||
        !('inputId' in data) ||
        !('requestId' in data) ||
        typeof data.requestId !== 'string' ||
        typeof data.inputId !== 'string' ||
        !/^li-/.test(data.inputId)
      ) {
        return json(res, 400, { error: 'preview.invalidRequestId' });
      }
      this.revoke(channelCode);
      const next: Lease = {
        owner,
        inputId: data.inputId,
        requestId: data.requestId,
        leaseId: randomUUID(),
        generation: 'native-core:2',
        channelCode,
        previewChannel: channelCode === 'fake-cg' ? 4 : 3,
        feeds: new Set(),
      };
      this.leases.set(channelCode, next);
      return state(next);
    }
    if (req.method === 'DELETE') {
      const leaseId = url.searchParams.get('leaseId');
      const generation = url.searchParams.get('generation');
      this.stops.push({ owner, leaseId, generation });
      if (leaseId === null) return json(res, 428, { error: 'preview.leaseRequired' });
      if (lease === undefined || lease.leaseId !== leaseId || lease.generation !== generation) {
        return json(res, 409, { error: 'preview.leaseReplaced' });
      }
      if (owner !== lease.owner) return json(res, 403, { error: 'preview.notOwner' });
      this.revoke(channelCode);
      return json(res, 200, { ok: true });
    }
    if (lease === undefined) return json(res, 410, { error: 'preview.leaseEnded' });
    if (owner !== lease.owner) return json(res, 403, { error: 'preview.notOwner' });
    if (req.method === 'POST' && leaseOrRenew === 'renew') {
      const data = await body();
      if (
        JSON.stringify(data) !==
        JSON.stringify({ leaseId: lease.leaseId, generation: lease.generation })
      ) {
        return json(res, 409, { error: 'preview.leaseReplaced' });
      }
      this.renews++;
      return state(lease);
    }
    if (req.method === 'GET' && leaseOrRenew === undefined) {
      return url.searchParams.get('requestId') === lease.requestId
        ? state(lease)
        : json(res, 409, { error: 'preview.leaseReplaced' });
    }
    if (leaseOrRenew !== lease.leaseId) return json(res, 404, { error: 'preview.leaseNotFound' });
    if (feed === 'meters' && subfeed === 'snapshot') {
      return json(res, 200, {
        ...identity(lease),
        ...(this.otherMeter ? { leaseId: 'other-lease' } : {}),
        dbFs: [-21, -18],
        meterFreshness: this.staleMeter ? 'stale' : 'fresh',
        oscFresh: !this.staleMeter,
        sampleAgeMs: this.staleMeter ? 500 : 8,
        sourceFreshness: 'unknown',
        hasSignal: null,
      });
    }
    const picture = feed === 'video.mjpeg';
    if (!picture && feed !== 'audio') return json(res, 404, {});
    res.writeHead(200, {
      'content-type': picture ? 'multipart/x-mixed-replace; boundary=apasaipgm' : 'audio/wav',
    });
    res.flushHeaders();
    lease.feeds.add(res);
    if (!picture) {
      this.audioOpens++;
      res.write(wavHeader());
    }
    let sample = 0;
    const tick = (): void => {
      if (picture) {
        if (!this.stalledVideo) {
          const frame = lease.inputId === 'li-studio1' ? FRAME_A : FRAME_B;
          res.write(pgmFeedPart(frame));
        }
      } else {
        res.write(toneChunk(sample));
        sample += 960;
      }
    };
    tick();
    const timer = setInterval(tick, picture ? 80 : 20);
    res.once('close', () => {
      clearInterval(timer);
      lease.feeds.delete(res);
      if (!picture) this.audioCloses++;
    });
  };
}
