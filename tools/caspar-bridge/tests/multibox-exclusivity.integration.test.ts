import * as dgram from 'node:dgram';
import { afterEach, expect, it } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import type {
  ConnectionConfig,
  SourceAssignments,
  SourceCatalog,
  TemplateInfo,
} from '@cg/shared-ipc';
import { CasparRuntime } from '../src/caspar-runtime.js';
import { HEALTH_MS } from './support/harness.js';

/**
 * 🔴 **`multibox-layout-switch` §12.6 — EXACTLY ONE MULTI-BOX TEMPLATE ON AIR PER
 * CHANNEL, refused at BOTH doors through ONE predicate.**
 *
 * The client's requirement is *"a switch between the multi-box layouts, with exactly ONE
 * active at a time, so the operator cannot make a mistake"* (`design.md` §0.1). `design.md`
 * §8 measured that two multi-box templates on air together is reachable TODAY by two
 * independent paths, and that the tree has no mutual-exclusion primitive at all:
 *
 * - **`take()`** — `#planLiveSeating` allocates a second template's plates AROUND the
 *   first's rather than refusing.
 * - **`restore()`** — adopts every retained on-air item with no cap, and **never passes
 *   through `take()`**.
 *
 * ⚠ **THE RESTORE DOOR IS THE ONE WITH NO OTHER COVER, and it is the reason this file has
 * two `it`s that look like one.** A refusal wired only into `take()` would pass every
 * take-shaped test while a reconnect silently re-seated the exact pair the take refuses —
 * and a reconnect is when an operator is least able to notice.
 *
 * The BOUNDARY cases carry as much weight as the refusals: a single-box template, a
 * different channel, and a `loaded` (not on-air) row must all still go through, or the
 * rule would be enforced by breaking things it was never about.
 */

let mock: MockHandle | null = null;
let runtime: CasparRuntime | null = null;

/** Clear of the policy band (10–19) where the TEMPLATES go. */
const BAND = { start: 30, end: 39 };
const SCENE = { width: 1920, height: 1080 };
const CENTRED = { anchor: 'center' as const, offset: { x: 0, y: 0 } };
const BOX = { x: 480, y: 270, width: 960, height: 540 };

afterEach(async () => {
  await runtime?.stop();
  runtime = null;
  await mock?.stop();
  mock = null;
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

/** A template declaring `boxes` holes — `> 1` is what makes it MULTI-box. */
function template(templateId: string, boxes: number): TemplateInfo {
  return {
    templateId,
    templateType: 'lower-third',
    fields: [],
    liveSources: {
      resolution: SCENE,
      defaultPosition: CENTRED,
      sources: Array.from({ length: boxes }, (_, i) => ({
        elementId: `el-${templateId}-${String(i)}`,
        sourceId: `guest-${String(i + 1)}`,
        rect: BOX,
        dynamic: false,
      })),
    },
  };
}

const CATALOG: SourceCatalog = {
  sources: [
    { id: 'src-a', name: 'Studio A', format: '1080i5000', producer: { kind: 'route', channel: 2 } },
    { id: 'src-b', name: 'Baku', format: '1080i5000', producer: { kind: 'route', channel: 3 } },
    { id: 'src-c', name: 'Skype 1', format: '1080i5000', producer: { kind: 'route', channel: 4 } },
  ],
  layerRange: BAND,
};

/** Every plate of every template bound, so nothing else can refuse the take. */
function assignmentsFor(templates: readonly TemplateInfo[]): SourceAssignments {
  const sources = ['src-a', 'src-b', 'src-c'];
  return {
    assignments: templates.flatMap((t) =>
      (t.liveSources?.sources ?? []).map((s, i) => ({
        templateId: t.templateId,
        plateId: s.sourceId,
        sourceId: sources[i % sources.length] ?? 'src-a',
      })),
    ),
  };
}

async function boot(templates: readonly TemplateInfo[]): Promise<CasparRuntime> {
  const oscPort = await freeUdpPort();
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 30 });
  const r = new CasparRuntime(
    singleServer(mock.amcpPort, oscPort),
    {},
    { sweepMs: 150, sourceCatalog: CATALOG, sourceAssignments: assignmentsFor(templates) },
  );
  runtime = r;
  r.start();
  await r.startServing();
  for (const t of templates) {
    r.templateImport(t, '<!doctype html><html><body>served</body></html>');
  }
  await r.whenServerHealthy(HEALTH_MS);
  return r;
}

// ────────────────────────────── DOOR 1 — `take()` ──────────────────────────────

it('🔴 DOOR 1 — a second multi-box take is REFUSED, and the refusal NAMES what holds the channel', async () => {
  const threeBox = template('three-box', 3);
  const twoBox = template('two-box', 2);
  const r = await boot([threeBox, twoBox]);

  await r.load('item-1', 'three-box', {});
  expect((await r.take('item-1')).accepted, 'the FIRST multi-box take must succeed').toBe(true);

  await r.load('item-2', 'two-box', {});
  const second = await r.take('item-2');

  expect(second.accepted).toBe(false);
  expect(second.errorCode).toBe('multibox-already-on-air');
  // Legible, not a bare boolean: BOTH halves — what is already on air and, by the code,
  // what was refused. An operator under time pressure cannot act on "no".
  expect(second.message).toContain('three-box');
  expect(second.message).toContain('item-1');
  expect(second.message).toContain('3 boxes');
  expect(second.message).toMatch(/exactly one multi-box template/i);
});

