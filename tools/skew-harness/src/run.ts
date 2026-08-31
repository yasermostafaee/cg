import * as dgram from 'node:dgram';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { CasparRuntime } from '@cg/caspar-bridge';
import { buildTemplateLiveSources } from '@cg/vcg-format';
import {
  changeEvents,
  changeSeries,
  distribution,
  firstChangeIndex,
  splitFrames,
  type ChangePoint,
  type Distribution,
} from './analyse.js';
import { connectAmcp, framePeriodMs, readChannelMode, type AmcpClient } from './amcp.js';
import {
  describeRecording,
  ensureSourceClips,
  extractProbe,
  probeFrameBytes,
  SOURCE_CLIPS,
  SWAP_CLIP,
} from './ffmpeg.js';
import {
  LOOK_BANNER,
  LOOK_COLUMN,
  PLATE_A,
  PLATE_B,
  probePlacementIssues,
  SKEW_PROBE_A,
  SKEW_PROBE_B,
} from './geometry.js';
import { buildSkewScene } from './scene.js';
import { bundleTemplateRuntime, buildTemplateHtml } from './template.js';
import { openWireTap, sentCommands, windowContainsPlay, type WireTap } from './wire-tap.js';

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export interface SkewOptions {
  readonly casparHost: string;
  readonly amcpPort: number;
  readonly channel: number;
  readonly mediaDir: string;
  /** The mode to MEASURE IN. `1080i5000` is the plant; see {@link framePeriodMs}. */
  readonly mode: string;
  readonly runs: number;
  readonly outDir: string;
  /** Quiet recording before the switch. The baseline noise sample comes from it. */
  readonly settleMs: number;
  /** Recording after the switch — must comfortably exceed any plausible `k`. */
  readonly tailMs: number;
  /** `B-155` — also run a switch that carries a PRODUCER CHANGE, reported SEPARATELY. */
  readonly withPlaySwitch: boolean;
}

/**
 * 🔴 **THE WINDOW IS SHORT ON PURPOSE, AND THE NUMBER IS MEASURED.**
 *
 * This channel has no genlock (the DeckLink consumer fails to initialise on this machine),
 * and it does NOT sustain 50 Hz indefinitely under the load of a CEF page plus an encoder.
 * Measured on this host, two file consumers running side by side:
 *
 * | ADD→REMOVE window | expected frames | recorded | agreement between the two consumers |
 * | ----------------- | --------------- | -------- | ----------------------------------- |
 * | 1504 ms           | 75              | 75, 75   | 75/75 frames byte-identical         |
 * | 3016 ms           | 151             | 118, 118 | counts equal, wall-clock short      |
 * | 6007 ms           | 300             | 179, 179 | counts equal, wall-clock short      |
 *
 * The two consumers ALWAYS agree, which is what says the shortfall is the channel slipping
 * rather than an encoder falling behind — and it is also the fan-out control this measurement
 * rests on. But a dropped channel tick between the two transitions would silently shorten
 * `k`, so the harness stays inside the regime where the recording is exactly wall-clock and
 * REFUSES any run that is not (see `cadenceDeficit`).
 */
export const DEFAULT_OPTIONS: SkewOptions = {
  casparHost: '127.0.0.1',
  amcpPort: 5250,
  channel: 1,
  mediaDir: '',
  mode: '1080i5000',
  runs: 10,
  outDir: '',
  settleMs: 800,
  tailMs: 650,
  withPlaySwitch: false,
};

/** A recorded run must reach this fraction of `window ÷ recorded frame period` to be used. */
export const CADENCE_TOLERANCE = 0.96;

/** One recorded switch, reduced to the frame indices and everything needed to audit them. */
export interface RunResult {
  readonly index: number;
  readonly file: string;
  readonly frames: number;
  readonly expectedFrames: number;
  readonly windowMs: number;
  readonly recordedPeriodMs: number;
  readonly frameRate: string;
  /** `k` in RECORDED frames — the raw, unconverted answer. `null` if the run was discarded. */
  readonly kRecorded: number | null;
  /** `k` in CHANNEL FRAMES — recorded frames scaled by the mode's fields-per-frame. */
  readonly kChannel: number | null;
  readonly kMs: number | null;
  readonly reason?: string;
  readonly probeA: ChangePoint;
  readonly probeB: ChangePoint;
  /** EVERY distinct change event per probe — `B-155`'s window legitimately has several. */
  readonly probeAEvents: readonly number[];
  readonly probeBEvents: readonly number[];
  readonly commands: readonly string[];
  readonly containedPlay: boolean;
}

