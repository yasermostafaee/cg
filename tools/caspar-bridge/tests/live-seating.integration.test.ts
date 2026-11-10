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
  RetainedStackItemSchema,
  retainedFromStackItem,
  type LiveFitMode,
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
      })),
      ...(foregroundOverlay ? { foregroundOverlay: true as const } : {}),
    },
  };
}

const BOX = { x: 480, y: 270, width: 960, height: 540 };

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
}): Promise<CasparRuntime> {
  const oscPort = await freeUdpPort();
  tracePath = path.join(
    os.tmpdir(),
    `cg-liveseat-${String(process.pid)}-${String(Date.now())}-${String(Math.round(performance.now() * 1000))}.ndjson`,
  );
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 30, tracePath });
  const r = new CasparRuntime(
    singleServer(mock.amcpPort, oscPort),
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
  r.templateImport(options.template, '<!doctype html><html><body>served</body></html>');
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
