import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import * as ipc from '@cg/shared-ipc';
import type { AuditEntry, StackItemState } from '@cg/shared-schema';
import { buildRoutes } from '../src/bridge.js';
import { CasparRuntime } from '../src/caspar-runtime.js';
import {
  PUBLISH_SCOPE,
  ROUTE_SCOPE,
  scopePayload,
  TELL_NOTHING,
  type ScopeContext,
  type ScopeEntry,
} from '../src/channel-scope.js';
import { TEST_LAYER_POLICY } from './support/harness.js';

/**
 * 🔴 `CENTRAL-BRIDGE-01` (D4) — **THE SCOPE TABLE IS EXHAUSTIVE, AND EVERY SCOPED PROJECTION TELLS A
 * CHANNEL-1 CONSOLE NOTHING OF CHANNEL 2.**
 *
 * The prompt's rule: _"a token without channel 2 → no command on channel 2, and none of its
 * state."_ `channel-scope.ts` is the ONE table that decides what a console is told, and these are
 * the two properties that make it worth having:
 *
 *   1. **Coverage, both ways** — every route `buildRoutes` builds and every publish channel the
 *      runtime can push is classified, and nothing classified is stale. Enumerated from the real
 *      instance and the real exports, as `B-074` and `B-247` do, never from a hand list.
 *   2. **Every scoped projection, measured** — a fixture for each carries rows on channels 1 and
 *      2 (and one on no channel), is first proven REAL by parsing it against its channel's own
 *      schema, and is then told to a console holding channel 1: nothing of channel 2 is left, the
 *      channel-1 row IS left (the control), the answer still parses, and an unscoped socket gets
 *      the payload untouched.
 */

function runtime(): CasparRuntime {
  // Neither connects nor binds — an unstarted runtime is enough (`route-coverage.test.ts`).
  return new CasparRuntime(
    {
      servers: { A: { host: '127.0.0.1', amcpPort: 5250, oscPort: 6251 } },
      strategy: 'mirror-sync',
      autoFailoverEnabled: false,
    },
    {},
    { layerPolicy: TEST_LAYER_POLICY },
  );
}

interface ChannelLike {
  readonly name: string;
  readonly payload?: z.ZodTypeAny;
  readonly request?: unknown;
  readonly response?: z.ZodTypeAny;
}

const exported = (Object.values(ipc) as unknown[]).filter(
  (v): v is ChannelLike => typeof v === 'object' && v !== null && 'name' in v,
);
const designerOnly = (name: string): boolean =>
  ipc.DESIGNER_ONLY_NAMESPACES.some((ns) => name.startsWith(ns));

/** Every publish channel a RUNTIME console can be pushed. */
const runtimePublishNames = exported
  .filter((c) => c.payload !== undefined && c.request === undefined && !designerOnly(c.name))
  .map((c) => c.name)
  .sort();

/** The schema a name's payload is checked against: a publish's payload, a route's response. */
function schemaOf(name: string, table: 'publish' | 'route'): z.ZodTypeAny {
  const channel = exported.find(
    (c) =>
      c.name === name && (table === 'publish' ? c.request === undefined : c.request !== undefined),
  );
  const schema = table === 'publish' ? channel?.payload : channel?.response;
  if (schema === undefined) throw new Error(`no ${table} schema for ${name}`);
  return schema;
}

describe('CENTRAL-BRIDGE-01 (D4) — every route and every push is classified', () => {
  it('ROUTE_SCOPE names exactly the routes the bridge builds — none missing, none stale', () => {
    const routes = [...buildRoutes(runtime()).keys()].sort();
    // Positive control: the enumeration is looking at the real set.
    expect(routes.length).toBeGreaterThan(60);
    expect(routes).toContain('stack.take');
    expect(Object.keys(ROUTE_SCOPE).sort()).toEqual(routes);
  });

  it('PUBLISH_SCOPE names exactly the runtime publish channels — none missing, none stale', () => {
    expect(runtimePublishNames.length).toBeGreaterThanOrEqual(27);
    expect(runtimePublishNames).toContain('stack.state-changed');
    expect(Object.keys(PUBLISH_SCOPE).sort()).toEqual(runtimePublishNames);
  });

  it('a read route is never classified as an intent, and an intent is never a read', () => {
    // The table's own honesty check, against the gate's policy: a `read` answer that were marked
    // an intent would reach a scoped console unprojected.
    for (const [name, route] of buildRoutes(runtime())) {
      const entry = ROUTE_SCOPE[name];
      if (route.lock === 'read') expect(entry?.kind, name).not.toBe('intent');
      else expect(entry?.kind, name).toBe('intent');
    }
  });

  it('an unclassified name tells a scoped socket NOTHING — and an unscoped one everything', () => {
    const ctx: ScopeContext = { channelsForItem: () => [] };
    expect(scopePayload(ROUTE_SCOPE, 'no.such-route', [1], () => true, ctx)).toBe(TELL_NOTHING);
    const payload = [1];
    expect(scopePayload(ROUTE_SCOPE, 'no.such-route', payload, null, ctx)).toBe(payload);
  });
});

