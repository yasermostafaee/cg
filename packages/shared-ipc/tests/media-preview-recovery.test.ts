import { describe, expect, it } from 'vitest';
import { SourceMediaOpenChannel } from '../src/channels/sourcePreviews.js';

describe('media preview handoff recovery response', () => {
  it('carries the explicit unavailable target-change hint through IPC validation', () => {
    const response = { state: 'unavailable', recovery: 'target-changed' };
    expect(SourceMediaOpenChannel.response.parse(response)).toEqual(response);
    expect(SourceMediaOpenChannel.response.parse({ state: 'unavailable' })).toEqual({
      state: 'unavailable',
    });
  });

  it.each(['ready', 'preparing', 'error', 'unsupported'])(
    'refuses a recovery hint on %s',
    (state) => {
      expect(
        SourceMediaOpenChannel.response.safeParse({ state, recovery: 'target-changed' }).success,
      ).toBe(false);
    },
  );
});

describe('media preview preparation phase', () => {
  it.each(['waiting-for-capacity', 'encoding'])('carries the %s phase while preparing', (phase) => {
    const response = { state: 'preparing', preparationPhase: phase };
    expect(SourceMediaOpenChannel.response.parse(response)).toEqual(response);
  });

  it('accepts older replies without a preparation phase and refuses phases on other states', () => {
    const response = { state: 'preparing' };
    expect(SourceMediaOpenChannel.response.parse(response)).toEqual(response);
    expect(
      SourceMediaOpenChannel.response.safeParse({ state: 'ready', preparationPhase: 'encoding' })
        .success,
    ).toBe(false);
  });
});
