import * as dgram from 'node:dgram';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import type {
  ConnectionConfig,
  SourceAssignments,
  SourceCatalog,
  TemplateInfo,
} from '@cg/shared-ipc';
import type { LiveFitMode } from '@cg/shared-schema';
import { CasparRuntime } from '../src/caspar-runtime.js';
import { awaitChannelModeRead, HEALTH_MS } from './support/harness.js';

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
  return fs
    .readFileSync(tracePath, 'utf-8')
    .split('\n')
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as { dir: string; line: string })
    .filter((e) => e.dir === 'recv')
    .map((e) => e.line);
}

interface PlateSpec {
  id: string;
  rect: { x: number; y: number; width: number; height: number };
  expectedAspect?: number;
  /** `C-028` — the AUTHOR's fit mode. Absent ⇒ `contain`, the shipped default. */
  fitMode?: LiveFitMode;
}

/** A template declaring one hole per entry, each with its own rect. */
function template(plates: readonly PlateSpec[]): TemplateInfo {
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
      })),
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
  // The producer, the mute and BOTH halves of the fit, in that order.
  const play = at(lines, `PLAY 1-${String(layer)} `);
  const mute = at(lines, `MIXER 1-${String(layer)} VOLUME 0`);
  const fill = at(lines, `MIXER 1-${String(layer)} FILL `);
  const clip = at(lines, `MIXER 1-${String(layer)} CLIP `);
  expect(play, 'the producer must reach the wire').toBeGreaterThanOrEqual(0);
  expect(mute, '6.5 — every bridge-created producer is created MUTED').toBeGreaterThanOrEqual(0);
  expect(fill).toBeGreaterThanOrEqual(0);
  expect(clip).toBeGreaterThanOrEqual(0);
  expect(mute).toBeGreaterThan(play);
  expect(fill).toBeGreaterThan(mute);
  expect(clip).toBeGreaterThan(fill);
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

it('🔴 a RE-TAKE lands on the same layers — a moved plate would strand a live picture', async () => {
  const r = await boot({ template: template([{ id: 'guest-1', rect: BOX }]) });
  await loadAndTake(r);
  const first = r.liveLayers().get('item-1')?.[0]?.slot;

  await r.take('item-1');

  const records = r.liveLayers().get('item-1') ?? [];
  expect(records).toHaveLength(1);
  expect(records[0]?.slot).toEqual(first);
  // …and the ledger names exactly one coordinate, so teardown reaches everything
  // this item ever put on air.
  const lines = await recvLines();
  const played = lines.filter((l) => l.startsWith(`PLAY 1-${String(BAND.start)} `));
  expect(played).toHaveLength(2);
  expect(lines.some((l) => l.startsWith(`PLAY 1-${String(BAND.start + 1)} `))).toBe(false);
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

it('an aspect the assigned source contradicts refuses a `cover` take, with the wire untouched', async () => {
  const r = await boot({
    // The author designed for 4:3; `src-a` is a 16:9 format — 33% apart.
    // 🔴 `C-028` — the mode is now STATED. Cropping is what this refusal guards
    // against, so the refusal belongs to `cover` and the fixture must say so; left
    // implicit it would fall to the `contain` default and stop testing a refusal at all.
    template: template([{ id: 'guest-1', rect: BOX, expectedAspect: 4 / 3, fitMode: 'cover' }]),
  });
  await r.load('item-1', 'lower-third', {});
  const before = (await recvLines()).length;

  const verdict = await r.take('item-1');

  expect(verdict.accepted).toBe(false);
  expect(verdict.errorCode).toBe('live-source-aspect-mismatch');
  expect((await recvLines()).slice(before)).toEqual([]);
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
