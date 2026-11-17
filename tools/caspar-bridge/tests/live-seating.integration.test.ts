import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createMock,
  decodeCgData,
  defaultHandlers,
  parseAmcpLine,
  type MockHandle,
} from '@cg/amcp-mock';
import {
  TAKE_ON_AIR_CODE,
  type ConnectionConfig,
  type SourceAssignments,
  type SourceCatalog,
  type TemplateInfo,
} from '@cg/shared-ipc';
import {
  CG_LIVE_FOCUS_SLIDE_PAGE_MARKER,
  CG_LIVE_FRAME_PLACEMENT_PAGE_MARKER,
  CG_LIVE_FRAME_TRANSITION_PAGE_MARKER,
  CG_LIVE_MASK_PLACEMENT_PAGE_MARKER,
  CG_LIVE_POSITION_PAGE_MARKER,
  CG_LIVE_PRESET_ARTWORK_FADE_PAGE_MARKER,
  CG_LIVE_PRESET_DEPARTURE_PAGE_MARKER,
  CG_LIVE_PRESET_RECOVERY_PAGE_MARKER,
  CG_LIVE_PRESET_TITLE_HOLD_PAGE_MARKER,
  CG_LIVE_PRESET_TRANSITION_PAGE_MARKER,
  CONTROL_LIVE_LAYOUT_DEFAULT_EFFECTS,
  controlLiveLayoutFocusLookId,
  controlLiveLayoutRects,
  RetainedStackItemSchema,
  retainedFromStackItem,
  readCgControl,
  type FrameTransition,
  type ControlLiveLayout,
  type LiveFitMode,
  type LiveFramePlacement,
  type LiveFrameTarget,
  type LiveMaskPlacement,
  type LiveRevealMask,
} from '@cg/shared-schema';
import { CasparRuntime } from '../src/caspar-runtime.js';
import { parkedFit } from '../src/live-plate-release.js';
import { awaitChannelModeRead, HEALTH_MS, TEST_LAYER_POLICY } from './support/harness.js';
import { recvLines as readWireLines } from './support/wire-trace.js';

/**
 * C-015 phase 6 (task 6.0) — **THE ASSEMBLY: a declared plate actually puts a
 * picture on air.**
 *
 * This is the test for the call site phase 6's task list never enumerated. Every
 * component had its own green test and a plate still showed nothing, because
 * nothing called them — so every assertion here is about the JOIN: that the
 * refusals fire before the wire is touched, that the seating lands on the wire in
 * the right order relative to the graphic it belongs to, and that the ledger says
 * what was actually sent.
 *
 * ⚠ **Asserted ON THE WIRE, from the mock's NDJSON trace.** The whole failure this
 * unit exists to fix was invisible to state-only assertions: every internal
 * structure was correct and nothing reached CasparCG.
 */

let mock: MockHandle | null = null;
let backup: MockHandle | null = null;
let runtime: CasparRuntime | null = null;
let tracePath: string | null = null;

/** Clear of the `lower-third` policy band (10–19), which is where the TEMPLATE goes. */
const BAND = { start: 30, end: 32 };
const SCENE = { width: 1920, height: 1080 };
const CENTRED = { anchor: 'center' as const, offset: { x: 0, y: 0 } };

afterEach(async () => {
  await runtime?.stop();
  runtime = null;
  await mock?.stop();
  mock = null;
  await backup?.stop();
  backup = null;
  if (tracePath !== null && fs.existsSync(tracePath)) fs.rmSync(tracePath);
  tracePath = null;
});

function singleServer(amcpPort: number): ConnectionConfig {
  return {
    servers: { A: { host: '127.0.0.1', amcpPort, oscPort: 0 } },
    strategy: 'mirror-sync',
    autoFailoverEnabled: true,
  };
}

async function recvLines(): Promise<string[]> {
  if (mock === null || tracePath === null) throw new Error('no trace');
  await mock.traceFlush();
  return readWireLines(tracePath);
}

interface PlateSpec {
  id: string;
  rect: { x: number; y: number; width: number; height: number };
  expectedAspect?: number;
  /** `C-028` — the AUTHOR's fit mode. Absent ⇒ `contain`, the shipped default. */
  fitMode?: LiveFitMode;
  revealMask?: LiveRevealMask;
  operatorFrame?: LiveFrameTarget;
}

/** A template declaring one hole per entry, each with its own rect. */
function template(plates: readonly PlateSpec[], foregroundOverlay = false): TemplateInfo {
  return {
    templateId: 'lower-third',
    templateType: 'lower-third',
    fields: [],
    liveSources: {
      resolution: SCENE,
      defaultPosition: CENTRED,
      sources: plates.map((p) => ({
        elementId: `el-${p.id}`,
        sourceId: p.id,
        rect: p.rect,
        dynamic: false,
        ...(p.expectedAspect !== undefined && { expectedAspect: p.expectedAspect }),
        ...(p.fitMode !== undefined && { fitMode: p.fitMode }),
        ...(p.revealMask !== undefined && { revealMask: p.revealMask }),
        ...(p.operatorFrame !== undefined && { operatorFrame: p.operatorFrame }),
      })),
      ...(foregroundOverlay ? { foregroundOverlay: true as const } : {}),
    },
  };
}

const BOX = { x: 480, y: 270, width: 960, height: 540 };
const FRAME: LiveFrameTarget = {
  frameKey: 'el-guest-1',
  artworkKey: 'el-guest-1',
  resize: 'proportional',
};
const MOVED_FRAME: LiveFramePlacement = {
  frameKey: FRAME.frameKey,
  rect: { x: 960, y: 540, width: 480, height: 270 },
};
const AUTHORED_FRAME: LiveFramePlacement = { frameKey: FRAME.frameKey, rect: BOX };
const FRAME_HTML = `<!doctype html><html><head>${CG_LIVE_FRAME_PLACEMENT_PAGE_MARKER}</head><body>served</body></html>`;
const MASK_HTML = FRAME_HTML.replace('</head>', `${CG_LIVE_MASK_PLACEMENT_PAGE_MARKER}</head>`);
const EFFECT_HTML = FRAME_HTML.replace('</head>', `${CG_LIVE_FRAME_TRANSITION_PAGE_MARKER}</head>`);
const PRESET_EFFECT_HTML = FRAME_HTML.replace(
  '</head>',
  `${CG_LIVE_PRESET_TRANSITION_PAGE_MARKER}</head>`,
);

function presetEffectTemplate(): TemplateInfo {
  const base = template(
    [
      { id: 'guest-1', rect: BOX },
      { id: 'guest-2', rect: BOX },
    ],
    true,
  );
  const frame = { frameKey: 'solo-guest', elementId: 'common-guest', artworkId: 'guest-comp' };
  return {
    ...base,
    liveSources: {
      ...base.liveSources!,
      defaultLookId: 'solo',
      looks: [
        {
          id: 'solo',
          name: 'Solo',
          entered: { mode: 'cut' },
          rects: { 'guest-1': BOX },
          transitionFrames: { 'guest-1': frame },
        },
        {
          id: 'duo',
          name: 'Duo',
          entered: { mode: 'cut' },
          rects: { 'guest-1': MOVED_FRAME.rect, 'guest-2': BOX },
          transitionFrames: { 'guest-1': { ...frame, frameKey: 'duo-guest' } },
        },
      ],
    },
  };
}

const PRESET_EFFECT = { motion: 'ease-in-out', fade: true, durationMs: 160 } as const;
const PRESET_DEPARTURE_HTML = PRESET_EFFECT_HTML.replace(
  '</head>',
  `${CG_LIVE_PRESET_DEPARTURE_PAGE_MARKER}</head>`,
);
const PRESET_ARTWORK_FADE_HTML = PRESET_DEPARTURE_HTML.replace(
  '</head>',
  `${CG_LIVE_PRESET_ARTWORK_FADE_PAGE_MARKER}</head>`,
);
const PRESET_RECOVERY_HTML = PRESET_ARTWORK_FADE_HTML.replace(
  '</head>',
  `${CG_LIVE_PRESET_RECOVERY_PAGE_MARKER}</head>`,
);
const PRESET_TITLE_HOLD_HTML = PRESET_RECOVERY_HTML.replace(
  '</head>',
  `${CG_LIVE_PRESET_TITLE_HOLD_PAGE_MARKER}</head>`,
);

const DEPARTURE_BAND = { start: BAND.start, end: BAND.end + 1 };
const PRESET_RECOVERY_BAND = { start: 60, end: 63 };
const DEPARTURE_ARTWORK = 'duo/right-group';
const FULL_FRAME = { x: 0, y: 0, width: 1920, height: 1080 };

async function bootPresetDeparture(
  html: string,
  withRetainedInGroup = false,
  additionalArrivalFragment = false,
  mirror?: { missingMedia?: true; nextTake?: true },
) {
  const base = presetEffectTemplate();
  const live = base.liveSources!;
  const [solo, duo] = live.looks!;
  const left = { x: 0, y: 270, width: 960, height: 540 };
  const right = { x: 960, y: 270, width: 960, height: 540 };
  const nativeBand =
    html === PRESET_RECOVERY_HTML || mirror !== undefined ? PRESET_RECOVERY_BAND : DEPARTURE_BAND;
  const makeInput = (id: string): SourceCatalog['sources'][number] => ({
    id,
    name: id,
    format: '1080i5000',
    producer:
      mirror?.missingMedia === true && id === 'src-b'
        ? { kind: 'media', file: 'missing-on-backup.mov' }
        : { kind: 'ndi', source: id },
  });
  const r = await boot({
    template: {
      ...base,
      liveSources: {
        ...live,
        sources: [
          ...live.sources,
          { elementId: 'mask-guest', sourceId: 'guest-3', rect: right, dynamic: false },
        ],
        looks: [
          { ...solo!, rects: { 'guest-1': FULL_FRAME } },
          {
            ...duo!,
            rects: { 'guest-1': left, 'guest-2': right, 'guest-3': right },
            masks: {
              'guest-3': {
                mode: 'inside',
                rects: [
                  { x: 0.1, y: 0.6, width: 0.8, height: 0.2 },
                  ...(additionalArrivalFragment
                    ? [{ x: 0.1, y: 0.1, width: 0.8, height: 0.2 }]
                    : []),
                ],
              },
            },
            platePaintOrder: ['guest-1', 'guest-2', 'guest-3'],
            transitionPaintOrder: ['guest-1', 'guest-2', 'guest-3'],
            transitionFrames: {
              ...duo!.transitionFrames,
              'guest-2': { frameKey: 'duo-right', elementId: 'guest-2', artworkId: 'right' },
              'guest-3': { frameKey: 'duo-mask', elementId: 'mask-guest', artworkId: 'mask' },
            },
            transitionDepartureGroups: {
              [DEPARTURE_ARTWORK]: [
                'guest-2',
                'guest-3',
                ...(withRetainedInGroup ? ['guest-1'] : []),
              ],
            },
          },
        ],
      },
    },
    html,
    ...(mirror === undefined
      ? {}
      : { mirrorChannel: 2, missingBackupMedia: mirror.missingMedia === true }),
    catalog: catalog({
      sources: ['src-a', 'src-b', 'src-c', ...(mirror?.nextTake === true ? ['src-d'] : [])].map(
        makeInput,
      ),
      layerRange:
        additionalArrivalFragment || mirror?.nextTake === true
          ? { ...nativeBand, end: nativeBand.end + 1 }
          : nativeBand,
    }),
    assignments: {
      assignments: [
        ...assign([
          ['guest-1', 'src-a'],
          ['guest-2', 'src-b'],
          ['guest-3', 'src-c'],
        ]).assignments,
        ...(mirror?.nextTake === true
          ? [{ templateId: 'other-layout', plateId: 'guest-4', sourceId: 'src-d' }]
          : []),
      ],
    },
  });
  expect(await loadAndTake(r)).toMatchObject({ accepted: true });
  await expect.poll(() => r.stackSnapshot()[0]).toMatchObject({ onAirPresetTransition: true });
  expect(await r.setActiveLook('item-1', 'duo')).toEqual({ ok: true });
  return r;
}

function catalog(over: Partial<SourceCatalog> = {}): SourceCatalog {
  return {
    sources: [
      {
        id: 'src-a',
        name: 'Studio A',
        format: '1080i5000',
        producer: { kind: 'route', channel: 2 },
      },
      { id: 'src-b', name: 'Baku', format: '1080i5000', producer: { kind: 'route', channel: 3 } },
      {
        id: 'src-c',
        name: 'Skype 1',
        format: '1080i5000',
        producer: { kind: 'route', channel: 4 },
      },
      // A producer form the mock REFUSES (an announced scheme it does not know),
      // so a seating failure can be provoked deterministically instead of by
      // tearing down a socket mid-test.
      {
        id: 'src-bad',
        name: 'Broken',
        format: '1080i5000',
        producer: { kind: 'media', file: 'bogus://clip.mov' },
      },
    ],
    layerRange: BAND,
    ...over,
  };
}

function assign(pairs: readonly (readonly [string, string])[]): SourceAssignments {
  return {
    assignments: pairs.map(([plateId, sourceId]) => ({
      templateId: 'lower-third',
      plateId,
      sourceId,
    })),
  };
}

async function boot(options: {
  template: TemplateInfo;
  catalog?: SourceCatalog;
  assignments?: SourceAssignments;
  html?: string;
  redundant?: boolean;
  mirrorChannel?: number;
  missingBackupMedia?: boolean;
  lookMixerHoldMs?: number;
}): Promise<CasparRuntime> {
  tracePath = path.join(
    os.tmpdir(),
    `cg-liveseat-${String(process.pid)}-${String(Date.now())}-${String(Math.round(performance.now() * 1000))}.ndjson`,
  );
  // The Bridge binds an ephemeral UDP port and tells each core where to send OSC. Probing
  // and releasing a port before startup lets another parallel fixture claim it before the bind.
  mock = await createMock({ amcpPort: 0, oscPort: 0, oscHz: 30, tracePath });
  const config = singleServer(mock.amcpPort);
  if (options.redundant === true || options.mirrorChannel !== undefined) {
    backup = await createMock({
      amcpPort: 0,
      oscPort: 0,
      oscHz: 30,
      ...(options.mirrorChannel !== undefined && { channels: options.mirrorChannel }),
    });
    config.servers.B = { host: '127.0.0.1', amcpPort: backup.amcpPort, oscPort: 0 };
  }
  const r = new CasparRuntime(
    config,
    {},
    {
      layerPolicy: TEST_LAYER_POLICY,
      sweepMs: 150,
      sourceCatalog: options.catalog ?? catalog(),
      sourceAssignments: options.assignments ?? assign([['guest-1', 'src-a']]),
      ...(options.lookMixerHoldMs !== undefined && { lookMixerHoldMs: options.lookMixerHoldMs }),
      ...(options.mirrorChannel !== undefined && {
        backupChannels: {
          channelOnB: (channel: number) => (channel === 1 ? options.mirrorChannel! : null),
          channelOnBAtTake: (channel: number) => (channel === 1 ? options.mirrorChannel! : null),
          stationChannelOf: (channel: number) => (channel === options.mirrorChannel ? 1 : null),
          release: () => undefined,
        },
      }),
    },
  );
  runtime = r;
  if (options.missingBackupMedia === true)
    r.useBackupMedia(() => ({ kind: 'refused', reason: 'no-copy' }));
  r.start();
  await r.startServing();
  const html = options.html ?? '<!doctype html><html><body>served</body></html>';
  if (options.template.controlLiveLayout === undefined) {
    r.templateImport(options.template, html);
  } else {
    const kept = r.templateSourcePut(Buffer.from('authored layout package').toString('base64'));
    if (!kept.stored || kept.sha256 === undefined) throw new Error('Could not retain layout');
    expect(
      r.templateImport({ ...options.template, controlLiveLayoutSource: kept.sha256 }, html, 1, {
        sourceSha256: kept.sha256,
      }).registered,
    ).toBe(true);
  }
  await r.whenServerHealthy(HEALTH_MS);
  if (options.mirrorChannel !== undefined)
    await expect.poll(() => r.health().backup?.state, { timeout: HEALTH_MS }).toBe('healthy');
  // The refusal cases below assert "NOTHING reaches the wire" from a `before`
  // baseline — valid only once R-030's timer-driven one-shot `INFO` has drained
  // (flake family 3, support/harness.ts).
  await awaitChannelModeRead(r);
  return r;
}

/** Load then take one item, returning the take's verdict. */
async function loadAndTake(
  r: CasparRuntime,
  itemId = 'item-1',
): Promise<{ accepted: boolean; errorCode?: string }> {
  await r.load(itemId, 'lower-third', {});
  return r.take(itemId);
}

const at = (lines: readonly string[], needle: string): number =>
  lines.findIndex((l) => l.startsWith(needle));

const focusPreset = 'panel';
const soloPreset = 'interview';
const focusFrameIds = ['guest-1', 'guest-2', 'guest-3'] as const;
const focusLooks = focusFrameIds.map((frameId) =>
  controlLiveLayoutFocusLookId(focusPreset, frameId),
);
const focusRect = { ...SCENE, x: 0, y: 0 };
const focusMotion = { motion: 'ease-in-out', fade: false, durationMs: 160 } as const;

async function bootControlFocus(
  paired = false,
  startsWithSolo = false,
  switchMode: ControlLiveLayout['effects']['switch']['mode'] = 'motion',
  bordered = false,
) {
  const cameras = {
    'guest-1': 'src-a',
    'guest-2': 'src-b',
    'guest-3': 'src-c',
  };
  const layout: ControlLiveLayout = {
    id: 'lower-third',
    name: 'Panel discussion',
    resolution: SCENE,
    frameRate: 25,
    frames: focusFrameIds.map((id) => ({
      id,
      title: id,
      sourceId: cameras[id],
      ...(bordered && { border: { color: '#0099ff', width: 5 } }),
    })),
    presets: [
      {
        id: focusPreset,
        name: 'Three-up',
        frameIds: [...focusFrameIds],
        arrangement: 'host-and-guests',
        horizontalGap: 24,
        verticalGap: 20,
        hiddenTitles: [],
        hiddenFocusTitles: [],
        reverse: false,
      },
    ],
    defaultPresetId: startsWithSolo ? soloPreset : focusPreset,
    background: { kind: 'color', color: '#102030' },
    effects: structuredClone(CONTROL_LIVE_LAYOUT_DEFAULT_EFFECTS),
  };
  layout.effects.switch.mode = switchMode;
  if (startsWithSolo) {
    layout.presets.push({
      ...layout.presets[0]!,
      id: soloPreset,
      name: 'Interview',
      frameIds: [focusFrameIds[0]],
    });
  }
  const rects = controlLiveLayoutRects(layout, layout.presets[0]!);
  const base = template(
    focusFrameIds.map((id) => ({ id, rect: rects[id]! })),
    true,
  );
  const look = (id: string, membership: Record<string, PlateSpec['rect']>) => ({
    id,
    name: id,
    entered: { mode: 'cut' as const },
    rects: membership,
    transitionFrames: Object.fromEntries(
      Object.keys(membership).map((frameId) => [
        frameId,
        { frameKey: id + '/' + frameId, elementId: 'el-' + frameId, artworkId: 'art-' + frameId },
      ]),
    ),
    transitionDepartureGroups: Object.fromEntries(
      Object.keys(membership).map((frameId) => [id + '/' + frameId, [frameId]]),
    ),
  });
  const r = await boot({
    template: {
      ...base,
      controlLiveLayout: layout,
      liveSources: {
        ...base.liveSources!,
        defaultLookId: layout.defaultPresetId,
        looks: layout.presets.flatMap((preset) => [
          look(preset.id, controlLiveLayoutRects(layout, preset)),
          ...focusFrameIds.map((frameId) =>
            look(controlLiveLayoutFocusLookId(preset.id, frameId), { [frameId]: focusRect }),
          ),
        ]),
      },
    },
    catalog: catalog({
      layerRange: { start: 30, end: 36 },
      sources: Object.values(cameras).map((id) => ({
        id,
        name: id,
        format: '1080i5000',
        producer: { kind: 'ndi', source: id },
      })),
    }),
    assignments: { assignments: [] },
    html: PRESET_TITLE_HOLD_HTML + CG_LIVE_FOCUS_SLIDE_PAGE_MARKER,
    ...(paired && { mirrorChannel: 2 }),
  });
  expect(await loadAndTake(r)).toMatchObject({ accepted: true });
  await expect.poll(() => r.stackSnapshot()[0]?.onAirPresetTransition).toBe(true);
  return r;
}

it('advances the bordered interlaced artwork while keeping the native preset deadline', async () => {
  const r = await bootControlFocus(false, false, 'motion', true);
  const engine = mock!;
  const mark = engine.receivedCommands().length;
  expect(await r.setActiveLook('item-1', focusLooks[0]!, focusMotion)).toEqual({ ok: true });
  const logs = engine.receivedCommands().slice(mark);
  const move = logs.flatMap((write) => {
    if (!write.line.startsWith('CG ') || !write.line.includes('delayMs')) return [];
    const command = parseAmcpLine(write.line);
    const fields = decodeCgData(command!.args[3]!).data;
    const phase = fields === null ? undefined : readCgControl(JSON.parse(fields))?.frameTransition;
    return phase?.frames.some(({ from, to }) => from.width !== to.width)
      ? [{ ...write, phase }]
      : [];
  });
  expect(move).toHaveLength(2);
  expect(move.every(({ phase }) => phase.delayMs === 0)).toBe(true);
  const nativeCommit = logs.find(({ line, at }) => line === 'MIXER 1 COMMIT' && at >= move[1]!.at);
  expect(nativeCommit?.at).toBeGreaterThanOrEqual(move[0]!.at + 25);
});

it('moves between bound Control Focus frames and restores the exact prior arrangement', async () => {
  const r = await bootControlFocus(true);
  const records = r.liveLayers().get('item-1')!;
  expect(records).toHaveLength(3);
  const [first, second, third] = records;
  const initial = records.map((record) => mock!.layerRenderedRect(record.slot));
  const mark = (await recvLines()).length;
  expect(await r.setActiveLook('item-1', focusLooks[0]!, focusMotion)).toEqual({ ok: true });
  expect(mock!.layerRenderedRect(first!.slot)).toEqual({ x: 0, y: 0, width: 1, height: 1 });
  expect(
    (await recvLines()).slice(mark).some((line) => /FILL .+ easeinoutquad DEFER$/.test(line)),
  ).toBe(true);
  const motionMark = (await recvLines()).length;
  expect(await r.setActiveLook('item-1', focusLooks[1]!, focusMotion)).toEqual({ ok: true });
  expect(mock!.layerRenderedRect(second!.slot)).toEqual({ x: 0, y: 0, width: 1, height: 1 });
  expect((await recvLines()).slice(motionMark)).toEqual(
    expect.arrayContaining([
      expect.stringMatching(
        new RegExp('MIXER 1-' + second!.slot.layer + ' FILL .+ easeinoutquad DEFER$'),
      ),
      expect.stringMatching(
        new RegExp('MIXER 1-' + first!.slot.layer + ' OPACITY 0 .+ easeinoutquad DEFER$'),
      ),
    ]),
  );
  const beforePush = (await recvLines()).length;
  const peerBefore = backup!.receivedCommands().length;
  expect(
    await r.setActiveLook('item-1', focusLooks[2]!, undefined, {
      mode: 'push',
      direction: 'right',
      durationMs: 160,
    }),
  ).toEqual({ ok: true });
  expect(mock!.layerRenderedRect(third!.slot)).toEqual({ x: 0, y: 0, width: 1, height: 1 });
  const pushLines = (await recvLines()).slice(beforePush);
  expect(pushLines).toEqual(
    expect.arrayContaining([
      expect.stringMatching(
        new RegExp('MIXER 1-' + second!.slot.layer + ' FILL -1 0 1 1 .+ linear DEFER$'),
      ),
      expect.stringMatching(
        new RegExp('MIXER 1-' + third!.slot.layer + ' FILL 0 0 1 1 .+ linear DEFER$'),
      ),
    ]),
  );
  const peerLines = backup!
    .receivedCommands()
    .slice(peerBefore)
    .map(({ line }) => line);
  expect(peerLines).toEqual(
    expect.arrayContaining([
      expect.stringMatching(
        new RegExp('MIXER 2-' + second!.slot.layer + ' FILL -1 0 1 1 .+ linear DEFER$'),
      ),
      expect.stringMatching(
        new RegExp('MIXER 2-' + third!.slot.layer + ' FILL 0 0 1 1 .+ linear DEFER$'),
      ),
    ]),
  );
  expect(peerLines.filter((line) => line.includes('focusSlide')).length).toBeGreaterThan(1);
  expect(backup!.layerRenderedRect({ channel: 2, layer: third!.slot.layer })).toEqual(
    mock!.layerRenderedRect(third!.slot),
  );
  const beforeSlide = (await recvLines()).length;
  const peerBeforeSlide = backup!.receivedCommands().length;
  expect(
    await r.setActiveLook('item-1', focusLooks[0]!, undefined, {
      mode: 'slide-over',
      direction: 'up',
      durationMs: 160,
    }),
  ).toEqual({ ok: true });
  const slideLines = (await recvLines()).slice(beforeSlide);
  const peerSlideLines = backup!
    .receivedCommands()
    .slice(peerBeforeSlide)
    .map(({ line }) => line);
  expect(slideLines).toEqual(
    expect.arrayContaining([
      expect.stringMatching(
        new RegExp('MIXER 1-' + third!.slot.layer + ' FILL 0 0 1 1 .+ linear DEFER$'),
      ),
      expect.stringMatching(
        new RegExp('MIXER 1-' + first!.slot.layer + ' FILL 0 0 1 1 .+ linear DEFER$'),
      ),
    ]),
  );
  for (const [lines, channel, mode, axis, sign, destinationLookId] of [
    [pushLines, 1, 'push', 'x', 1, focusLooks[2]!],
    [peerLines, 2, 'push', 'x', 1, focusLooks[2]!],
    [slideLines, 1, 'slide-over', 'y', -1, focusLooks[0]!],
    [peerSlideLines, 2, 'slide-over', 'y', -1, focusLooks[0]!],
  ] as const) {
    const paints = lines.flatMap((line, index) => {
      if (!line.includes('focusSlide')) return [];
      const decoded = decodeCgData(parseAmcpLine(line)!.args[3]!);
      if (decoded.data === null) throw new Error('Cannot decode Focus artwork phase');
      return [{ line, index, phase: readCgControl(JSON.parse(decoded.data))?.frameTransition }];
    });
    expect(paints.length).toBeGreaterThan(1);
    expect(paints[0]?.phase?.focusSlide).toMatchObject({ fromProgress: 0, toProgress: 0 });
    expect(paints.at(-1)?.phase?.focusSlide?.toProgress).toBe(1);
    for (const { index, phase, line } of paints) {
      expect(phase).toMatchObject({
        destinationLookId,
        focusSlide: { mode, axis, sign, viewport: { x: 0, y: 0, ...SCENE } },
      });
      expect(line).not.toContain('hidePresetTitlePlateIds');
      expect(lines.slice(index + 1)).toContain(`MIXER ${channel} COMMIT`);
    }
  }
  expect(await r.setActiveLook('item-1', focusPreset, focusMotion)).toEqual({ ok: true });
  expect(records.map((record) => mock!.layerRenderedRect(record.slot))).toEqual(initial);
  expect(
    records.map((record) => backup!.layerRenderedRect({ channel: 2, layer: record.slot.layer })),
  ).toEqual(initial);
  expect(r.activeLookId('item-1')).toBe(focusPreset);
  expect(r.stackSnapshot()[0]?.frozenAssignment).toEqual({
    'guest-1': 'src-a',
    'guest-2': 'src-b',
    'guest-3': 'src-c',
  });
  expect(r.stackSnapshot()[0]?.sourceOverride).toBeUndefined();
  expect(r.stackSnapshot()[0]?.lookSourceOverride).toBeUndefined();
  expect((await recvLines()).slice(mark).some((line) => /^(?:PLAY|CLEAR) /.test(line))).toBe(false);
});

it('refuses a Control Focus slide transaction and restores the previously shown frame', async () => {
  const r = await bootControlFocus();
  expect(await r.setActiveLook('item-1', focusLooks[0]!, focusMotion)).toEqual({ ok: true });
  const records = r.liveLayers().get('item-1')!;
  const prior = records.find((record) => record.sourceId === focusFrameIds[0])!;
  const next = records.find((record) => record.sourceId === focusFrameIds[1])!;
  const before = mock!.layerState(prior.slot);
  const original = defaultHandlers().get('MIXER')!;
  let refused = false;
  mock!.setHandler('MIXER', (request, context, connection) => {
    if (
      !refused &&
      request.raw.startsWith('MIXER 1-' + next.slot.layer + ' FILL ') &&
      request.raw.endsWith('linear DEFER')
    ) {
      refused = true;
      return { kind: 'err', code: 502, verb: 'MIXER' };
    }
    return original(request, context, connection);
  });
  expect(
    await r.setActiveLook('item-1', focusLooks[1]!, undefined, {
      mode: 'push',
      direction: 'left',
      durationMs: 160,
    }),
  ).toMatchObject({ ok: false });
  expect(refused).toBe(true);
  expect(r.activeLookId('item-1')).toBe(focusLooks[0]);
  expect(mock!.layerState(prior.slot)).toEqual(before);
  expect(mock!.layerRenderedRect(next.slot)).toBeNull();
  expect(mock!.stagedMixerCount(1)).toBe(0);
});

it('dissolves Control Focus in both mixer layer orders on the active and reserve engines', async () => {
  const r = await bootControlFocus(true, false, 'fade');
  const records = r.liveLayers().get('item-1')!;
  const priorRects = records.map((record) => mock!.layerRenderedRect(record.slot));
  const [lower] = records;
  const upper = records.at(-1)!;
  const lowerLook = controlLiveLayoutFocusLookId(focusPreset, lower!.sourceId);
  const upperLook = controlLiveLayoutFocusLookId(focusPreset, upper.sourceId);
  expect(lower!.slot.layer).toBeLessThan(upper.slot.layer);
  expect(await r.setActiveLook('item-1', lowerLook, focusMotion)).toEqual({ ok: true });
  const fade: FrameTransition = { motion: 'cut', fade: true, durationMs: 160 };
  const focusBox = { x: 0, y: 0, width: 1, height: 1 };
  const start = (await recvLines()).length;
  const replicaStart = backup!.receivedCommands().length;

  for (const [look, appearing, opacity] of [
    [upperLook, upper, 1],
    [lowerLook, lower!, 0],
  ] as const) {
    const mark = (await recvLines()).length;
    const reserveMark = backup!.receivedCommands().length;
    expect(await r.setActiveLook('item-1', look, fade)).toEqual({ ok: true });
    expect(mock!.layerRenderedRect(appearing.slot)).toEqual(focusBox);
    const lines = (await recvLines()).slice(mark);
    expect(lines.filter((line) => / OPACITY .+ [1-9]\d* linear DEFER$/.test(line))).toEqual([
      'MIXER 1-' + String(upper.slot.layer) + ' OPACITY ' + String(opacity) + ' 4 linear DEFER',
    ]);
    expect(lines.some((line) => / (?:FILL|CLIP) .+ [1-9]\d* linear DEFER$/.test(line))).toBe(false);
    expect(backup!.layerRenderedRect({ channel: 2, layer: appearing.slot.layer })).toEqual(
      focusBox,
    );
    const reserveLines = backup!
      .receivedCommands()
      .slice(reserveMark)
      .map(({ line }) => line);
    expect(reserveLines.filter((line) => / OPACITY .+ [1-9]\d* linear DEFER$/.test(line))).toEqual([
      'MIXER 2-' + String(upper.slot.layer) + ' OPACITY ' + String(opacity) + ' 4 linear DEFER',
    ]);
    expect(reserveLines.some((line) => / (?:FILL|CLIP) .+ [1-9]\d* linear DEFER$/.test(line))).toBe(
      false,
    );
  }

  expect(await r.setActiveLook('item-1', focusPreset, focusMotion)).toEqual({ ok: true });
  expect(r.activeLookId('item-1')).toBe(focusPreset);
  expect(records.map((record) => mock!.layerRenderedRect(record.slot))).toEqual(priorRects);
  expect(
    records.map((record) => backup!.layerRenderedRect({ channel: 2, layer: record.slot.layer })),
  ).toEqual(priorRects);
  expect((await recvLines()).slice(start).some((line) => /^(?:PLAY|CLEAR) /.test(line))).toBe(
    false,
  );
  expect(
    backup!
      .receivedCommands()
      .slice(replicaStart)
      .some(({ line }) => /^(?:PLAY|CLEAR) /.test(line)),
  ).toBe(false);
});

