import { describe, expect, it } from 'vitest';
import type { SourceCatalog, TemplateLiveSources, TemplateLook } from '@cg/shared-ipc';
import type { LiveSourceRect } from '@cg/shared-schema';
import { framesOfLook, resolveLookBindings } from '../src/live-look-bindings.js';

/**
 * Session BM — **a seat is one producer per DISTINCT RESOLVED INPUT, per item.**
 *
 * The pure half of the model: no bridge, no wire, no server. What is proven here is the
 * arithmetic the seating plan then acts on — how many producers an item needs, which frame
 * punches which, and which configurations are refusable. The wire's half is
 * `live-look-reconcile.integration.test.ts`'s.
 */

const CELL = (x: number): LiveSourceRect => ({ x, y: 0, width: 640, height: 360 });
const FULL: LiveSourceRect = { x: 0, y: 0, width: 1920, height: 1080 };

const look = (id: string, rects: Record<string, LiveSourceRect>): TemplateLook => ({
  id,
  name: id,
  entered: { mode: 'cut' },
  rects,
});

/** The owner's real template: a 3-box, a 2-box and a solo over three declared holes. */
function carrier(over: Partial<TemplateLiveSources> = {}): TemplateLiveSources {
  return {
    resolution: { width: 1920, height: 1080 },
    defaultPosition: { anchor: 'center', offset: { x: 0, y: 0 } },
    sources: ['l-1', 'l-2', 'l-3'].map((k, i) => ({
      elementId: `el-${k}`,
      sourceId: k,
      rect: CELL(i * 640),
      dynamic: false,
    })),
    looks: [
      look('three', { 'l-1': CELL(0), 'l-2': CELL(640), 'l-3': CELL(1280) }),
      look('two', { 'l-1': CELL(0), 'l-2': CELL(640) }),
      look('solo', { 'l-3': FULL }),
    ],
    defaultLookId: 'three',
    ...over,
  } as TemplateLiveSources;
}

const catalog: SourceCatalog = {
  sources: [
    { id: 'studio-1', name: 'Studio 1', producer: { kind: 'route', channel: 2 } },
    { id: 'studio-2', name: 'Studio 2', producer: { kind: 'route', channel: 3 } },
    { id: 'studio-3', name: 'Studio 3', producer: { kind: 'route', channel: 4 } },
    // A fourth input, used by NO look until a test binds one to it.
    { id: 'studio-4', name: 'Studio 4', producer: { kind: 'route', channel: 5 } },
    // Two catalog ENTRIES naming ONE physical route — the case the dedupe key decides.
    { id: 'studio-3-alias', name: 'Studio 3 (alias)', producer: { kind: 'route', channel: 4 } },
  ],
  layerRange: { start: 10, end: 59 },
};

const ASSIGNMENTS = [
  { templateId: 'debate', plateId: 'l-1', sourceId: 'studio-1' },
  { templateId: 'debate', plateId: 'l-2', sourceId: 'studio-2' },
  { templateId: 'debate', plateId: 'l-3', sourceId: 'studio-3' },
];

/** The real `CommandBuilder.sourceArgument` spelling for the forms this fixture uses. */
const argumentOf = (s: { producer: { kind: string; channel?: number } }): string =>
  `"route://${String(s.producer.channel ?? 0)}"`;

function plan(over: Parameters<typeof resolveLookBindings>[0] | Record<string, unknown> = {}) {
  return resolveLookBindings({
    templateId: 'debate',
    carrier: carrier(),
    assignments: ASSIGNMENTS,
    catalog,
    argumentOf,
    ...over,
  } as Parameters<typeof resolveLookBindings>[0]);
}

describe('the seat count', () => {
  it('🔴 is the DISTINCT INPUTS across every look — not the sum of the looks members', () => {
    const p = plan();
    /*
      The arithmetic that decides whether this model is affordable. Σ|look members| is
      3 + 2 + 1 = SIX; the declared plate count is THREE; and the answer is three, because
      `three` and `two` share `l-1`/`l-2` and `solo` shares `l-3`. Growth happens only when
      a look is bound to an input no other look uses.
    */
    expect(p.frames).toHaveLength(6);
    expect([...p.seats.keys()].sort()).toEqual(['"route://2"', '"route://3"', '"route://4"']);
  });

  it('grows by exactly ONE per input NO other look uses — never by the frame count', () => {
    // `two`'s l-1 leaves studio-1 for studio-4, which nothing else uses: one new seat. And
    // studio-1 does NOT go away, because `three` still binds l-1 to it.
    const p = plan({ bindings: { two: { 'l-1': 'studio-4' } } });
    expect(p.frames, 'the frame count is a property of the LOOKS, and did not move').toHaveLength(
      6,
    );
    expect([...p.seats.keys()].sort()).toEqual([
      '"route://2"',
      '"route://3"',
      '"route://4"',
      '"route://5"',
    ]);
  });

  it('SHRINKS when the last look using an input is pointed elsewhere', () => {
    // Both frames of studio-3 (`three/l-3` and `solo/l-3`) move onto studio-1, so studio-3
    // is bound nowhere and needs no producer at all.
    const p = plan({ bindings: { three: { 'l-3': 'studio-1' }, solo: { 'l-3': 'studio-1' } } });
    expect([...p.seats.keys()].sort()).toEqual(['"route://2"', '"route://3"']);
    // …and studio-1's seat is now punched by three different frames across the three looks.
    expect(
      p.seats.get('"route://2"')?.frames.map((f) => `${f.lookId ?? '-'}/${f.plateId}`),
    ).toEqual(['three/l-1', 'three/l-3', 'two/l-1', 'solo/l-3']);
  });

  it('🔴 dedupes on the WIRE ARGUMENT, so two catalog entries on one route are ONE seat', () => {
    // `never N producers on one route` is about the route, not about the catalog's naming:
    // `two/l-2` joins `three/l-3` and `solo/l-3` on route 4 under a DIFFERENT catalog id.
    const p = plan({ bindings: { two: { 'l-2': 'studio-3-alias' } } });
    expect(p.seats.get('"route://4"')?.frames.map((f) => f.source.id)).toEqual([
      'studio-3',
      'studio-3-alias',
      'studio-3',
    ]);
    expect([...p.seats.keys()], 'one route, one seat').toHaveLength(3);
  });
});

