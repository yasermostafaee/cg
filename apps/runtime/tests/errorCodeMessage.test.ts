import { describe, expect, it } from 'vitest';
import { errorCodeMessage } from '../src/renderer/ui/errorCodeMessage.js';

/**
 * C-014 — the two ways a load runs out of layers are told apart because the
 * remedies differ: a genuinely full range frees up by removing an item; a
 * foreign-occupied range cannot be freed from this console at all (R-015).
 */
describe('errorCodeMessage — C-014 load refusals', () => {
  it('no-layer says the range is full and names the remedy', () => {
    const msg = errorCodeMessage('no-layer');
    expect(msg).toContain('No free layer');
    expect(msg).toContain('Remove');
  });

  it('no-layer-foreign-occupied says WHO holds the range and that it cannot be cleared here', () => {
    const msg = errorCodeMessage('no-layer-foreign-occupied');
    expect(msg).toContain('another system');
    expect(msg).toContain('cannot be cleared from here');
  });

  it('unknown codes still surface verbatim (B-070 contract unchanged)', () => {
    expect(errorCodeMessage('mystery-code')).toBe('Not accepted (mystery-code).');
  });
});