it('uses an explicit Focus input dissolve and Cut in place of authored motion', async () => {
  const r = await bootControlFocus(false, true);
  const upper = r.liveLayers().get('item-1')!.at(-1)!;
  const next = controlLiveLayoutFocusLookId(soloPreset, upper.sourceId);
  const fadeStart = (await recvLines()).length;
  expect(
    await r.setActiveLook('item-1', next, focusMotion, undefined, {
      mode: 'fade',
      durationMs: 160,
    }),
  ).toEqual({ ok: true });
  expect((await recvLines()).slice(fadeStart)).toContain(
    'MIXER 1-' + String(upper.slot.layer) + ' OPACITY 1 4 linear DEFER',
  );

  const cut = controlLiveLayoutFocusLookId(soloPreset, focusFrameIds[0]);
  const cutStart = (await recvLines()).length;
  expect(
    await r.setActiveLook('item-1', cut, focusMotion, undefined, {
      mode: 'cut',
      durationMs: 160,
    }),
  ).toEqual({ ok: true });
  expect(r.activeLookId('item-1')).toBe(cut);
  expect(
    (await recvLines())
      .slice(cutStart)
      .some((line) =>
        / (?:FILL|CLIP|OPACITY) .+ [1-9]\d* (?:linear|easeinoutquad) DEFER$/.test(line),
      ),
  ).toBe(false);
});

it('cuts directly between focused frames without tweening either input', async () => {
  const r = await bootControlFocus(false, true, 'cut');
  const next = controlLiveLayoutFocusLookId(soloPreset, focusFrameIds[1]);
  const cut: FrameTransition = { motion: 'cut', fade: false, durationMs: 160 };
  const start = (await recvLines()).length;
  expect(await r.setActiveLook('item-1', next, cut)).toEqual({ ok: true });
  expect(r.activeLookId('item-1')).toBe(next);
  expect(
    r
      .liveLayers()
      .get('item-1')!
      .filter((record) => record.held !== true),
  ).toMatchObject([{ sourceId: focusFrameIds[1] }]);
  const lines = (await recvLines()).slice(start);
  expect(lines.some((line) => /^(?:PLAY|CLEAR) /.test(line))).toBe(false);
  expect(
    lines.some((line) =>
      / (?:FILL|CLIP|OPACITY) .+ [1-9]\d* (?:linear|easeinoutquad) DEFER$/.test(line),
    ),
  ).toBe(false);
  expect(await r.setActiveLook('item-1', soloPreset, focusMotion)).toEqual({ ok: true });
  expect(r.activeLookId('item-1')).toBe(soloPreset);
});

it('switches directly from a one-frame preset into Control Focus and returns to that preset', async () => {
  const r = await bootControlFocus(false, true);
  expect(r.activeLookId('item-1')).toBe(soloPreset);
  const [original] = r
    .liveLayers()
    .get('item-1')!
    .filter((record) => record.held !== true);
  const originalRect = mock!.layerRenderedRect(original!.slot);
  const destination = controlLiveLayoutFocusLookId(soloPreset, focusFrameIds[1]);
  const mark = (await recvLines()).length;
  expect(
    await r.setActiveLook('item-1', destination, undefined, {
      mode: 'slide-over',
      direction: 'up',
      durationMs: 160,
    }),
  ).toEqual({ ok: true });
  expect(r.activeLookId('item-1')).toBe(destination);
  expect(
    r
      .liveLayers()
      .get('item-1')!
      .filter((record) => record.held !== true),
  ).toMatchObject([{ sourceId: focusFrameIds[1] }]);
  expect((await recvLines()).slice(mark)).toEqual(
    expect.arrayContaining([expect.stringMatching(/MIXER 1-\d+ FILL .+ linear DEFER$/)]),
  );
  expect(await r.setActiveLook('item-1', soloPreset, focusMotion)).toEqual({ ok: true });
  expect(mock!.layerRenderedRect(original!.slot)).toEqual(originalRect);
  expect(r.activeLookId('item-1')).toBe(soloPreset);
});

it('🔴 a declared, assigned plate REACHES AIR — the PLAY, the mute and the fit all on the wire', async () => {
  const r = await boot({ template: template([{ id: 'guest-1', rect: BOX }]) });

  const verdict = await loadAndTake(r);
  expect(verdict.accepted).toBe(true);

  const lines = await recvLines();
  const layer = BAND.start;
  /*
    🔴 `LOOK-SWITCH-01` — the layer is HIDDEN FIRST: `OPACITY 0`, the mute and BOTH halves of the
    fit are committed BEFORE the producer exists, so 6.5's "created MUTED" is now "created on a
    muted, hidden, fitted layer" — and the reveal follows the `PLAY`, in the take's one commit.
    (It was PLAY → mute → fill → clip, with the producer on air at the layer's old transform until
    the commit.)
  */
  const hide = at(lines, `MIXER 1-${String(layer)} OPACITY 0`);
  const mute = at(lines, `MIXER 1-${String(layer)} VOLUME 0`);
  const fill = at(lines, `MIXER 1-${String(layer)} FILL `);
  const clip = at(lines, `MIXER 1-${String(layer)} CLIP `);
  const hideCommit = lines.findIndex((l, i) => i > clip && l === 'MIXER 1 COMMIT');
  const play = at(lines, `PLAY 1-${String(layer)} `);
  const reveal = at(lines, `MIXER 1-${String(layer)} OPACITY 1`);
  expect(play, 'the producer must reach the wire').toBeGreaterThanOrEqual(0);
  expect(mute, '6.5 — every bridge-created producer is created MUTED').toBeGreaterThanOrEqual(0);
  expect(hide).toBeGreaterThanOrEqual(0);
  expect(fill).toBeGreaterThanOrEqual(0);
  expect(clip).toBeGreaterThanOrEqual(0);
  expect(mute).toBeGreaterThan(hide);
  expect(fill).toBeGreaterThan(mute);
  expect(clip).toBeGreaterThan(fill);
  expect(hideCommit, 'the hide is committed before the PLAY').toBeGreaterThan(clip);
  expect(play).toBeGreaterThan(hideCommit);
  expect(reveal, 'and shown only after it').toBeGreaterThan(play);
  // The route address itself — the mapping resolved, not the symbolic id.
  expect(lines[play]).toContain('route://2');
});

it('the plates are seated BEFORE the graphic they belong to plays', async () => {
  // A template landing with its holes still empty is the outcome 6.7's refusal
  // exists to prevent; reaching it by an ordering choice is no better than
  // reaching it by a missing assignment.
  const r = await boot({ template: template([{ id: 'guest-1', rect: BOX }]) });
  await loadAndTake(r);

  const lines = await recvLines();
  const seatedAt = at(lines, `MIXER 1-${String(BAND.start)} CLIP `);
  const playedAt = lines.findIndex((l) => /^CG 1-\d+ PLAY/.test(l));
  expect(playedAt, "the template's own CG PLAY must be on the wire").toBeGreaterThanOrEqual(0);
  expect(seatedAt).toBeGreaterThanOrEqual(0);
  expect(seatedAt).toBeLessThan(playedAt);
});

it('D-201 — an authored foreground pass is paired above every live input and revealed last', async () => {
  const r = await boot({ template: template([{ id: 'guest-1', rect: BOX }], true) });

  const verdict = await loadAndTake(r);
  expect(verdict.accepted).toBe(true);

  const lines = await recvLines();
  const foregroundLayer = BAND.end;
  const backgroundAdd = lines.find(
    (line) =>
      line.startsWith('CG 1-') && line.includes(' ADD ') && line.includes('cgpass=background'),
  );
  const foregroundAddAt = lines.findIndex(
    (line) =>
      line.startsWith(`CG 1-${String(foregroundLayer)} ADD `) &&
      line.includes('cgpass=foreground') &&
      line.includes('cgsync=item-1'),
  );
  const foregroundPlayAt = at(lines, `CG 1-${String(foregroundLayer)} PLAY`);
  const platePlayAt = at(lines, `PLAY 1-${String(BAND.start)} `);
  const backgroundPlayAt = lines.findIndex(
    (line) => /^CG 1-\d+ PLAY/.test(line) && !line.startsWith(`CG 1-${String(foregroundLayer)} `),
  );
  const revealAt = at(lines, `MIXER 1-${String(foregroundLayer)} OPACITY 1`);

  expect(backgroundAdd).toContain('cgsync=item-1');
  const pairedAdds = lines.filter((line) => line.includes(' ADD ') && line.includes('cgpass='));
  expect(pairedAdds).toHaveLength(2);
  expect(
    pairedAdds.filter((line) => line.includes('take')),
    'only the background page may own the completion take token',
  ).toHaveLength(1);
  expect(foregroundAddAt).toBeGreaterThanOrEqual(0);
  expect(foregroundPlayAt).toBeGreaterThan(foregroundAddAt);
  expect(platePlayAt).toBeGreaterThan(foregroundPlayAt);
  expect(backgroundPlayAt).toBeGreaterThan(platePlayAt);
  expect(revealAt).toBeGreaterThan(backgroundPlayAt);
  expect(foregroundLayer).toBeGreaterThan(BAND.start);
});

it('R-108 — a retake after Reload prepares the matching foreground and background pages', async () => {
  const info = template([{ id: 'guest-1', rect: BOX }], true);
  const r = await boot({ template: info });
  expect((await loadAndTake(r)).accepted).toBe(true);
  expect((await r.stopItem('item-1')).accepted).toBe(true);
  expect(
    r.templateImport(info, '<!doctype html><html><body>new page</body></html>').registered,
  ).toBe(true);
  const newUrl = r.templateServeUrl(info.templateId, 1);
  const cg = defaultHandlers().get('CG');
  if (mock === null || cg === undefined || newUrl === null) throw new Error('no CG fixture');
  mock.setHandler('CG', (request, context, connection) => {
    // The background URL is already pinned. A second console can reload at this instant.
    if (request.raw.includes(' ADD 0 ') && request.raw.includes('cgpass=background')) {
      r.templateImport(info, '<!doctype html><html><body>concurrent reload</body></html>');
    }
    return cg(request, context, connection);
  });
  const before = (await recvLines()).length;

  expect((await r.take('item-1')).accepted).toBe(true);
  expect(r.templateServeUrl(info.templateId, 1)).not.toBe(newUrl);
  const lines = (await recvLines()).slice(before);
  const adds = lines.filter((line) => line.includes(' ADD 0 ') && line.includes(newUrl));
  expect(adds).toHaveLength(2);
  expect(adds[0]).toContain('cgpass=background');
  expect(adds[1]).toContain('cgpass=foreground');
  const foregroundHide = at(lines, `MIXER 1-${String(BAND.end)} OPACITY 0`);
  const foregroundAdd = lines.indexOf(adds[1] ?? '');
  expect(foregroundHide).toBeGreaterThanOrEqual(0);
  expect(foregroundAdd).toBeGreaterThan(foregroundHide);
  expect(at(lines, `MIXER 1-${String(BAND.end)} OPACITY 1`)).toBeGreaterThan(foregroundAdd);
});

it('D-201 — the extra foreground layer is admitted atomically before any take wire', async () => {
  const r = await boot({
    template: template([{ id: 'guest-1', rect: BOX }], true),
    catalog: catalog({ layerRange: { start: 30, end: 30 } }),
  });
  await r.load('item-1', 'lower-third', {});
  const before = (await recvLines()).length;

  const verdict = await r.take('item-1');

  expect(verdict).toMatchObject({ accepted: false, errorCode: 'live-source-no-layer' });
  expect((await recvLines()).slice(before)).toEqual([]);
});

it('D-201 — Clear removes the live input, foreground pass and background page in that order', async () => {
  const r = await boot({ template: template([{ id: 'guest-1', rect: BOX }], true) });
  await loadAndTake(r);
  const before = (await recvLines()).length;

  expect((await r.out('item-1')).accepted).toBe(true);

  const lines = (await recvLines()).slice(before);
  const plateClear = lines.indexOf(`CLEAR 1-${String(BAND.start)}`);
  const foregroundClear = lines.indexOf(`CLEAR 1-${String(BAND.end)}`);
  const backgroundClear = lines.findIndex((line) => /^CLEAR 1-1\d$/.test(line));
  expect(plateClear).toBeGreaterThanOrEqual(0);
  expect(foregroundClear).toBeGreaterThan(plateClear);
  expect(backgroundClear).toBeGreaterThan(foregroundClear);
});

it('the ledger records the layer, the plate and the producer ARGUMENT that was sent', async () => {
  const r = await boot({ template: template([{ id: 'guest-1', rect: BOX }]) });
  await loadAndTake(r);

  const records = r.liveLayers().get('item-1');
  expect(records).toHaveLength(1);
  const record = records?.[0];
  expect(record?.slot).toEqual({ channel: 1, layer: BAND.start });
  expect(record?.sourceId).toBe('guest-1');
  expect(record?.role).toBe('fill');
  // As SENT, so the ledger cannot claim one address while the layer carries
  // another — it is built by the same function `playSource` uses.
  expect(record?.producer).toBe('"route://2"');
  const lines = await recvLines();
  expect(lines[at(lines, `PLAY 1-${String(BAND.start)} `)]).toBe(
    `PLAY 1-${String(BAND.start)} ${record?.producer ?? ''}`,
  );
});

it('the geometry that LANDS is the computed fit, and a 16:9 source in a 16:9 hole is not cropped', async () => {
  const r = await boot({ template: template([{ id: 'guest-1', rect: BOX }]) });
  await loadAndTake(r);

  const state = mock?.layerState({ channel: 1, layer: BAND.start });
  expect(state?.fill).toEqual({ x: 0.25, y: 0.25, width: 0.5, height: 0.5 });
  expect(state?.clip).toEqual({ x: 0.25, y: 0.25, width: 0.5, height: 0.5 });
});

it('D-202 — each reveal seats a silent lower copy above the upper plate', async () => {
  const reveal = {
    targetSourceId: 'lower',
    rect: { x: 0.1, y: 0.5, width: 0.8, height: 0.4 },
    additionalRects: [{ x: 0.2, y: 0.1, width: 0.6, height: 0.2 }],
  };
  const r = await boot({
    template: template([
      { id: 'upper', rect: BOX, revealMask: reveal },
      { id: 'lower', rect: BOX },
    ]),
    catalog: catalog({ layerRange: { start: 30, end: 33 } }),
    assignments: assign([
      ['upper', 'src-b'],
      ['lower', 'src-a'],
    ]),
  });

  expect((await loadAndTake(r)).accepted).toBe(true);
  const records = r.liveLayers().get('item-1') ?? [];
  expect(records.map((record) => record.sourceId)).toEqual(['lower', 'upper', 'lower', 'lower']);
  expect(records.map((record) => record.slot.layer)).toEqual([30, 31, 32, 33]);
  for (const overlay of records.slice(2)) {
    expect(overlay).toMatchObject({
      revealOverlay: true,
      intendedVolume: 0,
      audioLocked: true,
      fill: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 },
    });
  }
  expect(records[2]?.seatId).toMatch(/reveal:upper$/);
  expect(records[3]?.seatId).toMatch(/reveal:upper:1$/);
  expect(mock?.layerState({ channel: 1, layer: 32 })?.clip).toEqual({
    x: 0.3,
    y: 0.5,
    width: 0.4,
    height: 0.2,
  });
  expect(mock?.layerState({ channel: 1, layer: 33 })?.clip).toEqual({
    x: 0.35,
    y: 0.3,
    width: 0.3,
    height: 0.1,
  });
  expect((await recvLines()).filter((line) => line.includes('"route://2"'))).toHaveLength(3);
});

it('D-202 — switching to a masked look seats the reveal and retains the foreground page', async () => {
  const right = { ...BOX, x: 960 };
  const info = template(
    [
      { id: 'lower', rect: BOX },
      { id: 'upper', rect: right },
    ],
    true,
  );
  const sources = info.liveSources!;
  const r = await boot({
    template: {
      ...info,
      liveSources: {
        ...sources,
        defaultLookId: 'split',
        looks: [
          {
            id: 'split',
            name: 'Split',
            entered: { mode: 'cut' },
            rects: { lower: BOX, upper: right },
          },
          {
            id: 'masked',
            name: 'Masked',
            entered: { mode: 'cut' },
            rects: { lower: BOX, upper: BOX },
            reveals: {
              upper: {
                targetSourceId: 'lower',
                rect: { x: 0, y: 0.7, width: 1, height: 0.25 },
              },
            },
          },
        ],
      },
    },
    catalog: catalog({ layerRange: { start: 30, end: 36 } }),
    assignments: assign([
      ['lower', 'src-a'],
      ['upper', 'src-b'],
    ]),
  });
  expect(await loadAndTake(r)).toMatchObject({ accepted: true });
  const before = (await recvLines()).length;
  const switched = await r.setActiveLook('item-1', 'masked');
  const lines = (await recvLines()).slice(before);
  expect(switched, JSON.stringify({ switched, lines }, null, 2)).toMatchObject({ ok: true });
  expect(lines).toContain('MIXER 1-32 CLIP 0.25 0.6 0.5 0.125 DEFER');
  expect(lines).not.toContain('CLEAR 1-36');
});

it('takes an opted-in overlapping layout in authored order and keeps the foreground above it', async () => {
  const info = template(
    [
      { id: 'upper', rect: BOX },
      { id: 'lower', rect: BOX },
    ],
    true,
  );
  const r = await boot({
    template: {
      ...info,
      liveSources: { ...info.liveSources!, platePaintOrder: ['lower', 'upper'] },
    },
    assignments: assign([
      ['upper', 'src-b'],
      ['lower', 'src-a'],
    ]),
  });

  expect(await loadAndTake(r)).toMatchObject({ accepted: true });
  expect(await recvLines()).toEqual(
    expect.arrayContaining([
      expect.stringMatching(/^PLAY 1-30 "route:\/\/2"/),
      expect.stringMatching(/^PLAY 1-31 "route:\/\/3"/),
      expect.stringMatching(/^CG 1-32 ADD /),
    ]),
  );
});

it('seats inputs for a future overlapping Look without replaying them when that Look is entered', async () => {
  const right = { x: 1440, y: 270, width: 480, height: 270 };
  const info = template([
    { id: 'upper', rect: right },
    { id: 'lower', rect: BOX },
  ]);
  const r = await boot({
    template: {
      ...info,
      liveSources: {
        ...info.liveSources!,
        defaultLookId: 'split',
        looks: [
          {
            id: 'split',
            name: 'Split',
            entered: { mode: 'cut' },
            rects: { lower: BOX, upper: right },
            platePaintOrder: ['upper', 'lower'],
          },
          {
            id: 'overlap',
            name: 'Overlap',
            entered: { mode: 'cut' },
            rects: { lower: BOX, upper: BOX },
            platePaintOrder: ['lower', 'upper'],
          },
        ],
      },
    },
    assignments: assign([
      ['upper', 'src-b'],
      ['lower', 'src-a'],
    ]),
  });

  expect(await loadAndTake(r)).toMatchObject({ accepted: true });
  const before = await recvLines();
  expect(before).toEqual(
    expect.arrayContaining([
      expect.stringMatching(/^PLAY 1-30 "route:\/\/2"/),
      expect.stringMatching(/^PLAY 1-31 "route:\/\/3"/),
    ]),
  );
  expect(await r.setActiveLook('item-1', 'overlap')).toMatchObject({ ok: true });
  const switched = (await recvLines()).slice(before.length);
  expect(switched).toContain('MIXER 1-31 CLIP 0.25 0.25 0.5 0.5 DEFER');
  expect(switched.some((line) => /^(?:PLAY|CLEAR|CG \S+ ADD) /.test(line))).toBe(false);
});

it('refuses a conflicting authored overlap order across Looks before sending any command', async () => {
  const info = template([
    { id: 'upper', rect: BOX },
    { id: 'lower', rect: BOX },
  ]);
  const r = await boot({
    template: {
      ...info,
      liveSources: {
        ...info.liveSources!,
        defaultLookId: 'one',
        looks: [
          {
            id: 'one',
            name: 'One',
            entered: { mode: 'cut' },
            rects: { lower: BOX, upper: BOX },
            platePaintOrder: ['lower', 'upper'],
          },
          {
            id: 'two',
            name: 'Two',
            entered: { mode: 'cut' },
            rects: { lower: BOX, upper: BOX },
            platePaintOrder: ['upper', 'lower'],
          },
        ],
      },
    },
    assignments: assign([
      ['upper', 'src-b'],
      ['lower', 'src-a'],
    ]),
  });

  await r.load('item-1', 'lower-third', {});
  const before = await recvLines();
  expect(await r.take('item-1')).toMatchObject({
    accepted: false,
    errorCode: 'live-source-layer-order',
    message: expect.stringContaining('authored overlap order'),
  });
  expect(await recvLines()).toEqual(before);
});

it('keeps linked reveal copies below a later overlapping plate', async () => {
  const info = template([
    { id: 'top', rect: BOX },
    {
      id: 'upper',
      rect: BOX,
      revealMask: {
        targetSourceId: 'lower',
        rect: { x: 0.1, y: 0.5, width: 0.8, height: 0.4 },
      },
    },
    { id: 'lower', rect: BOX },
  ]);
  const r = await boot({
    template: {
      ...info,
      liveSources: { ...info.liveSources!, platePaintOrder: ['lower', 'upper', 'top'] },
    },
    catalog: catalog({ layerRange: { start: 30, end: 33 } }),
    assignments: assign([
      ['top', 'src-c'],
      ['upper', 'src-b'],
      ['lower', 'src-a'],
    ]),
  });

  expect(await loadAndTake(r)).toMatchObject({ accepted: true });
  const records = r.liveLayers().get('item-1') ?? [];
  expect(records.find((record) => record.revealOverlay)).toMatchObject({
    slot: { layer: 32 },
    intendedVolume: 0,
  });
  expect(records.find((record) => record.sourceId === 'top')).toMatchObject({
    slot: { layer: 33 },
  });
});

it('D-178 — PGM drag pans a live cover input without replaying it or changing the crop box', async () => {
  const rect = { x: 720, y: 270, width: 480, height: 540 };
  const r = await boot({ template: template([{ id: 'guest-1', rect, fitMode: 'cover' }]) });
  expect(await loadAndTake(r)).toMatchObject({ accepted: true });
  const initial = await r.pgmPlateCrop('item-1');
  expect(initial.targets).toMatchObject([
    {
      id: 'guest-1',
      horizontal: true,
      vertical: false,
      areas: [{ x: 0.375, y: 0.25, width: 0.25, height: 0.5 }],
    },
  ]);
  const token = initial.targets[0]!.token;
  const before = (await recvLines()).length;
  expect(await r.pgmPlateCrop('item-1', { token, dx: 0.08, dy: 0.4 })).toMatchObject({ ok: true });
  expect((await recvLines()).slice(before)).toEqual([
    'MIXER 1-30 FILL 0.33 0.25 0.5 0.5 DEFER',
    'MIXER 1-30 CLIP 0.375 0.25 0.25 0.5 DEFER',
    'MIXER 1 COMMIT',
  ]);
  const after = (await recvLines()).length;
  expect(await r.pgmPlateCrop('item-1', { token, dx: -0.1, dy: 0 })).toMatchObject({ ok: false });
  expect((await recvLines()).slice(after)).toEqual([]);
});

it('aligns full plate edges on take and Look switch without altering the crop on legacy pan', async () => {
  const preset2 = {
    'guest-1': { x: 54, y: 238.5, width: 1072, height: 603 },
    'guest-2': { x: 1263, y: 238.5, width: 603, height: 603 },
  };
  const preset3 = {
    'guest-1': { x: 54, y: 116.5, width: 847, height: 847 },
    'guest-2': { x: 1019, y: 116.5, width: 847, height: 847 },
  };
  const info = template([
    { id: 'guest-1', rect: preset2['guest-1'] },
    { id: 'guest-2', rect: preset2['guest-2'], fitMode: 'cover' },
  ]);
  const r = await boot({
    template: {
      ...info,
      liveSources: {
        ...info.liveSources!,
        defaultLookId: 'preset-2',
        looks: [
          {
            id: 'preset-2',
            name: 'Preset 2',
            entered: { mode: 'cut' },
            rects: preset2,
            fits: { 'guest-1': 'contain', 'guest-2': 'cover' },
          },
          {
            id: 'preset-3',
            name: 'Preset 3',
            entered: { mode: 'cut' },
            rects: preset3,
            fits: { 'guest-1': 'cover', 'guest-2': 'cover' },
          },
        ],
      },
    },
    assignments: assign([
      ['guest-1', 'src-a'],
      ['guest-2', 'src-b'],
    ]),
  });

  const expectWireRows = (lines: readonly string[], layer: number, top: number, bottom: number) => {
    for (const verb of ['FILL', 'CLIP']) {
      const prefix = `MIXER 1-${String(layer)} ${verb} `;
      const line = lines.find((candidate) => candidate.startsWith(prefix));
      expect(line).toBeDefined();
      const [, y, , height] = line!.slice(prefix.length).split(' ').map(Number);
      expect(y! * SCENE.height).toBeCloseTo(top, 2);
      expect((y! + height!) * SCENE.height).toBeCloseTo(bottom, 2);
    }
  };
  expect(await loadAndTake(r)).toMatchObject({ accepted: true });
  const taken = await recvLines();
  for (const layer of [30, 31]) expectWireRows(taken, layer, 239, 842);

  expect(await r.setActiveLook('item-1', 'preset-3')).toMatchObject({ ok: true });
  const switched = await recvLines();
  for (const layer of [30, 31]) expectWireRows(switched.slice(taken.length), layer, 117, 964);

  const crop = (await r.pgmPlateCrop('item-1')).targets.find(({ id }) => id === 'guest-2');
  expect(crop).toMatchObject({ horizontal: true, vertical: false });
  expect(await r.pgmPlateCrop('item-1', { token: crop!.token, dx: 0.02, dy: 0.2 })).toMatchObject({
    ok: true,
  });
  const dragged = (await recvLines()).slice(switched.length);
  expectWireRows(dragged, 31, 117, 964);
  expect(dragged.some((line) => line.startsWith('PLAY '))).toBe(false);
});

it('stages PVW framing without AMCP and restores it into the first hidden Take geometry', async () => {
  const itemId = 'item-1';
  const rect = { x: 720, y: 270, width: 480, height: 540 };
  const r = await boot({ template: template([{ id: 'guest-1', rect, fitMode: 'cover' }]) });
  expect(await r.load(itemId, 'lower-third', {})).toMatchObject({ accepted: true });
  const { targets } = r.previewPlateCrop(itemId);
  expect(targets).toMatchObject([
    { plateId: 'guest-1', sourceId: 'src-a', sourceAspect: 16 / 9, focus: { x: 0.5, y: 0.5 } },
  ]);
  const edit = { token: targets[0]!.token, focus: { x: 1, y: 0.5 } };
  expect(r.previewPlateCrop(itemId, edit).ok).toBe(false);
  expect(await r.enterRehearse(itemId)).toMatchObject({ ok: true });
  const beforeEdit = (await recvLines()).length;
  expect(r.previewPlateCrop(itemId, edit)).toMatchObject({
    ok: true,
    targets: [{ ...targets[0], focus: edit.focus }],
  });
  expect(await r.take(itemId)).toMatchObject({ accepted: false, errorCode: 'rehearsing' });
  expect((await recvLines()).slice(beforeEdit)).toEqual([]);
  expect(await r.exitRehearse(itemId)).toMatchObject({ ok: true });

  const retained = RetainedStackItemSchema.parse(retainedFromStackItem(r.stackSnapshot()[0]!));
  expect(retained.previewPlateCrops).toEqual([edit]);
  expect(await r.remove(itemId)).toMatchObject({ accepted: true });
  expect(await r.restore([retained])).toMatchObject({ restored: 1 });
  expect(r.previewPlateCrop(itemId).targets).toMatchObject([{ ...targets[0], focus: edit.focus }]);

  const beforeTake = (await recvLines()).length;
  expect(await r.take(itemId)).toMatchObject({ accepted: true });
  const lines = (await recvLines()).slice(beforeTake);
  const fill = at(lines, 'MIXER 1-30 FILL 0.125 0.25 0.5 0.5 DEFER');
  const clip = at(lines, 'MIXER 1-30 CLIP 0.375 0.25 0.25 0.5 DEFER');
  const hideCommit = lines.findIndex((line, index) => index > clip && line === 'MIXER 1 COMMIT');
  const play = at(lines, 'PLAY 1-30 ');
  expect(fill).toBeGreaterThan(at(lines, 'MIXER 1-30 OPACITY 0'));
  expect(clip).toBeGreaterThan(fill);
  expect(hideCommit).toBeGreaterThan(clip);
  expect(play).toBeGreaterThan(hideCommit);
  expect(r.previewPlateCrop(itemId, edit)).toMatchObject({ ok: false, targets: [] });
});

it('keeps the authored crop when permission is disabled and refuses cached operator targets on Preview and Programme', async () => {
  const itemId = 'item-1';
  const rect = { x: 720, y: 270, width: 480, height: 540 };
  const base = template([{ id: 'guest-1', rect, fitMode: 'cover' }]);
  const authored = { x: 0.2, y: 0.5 };
  const live = base.liveSources!;
  const withPermission = (allowOperatorCrop?: boolean): TemplateInfo => ({
    ...base,
    liveSources: {
      ...live,
      sources: live.sources.map((source) => ({
        ...source,
        allowOperatorCrop,
        cropFocus: authored,
      })),
    },
  });
  const runtime = await boot({ template: withPermission() });
  expect(await runtime.load(itemId, 'lower-third', {})).toMatchObject({ accepted: true });
  expect(runtime.enterPreview(itemId)).toEqual({ ok: true });
  const [target] = runtime.previewPlateCrop(itemId).targets;
  expect(target?.focus).toEqual(authored);
  const edit = { token: target!.token, focus: { x: 0.9, y: 0.5 } };
  expect(runtime.previewPlateCrop(itemId, undefined, [edit])).toMatchObject({ ok: true });
  expect(runtime.stackSnapshot()[0]?.previewPlateCrops).toEqual([edit]);

  expect(runtime.templateImport(withPermission(false), '<html>Locked crop</html>').registered).toBe(
    true,
  );
  expect(runtime.previewPlateCrop(itemId)).toMatchObject({ ok: true, targets: [] });
  expect(runtime.previewPlateCrop(itemId, undefined, [edit])).toMatchObject({ ok: false });
  const beforeTake = (await recvLines()).length;
  expect(await runtime.take(itemId)).toMatchObject({ accepted: true });
  expect((await recvLines()).slice(beforeTake)).toContain(
    'MIXER 1-30 FILL 0.325 0.25 0.5 0.5 DEFER',
  );

  const beforeEdit = (await recvLines()).length;
  expect(await runtime.previewPlateCropOnAir(itemId)).toEqual({ ok: true, targets: [] });
  expect(await runtime.previewPlateCropOnAir(itemId, [edit])).toMatchObject({ ok: false });
  expect(await runtime.pgmPlateCrop(itemId)).toEqual({ ok: true, targets: [] });
  expect(await runtime.pgmPlateCrop(itemId, { token: edit.token, dx: 0.05, dy: 0 })).toMatchObject({
    ok: false,
  });
  expect((await recvLines()).slice(beforeEdit)).toEqual([]);
});

it('saves a resized matching-aspect PVW crop and uses it for the first hidden FILL', async () => {
  const itemId = 'item-1';
  const rect = { x: 720, y: 270, width: 480, height: 270 };
  const r = await boot({ template: template([{ id: 'guest-1', rect, fitMode: 'cover' }]) });
  expect(await r.load(itemId, 'lower-third', {})).toMatchObject({ accepted: true });
  const [target] = r.previewPlateCrop(itemId).targets;
  expect(target).toMatchObject({
    sourceAspect: 16 / 9,
    resizable: true,
    focus: { x: 0.5, y: 0.5 },
  });
  const token = target!.token;
  const beforeUpdate = (await recvLines()).length;
  const edit = { token, focus: { x: 0.25, y: 0.75, zoom: 2 } };
  expect(r.enterPreview(itemId)).toEqual({ ok: true });
  expect(r.previewPlateCrop(itemId, edit)).toMatchObject({ ok: false });
  expect(r.stackSnapshot()[0]?.previewPlateCrops).toBeUndefined();
  expect(r.previewPlateCrop(itemId, undefined, [edit])).toMatchObject({
    ok: true,
    applied: [token],
  });
  expect((await recvLines()).slice(beforeUpdate)).toEqual([]);

  const retained = RetainedStackItemSchema.parse(retainedFromStackItem(r.stackSnapshot()[0]!));
  expect(retained.previewPlateCrops).toEqual([edit]);
  expect(await r.remove(itemId)).toMatchObject({ accepted: true });
  expect(await r.restore([retained])).toMatchObject({ restored: 1 });
  expect(r.previewPlateCrop(itemId).targets).toMatchObject([{ ...target, focus: edit.focus }]);
  // A legacy position-only update must not discard the stored resize.
  expect(
    r.previewPlateCrop(itemId, undefined, [{ token, focus: { x: 0.5, y: 0.75 } }]),
  ).toMatchObject({
    ok: true,
    targets: [{ focus: { x: 0.5, y: 0.75, zoom: 2 } }],
  });

  const beforeTake = (await recvLines()).length;
  expect(r.enterPreview(itemId)).toEqual({ ok: true });
  expect(await r.take(itemId)).toMatchObject({ accepted: true });
  expect(r.rehearseState()).toEqual([expect.objectContaining({ itemId, previewOnly: true })]);
  expect(r.previewPlateCrop(itemId, undefined, [edit])).toMatchObject({ ok: false, targets: [] });
  const lines = (await recvLines()).slice(beforeTake);
  const fill = at(lines, 'MIXER 1-30 FILL 0.25 0.0625 0.5 0.5 DEFER');
  const clip = at(lines, 'MIXER 1-30 CLIP 0.375 0.25 0.25 0.25 DEFER');
  expect(fill).toBeGreaterThan(at(lines, 'MIXER 1-30 OPACITY 0'));
  expect(clip).toBeGreaterThan(fill);
  expect(at(lines, 'PLAY 1-30 ')).toBeGreaterThan(clip);
});

