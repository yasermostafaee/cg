import * as dgram from 'node:dgram';
import { afterEach, expect, it } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import type { TemplateInfo } from '@cg/shared-ipc';
import type { FieldValues } from '@cg/shared-schema';
import { CasparRuntime } from '../src/caspar-runtime.js';
import { HEALTH_MS } from './support/harness.js';

/**
 * B-066 (the "????" downstream symptom) — UTF-8 INTEGRITY of the field
 * payload, locked byte-exact: a Persian field value loaded through the
 * bridge must land in the `CG ADD` data payload — as decoded through the
 * mock's BOTH emulated CasparCG un-escape layers — with the EXACT original
 * codepoints and ZERO "?" substitution characters. The end-to-end trace
 * found every repo hop already UTF-8-clean (design.md §3); this test is the
 * regression net that turns any future downconversion (a Buffer/encoding
 * boundary, an IPC serialization, a socket write) from a live mystery into
 * a red test. Escaping (`quote()`, B-041) is frozen and NOT under test here
 * — this is encoding coverage only.
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
      sock.close(() => {
        resolve(port);
      });
    });
  });
}

const TEMPLATE: TemplateInfo = {
  templateId: 'lower-third',
  templateType: 'lower-third',
  fields: [],
};
const HTML = '<!doctype html><html><head><meta charset="utf-8"></head><body>سلام</body></html>';
const SLOT = { channel: 1, layer: 10 };

// The exact strings a Persian lower-third ships: the fixture default, digits,
// ZWNJ (‌), and guillemets — the payload class the live "????" report
// was about.
const PERSIAN: FieldValues = {
  anchor: 'سارا نادری',
  headline: 'خبر فوری ۱۴۰۳ — «به‌روزرسانی»',
};

it('a Persian field payload reaches the CG ADD wire byte-exact — exact codepoints, zero "?"', async () => {
  const oscPort = await freeUdpPort();
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 30 });
  runtime = new CasparRuntime({
    servers: { A: { host: '127.0.0.1', amcpPort: mock.amcpPort, oscPort } },
    strategy: 'mirror-sync',
    autoFailoverEnabled: true,
  });
  runtime.start();
  await runtime.startServing();
  runtime.templateImport(TEMPLATE, HTML);
  await runtime.whenServerHealthy(HEALTH_MS);

  expect((await runtime.load('item1', 'lower-third', PERSIAN)).accepted).toBe(true);

  const add = mock.lastCgAdd(SLOT);
  expect(add?.rejected).toBeUndefined();
  const decoded = JSON.parse(add?.data ?? '{}') as FieldValues;

  // Byte-exact: identical codepoint sequences, field by field.
  for (const [key, expected] of Object.entries(PERSIAN)) {
    const actual = decoded[key];
    expect(typeof actual).toBe('string');
    expect([...String(actual)].map((c) => c.codePointAt(0))).toEqual(
      [...String(expected)].map((c) => c.codePointAt(0)),
    );
  }
  // And the charset-downconversion signature is absent everywhere: the sent
  // line and the decoded payload contain no "?" at all (the payload has none
  // legitimately — any "?" would BE the downconversion).
  expect(add?.data).not.toContain('?');
}, 20000);