// ── the fixtures: rows on channel 1, on channel 2, and (where the shape allows) on none ──────

const AT = '2026-09-30T10:00:00.000Z';
const slot = (channel: number, layer = 80) => ({ channel, layer, server: 'primary' as const });

const item = (itemId: string, channel?: number): StackItemState => ({
  itemId,
  templateId: 'tpl',
  fields: {},
  status: 'on-air',
  pending: false,
  ...(channel !== undefined ? { slot: slot(channel) } : {}),
});
const STACK = [item('on-1', 1), item('on-2', 2), item('nowhere')];

const RESTORE_REPORT: ipc.StackRestoreReport = {
  at: AT,
  skipped: [
    { itemId: 'skip-1', reason: 'unknown-template', slot: slot(1) },
    { itemId: 'skip-2', reason: 'unknown-template', slot: slot(2) },
    { itemId: 'skip-none', reason: 'no-layer' },
  ],
  migrated: [
    {
      itemId: 'moved-1',
      from: { channel: 1, layer: 80 },
      to: { channel: 1, layer: 50 },
      demoted: false,
    },
    {
      itemId: 'moved-2',
      from: { channel: 2, layer: 80 },
      to: { channel: 2, layer: 50 },
      demoted: false,
    },
  ],
};

const EMPTIED_AIR: ipc.EmptiedAirNotice = {
  at: AT,
  rows: [
    { itemId: 'air-1', templateId: 'tpl', slot: { channel: 1, layer: 80 } },
    { itemId: 'air-2', templateId: 'tpl', slot: { channel: 2, layer: 80 } },
    { itemId: 'air-none', templateId: 'tpl' },
  ],
  seatsDropped: 3,
  seatChannels: [1, 2, 2],
  newConnection: true,
};

const both = <T>(make: (channel: number) => T): T[] => [make(1), make(2)];

const FIXED_STATE = both((channel) => ({
  channel,
  layer: 80,
  observed: { kind: 'empty' as const },
  binding: null,
}));
const PLAYOUT_STATE = both((channel) => ({
  channel,
  layer: 40,
  observed: { kind: 'unknown' as const },
}));
const LIVE_STATE = both((channel) => ({
  channel,
  layer: 60,
  itemId: `live-${String(channel)}`,
  sourceId: 'guest-1',
  role: 'fill' as const,
  producer: 'route://1',
  held: false,
  unverified: false,
}));
const MEDIA_STATE = both((channel) => ({
  itemId: `media-${String(channel)}`,
  plateId: 'guest-1',
  channel,
  layer: 61,
  paused: false,
  ended: false,
  loop: true,
}));
const ORPHANS = both((channel) => ({ channel, layer: 90, producer: 'html', since: AT }));
const CLEARED_OUTSIDE = both((channel) => ({ channel, layer: 90, at: AT }));
const OWNED_OCCUPANCY = both((channel) => ({
  channel,
  layer: 91,
  itemId: `own-${String(channel)}`,
  producer: 'html',
  since: AT,
}));
const REHEARSE = both((channel) => ({ itemId: `pvw-${String(channel)}`, channel, layer: 82 }));
const PGM = both((channel) => ({ channel, state: 'live' as const }));
const STRAYS = both((casparChannel) => ({
  itemId: `stray-${String(casparChannel)}`,
  templateId: 'tpl',
  casparChannel,
  layer: 85,
  observed: 'producer' as const,
}));
const AUDIT: AuditEntry[] = [
  { ts: AT, actor: 'Sara', action: 'take', slot: slot(1), outcome: 'ok' },
  { ts: AT, actor: 'Reza', action: 'take', slot: slot(2), outcome: 'ok' },
  {
    ts: AT,
    actor: 'Sara',
    action: 'refused',
    outcome: 'failed',
    refused: { channel: 'stack.take', casparChannel: 2 },
  },
  { ts: AT, actor: 'Sara', action: 'import', templateId: 'tpl', outcome: 'ok' },
];