it('scopes a staged PVW crop to the active look, source and row', async () => {
  const rect = { x: 720, y: 270, width: 480, height: 540 };
  const info = template([{ id: 'guest-1', rect, fitMode: 'cover' }]);
  const r = await boot({
    template: {
      ...info,
      liveSources: {
        ...info.liveSources!,
        defaultLookId: 'first',
        looks: [
          {
            id: 'first',
            name: 'First',
            entered: { mode: 'cut' },
            rects: { 'guest-1': rect },
            fits: { 'guest-1': 'cover' },
          },
          {
            id: 'second',
            name: 'Second',
            entered: { mode: 'cut' },
            rects: { 'guest-1': rect },
            fits: { 'guest-1': 'cover' },
          },
        ],
      },
    },
  });
  await r.load('item-1', 'lower-third', {});
  await r.load('item-2', 'lower-third', {});
  expect(await r.enterRehearse('item-1')).toMatchObject({ ok: true });
  expect(await r.enterRehearse('item-2')).toMatchObject({ ok: true });
  const [first] = r.previewPlateCrop('item-1').targets;
  const edit = { token: first!.token, focus: { x: 1, y: 0.5 } };
  expect(r.previewPlateCrop('item-1', edit).ok).toBe(true);
  expect(r.previewPlateCrop('item-2', edit)).toMatchObject({
    ok: false,
    targets: [{ focus: { x: 0.5, y: 0.5 } }],
  });

  expect(await r.setActiveLook('item-1', 'second')).toMatchObject({ ok: true });
  expect(r.previewPlateCrop('item-1', edit)).toMatchObject({
    ok: false,
    targets: [{ focus: { x: 0.5, y: 0.5 } }],
  });
  expect(await r.setActiveLook('item-1', 'first')).toMatchObject({ ok: true });
  expect(r.setSourceAssignments(assign([['guest-1', 'src-b']]))).toMatchObject({ ok: true });
  expect(r.previewPlateCrop('item-1', edit)).toMatchObject({
    ok: false,
    targets: [{ sourceId: 'src-b', focus: { x: 0.5, y: 0.5 } }],
  });
  expect(r.setSourceAssignments(assign([['guest-1', 'src-a']]))).toMatchObject({ ok: true });
  expect(r.previewPlateCrop('item-1').targets).toMatchObject([{ ...first, focus: edit.focus }]);
  expect(r.setSourceAssignments(assign([['guest-1', 'src-b']]))).toMatchObject({ ok: true });
  expect(await r.exitRehearse('item-1')).toMatchObject({ ok: true });
  const beforeTake = (await recvLines()).length;
  expect(await r.take('item-1')).toMatchObject({ accepted: true });
  expect(
    (await recvLines()).slice(beforeTake).find((line) => line.startsWith('MIXER 1-30 FILL')),
  ).toBe('MIXER 1-30 FILL 0.25 0.25 0.5 0.5 DEFER');
});

it('does not offer staging for cover overflow based only on the authored source aspect', async () => {
  const rect = { x: 720, y: 270, width: 480, height: 540 };
  const r = await boot({
    template: template([{ id: 'guest-1', rect, expectedAspect: 16 / 9, fitMode: 'cover' }]),
    catalog: catalog({
      sources: [
        {
          id: 'src-a',
          name: 'Unknown aspect',
          format: 'AUTO',
          producer: { kind: 'route', channel: 2 },
        },
      ],
    }),
  });
  await r.load('item-1', 'lower-third', {});
  expect(r.previewPlateCrop('item-1')).toEqual({ ok: true, targets: [] });
});

it('updates PVW crop drafts atomically across presets after leaving Preview', async () => {
  const itemId = 'item-1';
  const rect = { x: 720, y: 270, width: 480, height: 540 };
  const info = template([{ id: 'guest-1', rect, fitMode: 'cover' }]);
  const r = await boot({
    template: {
      ...info,
      liveSources: {
        ...info.liveSources!,
        defaultLookId: 'first',
        looks: ['first', 'second'].map((id) => ({
          id,
          name: id,
          entered: { mode: 'cut' as const },
          rects: { 'guest-1': rect },
          fits: { 'guest-1': 'cover' as const },
        })),
      },
    },
  });
  expect(await r.load(itemId, 'lower-third', {})).toMatchObject({ accepted: true });
  expect(await r.enterRehearse(itemId)).toMatchObject({ ok: true });
  const [first] = r.previewPlateCrop(itemId).targets;
  expect(await r.setActiveLook(itemId, 'second')).toMatchObject({ ok: true });
  const [second] = r.previewPlateCrop(itemId).targets;
  expect(await r.exitRehearse(itemId)).toMatchObject({ ok: true });
  const firstEdit = { lookId: 'first', token: first!.token, focus: { x: 1, y: 0.5 } };
  const secondEdit = { lookId: 'second', token: second!.token, focus: { x: 0.25, y: 0.5 } };
  const beforeUpdate = (await recvLines()).length;

  const stale = r.previewPlateCrop(itemId, undefined, [
    firstEdit,
    { ...secondEdit, lookId: 'first' },
  ]);
  expect(stale).toMatchObject({ ok: false });
  expect(stale.applied).toBeUndefined();
  expect(r.stackSnapshot()[0]?.previewPlateCrops).toBeUndefined();
  const applied = r.previewPlateCrop(itemId, undefined, [firstEdit, secondEdit]);
  expect(applied).toMatchObject({
    ok: true,
    applied: [firstEdit.token, secondEdit.token],
    targets: [{ ...second, focus: secondEdit.focus, staged: true }],
  });
  expect(r.stackSnapshot()[0]?.previewPlateCrops).toEqual([
    { token: firstEdit.token, focus: firstEdit.focus },
    { token: secondEdit.token, focus: secondEdit.focus },
  ]);
  expect(await r.setActiveLook(itemId, 'first')).toMatchObject({ ok: true });
  expect(r.previewPlateCrop(itemId).targets).toMatchObject([
    { ...first, focus: firstEdit.focus, staged: true },
  ]);
  expect((await recvLines()).slice(beforeUpdate)).toEqual([]);

  expect(await r.take(itemId)).toMatchObject({ accepted: true });
  const firstFill = (await recvLines())
    .slice(beforeUpdate)
    .find((line) => line.startsWith('MIXER 1-30 FILL'));
  expect(firstFill).toBe('MIXER 1-30 FILL 0.125 0.25 0.5 0.5 DEFER');
  expect(r.previewPlateCrop(itemId, undefined, [firstEdit])).toMatchObject({
    ok: false,
    targets: [],
  });
});

it('applies a PVW crop batch to the already seated plates only on Inspector Update', async () => {
  const itemId = 'item-1';
  const r = await boot({
    template: template([
      { id: 'guest-1', rect: { x: 720, y: 270, width: 480, height: 270 }, fitMode: 'cover' },
      { id: 'guest-2', rect: { x: 1200, y: 540, width: 480, height: 270 }, fitMode: 'cover' },
    ]),
    assignments: assign([
      ['guest-1', 'src-a'],
      ['guest-2', 'src-b'],
    ]),
  });
  expect(await r.load(itemId, 'lower-third', {})).toMatchObject({ accepted: true });
  expect(r.enterPreview(itemId)).toEqual({ ok: true });
  const [first, second] = r.previewPlateCrop(itemId).targets;
  expect(first?.plateId).toBe('guest-1');
  expect(second?.plateId).toBe('guest-2');
  const edits = [
    { token: first!.token, focus: { x: 0.25, y: 0.75, zoom: 2 } },
    { token: second!.token, focus: { x: 0.75, y: 0.25, zoom: 2 } },
  ];
  expect(await r.take(itemId)).toMatchObject({ accepted: true });
  const before = (await recvLines()).length;

  expect(r.previewPlateCrop(itemId, undefined, edits)).toMatchObject({ ok: false, targets: [] });
  expect(await r.previewPlateCropOnAir(itemId)).toEqual({ ok: true, targets: [first, second] });
  expect(
    await r.previewPlateCropOnAir(itemId, [edits[0]!, { ...edits[1]!, token: 'stale' }]),
  ).toMatchObject({ ok: false });
  expect(r.stackSnapshot()[0]?.previewPlateCrops).toBeUndefined();
  expect((await recvLines()).slice(before)).toEqual([]);

  expect(await r.previewPlateCropOnAir(itemId, edits)).toMatchObject({
    ok: true,
    applied: edits.map(({ token }) => token),
  });
  expect((await recvLines()).slice(before)).toEqual([
    'MIXER 1-30 FILL 0.3125 0.0625 0.5 0.5',
    'MIXER 1-31 FILL 0.4375 0.4375 0.5 0.5',
  ]);
  expect(mock?.layerState({ channel: 1, layer: 30 })?.fill).toEqual({
    x: 0.3125,
    y: 0.0625,
    width: 0.5,
    height: 0.5,
  });
  expect(r.stackSnapshot()[0]?.previewPlateCrops).toEqual(edits);

  expect(await r.stopItem(itemId)).toMatchObject({ accepted: true });
  const stopped = (await recvLines()).length;
  expect(await r.previewPlateCropOnAir(itemId, edits)).toMatchObject({ ok: false, targets: [] });
  expect((await recvLines()).slice(stopped)).toEqual([]);
});

it('does not save a new on-air crop when the engine refuses the mixer edit', async () => {
  const itemId = 'item-1';
  const r = await boot({
    template: template([
      { id: 'guest-1', rect: { x: 720, y: 270, width: 480, height: 270 }, fitMode: 'cover' },
      { id: 'guest-2', rect: { x: 1200, y: 540, width: 480, height: 270 }, fitMode: 'cover' },
    ]),
    assignments: assign([
      ['guest-1', 'src-a'],
      ['guest-2', 'src-b'],
    ]),
  });
  expect(await loadAndTake(r, itemId)).toMatchObject({ accepted: true });
  const { targets } = await r.previewPlateCropOnAir(itemId);
  expect(targets).toHaveLength(2);
  const prior = mock?.layerState({ channel: 1, layer: 30 })?.fill;
  const mixer = defaultHandlers().get('MIXER');
  if (mock === null || mixer === undefined || prior === undefined)
    throw new Error('no mixer fixture');
  let refused = false;
  mock.setHandler('MIXER', (request, context, connection) => {
    if (!refused && request.raw.startsWith('MIXER 1-31 FILL ')) {
      refused = true;
      return { kind: 'err', code: 502, verb: 'MIXER' };
    }
    return mixer(request, context, connection);
  });

  expect(
    await r.previewPlateCropOnAir(
      itemId,
      targets.map(({ token }) => ({ token, focus: { x: 1, y: 0.5, zoom: 2 } })),
    ),
  ).toMatchObject({ ok: false, targets });
  expect(refused).toBe(true);
  expect(r.stackSnapshot()[0]?.previewPlateCrops).toBeUndefined();
  expect(mock.layerState({ channel: 1, layer: 30 })?.fill).toEqual(prior);
});

it('resets a seated crop to authored framing and drops saved Pan only after the mixer ACK', async () => {
  const itemId = 'item-1';
  const authored = { x: 0.2, y: 0.5 };
  const info = template([
    { id: 'guest-1', rect: { x: 720, y: 270, width: 480, height: 540 }, fitMode: 'cover' },
  ]);
  const live = info.liveSources;
  if (live === undefined) throw new Error('Missing crop carrier');
  const withFocus = (cropFocus: { x: number; y: number }) => ({
    ...info,
    liveSources: {
      ...live,
      sources: live.sources.map((source) => ({ ...source, cropFocus })),
    },
  });
  const r = await boot({ template: withFocus(authored) });
  expect(await loadAndTake(r, itemId)).toMatchObject({ accepted: true });
  const slot = { channel: 1, layer: 30 };
  const initial = mock?.layerState(slot);
  const [target] = (await r.previewPlateCropOnAir(itemId)).targets;
  const mixer = defaultHandlers().get('MIXER');
  if (mock === null || target === undefined || mixer === undefined || initial === undefined)
    throw new Error('no crop fixture');
  const saved = { token: target.token, focus: { x: 0.8, y: 0.3, zoom: 2 } };
  expect(await r.previewPlateCropOnAir(itemId, [saved])).toMatchObject({ ok: true });
  const [legacy] = (await r.pgmPlateCrop(itemId)).targets;
  if (legacy === undefined) throw new Error('no legacy Pan target');
  expect(await r.pgmPlateCrop(itemId, { token: legacy.token, dx: 0.03, dy: 0 })).toMatchObject({
    ok: true,
  });
  const priorFill = mock.layerState(slot)?.fill;
  expect(priorFill).not.toEqual(initial.fill);
  expect(r.stackSnapshot()[0]?.previewPlateCrops).toEqual([saved]);

  const reset = { ...saved, reset: true as const };
  const changedFocus = withFocus({ ...authored, x: 0.4 });
  expect(r.templateImport(changedFocus, '<html>Revised crop</html>').registered).toBe(true);
  const beforeRefusal = (await recvLines()).length;
  expect(await r.previewPlateCropOnAir(itemId, [reset])).toMatchObject({
    ok: false,
    message: 'The listed template has different live framing. Take it before resetting its crop.',
  });
  expect((await recvLines()).slice(beforeRefusal)).toEqual([]);
  expect(mock.layerState(slot)?.fill).toEqual(priorFill);
  expect(r.templateImport(withFocus(authored), '<html>Revised artwork</html>').registered).toBe(
    true,
  );

  let refused = false;
  mock.setHandler('MIXER', (request, context, connection) => {
    if (!refused && request.raw.startsWith('MIXER 1-30 FILL ')) {
      refused = true;
      return { kind: 'err', code: 502, verb: 'MIXER' };
    }
    return mixer(request, context, connection);
  });
  expect(await r.previewPlateCropOnAir(itemId, [reset])).toMatchObject({ ok: false });
  expect(refused).toBe(true);
  expect(mock.layerState(slot)?.fill).toEqual(priorFill);
  expect(r.stackSnapshot()[0]?.previewPlateCrops).toEqual([saved]);

  const before = (await recvLines()).length;
  expect(await r.previewPlateCropOnAir(itemId, [reset])).toMatchObject({
    ok: true,
    applied: [target.token],
    targets: [{ focus: { ...authored, zoom: 1 }, staged: false }],
  });
  expect((await recvLines()).slice(before)).toEqual([expect.stringMatching(/^MIXER 1-30 FILL /)]);
  expect(mock.layerState(slot)).toMatchObject({ fill: initial.fill, clip: initial.clip });
  expect(r.stackSnapshot()[0]?.previewPlateCrops).toBeUndefined();
  expect((await r.previewPlateCropOnAir(itemId)).targets[0]?.focus).toEqual(authored);
});

it('resets a saved off-air crop only for its named Look', async () => {
  const itemId = 'item-1';
  const info = template([{ id: 'guest-1', rect: BOX, fitMode: 'cover' }]);
  const authored = { x: 0.3, y: 0.4, zoom: 1.4 };
  const r = await boot({
    template: {
      ...info,
      liveSources: {
        ...info.liveSources!,
        defaultLookId: 'one',
        looks: ['one', 'two'].map((id) => ({
          id,
          name: id,
          entered: { mode: 'cut' as const },
          rects: { 'guest-1': BOX },
          fits: { 'guest-1': 'cover' as const },
          focuses: { 'guest-1': authored },
        })),
      },
    },
  });
  await r.load(itemId, 'lower-third', {});
  const focus = { x: 1, y: 0, zoom: 2 };
  const [first] = r.previewPlateCrop(itemId).targets;
  await r.setActiveLook(itemId, 'two');
  const [second] = r.previewPlateCrop(itemId).targets;
  if (first === undefined || second === undefined) throw new Error('no Look crop targets');
  const before = await recvLines();
  expect(
    r.previewPlateCrop(itemId, undefined, [
      { token: first.token, lookId: 'one', focus },
      { token: second.token, lookId: 'two', focus },
    ]),
  ).toMatchObject({ ok: true });
  expect(
    r.previewPlateCrop(itemId, undefined, [
      { token: first.token, lookId: 'one', focus, reset: true },
    ]),
  ).toMatchObject({ ok: true, applied: [first.token] });
  expect(r.stackSnapshot()[0]?.previewPlateCrops).toEqual([{ token: second.token, focus }]);
  expect(await recvLines()).toEqual(before);
  await r.setActiveLook(itemId, 'one');
  expect(r.previewPlateCrop(itemId).targets[0]?.focus).toEqual(authored);
});

it('saves frame placements off air, keeps Pan identity, and sends them to a resident page before Take', async () => {
  const r = await boot({
    template: template([{ id: 'guest-1', rect: BOX, fitMode: 'cover', operatorFrame: FRAME }]),
    html: FRAME_HTML,
  });
  const itemId = 'item-1';
  expect(await r.load(itemId, 'lower-third', {})).toMatchObject({ accepted: true });
  expect(r.enterPreview(itemId)).toEqual({ ok: true });
  const [initial] = r.previewPlateCrop(itemId).targets;
  expect(initial).toBeDefined();
  const crop = { token: initial!.token, focus: { x: 1, y: 0.5, zoom: 2 } };
  expect(r.previewPlateCrop(itemId, undefined, [crop]).ok).toBe(true);
  const before = (await recvLines()).length;
  await expect(
    r.setFramePlacements(itemId, [{ ...MOVED_FRAME, rect: { ...MOVED_FRAME.rect, height: 480 } }]),
  ).resolves.toMatchObject({ accepted: false, errorCode: 'invalid-frame-placement' });
  await expect(r.setFramePlacements(itemId, [MOVED_FRAME])).resolves.toEqual({ accepted: true });
  expect((await recvLines()).slice(before)).toEqual([]);
  expect(r.previewPlateCrop(itemId).targets).toMatchObject([
    { token: crop.token, focus: crop.focus },
  ]);
  const retained = RetainedStackItemSchema.parse(retainedFromStackItem(r.stackSnapshot()[0]!));
  expect(retained.framePlacements).toEqual([MOVED_FRAME]);

  expect(await r.take(itemId)).toMatchObject({ accepted: true });
  const writes = (await recvLines()).slice(before);
  const firstPlacement = writes.findIndex(
    (line) => line.startsWith('CG 1-10 UPDATE ') && line.includes('framePlacements'),
  );
  const reveal = writes.findIndex((line) => line === 'CG 1-10 PLAY 0');
  expect(firstPlacement).toBeGreaterThanOrEqual(0);
  expect(reveal).toBeGreaterThan(firstPlacement);
  expect(JSON.parse(mock!.lastCgUpdate({ channel: 1, layer: 10 })?.data ?? '{}')).toMatchObject({
    __cg: { framePlacements: [MOVED_FRAME] },
  });
  expect(mock!.layerState({ channel: 1, layer: 30 })?.clip).toEqual({
    x: 0.5,
    y: 0.5,
    width: 0.25,
    height: 0.25,
  });
  expect(mock!.layerState({ channel: 1, layer: 30 })?.fill).toEqual({
    x: 0.25,
    y: 0.375,
    width: 0.5,
    height: 0.5,
  });

  expect(await r.stopItem(itemId)).toMatchObject({ accepted: true });
  const stopped = (await recvLines()).length;
  await expect(r.setFramePlacements(itemId, [], 'all')).resolves.toEqual({ accepted: true });
  expect((await recvLines()).slice(stopped)).toEqual([]);
  expect(await r.take(itemId)).toMatchObject({ accepted: true });
  expect(JSON.parse(mock!.lastCgUpdate({ channel: 1, layer: 10 })?.data ?? '{}')).toMatchObject({
    __cg: { framePlacements: [] },
  });
  expect(mock!.layerState({ channel: 1, layer: 30 })?.clip).toEqual({
    x: 0.25,
    y: 0.25,
    width: 0.5,
    height: 0.5,
  });
});

it.each([
  {
    policy: 'move only',
    frame: { ...FRAME, resize: 'move-only' } satisfies LiveFrameTarget,
    allowed: { ...BOX, x: 960 },
    denied: MOVED_FRAME.rect,
    clip: { x: 0.5, y: 0.25, width: 0.5, height: 0.5 },
  },
  {
    policy: 'resize only',
    frame: { ...FRAME, resize: 'free', move: false } satisfies LiveFrameTarget,
    allowed: { ...BOX, x: 720, width: 480 },
    denied: { ...BOX, x: 730, width: 480 },
    clip: { x: 0.375, y: 0.25, width: 0.25, height: 0.5 },
  },
])(
  'enforces the authored $policy frame policy before seating',
  async ({ frame, allowed, denied, clip }) => {
    const r = await boot({
      template: template([{ id: 'guest-1', rect: BOX, fitMode: 'cover', operatorFrame: frame }]),
      html: FRAME_HTML,
    });
    const itemId = 'item-1';
    const placement = { frameKey: frame.frameKey, rect: allowed };
    expect(await r.load(itemId, 'lower-third', {})).toEqual({ accepted: true });
    const before = await recvLines();
    expect(await r.setFramePlacements(itemId, [placement])).toEqual({ accepted: true });
    expect(await r.setFramePlacements(itemId, [{ ...placement, rect: denied }])).toMatchObject({
      accepted: false,
      errorCode: 'invalid-frame-placement',
    });
    expect(await recvLines()).toEqual(before);
    expect(r.stackSnapshot()[0]?.framePlacements).toEqual([placement]);

    expect(await r.take(itemId)).toMatchObject({ accepted: true });
    expect(mock?.layerState({ channel: 1, layer: BAND.start })?.clip).toEqual(clip);
    expect(JSON.parse(mock?.lastCgUpdate({ channel: 1, layer: 10 })?.data ?? '{}')).toMatchObject({
      __cg: { framePlacements: [placement] },
    });
  },
);

it('R-108 keeps current programme frames during Reload defaults and uses the new authored geometry on Take', async () => {
  const old = template([{ id: 'guest-1', rect: BOX, operatorFrame: FRAME }], true);
  const r = await boot({ template: old, html: FRAME_HTML });
  const itemId = 'item-1';
  const graphicSlot = { channel: 1, layer: 10 };
  const plateSlot = { channel: 1, layer: BAND.start };
  const foregroundSlot = { channel: 1, layer: BAND.end };
  expect(await r.load(itemId, old.templateId, {})).toEqual({ accepted: true });
  expect(await r.setFramePlacements(itemId, [MOVED_FRAME])).toEqual({ accepted: true });
  expect(await r.take(itemId)).toMatchObject({ accepted: true });
  const programme = mock?.layerState(plateSlot);
  expect(programme?.clip).toEqual({ x: 0.5, y: 0.5, width: 0.25, height: 0.25 });
  const authored = { x: 192, y: 108, width: 768, height: 432 };
  const latest = template([{ id: 'guest-1', rect: authored, operatorFrame: FRAME }], true);
  expect(r.templateImport(latest, FRAME_HTML.replace('served', 'reloaded')).registered).toBe(true);

  const beforeReset = (await recvLines()).length;
  expect(await r.setFramePlacements(itemId, [], 'reload-defaults')).toEqual({ accepted: true });
  expect(
    (await recvLines()).slice(beforeReset).filter((line) => /^(CG|MIXER|PLAY|CLEAR) /.test(line)),
  ).toEqual([]);
  expect(mock?.layerState(plateSlot)?.clip).toEqual(programme?.clip);
  const row = r.stackSnapshot()[0];
  if (row === undefined) throw new Error('The programme row is missing');
  expect(retainedFromStackItem(row)).toMatchObject({
    framePlacements: [MOVED_FRAME],
    framePlacementsPendingReset: true,
  });

  expect(await r.stopItem(itemId)).toMatchObject({ accepted: true });
  expect(await r.take(itemId)).toMatchObject({ accepted: true });
  for (const slot of [graphicSlot, foregroundSlot]) {
    expect(JSON.parse(mock?.lastCgAdd(slot)?.data ?? '{}')).toMatchObject({
      __cg: { framePlacements: [] },
    });
  }
  expect(mock?.layerState(plateSlot)?.clip).toEqual({ x: 0.1, y: 0.1, width: 0.4, height: 0.4 });
  expect(r.stackSnapshot()[0]?.framePlacements).toEqual([]);
  expect(r.stackSnapshot()[0]?.framePlacementsPendingReset).toBeUndefined();
});

it('keeps editing the held programme frame after Reload changes artwork and preset Auto layout', async () => {
  const info = template([{ id: 'guest-1', rect: BOX }]);
  if (info.liveSources === undefined) throw new Error('Missing frame carrier');
  const look = {
    id: 'single',
    name: 'Single',
    entered: { mode: 'cut' as const },
    rects: { 'guest-1': BOX },
    operatorFrames: { 'guest-1': FRAME },
  };
  const liveSources = { ...info.liveSources, defaultLookId: look.id, looks: [look] };
  const original = {
    ...info,
    liveSources: { ...liveSources, allowOperatorAutoLayout: true as const },
  };
  const placement = { ...MOVED_FRAME, lookId: look.id };
  const r = await boot({ template: original, html: FRAME_HTML });
  const itemId = 'item-1';
  const graphic = { channel: 1, layer: 10 };
  const plate = { channel: 1, layer: BAND.start };
  const row = () => r.stackSnapshot().find((item) => item.itemId === itemId);
  expect(await loadAndTake(r, itemId)).toMatchObject({ accepted: true });
  await expect.poll(row).toMatchObject({ onAirFramePlacement: true });
  const residentAdd = mock?.lastCgAdd(graphic);
  expect(residentAdd).toBeDefined();

  const revisedHtml = FRAME_HTML.replace('served', 'revised title artwork');
  const before = (await recvLines()).length;
  expect(
    r.templateImport(
      {
        ...original,
        name: 'Revised title artwork',
        liveSources: {
          ...liveSources,
          looks: [{ ...look, name: 'Guest', allowOperatorAutoLayout: false }],
        },
      },
      revisedHtml,
    ).registered,
  ).toBe(true);
  expect(r.templateGet(original.templateId, graphic.channel)?.name).toBe('Revised title artwork');
  expect(r.templateHtml(original.templateId, graphic.channel)).toBe(revisedHtml);
  await expect(r.setFramePlacements(itemId, [placement])).resolves.toEqual({ accepted: true });

  expect(
    (await recvLines()).slice(before).filter((line) => /^(CG|MIXER|PLAY|CLEAR) /.test(line)),
  ).toEqual([
    'MIXER 1-30 FILL 0.5 0.5 0.25 0.25 DEFER',
    'MIXER 1-30 CLIP 0.5 0.5 0.25 0.25 DEFER',
    expect.stringContaining('CG 1-10 UPDATE '),
    'MIXER 1 COMMIT',
  ]);
  expect(mock?.lastCgAdd(graphic)).toEqual(residentAdd);
  expect(mock?.layerState(plate)?.clip).toEqual({ x: 0.5, y: 0.5, width: 0.25, height: 0.25 });
  expect(JSON.parse(mock?.lastCgUpdate(graphic)?.data ?? '{}')).toEqual({
    __cg: { framePlacements: [placement] },
  });
  expect(row()).toMatchObject({ framePlacements: [placement], onAirFramePlacement: true });
});

it.each([
  {
    change: 'the authored rectangle',
    rect: { ...BOX, x: 192, y: 108 },
    frame: FRAME,
  },
  {
    change: 'the frame instance key',
    rect: BOX,
    frame: { ...FRAME, frameKey: 'guest/el-guest-1', artworkKey: 'guest' },
  },
])('keeps the held programme untouched when Reload changes $change', async ({ rect, frame }) => {
  const original = template([{ id: 'guest-1', rect: BOX, operatorFrame: FRAME }]);
  const r = await boot({ template: original, html: FRAME_HTML });
  const itemId = 'item-1';
  const graphic = { channel: 1, layer: 10 };
  const plate = { channel: 1, layer: BAND.start };
  const row = () => r.stackSnapshot().find((item) => item.itemId === itemId);
  expect(await loadAndTake(r, itemId)).toMatchObject({ accepted: true });
  await expect.poll(row).toMatchObject({ onAirFramePlacement: true });
  await expect(r.setFramePlacements(itemId, [MOVED_FRAME])).resolves.toEqual({ accepted: true });
  const residentAdd = mock?.lastCgAdd(graphic);
  const appliedClip = mock?.layerState(plate)?.clip;
  const before = (await recvLines()).length;

  const revised = template([{ id: 'guest-1', rect, operatorFrame: frame }]);
  expect(r.templateImport(revised, FRAME_HTML.replace('served', 'revised layout')).registered).toBe(
    true,
  );
  await expect(
    r.setFramePlacements(itemId, [{ ...AUTHORED_FRAME, frameKey: frame.frameKey }]),
  ).resolves.toMatchObject({
    accepted: false,
    errorCode: 'frame-placement-on-air-unavailable',
    message:
      'The listed template has a different live frame layout. Take that template before editing its frames on air.',
  });
  expect(
    (await recvLines()).slice(before).filter((line) => /^(CG|MIXER|PLAY|CLEAR) /.test(line)),
  ).toEqual([]);
  expect(mock?.lastCgAdd(graphic)).toEqual(residentAdd);
  expect(mock?.layerState(plate)?.clip).toEqual(appliedClip);
  expect(row()?.framePlacements).toEqual([MOVED_FRAME]);
  expect(row()?.onAirFramePlacement).toBeUndefined();
});

it('moves the same on-air page and picture in place and rolls back after a refused CLIP', async () => {
  const r = await boot({
    template: template([{ id: 'guest-1', rect: BOX, operatorFrame: FRAME }]),
    html: FRAME_HTML,
  });
  const itemId = 'item-1';
  const row = () => r.stackSnapshot().find((item) => item.itemId === itemId);
  expect(await loadAndTake(r, itemId)).toMatchObject({ accepted: true });
  await expect.poll(row).toMatchObject({ onAirFramePlacement: true });
  const before = (await recvLines()).length;
  await expect(r.setFramePlacements(itemId, [MOVED_FRAME])).resolves.toEqual({ accepted: true });
  const writes = (await recvLines())
    .slice(before)
    .filter((line) => /^(CG |MIXER |PLAY |CLEAR )/.test(line));
  expect(writes).toEqual([
    'MIXER 1-30 FILL 0.5 0.5 0.25 0.25 DEFER',
    'MIXER 1-30 CLIP 0.5 0.5 0.25 0.25 DEFER',
    expect.stringContaining('CG 1-10 UPDATE '),
    'MIXER 1 COMMIT',
  ]);
  const slot = { channel: 1, layer: 30 };
  const moved = mock!.layerState(slot);
  expect(row()?.framePlacements).toEqual([MOVED_FRAME]);
  const mixer = defaultHandlers().get('MIXER')!;
  let refused = false;
  mock!.setHandler('MIXER', (request, context, connection) => {
    if (!refused && request.raw.startsWith('MIXER 1-30 CLIP ')) {
      refused = true;
      return { kind: 'err', code: 502, verb: 'MIXER' };
    }
    return mixer(request, context, connection);
  });
  await expect(r.setFramePlacements(itemId, [AUTHORED_FRAME])).resolves.toMatchObject({
    accepted: false,
    errorCode: 'amcp-502',
  });
  expect(refused).toBe(true);
  expect(row()?.framePlacements).toEqual([MOVED_FRAME]);
  expect(mock!.layerState(slot)).toMatchObject({
    fill: moved?.fill,
    clip: moved?.clip,
    volume: moved?.volume,
  });
  expect(JSON.parse(mock!.lastCgUpdate({ channel: 1, layer: 10 })?.data ?? '{}')).toEqual({
    __cg: { framePlacements: [MOVED_FRAME] },
  });

  let refusedCommit = false;
  mock!.setHandler('MIXER', (request, context, connection) => {
    if (!refusedCommit && request.raw === 'MIXER 1 COMMIT') {
      refusedCommit = true;
      return { kind: 'err', code: 502, verb: 'MIXER' };
    }
    return mixer(request, context, connection);
  });
  const beforeCommitRefusal = (await recvLines()).length;
  await expect(r.setFramePlacements(itemId, [], 'all')).resolves.toMatchObject({
    accepted: false,
    errorCode: 'amcp-502',
    message: expect.stringContaining('previous placement was restored'),
  });
  expect(refusedCommit).toBe(true);
  expect(
    (await recvLines()).slice(beforeCommitRefusal).filter((line) => line === 'MIXER 1 COMMIT'),
  ).toHaveLength(2);
  expect(row()).toMatchObject({ framePlacements: [MOVED_FRAME], onAirFramePlacement: true });
  expect(mock!.layerState(slot)).toMatchObject({
    fill: moved?.fill,
    clip: moved?.clip,
    volume: moved?.volume,
  });
  expect(JSON.parse(mock!.lastCgUpdate({ channel: 1, layer: 10 })?.data ?? '{}')).toEqual({
    __cg: { framePlacements: [MOVED_FRAME] },
  });

  const beforeReset = (await recvLines()).length;
  expect(await r.setFramePlacements(itemId, [], 'all')).toEqual({ accepted: true });
  expect((await recvLines()).slice(beforeReset)).not.toEqual(
    expect.arrayContaining([expect.stringMatching(/^(PLAY|CLEAR|CG .* (ADD|PLAY|STOP)) /)]),
  );
  expect(row()?.framePlacements).toEqual([]);
  expect(mock!.layerState(slot)?.clip).toEqual({ x: 0.25, y: 0.25, width: 0.5, height: 0.5 });
  expect(JSON.parse(mock!.lastCgUpdate({ channel: 1, layer: 10 })?.data ?? '{}')).toEqual({
    __cg: { framePlacements: [] },
  });
});

