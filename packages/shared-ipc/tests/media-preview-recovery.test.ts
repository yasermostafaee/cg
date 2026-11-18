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
