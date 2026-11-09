import type { IncomingMessage, ServerResponse } from 'node:http';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import {
  canCheckLiveInput,
  LIVE_PREVIEW_HTTP_PREFIX,
  LIVE_PREVIEW_MAX_JPEG_BYTES,
  playoutInputIdOf,
  redactUrlCredentials,
  type ChannelRequest,
  type LivePreviewHandle,
  type LivePreviewStartChannel,
  type LivePreviewStatus,
  type LivePreviewStream,
  type SourceDefinition,
} from '@cg/shared-ipc';
import type { AuthSession } from './auth-session.js';
import type { TicketGrant } from './http-tickets.js';
import { MjpegPartParser } from './pgm-return.js';
import {
  PlayoutLivePreview,
  previewRefusal,
  type PlayoutPreviewLease,
  type PlayoutPreviewReply,
} from './playout-live-preview.js';

type Start = ChannelRequest<typeof LivePreviewStartChannel>;
type Fault = Pick<LivePreviewStatus, 'state' | 'message'>;

export interface LivePreviewTarget {
  origin: string;
  code: string;
  bearer: string;
}

export interface LivePreviewAudit {
  actor: string;
  actorSub: string;
  consoleAddress: string | null;
  channel: number;
  sourceName: string;
  operation: 'start' | 'replace' | 'stop';
  ok: boolean;
  code?: string;
}

interface Check {
  owner: AuthSession;
  req: Start;
  inputId: string;
  target: LivePreviewTarget;
  client: PlayoutLivePreview;
  view: LivePreviewStatus;
  lease: PlayoutPreviewLease | null;
  opened: number;
  seen: number;
  renewAt: number;
  terminal: boolean;
  feeds: Map<LivePreviewStream, AbortController>;
  refreshing: Promise<LivePreviewStatus> | null;
  auditIdentity: Pick<LivePreviewAudit, 'actor' | 'actorSub' | 'consoleAddress'>;
  startRecorded: boolean;
  replacedPrior: boolean;
}

const EXPIRED = { state: 'expired', message: 'The input preview ended.' } as const;
const REPLACED = { state: 'replaced', message: 'Another check replaced this preview.' } as const;
const STALLED = { state: 'stalled', message: 'The preview picture stopped.' } as const;
const FORBIDDEN = { state: 'forbidden', message: 'Sign in again to check an input.' } as const;

function status(req: LivePreviewHandle, sourceName: string, fault: Fault): LivePreviewStatus {
  return { channel: req.channel, previewId: req.previewId, sourceName, ...fault, dbFs: null };
}

function unavailable(source: SourceDefinition | undefined): Fault {
  const reason = source?.reason;
  return {
    state: 'unavailable',
    message:
      reason !== undefined && !/:\/\/|\\|\b\d{1,3}(?:\.\d{1,3}){3}\b/.test(reason)
        ? reason.slice(0, 512)
        : 'This input is unavailable for preview on this channel.',
  };
}

/** C-023. One check per socket and one lease per programme channel on the configured Playout. */
export class LivePreviewService {
  readonly #owners = new Map<AuthSession, Check>();
  readonly #active = new Map<number, Check>();
  readonly #queue = new Map<number, Promise<unknown>>();
  readonly #disconnected = new WeakSet<AuthSession>();
  readonly #tick: ReturnType<typeof setInterval>;
  #closed = false;

  constructor(
    private readonly resolve: (owner: AuthSession, channel: number) => LivePreviewTarget | null,
    private readonly source: (id: string) => SourceDefinition | undefined,
    private readonly audit: (row: LivePreviewAudit) => void,
  ) {
    this.#tick = setInterval(() => this.#sweep(), 1000);
    this.#tick.unref();
  }