it.each([
  { motion: 'linear', fade: false, durationMs: 160, commits: 1, opacity: [] },
  { motion: 'cut', fade: true, durationMs: 160, commits: 3, opacity: [0, 0, 1] },
  { motion: 'ease-in-out', fade: true, durationMs: 160, commits: 2, opacity: [0, 1] },
  { motion: 'bounce', fade: false, durationMs: 400, commits: 3, opacity: [] },
  { motion: 'elastic', fade: false, durationMs: 400, commits: 5, opacity: [] },
] satisfies (FrameTransition & { commits: number; opacity: number[] })[])(
  'uses deferred native frame effects without replacing the seated input ($motion, fade $fade)',
  async ({ commits, opacity, ...transition }) => {
    const r = await boot({
      template: template(
        [{ id: 'guest-1', rect: BOX, fitMode: 'cover', operatorFrame: FRAME }],
        true,
      ),
      html: EFFECT_HTML,
    });
    const itemId = 'item-1';
    expect(await loadAndTake(r, itemId)).toMatchObject({ accepted: true });
    await expect.poll(() => r.stackSnapshot()[0]).toMatchObject({ onAirFrameTransition: true });
    const before = (await recvLines()).length;
    expect(await r.setFramePlacements(itemId, [MOVED_FRAME], undefined, transition)).toEqual({
      accepted: true,
    });
    const writes = (await recvLines()).slice(before);
    expect(writes.filter((line) => line === 'MIXER 1 COMMIT')).toHaveLength(commits);
    expect(
      writes.filter((line) => /MIXER 1-30 FILL .+ \d+ (linear|ease\w+) DEFER/.test(line)),
    ).toHaveLength(commits);
    expect(
      writes.filter((line) => /MIXER 1-30 CLIP .+ \d+ (linear|ease\w+) DEFER/.test(line)),
    ).toHaveLength(commits);
    expect(
      writes
        .filter((line) => line.startsWith('MIXER 1-30 OPACITY '))
        .map((line) => Number(line.split(' ')[3])),
    ).toEqual(opacity);
    expect(
      writes.some((line) =>
        /^(?:PLAY |CLEAR |CG .+ (?:ADD|PLAY|STOP) |MIXER .+ VOLUME )/.test(line),
      ),
    ).toBe(false);
    for (const layer of [10, BAND.end]) {
      const phases = writes.filter(
        (line) => line.startsWith(`CG 1-${String(layer)} UPDATE `) && line.includes('durationMs'),
      );
      expect(phases).toHaveLength(commits);
      expect(phases.every((line) => line.includes('hideFallbackPlateIds'))).toBe(true);
      expect(JSON.parse(mock!.lastCgUpdate({ channel: 1, layer })?.data ?? '{}')).toEqual({
        __cg: { framePlacements: [MOVED_FRAME], frameTransition: null },
      });
    }
    expect(mock!.layerState({ channel: 1, layer: 30 })).toMatchObject({
      opacity: 1,
      clip: { x: 0.5, y: 0.5, width: 0.25, height: 0.25 },
    });
    expect(r.stackSnapshot()[0]?.framePlacements).toEqual([MOVED_FRAME]);
  },
);

it.each([false, true])(
  'mirrors same-look frame geometry phases only to a proven resident B seat (refused B: %s)',
  async (refuseBackup) => {
    const info = template([{ id: 'guest-1', rect: BOX, operatorFrame: FRAME }], true);
    info.liveSources!.looks = [
      {
        id: 'layout',
        name: 'Layout',
        entered: { mode: 'cut' },
        rects: { 'guest-1': BOX },
        operatorFrames: { 'guest-1': FRAME },
      },
    ];
    info.liveSources!.defaultLookId = 'layout';
    const html = EFFECT_HTML.replace(
      '</head>',
      `${CG_LIVE_PRESET_TRANSITION_PAGE_MARKER}${CG_LIVE_PRESET_RECOVERY_PAGE_MARKER}</head>`,
    );
    const r = await boot({
      template: info,
      html,
      mirrorChannel: 2,
      catalog: catalog({
        sources: [
          {
            id: 'src-a',
            name: 'Camera',
            format: '1080i5000',
            producer: { kind: 'ndi', source: 'Camera' },
          },
        ],
      }),
    });
    const active = mock!;
    const reserve = backup!;
    const slot = { channel: 2, layer: BAND.start };
    if (refuseBackup) {
      const play = defaultHandlers().get('PLAY')!;
      reserve.setHandler('PLAY', (request, context, connection) => {
        if (request.raw.startsWith(`PLAY 2-${String(slot.layer)} [NDI] `)) {
          context.setLayer(slot, { producer: 'ndi', filePath: 'other-camera', onAir: true });
          return { kind: 'err', code: 403, verb: 'PLAY' };
        }
        return play(request, context, connection);
      });
    }
    expect(await loadAndTake(r)).toMatchObject({ accepted: true });
    await expect.poll(() => r.stackSnapshot()[0]?.onAirFrameTransition).toBe(true);
    const beforeA = active.receivedCommands().length;
    const beforeB = reserve.receivedCommands().length;
    const placement = { ...MOVED_FRAME, lookId: 'layout' };
    expect(
      await r.setFramePlacements('item-1', [placement], undefined, {
        motion: 'ease-in-out',
        fade: true,
        durationMs: 160,
      }),
    ).toEqual({ accepted: true });
    const a = active.receivedCommands().slice(beforeA);
    const b = reserve.receivedCommands().slice(beforeB);
    const native = b.filter(({ line }) =>
      /^MIXER 2-30 (?:FILL|CLIP) .+ \d+ ease\w+ DEFER$/.test(line),
    );
    expect(native.length > 0).toBe(!refuseBackup);
    if (refuseBackup) {
      expect(reserve.layerState(slot)?.filePath).toBe('other-camera');
      expect(b.some(({ line }) => /^MIXER 2-30 (?:FILL|CLIP) /.test(line))).toBe(false);
    } else {
      expect(reserve.layerState(slot)?.fill).toEqual(
        active.layerState({ channel: 1, layer: BAND.start })?.fill,
      );
      expect(reserve.layerState(slot)?.clip).toEqual(
        active.layerState({ channel: 1, layer: BAND.start })?.clip,
      );
      const release = a.find(
        ({ line }) => line.includes('framePlacements') && line.includes('frameTransition'),
      );
      expect(release).toBeDefined();
      expect(native[0]!.at).toBeLessThan(release!.at);
      expect(
        b.some(({ line }) => line.startsWith('CG 2-10 UPDATE ') && line.includes('durationMs')),
      ).toBe(true);
      expect(b.some(({ line }) => line === 'MIXER 2 COMMIT')).toBe(true);
    }
    expect(r.stackSnapshot()[0]?.framePlacements).toEqual([placement]);
  },
);

it('restores paired frame geometry after an active phase refusal and can retry without a stale reserve batch', async () => {
  const info = template([{ id: 'guest-1', rect: BOX, operatorFrame: FRAME }], true);
  info.liveSources!.looks = [
    {
      id: 'layout',
      name: 'Layout',
      entered: { mode: 'cut' },
      rects: { 'guest-1': BOX },
      operatorFrames: { 'guest-1': FRAME },
    },
  ];
  info.liveSources!.defaultLookId = 'layout';
  const html = EFFECT_HTML.replace(
    '</head>',
    `${CG_LIVE_PRESET_TRANSITION_PAGE_MARKER}${CG_LIVE_PRESET_RECOVERY_PAGE_MARKER}</head>`,
  );
  const r = await boot({
    template: info,
    html,
    mirrorChannel: 2,
    catalog: catalog({
      sources: [
        {
          id: 'src-a',
          name: 'Camera',
          format: '1080i5000',
          producer: { kind: 'ndi', source: 'Camera' },
        },
      ],
    }),
  });
  expect(await loadAndTake(r)).toMatchObject({ accepted: true });
  const a = mock!;
  const b = backup!;
  const slotA = { channel: 1, layer: BAND.start };
  const slotB = { channel: 2, layer: BAND.start };
  const beforeA = a.layerState(slotA);
  const beforeB = b.layerState(slotB);
  const normal = defaultHandlers().get('CG')!;
  let refused = false;
  a.setHandler('CG', (request, context, connection) => {
    if (
      !refused &&
      request.raw.startsWith('CG 1-32 UPDATE ') &&
      request.raw.includes('durationMs')
    ) {
      refused = true;
      return { kind: 'err', code: 502, verb: 'CG' };
    }
    return normal(request, context, connection);
  });
  const placement = { ...MOVED_FRAME, lookId: 'layout' };
  const transition = { motion: 'ease-in-out', fade: true, durationMs: 160 } as const;
  expect(await r.setFramePlacements('item-1', [placement], undefined, transition)).toMatchObject({
    accepted: false,
  });
  expect(refused).toBe(true);
  expect(a.layerState(slotA)?.fill).toEqual(beforeA?.fill);
  expect(a.layerState(slotA)?.clip).toEqual(beforeA?.clip);
  expect(b.layerState(slotB)?.fill).toEqual(beforeB?.fill);
  expect(b.layerState(slotB)?.clip).toEqual(beforeB?.clip);
  expect(await r.setFramePlacements('item-1', [placement], undefined, transition)).toEqual({
    accepted: true,
  });
  expect(b.layerState(slotB)?.fill).toEqual(a.layerState(slotA)?.fill);
  expect(b.layerState(slotB)?.clip).toEqual(a.layerState(slotA)?.clip);
});

it('rolls back both programme passes if the foreground refuses a frame phase', async () => {
  const r = await boot({
    template: template([{ id: 'guest-1', rect: BOX, operatorFrame: FRAME }], true),
    html: EFFECT_HTML,
  });
  const itemId = 'item-1';
  expect(await loadAndTake(r, itemId)).toMatchObject({ accepted: true });
  await expect.poll(() => r.stackSnapshot()[0]).toMatchObject({ onAirFrameTransition: true });
  const plate = { channel: 1, layer: 30 };
  const previous = mock!.layerState(plate);
  const normalCg = defaultHandlers().get('CG')!;
  let refused = false;
  mock!.setHandler('CG', (request, context, connection) => {
    if (request.raw.startsWith('CG 1-32 UPDATE ') && request.raw.includes('durationMs')) {
      refused = true;
      return { kind: 'err', code: 502, verb: 'CG' };
    }
    return normalCg(request, context, connection);
  });
  expect(
    await r.setFramePlacements(itemId, [MOVED_FRAME], undefined, {
      motion: 'ease-in-out',
      fade: true,
      durationMs: 200,
    }),
  ).toMatchObject({ accepted: false, errorCode: 'amcp-502' });
  expect(refused).toBe(true);
  expect(mock!.layerState(plate)).toEqual(previous);
  for (const layer of [10, BAND.end]) {
    expect(JSON.parse(mock!.lastCgUpdate({ channel: 1, layer })?.data ?? '{}')).toEqual({
      __cg: { framePlacements: [], frameTransition: null },
    });
  }
  expect(r.stackSnapshot()[0]?.framePlacements).toBeUndefined();
});

it('animates the retained authored seat in both directions and cuts the new plate in at the end', async () => {
  const r = await boot({
    template: presetEffectTemplate(),
    html: PRESET_EFFECT_HTML,
    assignments: assign([
      ['guest-1', 'src-a'],
      ['guest-2', 'src-b'],
    ]),
  });
  const itemId = 'item-1';
  expect(await loadAndTake(r, itemId)).toMatchObject({ accepted: true });
  await expect.poll(() => r.stackSnapshot()[0]).toMatchObject({ onAirPresetTransition: true });
  const sharedLayer = 30;
  const slots = [10, BAND.end];
  for (const [from, to, finalClip] of [
    ['solo', 'duo', { x: 0.5, y: 0.5, width: 0.25, height: 0.25 }],
    ['duo', 'solo', { x: 0.25, y: 0.25, width: 0.5, height: 0.5 }],
  ] as const) {
    const before = (await recvLines()).length;
    expect(await r.setActiveLook(itemId, to, PRESET_EFFECT)).toEqual({ ok: true });
    const writes = (await recvLines()).slice(before);
    expect(writes).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/^(?:PLAY|CLEAR) 1-30(?: |$)/)]),
    );
    for (const transform of ['FILL', 'CLIP', 'OPACITY']) {
      expect(
        writes.filter(
          (line) =>
            line.startsWith(`MIXER 1-${sharedLayer} ${transform} `) && line.includes('quad DEFER'),
        ),
      ).toHaveLength(2);
    }
    for (const layer of slots) {
      const phases = writes.filter(
        (line) => line.startsWith(`CG 1-${layer} UPDATE `) && line.includes('authoredPreset'),
      );
      expect(phases).toHaveLength(2);
      expect(phases.every((line) => line.includes(`${from}-guest`))).toBe(true);
      expect(JSON.parse(mock!.lastCgUpdate({ channel: 1, layer })?.data ?? '{}')).toMatchObject({
        __cg: { look: to, frameTransition: null, presetTransitionCommit: true },
      });
    }
    expect(r.stackSnapshot()[0]?.activeLookId).toBe(to);
    expect(mock!.layerState({ channel: 1, layer: sharedLayer })).toMatchObject({
      clip: finalClip,
      opacity: 1,
    });
  }
});

it('tweens a fit-only preset change and shares the artwork start allowance across both pages and engines', async () => {
  const base = presetEffectTemplate();
  const live = base.liveSources!;
  const [solo, duo] = live.looks!;
  const portrait = { x: 600, y: 60, width: 720, height: 960 };
  const r = await boot({
    template: {
      ...base,
      liveSources: {
        ...live,
        looks: [
          { ...solo!, rects: { 'guest-1': portrait }, fits: { 'guest-1': 'contain' } },
          { ...duo!, rects: { 'guest-1': portrait }, fits: { 'guest-1': 'cover' } },
        ],
      },
    },
    html: PRESET_RECOVERY_HTML,
    catalog: catalog({
      sources: [
        {
          id: 'src-a',
          name: 'Studio A',
          format: '1080i5000',
          producer: { kind: 'ndi', source: 'A' },
        },
      ],
    }),
    lookMixerHoldMs: 200,
    mirrorChannel: 2,
  });
  expect(await loadAndTake(r)).toMatchObject({ accepted: true });
  await expect.poll(() => r.stackSnapshot()[0]).toMatchObject({ onAirPresetTransition: true });
  const a = mock!;
  const b = backup!;
  const native = r.liveLayers().get('item-1')![0]!.slot.layer;
  const activeBefore = a.receivedCommands().length;
  const reserveBefore = b.receivedCommands().length;
  const initialFill = a.layerState({ channel: 1, layer: native })?.fill;
  const normalCg = defaultHandlers().get('CG')!;
  let delayed = false;
  a.setHandler('CG', async (request, context, connection) => {
    const reply = normalCg(request, context, connection);
    if (!delayed && request.raw.startsWith('CG 1-10 UPDATE ') && request.raw.includes('delayMs')) {
      delayed = true;
      await new Promise<void>((resolve) => setTimeout(resolve, 90));
    }
    return reply;
  });
  expect(
    await r.setActiveLook('item-1', 'duo', { motion: 'linear', fade: false, durationMs: 120 }),
  ).toEqual({ ok: true });
  expect(delayed).toBe(true);
  const firstPhase = (engine: MockHandle, start: number, channel: number) => {
    const logs = engine.receivedCommands().slice(start);
    const writes = logs.filter(
      ({ line }) => line.includes('authoredPreset') && line.includes('delayMs'),
    );
    expect(writes).toHaveLength(2);
    const delays = writes.map(({ line }) => {
      const decoded = decodeCgData(parseAmcpLine(line)!.args[3]!);
      if (decoded.data === null) throw new Error('Cannot decode preset artwork phase');
      return readCgControl(JSON.parse(decoded.data))?.frameTransition?.delayMs ?? 0;
    });
    const commit = logs.find(
      ({ line, at }) => line === `MIXER ${channel} COMMIT` && at >= writes[1]!.at,
    );
    expect(commit).toBeDefined();
    expect(logs.map(({ line }) => line)).not.toContainEqual(
      expect.stringMatching(new RegExp(`^(?:PLAY|CLEAR) ${channel}-${native}(?: |$)`)),
    );
    for (const transform of ['FILL', 'CLIP'])
      expect(logs.map(({ line }) => line)).toContainEqual(
        expect.stringMatching(
          new RegExp(`^MIXER ${channel}-${native} ${transform} .* 3 linear DEFER$`),
        ),
      );
    return { delays, writes, commit: commit! };
  };
  const active = firstPhase(a, activeBefore, 1);
  const reserve = firstPhase(b, reserveBefore, 2);
  expect(active.delays[0]! - active.delays[1]!).toBeGreaterThan(70);
  expect(active.commit.at - active.writes[1]!.at).toBeLessThan(active.delays[0]! - 35);
  expect(reserve.delays[0]!).toBeLessThan(active.delays[0]! - 70);
  const coverFill = a.layerState({ channel: 1, layer: native })?.fill;
  expect(coverFill).not.toEqual(initialFill);
  expect(b.layerState({ channel: 2, layer: native })?.fill).toEqual(coverFill);
});

it('hides a complete departing mask group before the shared resize, then restores opacity on reverse', async () => {
  const r = await bootPresetDeparture(PRESET_DEPARTURE_HTML);
  const itemId = 'item-1';
  const visible = () => (r.liveLayers().get(itemId) ?? []).filter(({ held }) => held !== true);
  const shared = visible().find(({ sourceId }) => sourceId === 'guest-1')!;
  const departing = visible().filter(({ sourceId }) => sourceId !== 'guest-1');
  expect(departing).toHaveLength(2);
  expect(departing[0]?.slot.layer).toBeLessThan(shared.slot.layer);
  const snapshots = departing.map(({ slot }) => mock!.layerState(slot));
  for (const { sourceId } of departing)
    expect(await r.setLivePlateVolume(itemId, sourceId, 0.5)).toMatchObject({ ok: true });
  const before = (await recvLines()).length;
  expect(await r.setActiveLook(itemId, 'solo', { ...PRESET_EFFECT, fade: false })).toEqual({
    ok: true,
  });
  const writes = (await recvLines()).slice(before);
  const earlyCommit = writes.indexOf('MIXER 1 COMMIT');
  const tween = writes.findIndex(
    (line) =>
      line.startsWith(`MIXER 1-${shared.slot.layer} FILL `) && line.includes('easeinoutquad'),
  );
  expect(earlyCommit).toBeGreaterThan(0);
  expect(tween).toBeGreaterThan(earlyCommit);
  for (const { slot } of departing) {
    expect(at(writes, `MIXER 1-${slot.layer} OPACITY 0 0 linear DEFER`)).toBeGreaterThanOrEqual(0);
    expect(at(writes, `MIXER 1-${slot.layer} OPACITY 0 0 linear DEFER`)).toBeLessThan(earlyCommit);
    expect(at(writes, `MIXER 1-${slot.layer} VOLUME 0`)).toBeGreaterThan(tween);
    expect(at(writes, `MIXER 1-${slot.layer} OPACITY 1 DEFER`)).toBeGreaterThan(tween);
  }
  const phases = writes.filter((line) => line.includes('authoredPreset'));
  expect(phases).toHaveLength(4);
  expect(phases.every((line) => line.includes(DEPARTURE_ARTWORK))).toBe(true);
  expect(phases[0]).toContain('durationMs');
  expect(visible().map(({ sourceId }) => sourceId)).toEqual(['guest-1']);
  expect(mock!.layerState(shared.slot)).toMatchObject({
    opacity: 1,
    clip: { x: 0, y: 0, width: 1, height: 1 },
  });

  expect(await r.setActiveLook(itemId, 'duo', { ...PRESET_EFFECT, fade: false })).toEqual({
    ok: true,
  });
  expect(
    (await recvLines())
      .slice(before)
      .some((line) => line.startsWith('PLAY ') || line.startsWith('CLEAR ')),
  ).toBe(false);
  for (const [{ slot }, snapshot] of departing.map(
    (record, index) => [record, snapshots[index]] as const,
  ))
    expect(mock!.layerState(slot)).toMatchObject({ opacity: 1, clip: snapshot?.clip, volume: 0.5 });
});

it.each([
  [PRESET_EFFECT_HTML, false],
  [PRESET_DEPARTURE_HTML, true],
])(
  'uses Cut when the departure page or an outgoing-only group is unavailable (%#)',
  async (html, mixed) => {
    const r = await bootPresetDeparture(html, mixed);
    const before = (await recvLines()).length;
    expect(await r.setActiveLook('item-1', 'solo', PRESET_EFFECT)).toEqual({ ok: true });
    expect((await recvLines()).slice(before).some((line) => line.includes('authoredPreset'))).toBe(
      false,
    );
  },
);

it.each([
  { name: 'immediate', html: PRESET_DEPARTURE_HTML, exitDirection: undefined },
  { name: 'slide and fade', html: PRESET_ARTWORK_FADE_HTML, exitDirection: 'up' as const },
])(
  'restores prior mask geometry and opacity if movement fails after $name departure',
  async ({ html, exitDirection }) => {
    const r = await bootPresetDeparture(html);
    const itemId = 'item-1';
    const original = r
      .liveLayers()
      .get(itemId)
      ?.map(({ slot }) => [slot, mock!.layerState(slot)] as const);
    const normal = defaultHandlers().get('MIXER')!;
    mock!.setHandler('MIXER', (request, context, connection) => {
      if (request.raw.includes('FILL') && request.raw.includes('easeinoutquad'))
        return { kind: 'err', code: 502, verb: 'MIXER' };
      return normal(request, context, connection);
    });
    expect(
      await r.setActiveLook(itemId, 'solo', { ...PRESET_EFFECT, fade: false, exitDirection }),
    ).toMatchObject({ ok: false, reason: 'amcp-502' });
    expect(r.stackSnapshot()[0]?.activeLookId).toBe('duo');
    for (const [slot, state] of original ?? []) expect(mock!.layerState(slot)).toEqual(state);
  },
);

it('fades exiting and returning mask seats while keeping retained pictures opaque with Fade off', async () => {
  const r = await bootPresetDeparture(PRESET_ARTWORK_FADE_HTML);
  const itemId = 'item-1';
  const visible = (r.liveLayers().get(itemId) ?? []).filter(({ held }) => held !== true);
  const retained = visible.find(({ sourceId }) => sourceId === 'guest-1');
  const extras = visible.filter(({ sourceId }) => sourceId !== 'guest-1');
  if (retained === undefined || extras.length !== 2) throw new Error('Missing test seats');
  const start = (await recvLines()).length;
  const noRetainedFade = { ...PRESET_EFFECT, fade: false };
  expect(await r.setActiveLook(itemId, 'solo', noRetainedFade)).toEqual({ ok: true });
  const exitWire = (await recvLines()).slice(start);
  const exitPage = exitWire.findIndex((line) => line.includes('opacityArtwork'));
  const move = exitWire.findIndex(
    (line) => line.includes('easeinoutquad') && line.includes(' FILL '),
  );
  expect(exitPage).toBeGreaterThan(0);
  expect(exitWire[exitPage]).toContain(DEPARTURE_ARTWORK);
  expect(exitWire.indexOf('MIXER 1 COMMIT', exitPage)).toBeLessThan(move);
  for (const { slot } of extras) {
    expect(
      exitWire.findIndex((line) =>
        new RegExp(`^MIXER 1-${String(slot.layer)} OPACITY 0 [1-9]\\d* linear DEFER$`).test(line),
      ),
    ).toBeGreaterThanOrEqual(0);
  }
  expect(
    exitWire.some((line) => line.startsWith(`MIXER 1-${String(retained.slot.layer)} OPACITY 0 `)),
  ).toBe(false);
  expect(await r.setActiveLook(itemId, 'duo', noRetainedFade)).toEqual({ ok: true });
  const enterWire = (await recvLines()).slice(start + exitWire.length);
  for (const { slot, clip } of extras) {
    const hold = enterWire.findIndex((line) =>
      line.startsWith(`MIXER 1-${String(slot.layer)} OPACITY 0 0 linear`),
    );
    const fade = enterWire.findIndex((line) =>
      new RegExp(`^MIXER 1-${String(slot.layer)} OPACITY 1 [1-9]\\d* linear DEFER$`).test(line),
    );
    expect(hold).toBeGreaterThanOrEqual(0);
    expect(fade).toBeGreaterThan(hold);
    expect(mock?.layerState(slot)).toMatchObject({
      opacity: 1,
      clip: Object.fromEntries(
        Object.entries(clip).map(([key, value]) => [key, Number(value.toFixed(6))]),
      ),
    });
  }
});

it('slides picture, mask and artwork together with independent departure and arrival directions', async () => {
  const r = await bootPresetDeparture(PRESET_ARTWORK_FADE_HTML);
  const itemId = 'item-1';
  const visible = () => (r.liveLayers().get(itemId) ?? []).filter(({ held }) => held !== true);
  const extras = visible().filter(({ sourceId }) => sourceId !== 'guest-1');
  const retained = visible().find(({ sourceId }) => sourceId === 'guest-1')!;
  expect(extras).toHaveLength(2);
  const start = (await recvLines()).length;
  const effect = {
    ...PRESET_EFFECT,
    fade: false,
    exitDirection: 'up',
    enterDirection: 'down',
  } as const;
  expect(await r.setActiveLook(itemId, 'solo', effect)).toEqual({ ok: true });
  const writes = (await recvLines()).slice(start);
  const departureIndex = writes.findIndex((line) => line.includes('opacityArtwork'));
  const commitAt = writes.indexOf('MIXER 1 COMMIT', departureIndex);
  expect(departureIndex).toBeGreaterThan(0);
  expect(commitAt).toBeGreaterThan(departureIndex);
  const decoded = decodeCgData(parseAmcpLine(writes[departureIndex]!)!.args[3]!);
  if (decoded.data === null) throw new Error('Cannot decode the departure artwork');
  const phase = readCgControl(JSON.parse(decoded.data))?.frameTransition;
  expect(phase?.opacityArtwork).toContainEqual({
    key: DEPARTURE_ARTWORK,
    lookId: 'duo',
    fromOpacity: 1,
    toOpacity: 0,
  });
  expect(phase?.frames.filter(({ from, to }) => to.y !== from.y)).toEqual(
    ['duo-right', 'duo-mask'].map((frameKey) => ({
      frameKey,
      lookId: 'duo',
      from: { x: 960, y: 270, width: 960, height: 540 },
      to: { x: 960, y: -810, width: 960, height: 540 },
      fromOpacity: 1,
      toOpacity: 1,
    })),
  );
  for (const { slot, fill, clip } of extras) {
    const group = writes.slice(0, commitAt);
    const target = 'MIXER 1-' + String(slot.layer);
    const line = group.find((value) => value.startsWith(target + ' OPACITY 0 '));
    const frames = line?.split(' ')[4];
    expect(Number(frames)).toBeGreaterThan(0);
    const args = ({ x, y, width, height }: typeof clip) =>
      [x, y - 1, width, height].map((value) => Number(value.toFixed(6))).join(' ');
    expect(group).toContain(target + ' FILL ' + args(fill) + ' ' + frames + ' linear DEFER');
    expect(group).toContain(target + ' CLIP ' + args(clip) + ' ' + frames + ' linear DEFER');
  }
  expect(
    writes.findIndex(
      (line) =>
        line.startsWith('MIXER 1-' + String(retained.slot.layer) + ' FILL ') &&
        line.endsWith('easeinoutquad DEFER'),
    ),
  ).toBeGreaterThan(commitAt);
  for (const { slot, sourceId, fill } of extras) {
    const parked = parkedFit(fill);
    expect(
      r
        .liveLayers()
        .get(itemId)
        ?.find((record) => record.sourceId === sourceId),
    ).toMatchObject({ ...parked, held: true });
    expect(mock!.layerState(slot)).toMatchObject({
      ...parked,
      fill: Object.fromEntries(
        Object.entries(parked.fill).map(([key, value]) => [key, Number(value.toFixed(6))]),
      ),
      opacity: 1,
    });
  }
  expect(await r.setActiveLook(itemId, 'duo', effect)).toEqual({ ok: true });
  const arrivalWrites = (await recvLines()).slice(start + writes.length);
  const arrivalArtwork = arrivalWrites
    .filter((line) => line.includes('opacityArtwork'))
    .map((line) => {
      const data = decodeCgData(parseAmcpLine(line)!.args[3]!).data;
      if (data === null) throw new Error('Cannot decode the arrival artwork');
      return readCgControl(JSON.parse(data))?.frameTransition;
    });
  const preparedArtwork = arrivalArtwork.filter((phase) => phase?.durationMs === 0);
  const animatedArtwork = arrivalArtwork.filter((phase) => (phase?.durationMs ?? 0) > 0);
  expect(preparedArtwork).toHaveLength(2);
  expect(animatedArtwork).toHaveLength(2);
  const arrivalFrames = ['duo-right', 'duo-mask'].map((frameKey) => ({
    frameKey,
    lookId: 'duo',
    from: { x: 960, y: 1350, width: 960, height: 540 },
    to: { x: 960, y: 270, width: 960, height: 540 },
    fromOpacity: 1,
    toOpacity: 1,
  }));
  for (const phase of preparedArtwork) {
    expect(phase).toMatchObject({
      opacityArtwork: [{ key: DEPARTURE_ARTWORK, lookId: 'duo', fromOpacity: 0, toOpacity: 0 }],
      frames: arrivalFrames.map((frame) => ({ ...frame, to: frame.from })),
    });
  }
  for (const phase of animatedArtwork) {
    expect(phase).toMatchObject({
      opacityArtwork: [{ key: DEPARTURE_ARTWORK, lookId: 'duo', fromOpacity: 0, toOpacity: 1 }],
      frames: arrivalFrames,
    });
  }
  for (const { slot, sourceId, clip, fill } of extras) {
    const target = 'MIXER 1-' + String(slot.layer);
    const startHidden = arrivalWrites.indexOf(target + ' OPACITY 0 0 linear DEFER');
    const show = arrivalWrites.findIndex((line) =>
      new RegExp('^' + target + ' OPACITY 1 [1-9]\\d* linear DEFER$').test(line),
    );
    expect(startHidden).toBeGreaterThan(0);
    const parkedCommit = arrivalWrites.indexOf('MIXER 1 COMMIT', startHidden);
    expect(show).toBeGreaterThan(parkedCommit);
    const native = (rect: typeof clip, offset: number) =>
      [rect.x, rect.y + offset, rect.width, rect.height]
        .map((value) => Number(value.toFixed(6)))
        .join(' ');
    const frames = arrivalWrites[show]?.split(' ')[4];
    for (const [verb, rect] of [
      ['FILL', fill],
      ['CLIP', clip],
    ] as const) {
      expect(arrivalWrites.slice(0, startHidden)).toContain(
        target + ' ' + verb + ' ' + native(rect, 1) + ' 0 linear DEFER',
      );
      expect(arrivalWrites.slice(parkedCommit + 1, show)).toContain(
        target + ' ' + verb + ' ' + native(rect, 0) + ' ' + frames + ' linear DEFER',
      );
    }
    expect(visible().find((record) => record.sourceId === sourceId)).toMatchObject({ clip, fill });
  }
});

it('dips the retained picture when Fade is checked and releases linked titles only after the preset settles', async () => {
  const r = await bootPresetDeparture(PRESET_TITLE_HOLD_HTML);
  const itemId = 'item-1';
  const records = r.liveLayers().get(itemId)!;
  const guest = records.find(({ sourceId }) => sourceId === 'guest-1')!;
  for (const look of ['solo', 'duo']) {
    const start = (await recvLines()).length;
    expect(await r.setActiveLook(itemId, look, PRESET_EFFECT)).toEqual({ ok: true });
    const lines = (await recvLines()).slice(start);
    const retainedDip = lines.findIndex(
      (line) =>
        line.startsWith(`MIXER 1-${guest.slot.layer} OPACITY 0 `) && line.endsWith(' DEFER'),
    );
    const retainedRestore = lines.findIndex(
      (line, index) =>
        index > retainedDip &&
        line.startsWith(`MIXER 1-${guest.slot.layer} OPACITY 1 `) &&
        line.endsWith(' DEFER'),
    );
    expect(retainedDip).toBeGreaterThan(0);
    expect(retainedRestore).toBeGreaterThan(retainedDip);
    const lastMixerCommit = lines.lastIndexOf('MIXER 1 COMMIT');
    for (const layer of [10, DEPARTURE_BAND.end]) {
      const prefix = `CG 1-${layer} UPDATE `;
      const updates = lines.filter((line) => line.startsWith(prefix));
      expect(updates.slice(0, -1).every((line) => line.includes('hidePresetTitlePlateIds'))).toBe(
        true,
      );
      expect(
        updates.some((line) => line.includes('hidePresetTitlePlateIds') && line.includes(look)),
      ).toBe(true);
      expect(lines.indexOf(updates.at(-1)!)).toBeGreaterThan(lastMixerCommit);
      expect(JSON.parse(mock!.lastCgUpdate({ channel: 1, layer })?.data ?? '{}')).toMatchObject({
        __cg: { frameTransition: null, presetTransitionCommit: true },
      });
    }
  }
});

