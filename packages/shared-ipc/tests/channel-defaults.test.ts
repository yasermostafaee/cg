import { describe, expect, it } from 'vitest';
import {
  assignedSourceId,
  assignmentsOnChannel,
  checkSourceAssignments,
  copyAssignmentsToChannel,
  migrateAssignmentsToChannels,
  withChannelDefaults,
  type SourceAssignments,
} from '../src/channels/sources.js';

/**
 * 🔴 `CHANNEL-SOURCES-01` decision 2 (the owner, 2026-09-28) — **SOURCE DEFAULTS BELONG TO A
 * CHANNEL.** The owner changed CH 2's defaults and CH 1's changed with them: the store was keyed
 * `(template, plate)` alone. These pin the one reader, the one-time copy, the copy for a channel
 * added later, and the dialog's write — each with its control.
 */

const STATION_WIDE: SourceAssignments = {
  assignments: [
    { templateId: 'bed', plateId: 'p1', sourceId: 'in-3' },
    { templateId: 'bed', plateId: 'p2', sourceId: 'studio-1' },
  ],
};

describe('assignmentsOnChannel — the one reader', () => {
  it('🔴 a change on CH 2 is read on CH 2 and NOT on CH 1', () => {
    const edited: SourceAssignments = {
      assignments: [
        { channel: 1, templateId: 'bed', plateId: 'p1', sourceId: 'in-3' },
        { channel: 2, templateId: 'bed', plateId: 'p1', sourceId: 'studio-2' },
      ],
    };
    expect(assignedSourceId(edited, 2, 'bed', 'p1')).toBe('studio-2');
    // Control: CH 1 keeps its own.
    expect(assignedSourceId(edited, 1, 'bed', 'p1')).toBe('in-3');
  });

  it('a station-wide entry answers where the channel has none of its own — and only there', () => {
    const mixed: SourceAssignments = {
      assignments: [
        ...STATION_WIDE.assignments,
        { channel: 2, templateId: 'bed', plateId: 'p1', sourceId: 'studio-2' },
      ],
    };
    expect(assignedSourceId(mixed, 1, 'bed', 'p1')).toBe('in-3');
    expect(assignedSourceId(mixed, 2, 'bed', 'p1')).toBe('studio-2');
    // p2 has no CH 2 entry, so the station-wide one answers there too.
    expect(assignedSourceId(mixed, 2, 'bed', 'p2')).toBe('studio-1');
    expect(assignmentsOnChannel(mixed, 2).assignments).toHaveLength(2);
  });
});

describe('migrateAssignmentsToChannels — the one-time copy', () => {
  it('🔴 every station-wide default becomes each declared channel’s own copy — nothing on air changes', () => {
    const { value, copied } = migrateAssignmentsToChannels(STATION_WIDE, [2, 1]);
    expect(copied).toBe(4);
    expect(value.assignments.every((a) => a.channel !== undefined)).toBe(true);
    for (const channel of [1, 2]) {
      // The same source answers on each channel as before the copy.
      expect(assignedSourceId(value, channel, 'bed', 'p1')).toBe('in-3');
      expect(assignedSourceId(value, channel, 'bed', 'p2')).toBe('studio-1');
    }
  });

  it('🔴 a second load copies nothing again', () => {
    const first = migrateAssignmentsToChannels(STATION_WIDE, [1, 2]);
    const second = migrateAssignmentsToChannels(first.value, [1, 2]);
    expect(second.copied).toBe(0);
    expect(second.value).toBe(first.value);
  });

  it('keeps a channel’s own entry over the station-wide one, and copies nothing with no channel', () => {
    const own: SourceAssignments = {
      assignments: [
        ...STATION_WIDE.assignments,
        { channel: 2, templateId: 'bed', plateId: 'p1', sourceId: 'studio-2' },
      ],
    };
    const { value } = migrateAssignmentsToChannels(own, [1, 2]);
    expect(assignedSourceId(value, 2, 'bed', 'p1')).toBe('studio-2');
    expect(assignedSourceId(value, 1, 'bed', 'p1')).toBe('in-3');
    expect(migrateAssignmentsToChannels(STATION_WIDE, []).copied).toBe(0);
  });
});