/** Every scoped name's fixture — a new scoped entry must bring one (asserted below). */
const FIXTURES: Readonly<Record<string, unknown>> = {
  'stack.state-changed': STACK,
  'stack.snapshot': STACK,
  'stack.restore-report-changed': RESTORE_REPORT,
  'stack.restore-report': RESTORE_REPORT,
  'air.emptied-changed': EMPTIED_AIR,
  'air.emptied': EMPTIED_AIR,
  'fixedLayers.state-changed': FIXED_STATE,
  'fixedLayers.state': FIXED_STATE,
  'playoutLayers.state-changed': PLAYOUT_STATE,
  'playoutLayers.state': PLAYOUT_STATE,
  'liveLayers.state-changed': LIVE_STATE,
  'liveLayers.state': LIVE_STATE,
  'liveLayers.media-state-changed': MEDIA_STATE,
  'liveLayers.media-state': MEDIA_STATE,
  'layers.orphans-changed': ORPHANS,
  'layers.orphans': ORPHANS,
  'layers.cleared-outside-changed': CLEARED_OUTSIDE,
  'layers.cleared-outside': CLEARED_OUTSIDE,
  'layers.owned-occupancy-changed': OWNED_OCCUPANCY,
  'layers.owned-occupancy': OWNED_OCCUPANCY,
  'rehearse.state-changed': REHEARSE,
  'rehearse.state': REHEARSE,
  'pgmReturn.status-changed': PGM,
  'pgmReturn.status': PGM,
  'station.strays-changed': STRAYS,
  'station.strays': STRAYS,
  'audit.recent': AUDIT,
  // `CONSOLE-POLISH-01` (`R-083`) — a page: its rows, and a cursor that names no channel.
  'audit.page': { entries: AUDIT, next: { file: '2026-09-30T10-00-00.000Z', before: 4096 } },
  // `PLAYOUT-FEATURES-01` E — the Playout's meter readings, one list per read of its stream.
  'meters.changed': [
    { kind: 'audio', channel: 1, dbfs: [-18.2, -18.6] },
    { kind: 'audio', channel: 2, dbfs: [-6, -6] },
    { kind: 'loudness', channel: 2, momentary: -22.4, shortterm: -23.1, limiterGrDb: 0 },
  ],
};

/** Every channel number a payload names — under `channel`/`casparChannel`, and each seat's. */
function channelsIn(value: unknown): number[] {
  const found: number[] = [];
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) {
      for (const x of v) walk(x);
      return;
    }
    if (typeof v !== 'object' || v === null) return;
    for (const [key, x] of Object.entries(v)) {
      if ((key === 'channel' || key === 'casparChannel') && typeof x === 'number') found.push(x);
      else if (key === 'seatChannels' && Array.isArray(x)) found.push(...(x as number[]));
      else walk(x);
    }
  };
  walk(value);
  return found;
}

const HOLDS_ONE = (channel: number): boolean => channel === 1;
const NO_ITEMS: ScopeContext = { channelsForItem: () => [] };

function scopedNames(table: Readonly<Record<string, ScopeEntry>>): string[] {
  return Object.entries(table)
    .filter(([, e]) => e.kind === 'scoped')
    .map(([n]) => n)
    .filter((n) => n !== ipc.LivePlateReleasedChannel.name) // no channel field: its own test
    .filter((n) => n !== ipc.AuditAppendedChannel.name); // ONE row, one channel: its own test
}

