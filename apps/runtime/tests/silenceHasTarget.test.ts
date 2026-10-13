import { describe, expect, it } from 'vitest';
import { ledgerChannels } from '@cg/shared-ipc';
import { nothingToSilence, silenceHasTarget } from '../src/renderer/features/layers/panicReport.js';

/**
 * 🔴 `FIELD-FIXES-01` K — **A SILENCE CONTROL IS LIVE ONLY WHEN ITS SCOPE HOLDS A LIVE PLATE**, by the
 * bridge's own predicate (`ledgerChannels`, which its PANIC reach `liveLedgerChannels` calls), keyed
 * to the control's channel. Owner's case: two channels, no plate anywhere, and an amber
 * `SILENCE ALL PLATES · EVERY CHANNEL` that answered "nothing to silence".
 */

const onChannel2 = [{ channel: 2 }];

describe('which silence has something to act on', () => {
  it('🔴 with no live plate anywhere, no scope has a target', () => {
    for (const scope of [
      { kind: 'every' as const },
      { kind: 'station' as const },
      { kind: 'channel' as const, channel: 1 },
      { kind: 'channel' as const, channel: 2 },
    ]) {
      expect(silenceHasTarget([], true, scope), JSON.stringify(scope)).toBe(false);
    }
  });

  it('🔴 CONTROL — one live plate on channel 2: every channel and channel 2 are live, channel 1 is not', () => {
    expect(silenceHasTarget(onChannel2, true, { kind: 'every' })).toBe(true);
    expect(silenceHasTarget(onChannel2, true, { kind: 'station' })).toBe(true);
    expect(silenceHasTarget(onChannel2, true, { kind: 'channel', channel: 2 })).toBe(true);
    expect(silenceHasTarget(onChannel2, true, { kind: 'channel', channel: 1 })).toBe(false);
  });

  it('before the ledger has arrived every control stays live — never withheld on a value that may be wrong', () => {
    expect(silenceHasTarget([], false, { kind: 'every' })).toBe(true);
    expect(silenceHasTarget([], false, { kind: 'channel', channel: 1 })).toBe(true);
  });

  it('it asks the bridge’s predicate: the ledger’s channels, deduplicated and sorted', () => {
    expect(ledgerChannels([{ channel: 2 }, { channel: 1 }, { channel: 2 }])).toEqual([1, 2]);
  });

  it('the disabled control says it in the words a press would come back with', () => {
    // The same scope words the bridge’s answer is read out in (`nothingWhere`).
    expect(nothingToSilence({ kind: 'every' })).toBe(
      'Nothing to silence — no channel holds a live plate.',
    );
    expect(nothingToSilence({ kind: 'channel', channel: 1 })).toBe(
      'Nothing to silence — channel 1 holds no live plates.',
    );
  });
});
