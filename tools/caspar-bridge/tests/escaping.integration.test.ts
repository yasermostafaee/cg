import * as dgram from 'node:dgram';
import { afterEach, expect, it } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import { CasparRuntime } from '../src/caspar-runtime.js';
import type { ConnectionConfig, TemplateInfo } from '@cg/shared-ipc';

/**
 * B-041 — special characters (`"`, `\` odd AND even, newline) in a field value must
 * survive `CG ADD` and `CG UPDATE` byte-exact. Drives the real bridge → hardened
 * mock; the mock decodes the data arg per real CasparCG rules (only `\"`→`"`), and
 * this test `JSON.parse`s it and asserts equality with the original object. With the
 * old double-escaping, the decoded payload would differ (regression caught here).
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

// Every special character from the B-041 matrix, in one payload.
const SPECIAL: Record<string, string> = {
  quote: 'he said "hello"',
  backslashOdd: 'a\\b', // 1 backslash
  backslashEven: 'a\\\\b', // 2 backslashes
  backslashTriple: 'a\\\\\\b', // 3 backslashes
  path: 'C:\\templates\\lower "third".html',
  newline: 'line1\nline2',
  persian: 'خبر فوری ۱۴۰۳ — «به‌روزرسانی»',
};

it('CG ADD + CG UPDATE carry " \\ (odd+even) and newline byte-exact (Persian intact)', async () => {
  const oscPort = await freeUdpPort();
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 40 });
  runtime = new CasparRuntime(connectionFor(mock.amcpPort, oscPort, await freeUdpPort()));
  runtime.start();
  await runtime.startServing();
  runtime.templateImport(TEMPLATE, HTML);
  await runtime.whenServerHealthy(5000);

  const slot = { channel: 1, layer: 10 };

  // ── load → CG ADD data arg survives byte-exact ──
  expect((await runtime.load('item1', 'lower-third', SPECIAL)).accepted).toBe(true);
  const add = mock.lastCgAdd(slot);
  // The mock decoded the quoted arg per real CasparCG; JSON.parse must equal SPECIAL.
  expect(JSON.parse(add?.data ?? '{}')).toEqual(SPECIAL);

  expect((await runtime.take('item1')).accepted).toBe(true);

  // ── update (replace) → CG UPDATE data arg survives byte-exact ──
  const next = { ...SPECIAL, quote: 'now "updated"\nخط دوم', backslashOdd: 'x\\y\\z' };
  expect((await runtime.update('item1', next, 'replace')).accepted).toBe(true);
  const upd = mock.lastCgUpdate(slot);
  expect(JSON.parse(upd?.data ?? '{}')).toEqual(next);
});
