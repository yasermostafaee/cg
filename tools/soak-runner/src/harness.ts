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
 * Soak harness. Boots `@cg/amcp-mock` instances + a thin runtime
 * composition (transports + queues + adapter + Reconciler) in-process,
 * then runs a scripted scenario for a configurable duration. Memory and
 * queue depth are sampled at a fixed cadence.
 *
 * B-046 — the harness models the real dead-vs-live backup distinction
 * (the B-041 lesson: model reality, not our assumption) via `backup`:
 *
 *   'live'      — two live mocks, both sessions healthy (the original soak)
 *   'absent'    — declared single-server: NO backup session at all
 *   'dead'      — backup declared but down: its session reports
 *                 `disconnected` and its transport rejects every send,
 *                 exactly like the phantom `127.0.0.1:5251` default did
 *   'diverging' — backup live but genuinely diverging (PLAY acks 404)
 *
 * This is **not** the full runtime app — for that the soak would need to
 * spawn `apps/runtime` and drive it via IPC. The in-process composition
 * is the load-bearing thing we care about leaking.
 */

export type SoakBackupMode = 'live' | 'absent' | 'dead' | 'diverging';

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
  /** Backup fidelity mode (B-046). Default `'live'`. */
  backup?: SoakBackupMode;
  /**
   * M9.4: schedule a manual failover at this many ms after soak start.
   * Used to validate the Phase 8 §12 exit criterion ("24h scenario
   * includes one scheduled failover; no state divergence at hour 24").
   * Multiple values fire multiple failovers; values past `durationMs`
   * are ignored.
   */
  scheduledFailoversAtMs?: readonly number[];
}

/** Redundancy-event counters observed over the soak (B-046 churn proof). */
export interface SoakEventCounts {
  mirrorDivergence: number;
  splitBrainPersistent: number;
  correctiveResend: number;
  health: number;
}

export interface MemorySample {
  /** Wall-clock ms since soak start. */
  atMs: number;
  heapUsedMb: number;
  rssMb: number;
  queueDepth: number;
}

export interface FailoverRecord {
  /** Wall-clock ms since soak start at which the failover fired. */
  atMs: number;
  /** Server label the soak was on *before* the failover. */
  from: 'A' | 'B';
  /** Server label the soak is on *after* the failover. */
  to: 'A' | 'B';
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
  /** Failovers that fired during the soak (M9.4). */
  failovers: readonly FailoverRecord[];
  /** Redundancy-event counters (B-046: quiet modes must stay at zero). */
  events: SoakEventCounts;
  /** Journal entry count at soak end (B-046: bounded in every mode). */
  journalEndSize: number;
}

interface Stack {
  mockA: MockHandle;
  mockB: MockHandle | null;
  sessions: { A: ServerSession; B?: ServerSession };
  adapter: RedundancyAdapter;
  reconciler: Reconciler;
  layerManager: LayerManager;
  /** Cleanup. */
  dispose(): Promise<void>;
}

async function buildStack(strategy: RedundancyStrategy, backup: SoakBackupMode): Promise<Stack> {
  const mockA = await createMock({ amcpPort: 0, oscPort: 0, disableOsc: true });

  const transportA = new AmcpTransport();
  await transportA.connect(mockA.host, mockA.amcpPort);
  const queueA = new CommandQueue(transportA);
  const sessionA = makeFakeSession('A', queueA);

  let mockB: MockHandle | null = null;
  let transportB: AmcpTransport | null = null;
  let queueB: CommandQueue | null = null;
  let sessionB: ServerSession | undefined;

  if (backup === 'live' || backup === 'diverging') {
    mockB = await createMock({ amcpPort: 0, oscPort: 0, disableOsc: true });
    if (backup === 'diverging') {
      // A LIVE backup whose PLAY genuinely diverges from the primary's ack —
      // the case that MUST still escalate to split-brain + corrective resend.
      mockB.setHandler('PLAY', () => ({ kind: 'err', code: 404, verb: 'PLAY' }));
    }
    transportB = new AmcpTransport();
    await transportB.connect(mockB.host, mockB.amcpPort);
    queueB = new CommandQueue(transportB);
    sessionB = makeFakeSession('B', queueB, 'healthy');
  } else if (backup === 'dead') {
    // Declared but DOWN: an unconnected transport (every enqueue rejects,
    // like the phantom 127.0.0.1:5251 default) and a session that KNOWS it —
    // the real dead-backup shape, not a healthy-looking fake.
    transportB = new AmcpTransport();
    queueB = new CommandQueue(transportB);
    sessionB = makeFakeSession('B', queueB, 'disconnected');
  }
  // 'absent': declared single-server — no B session at all.

  const adapter = new RedundancyAdapter({
    strategy,
    sessions: sessionB !== undefined ? { A: sessionA, B: sessionB } : { A: sessionA },
    autoFailoverEnabled: false,
  });

  return {
    mockA,
    mockB,
    sessions: sessionB !== undefined ? { A: sessionA, B: sessionB } : { A: sessionA },
    adapter,
    reconciler: new Reconciler(),
    layerManager: new LayerManager(),
    async dispose() {
      queueA.dispose();
      queueB?.dispose();
      transportA.destroy();
      transportB?.destroy();
      await Promise.all([mockA.stop(), mockB?.stop() ?? Promise.resolve()]);
    },
  };
}