export interface SkewReport {
  readonly mode: string;
  readonly channelFramePeriodMs: number;
  readonly reportedFramerate: number;
  readonly fieldsPerChannelFrame: number;
  readonly probePlacement: readonly string[];
  readonly runs: readonly RunResult[];
  readonly kChannelFrames: Distribution;
  readonly kMilliseconds: Distribution;
  readonly playSwitch?: {
    readonly runs: readonly RunResult[];
    readonly kChannelFrames: Distribution;
    readonly kMilliseconds: Distribution;
  };
}

async function freeUdpPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = dgram.createSocket('udp4');
    s.once('error', reject);
    s.bind(0, '127.0.0.1', () => {
      const port = s.address().port;
      s.close(() => resolve(port));
    });
  });
}

/** The two catalog entries, both `media` — the one producer kind that needs no signal. */
function catalog(): unknown {
  return {
    layerRange: { start: 30, end: 39 },
    sources: SOURCE_CLIPS.map((clip, i) => ({
      id: `src-${String(i + 1)}`,
      name: clip,
      producer: { kind: 'media', file: clip },
    })),
  };
}

function assignments(templateId: string): unknown {
  return {
    assignments: [
      { templateId, plateId: PLATE_A, sourceId: 'src-1' },
      { templateId, plateId: PLATE_B, sourceId: 'src-2' },
    ],
  };
}

/**
 * The ffmpeg consumer's first frames are whatever the encoder emits while it attaches. The
 * same count is dropped from BOTH probes, and `k` is a DIFFERENCE of indices, so the offset
 * cancels exactly.
 */
const LEAD_SKIP_FRAMES = 4;

/** `r_frame_rate` as a period in ms — the RECORDED cadence, which is not the channel's. */
function recordedPeriodMs(frameRate: string): number {
  const [num, den] = frameRate.split('/').map(Number);
  if (num === undefined || !Number.isFinite(num) || num <= 0) return Number.NaN;
  const fps = den === undefined || den === 0 ? num : num / den;
  return 1000 / fps;
}

async function analyseRecording(
  file: string,
  baselineFrames: number,
): Promise<{
  k: number | null;
  reason?: string;
  probeA: ChangePoint;
  probeB: ChangePoint;
  eventsA: readonly number[];
  eventsB: readonly number[];
}> {
  const [rawA, rawB] = await Promise.all([
    extractProbe(file, SKEW_PROBE_A),
    extractProbe(file, SKEW_PROBE_B),
  ]);
  const framesA = splitFrames(rawA, probeFrameBytes(SKEW_PROBE_A)).slice(LEAD_SKIP_FRAMES);
  const framesB = splitFrames(rawB, probeFrameBytes(SKEW_PROBE_B)).slice(LEAD_SKIP_FRAMES);
  const seriesA = changeSeries(framesA);
  const seriesB = changeSeries(framesB);
  const probeA = firstChangeIndex(seriesA, baselineFrames);
  const probeB = firstChangeIndex(seriesB, baselineFrames);
  const eventsA = changeEvents(seriesA, baselineFrames, probeA.threshold);
  const eventsB = changeEvents(seriesB, baselineFrames, probeB.threshold);

  if (probeA.index === null || probeB.index === null) {
    const which =
      probeA.index === null ? 'A (the picture never moved)' : 'B (the holes never moved)';
    return {
      k: null,
      reason: `probe ${which} found no transition above its noise floor`,
      probeA,
      probeB,
      eventsA,
      eventsB,
    };
  }
  return { k: probeB.index - probeA.index, probeA, probeB, eventsA, eventsB };
}

/**
 * 🔴 **THE MEASUREMENT.**
 *
 * Everything about the SWITCH goes through `CasparRuntime.setActiveLook`; everything about
 * the INSTRUMENT (the file consumer, the channel mode) goes through the harness's own AMCP
 * client. The two are kept apart deliberately — a hand-issued `MIXER FILL` + `CG UPDATE`
 * pair would be a measurement of this file rather than of the product.
 */
