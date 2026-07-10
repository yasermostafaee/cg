import * as net from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import { quote } from '@cg/caspar-client';
import {
  ESCAPE_CANDIDATES,
  HARD_PAYLOAD,
  evaluateReceived,
  expectedJson,
} from '../src/escape-candidates.js';

/**
 * Smoke-tests the escape-matrix HARNESS LOGIC (the encoders + the per-character
 * PASS/FAIL evaluator). It does NOT — and cannot — determine the real CasparCG
 * un-escape rule: that needs real CasparCG + a browser running the probe (the
 * beacon path); pass 1 (2.5.0 `69e8ad5`) picked `js-escape+amcp-escape`. The
 * parity block pins the shipped `@cg/caspar-client` quoter to that winning
 * encoder, and the amcp-mock block checks the mock's model of the confirmed
 * rule agrees with the sweep result.
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

  // ── the two-layer-model candidates (B-041 sweep, added pre-pass-1) ──────────
  // Net wire rule for js-escape+amcp-escape: each JSON `\` → FOUR wire `\`, each
  // JSON `"` → `\"`, everything else unchanged. One un-escape layer is the AMCP
  // tokenizer (`\\`→`\`, `\"`→`"`, `\n`→raw LF), the second is V8 parsing the
  // `update("…")` literal html_cg_proxy builds (quotes-only re-escape in between).

  it('js-escape+amcp-escape: exact wire bytes per hard-payload class', () => {
    const enc = byId('js-escape+amcp-escape');
    // quote class — JSON `\"` (bs, quote) → bs×4 then `\"`: 5 backslashes + quote.
    expect(enc.encodeArg('a\\"b')).toBe('"a\\\\\\\\\\"b"');
    // a bare structural quote → `\"`.
    expect(enc.encodeArg('a"b')).toBe('"a\\"b"');
    // backslash×1 class — JSON `\\` (2 chars) → 8 wire backslashes.
    expect(enc.encodeArg('a\\\\b')).toBe('"a\\\\\\\\\\\\\\\\b"');
    // newline class — JSON `\n` (bs, n) → 4 backslashes + literal n.
    expect(enc.encodeArg('a\\nb')).toBe('"a\\\\\\\\nb"');
    // tab class — JSON `\t` (bs, t) → 4 backslashes + literal t.
    expect(enc.encodeArg('a\\tb')).toBe('"a\\\\\\\\tb"');
    // Persian — untouched (no backslash, no quote).
    expect(enc.encodeArg('خبر فوری')).toBe('"خبر فوری"');
  });

  it('js-escape+amcp-escape: full hard payload = spec transform (\\→××××, "→\\")', () => {
    // The net-effect spec, written independently of the encoder's layer composition:
    // double-double every backslash FIRST, then escape quotes (later-inserted
    // backslashes must not be re-doubled).
    const spec = `"${expectedJson().replace(/\\/g, '\\\\\\\\').replace(/"/g, '\\"')}"`;
    expect(byId('js-escape+amcp-escape').encodeArg(expectedJson())).toBe(spec);
  });

  it('js-escape+amcp-escape+uXXXX-controls: exact wire bytes per hard-payload class', () => {
    const enc = byId('js-escape+amcp-escape+uXXXX-controls');
    // newline class — the JSON backslash-n pair is rewritten to the u000a form
    // first, then the single backslash is doubled twice: 4 backslashes + "u000a".
    expect(enc.encodeArg('a\\nb')).toBe('"a\\\\\\\\u000ab"');
    // tab class — same shape with "u0009".
    expect(enc.encodeArg('a\\tb')).toBe('"a\\\\\\\\u0009b"');
    // backslash×1 class — the escaped-backslash pair is parity-preserved, then ×4 each: 8.
    expect(enc.encodeArg('a\\\\b')).toBe('"a\\\\\\\\\\\\\\\\b"');
    // quote class — JSON `\"` → 5 backslashes + quote (same as the base candidate).
    expect(enc.encodeArg('a\\"b')).toBe('"a\\\\\\\\\\"b"');
    // Persian — untouched.
    expect(enc.encodeArg('خبر فوری')).toBe('"خبر فوری"');
  });
});

/**
 * B-041 §2 — the shipped canonical quoter (`@cg/caspar-client` `quote()`) IS the
 * winning candidate (`js-escape+amcp-escape`, the pass-1 sweep winner). This
 * parity pin means the production escape and the harness's executable spec of
 * the rule can never drift apart: change one without the other and this fails.
 */
describe('parity — shipped quoter ≡ winning candidate js-escape+amcp-escape', () => {
  const winner = byId('js-escape+amcp-escape');

  it('produces identical wire bytes for the full hard payload', () => {
    expect(quote(expectedJson())).toBe(winner.encodeArg(expectedJson()));
  });

  it('produces identical wire bytes for every individual character class', () => {
    for (const value of Object.values(HARD_PAYLOAD)) {
      const json = JSON.stringify({ v: value });
      expect(quote(json)).toBe(winner.encodeArg(json));
    }
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
 * Against amcp-mock: since the B-041 fix the mock decodes CG data args through
 * BOTH emulated CasparCG un-escape layers (the tokenizer, then the html_cg_proxy
 * `update("…")` V8 embed — the hardware-confirmed rule). So the sweep winner
 * round-trips byte-exact through it, and the losing control candidates are
 * flagged. This is a MODEL of the hardware evidence, not ground truth — the rule
 * itself is (re-)confirmed only by the on-hardware sweep.
 */
describe('amcp-mock — models the confirmed rule (winner passes, controls are flagged)', () => {
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

  // Each case primes the layer with a producer first — CG UPDATE on an empty
  // layer is a faithful 403 now (reconnect-reconciliation); the escaping focus
  // needs a producer on the slot.
  it('the winning candidate round-trips the hard payload byte-exact', async () => {
    mock = await createMock({ amcpPort: 0, oscPort: 0, disableOsc: true });
    await sendLine(mock.amcpPort, 'PLAY 1-10 "file:///x.html" HTML');
    const dataArg = byId('js-escape+amcp-escape').encodeArg(expectedJson());
    const reply = await sendLine(mock.amcpPort, `CG 1-10 UPDATE 0 ${dataArg}`);
    expect(reply).toContain('202 CG');
    const upd = mock.lastCgUpdate({ channel: 1, layer: 10 });
    expect(upd?.rejected).toBeUndefined();
    expect(upd?.data).toBe(expectedJson());
  });

  it('the failed control candidates are flagged (202 on the wire, no delivery)', async () => {
    mock = await createMock({ amcpPort: 0, oscPort: 0, disableOsc: true });
    await sendLine(mock.amcpPort, 'PLAY 1-10 "file:///x.html" HTML');
    for (const id of ['quotes-only', 'backslash-quote']) {
      const dataArg = byId(id).encodeArg(expectedJson());
      const reply = await sendLine(mock.amcpPort, `CG 1-10 UPDATE 0 ${dataArg}`);
      expect(reply).toContain('202 CG'); // real CasparCG acks; update never fires
      const upd = mock.lastCgUpdate({ channel: 1, layer: 10 });
      expect(upd?.data).toBeNull();
      expect(upd?.rejected).toBeDefined();
    }
  });
});
