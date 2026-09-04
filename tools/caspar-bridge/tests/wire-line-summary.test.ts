import { describe, expect, it } from 'vitest';
import { WIRE_LINE_SUMMARY_MAX, summarizeWireLine } from '../src/command-builder.js';

/**
 * `B-209` — the AMCP line an audit entry keeps beside a refusal code.
 *
 * The shape is the assertion: the verb, the target and the FIRST quoted argument
 * survive (for `CG ADD` that is the template URL — host and port, which is what a
 * reader of a refused take on an ephemeral-port bridge needs), every later quoted
 * argument is elided, and the result never exceeds the schema's cap.
 */
describe('summarizeWireLine', () => {
  it('keeps the verb, the target and the first quoted argument; elides the payload after it', () => {
    const line =
      'CG 1-99 ADD 0 "http://192.168.21.93:64373/template/f00a5363?cw=1920&ch=1080" 0 "{\\"title\\":\\"سلام\\"}"';
    expect(summarizeWireLine(line)).toBe(
      'CG 1-99 ADD 0 "http://192.168.21.93:64373/template/f00a5363?cw=1920&ch=1080" 0 "…"',
    );
  });

  it('leaves a line with no quoted argument exactly as sent', () => {
    expect(summarizeWireLine('CG 1-99 PLAY 0')).toBe('CG 1-99 PLAY 0');
    expect(summarizeWireLine('MIXER 1-30 FILL 0 0 1 1')).toBe('MIXER 1-30 FILL 0 0 1 1');
    expect(summarizeWireLine('PLAY 1-10 DECKLINK 1')).toBe('PLAY 1-10 DECKLINK 1');
  });

  it('keeps a single-argument payload (CG UPDATE) up to the cap — there the payload IS the command', () => {
    const short = 'CG 1-99 UPDATE 0 "{\\"title\\":\\"a\\"}"';
    expect(summarizeWireLine(short)).toBe(short);
    const long = `CG 1-99 UPDATE 0 "${'x'.repeat(400)}"`;
    const summary = summarizeWireLine(long);
    expect(summary.length).toBe(WIRE_LINE_SUMMARY_MAX);
    expect(summary.endsWith('…')).toBe(true);
    expect(summary.startsWith('CG 1-99 UPDATE 0 "xxx')).toBe(true);
  });

  it('honours an escaped quote inside the first argument when finding its end', () => {
    const line = 'CG 1-5 ADD 0 "a\\"b" 0 "payload"';
    expect(summarizeWireLine(line)).toBe('CG 1-5 ADD 0 "a\\"b" 0 "…"');
  });

  it('never throws on an unterminated quote — it caps and returns', () => {
    const line = `CG 1-5 ADD 0 "${'y'.repeat(300)}`;
    const summary = summarizeWireLine(line);
    expect(summary.length).toBe(WIRE_LINE_SUMMARY_MAX);
  });

  it('stays inside the audit schema cap for every input', () => {
    for (const n of [0, 1, 199, 200, 201, 1000]) {
      expect(summarizeWireLine('X'.repeat(n)).length).toBeLessThanOrEqual(WIRE_LINE_SUMMARY_MAX);
    }
  });
});