export async function measureSkew(options: SkewOptions): Promise<SkewReport> {
  const placement = probePlacementIssues();
  if (placement.length > 0) {
    throw new Error(
      `probe placement is unsound, refusing to measure:\n  - ${placement.join('\n  - ')}`,
    );
  }
  fs.mkdirSync(options.outDir, { recursive: true });
  await ensureSourceClips(options.mediaDir);

  const control = await connectAmcp(options.casparHost, options.amcpPort);
  const originalMode = (await readChannelMode(control, options.channel)).format;
  let tap: WireTap | null = null;
  let runtime: CasparRuntime | null = null;

  try {
    if (options.mode !== originalMode) {
      const set = await control.send(`SET ${String(options.channel)} MODE ${options.mode}`);
      if (!set.status.startsWith('202')) {
        throw new Error(`SET MODE ${options.mode} refused: ${set.status}`);
      }
      await sleep(1500);
    }
    const mode = await readChannelMode(control, options.channel);
    const channelPeriod = framePeriodMs(mode.format);
    // `1080i5000` ticks at 25 Hz but emits two fields, and the file consumer writes both —
    // so a recorded frame is a FIELD there and a whole channel frame at `1080p5000`.
    const fieldsPerChannelFrame = /^\d+i/.test(mode.format) ? 2 : 1;

    tap = await openWireTap(options.casparHost, options.amcpPort);
    const scene = buildSkewScene();
    const html = buildTemplateHtml(scene, await bundleTemplateRuntime());
    const templateId = 'skew-harness';
    const template = {
      templateId,
      templateType: 'custom',
      fields: [],
      liveSources: buildTemplateLiveSources(scene),
    };

    runtime = new CasparRuntime(
      {
        servers: { A: { host: '127.0.0.1', amcpPort: tap.port, oscPort: await freeUdpPort() } },
        strategy: 'mirror-sync',
        autoFailoverEnabled: true,
      } as never,
      {},
      {
        sweepMs: 250,
        sourceCatalog: catalog() as never,
        sourceAssignments: assignments(templateId) as never,
      } as never,
    );
    runtime.start();
    await runtime.startServing();
    runtime.templateImport(template as never, html);
    await whenServerReachable(runtime);

    const itemId = 'skew-item';
    await runtime.load(itemId, templateId, {});
    const taken = await runtime.take(itemId);
    if (!taken.accepted) throw new Error(`take was refused: ${JSON.stringify(taken)}`);
    // The page has to have fetched, parsed, built and painted before anything is timed.
    await sleep(3500);

    const shared = { runtime, control, tap, options, fieldsPerChannelFrame };
    const runs: RunResult[] = [];
    for (let i = 0; i < options.runs; i += 1) {
      runs.push(
        await recordOneSwitch({
          ...shared,
          index: i,
          label: 'skew',
          from: LOOK_BANNER,
          to: LOOK_COLUMN,
        }),
      );
    }

    const usable = (r: RunResult): boolean => r.kChannel !== null && !r.containedPlay;
    const report: SkewReport = {
      mode: mode.format,
      channelFramePeriodMs: channelPeriod,
      reportedFramerate: mode.reportedFramerate,
      fieldsPerChannelFrame,
      probePlacement: placement,
      runs,
      kChannelFrames: distribution(runs.filter(usable).map((r) => r.kChannel as number)),
      kMilliseconds: distribution(runs.filter(usable).map((r) => r.kMs as number)),
    };

    if (!options.withPlaySwitch) return report;

    /*
      🔴 `B-155` — THE SWITCH THAT CARRIES A PLAY, reached through the product's own
      configuration surface rather than by hand-typed AMCP.

      `setSourceCatalog` validates, applies and EMITS — and does not reconcile — so a
      re-point of a catalog entry LURKS until the next reconcile, and a look press is one.
      That is the very mechanism `B-155` records, alive today one level down: session BP
      froze the ASSIGNMENT (level 2) at take, but the CATALOG (level 1) is deliberately not
      frozen — "if the installation re-points that entry, the row follows" — and nothing
      reconciles at the moment of the re-point. Each run below re-points `src-1` at the
      other clip while the row is live, then presses the look; the switch resolves the new
      producer, `seatUnchanged` fails, and the replace lands INSIDE the switch window.
    */
    const playRuns: RunResult[] = [];
    const catalogPointing = (file: string): unknown => ({
      layerRange: { start: 30, end: 39 },
      sources: [
        { id: 'src-1', name: file, producer: { kind: 'media', file } },
        { id: 'src-2', name: SOURCE_CLIPS[1], producer: { kind: 'media', file: SOURCE_CLIPS[1] } },
      ],
    });
    try {
      for (let i = 0; i < Math.min(options.runs, 4); i += 1) {
        const target = i % 2 === 0 ? SWAP_CLIP : SOURCE_CLIPS[0];
        const raw = await recordOneSwitch({
          ...shared,
          index: i,
          label: 'b155',
          from: LOOK_BANNER,
          to: LOOK_COLUMN,
          beforeRecording: () => {
            const verdict = runtime?.setSourceCatalog(catalogPointing(target ?? '') as never);
            if (verdict?.ok !== true) {
              throw new Error(`the B-155 catalog re-point was refused: ${JSON.stringify(verdict)}`);
            }
            return Promise.resolve();
          },
        });
        // A b155 run is only a b155 run if the replace actually rode the switch.
        playRuns.push(
          raw.kChannel !== null && !raw.containedPlay
            ? {
                ...raw,
                kRecorded: null,
                kChannel: null,
                kMs: null,
                reason: 'the catalog re-point produced no PLAY inside the switch',
              }
            : raw,
        );
      }
    } finally {
      // Put the catalog back the way the harness found its own configuration.
      runtime.setSourceCatalog(catalog() as never);
    }
    const playUsable = playRuns.filter((r) => r.kChannel !== null && r.containedPlay);
    return {
      ...report,
      playSwitch: {
        runs: playRuns,
        kChannelFrames: distribution(playUsable.map((r) => r.kChannel as number)),
        kMilliseconds: distribution(playUsable.map((r) => r.kMs as number)),
      },
    };
  } finally {
    await runtime?.stop();
    await tap?.close();
    try {
      await control.send(`CLEAR ${String(options.channel)}`);
      if (originalMode.length > 0 && originalMode !== 'unknown') {
        await control.send(`SET ${String(options.channel)} MODE ${originalMode}`);
      }
    } finally {
      control.close();
    }
  }
}

