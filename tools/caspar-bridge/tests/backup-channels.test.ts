import { describe, expect, it } from 'vitest';
import type { BackupChannelEntry } from '@cg/shared-ipc';
import { BackupChannels, playoutHostOf, BACKUP_D4_FRESH_MS } from '../src/backup-channels.js';
import { entriesFor } from '../src/backup-channels-store.js';
import type { CatalogueRow } from '../src/playout-catalogue.js';

/**
 * 🔴 `RELEASE-0113-01` (`R-089`) — the mapping, by the Playout team's rule (§3), over every D4 shape the prompt
 * names. The pair: the primary engine at `192.168.21.111:8080`, its core channels 1 and 2 (`apasai`, `cg-test2`);
 * the backup engine's core at `192.168.21.112`, whose channel 1 is its OWN programme and whose 2 and 3 are the
 * mirrors.
 */
const A_HOST = '192.168.21.111';
const B_HOST = '192.168.21.112';
const MODE = '1080i5000';

const aRows: CatalogueRow[] = [
  { id: 'apasai', name: 'APASAI', casparHost: A_HOST, casparChannel: 1, videoMode: MODE },
  { id: 'cg-test2', name: 'CG', casparHost: A_HOST, casparChannel: 2, videoMode: MODE },
];

function bRow(
  channel: number,
  mirrorOf: { playout: string; id: string } | null | undefined,
  extra: Partial<CatalogueRow> = {},
): CatalogueRow {
  return {
    id: `b-${String(channel)}`,
    name: `B ${String(channel)}`,
    casparHost: B_HOST,
    casparChannel: channel,
    videoMode: MODE,
    cgLicensed: true,
    ...(mirrorOf !== undefined ? { mirrorOf } : {}),
    ...extra,
  };
}

/** `2.9.5`: B's own programme at 1, A's 1 and 2 mirrored at 2 and 3. */
const B_295: CatalogueRow[] = [
  bRow(1, null),
  bRow(2, { playout: `${A_HOST}:8080`, id: 'apasai' }),
  bRow(3, { playout: A_HOST, id: 'cg-test2' }),
];

interface Rig {
  readonly map: BackupChannels;
  setB(rows: readonly CatalogueRow[] | null): void;
  setA(rows: readonly CatalogueRow[] | null): void;
  setEntries(entries: BackupChannelEntry[]): void;
  setLive(channel: number, live: boolean): void;
  advance(ms: number): void;
  readonly logs: string[];
}

function rig(options: { b?: readonly CatalogueRow[] | null; declared?: number[] } = {}): Rig {
  let a: readonly CatalogueRow[] | null = aRows;
  let b: readonly CatalogueRow[] | null = options.b === undefined ? B_295 : options.b;
  let now = 1_000_000;
  let readAt: number | null = b === null ? null : now;
  let entries: BackupChannelEntry[] = [];
  const live = new Set<number>();
  const logs: string[] = [];
  const map = new BackupChannels({
    declared: () => options.declared ?? [1, 2],
    serverAHost: () => A_HOST,
    serverB: () => ({ host: B_HOST, amcpPort: 5250 }),
    primaryEngineHost: () => A_HOST,
    primaryRows: () => a,
    backupRows: () => b,
    backupReadAtMs: () => readAt,
    entries: () =>
      entriesFor(
        { server: { host: B_HOST, amcpPort: 5250 }, entries },
        { host: B_HOST, amcpPort: 5250 },
      ),
    liveOn: (channel) => live.has(channel),
    now: () => now,
    log: (line) => logs.push(line),
  });
  return {
    map,
    setB(rows) {
      b = rows;
      if (rows !== null) readAt = now;
      map.recompute();
    },
    setA(rows) {
      a = rows;
      map.recompute();
    },
    setEntries(next) {
      entries = next;
      map.recompute();
    },
    setLive(channel, isLive) {
      if (isLive) live.add(channel);
      else live.delete(channel);
    },
    advance(ms) {
      now += ms;
      map.recompute();
    },
    logs,
  };
}

const lineOf = (r: Rig, channel: number) =>
  r.map.state().backup?.channels.find((c) => c.channel === channel);