it.each([false, true])(
  'animates native pictures and artwork across a verified A/B pair (missing B media: %s)',
  async (missingMedia) => {
    const r = await bootPresetDeparture(
      PRESET_TITLE_HOLD_HTML,
      false,
      false,
      missingMedia ? { missingMedia: true } : {},
    );
    const itemId = 'item-1';
    const b = backup!;
    const quietBefore = b.receivedCommands().length;
    const activeBefore = mock!.receivedCommands().length;
    const media = r
      .liveLayers()
      .get(itemId)
      ?.find(({ sourceId }) => sourceId === 'guest-2');
    expect(media).toBeDefined();
    const shared = r
      .liveLayers()
      .get(itemId)
      ?.find(({ sourceId }) => sourceId === 'guest-1');
    expect(shared).toBeDefined();
    const reserveShared = { channel: 2, layer: shared!.slot.layer };
    const initialFill = b.layerState(reserveShared)?.fill;
    expect(await r.setActiveLook(itemId, 'solo', PRESET_EFFECT)).toEqual({ ok: true });
    expect(b.layerState(reserveShared)?.fill).not.toEqual(initialFill);
    expect(b.layerState(reserveShared)?.fill).toEqual(mock!.layerState(shared!.slot)?.fill);
    expect(b.layerState(reserveShared)?.clip).toEqual(mock!.layerState(shared!.slot)?.clip);
    const reserveMotion = b
      .receivedCommands()
      .slice(quietBefore)
      .find(({ line }) => /^MIXER 2-\d+ FILL .*easeinquad DEFER$/.test(line));
    const activeRelease = mock!
      .receivedCommands()
      .slice(activeBefore)
      .find(({ line }) => line.includes('frameTransition') && line.includes('null'));
    expect(reserveMotion).toBeDefined();
    expect(activeRelease).toBeDefined();
    expect(reserveMotion!.at).toBeLessThan(activeRelease!.at);
    expect(await r.setActiveLook(itemId, 'duo', PRESET_EFFECT)).toEqual({ ok: true });
    expect(b.layerState(reserveShared)?.fill).toEqual(initialFill);
    const activeLines = mock!
      .receivedCommands()
      .slice(activeBefore)
      .map(({ line }) => line);
    const backupLines = b
      .receivedCommands()
      .slice(quietBefore)
      .map(({ line }) => line);
    expect(activeLines).toContainEqual(expect.stringMatching(/FILL .*easeinquad DEFER$/));
    expect(activeLines).toContainEqual(expect.stringContaining('hidePresetTitlePlateIds'));
    expect(backupLines).toContainEqual(
      expect.stringMatching(/^MIXER 2-\d+ FILL .*easeinquad DEFER$/),
    );
    expect(backupLines).toContainEqual(expect.stringContaining('hidePresetTitlePlateIds'));
    expect(backupLines.filter((line) => line === 'MIXER 2 COMMIT').length).toBeGreaterThan(1);
    for (const layer of [10, PRESET_RECOVERY_BAND.end]) {
      const compared = backupLines.filter((line) => line.startsWith(`CG 2-${layer} UPDATE `));
      expect(compared.find((line) => line.includes('solo'))).toContain('solo');
      expect(compared.at(-1)).toContain('duo');
      expect(JSON.parse(b.lastCgUpdate({ channel: 2, layer })?.data ?? '{}')).toMatchObject({
        __cg: { look: 'duo', frameTransition: null, presetTransitionCommit: true },
      });
    }
    if (missingMedia) {
      expect(r.stackSnapshot()[0]?.backupNoCopy).toBeDefined();
      expect(b.layerState({ channel: 2, layer: media!.slot.layer })?.producer ?? 'empty').toBe(
        'empty',
      );
    }
  },
);

it('commits the active preset while an acknowledged reserve phase waits for its reply', async () => {
  const r = await bootPresetDeparture(PRESET_TITLE_HOLD_HTML, false, false, {});
  const b = backup!;
  const normal = defaultHandlers().get('MIXER')!;
  let release: (() => void) | undefined;
  b.setHandler('MIXER', async (request, context, connection) => {
    const reply = normal(request, context, connection);
    if (release === undefined && request.raw.endsWith('linear DEFER')) {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    }
    return reply;
  });
  const applied = r.setActiveLook('item-1', 'solo', PRESET_EFFECT);
  try {
    await expect.poll(() => release !== undefined, { timeout: HEALTH_MS }).toBe(true);
    await expect.poll(() => r.activeLookId('item-1'), { timeout: HEALTH_MS }).toBe('solo');
    await expect(applied).resolves.toEqual({ ok: true });
  } finally {
    release?.();
  }
  await expect
    .poll(() => b.lastCgUpdate({ channel: 2, layer: 10 })?.data, { timeout: HEALTH_MS })
    .toContain('solo');
  const start = b.receivedCommands().length;
  await expect(r.setActiveLook('item-1', 'duo', PRESET_EFFECT)).resolves.toEqual({ ok: true });
  expect(
    b
      .receivedCommands()
      .slice(start)
      .some(({ line }) => line === 'MIXER 2 COMMIT'),
  ).toBe(true);
});

it('clears the reserve during a stalled preset phase and drains its staged geometry', async () => {
  const r = await bootPresetDeparture(PRESET_TITLE_HOLD_HTML, false, false, {});
  const b = backup!;
  const itemId = 'item-1';
  const normal = defaultHandlers().get('MIXER')!;
  let release: (() => void) | undefined;
  b.setHandler('MIXER', async (request, context, connection) => {
    const response = normal(request, context, connection);
    if (release === undefined && request.raw.endsWith('linear DEFER')) {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    }
    return response;
  });
  const edit = r.setActiveLook(itemId, 'solo', PRESET_EFFECT);
  try {
    await expect.poll(() => release !== undefined, { timeout: HEALTH_MS }).toBe(true);
    const from = b.receivedCommands().length;
    const out = r.out(itemId);
    release?.();
    await expect(out).resolves.toMatchObject({ accepted: true });
    await expect(edit).resolves.toMatchObject({ ok: false });
    const wire = () =>
      b
        .receivedCommands()
        .slice(from)
        .map(({ line }) => line);
    await expect.poll(wire, { timeout: HEALTH_MS }).toContain('CLEAR 2-10');
    await expect.poll(wire, { timeout: HEALTH_MS }).toContain('MIXER 2 COMMIT');
    expect(b.layerState({ channel: 2, layer: 10 })?.producer ?? 'empty').toBe('empty');
    expect(wire().some((line) => line.includes('authoredPreset'))).toBe(false);
  } finally {
    release?.();
  }
});

it.each([false, true])(
  'never commits an interrupted active-engine preset phase to the promoted reserve (recovery refused: %s)',
  async (rejectRecovery) => {
    const r = await bootPresetDeparture(PRESET_TITLE_HOLD_HTML, false, false, { nextTake: true });
    const b = backup!;
    const prior = b.receivedCommands().length;
    const departing = r
      .liveLayers()
      .get('item-1')!
      .find(({ sourceId }) => sourceId === 'guest-2')!;
    const priorOpacity = mock!.layerState(departing.slot)?.opacity;
    const normal = defaultHandlers().get('MIXER')!;
    let resume: (() => void) | undefined;
    mock!.setHandler('MIXER', async (request, context, connection) => {
      const result = normal(request, context, connection);
      if (resume === undefined && / OPACITY 0 [1-9]\d* linear DEFER$/.test(request.raw))
        await new Promise<void>((resolve) => {
          resume = resolve;
        });
      return result;
    });
    const operation = r.setActiveLook('item-1', 'solo', PRESET_EFFECT);
    let demotedLineCount = 0;
    try {
      await expect.poll(() => resume !== undefined, { timeout: HEALTH_MS }).toBe(true);
      expect(await r.failover()).toEqual({ ok: true, newPrimary: 'B' });
      demotedLineCount = mock!.receivedCommands().length;
    } finally {
      resume?.();
    }
    expect(await operation).toMatchObject({ ok: false });
    expect(r.activeLookId('item-1')).toBe('duo');
    const promotedLines = b
      .receivedCommands()
      .slice(prior)
      .map(({ line }) => line);
    expect(
      promotedLines.some((line) => line.startsWith('MIXER 2') || line.startsWith('CG 2')),
    ).toBe(false);
    const independent = { ...template([{ id: 'guest-4', rect: BOX }]), templateId: 'other-layout' };
    expect(r.templateImport(independent, '<!doctype html><html>Next Take</html>').registered).toBe(
      true,
    );
    await r.load('item-2', independent.templateId, {});
    expect(await r.take('item-2')).toMatchObject({ accepted: true });
    expect(
      b
        .receivedCommands()
        .slice(prior)
        .some(({ line }) => line === 'MIXER 2 COMMIT'),
    ).toBe(true);
    expect(
      mock!
        .receivedCommands()
        .slice(demotedLineCount)
        .filter(({ line }) => /^(?:MIXER|PLAY|CG) 1(?:[- ]|$)/.test(line)),
    ).toEqual([]);
    const beforeRecoveryA = mock!.receivedCommands().length;
    const beforeRecoveryB = b.receivedCommands().length;
    const repairLinePrefix = `MIXER 1-${String(departing.slot.layer)} FILL `;
    if (rejectRecovery) {
      mock!.setHandler('MIXER', (request, context, connection) => {
        if (request.raw.startsWith(repairLinePrefix))
          return { kind: 'err', code: 502, verb: 'MIXER' };
        return normal(request, context, connection);
      });
    }
    expect(await r.failover()).toEqual({ ok: true, newPrimary: 'A' });
    const restored = () =>
      mock!
        .receivedCommands()
        .slice(beforeRecoveryA)
        .map(({ line }) => line);
    const reserveMixer = () =>
      b
        .receivedCommands()
        .slice(beforeRecoveryB)
        .map(({ line }) => line)
        .filter((line) => /^MIXER 2[- ]/.test(line));
    if (rejectRecovery) {
      await expect
        .poll(() => restored().some((line) => line.startsWith(repairLinePrefix)), {
          timeout: HEALTH_MS,
        })
        .toBe(true);
      expect(reserveMixer()).toEqual([]);
      await r.setActiveLook('item-1', 'solo');
      expect(restored().filter((line) => line.endsWith(' DEFER'))).toHaveLength(1);
      expect(restored()).not.toContain('MIXER 1 COMMIT');
      expect(reserveMixer().filter((line) => / (?:DEFER|COMMIT)$/.test(line))).toEqual([]);
    } else {
      await expect.poll(restored, { timeout: HEALTH_MS }).toContain('MIXER 1 COMMIT');
      const reassertion = restored().indexOf(
        `MIXER 1-${String(departing.slot.layer)} OPACITY 1 DEFER`,
      );
      expect(reassertion).toBeGreaterThanOrEqual(0);
      expect(reassertion).toBeLessThan(restored().indexOf('MIXER 1 COMMIT'));
      expect(reserveMixer()).toEqual([]);
    }
    expect(mock!.layerState(departing.slot)?.opacity).toBe(priorOpacity);
  },
);

it('animates the active programme without changing an unconfirmed reserve after it reconnects', async () => {
  const r = await bootPresetDeparture(PRESET_TITLE_HOLD_HTML, false, false, {});
  const b = backup!;
  const versions = () => b.receivedCommands().filter(({ line }) => line === 'VERSION').length;
  const initialConnections = versions();
  b.closeAllAmcpConnections();
  await expect.poll(versions, { timeout: HEALTH_MS }).toBeGreaterThan(initialConnections);
  await expect.poll(() => r.health().backup?.state, { timeout: HEALTH_MS }).toBe('healthy');
  expect(b.layerState({ channel: 2, layer: 10 })?.producer).toBe('html');
  const previousSeats = r
    .liveLayers()
    .get('item-1')!
    .map(({ slot }) => {
      const reserveSlot = { channel: 2, layer: slot.layer };
      return [reserveSlot, b.layerState(reserveSlot)] as const;
    });
  const before = b.receivedCommands().length;
  const activeBefore = mock!.receivedCommands().length;
  expect(await r.setActiveLook('item-1', 'solo', PRESET_EFFECT)).toEqual({ ok: true });
  expect(r.activeLookId('item-1')).toBe('solo');
  expect(
    mock!
      .receivedCommands()
      .slice(activeBefore)
      .map(({ line }) => line),
  ).toContainEqual(expect.stringMatching(/FILL .*easeinquad DEFER$/));
  const latest = b
    .receivedCommands()
    .slice(before)
    .map(({ line }) => line);
  expect(
    latest.filter((line) => /^(CG|MIXER|PLAY|PAUSE|RESUME|CLEAR) 2(?: |-|$)/.test(line)),
  ).toEqual([]);
  for (const [slot, state] of previousSeats) expect(b.layerState(slot)).toEqual(state);
});

it('restores the original preset on the reserve when the active engine refuses the final commit', async () => {
  const r = await bootPresetDeparture(PRESET_TITLE_HOLD_HTML, false, false, {});
  const b = backup!;
  const itemId = 'item-1';
  const previousSeats = r
    .liveLayers()
    .get(itemId)!
    .map(({ slot }) => {
      const reserveSlot = { channel: 2, layer: slot.layer };
      return [reserveSlot, b.layerState(reserveSlot)] as const;
    });
  const before = b.receivedCommands().length;
  const normalCg = defaultHandlers().get('CG')!;
  const normalMixer = defaultHandlers().get('MIXER')!;
  let destinationTold = false;
  let refused = false;
  mock!.setHandler('CG', (request, context, connection) => {
    if (
      request.raw.startsWith(`CG 1-${PRESET_RECOVERY_BAND.end} UPDATE `) &&
      request.raw.includes('presetTransitionCommit') &&
      request.raw.includes('solo')
    )
      destinationTold = true;
    return normalCg(request, context, connection);
  });
  mock!.setHandler('MIXER', (request, context, connection) => {
    if (destinationTold && !refused && request.raw === 'MIXER 1 COMMIT') {
      refused = true;
      return { kind: 'err', code: 502, verb: 'MIXER' };
    }
    return normalMixer(request, context, connection);
  });
  expect(await r.setActiveLook(itemId, 'solo', PRESET_EFFECT)).toMatchObject({
    ok: false,
    reason: 'amcp-502',
  });
  expect(refused).toBe(true);
  expect(r.activeLookId(itemId)).toBe('duo');
  const latest = b.receivedCommands().slice(before);
  expect(latest.some(({ line }) => line.includes('authoredPreset'))).toBe(true);
  expect(latest.some(({ line }) => line.includes('restorePresetEffectId'))).toBe(true);
  for (const [slot, state] of previousSeats) expect(b.layerState(slot)).toEqual(state);
});

it.each([false, true])(
  'guards interrupted preset recovery on reconnect (producer removed: %s)',
  async (removed) => {
    const r = await bootPresetDeparture(PRESET_RECOVERY_HTML);
    const itemId = 'item-1';
    expect(await r.setActiveLook(itemId, 'solo')).toEqual({ ok: true });
    const original = r
      .liveLayers()
      .get(itemId)!
      .map(({ slot }) => [slot, mock!.layerState(slot)] as const);
    const background = { channel: 1, layer: 10 };
    const pageSlots = [background, { channel: 1, layer: PRESET_RECOVERY_BAND.end }];
    const cg = defaultHandlers().get('CG')!;
    let recoverId: unknown;
    mock!.setHandler('CG', (request, context, connection) => {
      const replied = cg(request, context, connection);
      if (
        recoverId === undefined &&
        request.raw.includes('presetTransitionCommit') &&
        request.raw.includes('presetEffectId') &&
        request.raw.includes('duo')
      ) {
        recoverId = JSON.parse(mock!.lastCgUpdate(background)?.data ?? '{}').__cg?.presetEffectId;
        if (removed) {
          for (const slot of pageSlots)
            context.setLayer(slot, { producer: 'empty', filePath: '', onAir: false });
        }
        // The producer received the destination write, but Bridge never saw the reply.
        mock!.closeAllAmcpConnections();
      }
      return replied;
    });
    const before = (await recvLines()).length;
    expect(await r.setActiveLook(itemId, 'duo', PRESET_EFFECT)).toMatchObject({ ok: false });
    expect(recoverId).toEqual(expect.any(String));
    await r.whenServerHealthy(HEALTH_MS);
    if (removed) {
      expect(r.stackSnapshot()[0]?.onAirPresetTransition).toBeUndefined();
      expect(
        (await recvLines()).slice(before).some((line) => line.includes('restorePresetEffectId')),
      ).toBe(false);
      expect(pageSlots.map((slot) => mock!.layerState(slot)?.producer)).toEqual(['empty', 'empty']);
      return;
    }

    await expect
      .poll(
        () => pageSlots.map((slot) => JSON.parse(mock!.lastCgUpdate(slot)?.data ?? '{}').__cg),
        {
          timeout: HEALTH_MS,
        },
      )
      .toEqual(
        pageSlots.map(() => ({
          restorePresetEffectId: recoverId,
          restorePresetEffect: expect.objectContaining({ look: 'solo', frameTransition: null }),
        })),
      );
    expect(r.stackSnapshot()[0]?.activeLookId).toBe('solo');
    for (const [slot, state] of original) expect(mock!.layerState(slot)).toEqual(state);
    expect(mock!.stagedMixerCount(1)).toBe(0);
  },
);

it('cleans up only the fresh preset arrival fragment after its reveal commit loses the reply', async () => {
  const r = await bootPresetDeparture(PRESET_RECOVERY_HTML, false, true);
  const itemId = 'item-1';
  expect(await r.setActiveLook(itemId, 'solo')).toEqual({ ok: true });
  const previous = r.liveLayers().get(itemId)!;
  expect(previous).toHaveLength(3);
  const original = previous.map(({ slot }) => [slot, mock!.layerState(slot)] as const);
  const layerIds = new Set(previous.map(({ slot }) => slot.layer));
  const mixer = defaultHandlers().get('MIXER')!;
  let revealedLayer: number | undefined;
  let disconnected = false;
  let opacityAtDisconnect: number | undefined;
  mock!.setHandler('MIXER', (request, context, connection) => {
    const replied = mixer(request, context, connection);
    const fade = /^MIXER 1-(\d+) OPACITY 1 [1-9]\d* linear DEFER$/.exec(request.raw);
    if (fade !== null) {
      const layer = Number(fade[1]);
      if (!layerIds.has(layer) && context.getLayer({ channel: 1, layer }).producer === 'route') {
        revealedLayer = layer;
      }
    }
    if (!disconnected && revealedLayer !== undefined && request.raw === 'MIXER 1 COMMIT') {
      disconnected = true;
      opacityAtDisconnect = context.getLayer({ channel: 1, layer: revealedLayer }).opacity;
      mock!.closeAllAmcpConnections();
    }
    return replied;
  });
  const before = (await recvLines()).length;
  expect(await r.setActiveLook(itemId, 'duo', PRESET_EFFECT)).toMatchObject({ ok: false });
  expect(disconnected).toBe(true);
  expect(opacityAtDisconnect).toBe(1);
  if (revealedLayer === undefined) throw new Error('The staged arrival fragment did not reveal');
  const slot = { channel: 1, layer: revealedLayer };
  await r.whenServerHealthy(HEALTH_MS);
  await expect.poll(() => mock!.layerState(slot)?.producer, { timeout: HEALTH_MS }).toBe('empty');
  const lines = (await recvLines()).slice(before);
  const reveal = lines.findIndex(
    (line) => line.startsWith(`MIXER 1-${slot.layer} OPACITY 1 `) && line.endsWith('linear DEFER'),
  );
  const landed = lines.indexOf('MIXER 1 COMMIT', reveal + 1);
  const hide = lines.findIndex(
    (line, i) =>
      i > landed &&
      /^MIXER 1-\d+ OPACITY 0(?: |$)/.test(line) &&
      line.startsWith(`MIXER 1-${slot.layer} `),
  );
  const clear = lines.indexOf(`CLEAR 1-${slot.layer}`, landed + 1);
  expect(reveal).toBeGreaterThanOrEqual(0);
  expect(landed).toBeGreaterThan(reveal);
  expect(hide).toBeGreaterThan(landed);
  expect(clear).toBeGreaterThan(hide);
  for (const [oldSlot, state] of original) {
    expect(lines).not.toContain(`CLEAR 1-${oldSlot.layer}`);
    await expect.poll(() => mock!.layerState(oldSlot), { timeout: HEALTH_MS }).toEqual(state);
  }
  expect(r.stackSnapshot()[0]?.activeLookId).toBe('solo');
  expect(mock!.stagedMixerCount(1)).toBe(0);
});

it('retains Cut on an older resident page and when the same authored plate changes input', async () => {
  for (const [html, changed] of [
    [FRAME_HTML, false],
    [PRESET_EFFECT_HTML, true],
  ] as const) {
    const r = await boot({
      template: presetEffectTemplate(),
      html,
      ...(changed && {
        catalog: catalog({ layerRange: { start: BAND.start, end: BAND.end + 1 } }),
      }),
      assignments: assign([
        ['guest-1', 'src-a'],
        ['guest-2', 'src-b'],
      ]),
    });
    const itemId = 'item-1';
    if (changed) {
      await r.load(itemId, 'lower-third', {});
      expect(await r.swapLiveSource(itemId, 'guest-1', 'src-c', 'duo')).toMatchObject({ ok: true });
      expect(await r.take(itemId)).toMatchObject({ accepted: true });
      await expect.poll(() => r.stackSnapshot()[0]).toMatchObject({ onAirPresetTransition: true });
    } else {
      expect(await loadAndTake(r, itemId)).toMatchObject({ accepted: true });
      expect(r.stackSnapshot()[0]?.onAirPresetTransition).toBeUndefined();
    }
    const before = (await recvLines()).length;
    expect(await r.setActiveLook(itemId, 'duo', PRESET_EFFECT)).toEqual({ ok: true });
    expect((await recvLines()).slice(before).some((line) => line.includes('authoredPreset'))).toBe(
      false,
    );
    expect(r.stackSnapshot()[0]?.activeLookId).toBe('duo');
  }
});

it('restores the native seat and both page passes when the final preset packet is partly refused', async () => {
  const r = await boot({
    template: presetEffectTemplate(),
    html: PRESET_EFFECT_HTML,
    assignments: assign([
      ['guest-1', 'src-a'],
      ['guest-2', 'src-b'],
    ]),
  });
  const itemId = 'item-1';
  expect(await loadAndTake(r, itemId)).toMatchObject({ accepted: true });
  await expect.poll(() => r.stackSnapshot()[0]).toMatchObject({ onAirPresetTransition: true });
  const plate = { channel: 1, layer: 30 };
  const previous = mock!.layerState(plate);
  const normalCg = defaultHandlers().get('CG')!;
  let refused = false;
  mock!.setHandler('CG', (request, context, connection) => {
    if (
      !refused &&
      request.raw.startsWith(`CG 1-${BAND.end} UPDATE `) &&
      request.raw.includes('presetTransitionCommit') &&
      request.raw.includes('duo')
    ) {
      refused = true;
      return { kind: 'err', code: 502, verb: 'CG' };
    }
    return normalCg(request, context, connection);
  });
  expect(await r.setActiveLook(itemId, 'duo', PRESET_EFFECT)).toMatchObject({
    ok: false,
    reason: 'amcp-502',
  });
  expect(refused).toBe(true);
  expect(mock!.layerState(plate)).toEqual(previous);
  for (const layer of [10, BAND.end]) {
    expect(JSON.parse(mock!.lastCgUpdate({ channel: 1, layer })?.data ?? '{}')).toMatchObject({
      __cg: { look: 'solo', frameTransition: null, presetTransitionCommit: true },
    });
  }
  expect(r.stackSnapshot()[0]?.activeLookId).toBe('solo');
});

it('keeps the entering plate hidden if the final preset mixer commit is refused', async () => {
  const r = await boot({
    template: presetEffectTemplate(),
    html: PRESET_EFFECT_HTML,
    assignments: assign([
      ['guest-1', 'src-a'],
      ['guest-2', 'src-b'],
    ]),
  });
  const itemId = 'item-1';
  expect(await loadAndTake(r, itemId)).toMatchObject({ accepted: true });
  await expect.poll(() => r.stackSnapshot()[0]).toMatchObject({ onAirPresetTransition: true });
  const shared = { channel: 1, layer: 30 };
  const entering = { channel: 1, layer: 31 };
  const previousShared = mock!.layerState(shared);
  const previousEntering = mock!.layerState(entering);
  const normalMixer = defaultHandlers().get('MIXER')!;
  let commits = 0;
  mock!.setHandler('MIXER', (request, context, connection) => {
    if (request.raw === 'MIXER 1 COMMIT' && ++commits === 3)
      return { kind: 'err', code: 502, verb: 'MIXER' };
    return normalMixer(request, context, connection);
  });
  expect(await r.setActiveLook(itemId, 'duo', PRESET_EFFECT)).toMatchObject({
    ok: false,
    reason: 'amcp-502',
  });
  expect(commits).toBeGreaterThan(3);
  expect(mock!.layerState(shared)).toEqual(previousShared);
  expect(mock!.layerState(entering)).toEqual(previousEntering);
  expect(r.stackSnapshot()[0]?.activeLookId).toBe('solo');
});

it('keeps Cut available when the resident page has no frame transition support', async () => {
  const r = await boot({
    template: template([{ id: 'guest-1', rect: BOX, operatorFrame: FRAME }]),
    html: FRAME_HTML,
  });
  const itemId = 'item-1';
  expect(await loadAndTake(r, itemId)).toMatchObject({ accepted: true });
  await expect.poll(() => r.stackSnapshot()[0]).toMatchObject({ onAirFramePlacement: true });
  expect(r.stackSnapshot()[0]?.onAirFrameTransition).toBeUndefined();
  const before = (await recvLines()).length;
  expect(
    await r.setFramePlacements(itemId, [MOVED_FRAME], undefined, {
      motion: 'linear',
      fade: false,
      durationMs: 200,
    }),
  ).toMatchObject({ accepted: false, errorCode: 'frame-transition-unavailable' });
  expect((await recvLines()).slice(before).some((line) => /^(?:CG|MIXER) /.test(line))).toBe(false);
  expect(await r.setFramePlacements(itemId, [MOVED_FRAME])).toEqual({ accepted: true });
});

it('restores the previous frame and opacity when emergency silence interrupts a fade', async () => {
  const r = await boot({
    template: template([{ id: 'guest-1', rect: BOX, operatorFrame: FRAME }]),
    html: EFFECT_HTML,
  });
  const itemId = 'item-1';
  expect(await loadAndTake(r, itemId)).toMatchObject({ accepted: true });
  await expect.poll(() => r.stackSnapshot()[0]).toMatchObject({ onAirFrameTransition: true });
  expect(await r.setLivePlateVolume(itemId, 'guest-1', 0.5)).toMatchObject({
    ok: true,
    sent: true,
  });
  const plate = { channel: 1, layer: 30 };
  const previous = mock!.layerState(plate);
  const before = (await recvLines()).length;
  const edit = r.setFramePlacements(itemId, [MOVED_FRAME], undefined, {
    motion: 'cut',
    fade: true,
    durationMs: 1000,
  });
  await expect.poll(() => mock!.layerState(plate)?.opacity, { interval: 15 }).toBe(0);
  expect(await r.silenceAllLivePlates()).toMatchObject({ ok: true, silenced: 1 });
  expect(await edit).toMatchObject({ accepted: false, errorCode: 'frame-transition-interrupted' });
  expect(mock!.layerState(plate)).toMatchObject({
    fill: previous?.fill,
    clip: previous?.clip,
    opacity: 1,
    volume: 0,
  });
  expect(JSON.parse(mock!.lastCgUpdate({ channel: 1, layer: 10 })?.data ?? '{}')).toEqual({
    __cg: { framePlacements: [], frameTransition: null },
  });
  const writes = (await recvLines()).slice(before);
  expect(writes.indexOf('MIXER 1-30 VOLUME 0')).toBeLessThan(
    writes.indexOf('MIXER 1-30 OPACITY 1 0 linear DEFER'),
  );
  expect(
    writes.some(
      (line) => line.startsWith('MIXER 1-30 OPACITY 1 ') && !line.includes(' 0 linear DEFER'),
    ),
  ).toBe(false);
});

it('stops a resident row during fade without a delayed phase relighting it', async () => {
  const r = await boot({
    template: template([{ id: 'guest-1', rect: BOX, operatorFrame: FRAME }]),
    html: EFFECT_HTML,
  });
  const itemId = 'item-1';
  expect(await loadAndTake(r, itemId)).toMatchObject({ accepted: true });
  await expect.poll(() => r.stackSnapshot()[0]).toMatchObject({ onAirFrameTransition: true });
  const plate = { channel: 1, layer: 30 };
  const edit = r.setFramePlacements(itemId, [MOVED_FRAME], undefined, {
    motion: 'cut',
    fade: true,
    durationMs: 1000,
  });
  await expect.poll(() => mock!.layerState(plate)?.opacity, { interval: 15 }).toBe(0);
  const before = (await recvLines()).length;
  expect(await r.stopItem(itemId)).toMatchObject({ accepted: true });
  expect(await edit).toMatchObject({ accepted: false, errorCode: 'frame-transition-interrupted' });
  const tail = (await recvLines()).slice(before);
  expect(tail).toContain('CG 1-10 STOP 0');
  expect(tail.some((line) => line.includes('frameTransition') || line.includes('OPACITY'))).toBe(
    false,
  );
  expect(r.stackSnapshot()[0]?.framePlacements).toBeUndefined();
});

it('restores staged mixer geometry when Reload changes the layout during an on-air edit', async () => {
  const original = template([{ id: 'guest-1', rect: BOX, operatorFrame: FRAME }]);
  const r = await boot({ template: original, html: FRAME_HTML });
  const itemId = 'item-1';
  expect(await loadAndTake(r, itemId)).toMatchObject({ accepted: true });
  await expect.poll(() => r.stackSnapshot()[0]).toMatchObject({ onAirFramePlacement: true });
  const engine = mock;
  const mixer = defaultHandlers().get('MIXER');
  if (engine === null || mixer === undefined) throw new Error('Missing mixer');
  const plate = { channel: 1, layer: 30 };
  const previous = engine.layerState(plate);
  let replaced = false;
  engine.setHandler('MIXER', (request, context, connection) => {
    if (!replaced && request.raw === 'MIXER 1-30 FILL 0.5 0.5 0.25 0.25 DEFER') {
      replaced = true;
      const revised = template([{ id: 'guest-1', rect: { ...BOX, x: 192 }, operatorFrame: FRAME }]);
      r.templateImport(revised, FRAME_HTML.replace('served', 'different layout'));
    }
    return mixer(request, context, connection);
  });
  const before = (await recvLines()).length;
  await expect(r.setFramePlacements(itemId, [MOVED_FRAME])).resolves.toMatchObject({
    accepted: false,
    message: expect.stringContaining('previous placement was restored'),
  });
  expect(replaced).toBe(true);
  expect((await recvLines()).slice(before)).toEqual([
    'MIXER 1-30 FILL 0.5 0.5 0.25 0.25 DEFER',
    'MIXER 1-30 FILL 0.25 0.25 0.5 0.5 DEFER',
    'MIXER 1-30 CLIP 0.25 0.25 0.5 0.5 DEFER',
    'MIXER 1 COMMIT',
  ]);
  expect(engine.layerState(plate)).toEqual(previous);
  expect(r.stackSnapshot()[0]?.framePlacements).toBeUndefined();
});

const LIVE_POSITION_HTML = FRAME_HTML.replace('</head>', CG_LIVE_POSITION_PAGE_MARKER + '</head>');
const WHOLE_POSITION = { anchor: 'center', offset: { x: 192, y: 108 } } as const;

