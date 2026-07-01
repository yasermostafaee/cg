import * as net from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import {
  ESCAPE_CANDIDATES,
  HARD_PAYLOAD,
  evaluateReceived,
  expectedJson,
} from '../src/escape-candidates.js';

/**
 * Smoke-tests the escape-matrix HARNESS LOGIC (the encoders + the per-character
 * PASS/FAIL evaluator). It does NOT — and cannot — determine the real CasparCG
 * un-escape rule: that needs real CasparCG 2.3.2 + a browser running the probe
 * (the beacon path). The amcp-mock check below confirms the harness emits
 * mock-acceptable AMCP, and demonstrates exactly why the mock can't pick the winner.
 */

function byId(id: string) {
  const c = ESCAPE_CANDIDATES.find((x) => x.id === id);
  if (c === undefined) throw new Error(`no candidate ${id}`);
  return c;
}

describe('escape candidates — sane set', () => {
  it('is non-empty, has unique ids, and every arg is quote-wrapped', () => {
    expect(ESCAPE_CANDIDATES.length).toBeGreaterThanOrEqual(5);
    const ids = ESCAPE_CANDIDATES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of ESCAPE_CANDIDATES) {
      const arg = c.encodeArg(expectedJson());
      expect(arg.startsWith('"')).toBe(true);
      expect(arg.endsWith('"')).toBe(true);
    }
  });
});

describe('encoders — exact wire bytes (the candidate behaviours)', () => {
  it('raw-json wraps with NO escaping (control — inner quotes survive)', () => {
    expect(byId('raw-json').encodeArg('a"b')).toBe('"a"b"');
  });

  it('quotes-only escapes " → \\" and leaves backslashes ALONE', () => {
    expect(byId('quotes-only').encodeArg('a"b')).toBe('"a\\"b"');
    expect(byId('quotes-only').encodeArg('a\\b')).toBe('"a\\b"'); // backslash NOT doubled
  });

  it('backslash-quote escapes \\ → \\\\ and " → \\"', () => {
    expect(byId('backslash-quote').encodeArg('a\\b')).toBe('"a\\\\b"'); // backslash DOUBLED
    expect(byId('backslash-quote').encodeArg('a"b')).toBe('"a\\"b"');
  });

  it('structural-quotes-only escapes a BARE quote but copies an existing \\" pair', () => {
    // `a\"b` is a JSON value-quote (\" pair) — left intact; the wrap adds nothing to it.
    expect(byId('structural-quotes-only').encodeArg('a\\"b')).toBe('"a\\"b"');
    // a bare structural quote IS escaped.
    expect(byId('structural-quotes-only').encodeArg('a"b')).toBe('"a\\"b"');
  });

  it('uXXXX-controls candidates carry a JSON \\n as \\u000a (no bare backslash-n)', () => {
    // input `a\nb` = the JSON two-char newline escape (backslash, n).
    expect(byId('quotes-only+uXXXX-controls').encodeArg('a\\nb')).toBe('"a\\u000ab"');
    // a literal escaped-backslash is preserved (parity-correct): `a\\b` stays `a\\b`.
    expect(byId('quotes-only+uXXXX-controls').encodeArg('a\\\\b')).toBe('"a\\\\b"');
  });
});

describe('evaluator — per-character PASS/FAIL classification', () => {
  it('a byte-exact received string passes every class', () => {
    const e = evaluateReceived('x', expectedJson());
    expect(e.fired).toBe(true);
    expect(e.parseOk).toBe(true);
    expect(e.byteExact).toBe(true);
    expect(e.allPass).toBe(true);
    expect(e.classes.every((c) => c.pass)).toBe(true);
  });

  it('a payload with a RAW newline inside the string fails to parse (the on-air bug)', () => {
    // CasparCG turning \n into a raw 0x0A produces exactly this — invalid JSON.
    const broken = `{"newline":"New text\nsecond text"}`;
    const e = evaluateReceived('x', broken);
    expect(e.fired).toBe(true);
    expect(e.parseOk).toBe(false);
    expect(e.allPass).toBe(false);
  });

  it('one wrong field fails only its class, not the others', () => {
    const mutated = { ...HARD_PAYLOAD, bs1: 'WRONG' };
    const e = evaluateReceived('x', JSON.stringify(mutated));
    expect(e.parseOk).toBe(true);
    expect(e.allPass).toBe(false);
    expect(e.classes.find((c) => c.cls === 'bs1')?.pass).toBe(false);
    expect(e.classes.find((c) => c.cls === 'quote')?.pass).toBe(true);
  });

  it('no update (null received) → not fired, fails all', () => {
    const e = evaluateReceived('x', null);
    expect(e.fired).toBe(false);
    expect(e.allPass).toBe(false);
    expect(e.classes.every((c) => !c.pass)).toBe(true);
  });
});

/**
 * Against amcp-mock: the harness emits well-formed AMCP the mock accepts (202), and
 * the mock records a decoded payload. But the mock decodes by its OWN rule — so it
 * canNOT confirm the real CasparCG rule (only hardware can). This asserts the
 * plumbing, not the rule.
 */
describe('amcp-mock smoke (plumbing only — NOT ground truth)', () => {
  let mock: MockHandle | null = null;
  afterEach(async () => {
    await mock?.stop();
    mock = null;
  });

  function sendLine(port: number, line: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const sock = net.createConnection({ port, host: '127.0.0.1' });
      let buf = '';
      sock.setEncoding('utf-8');
      sock.on('data', (c) => (buf += c));
      sock.on('connect', () => {
        sock.write(`${line}\r\n`);
        setTimeout(() => sock.end(), 100);
      });
      sock.on('end', () => resolve(buf));
      sock.on('error', reject);
    });
  }

  it('accepts a candidate CG UPDATE (202) and records SOME decoded payload', async () => {
    mock = await createMock({ amcpPort: 0, oscPort: 0, disableOsc: true });
    const dataArg = byId('backslash-quote').encodeArg(expectedJson());
    const reply = await sendLine(mock.amcpPort, `CG 1-10 UPDATE 0 ${dataArg}`);
    expect(reply).toContain('202 CG');
    // The mock decoded the arg by ITS rule; it's defined, but is NOT proof of the
    // real CasparCG round-trip — that's what the hardware sweep is for.
    expect(mock.lastCgUpdate({ channel: 1, layer: 10 })?.data).toBeDefined();
  });
});
