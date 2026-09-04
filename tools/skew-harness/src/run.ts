import * as dgram from 'node:dgram';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { CasparRuntime } from '@cg/caspar-bridge';
import { fixedBankSlots, type DeclaredConsumer, type RunningConsumer } from '@cg/shared-ipc';
import { buildTemplateLiveSources } from '@cg/vcg-format';
import {
  changeEvents,
  changeSeries,
  distribution,
  firstChangeIndex,
  meanAbsDiff,
  separationOk,
  splitFrames,
  type ChangePoint,
  type Distribution,
} from './analyse.js';
import { connectAmcp, framePeriodMs, readChannelMode, type AmcpClient } from './amcp.js';
import { classifyWindow, directionOf, excludeMask, type ArtefactSummary } from './artefact.js';
import {
  borrowNotice,
  consumerReport,
  consumerRestorePlan,
  declaredConsumersOf,
  describeConsumerReport,
  runningConsumersOf,
  type ConsumerReport,
} from './consumers.js';
import {
  describeRecording,
  dumpFramePng,
  ensureBackgroundClip,
  ensureSourceClips,
  extractProbe,
  extractScaledFrames,
  probeFrameBytes,
  SOURCE_CLIPS,
  SWAP_CLIP,
} from './ffmpeg.js';
import {
  BACKGROUND_MOTION_PATCH,
  BANNER_COLUMN_FIXTURE,
  PLATE_A,
  PLATE_B,
  PLATE_C,
  probePlacementIssues,
  measuredPair,
  probeBFor,
  SKEW_FIXTURES,
  SKEW_SCENE,
  type SkewFixture,
} from './geometry.js';
import { buildSkewScene, LOOK_EMPTY } from './scene.js';
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
  /**
   * `SKEW-RESIDUE-01` — how many looks the SCENE carries. Only the first two are ever
   * entered; the rest are filler that grows the page and nothing else (`fillerLookRects`).
   */
  readonly looks: number;
  /** `flat` (a painted rect) or `video` (a full-frame clip, decoding every frame). */
  readonly background: 'flat' | 'video';
  /** Classify what is on screen during each run's mismatch window (`artefact.ts`). */
  readonly classify: boolean;
  /**
   * `SKEW-RESIDUE-01` — switch into {@link LOOK_EMPTY} instead of the column look, to capture
   * what an EMPTY INTERSECTION would look like. Every k is expected to be DISCARDED here (the
   * holes never move into probe B by construction) — the deliverable is the frames.
   */
  readonly emptyLook: boolean;
  /**
   * `SKEW-INTERSECT-01` — WHICH measured pair. `banner-column` is every earlier measurement's
   * fixture; `ghab` is the owner's own full-frame-vs-boxes shape, which is the one that can
   * discriminate an intersection mask from an entering-look mask.
   */
  readonly fixture: string;
  /** Switch the OTHER way — `to → from`. Both directions matter and they are not symmetric. */
  readonly reverse: boolean;
  /**
   * 🔴 `single-clock-look-switch` — **WHICH pair of the fixture's looks this campaign measures,
   * and what the row goes through FIRST.**
   *
   * A fixture may declare three looks (`ghab3` does), and the four transitions the acceptance
   * asks for are four different pairs of them. Absent ⇒ the fixture's first two, which is every
   * earlier measurement's default and keeps those campaigns reproducible.
   *
   * ⚠ `via` is what makes a SEQUENCE a sequence rather than two unrelated switches. Each run
   * resets the row to `from` and settles before recording; with `via` set, the reset goes
   * `via → from` — so `1→2→3` is measured as the `2→3` step **with the row genuinely having
   * come from 1**, which is where a state carried across a switch would show. Measuring the
   * whole sequence inside one recording would instead need the classifier to hold three settled
   * references, and its whole soundness argument rests on there being exactly two.
   */
  readonly fromLook?: string;
  readonly toLook?: string;
  readonly viaLook?: string;
  /**
   * 🔴 `B-198` — **FORCE THE SPLIT.** Delays every `MIXER` line at the bridge's send seam by
   * this many ms, turning a 1-in-50 event into one that fires on demand.
   *
   * ⚠ **A 1-in-50 event is not proved fixed by a campaign that passes.** 100 clean recordings
   * after a change look exactly like 100 clean recordings before it. This is the arm that can
   * tell them apart: with the delay set, the defect must appear BEFORE the fix and must be
   * gone AFTER it, with the delay still set.
   */
  readonly mixerLineDelayMs?: number;
  /*
    `single-clock-look-switch` — `transitionMask`, `transitionLeadMs` and `transitionTailMs`
    are GONE with the product options they set. The mask they steered no longer exists: a
    plate-bearing package is composited BELOW its plates, so there are no holes to narrow.

    ⚠ **The before/after CONTROL they existed to provide is not lost — it moved.** It is no
    longer a flag on this binary but the earlier evidence in `evidence/2026-08-31-intersect-*`,
    measured by THIS SAME classifier on THIS SAME fixture, where black and misplaced read
    non-zero. A zero here is read against those.
  */
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
  looks: 2,
  background: 'flat',
  classify: false,
  emptyLook: false,
  fixture: BANNER_COLUMN_FIXTURE.id,
  reverse: false,
};