describe('R-089 — the Playout team’s rule, from the backup engine’s own D4 (`2.9.5`)', () => {
  it('🔴 `mirrorOf` naming A’s host — with a port and without — maps 1 → 2 and 2 → 3; never B’s 1', () => {
    const r = rig();
    expect(r.map.channelOnB(1)).toBe(2);
    expect(r.map.channelOnB(2)).toBe(3);
    expect(r.map.stationChannelOf(1)).toBe(null);
    expect(r.map.stationChannelOf(2)).toBe(1);
    expect(lineOf(r, 1)).toEqual({
      channel: 1,
      state: 'mapped',
      backupChannel: 2,
      source: 'playout',
    });
  });

  it('`mirrorOf.playout` with a scheme reads the same host; the host is compared without case', () => {
    const r = rig({
      b: [bRow(1, null), bRow(2, { playout: 'HTTP://192.168.21.111:8080/', id: 'apasai' })],
    });
    expect(r.map.channelOnB(1)).toBe(2);
  });

  it('🔴 a NAME where CG knows an IP is no match: no mapping, unless an entry is given and checked', () => {
    const r = rig({ b: [bRow(1, null), bRow(2, { playout: 'playout-a:8080', id: 'apasai' })] });
    expect(r.map.channelOnB(1)).toBe(null);
    expect(lineOf(r, 1)?.reason).toBe(
      "The backup engine's mirror of CH 1 names another primary engine (playout-a:8080).",
    );
    r.setEntries([{ channel: 1, backupChannel: 2 }]);
    expect(r.map.channelOnB(1)).toBe(2);
    expect(lineOf(r, 1)).toMatchObject({ state: 'mapped', source: 'entry', entry: 2 });
  });

  it('an empty `playout`: one row is the mapping; two rows are none', () => {
    const one = rig({ b: [bRow(1, null), bRow(2, { playout: '', id: 'apasai' })] });
    expect(one.map.channelOnB(1)).toBe(2);
    const two = rig({
      b: [
        bRow(1, null),
        bRow(2, { playout: '', id: 'apasai' }),
        bRow(4, { playout: ' ', id: 'apasai' }),
      ],
    });
    expect(two.map.channelOnB(1)).toBe(null);
    expect(lineOf(two, 1)?.reason).toBe('The backup engine names 2 mirrors of CH 1.');
  });

  it('two rows naming A for the same id are none — the rule never picks one', () => {
    const r = rig({
      b: [
        bRow(2, { playout: A_HOST, id: 'apasai' }),
        bRow(4, { playout: `${A_HOST}:8080`, id: 'apasai' }),
      ],
    });
    expect(r.map.channelOnB(1)).toBe(null);
  });

  it('🔴 a `videoMode` mismatch and `cgLicensed: false` are refused in words', () => {
    const mode = rig({
      b: [bRow(2, { playout: A_HOST, id: 'apasai' }, { videoMode: '720p5000' })],
    });
    expect(mode.map.channelOnB(1)).toBe(null);
    expect(lineOf(mode, 1)?.reason).toBe(
      'Video mode differs: CH 1 is 1080i5000, backup CH 2 is 720p5000.',
    );
    const unlicensed = rig({
      b: [bRow(2, { playout: A_HOST, id: 'apasai' }, { cgLicensed: false })],
    });
    expect(unlicensed.map.channelOnB(1)).toBe(null);
    expect(lineOf(unlicensed, 1)?.reason).toBe('CG is not licensed on backup CH 2.');
  });

  it('a mirror whose core is not server B is refused (rule 9 already applied)', () => {
    const r = rig({ b: [bRow(2, { playout: A_HOST, id: 'apasai' }, { casparHost: '10.0.0.9' })] });
    expect(r.map.channelOnB(1)).toBe(null);
    expect(lineOf(r, 1)?.reason).toBe(`Backup CH 2 is on 10.0.0.9, not on server B (${B_HOST}).`);
  });
});

describe('R-089 — an engine before `2.9.5`: the station admin’s entry, checked against B’s D4', () => {
  const B_292: CatalogueRow[] = [bRow(1, undefined), bRow(2, undefined), bRow(3, undefined)];

  it('🔴 no `mirrorOf` at all: nothing is mapped until an entry is given; then it is checked and used', () => {
    const r = rig({ b: B_292 });
    expect(r.map.channelOnB(1)).toBe(null);
    expect(lineOf(r, 1)?.reason).toBe(
      'The backup engine publishes no mirrors (Playout before 2.9.5).',
    );
    r.setEntries([{ channel: 1, backupChannel: 2 }]);
    expect(r.map.channelOnB(1)).toBe(2);
    expect(r.map.channelOnB(2)).toBe(null);
  });

  it('an entry naming a row B does not list, a mismatched mode or an unlicensed row is refused beside it', () => {
    const r = rig({ b: [...B_292.slice(0, 2), bRow(3, undefined, { videoMode: '720p5000' })] });
    r.setEntries([
      { channel: 1, backupChannel: 9 },
      { channel: 2, backupChannel: 3 },
    ]);
    expect(lineOf(r, 1)).toMatchObject({
      state: 'not-mapped',
      entry: 9,
      entryRefusal: 'The backup engine lists no CH 9 on server B.',
    });
    expect(lineOf(r, 2)?.entryRefusal).toBe(
      'Video mode differs: CH 2 is 1080i5000, backup CH 3 is 720p5000.',
    );
  });

  it('one B channel entered for two channels refuses both', () => {
    const r = rig({ b: B_292 });
    r.setEntries([
      { channel: 1, backupChannel: 2 },
      { channel: 2, backupChannel: 2 },
    ]);
    expect(r.map.channelOnB(1)).toBe(null);
    expect(r.map.channelOnB(2)).toBe(null);
    expect(lineOf(r, 1)?.entryRefusal).toBe('CH 2 is entered for two channels.');
  });

  it('🔴 an entry and D4 that DISAGREE are no mapping, said — never one picked', () => {
    const r = rig();
    r.setEntries([{ channel: 1, backupChannel: 3 }]);
    expect(r.map.channelOnB(1)).toBe(null);
    expect(lineOf(r, 1)?.reason).toBe('The entry (CH 3) and the backup engine (CH 2) disagree.');
    // CONTROL: an entry that agrees changes nothing.
    r.setEntries([{ channel: 1, backupChannel: 2 }]);
    expect(lineOf(r, 1)).toMatchObject({ state: 'mapped', backupChannel: 2, source: 'playout' });
  });

  it('an entry naming another channel’s declared mirror is refused', () => {
    const r = rig({ b: [bRow(1, null), bRow(3, { playout: A_HOST, id: 'cg-test2' })] });
    r.setEntries([{ channel: 1, backupChannel: 3 }]);
    expect(lineOf(r, 1)?.entryRefusal).toBe('Backup CH 3 is the mirror of another channel.');
  });

  it('entries made for another server B are not used, and are said', () => {
    expect(
      entriesFor(
        {
          server: { host: '10.0.0.5', amcpPort: 5250 },
          entries: [{ channel: 1, backupChannel: 2 }],
        },
        { host: B_HOST, amcpPort: 5250 },
      ),
    ).toEqual({ entries: [], madeForAnother: '10.0.0.5:5250' });
  });
});

