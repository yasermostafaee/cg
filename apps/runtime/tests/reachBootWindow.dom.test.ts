// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { layerRowActions } from '../src/renderer/features/layers/layerRowActions.js';
import {
  CASPAR_CONNECTING_REASON,
  CASPAR_UNREACHABLE_REASON,
  casparRefusalReason,
} from '../src/renderer/ui/reachWording.js';
import { itemWith, renderLayerRow } from './support/layerRow.js';

/**
 * §2 — THE BOOT WINDOW TELLS THE WRONG REASON.
 *
 * `useConnections()` answers `null` until the bridge has replied once, so for the
 * first moment of every page load — and again after every reconnect — the gated
 * verbs are disabled. THE DISABLING IS RIGHT: unknown fails closed, because a verb
 * enabled on no evidence reports an error at the moment air needs it.
 *
 * THE REASON WAS NOT. The tooltip said *"CasparCG cannot be reached"*, which is a
 * claim about the playout machine that nothing had yet said anything about — and
 * an operator who reads that on a healthy plant, twice a day, learns to disbelieve
 * the message on the day it is true.
 *
 * These assertions are on the WORDING and on the REFUSAL together, deliberately:
 * either one alone permits the wrong fix. Softening the refusal would enable a
 * command on no evidence; keeping the old sentence would go on naming a fault that
 * may not exist.
 */

afterEach(() => {
  vi.restoreAllMocks();
});

const baseDeps = (): Parameters<typeof layerRowActions>[0] => ({
  item: itemWith('on-air'),
  observed: { kind: 'producer', producer: 'html' },
  hasNext: true,
  linkDown: false,
  casparReach: 'connecting',
  dirty: true,
  rehearsing: false,
  templateAvailable: true,
  toggleRehearse: () => Promise.resolve({ accepted: true }),
  load: () => Promise.resolve({ accepted: true }),
  reload: () => Promise.resolve({ accepted: true }),
  loadFromLibrary: () => Promise.resolve({ accepted: true }),
  play: () => Promise.resolve({ accepted: true }),
  next: () => Promise.resolve({ accepted: true }),
  update: () => Promise.resolve({ accepted: true }),
  stop: () => Promise.resolve({ accepted: true }),
  clear: () => Promise.resolve({ accepted: true }),
  clearLayer: () => Promise.resolve({ accepted: true }),
  remove: () => Promise.resolve({ accepted: true }),
  onError: () => undefined,
});

describe('§2 — while the bridge has not answered, the verbs say CONNECTING, not UNREACHABLE', () => {
  it('every CasparCG-bound verb is still refused — unknown fails closed', () => {
    const actions = layerRowActions(baseDeps());
    for (const key of ['play', 'next', 'stop', 'update', 'clear']) {
      expect(
        actions.find((a) => a.key === key)?.disabled,
        `${key} must stay disabled while nothing is known`,
      ).toBe(true);
    }
  });

  it('…and each names the WAIT, never a playout server nothing has reported down', () => {
    const actions = layerRowActions(baseDeps());
    for (const key of ['play', 'next', 'stop', 'update', 'clear']) {
      const title = actions.find((a) => a.key === key)?.title ?? '';
      expect(title, `${key} must say it is connecting`).toMatch(/connecting/i);
      expect(title, `${key} must not claim CasparCG is down`).not.toMatch(
        /cannot be reached|unreachable/i,
      );
    }
  });

  it('once the bridge answers "down", the SAME verbs switch to the real reason', () => {
    const actions = layerRowActions({ ...baseDeps(), casparReach: 'unreachable' });
    const play = actions.find((a) => a.key === 'play');
    expect(play?.disabled).toBe(true);
    expect(play?.title).toBe(CASPAR_UNREACHABLE_REASON);
  });

  it('the NEARER hop still wins: a dead bridge is never worded as "connecting"', () => {
    // There is no round trip in flight with the link down, so "connecting…" would
    // be a promise nobody is keeping.
    expect(casparRefusalReason(true, 'connecting')).toMatch(/Bridge disconnected/);
    expect(casparRefusalReason(true, 'unreachable')).toMatch(/Bridge disconnected/);
    expect(casparRefusalReason(false, 'connecting')).toBe(CASPAR_CONNECTING_REASON);
    // …and a reachable hop is refused for no reachability reason at all.
    expect(casparRefusalReason(false, 'reachable')).toBeUndefined();
  });
});

describe('§2 — the boot window, rendered', () => {
  /**
   * THE STATE THE HOOK IS ACTUALLY IN, not a hand-set flag: `unknown` is the
   * fixture's name for `connections.health()` answering `null`, on a LIVE link —
   * which is exactly a page that has loaded before the bridge has replied.
   */
  it('a real row on a live link with no health yet says CONNECTING on PLAY', async () => {
    const row = await renderLayerRow({ item: itemWith('loaded'), link: 'live', reach: 'unknown' });
    const play = row.container.querySelector<HTMLButtonElement>('button[aria-label="PLAY"]');
    expect(play).not.toBeNull();
    expect(play?.disabled).toBe(true);
    expect(play?.title ?? '').toMatch(/connecting/i);
    expect(play?.title ?? '').not.toMatch(/cannot be reached/i);
    await row.unmount();
  });

  it('…and a row whose bridge HAS answered "down" says so instead', async () => {
    const row = await renderLayerRow({
      item: itemWith('loaded'),
      link: 'live',
      reach: 'caspar-down',
    });
    const play = row.container.querySelector<HTMLButtonElement>('button[aria-label="PLAY"]');
    expect(play?.disabled).toBe(true);
    expect(play?.title).toBe(CASPAR_UNREACHABLE_REASON);
    await row.unmount();
  });
});