it('moves paired programme Position while keeping an input with no backup copy isolated', async () => {
  const guests = [
    { id: 'guest-1', rect: { ...BOX, x: 0 } },
    { id: 'guest-2', rect: { ...BOX, x: BOX.width } },
  ];
  const r = await boot({
    template: template(guests, true),
    html: LIVE_POSITION_HTML,
    mirrorChannel: 2,
    missingBackupMedia: true,
    catalog: catalog({
      sources: [
        { id: 'src-ndi', name: 'Camera', producer: { kind: 'ndi', source: 'Camera' } },
        { id: 'src-media', name: 'Clip', producer: { kind: 'media', file: 'clip.mov' } },
      ],
    }),
    assignments: assign([
      ['guest-1', 'src-ndi'],
      ['guest-2', 'src-media'],
    ]),
  });
  const primary = mock;
  const peer = backup;
  if (primary === null || peer === null) throw new Error('Missing paired engine');
  const itemId = 'item-1';
  await expect(loadAndTake(r, itemId)).resolves.toMatchObject({ accepted: true });
  await expect
    .poll(() => r.stackSnapshot()[0])
    .toMatchObject({ status: 'on-air', onAirPosition: true });
  const seats = r.liveLayers().get(itemId) ?? [];
  const camera = seats.find(({ sourceId }) => sourceId === 'guest-1');
  const media = seats.find(({ sourceId }) => sourceId === 'guest-2');
  if (camera === undefined || media?.backupRefused === undefined)
    throw new Error('Expected one mirrored seat and one missing backup copy');
  const backupCamera = { ...camera.slot, channel: 2 };
  const beforeCamera = peer.layerState(backupCamera);
  const before = peer.receivedCommands().length;
  await expect(r.update(itemId, {}, 'merge', undefined, WHOLE_POSITION)).resolves.toEqual({
    accepted: true,
  });
  expect(r.stackSnapshot()[0]?.position).toEqual(WHOLE_POSITION);
  expect(peer.layerState(backupCamera)?.clip).not.toEqual(beforeCamera?.clip);
  expect(peer.layerState(backupCamera)?.clip).toEqual(primary.layerState(camera.slot)?.clip);
  expect(peer.layerState(backupCamera)?.fill).toEqual(primary.layerState(camera.slot)?.fill);
  const peerWrites = peer
    .receivedCommands()
    .slice(before)
    .map(({ line }) => line);
  expect(peerWrites.some((line) => line.startsWith(`MIXER 2-${String(media.slot.layer)} `))).toBe(
    false,
  );
  expect(JSON.parse(peer.lastCgUpdate({ channel: 2, layer: 10 })?.data ?? '{}')).toEqual({
    __cg: { position: WHOLE_POSITION },
  });

  const mixer = defaultHandlers().get('MIXER');
  if (mixer === undefined) throw new Error('Missing mixer handler');
  const settled = peer.layerState(backupCamera);
  const next = { anchor: 'center', offset: { x: 278, y: 156 } } as const;
  const beforeRefusedCommit = peer.receivedCommands().length;
  let refusedCommit = false;
  primary.setHandler('MIXER', (request, context, connection) => {
    if (!refusedCommit && request.raw === 'MIXER 1 COMMIT') {
      refusedCommit = true;
      return { kind: 'err', code: 403, verb: 'MIXER', detail: 'COMMIT REFUSED' };
    }
    return mixer(request, context, connection);
  });
  // The established backup gets no writes while the new active position is unconfirmed.
  await expect(r.update(itemId, {}, 'merge', undefined, next)).resolves.toMatchObject({
    accepted: false,
  });
  expect(refusedCommit).toBe(true);
  expect(r.stackSnapshot()[0]?.position).toEqual(WHOLE_POSITION);
  expect(primary.layerState(camera.slot)?.fill).toEqual(settled?.fill);
  expect(primary.layerState(camera.slot)?.clip).toEqual(settled?.clip);
  expect(
    peer
      .receivedCommands()
      .slice(beforeRefusedCommit)
      .map(({ line }) => line)
      .filter((line) => /^(CG|MIXER) /.test(line)),
  ).toEqual([]);

  // A refused backup CLIP restores the preceding FILL and does not undo the active change.
  let refused = false;
  peer.setHandler('MIXER', (request, context, connection) => {
    if (!refused && request.raw.startsWith(`MIXER 2-${String(camera.slot.layer)} CLIP `)) {
      refused = true;
      return { kind: 'err', code: 403, verb: 'MIXER', detail: 'CLIP REFUSED' };
    }
    return mixer(request, context, connection);
  });
  await expect(r.update(itemId, {}, 'merge', undefined, next)).resolves.toEqual({
    accepted: true,
  });
  expect(refused).toBe(true);
  expect(r.stackSnapshot()[0]?.position).toEqual(next);
  expect(peer.layerState(backupCamera)?.fill).toEqual(settled?.fill);
  expect(peer.layerState(backupCamera)?.clip).toEqual(settled?.clip);
  expect(primary.layerState(camera.slot)?.fill).not.toEqual(settled?.fill);
});

it('does not move a same-kind backup input whose PLAY was refused', async () => {
  const r = await boot({
    template: template([{ id: 'guest-1', rect: { ...BOX, x: 0 } }], true),
    html: LIVE_POSITION_HTML,
    mirrorChannel: 2,
    catalog: catalog({
      sources: [{ id: 'src-ndi', name: 'Camera', producer: { kind: 'ndi', source: 'Camera' } }],
    }),
    assignments: assign([['guest-1', 'src-ndi']]),
  });
  const primary = mock;
  const peer = backup;
  if (primary === null || peer === null) throw new Error('Missing paired engine');
  const itemId = 'item-1';
  const peerSlot = { channel: 2, layer: BAND.start };
  const play = defaultHandlers().get('PLAY');
  if (play === undefined) throw new Error('Missing PLAY handler');
  let refused = false;
  peer.setHandler('PLAY', (request, context, connection) => {
    if (request.raw.startsWith(`PLAY 2-${String(peerSlot.layer)} [NDI] `)) {
      // An earlier, unrelated feed occupies the layer and reports the same producer kind.
      refused = true;
      context.setLayer(peerSlot, { producer: 'ndi', filePath: 'other-camera', onAir: true });
      return { kind: 'err', code: 403, verb: 'PLAY', detail: 'BACKUP PLAY REFUSED' };
    }
    return play(request, context, connection);
  });
  await expect(loadAndTake(r, itemId)).resolves.toMatchObject({ accepted: true });
  expect(refused).toBe(true);
  await expect
    .poll(() => r.stackSnapshot()[0])
    .toMatchObject({ status: 'on-air', onAirPosition: true });
  const seat = r.liveLayers().get(itemId)?.[0];
  if (seat === undefined) throw new Error('Expected a live seat');
  expect(seat.slot.layer).toBe(peerSlot.layer);
  expect(peer.layerState(peerSlot)?.producer).toBe(primary.layerState(seat.slot)?.producer);
  const baseline = peer.receivedCommands().length;
  await expect(r.update(itemId, {}, 'merge', undefined, WHOLE_POSITION)).resolves.toEqual({
    accepted: true,
  });
  expect(r.stackSnapshot()[0]?.position).toEqual(WHOLE_POSITION);
  expect(peer.layerState(peerSlot)?.filePath).toBe('other-camera');
  expect(
    peer
      .receivedCommands()
      .slice(baseline)
      .map(({ line }) => line)
      .filter((line) => line.startsWith(`MIXER 2-${String(peerSlot.layer)} `)),
  ).toEqual([]);
});

it('moves an on-air Live layer and its fields without restarting the foreground or inactive seats, keeping saved Pan', async () => {
  const itemId = 'item-1';
  const info = template(
    [
      { id: 'guest-1', rect: BOX, fitMode: 'cover' },
      { id: 'guest-2', rect: BOX, fitMode: 'cover' },
    ],
    true,
  );
  const r = await boot({
    template: {
      ...info,
      liveSources: {
        ...info.liveSources!,
        defaultLookId: 'one',
        looks: [
          {
            id: 'one',
            name: 'One',
            entered: { mode: 'cut' },
            rects: { 'guest-1': BOX },
            fits: { 'guest-1': 'cover' },
            operatorFrames: { 'guest-1': FRAME },
          },
          {
            id: 'two',
            name: 'Two',
            entered: { mode: 'cut' },
            rects: { 'guest-2': BOX },
            fits: { 'guest-2': 'cover' },
          },
        ],
      },
    },
    assignments: assign([
      ['guest-1', 'src-a'],
      ['guest-2', 'src-b'],
    ]),
    html: LIVE_POSITION_HTML,
  });
  await r.load(itemId, 'lower-third', { headline: 'before' });
  const frame = { ...MOVED_FRAME, lookId: 'one' };
  await expect(r.setFramePlacements(itemId, [frame])).resolves.toEqual({ accepted: true });
  expect(r.enterPreview(itemId)).toEqual({ ok: true });
  const focus = { x: 0.75, y: 0.25, zoom: 2 };
  const save = () => {
    const [target] = r.previewPlateCrop(itemId).targets;
    if (target === undefined) throw new Error('Expected the selected look to have a Pan target');
    expect(r.previewPlateCrop(itemId, undefined, [{ token: target.token, focus }]).ok).toBe(true);
    return target.token;
  };
  const firstToken = save();
  await expect(r.setActiveLook(itemId, 'two')).resolves.toEqual({ ok: true });
  const secondToken = save();
  await expect(r.setActiveLook(itemId, 'one')).resolves.toEqual({ ok: true });
  await expect(r.take(itemId)).resolves.toMatchObject({ accepted: true });
  const row = () => r.stackSnapshot().find((item) => item.itemId === itemId);
  await expect.poll(row).toMatchObject({ status: 'on-air', onAirPosition: true });
  const records = r.liveLayers().get(itemId) ?? [];
  const active = records.find(({ held }) => held !== true);
  const parked = records.find(({ held }) => held === true);
  if (active === undefined || parked === undefined)
    throw new Error('Expected visible and parked seats');
  const before = (await recvLines()).length;
  await expect(
    r.update(itemId, { headline: 'after' }, 'merge', undefined, WHOLE_POSITION),
  ).resolves.toEqual({
    accepted: true,
  });
  expect(
    (await recvLines()).slice(before).filter((line) => /^(CG |MIXER |PLAY |CLEAR )/.test(line)),
  ).toEqual([
    expect.stringMatching(/^MIXER 1-30 FILL .* DEFER$/),
    expect.stringMatching(/^MIXER 1-30 CLIP .* DEFER$/),
    expect.stringMatching(/^CG 1-10 UPDATE /),
    'MIXER 1 COMMIT',
  ]);
  expect(JSON.parse(mock!.lastCgUpdate({ channel: 1, layer: 10 })?.data ?? '{}')).toEqual({
    headline: 'after',
    __cg: { position: WHOLE_POSITION },
  });
  const after = r.liveLayers().get(itemId) ?? [];
  expect(after.find(({ held }) => held === true)).toEqual(parked);
  const moved = after.find(({ held }) => held !== true);
  expect(moved).toMatchObject({
    slot: active.slot,
    producer: active.producer,
  });
  for (const key of ['fill', 'clip'] as const) {
    expect(moved?.[key].x).toBeCloseTo(active[key].x + 0.1, 7);
    expect(moved?.[key].y).toBeCloseTo(active[key].y + 0.1, 7);
    expect(moved?.[key].width).toBe(active[key].width);
    expect(moved?.[key].height).toBe(active[key].height);
  }
  expect(row()).toMatchObject({
    fields: { headline: 'after' },
    position: WHOLE_POSITION,
    framePlacements: [frame],
  });
  const retained = RetainedStackItemSchema.parse(retainedFromStackItem(row()!));
  expect(retained.previewPlateCrops).toHaveLength(2);
  expect(retained.previewPlateCrops?.map(({ token }) => token)).not.toContain(firstToken);
  expect(retained.previewPlateCrops?.map(({ token }) => token)).not.toContain(secondToken);
  expect((await r.previewPlateCropOnAir(itemId)).targets).toMatchObject([{ focus }]);

  await expect(r.setActiveLook(itemId, 'two')).resolves.toEqual({ ok: true });
  expect((await r.previewPlateCropOnAir(itemId)).targets).toMatchObject([{ focus }]);
  await expect(r.stopItem(itemId)).resolves.toMatchObject({ accepted: true });
  await expect(r.take(itemId)).resolves.toMatchObject({ accepted: true });
  await expect
    .poll(async () => (await r.previewPlateCropOnAir(itemId)).targets)
    .toMatchObject([{ focus }]);
});

it('restores Position, fields and mixer geometry after a refused commit, and rejects unsafe geometry before writing', async () => {
  const itemId = 'item-1';
  const r = await boot({
    template: {
      ...template([{ id: 'guest-1', rect: BOX }]),
      fields: [
        { id: 'headline', label: 'Headline', type: 'text', required: false, default: 'authored' },
      ],
    },
    html: LIVE_POSITION_HTML,
  });
  expect(await loadAndTake(r, itemId)).toMatchObject({ accepted: true });
  const row = () => r.stackSnapshot()[0];
  await expect.poll(row).toMatchObject({ onAirPosition: true });
  const slot = { channel: 1, layer: 30 };
  const beforeFit = mock!.layerState(slot);
  const before = (await recvLines()).length;
  await expect(
    r.update(itemId, { headline: 'changed' }, 'merge', {}, WHOLE_POSITION),
  ).resolves.toMatchObject({
    accepted: false,
    errorCode: 'live-position-bindings-conflict',
  });
  await expect(
    r.update(itemId, {}, 'merge', undefined, { ...WHOLE_POSITION, offset: { x: 2000, y: 0 } }),
  ).resolves.toMatchObject({
    accepted: false,
    errorCode: 'live-position-unavailable',
  });
  expect(
    (await recvLines()).slice(before).filter((line) => /^(CG |MIXER |PLAY |CLEAR )/.test(line)),
  ).toEqual([]);

  const mixer = defaultHandlers().get('MIXER')!;
  let refused = false;
  mock!.setHandler('MIXER', (request, context, connection) => {
    if (!refused && request.raw === 'MIXER 1 COMMIT') {
      refused = true;
      return { kind: 'err', code: 502, verb: 'MIXER' };
    }
    return mixer(request, context, connection);
  });
  await expect(
    r.update(itemId, { headline: 'changed' }, 'merge', undefined, WHOLE_POSITION),
  ).resolves.toMatchObject({
    accepted: false,
    errorCode: 'amcp-502',
    message: expect.stringContaining('previous position was restored'),
  });
  expect(refused).toBe(true);
  expect(row()).toMatchObject({ fields: {}, onAirPosition: true });
  expect(row()?.position).toBeUndefined();
  expect(mock!.layerState(slot)).toEqual(beforeFit);
  expect(JSON.parse(mock!.lastCgUpdate({ channel: 1, layer: 10 })?.data ?? '{}')).toEqual({
    headline: 'authored',
    __cg: { position: CENTRED },
  });
});

it('merges concurrent edits to different frames of the same on-air row', async () => {
  const secondTarget = { ...FRAME, frameKey: 'el-guest-2', artworkKey: 'el-guest-2' };
  const second = {
    frameKey: secondTarget.frameKey,
    rect: { x: 120, y: 540, width: 480, height: 270 },
  };
  const r = await boot({
    template: template([
      { id: 'guest-1', rect: BOX, operatorFrame: FRAME },
      { id: 'guest-2', rect: { ...BOX, x: 960 }, operatorFrame: secondTarget },
    ]),
    assignments: assign([
      ['guest-1', 'src-a'],
      ['guest-2', 'src-b'],
    ]),
    html: FRAME_HTML,
  });
  const itemId = 'item-1';
  const row = () => r.stackSnapshot().find((item) => item.itemId === itemId);
  expect(await loadAndTake(r, itemId)).toMatchObject({ accepted: true });
  await expect.poll(row).toMatchObject({ onAirFramePlacement: true });
  const before = (await recvLines()).length;
  const results = await Promise.all([
    r.setFramePlacements(itemId, [MOVED_FRAME]),
    r.setFramePlacements(itemId, [second]),
  ]);
  expect(results).toEqual([{ accepted: true }, { accepted: true }]);
  expect(row()?.framePlacements).toEqual([MOVED_FRAME, second]);
  expect(JSON.parse(mock!.lastCgUpdate({ channel: 1, layer: 10 })?.data ?? '{}')).toEqual({
    __cg: { framePlacements: [MOVED_FRAME, second] },
  });
  const wire = (await recvLines()).slice(before).filter((line) => /^MIXER /.test(line));
  expect(wire).toEqual([
    'MIXER 1-30 FILL 0.5 0.5 0.25 0.25 DEFER',
    'MIXER 1-30 CLIP 0.5 0.5 0.25 0.25 DEFER',
    'MIXER 1 COMMIT',
    'MIXER 1-31 FILL 0.0625 0.5 0.25 0.25 DEFER',
    'MIXER 1-31 CLIP 0.0625 0.5 0.25 0.25 DEFER',
    'MIXER 1 COMMIT',
  ]);
});

it('keeps concurrent placement batches on the same channel separate until each COMMIT', async () => {
  const r = await boot({
    template: template([{ id: 'guest-1', rect: BOX, operatorFrame: FRAME }]),
    html: FRAME_HTML,
  });
  expect(await loadAndTake(r, 'item-1')).toMatchObject({ accepted: true });
  expect(await loadAndTake(r, 'item-2')).toMatchObject({ accepted: true });
  await expect
    .poll(() => r.stackSnapshot().filter(({ onAirFramePlacement }) => onAirFramePlacement))
    .toHaveLength(2);
  const before = (await recvLines()).length;
  const one = r.setFramePlacements('item-1', [MOVED_FRAME]);
  const two = r.setFramePlacements('item-2', [MOVED_FRAME]);
  await expect(Promise.all([one, two])).resolves.toEqual([{ accepted: true }, { accepted: true }]);
  const wire = (await recvLines()).slice(before).filter((line) => /^MIXER /.test(line));
  expect(wire).toEqual([
    'MIXER 1-30 FILL 0.5 0.5 0.25 0.25 DEFER',
    'MIXER 1-30 CLIP 0.5 0.5 0.25 0.25 DEFER',
    'MIXER 1 COMMIT',
    'MIXER 1-31 FILL 0.5 0.5 0.25 0.25 DEFER',
    'MIXER 1-31 CLIP 0.5 0.5 0.25 0.25 DEFER',
    'MIXER 1 COMMIT',
  ]);
});

it('applies free resizing to the exact Look instance with the foreground page resident', async () => {
  const second = { ...FRAME, frameKey: 'look-two/el-guest-1', resize: 'free' } as const;
  const free: LiveFramePlacement = {
    frameKey: second.frameKey,
    lookId: 'two',
    rect: { x: 960, y: 540, width: 480, height: 432 },
  };
  const first = { ...MOVED_FRAME, lookId: 'one' };
  const info = template([{ id: 'guest-1', rect: BOX, fitMode: 'cover' }], true);
  const r = await boot({
    template: {
      ...info,
      liveSources: {
        ...info.liveSources!,
        defaultLookId: 'one',
        looks: [
          {
            id: 'one',
            name: 'One',
            entered: { mode: 'cut' },
            rects: { 'guest-1': BOX },
            fits: { 'guest-1': 'cover' },
            operatorFrames: { 'guest-1': FRAME },
          },
          {
            id: 'two',
            name: 'Two',
            entered: { mode: 'cut' },
            rects: { 'guest-1': BOX },
            fits: { 'guest-1': 'cover' },
            operatorFrames: { 'guest-1': second },
          },
        ],
      },
    },
    html: FRAME_HTML,
  });
  const itemId = 'item-1';
  await r.load(itemId, 'lower-third', {});
  await expect(
    r.setFramePlacements(itemId, [first, { ...free, frameKey: FRAME.frameKey }]),
  ).resolves.toMatchObject({ accepted: false, errorCode: 'invalid-frame-placement' });
  await expect(r.setFramePlacements(itemId, [first])).resolves.toEqual({ accepted: true });
  await expect(r.take(itemId)).resolves.toMatchObject({ accepted: true });
  const plate = { channel: 1, layer: 30 };
  expect(mock!.layerState(plate)?.clip).toEqual({ x: 0.5, y: 0.5, width: 0.25, height: 0.25 });
  await expect(r.setActiveLook(itemId, 'two')).resolves.toEqual({ ok: true });
  expect(mock!.layerState(plate)?.clip).toEqual({ x: 0.25, y: 0.25, width: 0.5, height: 0.5 });
  await expect.poll(() => r.stackSnapshot()[0]).toMatchObject({ onAirFramePlacement: true });
  await expect(r.setFramePlacements(itemId, [free])).resolves.toEqual({ accepted: true });
  expect(mock!.layerState(plate)?.clip).toEqual({ x: 0.5, y: 0.5, width: 0.25, height: 0.4 });
  await expect(r.setActiveLook(itemId, 'one')).resolves.toEqual({ ok: true });
  expect(mock!.layerState(plate)?.clip).toEqual({ x: 0.5, y: 0.5, width: 0.25, height: 0.25 });
  expect(JSON.parse(mock!.lastCgUpdate({ channel: 1, layer: 10 })?.data ?? '{}')).toMatchObject({
    __cg: { look: 'one', framePlacements: [first, free] },
  });
});

it('applies placement on the active engine without writing to an unmapped reserve', async () => {
  const r = await boot({
    template: template([{ id: 'guest-1', rect: BOX, operatorFrame: FRAME }]),
    html: FRAME_HTML,
    redundant: true,
  });
  const itemId = 'item-1';
  await r.load(itemId, 'lower-third', {});
  await expect(r.setFramePlacements(itemId, [MOVED_FRAME])).resolves.toEqual({ accepted: true });
  await expect(r.take(itemId)).resolves.toMatchObject({ accepted: true });
  await expect.poll(() => r.stackSnapshot()[0]?.onAirFramePlacement).toBe(true);
  const reserve = backup;
  if (reserve === null) throw new Error('Missing backup fixture');
  const before = reserve.receivedCommands().length;
  await expect(r.setFramePlacements(itemId, [AUTHORED_FRAME])).resolves.toEqual({ accepted: true });
  expect(
    reserve
      .receivedCommands()
      .slice(before)
      .filter(({ line }) => /^(CG |MIXER |PLAY |CLEAR )/.test(line)),
  ).toEqual([]);
  expect(r.stackSnapshot()[0]?.framePlacements).toEqual([AUTHORED_FRAME]);
  expect(mock?.layerState({ channel: 1, layer: BAND.start })?.clip).toEqual({
    x: 0.25,
    y: 0.25,
    width: 0.5,
    height: 0.5,
  });
});

async function bootPairedFramePlacement(html: string): Promise<CasparRuntime> {
  const runtime = await boot({
    template: template([{ id: 'guest-1', rect: BOX, operatorFrame: FRAME }], true),
    html,
    mirrorChannel: 2,
    catalog: catalog({
      sources: [{ id: 'src-ndi', name: 'Camera', producer: { kind: 'ndi', source: 'Camera' } }],
    }),
    assignments: assign([['guest-1', 'src-ndi']]),
  });
  expect(await loadAndTake(runtime)).toMatchObject({ accepted: true });
  await expect.poll(() => runtime.stackSnapshot()[0]).toMatchObject({ onAirFramePlacement: true });
  return runtime;
}

it.each([false, true])(
  'moves and settles the same resident frames across a verified A/B pair (effect: %s)',
  async (animate) => {
    const r = await bootPairedFramePlacement(animate ? EFFECT_HTML : FRAME_HTML);
    const itemId = 'item-1';
    const active = mock;
    const reserve = backup;
    if (active === null || reserve === null) throw new Error('Missing mirrored engine fixture');
    const clip = { x: 0.5, y: 0.5, width: 0.25, height: 0.25 };
    const reservePlate = { channel: 2, layer: BAND.start };
    const activePlate = { channel: 1, layer: BAND.start };
    const reservePage = { channel: 2, layer: 10 };
    const initialReserve = reserve.layerState(reservePlate);
    expect(initialReserve?.producer).toBe('ndi');
    const start = reserve.receivedCommands().length;
    const activeStart = (await recvLines()).length;
    const transition: FrameTransition | undefined = animate
      ? { motion: 'ease-in', fade: false, durationMs: 160 }
      : undefined;
    if (animate) expect(r.stackSnapshot()[0]?.onAirFrameTransition).toBe(true);
    await expect(
      r.setFramePlacements(itemId, [MOVED_FRAME], undefined, transition),
    ).resolves.toEqual({ accepted: true });
    expect(active.layerState(activePlate)?.clip).toEqual(clip);
    expect(reserve.layerState(reservePlate)).toMatchObject({
      clip,
      producer: initialReserve?.producer,
      volume: initialReserve?.volume,
    });
    const reserveLines = reserve
      .receivedCommands()
      .slice(start)
      .map(({ line }) => line);
    expect(
      reserveLines.filter((line) => /^(PLAY|CLEAR|CG .* (ADD|PLAY|STOP))\b/.test(line)),
    ).toEqual([]);
    expect(reserveLines.some((line) => /DEFER$|COMMIT$|easeinquad/.test(line))).toBe(false);
    expect(JSON.parse(reserve.lastCgUpdate(reservePage)?.data ?? '{}')).toMatchObject({
      __cg: { framePlacements: [MOVED_FRAME] },
    });
    const activeLines = (await recvLines()).slice(activeStart);
    expect(activeLines.some((line) => /FILL .*easeinquad DEFER$/.test(line))).toBe(animate);
    expect(r.stackSnapshot()[0]?.framePlacements).toEqual([MOVED_FRAME]);
  },
);

it('never applies an interrupted frame effect to a newly promoted reserve', async () => {
  const r = await bootPairedFramePlacement(EFFECT_HTML);
  const active = mock;
  const reserve = backup;
  const mixer = defaultHandlers().get('MIXER');
  if (active === null || reserve === null || mixer === undefined)
    throw new Error('Missing mirrored engine fixture');
  let finishStage: (() => void) | undefined;
  active.setHandler('MIXER', async (request, context, connection) => {
    const result = mixer(request, context, connection);
    if (finishStage === undefined && /FILL .*easeinquad DEFER$/.test(request.raw)) {
      await new Promise<void>((resolve) => {
        finishStage = resolve;
      });
    }
    return result;
  });
  const slot = { channel: 2, layer: BAND.start };
  const originalReserve = reserve.layerState(slot);
  const start = reserve.receivedCommands().length;
  const edit = r.setFramePlacements('item-1', [MOVED_FRAME], undefined, {
    motion: 'ease-in',
    fade: false,
    durationMs: 160,
  });
  try {
    await expect.poll(() => finishStage !== undefined, { timeout: HEALTH_MS }).toBe(true);
    expect(await r.failover()).toEqual({ ok: true, newPrimary: 'B' });
  } finally {
    finishStage?.();
  }
  expect(await edit).toMatchObject({ accepted: false });
  expect(reserve.layerState(slot)).toEqual(originalReserve);
  expect(
    reserve
      .receivedCommands()
      .slice(start)
      .filter(({ line }) => /^(CG|MIXER) 2/.test(line)),
  ).toEqual([]);
});

it('D-202 — multiple reveals are refused atomically when only one extra seat fits', async () => {
  const r = await boot({
    template: template([
      {
        id: 'upper',
        rect: BOX,
        revealMask: {
          targetSourceId: 'lower',
          rect: { x: 0.1, y: 0.5, width: 0.8, height: 0.4 },
          additionalRects: [{ x: 0.2, y: 0.1, width: 0.6, height: 0.2 }],
        },
      },
      { id: 'lower', rect: BOX },
    ]),
    catalog: catalog({ layerRange: { start: 30, end: 32 } }),
    assignments: assign([
      ['upper', 'src-b'],
      ['lower', 'src-a'],
    ]),
  });
  await r.load('item-1', 'lower-third', {});
  const before = (await recvLines()).length;

  const verdict = await r.take('item-1');

  expect(verdict).toMatchObject({ accepted: false, errorCode: 'live-source-no-layer' });
  expect(r.liveLayers().has('item-1')).toBe(false);
  expect((await recvLines()).slice(before)).toEqual([]);
});

it('D-202 — Mask and Revert crop a single producer and mute its routed fragments', async () => {
  const info = template([{ id: 'guest-1', rect: BOX }], true);
  const sources = info.liveSources!;
  const rects = [{ x: 0.25, y: 0.25, width: 0.5, height: 0.5 }];
  const r = await boot({
    template: {
      ...info,
      liveSources: {
        ...sources,
        defaultLookId: 'mask',
        looks: [
          {
            id: 'mask',
            name: 'Mask',
            entered: { mode: 'cut' },
            rects: { 'guest-1': BOX },
            masks: { 'guest-1': { mode: 'inside', rects } },
          },
          {
            id: 'revert',
            name: 'Revert',
            entered: { mode: 'cut' },
            rects: { 'guest-1': BOX },
            masks: { 'guest-1': { mode: 'outside', rects } },
          },
        ],
      },
    },
    catalog: catalog({ layerRange: { start: 30, end: 34 } }),
  });
  expect(await loadAndTake(r)).toMatchObject({ accepted: true });
  const fit = { x: 0.25, y: 0.25, width: 0.5, height: 0.5 };
  expect(mock?.layerState({ channel: 1, layer: 30 })).toMatchObject({
    fill: fit,
    clip: { x: 0.375, y: 0.375, width: 0.25, height: 0.25 },
  });
  expect(await r.setActiveLook('item-1', 'revert')).toMatchObject({ ok: true });
  const clips = [
    { x: 0.25, y: 0.25, width: 0.5, height: 0.125 },
    { x: 0.25, y: 0.625, width: 0.5, height: 0.125 },
    { x: 0.25, y: 0.375, width: 0.125, height: 0.25 },
    { x: 0.625, y: 0.375, width: 0.125, height: 0.25 },
  ];
  for (const [index, clip] of clips.entries()) {
    expect(mock?.layerState({ channel: 1, layer: 30 + index })).toMatchObject({
      fill: fit,
      clip,
      volume: 0,
    });
  }
  const revertWire = await recvLines();
  expect(
    revertWire.filter((line) => line.startsWith('PLAY ') && line.includes('"route://2"')),
  ).toHaveLength(1);
  expect(
    revertWire.filter((line) => line.startsWith('PLAY ') && line.includes('"route://1-30"')),
  ).toHaveLength(3);

  expect(await r.setActiveLook('item-1', 'mask')).toMatchObject({ ok: true });
  const maskWire = (await recvLines()).slice(revertWire.length);
  const hidden = at(maskWire, 'MIXER 1-33 OPACITY 0 DEFER');
  const committed = at(maskWire, 'MIXER 1 COMMIT');
  expect(hidden).toBeGreaterThanOrEqual(0);
  expect(committed).toBeGreaterThan(hidden);
  expect(at(maskWire, 'CLEAR 1-33')).toBeGreaterThan(committed);
  expect(maskWire).not.toContain('CLEAR 1-30');
  expect(maskWire).not.toContain('CLEAR 1-34');
});

const maskWindow = { x: 0.25, y: 0.25, width: 0.5, height: 0.5 };

it('keeps the underlying unmasked plate croppable when the upper plate owns a mask', async () => {
  const rect = { x: 720, y: 270, width: 480, height: 540 };
  const info = template([
    { id: 'lower', rect, fitMode: 'cover' },
    { id: 'upper', rect, fitMode: 'cover' },
  ]);
  const live = info.liveSources!;
  const r = await boot({
    template: {
      ...info,
      liveSources: {
        ...live,
        platePaintOrder: ['lower', 'upper'],
        sources: live.sources.map((source) =>
          source.sourceId === 'upper'
            ? { ...source, liveMask: { mode: 'inside', rects: [maskWindow] } }
            : source,
        ),
      },
    },
    assignments: assign([
      ['lower', 'src-a'],
      ['upper', 'src-b'],
    ]),
    html: MASK_HTML,
  });
  const itemId = 'item-1';
  expect(await r.load(itemId, 'lower-third', {})).toMatchObject({ accepted: true });
  expect(r.previewPlateCrop(itemId).targets.map(({ plateId }) => plateId)).toEqual(['lower']);
  expect(await r.take(itemId)).toMatchObject({ accepted: true });
  const [target] = (await r.previewPlateCropOnAir(itemId)).targets;
  expect(target?.plateId).toBe('lower');
  expect((await r.pgmPlateCrop(itemId)).targets.map(({ id }) => id)).toEqual(['lower']);
  if (target === undefined) throw new Error('Missing crop target for the lower plate');
  const upper = r
    .liveLayers()
    .get(itemId)
    ?.find(({ sourceId }) => sourceId === 'upper');
  if (upper === undefined) throw new Error('Missing upper plate');
  const previous = mock!.layerState(upper.slot);
  expect(
    await r.previewPlateCropOnAir(itemId, [{ token: target.token, focus: { x: 0.7, y: 0.5 } }]),
  ).toMatchObject({ ok: true });
  expect(mock!.layerState(upper.slot)).toEqual(previous);
});

function editableMaskTemplate(mode: 'inside' | 'outside'): TemplateInfo {
  const info = template([{ id: 'guest-1', rect: BOX, fitMode: 'cover' }]);
  const live = info.liveSources;
  if (live === undefined) throw new Error('Missing mask carrier');
  return {
    ...info,
    liveSources: {
      ...live,
      sources: live.sources.map((source) => ({
        ...source,
        operatorMaskEdit: true,
        liveMask: { mode, rects: [maskWindow] },
      })),
    },
  };
}