/**
 * Wait until the AMCP session is REACHABLE.
 *
 * ── 🔴 WHY NOT `whenServerHealthy`, AND WHY NOT THE MODE READ EITHER ─────────
 *
 * Two separate things rule out the obvious waits, and the second one is `B-189`:
 *
 * - **`whenServerHealthy` requires `healthy`.** This CasparCG declares no `<osc>` block and
 *   the default OSC port is held by another process on this host, so the session settles at
 *   `degraded` — AMCP up, OSC silent — which is REACHABLE (`B-100`) but never `healthy`.
 * - **`awaitChannelModeRead`, the bridge's own quiescence helper, could not complete against
 *   a real CasparCG when this harness was written** — `B-189`, found on this harness's own
 *   wire tap and since FIXED (`SKEW-HOLD-01`: the gate accepts `ok-line`, the parser reads
 *   `<format>`). The wait below is KEPT on reachability anyway: the degraded-not-healthy
 *   reason above stands on its own, and the harness should boot even against a build from
 *   before the fix.
 *
 * So the wait uses the SAME two states `isLiveState` admits, which is what the bridge's own
 * `#noServerReachable` gate reads — the predicate the take actually consults.
 */
async function whenServerReachable(runtime: CasparRuntime, timeoutMs = 30_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const state = runtime.health().primary.state;
    if (state === 'healthy' || state === 'degraded') return state;
    if (Date.now() >= deadline) {
      throw new Error(`CasparCG never became reachable (last state: ${state})`);
    }
    await sleep(50);
  }
}

interface OneSwitch {
  readonly index: number;
  readonly label: string;
  readonly from: string;
  readonly to: string;
  readonly runtime: CasparRuntime;
  readonly control: AmcpClient;
  readonly tap: WireTap;
  readonly options: SkewOptions;
  readonly fieldsPerChannelFrame: number;
  /**
   * Runs AFTER the row is reset to the outgoing look and settled, BEFORE the recording
   * opens. `B-155`'s catalog re-point goes here: planted any earlier, the reset switch
   * would apply it and the measured switch would be clean again.
   */
  readonly beforeRecording?: () => Promise<void>;
}

