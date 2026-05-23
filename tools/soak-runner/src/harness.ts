import { createMock, type MockHandle } from '@cg/amcp-mock';
import {
  AmcpTransport,
  CommandQueue,
  LayerManager,
  OscTransport,
  Reconciler,
  RedundancyAdapter,
  type RedundancyStrategy,
  type ServerSession,
} from '@cg/caspar-client';
import { EventEmitter } from 'node:events';

/**
 * Soak harness. Boots two `@cg/amcp-mock` instances + a thin runtime
 * composition (transports + queues + adapter + Reconciler) in-process,
 * then runs a scripted scenario for a configurable duration. Memory and
 * queue depth are sampled at a fixed cadence.
 *
 * This is **not** the full Electron runtime — for that the soak would
 * need to spawn `apps/runtime` and drive it via IPC. The in-process
 * composition is the load-bearing thing we care about leaking; the
 * Electron shell's leaks are validated separately in M9.
 */

export interface SoakOptions {
  /** Total soak duration in ms. CI default: 30 s. Production: 30 m. */
  durationMs: number;
  /** Cadence at which the scenario fires (one load/take/update/out cycle). */
  cycleMs: number;
  /** Memory sample cadence. */
  sampleMs: number;
  /** Maximum allowed heap growth in MB over the run. Phase 5 §10 / Phase 8 §8 = 50. */
  leakBudgetMb: number;
  /** Strategy to use. Default `'mirror-sync'`. */
  strategy?: RedundancyStrategy;
}

export interface MemorySample {
  /** Wall-clock ms since soak start. */
  atMs: number;
  heapUsedMb: number;
  rssMb: number;
  queueDepth: number;
}

export interface SoakReport {
  durationMs: number;
  cycles: number;
  samples: readonly MemorySample[];
  heapStartMb: number;
  heapEndMb: number;
  heapDeltaMb: number;
  rssStartMb: number;
  rssEndMb: number;
  rssDeltaMb: number;
  leakBudgetMb: number;
  /** True if heap growth stayed under the budget. */
  passed: boolean;
  /** Any unexpected errors that bubbled up during cycles. */
  errors: readonly string[];
}

interface Stack {
  mockA: MockHandle;
  mockB: MockHandle;
  sessions: { A: ServerSession; B: ServerSession };
  adapter: RedundancyAdapter;
  reconciler: Reconciler;
  layerManager: LayerManager;
  /** Cleanup. */
  dispose(): Promise<void>;
}

async function buildStack(strategy: RedundancyStrategy): Promise<Stack> {
  const mockA = await createMock({ amcpPort: 0, oscPort: 0, disableOsc: true });
  const mockB = await createMock({ amcpPort: 0, oscPort: 0, disableOsc: true });

  const transportA = new AmcpTransport();
  await transportA.connect(mockA.host, mockA.amcpPort);
  const transportB = new AmcpTransport();
  await transportB.connect(mockB.host, mockB.amcpPort);
  const queueA = new CommandQueue(transportA);
  const queueB = new CommandQueue(transportB);

  const sessionA = makeFakeSession('A', queueA);
  const sessionB = makeFakeSession('B', queueB);
  const adapter = new RedundancyAdapter({
    strategy,
    sessions: { A: sessionA, B: sessionB },
    autoFailoverEnabled: false,
  });

  return {
    mockA,
    mockB,
    sessions: { A: sessionA, B: sessionB },
    adapter,
    reconciler: new Reconciler(),
    layerManager: new LayerManager(),
    async dispose() {
      queueA.dispose();
      queueB.dispose();
      transportA.destroy();
      transportB.destroy();
      await Promise.all([mockA.stop(), mockB.stop()]);
    },
  };
}

function makeFakeSession(label: 'A' | 'B', queue: CommandQueue): ServerSession {
  const e = new EventEmitter() as unknown as ServerSession;
  Object.defineProperty(e, 'name', { value: label });
  Object.defineProperty(e, 'queue', { value: queue });
  Object.defineProperty(e, 'state', { get: () => 'healthy', configurable: true });
  Object.defineProperty(e, 'osc', { value: new OscTransport() });
  return e;
}

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * One pass of the scenario: PLAY → CG INVOKE update → CG STOP → CLEAR.
 * Runs against the current primary; the adapter handles mirroring.
 */
async function runOneCycle(stack: Stack, cycleSeq: number): Promise<void> {
  const slot = stack.layerManager.allocate('lower-third', 1);
  try {
    await stack.adapter.send(`PLAY ${String(slot.channel)}-${String(slot.layer)} "u" HTML`);
    await stack.adapter.send(
      `CG ${String(slot.channel)}-${String(slot.layer)} INVOKE 1 "update" "{\\"i\\":${String(cycleSeq)}}"`,
    );
    await stack.adapter.send(`CG ${String(slot.channel)}-${String(slot.layer)} STOP 1`);
    await stack.adapter.send(`CLEAR ${String(slot.channel)}-${String(slot.layer)}`);
  } finally {
    stack.layerManager.deallocate(slot);
  }
}

/**
 * Run the soak. Resolves with the report once `durationMs` elapses.
 * The harness disposes of all sockets + mocks before resolving.
 */
export async function runSoak(options: SoakOptions): Promise<SoakReport> {
  const stack = await buildStack(options.strategy ?? 'mirror-sync');
  const errors: string[] = [];
  const samples: MemorySample[] = [];
  const start = Date.now();

  const sample = (): void => {
    const mem = process.memoryUsage();
    samples.push({
      atMs: Date.now() - start,
      heapUsedMb: mem.heapUsed / (1024 * 1024),
      rssMb: mem.rss / (1024 * 1024),
      queueDepth: stack.sessions.A.queue.depth + stack.sessions.B.queue.depth,
    });
  };

  sample();
  const first = samples[0] ?? { heapUsedMb: 0, rssMb: 0, atMs: 0, queueDepth: 0 };
  const heapStartMb = first.heapUsedMb;
  const rssStartMb = first.rssMb;

  const samplerHandle = setInterval(sample, options.sampleMs);
  samplerHandle.unref?.();

  let cycles = 0;
  const deadline = start + options.durationMs;
  try {
    while (Date.now() < deadline) {
      try {
        await runOneCycle(stack, cycles);
        cycles++;
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err));
      }
      await delay(Math.max(0, options.cycleMs));
    }
  } finally {
    clearInterval(samplerHandle);
    sample();
    await stack.dispose();
  }

  const last = samples[samples.length - 1] ?? first;
  const heapEndMb = last.heapUsedMb;
  const rssEndMb = last.rssMb;
  const heapDeltaMb = heapEndMb - heapStartMb;
  const rssDeltaMb = rssEndMb - rssStartMb;

  return {
    durationMs: options.durationMs,
    cycles,
    samples,
    heapStartMb,
    heapEndMb,
    heapDeltaMb,
    rssStartMb,
    rssEndMb,
    rssDeltaMb,
    leakBudgetMb: options.leakBudgetMb,
    passed: heapDeltaMb <= options.leakBudgetMb,
    errors,
  };
}
