import * as dgram from 'node:dgram';
import { afterEach, expect, it } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import { CasparRuntime } from '../src/caspar-runtime.js';
import type { ConnectionConfig, TemplateInfo } from '@cg/shared-ipc';
import type { FieldValues } from '@cg/shared-schema';
import { HEALTH_MS } from './support/harness.js';

/**
 * B-041 (take 2) — the full special-character matrix (`"`, `\` ×1–4, newline, tab,
 * Persian, combos, list fields) must survive `CG ADD` and `CG UPDATE` byte-exact.
 * Drives the real bridge → hardened mock: the mock decodes the data arg through
 * BOTH emulated CasparCG un-escape layers (AMCP tokenizer, then the html_cg_proxy
 * `update("…")` V8 embed) and flags framing/JSON-breakers; this test `JSON.parse`s
 * what `window.update` would receive and asserts equality with the original
 * object. Under the old quotes-only escaping the mock now REJECTS the payload
 * (raw newline after layer 1), so the regression class cannot pass again.
 */

let mock: MockHandle | null = null;
let runtime: CasparRuntime | null = null;

afterEach(async () => {
  await runtime?.stop();
  runtime = null;
  await mock?.stop();
  mock = null;
});

function freeUdpPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const sock = dgram.createSocket('udp4');
    sock.once('error', reject);
    sock.bind(0, '127.0.0.1', () => {
      const port = sock.address().port;
      sock.close(() => resolve(port));
    });
  });
}

function connectionFor(amcpPort: number, oscPort: number, oscPortB: number): ConnectionConfig {
  return {
    servers: {
      A: { host: '127.0.0.1', amcpPort, oscPort },
      B: { host: '127.0.0.1', amcpPort, oscPort: oscPortB },
    },
    strategy: 'mirror-sync',
    autoFailoverEnabled: true,
  };
}

const TEMPLATE: TemplateInfo = {
  templateId: 'lower-third',
  templateType: 'lower-third',
  fields: [],
};
const HTML = '<!doctype html><html><head><meta charset="utf-8"></head><body>سلام</body></html>';

// Every special character from the B-041 matrix, in one payload — mirrors the
// hardware sweep's hard payload, plus a structured list field (ticker items,
// including two-line values: the operator's original repro).
const SPECIAL: FieldValues = {
  quote: 'he said "hello"',
  backslashOdd: 'a\\b', // 1 backslash
  backslashEven: 'a\\\\b', // 2 backslashes
  backslashTriple: 'a\\\\\\b', // 3 backslashes
  backslashQuad: 'a\\\\\\\\b', // 4 backslashes
  path: 'C:\\templates\\lower "third".html',
  newline: 'line1\nline2',
  tab: 'col1\tcol2',
  combo: 'he said "a\\b"\nخط دوم',
  persian: 'خبر فوری ۱۴۰۳ — «به‌روزرسانی»',
  ticker: [
    { id: 'i1', text: 'خبر اول\nخط دوم' },
    { id: 'i2', text: 'quote " and backslash \\ item' },
  ],
};

it('CG ADD + CG UPDATE carry the full B-041 matrix byte-exact (Persian + lists intact)', async () => {
  const oscPort = await freeUdpPort();
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 40 });
  runtime = new CasparRuntime(connectionFor(mock.amcpPort, oscPort, await freeUdpPort()));
  runtime.start();
  await runtime.startServing();
  runtime.templateImport(TEMPLATE, HTML);
  await runtime.whenServerHealthy(HEALTH_MS);

  const slot = { channel: 1, layer: 10 };

  // ── load → CG ADD data arg survives byte-exact ──
  expect((await runtime.load('item1', 'lower-third', SPECIAL)).accepted).toBe(true);
  const add = mock.lastCgAdd(slot);
  // The two-layer decode must NOT have flagged the emission…
  expect(add?.rejected).toBeUndefined();
  // …and what window.update receives JSON.parses back to the original object.
  const addParsed = JSON.parse(add?.data ?? '{}') as FieldValues;
  expect(addParsed).toEqual(SPECIAL);
  // List fields stay structured arrays (not stringified blobs).
  expect(Array.isArray(addParsed['ticker'])).toBe(true);

  expect((await runtime.take('item1')).accepted).toBe(true);

  // ── update (replace) → CG UPDATE data arg survives byte-exact ──
  const next: FieldValues = {
    ...SPECIAL,
    quote: 'now "updated"\nخط دوم',
    backslashOdd: 'x\\y\\z',
    ticker: [
      { id: 'i1', text: 'تیتر به‌روز شده\nخط دوم فارسی' },
      { id: 'i2', text: 'line one "q"\nline two \\' },
    ],
  };
  expect((await runtime.update('item1', next, 'replace')).accepted).toBe(true);
  const upd = mock.lastCgUpdate(slot);
  expect(upd?.rejected).toBeUndefined();
  const updParsed = JSON.parse(upd?.data ?? '{}') as FieldValues;
  expect(updParsed).toEqual(next);
  expect(Array.isArray(updParsed['ticker'])).toBe(true);
});