it('DOOR 1 boundary — a SINGLE-box template is not refused: this rule is about multi-box, not about live plates', async () => {
  // The distinction that keeps the predicate honest. `hasLivePlates` would refuse here —
  // which is exactly why §12.6 forbids reusing that name for this condition.
  const r = await boot([template('three-box', 3), template('one-box', 1)]);

  await r.load('item-1', 'three-box', {});
  expect((await r.take('item-1')).accepted).toBe(true);

  await r.load('item-2', 'one-box', {});
  expect((await r.take('item-2')).accepted, 'one box is not multi-box').toBe(true);
});

it('DOOR 1 boundary — the SAME item may be re-taken: the incumbent is never itself', async () => {
  const r = await boot([template('three-box', 3)]);
  await r.load('item-1', 'three-box', {});
  expect((await r.take('item-1')).accepted).toBe(true);
  // A re-take of a live row is an ordinary operator action. If the predicate counted the
  // item against itself, the switch this feature exists to build could never re-take.
  expect((await r.take('item-1')).accepted).toBe(true);
});

// ─────────────────────── DOOR 2 — `restore()`, the uncovered one ───────────────────────

it('🔴 DOOR 2 — a RESTORE that would seat a second multi-box template is refused, with its own sentence', async () => {
  const r = await boot([template('three-box', 3), template('two-box', 2)]);

  const result = await r.restore([
    { itemId: 'item-1', templateId: 'three-box', fields: {}, state: 'on-air' },
    { itemId: 'item-2', templateId: 'two-box', fields: {}, state: 'on-air' },
  ]);

  expect(result.restored, 'the first on-air multi-box row still comes back').toBe(1);
  const skip = result.skipped.find((s) => s.itemId === 'item-2');
  expect(skip?.reason).toBe('multibox-already-on-air');
  // `RestoreSkipReason` is a fixed code and cannot say WHICH template holds the channel;
  // the detail is the half that makes the skip actionable.
  expect(skip?.detail).toContain('three-box');
  expect(skip?.detail).toContain('item-1');
});

it('🔴 DOOR 2 — the refusal mutates NOTHING: the refused row holds no slot and no ledger entry', async () => {
  // A refused restore that had already taken a layer would leave a permanently occupied
  // row holding nothing — the B-114 shape, reached from a new direction.
  const r = await boot([template('three-box', 3), template('two-box', 2)]);

  await r.restore([
    { itemId: 'item-1', templateId: 'three-box', fields: {}, state: 'on-air' },
    { itemId: 'item-2', templateId: 'two-box', fields: {}, state: 'on-air' },
  ]);

  expect(r.stackSnapshot().some((i) => i.itemId === 'item-2')).toBe(false);
  expect(r.liveLayers().has('item-2')).toBe(false);
  // …and the layer the refused row would have used is free for the next thing that asks.
  await r.load('item-3', 'three-box', {});
  expect(r.stackSnapshot().some((i) => i.itemId === 'item-3')).toBe(true);
});

it('DOOR 2 boundary — a LOADED multi-box row still restores: only an ON-AIR row can collide', async () => {
  // `loaded` puts nothing on the channel. Refusing it would silently delete a row the
  // operator can see, which is the B-108 hazard this refusal must not become.
  const r = await boot([template('three-box', 3), template('two-box', 2)]);

  const result = await r.restore([
    { itemId: 'item-1', templateId: 'three-box', fields: {}, state: 'on-air' },
    { itemId: 'item-2', templateId: 'two-box', fields: {}, state: 'loaded' },
  ]);

  expect(result.restored).toBe(2);
  expect(result.skipped.some((s) => s.reason === 'multibox-already-on-air')).toBe(false);
});

// ─────────────────────────── ONE PREDICATE, BOTH DOORS ───────────────────────────

it('🔴 ONE predicate — both doors refuse the SAME pair and give the SAME sentence', async () => {
  // Golden rule 6, asserted rather than asserted-about: two sites are required by §8
  // because restore never passes through take, so the thing that must be proved is that
  // they cannot describe one rule differently.
  const takeRuntime = await boot([template('three-box', 3), template('two-box', 2)]);
  await takeRuntime.load('item-1', 'three-box', {});
  await takeRuntime.take('item-1');
  await takeRuntime.load('item-2', 'two-box', {});
  const takeRefusal = await takeRuntime.take('item-2');
  await takeRuntime.stop();
  runtime = null;
  await mock?.stop();
  mock = null;

  const restoreRuntime = await boot([template('three-box', 3), template('two-box', 2)]);
  const restoreRefusal = await restoreRuntime.restore([
    { itemId: 'item-1', templateId: 'three-box', fields: {}, state: 'on-air' },
    { itemId: 'item-2', templateId: 'two-box', fields: {}, state: 'on-air' },
  ]);

  const restoreSkip = restoreRefusal.skipped.find((s) => s.itemId === 'item-2');
  expect(takeRefusal.message).toBeDefined();
  expect(restoreSkip?.detail).toBe(takeRefusal.message);
});