function makeFakeSession(
  label: 'A' | 'B',
  queue: CommandQueue,
  initialState: 'healthy' | 'disconnected' = 'healthy',
): ServerSession {
  // Mutable state + real `state-change` emission so scenarios can model a
  // session going down/up mid-soak (B-046 fidelity — the previous fake was
  // hardcoded 'healthy' and could not represent a dead backup at all).
  const holder = { state: initialState as string };
  const e = new EventEmitter() as unknown as ServerSession;
  Object.defineProperty(e, 'name', { value: label });
  Object.defineProperty(e, 'queue', { value: queue });
  Object.defineProperty(e, 'state', { get: () => holder.state, configurable: true });
  Object.defineProperty(e, '__stateHolder', { value: holder });
  Object.defineProperty(e, 'osc', { value: new OscTransport() });
  return e;
}

/** Mutate a fake session's state, emitting the real `state-change` shape. */
export function setFakeSessionState(
  session: ServerSession,
  to: 'healthy' | 'degraded' | 'disconnected' | 'connecting',
): void {
  const holder = (session as unknown as { __stateHolder: { state: string } }).__stateHolder;
  const from = holder.state;
  holder.state = to;
  (session as unknown as EventEmitter).emit('state-change', { from, to, reason: 'soak' });
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
  const stack = await buildStack(options.strategy ?? 'mirror-sync', options.backup ?? 'live');
  const errors: string[] = [];
  const samples: MemorySample[] = [];
  const failovers: FailoverRecord[] = [];
  // B-046 — count every redundancy event so quiet modes are assertable.
  const events: SoakEventCounts = {
    mirrorDivergence: 0,
    splitBrainPersistent: 0,
    correctiveResend: 0,
    health: 0,
  };
  stack.adapter.on('mirror-divergence', () => {
    events.mirrorDivergence += 1;
  });
  stack.adapter.on('split-brain-persistent', () => {
    events.splitBrainPersistent += 1;
  });
  stack.adapter.on('corrective-resend', () => {
    events.correctiveResend += 1;
  });
  stack.adapter.on('health', () => {
    events.health += 1;
  });
  const start = Date.now();

  // Schedule failovers. Each fires once at its target offset; the
  // timer is unref'd so the event loop doesn't keep the process alive
  // past the soak's own deadline. Failovers past `durationMs` are
  // dropped during scheduling.
  const failoverTimers: NodeJS.Timeout[] = [];
  for (const atMs of options.scheduledFailoversAtMs ?? []) {
    if (atMs >= options.durationMs) continue;
    const timer = setTimeout(() => {
      const from = stack.adapter.currentPrimary;
      stack.adapter
        .failover('manual')
        .then(() => {
          failovers.push({ atMs: Date.now() - start, from, to: stack.adapter.currentPrimary });
        })
        .catch((err: unknown) => {
          errors.push(
            `failover@${String(atMs)}: ${err instanceof Error ? err.message : String(err)}`,
          );
        });
    }, atMs);
    timer.unref?.();
    failoverTimers.push(timer);
  }

  const sample = (): void => {
    const mem = process.memoryUsage();
    samples.push({
      atMs: Date.now() - start,
      heapUsedMb: mem.heapUsed / (1024 * 1024),
      rssMb: mem.rss / (1024 * 1024),
      queueDepth: stack.sessions.A.queue.depth + (stack.sessions.B?.queue.depth ?? 0),
    });
  };

  sample();
  const first = samples[0] ?? { heapUsedMb: 0, rssMb: 0, atMs: 0, queueDepth: 0 };
  const heapStartMb = first.heapUsedMb;
  const rssStartMb = first.rssMb;

  const samplerHandle = setInterval(sample, options.sampleMs);
  samplerHandle.unref?.();

  let cycles = 0;
  let journalEndSize = 0;
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
    for (const t of failoverTimers) clearTimeout(t);
    clearInterval(samplerHandle);
    sample();
    journalEndSize = stack.adapter.journal.all().length;
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
    passed: heapDeltaMb <= options.leakBudgetMb && errors.length === 0,
    errors,
    failovers,
    events,
    journalEndSize,
  };
}