async function recordOneSwitch(spec: OneSwitch): Promise<RunResult> {
  const { runtime, control, tap, options } = spec;
  const itemId = 'skew-item';

  // Start from the OUTGOING look, settled, every time — a run that began mid-transition
  // would carry the previous switch into its own baseline.
  if (runtime.activeLookId(itemId) !== spec.from) {
    await runtime.setActiveLook(itemId, spec.from);
    await sleep(1500);
  }
  if (spec.beforeRecording !== undefined) {
    await spec.beforeRecording();
    await sleep(250);
  }

  const name = `${spec.label}-${String(spec.index).padStart(2, '0')}.mkv`;
  const file = path.join(options.mediaDir, name);
  fs.rmSync(file, { force: true });

  const openedAt = Date.now();
  await control.send(
    `ADD ${String(options.channel)} FILE "${name}" -c:v libx264 -crf 18 -preset ultrafast -pix_fmt yuv420p`,
  );
  await sleep(options.settleMs);

  const mark = tap.lines().length;
  const switched = await runtime.setActiveLook(itemId, spec.to);
  await sleep(options.tailMs);
  await control.send(`REMOVE ${String(options.channel)} FILE "${name}"`);
  const windowMs = Date.now() - openedAt;
  // The consumer flushes and closes asynchronously; read only once the file stops growing.
  await settleFile(file);

  const window = tap.since(mark);
  const commands = sentCommands(window);
  const containedPlay = windowContainsPlay(window);
  const facts = await describeRecording(file);
  const period = recordedPeriodMs(facts.frameRate);
  const expectedFrames = Math.round(windowMs / period);
  const kept = path.join(options.outDir, name);
  fs.copyFileSync(file, kept);
  fs.rmSync(file, { force: true });

  const base = {
    index: spec.index,
    file: kept,
    frames: facts.frames,
    expectedFrames,
    windowMs,
    recordedPeriodMs: period,
    frameRate: facts.frameRate,
    commands,
    containedPlay,
  };
  const discard = (reason: string): RunResult => ({
    ...base,
    kRecorded: null,
    kChannel: null,
    kMs: null,
    reason,
    probeA: emptyPoint(),
    probeB: emptyPoint(),
    probeAEvents: [],
    probeBEvents: [],
  });

  if (!switched.ok) return discard(`the switch was refused: ${JSON.stringify(switched)}`);
  // 🔴 A dropped channel tick inside the window would silently shorten `k`. A run that did
  // not sustain cadence is DISCARDED, never rounded.
  if (facts.frames < expectedFrames * CADENCE_TOLERANCE) {
    return discard(
      `the channel did not sustain cadence: ${String(facts.frames)} frames recorded against ` +
        `${String(expectedFrames)} expected over ${String(windowMs)} ms`,
    );
  }

  // 60 % of the settle window, so the noise sample provably ends before the switch even if
  // the consumer attached a little late.
  const baselineFrames = Math.max(
    4,
    Math.floor((options.settleMs * 0.6) / period) - LEAD_SKIP_FRAMES,
  );
  const analysis = await analyseRecording(kept, baselineFrames);
  if (analysis.k === null) return discard(analysis.reason ?? 'no transition found');

  return {
    ...base,
    kRecorded: analysis.k,
    kChannel: analysis.k / spec.fieldsPerChannelFrame,
    kMs: analysis.k * period,
    probeA: analysis.probeA,
    probeB: analysis.probeB,
    probeAEvents: analysis.eventsA,
    probeBEvents: analysis.eventsB,
  };
}

function emptyPoint(): ChangePoint {
  return { index: null, threshold: 0, noiseFloor: 0, magnitude: 0, series: [] };
}

async function settleFile(file: string, stepMs = 120): Promise<void> {
  let last = -1;
  for (let i = 0; i < 60; i += 1) {
    const size = fs.existsSync(file) ? fs.statSync(file).size : -1;
    if (size > 0 && size === last) return;
    last = size;
    await sleep(stepMs);
  }
}