it('D-202 — saves an edited mask for Take and updates the same on-air input with rollback', async () => {
  const r = await boot({ template: editableMaskTemplate('inside'), html: MASK_HTML });
  const itemId = 'item-1';
  const graphic = { channel: 1, layer: 10 };
  const plate = { channel: 1, layer: 30 };
  const original: LiveMaskPlacement = {
    plateId: 'guest-1',
    kind: 'mask',
    index: 0,
    authored: maskWindow,
    rect: { ...maskWindow, x: 0.125 },
  };
  expect(await r.load(itemId, 'lower-third', {})).toEqual({ accepted: true });
  expect(r.previewPlateCrop(itemId)).toMatchObject({ ok: true, targets: [] });
  const beforeSave = (await recvLines()).length;
  await expect(r.setMaskPlacements(itemId, [original])).resolves.toEqual({ accepted: true });
  expect((await recvLines()).slice(beforeSave)).toEqual([]);
  expect(await r.take(itemId)).toMatchObject({ accepted: true });
  await expect.poll(() => r.stackSnapshot()[0]).toMatchObject({ onAirMaskPlacement: true });
  const initial = mock?.layerState(plate);
  expect(initial?.clip).toEqual({ x: 0.3125, y: 0.375, width: 0.25, height: 0.25 });
  expect(JSON.parse(mock?.lastCgUpdate(graphic)?.data ?? '{}')).toMatchObject({
    __cg: { maskPlacements: [original] },
  });
  expect(await r.previewPlateCropOnAir(itemId)).toMatchObject({ ok: true, targets: [] });
  expect(await r.pgmPlateCrop(itemId)).toMatchObject({ ok: true, targets: [] });
  const beforeCrop = (await recvLines()).length;
  await expect(
    r.previewPlateCropOnAir(itemId, [{ token: 'removed-draft', focus: { x: 0.25, y: 0.5 } }]),
  ).resolves.toMatchObject({
    ok: false,
  });
  expect((await recvLines()).slice(beforeCrop)).toEqual([]);

  const moved = { ...original, rect: { ...maskWindow, x: 0.5, height: 0.25 } };
  const beforeMove = (await recvLines()).length;
  await expect(
    r.setMaskPlacements(itemId, [{ ...moved, authored: { ...maskWindow, x: 0.125 } }]),
  ).resolves.toMatchObject({ accepted: false, errorCode: 'invalid-mask-placement' });
  await expect(r.setMaskPlacements(itemId, [moved])).resolves.toEqual({ accepted: true });
  expect((await recvLines()).slice(beforeMove)).toEqual([
    expect.stringMatching(/^MIXER 1-30 FILL .* DEFER$/),
    'MIXER 1-30 CLIP 0.5 0.375 0.25 0.125 DEFER',
    expect.stringMatching(/^CG 1-10 UPDATE /),
    'MIXER 1 COMMIT',
  ]);
  expect(mock?.layerState(plate)).toMatchObject({
    fill: initial?.fill,
    volume: initial?.volume,
    clip: { x: 0.5, y: 0.375, width: 0.25, height: 0.125 },
  });
  expect((await r.previewPlateCropOnAir(itemId)).targets).toEqual([]);
  expect(JSON.parse(mock?.lastCgUpdate(graphic)?.data ?? '{}')).toEqual({
    __cg: { maskPlacements: [moved] },
  });
  const state = r.stackSnapshot()[0];
  if (state === undefined) throw new Error('Missing mask row');
  expect(RetainedStackItemSchema.parse(retainedFromStackItem(state)).maskPlacements).toEqual([
    moved,
  ]);

  const engine = mock;
  const mixer = defaultHandlers().get('MIXER');
  if (engine === null || mixer === undefined) throw new Error('Missing mixer');
  let refuseCommit = true;
  engine.setHandler('MIXER', (request, context, connection) => {
    if (refuseCommit && request.raw === 'MIXER 1 COMMIT') {
      refuseCommit = false;
      return { kind: 'err', code: 502, verb: 'MIXER' };
    }
    return mixer(request, context, connection);
  });
  await expect(r.setMaskPlacements(itemId, [original])).resolves.toMatchObject({
    accepted: false,
    message: 'The engine refused the mask edit. The previous mask was restored.',
  });
  expect(engine.layerState(plate)?.clip).toEqual({ x: 0.5, y: 0.375, width: 0.25, height: 0.125 });
  expect(JSON.parse(engine.lastCgUpdate(graphic)?.data ?? '{}')).toEqual({
    __cg: { maskPlacements: [moved] },
  });
  expect(r.stackSnapshot()[0]?.maskPlacements).toEqual([moved]);
});

it('shares one authored mask across its preset instances without changing a different plate', async () => {
  const info = editableMaskTemplate('inside');
  const live = info.liveSources!;
  const ids = ['first', 'second', 'different'];
  const secondBox = { x: 960, y: 540, width: 480, height: 270 };
  const looks = ids.map((id) => ({
    id,
    name: id,
    entered: { mode: 'cut' as const },
    rects: { 'guest-1': id === 'first' ? BOX : secondBox },
    masks: { 'guest-1': { mode: 'inside' as const, rects: [maskWindow] } },
    operatorMaskEdits: ['guest-1'],
  }));
  const original = { ...info, liveSources: { ...live, defaultLookId: 'first', looks } };
  const current = {
    ...info,
    liveSources: {
      ...original.liveSources,
      looks: looks.map((look) => ({
        ...look,
        maskElementIds: { 'guest-1': look.id === 'different' ? 'other-plate' : 'shared-plate' },
      })),
    },
  };
  const r = await boot({ template: original, html: MASK_HTML });
  const itemId = 'item-1';
  const plate = { channel: 1, layer: 30 };
  const graphic = { channel: 1, layer: 10 };
  expect(await loadAndTake(r, itemId)).toMatchObject({ accepted: true });
  await expect.poll(() => r.stackSnapshot()[0]).toMatchObject({ onAirMaskPlacement: true });
  r.templateImport(current, MASK_HTML.replace('served', 'metadata upgrade'));

  const first: LiveMaskPlacement = {
    lookId: 'first',
    plateId: 'guest-1',
    kind: 'mask',
    index: 0,
    authored: maskWindow,
    rect: { ...maskWindow, x: 0.125 },
  };
  const second = { ...first, lookId: 'second' };
  const before = (await recvLines()).length;
  await expect(r.setMaskPlacements(itemId, [first])).resolves.toEqual({ accepted: true });
  expect((await recvLines()).slice(before)).toEqual([
    expect.stringMatching(/^MIXER 1-30 FILL .* DEFER$/),
    'MIXER 1-30 CLIP 0.3125 0.375 0.25 0.25 DEFER',
    expect.stringMatching(/^CG 1-10 UPDATE /),
    'MIXER 1 COMMIT',
  ]);
  const state = r.stackSnapshot()[0];
  if (state === undefined) throw new Error('Missing mask row');
  expect(RetainedStackItemSchema.parse(retainedFromStackItem(state)).maskPlacements).toEqual([
    first,
    second,
  ]);
  expect(JSON.parse(mock?.lastCgUpdate(graphic)?.data ?? '{}')).toEqual({
    __cg: { maskPlacements: [first, second] },
  });

  const afterSave = (await recvLines()).length;
  await expect(r.setMaskPlacements(itemId, [first, second])).resolves.toEqual({ accepted: true });
  await expect(
    r.setMaskPlacements(itemId, [first, { ...second, rect: { ...maskWindow, x: 0.5 } }]),
  ).resolves.toMatchObject({ accepted: false });
  expect((await recvLines()).slice(afterSave)).toEqual([]);
  expect(r.stackSnapshot()[0]?.maskPlacements).toEqual([first, second]);

  await expect(r.setActiveLook(itemId, 'different')).resolves.toMatchObject({ ok: true });
  expect(mock?.layerState(plate)?.clip).toEqual({
    x: 0.5625,
    y: 0.5625,
    width: 0.125,
    height: 0.125,
  });
  await expect(r.setActiveLook(itemId, 'second')).resolves.toMatchObject({ ok: true });
  expect(mock?.layerState(plate)?.clip).toEqual({
    x: 0.53125,
    y: 0.5625,
    width: 0.125,
    height: 0.125,
  });

  await expect(r.setMaskPlacements(itemId, [{ ...second, rect: maskWindow }])).resolves.toEqual({
    accepted: true,
  });
  expect(r.stackSnapshot()[0]?.maskPlacements).toEqual([]);
  await expect(r.setActiveLook(itemId, 'first')).resolves.toMatchObject({ ok: true });
  expect(mock?.layerState(plate)?.clip).toEqual({ x: 0.375, y: 0.375, width: 0.25, height: 0.25 });
});

it('D-202 — moves a linked reveal on its existing muted seat', async () => {
  const info = template([
    { id: 'upper', rect: BOX, revealMask: { targetSourceId: 'lower', rect: maskWindow } },
    { id: 'lower', rect: BOX },
  ]);
  const live = info.liveSources;
  if (live === undefined) throw new Error('Missing linked mask carrier');
  const r = await boot({
    template: {
      ...info,
      liveSources: {
        ...live,
        sources: live.sources.map((source) => ({
          ...source,
          ...(source.sourceId === 'upper' && { operatorMaskEdit: true as const }),
        })),
      },
    },
    html: MASK_HTML,
    assignments: assign([
      ['upper', 'src-b'],
      ['lower', 'src-a'],
    ]),
  });
  const itemId = 'item-1';
  expect(await loadAndTake(r, itemId)).toMatchObject({ accepted: true });
  await expect.poll(() => r.stackSnapshot()[0]).toMatchObject({ onAirMaskPlacement: true });
  const reveal = { channel: 1, layer: 32 };
  const before = (await recvLines()).length;
  await expect(
    r.setMaskPlacements(itemId, [
      {
        plateId: 'upper',
        kind: 'reveal',
        index: 0,
        authored: maskWindow,
        rect: { ...maskWindow, x: 0.5 },
      },
    ]),
  ).resolves.toEqual({ accepted: true });
  expect(mock?.layerState(reveal)).toMatchObject({
    clip: { x: 0.5, y: 0.375, width: 0.25, height: 0.25 },
    volume: 0,
  });
  expect((await recvLines()).slice(before)).toEqual([
    'MIXER 1-32 FILL 0.25 0.25 0.5 0.5 DEFER',
    'MIXER 1-32 CLIP 0.5 0.375 0.25 0.25 DEFER',
    expect.stringMatching(/^CG 1-10 UPDATE /),
    'MIXER 1 COMMIT',
  ]);
});

it('D-202 — keeps the live mask when a Revert edit changes the number of fragments', async () => {
  const r = await boot({
    template: editableMaskTemplate('outside'),
    html: MASK_HTML,
    catalog: catalog({ layerRange: { start: 30, end: 34 } }),
  });
  const itemId = 'item-1';
  expect(await loadAndTake(r, itemId)).toMatchObject({ accepted: true });
  await expect.poll(() => r.stackSnapshot()[0]).toMatchObject({ onAirMaskPlacement: true });
  const beforeSeats = r.liveLayers().get(itemId);
  expect(beforeSeats).toHaveLength(4);
  const before = (await recvLines()).length;
  const moved: LiveMaskPlacement = {
    plateId: 'guest-1',
    kind: 'mask',
    index: 0,
    authored: maskWindow,
    rect: { ...maskWindow, x: 0 },
  };
  await expect(r.setMaskPlacements(itemId, [moved])).resolves.toMatchObject({
    accepted: false,
    errorCode: 'mask-placement-on-air-unavailable',
  });
  expect((await recvLines()).slice(before)).toEqual([]);
  expect(r.liveLayers().get(itemId)).toEqual(beforeSeats);
  expect(r.stackSnapshot()[0]?.maskPlacements).toBeUndefined();
  expect(await r.stopItem(itemId)).toMatchObject({ accepted: true });
  await expect(r.setMaskPlacements(itemId, [moved])).resolves.toEqual({ accepted: true });
  expect(await r.take(itemId)).toMatchObject({ accepted: true });
  expect(r.liveLayers().get(itemId)).toHaveLength(3);
});

it('three plates become three layers against ONE item, and all three come down together', async () => {
  const r = await boot({
    template: template([
      { id: 'guest-1', rect: { x: 100, y: 100, width: 400, height: 225 } },
      { id: 'guest-2', rect: { x: 600, y: 100, width: 400, height: 225 } },
      { id: 'guest-3', rect: { x: 1100, y: 100, width: 400, height: 225 } },
    ]),
    assignments: assign([
      ['guest-1', 'src-a'],
      ['guest-2', 'src-b'],
      ['guest-3', 'src-c'],
    ]),
  });

  expect((await loadAndTake(r)).accepted).toBe(true);
  const records = r.liveLayers().get('item-1') ?? [];
  expect(records.map((rec) => rec.slot.layer)).toEqual([30, 31, 32]);

  await r.out('item-1');
  expect(r.liveLayers().has('item-1')).toBe(false);
  const lines = await recvLines();
  for (const layer of [30, 31, 32]) {
    expect(lines).toContain(`CLEAR 1-${String(layer)}`);
    expect(lines).toContain(`MIXER 1-${String(layer)} CLEAR`);
  }
});

it('🔴 a take of a row already on air is REFUSED — nothing re-seats, so no plate can move and strand a picture', async () => {
  /*
    This pinned "a RE-TAKE lands on the same layers": a re-take of an on-air row re-`PLAY`ed
    every plate, and the guard was that it re-`PLAY`ed them in place. `FIELD-FIXES-01-A`
    Decision 2 removed the re-take itself — on a DeckLink that re-`PLAY` fails by construction
    (`B-177`) and the rollback took working pictures off air — so the stronger form of the same
    guarantee is that nothing is sent at all and the plate stays exactly where it is.
  */
  const r = await boot({ template: template([{ id: 'guest-1', rect: BOX }]) });
  await loadAndTake(r);
  const first = r.liveLayers().get('item-1')?.[0]?.slot;
  const before = (await recvLines()).length;

  expect(await r.take('item-1')).toMatchObject({ accepted: false, errorCode: TAKE_ON_AIR_CODE });

  expect((await recvLines()).slice(before)).toEqual([]);
  const records = r.liveLayers().get('item-1') ?? [];
  expect(records).toHaveLength(1);
  expect(records[0]?.slot).toEqual(first);
  // CONTROL — the same instrument sees a PLAY once the row has been taken out and taken again,
  // and it lands on the same band layer.
  expect((await r.out('item-1')).accepted).toBe(true);
  expect((await r.take('item-1')).accepted).toBe(true);
  expect(r.liveLayers().get('item-1')?.[0]?.slot).toEqual(first);
  const played = (await recvLines())
    .slice(before)
    .filter((l) => l.startsWith(`PLAY 1-${String(BAND.start)} `));
  expect(played).toHaveLength(1);
});

it('an UNASSIGNED plate refuses the take by name, and NOTHING reaches the wire', async () => {
  const r = await boot({
    template: template([{ id: 'guest-1', rect: BOX }]),
    assignments: { assignments: [] },
  });
  await r.load('item-1', 'lower-third', {});
  const before = (await recvLines()).length;

  const verdict = await r.take('item-1');

  expect(verdict.accepted).toBe(false);
  expect(verdict.errorCode).toBe('live-source-unassigned');
  // A refused take mutates NOTHING: no producer, no mixer, and no CG PLAY.
  expect((await recvLines()).slice(before)).toEqual([]);
  expect(r.liveLayers().has('item-1')).toBe(false);
});

it('an operator-only `cover` override with a conflicting aspect still refuses before the wire', async () => {
  const r = await boot({
    template: template([{ id: 'guest-1', rect: BOX, expectedAspect: 4 / 3 }]),
    assignments: {
      assignments: [
        { templateId: 'lower-third', plateId: 'guest-1', sourceId: 'src-a', fitMode: 'cover' },
      ],
    },
  });
  await r.load('item-1', 'lower-third', {});
  const before = (await recvLines()).length;

  const verdict = await r.take('item-1');

  expect(verdict.accepted).toBe(false);
  expect(verdict.errorCode).toBe('live-source-aspect-mismatch');
  expect((await recvLines()).slice(before)).toEqual([]);
});

it('B-426 — two authored 4:3 Crop edges plates Pan 16:9 inputs and keep that framing on Take', async () => {
  const itemId = 'item-1';
  const rects = {
    'guest-1': { x: 160, y: 300, width: 640, height: 480 },
    'guest-2': { x: 1120, y: 300, width: 640, height: 480 },
  };
  const info = template(
    Object.entries(rects).map(([id, rect]) => ({ id, rect, expectedAspect: 4 / 3 })),
  );
  const r = await boot({
    template: {
      ...info,
      liveSources: {
        ...info.liveSources!,
        defaultLookId: 'single',
        looks: [
          { id: 'single', name: 'Single', entered: { mode: 'cut' }, rects: { 'guest-1': BOX } },
          {
            id: 'pair',
            name: 'Pair',
            entered: { mode: 'cut' },
            rects,
            fits: { 'guest-1': 'cover', 'guest-2': 'cover' },
          },
        ],
      },
    },
    assignments: assign([
      ['guest-1', 'src-a'],
      ['guest-2', 'src-b'],
    ]),
  });
  expect(await r.load(itemId, 'lower-third', {})).toMatchObject({ accepted: true });
  expect(await r.enterRehearse(itemId)).toMatchObject({ ok: true });
  expect(await r.setActiveLook(itemId, 'pair')).toMatchObject({ ok: true });
  const { targets } = r.previewPlateCrop(itemId);
  expect(targets).toMatchObject([
    { plateId: 'guest-1', sourceId: 'src-a', sourceAspect: 16 / 9 },
    { plateId: 'guest-2', sourceId: 'src-b', sourceAspect: 16 / 9 },
  ]);
  const [first, second] = targets;
  expect(r.previewPlateCrop(itemId, { token: first!.token, focus: { x: 1, y: 0.5 } }).ok).toBe(
    true,
  );
  expect(r.previewPlateCrop(itemId, { token: second!.token, focus: { x: 0, y: 0.5 } }).ok).toBe(
    true,
  );
  expect(await r.exitRehearse(itemId)).toMatchObject({ ok: true });

  const beforeTake = (await recvLines()).length;
  expect(await r.take(itemId)).toMatchObject({ accepted: true });
  const sent = (await recvLines()).slice(beforeTake);
  const coverWidth = rects['guest-1'].height * (16 / 9);
  for (const [index, rect] of Object.values(rects).entries()) {
    const layer = BAND.start + index;
    const fill = sent.find((line) => line.startsWith(`MIXER 1-${String(layer)} FILL `));
    const clip = sent.find((line) => line.startsWith(`MIXER 1-${String(layer)} CLIP `));
    expect(fill).toBeDefined();
    expect(clip).toBeDefined();
    expect(Number(fill!.split(' ')[3])).toBeCloseTo(
      (rect.x - (index === 0 ? coverWidth - rect.width : 0)) / SCENE.width,
      5,
    );
    expect(Number(fill!.split(' ')[5])).toBeCloseTo(coverWidth / SCENE.width, 5);
    expect(Number(clip!.split(' ')[3])).toBeCloseTo(rect.x / SCENE.width, 5);
    expect(Number(clip!.split(' ')[5])).toBeCloseTo(rect.width / SCENE.width, 5);
  }
});

it('⭐ C-028 — the SAME contradiction under `contain` takes, and puts a FITTED picture up', async () => {
  // The complement of the test above, on the same numbers: nothing is cropped under
  // `contain`, so the harm the refusal guards against cannot occur and the take must
  // proceed. Asserted at the WIRE, because "does not refuse" is only half the claim —
  // a take that is accepted and seats nothing would pass a verdict-only assertion.
  const r = await boot({
    template: template([{ id: 'guest-1', rect: BOX, expectedAspect: 4 / 3, fitMode: 'contain' }]),
  });
  await r.load('item-1', 'lower-third', {});
  const before = (await recvLines()).length;

  const verdict = await r.take('item-1');

  expect(verdict.accepted).toBe(true);
  const sent = (await recvLines()).slice(before);
  const fill = sent.find((l) => l.includes('MIXER') && l.includes('FILL'));
  expect(fill, 'a fitted plate is still seated').toBeDefined();
  // BOX is 960×540 in a 1920×1080 scene ⇒ 0.5 × 0.5 of the frame, and `src-a` is 16:9,
  // which is exactly the box's own aspect. So the fitted rect IS the box: the fit
  // changes nothing here, which is the point — the refusal was the only difference.
  expect(fill).toContain('0.25 0.25 0.5 0.5');
});

it('no declared BAND refuses with its own code — there is nowhere to put a producer', async () => {
  const r = await boot({
    template: template([{ id: 'guest-1', rect: BOX }]),
    catalog: catalog({ layerRange: undefined }),
  });
  await r.load('item-1', 'lower-third', {});
  const before = (await recvLines()).length;

  const verdict = await r.take('item-1');

  expect(verdict.accepted).toBe(false);
  expect(verdict.errorCode).toBe('live-source-no-layer-range');
  expect((await recvLines()).slice(before)).toEqual([]);
  /*
    🔴 `CHANNEL-SOURCES-01` decision 3 — ON ITS ROW, never a banner: the row carries the refusal
    (the code alone — the band is the station's, not a plate's), and the verdict says so, so the
    console's one surface for it is the row's line.
  */
  expect(verdict).toMatchObject({ refusalOnRow: true });
  const row = r.stackSnapshot().find((i) => i.itemId === 'item-1');
  expect(row?.takeRefusal).toEqual({ code: 'live-source-no-layer-range' });
});

it('a band with no ROOM refuses with a DIFFERENT code — the operator can act on each', async () => {
  const r = await boot({
    template: template([
      { id: 'guest-1', rect: { x: 100, y: 100, width: 400, height: 225 } },
      { id: 'guest-2', rect: { x: 600, y: 100, width: 400, height: 225 } },
    ]),
    catalog: catalog({ layerRange: { start: 30, end: 30 } }),
    assignments: assign([
      ['guest-1', 'src-a'],
      ['guest-2', 'src-b'],
    ]),
  });
  await r.load('item-1', 'lower-third', {});

  const verdict = await r.take('item-1');

  expect(verdict.accepted).toBe(false);
  expect(verdict.errorCode).toBe('live-source-no-layer');
  // ALL-OR-NOTHING: the one plate that WOULD have fitted is not seated either.
  expect(r.liveLayers().has('item-1')).toBe(false);
});

it('🔴 a failed seating rolls back EVERY layer it touched, and the graphic never plays', async () => {
  const r = await boot({
    template: template([
      { id: 'guest-1', rect: { x: 100, y: 100, width: 400, height: 225 } },
      { id: 'guest-2', rect: { x: 600, y: 100, width: 400, height: 225 } },
    ]),
    assignments: assign([
      ['guest-1', 'src-a'],
      // The second plate's producer is one the server refuses.
      ['guest-2', 'src-bad'],
    ]),
  });
  await r.load('item-1', 'lower-third', {});

  const verdict = await r.take('item-1');

  expect(verdict.accepted).toBe(false);
  const lines = await recvLines();
  // The FIRST plate did reach the wire…
  expect(lines.some((l) => l.startsWith(`PLAY 1-${String(BAND.start)} `))).toBe(true);
  // …and was taken back down, geometry and all.
  expect(lines).toContain(`CLEAR 1-${String(BAND.start)}`);
  expect(lines).toContain(`MIXER 1-${String(BAND.start)} CLEAR`);
  // The graphic never played: a template on air with an empty hole is exactly
  // what this refusal exists to prevent.
  expect(lines.some((l) => /^CG 1-\d+ PLAY/.test(l))).toBe(false);
  expect(r.liveLayers().has('item-1')).toBe(false);
});

it('the live layers come down BEFORE the graphic on out()', async () => {
  const r = await boot({ template: template([{ id: 'guest-1', rect: BOX }]) });
  await loadAndTake(r);
  const before = (await recvLines()).length;

  await r.out('item-1');

  const lines = (await recvLines()).slice(before);
  const plateAt = lines.indexOf(`CLEAR 1-${String(BAND.start)}`);
  const graphicAt = lines.findIndex((l) => /^CLEAR 1-1\d$/.test(l));
  expect(plateAt, "the plate's CLEAR").toBeGreaterThanOrEqual(0);
  expect(graphicAt, "the template's CLEAR").toBeGreaterThanOrEqual(0);
  // Stripping the covering graphic first would leave bare guest rectangles keyed
  // over programme for the duration of the teardown.
  expect(plateAt).toBeLessThan(graphicAt);
});

it('STOP takes the plates down too — the producer stays resident, the pictures must not', async () => {
  const r = await boot({ template: template([{ id: 'guest-1', rect: BOX }]) });
  await loadAndTake(r);

  await r.stopItem('item-1');

  expect(r.liveLayers().has('item-1')).toBe(false);
  const lines = await recvLines();
  expect(lines).toContain(`CLEAR 1-${String(BAND.start)}`);
  expect(lines).toContain(`MIXER 1-${String(BAND.start)} CLEAR`);
});

it('remove() takes the plates with the item', async () => {
  const r = await boot({ template: template([{ id: 'guest-1', rect: BOX }]) });
  await loadAndTake(r);

  await r.remove('item-1');

  expect(r.liveLayers().has('item-1')).toBe(false);
  expect(await recvLines()).toContain(`MIXER 1-${String(BAND.start)} CLEAR`);
});

const INPUT_FADE = { mode: 'fade' as const, durationMs: 160 };

const INPUT_SLIDE_DIRECTIONS = [
  { direction: 'left', start: '-0.25 0.25', end: '0.75 0.25', outside: '0.25 0.25 0.00001 0.5' },
  {
    direction: 'right',
    start: '0.75 0.25',
    end: '-0.25 0.25',
    outside: '0.74999 0.25 0.00001 0.5',
  },
  { direction: 'up', start: '0.25 -0.25', end: '0.25 0.75', outside: '0.25 0.25 0.5 0.00001' },
  { direction: 'down', start: '0.25 0.75', end: '0.25 -0.25', outside: '0.25 0.74999 0.5 0.00001' },
] as const;

describe.each(['push', 'slide-over'] as const)('%s input', (mode) => {
  it.each(INPUT_SLIDE_DIRECTIONS)('enters from $direction inside one frame', async (effect) => {
    const r = await boot({
      template: template([
        { id: 'guest-1', rect: BOX },
        { id: 'guest-2', rect: { x: 0, y: 0, width: 320, height: 180 } },
      ]),
      assignments: assign([
        ['guest-1', 'src-a'],
        ['guest-2', 'src-c'],
      ]),
    });
    expect(await loadAndTake(r)).toMatchObject({ accepted: true });
    expect(await r.setLivePlateVolume('item-1', 'guest-1', 0.4)).toMatchObject({ ok: true });
    const previous = r.liveLayers().get('item-1')!;
    const primary = previous.find(({ sourceId }) => sourceId === 'guest-1')!;
    const neighbor = previous.find(({ sourceId }) => sourceId === 'guest-2')!;
    const oldNeighbor = mock!.layerState(neighbor.slot);
    const mark = (await recvLines()).length;
    expect(
      await r.swapLiveSource('item-1', 'guest-1', 'src-b', undefined, {
        mode,
        direction: effect.direction,
        durationMs: 160,
      }),
    ).toEqual({ ok: true });
    const incoming = r
      .liveLayers()
      .get('item-1')!
      .find(({ sourceId }) => sourceId === 'guest-1')!;
    const current = `1-${String(incoming.slot.layer)}`;
    const outgoing = `1-${String(primary.slot.layer)}`;
    const lines = (await recvLines()).slice(mark);
    const clippedAt = at(lines, `MIXER ${current} CLIP ${effect.outside} DEFER`);
    const playedAt = at(lines, `PLAY ${current} `);
    const revealedAt = at(lines, `MIXER ${current} OPACITY 1 DEFER`);
    expect(at(lines, `MIXER ${current} FILL ${effect.start} 0.5 0.5 DEFER`)).toBeGreaterThanOrEqual(
      0,
    );
    expect(clippedAt).toBeGreaterThanOrEqual(0);
    expect(playedAt).toBeGreaterThan(clippedAt);
    expect(revealedAt).toBeGreaterThan(playedAt);
    expect(lines).toContainEqual(
      expect.stringMatching(
        new RegExp(`^MIXER ${current} CLIP 0.25 0.25 0.5 0.5 \\d+ linear DEFER$`),
      ),
    );
    const exit = lines.find((line) =>
      line.startsWith(`MIXER ${outgoing} FILL ${effect.end} 0.5 0.5 `),
    );
    if (mode === 'push') expect(exit).toMatch(/\d+ linear DEFER$/);
    else {
      expect(exit).toBeUndefined();
      expect(incoming.slot.layer).toBeGreaterThan(primary.slot.layer);
    }
    expect(mock!.layerState(incoming.slot)).toMatchObject({ opacity: 1, volume: 0.4 });
    expect(mock!.layerRenderedRect(incoming.slot)).toEqual(primary.clip);
    expect(mock!.layerState(neighbor.slot)).toEqual(oldNeighbor);
    expect(lines.some((line) => line.startsWith(`MIXER 1-${String(neighbor.slot.layer)} `))).toBe(
      false,
    );
  });
});

it('restores the outgoing input geometry when the engine refuses Push', async () => {
  const r = await boot({ template: template([{ id: 'guest-1', rect: BOX }]) });
  expect(await loadAndTake(r)).toMatchObject({ accepted: true });
  expect(await r.setLivePlateVolume('item-1', 'guest-1', 0.4)).toMatchObject({ ok: true });
  const previous = r.liveLayers().get('item-1');
  const oldSlot = { channel: 1, layer: BAND.start };
  const oldPicture = mock!.layerState(oldSlot);
  const mixer = defaultHandlers().get('MIXER')!;
  let refused = false;
  mock!.setHandler('MIXER', (request, context, connection) => {
    if (!refused && /^MIXER 1-30 CLIP .* [1-9]\d* linear DEFER$/.test(request.raw)) {
      refused = true;
      return { kind: 'err', code: 502, verb: 'MIXER' };
    }
    return mixer(request, context, connection);
  });
  expect(
    await r.swapLiveSource('item-1', 'guest-1', 'src-b', undefined, {
      mode: 'push',
      durationMs: 160,
    }),
  ).toMatchObject({ ok: false, reason: 'input-slide-unavailable' });
  expect(refused).toBe(true);
  expect(r.liveLayers().get('item-1')).toEqual(previous);
  expect(mock!.layerState(oldSlot)).toEqual(oldPicture);
  expect(mock!.layerState({ channel: 1, layer: BAND.start + 1 })?.producer).toBe('empty');
  expect(mock!.stagedMixerCount(1)).toBe(0);
});

it('quarantines a partially refused input restoration until the same engine owns output again', async () => {
  const { r, active, old } = await bootPairedInput();
  const before = active.layerState(old.slot);
  const mix = defaultHandlers().get('MIXER')!;
  let transitionRefused = false;
  let restoreRefused = false;
  active.setHandler('MIXER', (request, context, connection) => {
    if (!transitionRefused && /^MIXER 1-30 CLIP .* \d+ linear DEFER$/.test(request.raw)) {
      transitionRefused = true;
      return { kind: 'err', code: 502, verb: 'MIXER' };
    }
    if (
      transitionRefused &&
      !restoreRefused &&
      /^MIXER 1-30 FILL 0.25 0.25 0.5 0.5 DEFER$/.test(request.raw)
    ) {
      restoreRefused = true;
      return { kind: 'err', code: 502, verb: 'MIXER' };
    }
    return mix(request, context, connection);
  });
  expect(
    await r.swapLiveSource('item-1', 'guest-1', 'src-b', undefined, {
      mode: 'push',
      durationMs: 160,
    }),
  ).toMatchObject({ ok: false });
  expect(transitionRefused).toBe(true);
  expect(restoreRefused).toBe(true);
  expect(active.layerState(old.slot)).toEqual(before);
  expect(active.stagedMixerCount(1)).toBeGreaterThan(0);
  active.closeAllAmcpConnections();
  await expect.poll(() => r.health().currentPrimary, { timeout: HEALTH_MS }).toBe('B');
  await expect.poll(() => r.health().backup?.state, { timeout: HEALTH_MS }).toBe('healthy');
  expect(active.stagedMixerCount(1)).toBeGreaterThan(0);
  expect(await r.failover()).toEqual({ ok: true, newPrimary: 'A' });
  await expect.poll(() => active.stagedMixerCount(1), { timeout: HEALTH_MS }).toBe(0);
  expect(active.layerState(old.slot)).toEqual(before);
  expect(active.layerState({ channel: 1, layer: BAND.start + 1 })?.producer).toBe('empty');
});

it('keeps every Push tween inside one mask when the contained source aspect changes', async () => {
  const base = template([{ id: 'guest-1', rect: BOX }]);
  const station = catalog();
  const r = await boot({
    template: {
      ...base,
      liveSources: {
        ...base.liveSources!,
        defaultLookId: 'solo',
        looks: [
          {
            id: 'solo',
            name: 'Solo',
            entered: { mode: 'cut' },
            rects: { 'guest-1': BOX },
            masks: {
              'guest-1': { mode: 'inside', rects: [{ x: 0.125, y: 0, width: 0.75, height: 1 }] },
            },
          },
        ],
      },
    },
    catalog: {
      ...station,
      sources: station.sources.map((source) =>
        source.id === 'src-b' ? { ...source, aspect: 1, format: undefined } : source,
      ),
    },
  });
  expect(await loadAndTake(r)).toMatchObject({ accepted: true });
  const before = (await recvLines()).length;
  expect(
    await r.update('item-1', {}, 'merge', { solo: { 'guest-1': 'src-b' } }, undefined, {
      mode: 'push',
      direction: 'right',
      durationMs: 600,
    }),
  ).toMatchObject({ accepted: true });
  const lines = (await recvLines()).slice(before);
  const clips = lines.flatMap((line) => {
    const match = /^MIXER 1-(30|31) CLIP ([.\d -]+) linear DEFER$/.exec(line);
    return match?.[1] !== undefined && match[2] !== undefined
      ? [{ layer: match[1], values: match[2].split(' ').map(Number) }]
      : [];
  });
  for (const { values } of clips) {
    const [x = 0, y = 0, width = 0, height = 0] = values;
    expect(x).toBeGreaterThanOrEqual(0.3125);
    expect(x + width).toBeLessThanOrEqual(0.687501);
    expect(y).toBe(0.25);
    expect(height).toBe(0.5);
  }
  const incoming = clips.filter(({ layer }) => layer === '31');
  expect(incoming.length).toBeGreaterThan(1);
  expect(incoming.reduce((total, { values }) => total + (values[4] ?? 0), 0)).toBe(15);
  expect(mock!.layerRenderedRect({ channel: 1, layer: 31 })).toMatchObject({
    x: 0.359375,
    width: 0.28125,
  });
});