describe('CENTRAL-BRIDGE-01 (D4) — a channel-1 console is told nothing of channel 2', () => {
  it('every payload that carries channel state is STILL scoped — a demotion to station-wide fails here', () => {
    // The loop below measures only what the table calls scoped; this pins the other direction,
    // so a scoped line quietly re-classified would not simply drop out of the measurement.
    const scoped = new Set([...scopedNames(PUBLISH_SCOPE), ...scopedNames(ROUTE_SCOPE)]);
    expect(Object.keys(FIXTURES).filter((n) => !scoped.has(n))).toEqual([]);
    expect(PUBLISH_SCOPE[ipc.LivePlateReleasedChannel.name]?.kind).toBe('scoped');
  });

  for (const [label, table, kind] of [
    ['push', PUBLISH_SCOPE, 'publish'],
    ['read', ROUTE_SCOPE, 'route'],
  ] as const) {
    for (const name of scopedNames(table)) {
      it(`${label} ${name}`, () => {
        const fixture = FIXTURES[name];
        expect(fixture, `${name} has no fixture`).toBeDefined();
        const schema = schemaOf(name, kind);
        // The fixture is REAL — it parses against the channel's own schema — so the projection is
        // measured on a payload the bridge could actually send.
        expect(
          schema.safeParse(fixture).success,
          `${name}: the fixture is not a real payload`,
        ).toBe(true);
        // …and it carries both channels, or the assertions below would pass vacuously.
        expect(channelsIn(fixture)).toEqual(expect.arrayContaining([1, 2]));

        const told = scopePayload(table, name, fixture, HOLDS_ONE, NO_ITEMS);
        expect(told).not.toBe(TELL_NOTHING);
        expect(schema.safeParse(told).success, `${name}: the projection broke the schema`).toBe(
          true,
        );
        expect(channelsIn(told), `${name} told channel 2`).not.toContain(2);
        // CONTROL — channel 1 is still there.
        expect(channelsIn(told), `${name} lost channel 1`).toContain(1);
        // Unscoped (auth OFF, a `*` grant): the very same payload.
        expect(scopePayload(table, name, fixture, null, NO_ITEMS)).toBe(fixture);
      });
    }
  }

  it('`R-083` — a pushed audit row is told where its channel is held, and a row on no channel to all', () => {
    expect(PUBLISH_SCOPE[ipc.AuditAppendedChannel.name]?.kind).toBe('scoped');
    const [onOne, onTwo, refusedOnTwo, noChannel] = AUDIT;
    const tell = (e: AuditEntry | undefined): unknown =>
      scopePayload(PUBLISH_SCOPE, ipc.AuditAppendedChannel.name, e, HOLDS_ONE, NO_ITEMS);
    expect(tell(onOne)).toBe(onOne);
    expect(tell(onTwo)).toBe(TELL_NOTHING);
    expect(tell(refusedOnTwo)).toBe(TELL_NOTHING);
    expect(tell(noChannel)).toBe(noChannel);
    // Unscoped: every row.
    expect(scopePayload(PUBLISH_SCOPE, ipc.AuditAppendedChannel.name, onTwo, null, NO_ITEMS)).toBe(
      onTwo,
    );
  });

  it('a row on NO channel is told to every console; the station-wide seats are recounted', () => {
    const stack = scopePayload(ROUTE_SCOPE, 'stack.snapshot', STACK, HOLDS_ONE, NO_ITEMS);
    expect((stack as StackItemState[]).map((i) => i.itemId)).toEqual(['on-1', 'nowhere']);

    const notice = scopePayload(ROUTE_SCOPE, 'air.emptied', EMPTIED_AIR, HOLDS_ONE, NO_ITEMS);
    expect(notice).toEqual({
      ...EMPTIED_AIR,
      rows: [EMPTIED_AIR.rows[0], EMPTIED_AIR.rows[2]],
      seatChannels: [1],
      seatsDropped: 1,
    });

    const audit = scopePayload(ROUTE_SCOPE, 'audit.recent', AUDIT, HOLDS_ONE, NO_ITEMS);
    // The refusal ON channel 2 is channel 2's; the import is the station's.
    expect((audit as AuditEntry[]).map((e) => e.actor + ':' + e.action)).toEqual([
      'Sara:take',
      'Sara:import',
    ]);
  });

  it('a notice or a report with nothing left on held channels is NO notice (null), not an empty one', () => {
    const onlyTwo: ipc.EmptiedAirNotice = { ...EMPTIED_AIR, rows: [EMPTIED_AIR.rows[1]!] };
    expect(scopePayload(ROUTE_SCOPE, 'air.emptied', onlyTwo, HOLDS_ONE, NO_ITEMS)).toBeNull();
    const reportTwo: ipc.StackRestoreReport = {
      at: AT,
      skipped: [RESTORE_REPORT.skipped[1]!],
      migrated: [RESTORE_REPORT.migrated[1]!],
    };
    expect(
      scopePayload(ROUTE_SCOPE, 'stack.restore-report', reportTwo, HOLDS_ONE, NO_ITEMS),
    ).toBeNull();
  });

  it('a plate release (it names a ROW, no channel) is told to whoever holds the row’s channel', () => {
    const name = ipc.LivePlateReleasedChannel.name;
    const ctx: ScopeContext = {
      channelsForItem: (id) => (id === 'row-1' ? [1] : id === 'row-2' ? [2] : []),
    };
    const release = (itemId: string): ipc.LivePlateReleaseState => ({
      itemId,
      plateId: 'guest-1',
      disposition: 'torn-down',
      reason: 'the look no longer shows it',
    });
    // CONTROL — the channel-1 row's release is told, unchanged.
    const one = release('row-1');
    expect(scopePayload(PUBLISH_SCOPE, name, one, HOLDS_ONE, ctx)).toBe(one);
    expect(scopePayload(PUBLISH_SCOPE, name, release('row-2'), HOLDS_ONE, ctx)).toBe(TELL_NOTHING);
    // A row the bridge can no longer place is told to no scoped console…
    expect(scopePayload(PUBLISH_SCOPE, name, release('gone'), HOLDS_ONE, ctx)).toBe(TELL_NOTHING);
    // …and to every unscoped one.
    const gone = release('gone');
    expect(scopePayload(PUBLISH_SCOPE, name, gone, null, ctx)).toBe(gone);
  });
});
