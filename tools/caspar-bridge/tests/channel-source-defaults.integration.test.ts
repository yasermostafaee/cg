import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { SourceAssignments, SourceCatalog, TemplateInfo } from '@cg/shared-ipc';
import { saveSourceAssignments } from '../src/source-assignments-store.js';
import { openClient } from './support/auth-harness.js';
import { track } from './support/harness.js';
import { addressing, standardBank, twoChannelRig, waitUntil } from './support/two-channel-rig.js';

/**
 * 🔴 `CHANNEL-SOURCES-01` decision 2 (the owner, 2026-09-28) — **SOURCE DEFAULTS BELONG TO A
 * CHANNEL.** On `dev:station --fake` the owner changed Source defaults on channel 2, and channel 1's
 * changed too: the store was keyed `(template, plate)` and nothing more. Measured here at the fake's
 * wire, each negative with its control on the same boot:
 *
 * - a CH 2 default reaches CH 2's take and NOT CH 1's (control: CH 2 uses it);
 * - the station's stored, station-wide defaults become every declared channel's own copy on the
 *   first load, the file is rewritten, and a second load copies nothing;
 * - a channel added later starts from a copy of the template's current defaults, persisted.
 *
 * Nothing on air changes with any of it: the plates are routed inputs READ from channels 3–5 of the
 * fake, and the only writes are the take's own.
 */

const SCENE = { width: 1920, height: 1080 };
const CENTRED = { anchor: 'center' as const, offset: { x: 0, y: 0 } };
const plate = (elementId: string, sourceId: string, x: number) => ({
  elementId,
  sourceId,
  rect: { x, y: 100, width: 400, height: 225 },
  dynamic: false,
});

/** A graphics bed with two plates, as the owner's `Bed 59`. */
const TWO_BOX: TemplateInfo = {
  templateId: 'two-box',
  templateType: 'two-box',
  fields: [],
  liveSources: {
    resolution: SCENE,
    defaultPosition: CENTRED,
    sources: [plate('el-1', 'guest-1', 100), plate('el-2', 'guest-2', 600)],
  },
};
const HTML = '<!doctype html><html><body>bed</body></html>';

/** Three routed inputs, READ from channels 3, 4 and 5 of the fake — never a write target. */
const CATALOG: SourceCatalog = {
  sources: [
    { id: 'src-a', name: 'Studio A', format: '1080i5000', producer: { kind: 'route', channel: 3 } },
    { id: 'src-b', name: 'Baku', format: '1080i5000', producer: { kind: 'route', channel: 4 } },
    { id: 'src-c', name: 'Studio C', format: '1080i5000', producer: { kind: 'route', channel: 5 } },
  ],
  layerRange: { start: 60, end: 79 },
};

/** Today's shape: station-wide, one default per plate for the whole station. */
const STATION_WIDE: SourceAssignments = {
  assignments: [
    { templateId: 'two-box', plateId: 'guest-1', sourceId: 'src-a' },
    { templateId: 'two-box', plateId: 'guest-2', sourceId: 'src-b' },
  ],
};

function tmpFile(name: string): string {
  const dir = track(fs.mkdtempSync(path.join(os.tmpdir(), 'cg-chdefaults-')), (d) => {
    fs.rmSync(d, { recursive: true, force: true });
  });
  return path.join(dir, name);
}

/** Take the bed on `channel`'s row 59 and return the lines it put on that channel. */
async function takeBed(
  r: Awaited<ReturnType<typeof twoChannelRig>>,
  channel: number,
): Promise<string[]> {
  const rt = r.handle.runtime;
  const itemId = `bed-${String(channel)}`;
  expect(await rt.loadFixed({ channel, layer: 59 }, itemId, 'two-box', {})).toEqual({
    accepted: true,
  });
  const before = (await r.lines()).length;
  expect((await rt.take(itemId)).accepted, `the take on channel ${String(channel)}`).toBe(true);
  await waitUntil(
    () => (rt.liveLayers().get(itemId) ?? []).length === 2,
    `channel ${String(channel)}'s plates seated`,
  );
  return addressing((await r.lines()).slice(before), channel);
}

/** The route inputs a set of lines plays, in the order it plays them. */
const routesPlayed = (lines: readonly string[]): string[] =>
  lines.flatMap((l) => (/^PLAY /.test(l) ? (/route:\/\/(\d+)/.exec(l)?.[1] ?? []) : []));

describe('a CH 2 default stays on CH 2', () => {
  it('🔴 the take on CH 1 is unchanged — control: the take on CH 2 uses the new default', async () => {
    const r = await twoChannelRig({
      channels: 5,
      bridge: { sourceCatalog: CATALOG, sourceAssignments: STATION_WIDE },
    });
    const rt = r.handle.runtime;
    rt.templateImport(TWO_BOX, HTML);

    // The operator changes guest-1's default on CH 2 only (the dialog's write).
    expect(
      rt.setSourceAssignments({
        assignments: [
          ...STATION_WIDE.assignments,
          { channel: 2, templateId: 'two-box', plateId: 'guest-1', sourceId: 'src-c' },
        ],
      }),
    ).toEqual({ ok: true });

    // CH 1: exactly today's inputs — Studio A (3) and Baku (4).
    expect(routesPlayed(await takeBed(r, 1)).sort()).toEqual(['3', '4']);
    // Control, CH 2: the new default — Studio C (5) — and Baku.
    expect(routesPlayed(await takeBed(r, 2)).sort()).toEqual(['4', '5']);
    /*
      …and what each take FROZE, which every later look switch and swap on that row resolves from
      (session BP): CH 1's row is pinned to CH 1's defaults, not to the entry written for CH 2.
    */
    const frozen = (itemId: string) =>
      rt.stackSnapshot().find((i) => i.itemId === itemId)?.frozenAssignment;
    expect(frozen('bed-1')).toEqual({ 'guest-1': 'src-a', 'guest-2': 'src-b' });
    expect(frozen('bed-2')).toEqual({ 'guest-1': 'src-c', 'guest-2': 'src-b' });
  }, 30_000);
});

