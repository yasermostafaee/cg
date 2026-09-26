import { describe, expect, it, vi } from 'vitest';
import {
  takeRefusalChannels,
  takeRefusalLine,
} from '../src/renderer/features/layers/takeRefusalLine.js';
import {
  AsyncButtonController,
  asyncResultMessage,
  type AsyncView,
} from '../src/renderer/ui/asyncButtonController.js';

/**
 * 🔴 `FIELD-FIXES-01` B — **A REFUSED TAKE IS SAID ON ITS ROW, IN ONE LINE, NAMING THE ROW AND THE
 * SOURCE — and nowhere else in that channel's view.** The refusals below are shaped exactly as the
 * bridge records them (`take-all-or-nothing.integration.test.ts` pins code, command, plate and
 * source for the owner's case).
 */

const OWNERS_CASE = {
  code: 'amcp-403',
  command: 'PLAY 2-60 DECKLINK DEVICE 1',
  plateId: 'plate-1',
  sourceId: 'src-studio1',
  sourceName: 'studio1',
};

describe('the line', () => {
  it('🔴 the owner’s case, word for word', () => {
    expect(takeRefusalLine('Bed 59', OWNERS_CASE).text).toBe(
      'Bed 59 · studio1 (DeckLink 1): the server has no such input, or it is in use.',
    );
  });

  it('a refusal of the graphic’s own command names no source', () => {
    const line = takeRefusalLine('Bed 59', {
      code: 'amcp-404',
      command: 'CG 2-59 ADD 0 "http://192.168.21.93:7911/template/2ghab" 0 "…"',
    });
    expect(line.source).toBeNull();
    expect(line.text).toBe('Bed 59: the server could not load the graphic.');
  });

  it('a file source names no input — the clause already names the file', () => {
    expect(
      takeRefusalLine('Bed 59', {
        code: 'amcp-404',
        command: 'PLAY 2-60 "studio-loop.mp4"',
        plateId: 'plate-1',
        sourceName: 'loop',
      }).text,
    ).toBe('Bed 59 · loop: the server cannot find the file studio-loop.mp4.');
  });

  it('a refusal that is not a server reply keeps its own sentence, as a clause', () => {
    expect(takeRefusalLine('Bed 59', { code: 'amcp-timeout' }).text).toMatch(
      /^Bed 59: CasparCG did not answer the command in time/,
    );
    expect(takeRefusalLine('Bed 59', { code: 'amcp-send-failed' }).text).toMatch(
      /^Bed 59: the command never reached CasparCG/,
    );
  });

  it('🔴 never says "AMCP" or the number', () => {
    expect(takeRefusalLine('Bed 59', OWNERS_CASE).text).not.toMatch(/AMCP|403/);
  });
});

describe('where it is said', () => {
  it('🔴 a refusal the ROW carries raises nothing else — the async result has no message', () => {
    expect(
      asyncResultMessage({ accepted: false, errorCode: 'amcp-403', refusalOnRow: true }),
    ).toBeNull();
    // CONTROL — the same refusal NOT carried on the row is worded for the banner.
    expect(asyncResultMessage({ accepted: false, errorCode: 'amcp-403' })).toBe(
      'The server refused a setting in this command.',
    );
  });

  it('🔴 the button settles to idle: no banner (onError), no inline error, no success flash', async () => {
    const onError = vi.fn();
    const views: AsyncView[] = [];
    const ctrl = new AsyncButtonController({
      onChange: (v) => views.push(v),
      schedule: () => () => undefined,
      onError,
    });
    ctrl.press(() =>
      Promise.resolve({ accepted: false, errorCode: 'amcp-403', refusalOnRow: true }),
    );
    await vi.waitFor(() => expect(views.at(-1)?.phase).toBe('idle'));
    expect(onError).not.toHaveBeenCalled();
    expect(views.some((v) => v.phase === 'success' || v.phase === 'error')).toBe(false);

    // CONTROL — without the flag the same refusal goes to the banner.
    ctrl.press(() => Promise.resolve({ accepted: false, errorCode: 'amcp-403' }));
    await vi.waitFor(() => expect(onError).toHaveBeenCalledOnce());
    ctrl.dispose();
  });

  it('the strip marks the channel whose row carries a refusal — by its slot, else its bank row', () => {
    const items = [
      { itemId: 'a', slot: { channel: 2 }, takeRefusal: OWNERS_CASE },
      { itemId: 'b', takeRefusal: OWNERS_CASE }, // the mock: no slot; the bank row says channel 1
      { itemId: 'c', slot: { channel: 3 } }, // no refusal: no mark
    ];
    const slots = [{ channel: 1, binding: { itemId: 'b' } }];
    expect(takeRefusalChannels(items, slots)).toEqual([2, 1]);
  });
});
