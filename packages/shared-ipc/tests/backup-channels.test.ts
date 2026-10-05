import { describe, expect, it } from 'vitest';
import {
  BackupChannelEntriesSetChannel,
  BackupChannelsChangedChannel,
  BackupChannelsStateChannel,
  BackupChannelsStateSchema,
  backupChannelLineText,
  backupMappedSummary,
  backupUnmappedRefusal,
  type BackupChannelsState,
} from '../src/index.js';

/**
 * 🔴 `RELEASE-0113-01` (`B-316`, `R-089`) — the words every surface says about where a channel's lines go on the
 * backup engine: one spelling each, here.
 */

const state = (lines: BackupChannelsState['backup']): BackupChannelsState => ({ backup: lines });

describe('R-089 — the backup channel words', () => {
  it('the channels are named as the bridge routes them', () => {
    expect(BackupChannelsStateChannel.name).toBe('backupChannels.state');
    expect(BackupChannelsChangedChannel.name).toBe('backupChannels.changed');
    expect(BackupChannelEntriesSetChannel.name).toBe('backupChannels.set-entries');
  });

  it('each channel’s line: B’s own channel and host, or nothing sent, in words', () => {
    expect(
      backupChannelLineText({ channel: 1, state: 'mapped', backupChannel: 2 }, '192.168.21.112'),
    ).toBe('Backup: CH 2 on 192.168.21.112');
    expect(backupChannelLineText({ channel: 1, state: 'not-mapped' }, 'h')).toBe(
      'Backup: not mapped — nothing is sent to the backup',
    );
    expect(backupChannelLineText({ channel: 1, state: 'held', backupChannel: 4 }, 'h')).toBe(
      'Backup: held until the next take — nothing is sent to the backup',
    );
  });

  it('the status bar’s count: plain when all are mapped, the warning when some are not, the alarm when none is', () => {
    const line = (channel: number, mapped: boolean) =>
      mapped
        ? { channel, state: 'mapped' as const, backupChannel: channel + 1 }
        : { channel, state: 'not-mapped' as const };
    expect(
      backupMappedSummary(state({ backupHost: 'h', channels: [line(1, true), line(2, true)] })),
    ).toEqual({ text: 'BACKUP B · 2 of 2 channels mapped', tone: 'ok' });
    expect(
      backupMappedSummary(state({ backupHost: 'h', channels: [line(1, true), line(2, false)] })),
    ).toEqual({ text: 'BACKUP B · 1 of 2 channels mapped', tone: 'warn' });
    expect(backupMappedSummary(state({ backupHost: 'h', channels: [line(1, false)] }))).toEqual({
      text: 'BACKUP B · 0 of 1 channels mapped',
      tone: 'alarm',
    });
    // A held channel sends nothing: it is not counted as mapped.
    expect(
      backupMappedSummary(
        state({ backupHost: 'h', channels: [{ channel: 1, state: 'held', backupChannel: 4 }] }),
      )?.tone,
    ).toBe('alarm');
    // No server B, or nothing declared yet: no count at all.
    expect(backupMappedSummary(state(null))).toBe(null);
    expect(backupMappedSummary(state({ backupHost: 'h', channels: [] }))).toBe(null);
  });

  it('the take’s refusal after a failover', () => {
    expect(backupUnmappedRefusal(2)).toBe('No backup channel is known for CH 2.');
  });

  it('the state’s schema refuses a channel number that is not a positive integer', () => {
    expect(
      BackupChannelsStateSchema.safeParse({
        backup: { backupHost: 'h', channels: [{ channel: 1, state: 'mapped', backupChannel: 0 }] },
      }).success,
    ).toBe(false);
  });
});