describe('R-089 — kept current', () => {
  it('🔴 a mapping that CHANGES while live is HELD: nothing to B for it, not on 2 and not on 4, until its next take', () => {
    const r = rig();
    r.setLive(1, true);
    r.setB([bRow(1, null), bRow(4, { playout: A_HOST, id: 'apasai' }), B_295[2] as CatalogueRow]);
    expect(r.map.channelOnB(1)).toBe(null);
    expect(r.map.stationChannelOf(2)).toBe(null);
    expect(r.map.stationChannelOf(4)).toBe(null);
    expect(lineOf(r, 1)).toMatchObject({ state: 'held', backupChannel: 4 });
    expect(r.map.channelOnBAtTake(1)).toBe(4);
    expect(r.logs.some((l) => l.includes('moved to 4 while it is live'))).toBe(true);
    // The other channel is untouched.
    expect(r.map.channelOnB(2)).toBe(3);
    r.map.release(1);
    expect(r.map.channelOnB(1)).toBe(4);
    expect(lineOf(r, 1)).toMatchObject({ state: 'mapped', backupChannel: 4 });
  });

  it('a mapping that DISAPPEARS while live is held, and a take with none leaves it unmapped', () => {
    const r = rig();
    r.setLive(1, true);
    r.setB([bRow(1, null), B_295[2] as CatalogueRow]);
    expect(lineOf(r, 1)?.state).toBe('held');
    r.map.release(1);
    expect(r.map.channelOnB(1)).toBe(null);
    expect(lineOf(r, 1)?.state).toBe('not-mapped');
  });

  it('CONTROL: a change while nothing is live is in force at once', () => {
    const r = rig();
    r.setB([bRow(1, null), bRow(4, { playout: A_HOST, id: 'apasai' })]);
    expect(r.map.channelOnB(1)).toBe(4);
  });

  it('🔴 B’s D4 counts for 30 s after its last answer — one missed poll keeps the mirror, a silent minute drops it', () => {
    const r = rig();
    r.setB(null); // a failed read: ABSENT, but the last answer is 0 s old
    expect(r.map.channelOnB(1)).toBe(2);
    r.advance(BACKUP_D4_FRESH_MS - 1);
    expect(r.map.channelOnB(1)).toBe(2);
    r.advance(2);
    expect(r.map.channelOnB(1)).toBe(null);
    expect(lineOf(r, 1)?.reason).toBe(
      "The backup engine's channel list has not answered for 30 s.",
    );
  });

  it('🔴 A’s last good D4 is kept through the primary’s outage — a failover is when the mapping is needed', () => {
    const r = rig();
    r.setA(null);
    expect(r.map.channelOnB(1)).toBe(2);
  });

  it('nothing read from B yet: nothing mapped, in words', () => {
    const r = rig({ b: null });
    expect(r.map.channelOnB(1)).toBe(null);
    expect(lineOf(r, 1)?.reason).toBe("The backup engine's channel list has not been read.");
  });
});

describe('playoutHostOf — the host a typed `mirrorOf.playout` names', () => {
  it.each([
    ['192.168.21.111:8080', '192.168.21.111'],
    ['192.168.21.111', '192.168.21.111'],
    ['http://Playout-A:8080/', 'playout-a'],
    ['[::1]:8080', '::1'],
    ['', null],
    ['   ', null],
  ])('%j → %j', (typed, host) => {
    expect(playoutHostOf(typed)).toBe(host);
  });
});