describe('the four levels', () => {
  it('a per-look binding outranks the template assignment, for that look only', () => {
    const p = plan({ bindings: { solo: { 'l-3': 'studio-1' } } });
    expect(framesOfLook(p, 'solo').get('l-3')?.source.id).toBe('studio-1');
    expect(framesOfLook(p, 'three').get('l-3')?.source.id).toBe('studio-3');
  });

  it('🔴 the R-048 EMERGENCY override outranks a per-look binding, in EVERY look', () => {
    /*
      The reason is the emergency's own: an input is DEAD and the operator repointed it on
      air. If the per-look binding won, switching look would put the dead input straight
      back and the operator would have to re-patch once per look — having already been told
      the substitution was applied.
    */
    const p = plan({
      bindings: { solo: { 'l-3': 'studio-1' }, three: { 'l-3': 'studio-2' } },
      overrides: { 'l-3': 'studio-3' },
    });
    for (const lookId of ['three', 'two', 'solo']) {
      const frame = framesOfLook(p, lookId).get('l-3');
      if (lookId === 'two') expect(frame, 'two does not show l-3').toBeUndefined();
      else expect(frame?.source.id, `${lookId} must take the emergency`).toBe('studio-3');
    }
  });

  it('a binding naming a catalog entry this station lacks is UNRESOLVED, never a refusal', () => {
    const p = plan({ bindings: { solo: { 'l-3': 'retired' } } });
    expect(p.unresolved).toEqual([{ lookId: 'solo', plateId: 'l-3' }]);
    // …and it costs the OTHER looks nothing: they still resolve and still seat.
    expect([...p.seats.keys()].sort()).toEqual(['"route://2"', '"route://3"', '"route://4"']);
  });
});

describe('§6.2 — two frames of ONE look on ONE input', () => {
  it('🔴 is reported as a collision, naming both plates and the look', () => {
    const p = plan({ bindings: { three: { 'l-2': 'studio-1' } } });
    expect(p.collisions).toHaveLength(1);
    expect(p.collisions[0]).toMatchObject({
      lookId: 'three',
      plateIds: ['l-1', 'l-2'],
      sourceName: 'Studio 1',
    });
  });

  it('the SAME input in two DIFFERENT looks is NOT a collision — that is the point', () => {
    const p = plan({ bindings: { solo: { 'l-3': 'studio-1' } } });
    expect(p.collisions).toEqual([]);
    expect(p.seats.get('"route://2"')?.frames).toHaveLength(3);
  });

  it('catches it across the catalog-alias spelling too', () => {
    const p = plan({ bindings: { three: { 'l-2': 'studio-3-alias', 'l-3': 'studio-3' } } });
    expect(p.collisions.map((c) => c.plateIds)).toEqual([['l-2', 'l-3']]);
  });
});

describe('a carrier that authors no looks', () => {
  it('🔴 still seats its declarations — [undefined] IS a look', () => {
    const pre = carrier({ looks: undefined, defaultLookId: undefined });
    const p = plan({ carrier: pre });
    // Three declarations, one implicit look, three seats — exactly what it had before LOOKS.
    expect(p.frames.map((f) => f.lookId)).toEqual([undefined, undefined, undefined]);
    expect([...p.seats.keys()]).toHaveLength(3);
    expect(p.collisions).toEqual([]);
  });

  it('and a per-look binding cannot reach it — there is no look id to name', () => {
    const pre = carrier({ looks: undefined, defaultLookId: undefined });
    const p = plan({ carrier: pre, bindings: { solo: { 'l-3': 'studio-1' } } });
    expect(framesOfLook(p, undefined).get('l-3')?.source.id).toBe('studio-3');
  });
});
