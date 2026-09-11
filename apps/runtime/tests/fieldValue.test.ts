import { describe, expect, it } from 'vitest';
import {
  digitsOnly,
  hostError,
  hostValue,
  indexError,
  portError,
} from '../src/renderer/ui/fieldValue.js';

/**
 * 🔴 `SETTINGS-MATCH-02` §10.7 — **THE INPUT GUARDS, PROVED.**
 *
 * Owner: a numeric field and an address field must not accept letters and the like. The two
 * traps this file exists to keep shut are named in §10.2 and §10.1, and both are real in this
 * product rather than hypothetical:
 *
 *   1. **A naive `[0-9]` filter makes these fields untypeable for a Persian operator.** The
 *      digit keys on that layout emit `۰۱۲۳۴۵۶۷۸۹`, not ASCII. Every numeric case below is
 *      driven in all three digit families for exactly that reason.
 *   2. **A host is not a number.** The contract is `z.string().min(1)` and `isLoopbackHost`
 *      accepts `localhost` and `::1`, so a digits-and-dots rule would refuse two values the
 *      product already treats as correct.
 *
 * ⚠ **PASTE IS THE PATH THAT BREAKS**, so every case here is a WHOLE-VALUE transformation —
 * which is what an `onChange` receives from a paste as well as from a keystroke. A test that
 * only ever appended one character would prove almost nothing.
 */

const PERSIAN = '۵۲۵۰';
const ARABIC = '٥٢٥٠';

describe('§10.2 — normalise first: a Persian or Arabic-Indic digit IS a digit', () => {
  it('a numeric field turns Persian digits into the value the bridge will receive', () => {
    expect(digitsOnly(PERSIAN)).toBe('5250');
    expect(digitsOnly(ARABIC)).toBe('5250');
  });

  it('…and an ADDRESS field does too — `۱۹۲.۱۶۸.۲۱.۱۱۴` is a typed IP, not a broken one', () => {
    expect(hostValue('۱۹۲.۱۶۸.۲۱.۱۱۴')).toBe('192.168.21.114');
    expect(hostValue('٠١٠.٠.٠.١')).toBe('010.0.0.1');
  });

  it('🔴 THE TRAP: a Persian-typed port must not be left untypeable OR sent raw', () => {
    // Untypeable would be `''`; sent raw would be `۵۲۵۰`. Neither.
    const out = digitsOnly(PERSIAN);
    expect(out).not.toBe('');
    expect(out).not.toBe(PERSIAN);
    expect(portError(out, { min: 1, label: 'AMCP port' })).toBeNull();
  });
});

describe('§10.3 — a numeric field keeps digits and drops the rest', () => {
  it('drops letters, spaces and punctuation, wherever they sit', () => {
    expect(digitsOnly('52a50')).toBe('5250');
    expect(digitsOnly('abc')).toBe('');
    expect(digitsOnly(' 5250 ')).toBe('5250');
    expect(digitsOnly('5,250')).toBe('5250');
    expect(digitsOnly('-1')).toBe('1');
  });

  it('🔴 a PASTE of mixed text — the path a keystroke filter would never see', () => {
    expect(digitsOnly('port 5250 (AMCP)')).toBe('5250');
    expect(digitsOnly('AMCP ۵۲۵۰ / OSC ۶۲۵۰')).toBe('52506250');
    // …and pasting something with no digit at all leaves the field empty rather than holding
    // text a number field cannot mean.
    expect(digitsOnly('not a port')).toBe('');
  });

  it('an empty value stays empty — blank is a state, not a character to invent', () => {
    expect(digitsOnly('')).toBe('');
  });
});

