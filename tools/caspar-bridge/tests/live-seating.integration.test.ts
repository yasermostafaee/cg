import * as dgram from 'node:dgram';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { createMock, defaultHandlers, type MockHandle } from '@cg/amcp-mock';
import {
  TAKE_ON_AIR_CODE,
  type ConnectionConfig,
  type SourceAssignments,
  type SourceCatalog,
  type TemplateInfo,
} from '@cg/shared-ipc';
import {
  CG_LIVE_FRAME_PLACEMENT_PAGE_MARKER,
  CG_LIVE_FRAME_TRANSITION_PAGE_MARKER,
  CG_LIVE_MASK_PLACEMENT_PAGE_MARKER,
  CG_LIVE_POSITION_PAGE_MARKER,
  RetainedStackItemSchema,
  retainedFromStackItem,
  type FrameTransition,
  type LiveFitMode,
  type LiveFramePlacement,
  type LiveFrameTarget,
  type LiveMaskPlacement,
  type LiveRevealMask,
} from '@cg/shared-schema';
import { CasparRuntime } from '../src/caspar-runtime.js';
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

function freeUdpPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const sock = dgram.createSocket('udp4');
    sock.once('error', reject);
    sock.bind(0, '127.0.0.1', () => {
      const port = sock.address().port;
      sock.close(() => resolve(port));
    });
  });
}

function singleServer(amcpPort: number, oscPort: number): ConnectionConfig {
  return {
    servers: { A: { host: '127.0.0.1', amcpPort, oscPort } },
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
}): Promise<CasparRuntime> {
  const oscPort = await freeUdpPort();
  tracePath = path.join(
    os.tmpdir(),
    `cg-liveseat-${String(process.pid)}-${String(Date.now())}-${String(Math.round(performance.now() * 1000))}.ndjson`,
  );
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 30, tracePath });
  const config = singleServer(mock.amcpPort, oscPort);
  if (options.redundant === true) {
    const backupOscPort = await freeUdpPort();
    backup = await createMock({
      amcpPort: 0,
      oscPort: backupOscPort,
      oscHost: '127.0.0.1',
      oscHz: 30,
    });
    config.servers.B = { host: '127.0.0.1', amcpPort: backup.amcpPort, oscPort: backupOscPort };
  }
  const r = new CasparRuntime(
    config,
    {},
    {
      layerPolicy: TEST_LAYER_POLICY,
      sweepMs: 150,
      sourceCatalog: options.catalog ?? catalog(),
      sourceAssignments: options.assignments ?? assign([['guest-1', 'src-a']]),
    },
  );
  runtime = r;
  r.start();
  await r.startServing();
  r.templateImport(
    options.template,
    options.html ?? '<!doctype html><html><body>served</body></html>',
  );
  await r.whenServerHealthy(HEALTH_MS);
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

it('keeps a placement off-air only when a backup engine is declared', async () => {
  const r = await boot({
    template: template([{ id: 'guest-1', rect: BOX, operatorFrame: FRAME }]),
    html: FRAME_HTML,
    redundant: true,
  });
  const itemId = 'item-1';
  await r.load(itemId, 'lower-third', {});
  await expect(r.setFramePlacements(itemId, [MOVED_FRAME])).resolves.toEqual({ accepted: true });
  await expect(r.take(itemId)).resolves.toMatchObject({ accepted: true });
  const before = (await recvLines()).length;
  expect(r.stackSnapshot()[0]?.onAirFramePlacement).toBeUndefined();
  await expect(r.setFramePlacements(itemId, [AUTHORED_FRAME])).resolves.toMatchObject({
    accepted: false,
    errorCode: 'frame-placement-on-air-unavailable',
  });
  expect(
    (await recvLines()).slice(before).filter((line) => /^(CG |MIXER |PLAY |CLEAR )/.test(line)),
  ).toEqual([]);
  expect(r.stackSnapshot()[0]?.framePlacements).toEqual([MOVED_FRAME]);
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
  const [target] = (await r.previewPlateCropOnAir(itemId)).targets;
  if (target === undefined) throw new Error('Missing crop target for the masked plate');
  const focus = { x: 0.25, y: 0.5, zoom: 2 };
  await expect(
    r.previewPlateCropOnAir(itemId, [{ token: target.token, focus }]),
  ).resolves.toMatchObject({
    ok: true,
  });
  const panned = mock?.layerState(plate);

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
    fill: panned?.fill,
    volume: initial?.volume,
    clip: { x: 0.5, y: 0.375, width: 0.25, height: 0.125 },
  });
  expect((await r.previewPlateCropOnAir(itemId)).targets).toMatchObject([
    { token: target.token, focus },
  ]);
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
