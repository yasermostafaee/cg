import { describe, expect, it } from 'vitest';
import {
  channelSignals,
  inScope,
  signalLabel,
} from '../src/renderer/features/channels/channelSignals.js';

/**
 * `MULTI-CHANNEL-01` §2 L — the strip's marks and the views' filter, as pure functions. The
 * whole-App proof (a notice absent from the other channel's view, the mark on its tab) is in
 * `channelSwitch.dom.test.ts`.
 */

describe('channelSignals', () => {
  it('an alarm beats a warning on the same channel — one mark per tab', () => {
    const marks = channelSignals({ alarms: [2], warnings: [2, 3] });
    expect(marks.get(2)).toBe('alarm');
    expect(marks.get(3)).toBe('warning');
    // CONTROL — a channel with nothing carries nothing.
    expect(marks.has(1)).toBe(false);
  });

  it('the mark is spoken, never colour alone', () => {
    expect(signalLabel('alarm')).toBe('This channel has an alarm');
    expect(signalLabel('warning')).toBe('This channel has a warning');
  });
});

describe('inScope', () => {
  const entries = [{ channel: 1 }, { channel: 2 }, { channel: undefined }];

  it('keeps the channel on screen’s entries, and an entry with no channel in every view', () => {
    expect(inScope(entries, (e) => e.channel, 2)).toEqual([{ channel: 2 }, { channel: undefined }]);
  });

  it('CONTROL — with no scope (one declared channel) nothing is filtered', () => {
    expect(inScope(entries, (e) => e.channel, null)).toBe(entries);
  });
});