describe('§10.3 — out of range is a REFUSAL, never a silent clamp', () => {
  it('names the range rather than rewriting the number', () => {
    const e = portError('70000', { min: 1, label: 'AMCP port' });
    expect(e).not.toBeNull();
    expect(e).toContain('65535');
    // 🔴 The point: the sentence exists BECAUSE the value is not quietly changed. A clamp
    // would have made this null and left `65535` in a field the operator never typed.
    expect(e).toContain('out of range');
  });

  it('accepts the ends of the range, and refuses one past each', () => {
    expect(portError('1', { min: 1, label: 'AMCP port' })).toBeNull();
    expect(portError('65535', { min: 1, label: 'AMCP port' })).toBeNull();
    expect(portError('0', { min: 1, label: 'AMCP port' })).not.toBeNull();
    expect(portError('65536', { min: 1, label: 'AMCP port' })).not.toBeNull();
  });

  it('OSC accepts 0 — the explicit spelling of "bind an ephemeral port"', () => {
    expect(portError('0', { min: 0, label: 'OSC port' })).toBeNull();
  });

  it('BLANK is legal where the contract says so, and required where it does not', () => {
    // `templateServePort` is `.optional()`: blank means "assign one automatically".
    expect(portError('', { min: 0, label: 'Template port', blankAllowed: true })).toBeNull();
    // `amcpPort` is not optional.
    expect(portError('', { min: 1, label: 'AMCP port' })).not.toBeNull();
  });

  it('a positive-integer field says its floor rather than clamping to it', () => {
    expect(indexError('0', { label: 'Device index' })).toContain('1 or more');
    expect(indexError('1', { label: 'Device index' })).toBeNull();
    expect(indexError('', { label: 'Route layer', min: 0, blankAllowed: true })).toBeNull();
    expect(indexError('nope', { label: 'Device index' })).toContain('whole number');
  });
});

describe('§10.4 — an address field is NOT numeric, and letters are legal in it', () => {
  it('🔴 the values the product itself treats as correct all survive', () => {
    // `isLoopbackHost` accepts every one of these. A digits-and-dots rule would refuse three.
    for (const host of ['127.0.0.1', 'localhost', '::1', '[::1]']) {
      expect(hostValue(host), host).toBe(host);
      expect(hostError(host, { label: 'Host' }), host).toBeNull();
    }
    // …and a real hostname, which is the case §10.1 exists to protect.
    expect(hostValue('caspar-a.studio.local')).toBe('caspar-a.studio.local');
    expect(hostError('caspar-a.studio.local', { label: 'Host' })).toBeNull();
  });

  it('removes the whitespace a paste carries, and NOTHING else', () => {
    expect(hostValue('192.168.21.114 ')).toBe('192.168.21.114');
    expect(hostValue('a b')).toBe('ab');
  });

  it('🔴 a pasted URL stays VISIBLE and is refused — it is not mangled into a pseudo-host', () => {
    /*
      The first spelling of `hostValue` stripped "characters no host can contain" and turned
      this into `http:192.168.21.114x` — not what was pasted, not a host, and no longer legible
      enough to see what went wrong. The colon has to survive anyway (`::1` is a host this
      product accepts), so the removal could never have been complete. The value stays; the
      SENTENCE does the work.
    */
    expect(hostValue('http://192.168.21.114/x')).toBe('http://192.168.21.114/x');
    expect(hostError('http://192.168.21.114/x', { label: 'Host address' })).toContain('not a URL');
  });

  it('says so when what is there cannot be a host', () => {
    expect(hostError('', { label: 'Host address' })).toContain('required');
    expect(hostError('a b', { label: 'Host address' })).toContain('space');
    expect(hostError('a/b', { label: 'Host address' })).toContain('not a URL');
    // …and blank is legal on the one host that derives when empty.
    expect(hostError('', { label: 'Template host', blankAllowed: true })).toBeNull();
  });

  it('POSITIVE CONTROL: it does not judge whether the host RESOLVES', () => {
    /*
      The renderer may not answer that and must not pretend to — `B-162` is what a host that
      is merely WRONG costs, and the bridge is the only thing that can tell. So a
      syntactically fine host that certainly does not exist passes here, deliberately.
    */
    expect(hostError('no-such-server.invalid', { label: 'Host' })).toBeNull();
  });
});
