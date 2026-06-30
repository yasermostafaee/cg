import * as fs from 'node:fs';
import { AmcpServer, type TraceEntry } from './server.js';
import { OscEmitter } from './osc-emitter.js';
import { LayerRegistry } from './layer-state.js';
import { defaultHandlers } from './handlers.js';
import type {
  AmcpHandler,
  HandlerContext,
  LayerSlot,
  LayerState,
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
  const slotKey = (slot: LayerSlot): string => `${String(slot.channel)}-${String(slot.layer)}`;
  const cgAdds = new Map<string, { template: string; data: string }>();
  const cgUpdates = new Map<string, { data: string }>();

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
    recordCgAdd(slot: LayerSlot, template: string, data: string): void {
      cgAdds.set(slotKey(slot), { template, data });
    },
    recordCgUpdate(slot: LayerSlot, data: string): void {
      cgUpdates.set(slotKey(slot), { data });
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
    lastCgAdd(slot: LayerSlot): { template: string; data: string } | undefined {
      return cgAdds.get(slotKey(slot));
    },
    lastCgUpdate(slot: LayerSlot): { data: string } | undefined {
      return cgUpdates.get(slotKey(slot));
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