describe('copyAssignmentsToChannel — a channel added later', () => {
  it('🔴 starts from a copy of the template’s current defaults, from the lowest channel holding them', () => {
    const perChannel: SourceAssignments = {
      assignments: [
        { channel: 2, templateId: 'bed', plateId: 'p1', sourceId: 'studio-2' },
        { channel: 1, templateId: 'bed', plateId: 'p1', sourceId: 'in-3' },
        { channel: 1, templateId: 'bed', plateId: 'p2', sourceId: 'studio-1' },
      ],
    };
    const { value, copied } = copyAssignmentsToChannel(perChannel, [1, 2], 3);
    expect(copied).toBe(2);
    expect(assignedSourceId(value, 3, 'bed', 'p1')).toBe('in-3');
    expect(assignedSourceId(value, 3, 'bed', 'p2')).toBe('studio-1');
    // Control: the donors are untouched.
    expect(assignedSourceId(value, 2, 'bed', 'p1')).toBe('studio-2');
  });

  it('a channel that already holds a plate keeps it (declared, left, declared again)', () => {
    const back: SourceAssignments = {
      assignments: [
        { channel: 1, templateId: 'bed', plateId: 'p1', sourceId: 'in-3' },
        { channel: 3, templateId: 'bed', plateId: 'p1', sourceId: 'kept' },
      ],
    };
    const { value } = copyAssignmentsToChannel(back, [1], 3);
    expect(assignedSourceId(value, 3, 'bed', 'p1')).toBe('kept');
  });
});

describe('withChannelDefaults — the Source defaults dialog’s write', () => {
  it('🔴 writes ON the channel, and no other channel’s entry moves', () => {
    const before = migrateAssignmentsToChannels(STATION_WIDE, [1, 2]).value;
    const after = withChannelDefaults(before, 2, 'bed', new Map([['p1', 'studio-2']]));
    expect(assignedSourceId(after, 2, 'bed', 'p1')).toBe('studio-2');
    expect(assignedSourceId(after, 1, 'bed', 'p1')).toBe('in-3');
    expect(assignedSourceId(after, 2, 'bed', 'p2')).toBe('studio-1');
    expect(checkSourceAssignments(after, { catalog: null })).toEqual({ ok: true });
  });

  it('an empty choice removes this channel’s entry, and a field the writer never heard of survives', () => {
    const fitted: SourceAssignments = {
      assignments: [
        { channel: 2, templateId: 'bed', plateId: 'p1', sourceId: 'in-3', fitMode: 'cover' },
        { channel: 2, templateId: 'bed', plateId: 'p2', sourceId: 'studio-1' },
      ],
    };
    const after = withChannelDefaults(
      fitted,
      2,
      'bed',
      new Map([
        ['p1', 'studio-2'],
        ['p2', ''],
      ]),
    );
    expect(after.assignments.find((a) => a.plateId === 'p1')).toEqual({
      channel: 2,
      templateId: 'bed',
      plateId: 'p1',
      sourceId: 'studio-2',
      fitMode: 'cover',
    });
    expect(assignedSourceId(after, 2, 'bed', 'p2')).toBeNull();
  });
});

describe('the shape rule — one entry per plate PER CHANNEL', () => {
  it('two channels may each hold a plate; one channel may not hold it twice', () => {
    const twoChannels: SourceAssignments = {
      assignments: [
        { channel: 1, templateId: 'bed', plateId: 'p1', sourceId: 'a' },
        { channel: 2, templateId: 'bed', plateId: 'p1', sourceId: 'b' },
      ],
    };
    expect(checkSourceAssignments(twoChannels, { catalog: null })).toEqual({ ok: true });
    const twice: SourceAssignments = {
      assignments: [
        { channel: 2, templateId: 'bed', plateId: 'p1', sourceId: 'a' },
        { channel: 2, templateId: 'bed', plateId: 'p1', sourceId: 'b' },
      ],
    };
    const verdict = checkSourceAssignments(twice, { catalog: null });
    expect(verdict).toMatchObject({ ok: false, reason: 'duplicate-plate' });
  });
});
