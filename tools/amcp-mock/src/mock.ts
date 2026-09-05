import * as fs from 'node:fs';
import { AmcpServer, type TraceEntry } from './server.js';
import { OscEmitter } from './osc-emitter.js';
import { LayerRegistry } from './layer-state.js';
import { defaultHandlers } from './handlers.js';
import { renderedRect } from './mixer-rect.js';
import type {
  AmcpHandler,
  CgAddResolution,
  CgDataResult,
  HandlerContext,
  LayerSlot,
  LayerState,
  MixerRect,
  MockHandle,
  MockOptions,
  OscArgValue,
} from './types.js';

/**
 * Spin up an AMCP mock listening on TCP + UDP. The returned handle exposes
 * test hooks for injection (custom handlers, forced disconnect) and
 * observation (layer state, OSC emission count). The mock binds to
 * `127.0.0.1` by default; passing `host: '0.0.0.0'` is supported but only
 * makes sense for manual dev sessions.
 */
export async function createMock(opts: MockOptions = {}): Promise<MockHandle> {
  const host = opts.host ?? '127.0.0.1';
  const amcpPort = opts.amcpPort ?? 5250;
  const oscPort = opts.oscPort ?? 6250;
  const oscHost = opts.oscHost ?? '127.0.0.1';
  const oscHz = opts.disableOsc === true ? 0 : (opts.oscHz ?? 10);
  const channelCount = opts.channels ?? 1;

  const registry = new LayerRegistry();
  const emitter = new OscEmitter(registry, channelCount, oscHz);
  await emitter.start(host, oscHost, oscPort);

  const handlers = defaultHandlers();
  const traceStream = opts.tracePath ? fs.createWriteStream(opts.tracePath, { flags: 'a' }) : null;

  // B-038 — last CG ADD / CG UPDATE payload per slot, so tests can assert the
  // template arg was a real URL and the data was real (non-empty) field JSON.
  // B-041 — the recorded value is the full two-layer decode verdict.
  // Reconnect-reconciliation — each add also carries its async fetch verdict
  // (`resolution`), settled by `completeCgAdd`; waiters let tests await it.
  const slotKey = (slot: LayerSlot): string => `${String(slot.channel)}-${String(slot.layer)}`;
  const cgAdds = new Map<
    string,
    { template: string; resolution: CgAddResolution } & CgDataResult
  >();
  const cgUpdates = new Map<string, CgDataResult>();
  const addWaiters = new Map<string, Set<() => void>>();
  // Ownership token per slot's LATEST add — a stale fetch completion (an older
  // add, possibly of the SAME URL) must never settle the newer add's verdict.
  // pageTokens tracks which add OWNS the layer's current page (only URL adds
  // create pages; a bare-id 404 add steals the record token but not the page).
  let nextAddToken = 0;
  const addTokens = new Map<string, number>();
  const pageTokens = new Map<string, number>();
  // `B-198` / `B-221` — the deferred mixer queue, ONE per channel and owned by the mock
  // (the server), not by a connection: CasparCG's `deferred_transforms_` is a process-wide
  // static keyed by channel index, so a change staged on one socket is applied by a commit
  // from any socket and survives the socket that staged it. Per mock instance rather than
  // per module, so one test's orphan cannot land in the next test's channel.
  const deferredMixer = new Map<number, (() => void)[]>();

  const ctx: HandlerContext = {
    channelCount,
    getLayer(slot: LayerSlot): LayerState {
      return registry.get(slot);
    },
    setLayer(slot: LayerSlot, patch: Partial<Omit<LayerState, 'slot'>>): void {
      registry.patch(slot, patch);
      // Emit immediately so an integration test can observe state changes
      // without having to wait for the next tick. The tick still fires
      // independently to model CasparCG's framerate heartbeat.
      emitter.sendMessage(
        `/channel/${String(slot.channel)}/stage/layer/${String(slot.layer)}/foreground/producer`,
        [registry.get(slot).producer],
      );
    },
    recordCgAdd(slot: LayerSlot, template: string, result: CgDataResult): number {
      const key = slotKey(slot);
      const token = ++nextAddToken;
      addTokens.set(key, token);
      cgAdds.set(key, { template, resolution: 'pending', ...result });
      return token;
    },
    recordCgUpdate(slot: LayerSlot, result: CgDataResult): void {
      cgUpdates.set(slotKey(slot), result);
    },
    loadCgPage(slot: LayerSlot, token: number, template: string, playOnLoad: boolean): void {
      pageTokens.set(slotKey(slot), token);
      ctx.setLayer(slot, {
        producer: 'html',
        filePath: template,
        paused: false,
        onAir: playOnLoad,
        pageResolution: 'pending',
      });
    },
    completeCgAdd(slot: LayerSlot, token: number, resolved: boolean): void {
      const key = slotKey(slot);
      // The RECORDED verdict settles only for the slot's LATEST add — a stale
      // completion must never settle a newer add's verdict.
      if (addTokens.get(key) === token) {
        const rec = cgAdds.get(key);
        if (rec !== undefined && rec.resolution === 'pending') {
          cgAdds.set(key, { ...rec, resolution: resolved ? 'resolved' : 'failed' });
          const waiters = addWaiters.get(key);
          if (waiters !== undefined) {
            addWaiters.delete(key);
            for (const wake of waiters) wake();
          }
        }
      }
      // The LAYER settles only via the page's OWNING add (a bare-id 404 add
      // steals the record token but never replaces the page; a CLEAR resets
      // pageResolution so a stale owner can't touch an emptied layer). A
      // failed page produces empty frames (master's OnLoadError) — off air,
      // the queued play() never flushes. `producer` stays 'html' (real
      // CasparCG keeps the producer; it just renders nothing) — no OSC
      // transition.
      const layer = registry.peek(slot);
      if (
        pageTokens.get(key) === token &&
        layer !== undefined &&
        layer.producer === 'html' &&
        layer.pageResolution === 'pending'
      ) {
        registry.patch(slot, {
          pageResolution: resolved ? 'resolved' : 'failed',
          ...(resolved ? {} : { onAir: false }),
        });
      }
    },
    stageMixer(channel: number, apply: () => void): void {
      const queue = deferredMixer.get(channel);
      if (queue === undefined) deferredMixer.set(channel, [apply]);
      else queue.push(apply);
    },
    commitMixer(channel: number): number {
      const queue = deferredMixer.get(channel) ?? [];
      deferredMixer.delete(channel);
      // In arrival order — the last change staged for a layer is the one that stands,
      // which is what lets a fresh batch override a stale orphan on the layers it touches
      // and NOT on the layers it does not.
      for (const apply of queue) apply();
      return queue.length;
    },
  };

  const onTrace = traceStream
    ? (entry: TraceEntry) => {
        traceStream.write(`${JSON.stringify({ ts: new Date().toISOString(), ...entry })}\n`);
      }
    : undefined;

  const server = new AmcpServer(handlers, ctx, onTrace);
  const boundAmcp = await server.start(host, amcpPort);

  return {
    amcpPort: boundAmcp,
    oscPort: emitter.port,
    host,
    emitOsc(address: string, args: readonly OscArgValue[]): void {
      emitter.sendMessage(address, args);
    },
    addOscObserver(observerHost: string, observerPort: number): void {
      emitter.addObserver(observerHost, observerPort);
    },
    closeAllAmcpConnections(): void {
      server.closeAll();
    },
    setHandler(verb: string, handler: AmcpHandler): void {
      handlers.set(verb.toUpperCase(), handler);
    },
    layerState(slot: LayerSlot): LayerState | undefined {
      return registry.peek(slot);
    },
    layerRenderedRect(slot: LayerSlot): MixerRect | null | undefined {
      const layer = registry.peek(slot);
      if (layer === undefined) return undefined;
      return renderedRect(layer.fill, layer.clip);
    },
    setLayerVolume(slot: LayerSlot, volume: number): void {
      registry.patch(slot, { volume });
    },
    stagedMixerCount(channel: number): number {
      return deferredMixer.get(channel)?.length ?? 0;
    },
    lastCgAdd(
      slot: LayerSlot,
    ): ({ template: string; resolution: CgAddResolution } & CgDataResult) | undefined {
      return cgAdds.get(slotKey(slot));
    },
    lastCgUpdate(slot: LayerSlot): CgDataResult | undefined {
      return cgUpdates.get(slotKey(slot));
    },
    traceFlush(): Promise<void> {
      if (traceStream === null) return Promise.resolve();
      // A write callback fires only after every previously-queued chunk hit
      // the file (fs.WriteStream preserves order) — a true read barrier. The
      // newline payload is invisible to readers (blank lines are filtered).
      return new Promise((resolve, reject) => {
        traceStream.write('\n', (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    },
    waitForCgAddResolution(slot: LayerSlot, timeoutMs = 2500): Promise<'resolved' | 'failed'> {
      const key = slotKey(slot);
      return new Promise((resolve, reject) => {
        const settled = (): boolean => {
          const rec = cgAdds.get(key);
          if (rec !== undefined && rec.resolution !== 'pending') {
            resolve(rec.resolution);
            return true;
          }
          return false;
        };
        if (settled()) return;
        const timer = setTimeout(() => {
          addWaiters.get(key)?.delete(wake);
          reject(
            new Error(`CG ADD resolution for ${key} did not settle within ${String(timeoutMs)}ms`),
          );
        }, timeoutMs);
        const wake = (): void => {
          clearTimeout(timer);
          void settled();
        };
        let set = addWaiters.get(key);
        if (set === undefined) {
          set = new Set();
          addWaiters.set(key, set);
        }
        set.add(wake);
      });
    },
    get amcpClientCount(): number {
      return server.clientCount;
    },
    async stop(): Promise<void> {
      await server.stop();
      await emitter.stop();
      if (traceStream) {
        await new Promise<void>((resolve) => {
          traceStream.end(() => {
            resolve();
          });
        });
      }
    },
  };
}