  start(owner: AuthSession | null, req: Start): Promise<LivePreviewStatus> {
    const source = this.source(req.sourceId);
    const sourceName = redactUrlCredentials(source?.name ?? 'Input').slice(0, 256);
    const target = owner === null ? null : this.resolve(owner, req.channel);
    const token = owner?.token;
    if (
      this.#closed ||
      target === null ||
      owner === null ||
      this.#disconnected.has(owner) ||
      token === null ||
      token === undefined
    ) {
      return Promise.resolve(status(req, sourceName, FORBIDDEN));
    }
    const inputId = playoutInputIdOf(req.sourceId);
    if (inputId === null || source === undefined || !canCheckLiveInput(source, req.channel)) {
      this.audit({
        actor: token.principal.name,
        actorSub: token.principal.sub,
        consoleAddress: owner.peerAddress,
        channel: req.channel,
        sourceName,
        operation: 'start',
        ok: false,
        code: 'unavailable',
      });
      return Promise.resolve(status(req, sourceName, unavailable(source)));
    }
    const previous = this.#owners.get(owner);
    if (previous?.req.previewId === req.previewId) return Promise.resolve(previous.view);
    if (previous !== undefined) this.#end(previous, REPLACED);

    const now = Date.now();
    const check: Check = {
      owner,
      req,
      inputId,
      target,
      client: new PlayoutLivePreview(target.origin, target.code, target.bearer),
      view: status(req, sourceName, { state: 'connecting' }),
      lease: null,
      opened: now,
      seen: now,
      renewAt: Infinity,
      terminal: false,
      feeds: new Map(),
      refreshing: null,
      auditIdentity: {
        actor: token.principal.name,
        actorSub: token.principal.sub,
        consoleAddress: owner.peerAddress,
      },
      startRecorded: false,
      replacedPrior: false,
    };
    this.#owners.set(owner, check);
    // Let the console observe and cancel the handle while Playout acknowledges the start.
    void this.#serial(req.channel, () => this.#start(check)).catch(() => {
      this.#end(check, { state: 'unavailable', message: 'Could not open the input preview.' });
    });
    return Promise.resolve(check.view);
  }

  async #start(check: Check): Promise<LivePreviewStatus> {
    if (!this.#usable(check)) return this.#end(check, FORBIDDEN);
    const { client, req } = check;
    const capability = await client.capabilities();
    if (!this.#usable(check)) return this.#end(check, FORBIDDEN);
    if (!client.supports(capability)) {
      const fault = [401, 403].includes(capability.status)
        ? previewRefusal(capability)
        : ({
            state: 'unavailable',
            message: 'This Playout does not offer lease-based input preview.',
          } as const);
      return this.#end(check, fault);
    }

    const current = this.source(req.sourceId);
    if (current === undefined || !canCheckLiveInput(current, req.channel)) {
      return this.#end(check, unavailable(current));
    }
    const started = await client.start(check.inputId, req.previewId);
    let reply = started;
    if (reply.status === 0 || reply.code === 'live.previewUnconfirmed') {
      // A lost acknowledgement is recovered by its original request identity, never by another POST.
      for (const waitMs of [0, 200, 400]) {
        if (waitMs > 0) await delay(waitMs);
        const recovered = await client.recover(req.previewId);
        if (recovered.status === 200 || recovered.status === 202) {
          reply = recovered;
          break;
        }
        if ([401, 403, 409, 410].includes(recovered.status)) break;
      }
    }
    const lease = client.lease(reply, req.previewId, check.inputId);
    if (lease === null) return this.#end(check, previewRefusal(reply));
    check.lease = lease;
    if (!this.#usable(check)) {
      // Cancellation can arrive while POST is outstanding. The late lease belongs only to this check.
      this.#end(check, EXPIRED, false);
      await this.#stopUpstream(check, lease);
      return check.view;
    }
    check.seen = Date.now();
    const displaced = this.#active.get(req.channel);
    this.#active.set(req.channel, check);
    if (displaced !== undefined && displaced !== check) {
      check.replacedPrior = true;
      this.#end(displaced, REPLACED, false);
    }
    return this.#adopt(check, lease);
  }

  #adopt(check: Check, lease: PlayoutPreviewLease): LivePreviewStatus {
    if (Date.parse(lease.expiresAt) <= Date.now()) return this.#end(check, EXPIRED);
    check.lease = lease;
    check.renewAt = Date.now() + lease.renewAfterSeconds * 1000;
    check.view = status(check.req, check.view.sourceName, {
      state: lease.state === 'ready' ? 'ready' : 'connecting',
    });
    if (lease.state === 'ready') this.#recordStart(check, true);
    return check.view;
  }

  status(owner: AuthSession | null, req: LivePreviewHandle): Promise<LivePreviewStatus> {
    const check = this.#find(owner, req);
    if (check === undefined) return Promise.resolve(status(req, 'Input', EXPIRED));
    if (check.terminal || check.lease === null) return Promise.resolve(check.view);
    if (!this.#usable(check)) return Promise.resolve(this.#end(check, FORBIDDEN));
    check.seen = Date.now();
    if (check.refreshing !== null) return check.refreshing;
    const read = this.#refresh(check, check.lease);
    check.refreshing = read;
    void read
      .finally(() => {
        if (check.refreshing === read) check.refreshing = null;
      })
      .catch(() => undefined);
    return read;
  }

  async #refresh(check: Check, lease: PlayoutPreviewLease): Promise<LivePreviewStatus> {
    const { client, req } = check;
    if (lease.state === 'pending' || Date.now() >= check.renewAt) {
      return this.#serial(req.channel, async () => {
        if (!this.#usable(check) || this.#active.get(req.channel) !== check) return check.view;
        const reply =
          lease.state === 'pending'
            ? await client.recover(req.previewId)
            : await client.renew(lease);
        if (check.terminal) return check.view;
        if (
          lease.state === 'pending' &&
          (reply.status === 0 || reply.code === 'live.previewUnconfirmed')
        ) {
          return check.view;
        }
        const next = client.lease(reply, req.previewId, check.inputId);
        if (
          next === null ||
          next.leaseId !== lease.leaseId ||
          next.generation !== lease.generation ||
          next.coreGeneration !== lease.coreGeneration ||
          next.previewChannel !== lease.previewChannel
        ) {
          return this.#finishReply(check, reply);
        }
        return this.#adopt(check, next);
      });
    }
    const started = performance.now();
    const meter = await client.meters(lease);
    if (check.terminal || check.lease !== lease) return check.view;
    if ([401, 403, 404, 409, 410].includes(meter.status)) {
      return this.#serial(req.channel, () => Promise.resolve(this.#finishReply(check, meter)));
    }
    check.view = { ...check.view, ...client.levels(meter, lease, performance.now() - started) };
    return check.view;
  }

  stop(owner: AuthSession | null, req: LivePreviewHandle): { ok: true } {
    const check = this.#find(owner, req);
    if (check !== undefined) this.#end(check, EXPIRED);
    return { ok: true };
  }

  drop(owner: AuthSession): void {
    const check = this.#owners.get(owner);
    if (check !== undefined) this.#end(check, EXPIRED);
    this.#owners.delete(owner);
  }

  disconnect(owner: AuthSession): void {
    this.#disconnected.add(owner);
    this.drop(owner);
  }

  changed(owner: AuthSession): void {
    const check = this.#owners.get(owner);
    if (check !== undefined && !check.terminal && !this.#usable(check)) this.drop(owner);
  }

  ticket(
    owner: AuthSession | null,
    req: LivePreviewHandle & { stream: LivePreviewStream },
    issue: (grant: TicketGrant) => string,
  ): { path: string | null } {
    const check = this.#find(owner, req);
    if (check === undefined || !this.#usable(check) || check.lease?.state !== 'ready')
      return { path: null };
    const ticket = issue({
      kind: 'input-preview',
      channel: req.channel,
      previewId: req.previewId,
      stream: req.stream,
    });
    return {
      path: LIVE_PREVIEW_HTTP_PREFIX + req.previewId + '/' + req.stream + '?ticket=' + ticket,
    };
  }

  async serve(
    res: ServerResponse,
    grant: Extract<TicketGrant, { kind: 'input-preview' }>,
  ): Promise<void> {
    const check = this.#active.get(grant.channel);
    const lease = check?.lease;
    if (
      check === undefined ||
      check.req.previewId !== grant.previewId ||
      !this.#usable(check) ||
      lease?.state !== 'ready' ||
      check.feeds.has(grant.stream)
    ) {
      res.writeHead(403).end();
      return;
    }
    const abort = new AbortController();
    check.feeds.set(grant.stream, abort);
    const stopReading = (): void => abort.abort();
    res.once('close', stopReading);
    const deadline = setTimeout(stopReading, 4000);
    let failure: Fault = STALLED;
    try {
      const upstream = await check.client.open(lease, grant.stream, abort.signal);
      clearTimeout(deadline);
      if (upstream.statusCode !== 200 || !this.#usable(check)) {
        failure = previewRefusal({ status: upstream.statusCode ?? 0, body: null, code: '' });
        upstream.destroy();
        if (!res.headersSent) res.writeHead(502).end();
        return;
      }
      res.setTimeout(5000, () => res.destroy());
      upstream.setTimeout(3500, () => upstream.destroy());
      if (grant.stream === 'picture') await this.#picture(upstream, res);
      else if (/^audio\/wav(?:\s*;|$)/i.test(upstream.headers['content-type'] ?? '')) {
        await this.#audio(upstream, res);
      } else {
        res.writeHead(502).end();
      }
    } catch {
      if (!res.headersSent && !res.destroyed) res.writeHead(502).end();
    } finally {
      clearTimeout(deadline);
      res.off('close', stopReading);
      check.feeds.delete(grant.stream);
      const endedByViewer = res.destroyed || (abort.signal.aborted && res.writableEnded);
      abort.abort();
      res.end();
      if (grant.stream === 'picture' && !endedByViewer && this.#usable(check)) {
        await this.#serial(check.req.channel, async () => {
          if (!this.#usable(check)) return;
          const why = await check.client.recover(check.req.previewId);
          if (!this.#usable(check)) return;
          if ([401, 403, 404, 409, 410].includes(why.status)) this.#finishReply(check, why);
          else this.#end(check, failure);
        });
      }
    }
  }

  async #picture(upstream: IncomingMessage, res: ServerResponse): Promise<void> {
    const parser = new MjpegPartParser();
    const type = upstream.headers['content-type'] ?? '';
    parser.push(Buffer.from('HTTP/1.1 200 OK\r\nContent-Type: ' + type + '\r\n\r\n'));
    res.writeHead(200, {
      'content-type': 'application/octet-stream',
      'cache-control': 'no-store',
      'access-control-allow-origin': '*',
      'referrer-policy': 'no-referrer',
    });
    for await (const chunk of upstream as AsyncIterable<Buffer>) {
      for (const part of parser.push(chunk)) {
        if (
          part.kind !== 'frame' ||
          part.jpeg.length > LIVE_PREVIEW_MAX_JPEG_BYTES ||
          res.writableNeedDrain
        )
          continue;
        const length = Buffer.alloc(4);
        length.writeUInt32BE(part.jpeg.length);
        res.cork();
        res.write(length);
        res.write(part.jpeg);
        res.uncork();
      }
    }
  }

  async #audio(upstream: IncomingMessage, res: ServerResponse): Promise<void> {
    res.writeHead(200, {
      'content-type': 'application/octet-stream',
      'cache-control': 'no-store',
      'access-control-allow-origin': '*',
      'referrer-policy': 'no-referrer',
    });
    for await (const chunk of upstream as AsyncIterable<Buffer>) {
      if (!res.write(chunk)) {
        await once(res, 'drain', { signal: AbortSignal.timeout(3000) });
      }
    }
  }

  #find(owner: AuthSession | null, req: LivePreviewHandle): Check | undefined {
    const check = owner === null ? undefined : this.#owners.get(owner);
    return check?.req.channel === req.channel && check.req.previewId === req.previewId
      ? check
      : undefined;
  }

  #usable(check: Check): boolean {
    if (this.#closed || check.terminal) return false;
    const target = this.resolve(check.owner, check.req.channel);
    return (
      target?.bearer === check.target.bearer &&
      target.origin === check.target.origin &&
      target.code === check.target.code
    );
  }

  #finishReply(check: Check, reply: PlayoutPreviewReply): LivePreviewStatus {
    const fault = previewRefusal(reply);
    const owned =
      fault.state !== 'replaced' && fault.state !== 'expired' && reply.code !== 'preview.notOwner';
    return this.#end(check, fault, owned);
  }

  #end(check: Check, fault: Fault, stop = true): LivePreviewStatus {
    if (check.terminal) return check.view;
    check.terminal = true;
    check.view = status(check.req, check.view.sourceName, fault);
    for (const feed of check.feeds.values()) feed.abort();
    if (this.#active.get(check.req.channel) === check) this.#active.delete(check.req.channel);
    this.#recordStart(check, false, fault.state);
    const lease = check.lease;
    if (stop && lease !== null)
      void this.#serial(check.req.channel, () => this.#stopUpstream(check, lease));
    return check.view;
  }

  #recordStart(check: Check, ok: boolean, code?: string): void {
    if (check.startRecorded) return;
    check.startRecorded = true;
    this.#record(check, ok && check.replacedPrior ? 'replace' : 'start', ok, code);
  }

  async #stopUpstream(check: Check, lease: PlayoutPreviewLease): Promise<void> {
    const reply = await check.client.stop(lease);
    const ok =
      reply.status === 200 &&
      typeof reply.body === 'object' &&
      reply.body !== null &&
      'ok' in reply.body &&
      reply.body.ok === true;
    this.#record(check, 'stop', ok, ok ? undefined : previewRefusal(reply).state);
  }

  #record(
    check: Check,
    operation: LivePreviewAudit['operation'],
    ok: boolean,
    code?: string,
  ): void {
    this.audit({
      ...check.auditIdentity,
      channel: check.req.channel,
      sourceName: check.view.sourceName,
      operation,
      ok,
      ...(code === undefined ? {} : { code }),
    });
  }

  #sweep(): void {
    const now = Date.now();
    for (const check of this.#owners.values()) {
      if (check.terminal) continue;
      if (!this.#usable(check)) {
        this.#end(check, FORBIDDEN);
        continue;
      }
      const source = this.source(check.req.sourceId);
      if (source === undefined || !canCheckLiveInput(source, check.req.channel)) {
        this.#end(check, unavailable(source));
        continue;
      }
      const name = redactUrlCredentials(source.name).slice(0, 256);
      if (name !== check.view.sourceName) check.view = { ...check.view, sourceName: name };
      if (
        (check.lease === null && now - check.opened > 15_000) ||
        (check.lease !== null &&
          (now - check.seen > 8000 || now >= Date.parse(check.lease.expiresAt))) ||
        (check.lease?.state === 'pending' && now - check.opened > 15_000)
      )
        this.#end(check, EXPIRED);
    }
  }

  #serial<T>(channel: number, run: () => Promise<T>): Promise<T> {
    const work = (this.#queue.get(channel) ?? Promise.resolve()).then(run, run);
    this.#queue.set(channel, work);
    const release = (): void => {
      if (this.#queue.get(channel) === work) this.#queue.delete(channel);
    };
    void work.then(release, release);
    return work;
  }

  async dispose(): Promise<void> {
    this.#closed = true;
    clearInterval(this.#tick);
    for (const owner of this.#owners.keys()) this.drop(owner);
    while (this.#queue.size > 0) await Promise.allSettled(this.#queue.values());
  }
}