/**
 * The size the whole frame is classified at. A 4×4 block of real pixels per classified pixel:
 * enough for an AREA FRACTION, far too coarse for an edge, which is what `artefact.ts` says.
 */
export const CLASSIFY_SIZE = { width: 480, height: 270 } as const;

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
  /**
   * `SKEW-INTERSECT-01` §2 — the ARRIVING/DEPARTING plate's own box, when the fixture places
   * one. Terms (b) and (c) are the two differences read off it; see {@link SkewFixture.probeC}.
   */
  readonly probeC?: ChangePoint;
  readonly probeCEvents?: readonly number[];
  readonly commands: readonly string[];
  readonly containedPlay: boolean;
  /** `SKEW-RESIDUE-01` — what was on screen during the mismatch, when `classify` is on. */
  readonly artefact?: ArtefactSummary;
  /** Full-size PNGs of the peak frames, written beside the recording. */
  readonly artefactFrames?: readonly string[];
}

/** `SKEW-RESIDUE-01` — the artefact numbers grouped the way the decision needs them. */
export interface ArtefactByDirection {
  readonly direction: ArtefactSummary['direction'];
  readonly runs: number;
  readonly peakBlackPct: Distribution;
  readonly peakMisplacedPct: Distribution;
  readonly blackMs: Distribution;
  readonly misplacedMs: Distribution;
  /** The control: what the classifier reports on the SETTLED frames. Must be ≈ 0. */
  readonly settledResidualPct: Distribution;
}

