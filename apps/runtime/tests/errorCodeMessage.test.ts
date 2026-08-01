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

/**
 * §8 — AN ERROR NAME IS A CLAIM ABOUT WHAT FAILED.
 *
 * Where the cause is genuinely unknown, the wording must say unknown: naming the
 * wrong mechanism is worse than naming none, because a wrong name gets acted on —
 * and "AMCP" acted on means an engineer walking to the playout machine.
 */
describe('errorCodeMessage — §8, the codes that used to name the wrong machine', () => {
  it('template-serve-down points at the BRIDGE, and says so in as many words', () => {
    const msg = errorCodeMessage('template-serve-down') ?? '';
    expect(msg).toContain('bridge');
    // The whole point: it must not be mistaken for a playout-server fault.
    expect(msg).toContain('not the playout server');
    expect(msg).not.toBe('Not accepted (template-serve-down).');
  });

  it('amcp-error says the cause is UNKNOWN rather than implying CasparCG refused', () => {
    const msg = errorCodeMessage('amcp-error') ?? '';
    expect(msg).toMatch(/not known/i);
    // It may not assert either mechanism…
    expect(msg).toContain('never arrived');
    expect(msg).toContain('refused');
    // …and it must still tell the operator what to do about it.
    expect(msg).toContain('output');
  });

  it('the codes that DO know still name their mechanism exactly', () => {
    // Unchanged, and asserted here so the honesty fix above cannot be "tidied"
    // into making every failure vague.
    expect(errorCodeMessage('amcp-send-failed')).toContain('never reached CasparCG');
    expect(errorCodeMessage('amcp-404')).toContain('CasparCG refused the command');
  });
});