it('refuses moving overscan before writing while allowing the safe perpendicular direction', async () => {
  const station = catalog();
  const r = await boot({
    template: template([{ id: 'guest-1', rect: BOX, fitMode: 'cover' }]),
    catalog: {
      ...station,
      sources: station.sources.map((source) =>
        source.id === 'src-b' ? { ...source, aspect: 4 / 3, format: undefined } : source,
      ),
    },
  });
  expect(await loadAndTake(r)).toMatchObject({ accepted: true });
  const mark = (await recvLines()).length;
  for (const mode of ['push', 'slide-over'] as const) {
    expect(
      await r.swapLiveSource('item-1', 'guest-1', 'src-b', undefined, {
        mode,
        direction: 'left',
        durationMs: 160,
      }),
    ).toMatchObject({
      ok: false,
      reason: 'input-slide-unavailable',
      message: expect.stringContaining('Choose another direction, Fade or Cut.'),
    });
  }
  expect(
    (await recvLines()).slice(mark).filter((line) => /^(MIXER|CG|PLAY|CLEAR) /.test(line)),
  ).toEqual([]);
  expect(
    await r.swapLiveSource('item-1', 'guest-1', 'src-b', undefined, {
      mode: 'push',
      direction: 'up',
      durationMs: 160,
    }),
  ).toEqual({ ok: true });
  expect(mock!.layerRenderedRect({ channel: 1, layer: 31 })).toEqual({
    x: 0.25,
    y: 0.25,
    width: 0.5,
    height: 0.5,
  });
  expect(
    await r.swapLiveSource('item-1', 'guest-1', 'src-a', undefined, {
      mode: 'slide-over',
      direction: 'left',
      durationMs: 160,
    }),
  ).toEqual({ ok: true });
});

it('requires a safe higher layer for Slide Over and allows Push from the lower spare', async () => {
  const r = await boot({
    template: template([{ id: 'guest-1', rect: BOX }]),
    catalog: catalog({ layerRange: { start: BAND.start, end: BAND.start + 1 } }),
  });
  expect(await loadAndTake(r)).toMatchObject({ accepted: true });
  expect(await r.swapLiveSource('item-1', 'guest-1', 'src-b', undefined, INPUT_FADE)).toEqual({
    ok: true,
  });
  const before = (await recvLines()).length;
  expect(
    await r.swapLiveSource('item-1', 'guest-1', null, undefined, {
      mode: 'slide-over',
      durationMs: 160,
    }),
  ).toMatchObject({ ok: false, reason: 'input-slide-unavailable' });
  expect(
    (await recvLines()).slice(before).filter((line) => /^(PLAY|MIXER|CLEAR) /.test(line)),
  ).toEqual([]);
  expect(
    await r.swapLiveSource('item-1', 'guest-1', null, undefined, {
      mode: 'push',
      durationMs: 160,
    }),
  ).toEqual({ ok: true });
  expect(r.liveLayers().get('item-1')).toMatchObject([{ slot: { layer: BAND.start } }]);
});

it('dissolves a direct input swap in both layer directions without replacing the old producer first', async () => {
  const r = await boot({
    template: template([{ id: 'guest-1', rect: BOX }]),
    catalog: catalog({ layerRange: { start: BAND.start, end: BAND.start + 1 } }),
  });
  expect(await loadAndTake(r)).toMatchObject({ accepted: true });
  expect(await r.setLivePlateVolume('item-1', 'guest-1', 0.4)).toMatchObject({ ok: true });
  const mark = (await recvLines()).length;
  expect(await r.swapLiveSource('item-1', 'guest-1', 'src-b', undefined, INPUT_FADE)).toEqual({
    ok: true,
  });
  const first = (await recvLines()).slice(mark);
  const staged = at(first, 'PLAY 1-31 ');
  const tweenIn = first.findIndex((line) => /^MIXER 1-31 OPACITY 1 \d+ linear DEFER$/.test(line));
  expect(staged).toBeGreaterThan(at(first, 'MIXER 1-31 OPACITY 0'));
  expect(tweenIn).toBeGreaterThan(staged);
  expect(at(first, 'MIXER 1-30 VOLUME 0 DEFER')).toBeGreaterThan(tweenIn);
  expect(at(first, 'CLEAR 1-30')).toBeGreaterThan(tweenIn);
  expect(first.some((line) => /^CG \d+-\d+ (ADD|PLAY)/.test(line))).toBe(false);
  expect(mock!.layerState({ channel: 1, layer: 31 })).toMatchObject({
    opacity: 1,
    volume: 0.4,
  });

  const secondMark = (await recvLines()).length;
  expect(await r.swapLiveSource('item-1', 'guest-1', null, undefined, INPUT_FADE)).toEqual({
    ok: true,
  });
  const second = (await recvLines()).slice(secondMark);
  const mountUnder = at(second, 'PLAY 1-30 ');
  const tweenOut = second.findIndex((line) => /^MIXER 1-31 OPACITY 0 \d+ linear DEFER$/.test(line));
  expect(mountUnder).toBeGreaterThan(at(second, 'MIXER 1-30 OPACITY 0'));
  expect(tweenOut).toBeGreaterThan(mountUnder);
  expect(at(second, 'CLEAR 1-31')).toBeGreaterThan(tweenOut);
  expect(r.liveLayers().get('item-1')).toMatchObject([{ slot: { layer: 30 } }]);
  expect(mock!.layerState({ channel: 1, layer: 30 })).toMatchObject({ opacity: 1, volume: 0.4 });
});

it('keeps the input on air when Fade cannot pre-seat the incoming source', async () => {
  const r = await boot({ template: template([{ id: 'guest-1', rect: BOX }]) });
  expect(await loadAndTake(r)).toMatchObject({ accepted: true });
  const previous = r.liveLayers().get('item-1');
  const before = (await recvLines()).length;
  expect(
    await r.swapLiveSource('item-1', 'guest-1', 'src-bad', undefined, INPUT_FADE),
  ).toMatchObject({
    ok: false,
  });
  expect(r.liveLayers().get('item-1')).toEqual(previous);
  expect(r.stackSnapshot()[0]?.sourceOverride).toBeUndefined();
  expect(mock!.layerState({ channel: 1, layer: 30 })).toMatchObject({ opacity: 1 });
  expect((await recvLines()).slice(before).some((line) => /^CLEAR 1-30/.test(line))).toBe(false);
});

it('fades a change of contained source aspect without exceeding the authored frame', async () => {
  const station = catalog();
  const r = await boot({
    template: template([{ id: 'guest-1', rect: BOX }]),
    catalog: {
      ...station,
      sources: station.sources.map((source) =>
        source.id === 'src-b' ? { ...source, aspect: 4 / 3, format: undefined } : source,
      ),
    },
  });
  expect(await loadAndTake(r)).toMatchObject({ accepted: true });
  const before = (await recvLines()).length;
  expect(await r.swapLiveSource('item-1', 'guest-1', 'src-b', undefined, INPUT_FADE)).toMatchObject(
    {
      ok: true,
    },
  );
  const writes = (await recvLines()).slice(before);
  expect(writes.some((line) => /^MIXER 1-30 OPACITY 0 \d+ linear DEFER$/.test(line))).toBe(true);
  expect(writes.some((line) => /^MIXER 1-31 OPACITY 1 \d+ linear DEFER$/.test(line))).toBe(true);
  expect(mock!.layerRenderedRect({ channel: 1, layer: 31 })).toEqual({
    x: 0.3125,
    y: 0.25,
    width: 0.375,
    height: 0.5,
  });
});

it('refuses Fade with no spare layer and can still replace directly with Cut', async () => {
  const r = await boot({
    template: template([{ id: 'guest-1', rect: BOX }]),
    catalog: catalog({ layerRange: { start: BAND.start, end: BAND.start } }),
  });
  expect(await loadAndTake(r)).toMatchObject({ accepted: true });
  const before = (await recvLines()).length;
  expect(await r.swapLiveSource('item-1', 'guest-1', 'src-b', undefined, INPUT_FADE)).toMatchObject(
    {
      ok: false,
      reason: 'input-fade-unavailable',
    },
  );
  expect((await recvLines()).slice(before).some((line) => /^(PLAY |MIXER )/.test(line))).toBe(
    false,
  );
  expect(await r.swapLiveSource('item-1', 'guest-1', 'src-b')).toMatchObject({ ok: true });
  expect(r.liveLayers().get('item-1')).toMatchObject([{ slot: { layer: 30 } }]);
});

it('dissolves staged inputs on Update and resumes the prior picture on a refused final mixer commit', async () => {
  const base = template([{ id: 'guest-1', rect: BOX }]);
  const r = await boot({
    template: {
      ...base,
      liveSources: {
        ...base.liveSources!,
        defaultLookId: 'solo',
        looks: [{ id: 'solo', name: 'Solo', entered: { mode: 'cut' }, rects: { 'guest-1': BOX } }],
      },
    },
  });
  expect(await loadAndTake(r)).toMatchObject({ accepted: true });
  expect(await r.setLivePlateVolume('item-1', 'guest-1', 0.4)).toMatchObject({ ok: true });
  const before = (await recvLines()).length;
  const next = { solo: { 'guest-1': 'src-b' } };
  const fields = { headline: 'New source' };
  const first = await r.update('item-1', fields, 'merge', next, undefined, INPUT_FADE);
  expect(first).toMatchObject({ accepted: true });
  expect(
    (await recvLines()).slice(before).some((line) => /OPACITY 1 \d+ linear DEFER/.test(line)),
  ).toBe(true);
  expect(r.stackSnapshot()[0]?.lookSourceOverride).toEqual(next);
  const baseline = r.liveLayers().get('item-1');
  const mixer = defaultHandlers().get('MIXER')!;
  let commits = 0;
  mock!.setHandler('MIXER', (request, context, connection) => {
    if (request.raw === 'MIXER 1 COMMIT' && ++commits === 3)
      return { kind: 'err', code: 502, verb: 'MIXER' };
    return mixer(request, context, connection);
  });
  const reverted = await r.update(
    'item-1',
    { headline: 'Refused source' },
    'merge',
    {},
    undefined,
    INPUT_FADE,
  );
  expect(reverted).toMatchObject({ accepted: false, errorCode: 'amcp-502' });
  expect(r.liveLayers().get('item-1')).toEqual(baseline);
  expect(r.stackSnapshot()[0]).toMatchObject({ fields, lookSourceOverride: next });
  expect(mock!.layerState({ channel: 1, layer: 31 })).toMatchObject({ opacity: 1, volume: 0.4 });
});

it('dissolves a preset input on Update while parking and reusing its input from another preset', async () => {
  const base = template([{ id: 'guest-1', rect: BOX }]);
  const r = await boot({
    template: {
      ...base,
      liveSources: {
        ...base.liveSources!,
        defaultLookId: 'solo',
        looks: ['solo', 'other'].map((id) => ({
          id,
          name: id,
          entered: { mode: 'cut' },
          rects: { 'guest-1': BOX },
        })),
      },
    },
  });
  expect(await loadAndTake(r)).toMatchObject({ accepted: true });
  expect(await r.setLivePlateVolume('item-1', 'guest-1', 0.4)).toMatchObject({ ok: true });
  const binding = { solo: { 'guest-1': 'src-b' } };
  const firstMark = (await recvLines()).length;
  expect(await r.update('item-1', {}, 'merge', binding, undefined, INPUT_FADE)).toMatchObject({
    accepted: true,
  });
  const first = (await recvLines()).slice(firstMark);
  expect(first).not.toContain('CLEAR 1-30');
  expect(first).toContain('PLAY 1-31 "route://3"');
  expect(first.some((line) => /^MIXER 1-31 OPACITY 1 \d+ linear DEFER$/.test(line))).toBe(true);
  const baseline = r.liveLayers().get('item-1');
  const parked = mock!.layerState({ channel: 1, layer: 30 });
  expect(baseline).toMatchObject([
    { slot: { layer: 31 }, intendedVolume: 0.4 },
    { slot: { layer: 30 }, held: true },
  ]);
  expect(parked).toMatchObject({ onAir: true, volume: 0 });

  const mixer = defaultHandlers().get('MIXER')!;
  let commits = 0;
  mock!.setHandler('MIXER', (request, context, connection) => {
    if (request.raw === 'MIXER 1 COMMIT' && ++commits === 3)
      return { kind: 'err', code: 502, verb: 'MIXER' };
    return mixer(request, context, connection);
  });
  const restored = await r.update('item-1', {}, 'merge', {}, undefined, INPUT_FADE);
  expect(restored).toMatchObject({ accepted: false, errorCode: 'amcp-502' });
  expect(r.liveLayers().get('item-1')).toEqual(baseline);
  expect(r.stackSnapshot()[0]?.lookSourceOverride).toEqual(binding);
  expect(mock!.layerState({ channel: 1, layer: 30 })).toMatchObject({
    onAir: true,
    opacity: parked?.opacity,
    volume: parked?.volume,
  });
  expect(mock!.layerState({ channel: 1, layer: 31 })).toMatchObject({ opacity: 1, volume: 0.4 });
  expect(mock!.layerRenderedRect({ channel: 1, layer: 30 })).toBeNull();

  mock!.setHandler('MIXER', mixer);
  const secondMark = (await recvLines()).length;
  expect(await r.update('item-1', {}, 'merge', {}, undefined, INPUT_FADE)).toMatchObject({
    accepted: true,
  });
  const second = (await recvLines()).slice(secondMark);
  expect(second.some((line) => /^PLAY |^CLEAR 1-30$/.test(line))).toBe(false);
  expect(second.some((line) => /^MIXER 1-31 OPACITY 0 \d+ linear DEFER$/.test(line))).toBe(true);
  expect(r.liveLayers().get('item-1')).toMatchObject([{ slot: { layer: 30 } }]);
  expect(mock!.layerRenderedRect({ channel: 1, layer: 30 })).toEqual({
    x: 0.25,
    y: 0.25,
    width: 0.5,
    height: 0.5,
  });
  expect(mock!.layerState({ channel: 1, layer: 30 })).toMatchObject({ opacity: 1, volume: 0.4 });
});

it('fades the source inside a single-region mask without revealing unmasked picture', async () => {
  const base = template([{ id: 'guest-1', rect: BOX }]);
  const r = await boot({
    template: {
      ...base,
      liveSources: {
        ...base.liveSources!,
        defaultLookId: 'solo',
        looks: [
          {
            id: 'solo',
            name: 'Solo',
            entered: { mode: 'cut' },
            rects: { 'guest-1': BOX },
            masks: {
              'guest-1': { mode: 'inside', rects: [{ x: 0.25, y: 0, width: 0.5, height: 1 }] },
            },
          },
          {
            id: 'other',
            name: 'Other',
            entered: { mode: 'cut' },
            rects: { 'guest-1': BOX },
          },
        ],
      },
    },
  });
  expect(await loadAndTake(r)).toMatchObject({ accepted: true });
  const masked = mock!.layerRenderedRect({ channel: 1, layer: 30 });
  expect(masked).toEqual({ x: 0.375, y: 0.25, width: 0.25, height: 0.5 });
  const mark = (await recvLines()).length;
  expect(
    await r.update('item-1', {}, 'merge', { solo: { 'guest-1': 'src-b' } }, undefined, INPUT_FADE),
  ).toMatchObject({ accepted: true });
  const writes = (await recvLines()).slice(mark);
  const clip = at(writes, 'MIXER 1-31 CLIP 0.375 0.25 0.25 0.5');
  const reveal = writes.findIndex((line) => /^MIXER 1-31 OPACITY 1 \d+ linear DEFER$/.test(line));
  expect(clip).toBeGreaterThanOrEqual(0);
  expect(reveal).toBeGreaterThan(clip);
  expect(mock!.layerRenderedRect({ channel: 1, layer: 31 })).toEqual(masked);
  expect(await r.setActiveLook('item-1', 'other')).toEqual({ ok: true });
  expect(mock!.layerRenderedRect({ channel: 1, layer: 30 })).toEqual({
    x: 0.25,
    y: 0.25,
    width: 0.5,
    height: 0.5,
  });
});

it('refuses Fade across routed mask regions before writing to programme', async () => {
  const base = template([{ id: 'guest-1', rect: BOX }]);
  const r = await boot({
    template: {
      ...base,
      liveSources: {
        ...base.liveSources!,
        defaultLookId: 'solo',
        looks: [
          {
            id: 'solo',
            name: 'Solo',
            entered: { mode: 'cut' },
            rects: { 'guest-1': BOX },
            masks: {
              'guest-1': {
                mode: 'inside',
                rects: [
                  { x: 0, y: 0, width: 0.25, height: 1 },
                  { x: 0.75, y: 0, width: 0.25, height: 1 },
                ],
              },
            },
          },
        ],
      },
    },
  });
  expect(await loadAndTake(r)).toMatchObject({ accepted: true });
  const baseline = r.liveLayers().get('item-1');
  expect(baseline).toHaveLength(2);
  const mark = (await recvLines()).length;
  const binding = { solo: { 'guest-1': 'src-b' } };
  expect(await r.update('item-1', {}, 'merge', binding, undefined, INPUT_FADE)).toMatchObject({
    accepted: false,
    errorCode: 'input-fade-unavailable',
    message: expect.stringContaining('multiple mask regions'),
  });
  expect((await recvLines()).slice(mark).some((line) => /^(CG|PLAY|MIXER|CLEAR) /.test(line))).toBe(
    false,
  );
  expect(r.liveLayers().get('item-1')).toEqual(baseline);
  expect(await r.update('item-1', {}, 'merge', binding)).toMatchObject({ accepted: true });
  expect(r.liveLayers().get('item-1')).toHaveLength(2);
});

it('clears the hidden replacement when Stop interrupts an in-progress input Fade', async () => {
  const r = await boot({ template: template([{ id: 'guest-1', rect: BOX }]) });
  expect(await loadAndTake(r)).toMatchObject({ accepted: true });
  const fade = r.swapLiveSource('item-1', 'guest-1', 'src-b', undefined, {
    mode: 'fade',
    durationMs: 800,
  });
  await expect
    .poll(async () => (await recvLines()).some((line) => /OPACITY 1 \d+ linear DEFER/.test(line)))
    .toBe(true);
  expect(await r.stopItem('item-1')).toMatchObject({ accepted: true });
  expect(await fade).toMatchObject({ ok: false });
  expect(r.liveLayers().has('item-1')).toBe(false);
  const lines = await recvLines();
  expect(lines).toContain('CLEAR 1-30');
  expect(lines).toContain('CLEAR 1-31');
  expect(r.stackSnapshot()[0]?.sourceOverride).toBeUndefined();
});

it('restores the old feed and cancels a staged input Fade when the same engine reconnects', async () => {
  const r = await boot({
    template: template([{ id: 'guest-1', rect: BOX }]),
    catalog: catalog({ layerRange: { start: BAND.start, end: BAND.start + 1 } }),
  });
  expect(await loadAndTake(r)).toMatchObject({ accepted: true });
  expect(await r.swapLiveSource('item-1', 'guest-1', 'src-b', undefined, INPUT_FADE)).toEqual({
    ok: true,
  });
  const mixer = defaultHandlers().get('MIXER')!;
  let disconnected = false;
  mock!.setHandler('MIXER', (request, context, connection) => {
    const result = mixer(request, context, connection);
    if (!disconnected && /^MIXER 1-31 OPACITY 0 \d+ linear DEFER$/.test(request.raw)) {
      disconnected = true;
      mock!.closeAllAmcpConnections();
    }
    return result;
  });
  expect(await r.swapLiveSource('item-1', 'guest-1', null, undefined, INPUT_FADE)).toMatchObject({
    ok: false,
  });
  expect(disconnected).toBe(true);
  await r.whenServerHealthy(HEALTH_MS);
  await expect.poll(() => mock!.layerState({ channel: 1, layer: 30 })?.producer).toBe('empty');
  expect(mock!.layerState({ channel: 1, layer: 31 })).toMatchObject({ onAir: true, opacity: 1 });
  expect(mock!.stagedMixerCount(1)).toBe(0);
  expect(r.stackSnapshot()[0]?.sourceOverride).toMatchObject({ 'guest-1': 'src-b' });
  expect(await r.swapLiveSource('item-1', 'guest-1', null, undefined, INPUT_FADE)).toEqual({
    ok: true,
  });
});

async function bootPairedInput(missing = false) {
  const r = await boot({
    template: template([{ id: 'guest-1', rect: BOX }], true),
    html: LIVE_POSITION_HTML,
    mirrorChannel: 2,
    catalog: catalog({
      sources: [
        { id: 'src-a', name: 'Camera', producer: { kind: 'ndi', source: 'Camera' } },
        { id: 'src-b', name: 'Clip', producer: { kind: 'media', file: 'active.mov' } },
      ],
    }),
  });
  const peer = backup;
  const active = mock;
  if (peer === null || active === null) throw new Error('Missing paired test engines');
  r.useBackupMedia(() =>
    missing ? { kind: 'refused', reason: 'no-copy' } : { kind: 'copy', clip: 'reserve.mov' },
  );
  expect(await loadAndTake(r)).toMatchObject({ accepted: true });
  await expect.poll(() => r.stackSnapshot()[0]).toMatchObject({ onAirPosition: true });
  expect(await r.setLivePlateVolume('item-1', 'guest-1', 0.4)).toMatchObject({ ok: true });
  const old = r.liveLayers().get('item-1')![0]!;
  const reserveOld = { channel: 2, layer: old.slot.layer };
  return { r, active, peer, old, reserveOld };
}

it.each(['fade', 'push', 'slide-over'] as const)(
  'animates %s on the active input and cuts the reserve to its own prepared clip',
  async (mode) => {
    const { r, peer, active, reserveOld } = await bootPairedInput();
    const mark = peer.receivedCommands().length;
    expect(
      await r.swapLiveSource('item-1', 'guest-1', 'src-b', undefined, {
        mode,
        direction: 'left',
        durationMs: 160,
      }),
    ).toEqual({ ok: true });
    const [next] = r.liveLayers().get('item-1')!;
    const reserveNext = { channel: 2, layer: next!.slot.layer };
    const lines = peer
      .receivedCommands()
      .slice(mark)
      .map(({ line }) => line);
    expect(active.layerState(next!.slot)).toMatchObject({
      filePath: 'active.mov',
      opacity: 1,
      volume: 0.4,
    });
    expect(peer.layerState(reserveNext)).toMatchObject({
      filePath: 'reserve.mov',
      opacity: 1,
      volume: 0.4,
    });
    expect(peer.layerRenderedRect(reserveNext)).toEqual(active.layerRenderedRect(next!.slot));
    expect(peer.layerState(reserveOld)?.producer).toBe('empty');
    expect(lines.some((line) => /\d+ linear DEFER$/.test(line))).toBe(false);
    const committedAt = lines.indexOf('MIXER 2 COMMIT');
    expect(committedAt).toBeGreaterThan(
      at(lines, `MIXER 2-${String(reserveNext.layer)} VOLUME 0.4 DEFER`),
    );
    expect(at(lines, `CLEAR 2-${String(reserveOld.layer)}`)).toBeGreaterThan(committedAt);
  },
);

it('preserves the previous reserve feed when its replacement Play refuses', async () => {
  const { r, peer, reserveOld } = await bootPairedInput();
  const previous = peer.layerState(reserveOld);
  const play = defaultHandlers().get('PLAY')!;
  let refused = false;
  peer.setHandler('PLAY', (request, context, connection) => {
    if (!refused && request.raw.includes('reserve.mov')) {
      refused = true;
      return { kind: 'err', code: 404, verb: 'PLAY' };
    }
    return play(request, context, connection);
  });
  const mark = peer.receivedCommands().length;
  expect(await r.swapLiveSource('item-1', 'guest-1', 'src-b', undefined, INPUT_FADE)).toEqual({
    ok: true,
  });
  expect(refused).toBe(true);
  const [next] = r.liveLayers().get('item-1')!;
  expect(peer.layerState({ channel: 2, layer: next!.slot.layer })?.producer).toBe('empty');
  expect(peer.layerState(reserveOld)).toEqual(previous);
  expect(
    peer
      .receivedCommands()
      .slice(mark)
      .some(({ line }) => /^CG 2-\d+ UPDATE /.test(line)),
  ).toBe(false);
});

it('restores the reserve mixer as one batch when its final input Commit is refused', async () => {
  const { r, peer, reserveOld } = await bootPairedInput();
  const previous = peer.layerState(reserveOld);
  const mix = defaultHandlers().get('MIXER')!;
  let refused = false;
  peer.setHandler('MIXER', (request, context, connection) => {
    if (!refused && request.raw === 'MIXER 2 COMMIT') {
      refused = true;
      return { kind: 'err', code: 502, verb: 'MIXER' };
    }
    return mix(request, context, connection);
  });
  expect(await r.swapLiveSource('item-1', 'guest-1', 'src-b', undefined, INPUT_FADE)).toEqual({
    ok: true,
  });
  expect(refused).toBe(true);
  const [next] = r.liveLayers().get('item-1')!;
  expect(peer.layerState({ channel: 2, layer: next!.slot.layer })?.producer).toBe('empty');
  expect(peer.layerState(reserveOld)).toEqual(previous);
  expect(peer.stagedMixerCount(2)).toBe(0);
});

it('retries retiring the reserve input once while its exact source and connection are verified', async () => {
  const { r, peer, reserveOld } = await bootPairedInput();
  const clear = defaultHandlers().get('CLEAR')!;
  let refused = false;
  peer.setHandler('CLEAR', (request, context, connection) => {
    if (!refused && request.raw === `CLEAR 2-${String(reserveOld.layer)}`) {
      refused = true;
      return { kind: 'err', code: 502, verb: 'CLEAR' };
    }
    return clear(request, context, connection);
  });
  const before = peer.receivedCommands().length;
  expect(await r.swapLiveSource('item-1', 'guest-1', 'src-b', undefined, INPUT_FADE)).toEqual({
    ok: true,
  });
  expect(refused).toBe(true);
  expect(peer.layerState(reserveOld)?.producer).toBe('empty');
  const lines = peer
    .receivedCommands()
    .slice(before)
    .map(({ line }) => line);
  expect(lines.filter((line) => line === `CLEAR 2-${String(reserveOld.layer)}`)).toHaveLength(2);
  expect(lines.some((line) => /^CG 2-\d+ UPDATE/.test(line))).toBe(true);
});

it('settles the active source without sending an unlisted media path to the reserve', async () => {
  const { r, peer, reserveOld } = await bootPairedInput(true);
  const mark = peer.receivedCommands().length;
  expect(await r.swapLiveSource('item-1', 'guest-1', 'src-b', undefined, INPUT_FADE)).toEqual({
    ok: true,
  });
  const [next] = r.liveLayers().get('item-1')!;
  expect(next?.backupRefused).toMatchObject({ reason: 'no-copy' });
  expect(peer.layerState(reserveOld)?.producer).toBe('empty');
  expect(
    peer
      .receivedCommands()
      .slice(mark)
      .some(({ line }) => /^PLAY 2-/.test(line)),
  ).toBe(false);
});

it('sends no input settlement to the reserve when the active transition is refused', async () => {
  const { r, active, peer, reserveOld } = await bootPairedInput();
  const previous = peer.layerState(reserveOld);
  const mark = peer.receivedCommands().length;
  const mix = defaultHandlers().get('MIXER')!;
  let refused = false;
  active.setHandler('MIXER', (request, context, connection) => {
    if (!refused && /OPACITY 1 \d+ linear DEFER$/.test(request.raw)) {
      refused = true;
      return { kind: 'err', code: 501, verb: 'MIXER' };
    }
    return mix(request, context, connection);
  });
  expect(await r.swapLiveSource('item-1', 'guest-1', 'src-b', undefined, INPUT_FADE)).toMatchObject(
    { ok: false, reason: 'input-fade-unavailable' },
  );
  expect(refused).toBe(true);
  expect(peer.layerState(reserveOld)).toEqual(previous);
  expect(
    peer
      .receivedCommands()
      .slice(mark)
      .filter(({ line }) => /^(CG|PLAY|MIXER|CLEAR) /.test(line)),
  ).toEqual([]);
});

it('keeps the reserve picture and audio together while it is promoted during input settlement', async () => {
  const { r, peer, reserveOld } = await bootPairedInput();
  const before = peer.layerState(reserveOld);
  const mix = defaultHandlers().get('MIXER')!;
  let release: (() => void) | undefined;
  peer.setHandler('MIXER', async (request, context, connection) => {
    const answer = mix(request, context, connection);
    if (
      release === undefined &&
      request.raw === `MIXER 2-${String(reserveOld.layer)} VOLUME 0 DEFER`
    )
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    return answer;
  });
  const change = r.swapLiveSource('item-1', 'guest-1', 'src-b', undefined, INPUT_FADE);
  try {
    await expect.poll(() => release !== undefined, { timeout: HEALTH_MS }).toBe(true);
    const [next] = r.liveLayers().get('item-1')!;
    const reserveNext = { channel: 2, layer: next!.slot.layer };
    expect(peer.layerState(reserveOld)).toEqual(before);
    expect(peer.layerState(reserveNext)).toMatchObject({ volume: 0, opacity: 0 });
    expect(await r.failover()).toEqual({ ok: true, newPrimary: 'B' });
    expect(peer.layerState(reserveOld)).toEqual(before);
    expect(peer.layerState(reserveNext)).toMatchObject({ volume: 0, opacity: 0 });
  } finally {
    release?.();
  }
  expect(await change).toEqual({ ok: true });
  const [next] = r.liveLayers().get('item-1')!;
  const reserveNext = { channel: 2, layer: next!.slot.layer };
  await expect
    .poll(() => peer.layerState(reserveNext), { timeout: HEALTH_MS })
    .toMatchObject({
      filePath: 'reserve.mov',
      opacity: 1,
      volume: 0.4,
    });
  await expect.poll(() => peer.layerState(reserveOld)?.producer).toBe('empty');
  expect(peer.stagedMixerCount(2)).toBe(0);
});

it('does not resume a staged input effect after the active role changes away and back', async () => {
  const { r, active, peer, old } = await bootPairedInput();
  const before = active.layerState(old.slot);
  const wireStart = active.receivedCommands().length;
  const swap = r.swapLiveSource('item-1', 'guest-1', 'src-b', undefined, {
    mode: 'push',
    durationMs: 800,
  });
  await expect
    .poll(
      () =>
        active
          .receivedCommands()
          .slice(wireStart)
          .some(({ line }) => /FILL .* \d+ linear DEFER$/.test(line)),
      { timeout: HEALTH_MS },
    )
    .toBe(true);
  const peerStart = peer.receivedCommands().length;
  expect(await r.failover()).toEqual({ ok: true, newPrimary: 'B' });
  expect(await r.failover()).toEqual({ ok: true, newPrimary: 'A' });
  expect(await swap).toMatchObject({ ok: false });
  await expect.poll(() => active.layerState(old.slot), { timeout: HEALTH_MS }).toEqual(before);
  await expect.poll(() => active.stagedMixerCount(1), { timeout: HEALTH_MS }).toBe(0);
  expect(
    peer
      .receivedCommands()
      .slice(peerStart)
      .filter(({ line }) => /^(PLAY|MIXER|CLEAR|CG) /.test(line)),
  ).toEqual([]);
});

it('a template with NO carrier takes exactly as before and seats nothing', async () => {
  // `'unknown'` is a template imported before the carrier existed. Refusing its
  // take would take a station's whole existing rundown off air on upgrade; the
  // warning belongs on the template row, where it can be acted on.
  const r = await boot({
    template: { templateId: 'lower-third', templateType: 'lower-third', fields: [] },
  });

  const verdict = await loadAndTake(r);

  expect(verdict.accepted).toBe(true);
  expect(r.liveLayers().has('item-1')).toBe(false);
  const lines = await recvLines();
  expect(lines.some((l) => /^PLAY 1-3\d /.test(l))).toBe(false);
  expect(lines.some((l) => /^CG 1-\d+ PLAY/.test(l))).toBe(true);
});

it('a hole entirely OUTSIDE the scene rect seats no producer, and does not refuse the take', async () => {
  const r = await boot({
    template: template([{ id: 'guest-1', rect: { x: 4000, y: 100, width: 400, height: 225 } }]),
  });

  const verdict = await loadAndTake(r);

  expect(verdict.accepted).toBe(true);
  // Nothing about it is visible on air, so refusing the take would be refusing
  // over an invisible detail — and no layer is burned out of the band.
  expect(r.liveLayers().has('item-1')).toBe(false);
  expect((await recvLines()).some((l) => /^PLAY 1-3\d /.test(l))).toBe(false);
});
