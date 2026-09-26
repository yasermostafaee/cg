import { describe, expect, it } from 'vitest';
import { TAKE_ON_AIR_CODE } from '@cg/shared-ipc';
import { isOnAirStatus, type StackItemState } from '@cg/shared-schema';
import { layerRowActions } from '../src/renderer/features/layers/layerRowActions.js';
import { asyncResultMessage } from '../src/renderer/ui/asyncButtonController.js';
import { errorCodeMessage } from '../src/renderer/ui/errorCodeMessage.js';
import { bindingFor, itemWith, rowDeps } from './support/layerRow.js';

/**
 * 🔴 `FIELD-FIXES-01-A` DECISION 2 — **PLAY IS UNAVAILABLE WHILE THE ROW IS ON AIR OR UNSETTLED, by
 * the same predicate the bridge refuses a take with, and the refusal names the row.**
 *
 * The bridge's `#ownsLiveSeats` calls `ownsLiveSeats`: `isOnAirStatus` (on air, or a take/update/stop
 * still in flight, or an overdue take reading `unconfirmed`) OR the ledger holds the row's seats.
 * PLAY read `on-air`/`playing` alone, so a slow reply that left the row `unconfirmed` handed PLAY
 * back on a graphic that was up. The bridge is the one authority; this gate is its courtesy, and
 * it must ask the same question.
 */

const playOf = (item: StackItemState, over = {}) => {
  const action = layerRowActions(rowDeps({ binding: bindingFor(item), ...over })).find(
    (a) => a.key === 'play',
  );
  if (action === undefined) throw new Error('no PLAY');
  return action;
};

describe('Decision 2 — PLAY asks the bridge’s own question', () => {
  it.each([
    ['unconfirmed', itemWith('unconfirmed')],
    ['a take still in flight', itemWith('playing', { pending: true })],
    ['updating', itemWith('updating')],
    ['exiting', itemWith('exiting')],
    ['on air', itemWith('on-air')],
  ] as const)('🔴 PLAY is disabled, naming the row, while the row is %s', (_, item) => {
    expect(isOnAirStatus(item)).toBe(true);
    const play = playOf(item);
    expect(play.disabled).toBe(true);
    expect(play.title).toBe('Row 1 is already on air — take it out first.');
  });

  it.each([
    ['loaded', itemWith('loaded')],
    ['in error after a refused take', itemWith('error', { errorCode: 'amcp-403' })],
    ['idle', itemWith('idle')],
  ] as const)('CONTROL — PLAY is available while the row is %s', (_, item) => {
    expect(isOnAirStatus(item)).toBe(false);
    expect(playOf(item).disabled).toBe(false);
  });

  it('🔴 a row whose plates the ledger holds is refused too, though its status reads loaded (B-145)', () => {
    // The bridge adopted the seats at boot and the row's status did not come back: the plates are
    // on the channel, and a re-take would re-PLAY them.
    const play = playOf(itemWith('loaded'), { holdsLiveSeats: true });
    expect(play.disabled).toBe(true);
    expect(play.title).toBe('Row 1 is already on air — take it out first.');
    // CONTROL — the same row with no seat is offered PLAY, so the seat is what refused it.
    expect(playOf(itemWith('loaded'), { holdsLiveSeats: false }).disabled).toBe(false);
  });

  it('🔴 a refusal the bridge answered (a race, another console) is said in the row’s own name', async () => {
    const play = playOf(itemWith('loaded'), {
      play: () => Promise.resolve({ accepted: false, errorCode: TAKE_ON_AIR_CODE }),
    });
    const res = await play.run();
    expect(asyncResultMessage(res)).toBe('Row 1 is already on air — take it out first.');
  });

  it('CONTROL — any other refusal keeps its own words', async () => {
    const play = playOf(itemWith('loaded'), {
      play: () => Promise.resolve({ accepted: false, errorCode: 'disconnected' }),
    });
    const res = await play.run();
    expect(asyncResultMessage(res)).toBe(errorCodeMessage('disconnected'));
  });
});
