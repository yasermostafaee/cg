import { describe, expect, it } from 'vitest';
import { CommandBuilder, type CommandSlot } from '../src/command-builder.js';

const slot: CommandSlot = { channel: 1, layer: 10 };
const builder = new CommandBuilder();

describe('CommandBuilder (ADR 0006 seam — amcp-mock-validated)', () => {
  it('load → CG ADD with quoted template + JSON data', () => {
    expect(builder.load(slot, 'lower-third', {})).toBe('CG 1-10 ADD 0 "lower-third" 1 "{}"');
  });

  it('take → CG PLAY', () => {
    expect(builder.take(slot)).toBe('CG 1-10 PLAY 0');
  });

  it('update → CG UPDATE with escaped JSON data', () => {
    // JSON quotes are AMCP-escaped via quote(): {"title":"Hi"} → "{\"title\":\"Hi\"}"
    expect(builder.update(slot, { title: 'Hi' })).toBe('CG 1-10 UPDATE 0 "{\\"title\\":\\"Hi\\"}"');
  });

  it('out → CLEAR', () => {
    expect(builder.out(slot)).toBe('CLEAR 1-10');
  });

  it('escapes embedded quotes/backslashes so the wire never desyncs', () => {
    const line = builder.update(slot, { text: 'a"b\\c' });
    expect(line.startsWith('CG 1-10 UPDATE 0 "')).toBe(true);
    // No bare (unescaped) double-quote inside the payload body.
    const body = line.slice('CG 1-10 UPDATE 0 "'.length, -1);
    expect(/(?<!\\)"/.test(body)).toBe(false);
  });
});