export interface SkewReport {
  readonly mode: string;
  readonly channelFramePeriodMs: number;
  readonly reportedFramerate: number;
  readonly fieldsPerChannelFrame: number;
  readonly probePlacement: readonly string[];
  /** The scene axes this sweep ran with — a report that cannot say is not evidence. */
  readonly scene: {
    readonly looks: number;
    readonly background: 'flat' | 'video';
    /** `SKEW-INTERSECT-01` — the fixture, the direction, and whether the fix was in force. */
    readonly fixture: string;
    readonly from: string;
    readonly to: string;
    /** `single-clock-look-switch` — WHERE THE PAGE SITS, which is the whole of the change. */
    readonly bedLayer: number;
    readonly liveBand: string;
    /** The look the row passes through on its way to `from` — a SEQUENCE's first leg. */
    readonly via?: string;
    /** `B-198` — the forced per-`MIXER`-line delay, when this campaign is the forced arm. */
    readonly mixerLineDelayMs?: number;
  };
  readonly runs: readonly RunResult[];
  readonly kChannelFrames: Distribution;
  readonly kMilliseconds: Distribution;
  /**
   * `C-033` — what the borrowed channel was running before the run, what it runs after the
   * restore, and what the harness re-created or could not. Absent only when the running set
   * could not be read at the start.
   */
  readonly consumers?: ConsumerReport;
  /**
   * 🔴 `SKEW-INTERSECT-01` §2 — **the two terms that are NOT the mask/fill disagreement, kept
   * apart from it and from each other so no future report can collapse the three again.**
   *
   * - `pictureArrivalFields` — **term (b)**: RECORDED FRAMES from the fills moving (probe A) to
   *   the arriving plate's box settling on its OWN picture (probe C's last change). On a plate
   *   the switch had to `PLAY`, that is the producer's first-frame latency; on one already
   *   seated it is zero, which is the comparison that isolates the start.
   * - `clearGapFields` — **term (c)**: RECORDED FRAMES between the new hole opening (probe B)
   *   and the outgoing plate's picture leaving its box (probe C's first change). Signed: a
   *   positive value means the hole opened AFTER the picture left.
   *
   * At `1080i5000` a recorded frame is a FIELD (the file consumer writes one per field), which
   * is the unit `SKEW-COUNT-01`'s +4 was reported in.
   */
  readonly pictureArrivalFields?: Distribution;
  readonly clearGapFields?: Distribution;
  readonly artefactsByDirection?: readonly ArtefactByDirection[];
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
/**
 * 🔴 **`single-clock-look-switch` — THE BED ROW, and it is the whole point of the measurement.**
 *
 * A plate-bearing package is a graphics BED: it loads onto the LOW half of the bank and its
 * pictures are composited ON TOP of it. The harness declares the bank the product declares —
 * operator rows at 70–79, bed rows at 1–9 — and takes the template onto a bed row, so what is
 * recorded is the layer order the product actually runs.
 *
 * ⚠ The live band stays at 30–39 (`catalog`), which is ABOVE the beds and BELOW the operator
 * rows — the arrangement `validateSourceCatalog` enforces at boot.
 */
const HARNESS_BANK = {
  channel: 1,
  start: 70,
  count: 10,
  low: { start: 1, count: 9 },
} as const;
/** The bed row the measured template is taken onto — `Bed 1`, the top of the bed group. */
const BED_LAYER = 9;

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
      // `single-clock-look-switch` — the third plate the owner's three-box look shows. An
      // unassigned plate refuses the take, so this is required for the scene to run at all.
      { templateId, plateId: PLATE_C, sourceId: 'src-3' },
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
  fixture: SkewFixture,
  /**
   * The pair this run measures — probe B is resolved FROM IT (`probeBFor`), because on a
   * three-look fixture one rect cannot be inside exactly one look for every pair. Passing the
   * pair rather than the rect keeps the placement CHECK and the READING on one resolution.
   */
  pair: readonly [string, string],
): Promise<{
  k: number | null;
  reason?: string;
  probeA: ChangePoint;
  probeB: ChangePoint;
  eventsA: readonly number[];
  eventsB: readonly number[];
  probeC?: ChangePoint;
  eventsC?: readonly number[];
}> {
  const probeBRect = probeBFor(fixture, pair);
  const [rawA, rawB] = await Promise.all([
    extractProbe(file, fixture.probeA),
    extractProbe(file, probeBRect),
  ]);
  const framesA = splitFrames(rawA, probeFrameBytes(fixture.probeA)).slice(LEAD_SKIP_FRAMES);
  const framesB = splitFrames(rawB, probeFrameBytes(probeBRect)).slice(LEAD_SKIP_FRAMES);
  const seriesA = changeSeries(framesA);
  const seriesB = changeSeries(framesB);
  const probeA = firstChangeIndex(seriesA, baselineFrames);
  const probeB = firstChangeIndex(seriesB, baselineFrames);
  const eventsA = changeEvents(seriesA, baselineFrames, probeA.threshold);
  const eventsB = changeEvents(seriesB, baselineFrames, probeB.threshold);
  /*
    `SKEW-INTERSECT-01` §2 — probe C is read on its OWN terms and is deliberately outside every
    guard below. It plays no part in `k`, so a run whose C is unreadable is still a perfectly
    good `k` run; and terms (b) and (c) are differences within one recording, so nothing about
    them depends on the separation guard `k` needs.
  */
  let probeC: ChangePoint | undefined;
  let eventsC: readonly number[] | undefined;
  if (fixture.probeC !== undefined) {
    const rawC = await extractProbe(file, fixture.probeC);
    const framesC = splitFrames(rawC, probeFrameBytes(fixture.probeC)).slice(LEAD_SKIP_FRAMES);
    const seriesC = changeSeries(framesC);
    probeC = firstChangeIndex(seriesC, baselineFrames);
    eventsC = changeEvents(seriesC, baselineFrames, probeC.threshold);
  }
  const withC = <T extends object>(o: T): T =>
    ({
      ...o,
      ...(probeC === undefined ? {} : { probeC }),
      ...(eventsC === undefined ? {} : { eventsC }),
    }) as T;

  if (probeA.index === null || probeB.index === null) {
    const which =
      probeA.index === null ? 'A (the picture never moved)' : 'B (the holes never moved)';
    return withC({
      k: null,
      reason: `probe ${which} found no transition above its noise floor`,
      probeA,
      probeB,
      eventsA,
      eventsB,
    });
  }
  /*
    `SKEW-RESIDUE-01` — THE SEPARATION GUARD. What this switch actually did to each probe is
    the difference between its two SETTLED states, and a crossing far below that is codec
    noise wearing a transition's clothes. Measured on the video-background sweep: one run
    crossed at 6.3 against a settled delta of ~74 and reported `k = −340 ms` beside nine runs
    at +40.
  */
  for (const [name, frames, point] of [
    ['A (the picture)', framesA, probeA],
    ['B (the holes)', framesB, probeB],
  ] as const) {
    const first = frames[Math.max(0, baselineFrames - 1)];
    const last = frames[frames.length - 1];
    if (first === undefined || last === undefined) continue;
    const settledDelta = meanAbsDiff(first, last);
    if (!separationOk(point.magnitude, settledDelta)) {
      return withC({
        k: null,
        reason:
          `probe ${name} crossed at ${point.magnitude.toFixed(1)} but this run settled ` +
          `${settledDelta.toFixed(1)} between its two states — too weak to be the transition`,
        probeA,
        probeB,
        eventsA,
        eventsB,
      });
    }
  }
  return withC({ k: probeB.index - probeA.index, probeA, probeB, eventsA, eventsB });
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
  const fixture = SKEW_FIXTURES[options.fixture];
  if (fixture === undefined) {
    throw new Error(
      `unknown fixture "${options.fixture}" — known: ${Object.keys(SKEW_FIXTURES).join(', ')}`,
    );
  }
  /*
    🔴 Asked about THIS fixture. A second measured pair whose probe placement was checked
    against the first pair's constants would be a measurement with no soundness argument at
    all — and `k` is exactly as trustworthy as this check.
  */
  const placement = probePlacementIssues(
    fixture,
    measuredPair(fixture, options.fromLook, options.toLook),
  );
  if (placement.length > 0) {
    throw new Error(
      `probe placement is unsound, refusing to measure:\n  - ${placement.join('\n  - ')}`,
    );
  }
  fs.mkdirSync(options.outDir, { recursive: true });
  await ensureSourceClips(options.mediaDir);

  const control = await connectAmcp(options.casparHost, options.amcpPort);
  const originalMode = (await readChannelMode(control, options.channel)).format;
  /*
    `C-033` — CAPTURE THE CHANNEL'S CONSUMERS BEFORE TOUCHING ANYTHING, and say so, loudly,
    when any of them goes to air. `SET MODE` re-initialises every consumer on the channel and a
    consumer that cannot run the measurement mode does not come back; the MODE was always
    restored, the CONSUMERS were not, and nothing in the report said so. Both are now captured
    here and compared and restored in `restoreChannel` (the `finally` below).
  */
  const consumersBefore = runningConsumersOf(await infoXml(control, options.channel));
  const declared = declaredConsumersOf(await configXml(control), options.channel);
  const notice = borrowNotice({
    channel: options.channel,
    running: consumersBefore ?? [],
    modeFrom: originalMode,
    modeTo: options.mode,
    runs: options.runs,
  });
  if (notice !== null) {
    process.stderr.write(notice);
    await sleep(BORROW_NOTICE_GRACE_MS);
  }
  let tap: WireTap | null = null;
  let runtime: CasparRuntime | null = null;
  let result: SkewReport | null = null;
  let consumers: ConsumerReport | null = null;

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
    /*
      `SKEW-RESIDUE-01` — the two axes the owner's report points at. The clip is inlined as a
      DATA URI through the runtime's own `assetUrls` seam: the bridge serves exactly one HTML
      document per template (`TemplateHttpServer`), so a second fetchable asset would need a
      second server, and the point of the axis is the page's per-frame work, not its plumbing.
    */
    const assetId = 'skew-bg-asset';
    const assetUrls: Record<string, string> = {};
    if (options.background === 'video') {
      const clip = await ensureBackgroundClip(options.mediaDir, BACKGROUND_MOTION_PATCH);
      assetUrls[assetId] = `data:video/webm;base64,${fs.readFileSync(clip).toString('base64')}`;
    }
    const scene = buildSkewScene({
      looks: options.looks,
      background: options.background,
      videoAssetId: assetId,
      withEmptyLook: options.emptyLook,
      fixture,
    });
    const html = buildTemplateHtml(scene, await bundleTemplateRuntime(), assetUrls);
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
        // Both halves of the bank, fenced — the union the product's boot validator returns,
        // from the ONE function that returns it (the two hand-built halves this replaced
        // were `P-039`'s guard's first catch outside the product).
        fixedSlots: fixedBankSlots(HARNESS_BANK),
        fixedBank: HARNESS_BANK,
        ...(options.mixerLineDelayMs === undefined
          ? {}
          : { faultInjection: { mixerLineDelayMs: options.mixerLineDelayMs } }),
        sourceCatalog: catalog() as never,
        sourceAssignments: assignments(templateId) as never,
        // `single-clock-look-switch` — the transition window's options are GONE with the mask
        // they steered. `--look-mixer-hold-ms` survives on the product and is left at its
        // default here, which is one channel frame of the observed mode.
      } as never,
    );
    runtime.start();
    await runtime.startServing();
    runtime.templateImport(template as never, html);
    await whenServerReachable(runtime);

    const itemId = 'skew-item';
    /*
      🔴 `loadFixed` ONTO A BED ROW, not `load`.

      `load` allocates from the dynamic policy, which for `custom` is 60–69 — ABOVE the live
      band at 30–39, i.e. the old order in which the page sat over its own plates and had to
      punch holes in itself. The measurement is of the NEW order, so it goes through the door
      the product now sends a plate-bearing package through, and the bridge's own `wrong-bank`
      refusal is what proves it: a bed on an operator row is refused, so a harness that had
      this backwards could not have run at all.
    */
    const loaded = await runtime.loadFixed(
      { channel: options.channel, layer: BED_LAYER },
      itemId,
      templateId,
      {},
    );
    if (!loaded.accepted) throw new Error(`the bed load was refused: ${JSON.stringify(loaded)}`);
    const taken = await runtime.take(itemId);
    if (!taken.accepted) throw new Error(`take was refused: ${JSON.stringify(taken)}`);
    // The page has to have fetched, parsed, built and painted before anything is timed.
    await sleep(3500);

    // The measured direction. `reverse` is not cosmetic: on the owner's shape one direction
    // OPENS a full-frame hole and the other CLOSES one, and they fail differently.
    const [pairFrom, pairTo] = measuredPair(fixture, options.fromLook, options.toLook);
    const measuredFrom = options.reverse ? pairTo : pairFrom;
    const measuredTo = options.reverse ? pairFrom : pairTo;
    const shared = { runtime, control, tap, options, fieldsPerChannelFrame, fixture };
    const runs: RunResult[] = [];
    for (let i = 0; i < options.runs; i += 1) {
      runs.push(
        await recordOneSwitch({
          ...shared,
          index: i,
          label: options.emptyLook ? 'empty' : 'skew',
          from: measuredFrom,
          to: options.emptyLook ? LOOK_EMPTY : measuredTo,
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
      scene: {
        looks: options.looks,
        background: options.background,
        fixture: fixture.id,
        from: measuredFrom,
        to: options.emptyLook ? LOOK_EMPTY : measuredTo,
        // `single-clock-look-switch` — where the page SITS is now the fact worth recording,
        // and it is the whole of what this measurement varies from the earlier arc.
        bedLayer: BED_LAYER,
        liveBand: '30-39',
        ...(options.viaLook === undefined ? {} : { via: options.viaLook }),
        ...(options.mixerLineDelayMs === undefined
          ? {}
          : { mixerLineDelayMs: options.mixerLineDelayMs }),
      },
      runs,
      kChannelFrames: distribution(runs.filter(usable).map((r) => r.kChannel as number)),
      kMilliseconds: distribution(runs.filter(usable).map((r) => r.kMs as number)),
      /*
        ⚠ Computed over runs whose THREE probes all read, and NOT filtered by `usable`: a run
        excluded from `k` because a `PLAY` was in its window is precisely the run term (b) is
        about, and dropping it here would leave the term measurable only where it cannot occur.
      */
      ...(fixture.probeC === undefined ? {} : termsBAndC(runs)),
      ...(options.classify ? { artefactsByDirection: groupArtefacts(runs.filter(usable)) } : {}),
    };

    result = report;
    if (options.withPlaySwitch) {
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
          {
            id: 'src-2',
            name: SOURCE_CLIPS[1],
            producer: { kind: 'media', file: SOURCE_CLIPS[1] },
          },
        ],
      });
      try {
        for (let i = 0; i < Math.min(options.runs, 4); i += 1) {
          const target = i % 2 === 0 ? SWAP_CLIP : SOURCE_CLIPS[0];
          const raw = await recordOneSwitch({
            ...shared,
            index: i,
            label: 'b155',
            from: measuredFrom,
            to: measuredTo,
            beforeRecording: () => {
              const verdict = runtime?.setSourceCatalog(catalogPointing(target ?? '') as never);
              if (verdict?.ok !== true) {
                throw new Error(
                  `the B-155 catalog re-point was refused: ${JSON.stringify(verdict)}`,
                );
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
      result = {
        ...report,
        playSwitch: {
          runs: playRuns,
          kChannelFrames: distribution(playUsable.map((r) => r.kChannel as number)),
          kMilliseconds: distribution(playUsable.map((r) => r.kMs as number)),
        },
      };
    }
  } finally {
    await runtime?.stop();
    await tap?.close();
    try {
      await control.send(`CLEAR ${String(options.channel)}`);
      if (originalMode.length > 0 && originalMode !== 'unknown') {
        await control.send(`SET ${String(options.channel)} MODE ${originalMode}`);
      }
      // `C-033` — the consumers are the channel's other fact; put back what the run took down.
      consumers = await restoreChannel(control, options.channel, consumersBefore, declared);
    } finally {
      control.close();
    }
  }
  if (result === null) throw new Error('measureSkew produced no report');
  return consumers === null ? result : { ...result, consumers };
}

/** How long the loud notice stays on screen before the first command, when a live output is attached. */
const BORROW_NOTICE_GRACE_MS = 5000;

/** Consumers re-initialise asynchronously after `SET MODE` and after an `ADD`; read only once they have. */
const CONSUMER_SETTLE_MS = 1500;

async function infoXml(control: AmcpClient, channel: number): Promise<string> {
  return (await control.send(`INFO ${String(channel)}`)).body.join('\n');
}

async function configXml(control: AmcpClient): Promise<string> {
  return (await control.send('INFO CONFIG')).body.join('\n');
}

/**
 * `C-033` — after the mode is back: re-read the running set, re-ADD what the run took down
 * (from a MEASURED grammar only — see `consumers.ts`), re-read again, and report the READING.
 *
 * Returns null only when the running set could not be read at the START, since there is then
 * nothing to compare against; that case is itself printed. Never throws: a restore that fails
 * must not hide the measurement that succeeded, and the report carries the failure.
 */
async function restoreChannel(
  control: AmcpClient,
  channel: number,
  before: readonly RunningConsumer[] | null,
  declared: readonly DeclaredConsumer[] | null,
): Promise<ConsumerReport | null> {
  if (before === null) {
    process.stderr.write(
      `cg-skew: channel ${String(channel)} consumers could not be read before the run (no <output> in INFO), so nothing is compared or restored\n`,
    );
    return null;
  }
  try {
    await sleep(CONSUMER_SETTLE_MS);
    const after = runningConsumersOf(await infoXml(control, channel)) ?? [];
    const plan = consumerRestorePlan({ channel, before, after, declared });
    const attempted: { consumer: RunningConsumer; command: string; reply: string }[] = [];
    for (const add of plan.adds) {
      const reply = await control.send(add.command);
      attempted.push({ ...add, reply: reply.status });
    }
    let final = after;
    if (attempted.length > 0) {
      await sleep(CONSUMER_SETTLE_MS);
      final = runningConsumersOf(await infoXml(control, channel)) ?? after;
    }
    const report = consumerReport({
      before,
      after: final,
      attempted,
      unrestorable: plan.unrestorable,
    });
    process.stderr.write(describeConsumerReport(channel, report));
    return report;
  } catch (err) {
    process.stderr.write(
      `cg-skew: 🔴 the consumer restore itself failed: ${err instanceof Error ? err.message : String(err)} — read INFO ${String(channel)} by hand before trusting the channel\n`,
    );
    return null;
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
  readonly fixture: SkewFixture;
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

  /*
    Start from the OUTGOING look, SETTLED, every time — a run that began mid-transition would
    carry the previous switch into its own baseline.

    🔴 `single-clock-look-switch` — and when the campaign is a SEQUENCE, the reset goes THROUGH
    `via` first, so the row arrives at `from` the way the sequence says it does. It is done
    UNCONDITIONALLY rather than only when the active look differs, because the point of a
    sequence is the leg that precedes the measured switch: skipping it on a row that happens to
    be sitting on `from` already would silently measure the plain two-look case instead.
  */
  if (options.viaLook !== undefined) {
    await runtime.setActiveLook(itemId, options.viaLook);
    await sleep(1200);
    await runtime.setActiveLook(itemId, spec.from);
    await sleep(1500);
  } else if (runtime.activeLookId(itemId) !== spec.from) {
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

  /*
    `SKEW-RESIDUE-01` — the EMPTY-INTERSECTION capture. This switch has no `k` to find (the
    entering look punches nothing, so probe B never sees a hole) and the run is expected to be
    discarded below. What it is for is the FRAMES: the first change probe A sees is the moment
    every box vanishes under the template, which is what an empty intersection would show for
    one field. Dumped before the discard so the evidence survives it.
  */
  if (options.emptyLook) {
    const raw = await extractProbe(kept, spec.fixture.probeA);
    const probeFrames = splitFrames(raw, probeFrameBytes(spec.fixture.probeA)).slice(
      LEAD_SKIP_FRAMES,
    );
    const point = firstChangeIndex(
      changeSeries(probeFrames),
      Math.max(4, Math.floor((options.settleMs * 0.6) / period) - LEAD_SKIP_FRAMES),
    );
    const dumped: string[] = [];
    if (point.index !== null) {
      for (const offset of [-1, 0, 1]) {
        const png = path.join(
          options.outDir,
          `empty-${String(spec.index).padStart(2, '0')}${offset === 0 ? '' : offset > 0 ? '-after' : '-before'}.png`,
        );
        await dumpFramePng(kept, point.index + LEAD_SKIP_FRAMES + offset, png);
        dumped.push(png);
      }
    }
    return {
      ...discard('the empty look punches nothing — this run is a FRAME capture'),
      artefactFrames: dumped,
    };
  }
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
  const analysis = await analyseRecording(kept, baselineFrames, spec.fixture, [spec.from, spec.to]);
  if (analysis.k === null) return discard(analysis.reason ?? 'no transition found');

  let classified: { artefact: ArtefactSummary; frames: string[] } | null = null;
  if (options.classify && analysis.probeA.index !== null && analysis.probeB.index !== null) {
    classified = await classifyRun(
      kept,
      analysis.probeA.index,
      analysis.probeB.index,
      period,
      baselineFrames,
      options.background === 'video',
      options.outDir,
      `${spec.label}-${String(spec.index).padStart(2, '0')}`,
    );
  }

  return {
    ...base,
    kRecorded: analysis.k,
    kChannel: analysis.k / spec.fieldsPerChannelFrame,
    kMs: analysis.k * period,
    probeA: analysis.probeA,
    probeB: analysis.probeB,
    probeAEvents: analysis.eventsA,
    probeBEvents: analysis.eventsB,
    ...(analysis.probeC === undefined ? {} : { probeC: analysis.probeC }),
    ...(analysis.eventsC === undefined ? {} : { probeCEvents: analysis.eventsC }),
    ...(classified !== null
      ? { artefact: classified.artefact, artefactFrames: classified.frames }
      : {}),
  };
}

/**
 * `SKEW-INTERSECT-01` §2 — terms (b) and (c), as distributions over the runs that carry all
 * three probe readings.
 *
 * Both are differences WITHIN one recording, so neither crosses a clock and neither needs the
 * wire tap: probe A is the fills landing, probe B the mask changing, probe C the content of the
 * arriving/departing box changing. That is why they can be read off the same recordings the
 * mask measurement uses rather than needing a run of their own.
 */
function termsBAndC(runs: readonly RunResult[]): {
  pictureArrivalFields: Distribution;
  clearGapFields: Distribution;
} {
  const arrival: number[] = [];
  const clear: number[] = [];
  for (const run of runs) {
    const events = run.probeCEvents ?? [];
    if (events.length === 0 || run.probeA.index === null || run.probeB.index === null) continue;
    const first = events[0] as number;
    const last = events[events.length - 1] as number;
    arrival.push(last - run.probeA.index);
    clear.push(run.probeB.index - first);
  }
  return { pictureArrivalFields: distribution(arrival), clearGapFields: distribution(clear) };
}

function emptyPoint(): ChangePoint {
  return { index: null, threshold: 0, noiseFloor: 0, magnitude: 0, series: [] };
}

/**
 * `SKEW-RESIDUE-01` — the artefact numbers per DIRECTION, which is the split the decision
 * turns on: the owner reports the two directions as looking different, and a pooled average
 * over a distribution that straddles zero would describe neither.
 */
function groupArtefacts(runs: readonly RunResult[]): ArtefactByDirection[] {
  const directions: ArtefactSummary['direction'][] = ['hole-early', 'exact', 'hole-late'];
  const out: ArtefactByDirection[] = [];
  for (const direction of directions) {
    const withArtefact = runs
      .map((r) => r.artefact)
      .filter((a): a is ArtefactSummary => a !== undefined && a.direction === direction);
    if (withArtefact.length === 0) continue;
    out.push({
      direction,
      runs: withArtefact.length,
      peakBlackPct: distribution(withArtefact.map((a) => a.peakBlackPct)),
      peakMisplacedPct: distribution(withArtefact.map((a) => a.peakMisplacedPct)),
      blackMs: distribution(withArtefact.map((a) => a.blackMs)),
      misplacedMs: distribution(withArtefact.map((a) => a.misplacedMs)),
      settledResidualPct: distribution(withArtefact.map((a) => a.settledResidualPct)),
    });
  }
  return out;
}

/**
 * Classify one recording's mismatch window.
 *
 * The window is `[min(A,B) − 1 … max(A,B) + 1]`: the transition frames themselves are part of
 * what a viewer sees, and one frame either side is what shows that the classifier returns to
 * ZERO outside the window — a classifier that reported artefacts in the settled state would be
 * measuring its own tolerance.
 */
async function classifyRun(
  file: string,
  aIndex: number,
  bIndex: number,
  periodMs: number,
  baselineFrames: number,
  excludeMotionPatch: boolean,
  outDir: string,
  name: string,
): Promise<{ artefact: ArtefactSummary; frames: string[] }> {
  const raw = await extractScaledFrames(file, CLASSIFY_SIZE.width, CLASSIFY_SIZE.height);
  const frames = splitFrames(raw, CLASSIFY_SIZE.width * CLASSIFY_SIZE.height * 3).slice(
    LEAD_SKIP_FRAMES,
  );
  const exclude = excludeMotionPatch
    ? excludeMask(CLASSIFY_SIZE, SKEW_SCENE, [BACKGROUND_MOTION_PATCH])
    : undefined;
  const artefact = classifyWindow({
    frames,
    // The settled states, read from this same recording: the last quiet baseline frame and the
    // last frame of the tail.
    beforeIndex: Math.max(0, Math.min(baselineFrames - 1, frames.length - 1)),
    afterIndex: frames.length - 1,
    from: Math.min(aIndex, bIndex),
    to: Math.max(aIndex, bIndex) - 1,
    direction: directionOf(bIndex - aIndex),
    periodMs,
    ...(exclude !== undefined ? { exclude } : {}),
  });
  const written: string[] = [];
  for (const [label, index] of [
    ['black', artefact.peakBlackFrame],
    ['misplaced', artefact.peakMisplacedFrame],
  ] as const) {
    if (index === null) continue;
    const png = path.join(outDir, `${name}-${label}.png`);
    // +LEAD_SKIP_FRAMES: the classifier's indices are into the sliced series, the dump reads
    // the file. Off by that much and the frame a report names is not the frame it measured.
    await dumpFramePng(file, index + LEAD_SKIP_FRAMES, png);
    written.push(png);
  }
  return { artefact, frames: written };
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