describe('the one-time copy on the first load', () => {
  it('🔴 the station-wide defaults become every declared channel’s own, the file is rewritten, and a second load copies nothing', async () => {
    const file = tmpFile('bridge-source-assignments.json');
    saveSourceAssignments(file, STATION_WIDE);

    const first = await twoChannelRig({
      channels: 5,
      bridge: { sourceCatalog: CATALOG, sourceAssignmentsPath: file },
    });
    const migrated = first.handle.runtime.sourceAssignments();
    expect(migrated.assignments).toHaveLength(4);
    for (const channel of [1, 2]) {
      expect(
        migrated.assignments
          .filter((a) => a.channel === channel)
          .map((a) => `${a.plateId}=${a.sourceId}`)
          .sort(),
        `channel ${String(channel)}'s own copy`,
      ).toEqual(['guest-1=src-a', 'guest-2=src-b']);
    }
    // Written back at once, per channel.
    const written = JSON.parse(fs.readFileSync(file, 'utf8')) as SourceAssignments;
    expect(written.assignments.every((a) => a.channel !== undefined)).toBe(true);
    expect(written).toEqual(migrated);
    // Nothing on air changes: CH 1 takes exactly what it took before the copy.
    first.handle.runtime.templateImport(TWO_BOX, HTML);
    expect(routesPlayed(await takeBed(first, 1)).sort()).toEqual(['3', '4']);

    // A SECOND load of the same file copies nothing again: the bytes stay as they are.
    const bytes = fs.readFileSync(file);
    const second = await twoChannelRig({
      channels: 5,
      bridge: { sourceCatalog: CATALOG, sourceAssignmentsPath: file },
    });
    expect(second.handle.runtime.sourceAssignments()).toEqual(migrated);
    expect(fs.readFileSync(file).equals(bytes)).toBe(true);
  }, 45_000);
});

describe('a channel added later', () => {
  it('🔴 starts from a copy of CH 1’s current defaults, persisted — over the socket, through set-banks', async () => {
    const file = tmpFile('bridge-source-assignments.json');
    const perChannel: SourceAssignments = {
      assignments: [
        { channel: 1, templateId: 'two-box', plateId: 'guest-1', sourceId: 'src-c' },
        { channel: 1, templateId: 'two-box', plateId: 'guest-2', sourceId: 'src-b' },
      ],
    };
    saveSourceAssignments(file, perChannel);
    const r = await twoChannelRig({
      channels: 5,
      banks: [standardBank(1)],
      bridge: { sourceCatalog: CATALOG, sourceAssignmentsPath: file },
    });
    const client = await openClient(r.handle);
    const res = await client.ask('b1', 'fixedLayers.set-banks', {
      banks: [standardBank(1), standardBank(2)],
    });
    expect(res.error).toBeUndefined();
    expect(res.payload).toMatchObject({ ok: true });

    const onTwo = r.handle.runtime
      .sourceAssignments()
      .assignments.filter((a) => a.channel === 2)
      .map((a) => `${a.plateId}=${a.sourceId}`)
      .sort();
    expect(onTwo).toEqual(['guest-1=src-c', 'guest-2=src-b']);
    const written = JSON.parse(fs.readFileSync(file, 'utf8')) as SourceAssignments;
    expect(written).toEqual(r.handle.runtime.sourceAssignments());
    // Control: CH 1's own are where they were.
    expect(written.assignments.filter((a) => a.channel === 1).map((a) => a.sourceId)).toEqual([
      'src-c',
      'src-b',
    ]);
  }, 30_000);

  it('a station that MOVES (one bank for one) carries its defaults to the new channel', async () => {
    const perChannel: SourceAssignments = {
      assignments: [
        { channel: 1, templateId: 'two-box', plateId: 'guest-1', sourceId: 'src-c' },
        { channel: 1, templateId: 'two-box', plateId: 'guest-2', sourceId: 'src-b' },
      ],
    };
    const r = await twoChannelRig({
      channels: 5,
      banks: [standardBank(1)],
      bridge: { sourceCatalog: CATALOG, sourceAssignments: perChannel },
    });
    expect(r.handle.runtime.setFixedLayerBanks([standardBank(2)])).toMatchObject({ ok: true });
    r.handle.runtime.templateImport(TWO_BOX, HTML);
    expect(routesPlayed(await takeBed(r, 2)).sort()).toEqual(['4', '5']);
  }, 30_000);
});
