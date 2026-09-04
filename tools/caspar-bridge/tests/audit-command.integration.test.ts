import * as dgram from 'node:dgram';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import type { AuditEntry } from '@cg/shared-schema';
import type { ConnectionConfig, TemplateInfo } from '@cg/shared-ipc';
import { CasparRuntime } from '../src/caspar-runtime.js';
import { HEALTH_MS } from './support/harness.js';

/**
 * ⭐ **`B-209` — A REFUSED TAKE RECORDS THE LINE THAT WAS REFUSED, BESIDE THE CODE.**
 *
 * On 2026-09-04 the station's audit record held fourteen consecutive
 * `take … amcp-404 … failed` rows and could not say which of a take's up-to-five
 * commands the server had refused: the bridge prints no AMCP exchange anywhere, and
 * the record kept only the code. The diagnosis had to be reconstructed from the
 * code by reading `#takeImpl` top to bottom. This pins the fix on the wire the
 * incident used: a `CG ADD` the server answers `404`, driven through the real take
 * path, and the row on DISK naming `CG <ch>-<layer> ADD …`.
 *
 * ── HOW THE 404 IS PRODUCED ──────────────────────────────────────────────────
 *
 * The runtime is booted WITHOUT `startServing()`, so `#sendAdd` ships the bare
 * template id (the never-served unit-test branch). The mock models real CasparCG
 * there: a non-URL template reference is a template-folder lookup, and an id that
 * is not in the folder answers `404 CG ADD FAILED`. That is a genuine refusal of a
 * genuine `CG ADD`, which is exactly what the record must name.
 *
 * ── WHAT IS NOT ASSERTED ─────────────────────────────────────────────────────
 *
 * The full payload. The summariser keeps the first quoted argument (the template
 * reference) and elides what follows; the field values are the stack's to hold.
 * The `wire-line-summary` unit test pins that shape.
 */

let mock: MockHandle | null = null;
let runtime: CasparRuntime | null = null;
let auditDir: string | null = null;

const BANK = { channel: 1, low: { start: 1, count: 9 }, start: 70, count: 4 };
const FIXED_SLOTS = [
  { channel: 1, layer: 70 },
  { channel: 1, layer: 71 },
  { channel: 1, layer: 72 },
  { channel: 1, layer: 73 },
];
const SLOT = { channel: 1, layer: 72 };
const TEMPLATE: TemplateInfo = {
  templateId: 'tpl-refused',
  templateType: 'lower-third',
  fields: [],
};
const HTML = '<!doctype html><html><body>never served</body></html>';

afterEach(async () => {
  await runtime?.stop();
  runtime = null;
  await mock?.stop();
  mock = null;
  if (auditDir !== null && fs.existsSync(auditDir))
    fs.rmSync(auditDir, { recursive: true, force: true });
  auditDir = null;
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

function singleServer(amcpPort: number, oscPort: number): ConnectionConfig {
  return {
    servers: { A: { host: '127.0.0.1', amcpPort, oscPort } },
    strategy: 'mirror-sync',
    autoFailoverEnabled: true,
  };
}

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** The rows ON DISK, oldest first — the file is the claim, never the in-memory tail. */
async function entriesOnDisk(file: string, atLeast: number): Promise<AuditEntry[]> {
  const deadline = Date.now() + 4000;
  for (;;) {
    const rows = fs.existsSync(file)
      ? fs
          .readFileSync(file, 'utf-8')
          .split('\n')
          .filter((l) => l.length > 0)
          .map((l) => JSON.parse(l) as AuditEntry)
      : [];
    if (rows.length >= atLeast || Date.now() > deadline) return rows;
    await delay(20);
  }
}

/** A runtime whose template server is deliberately NOT started — see the header. */
async function bootUnserved(): Promise<{ r: CasparRuntime; file: string }> {
  auditDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-audit-command-'));
  const file = path.join(auditDir, 'bridge-audit.ndjson');
  const oscPort = await freeUdpPort();
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 40 });
  const r = new CasparRuntime(
    singleServer(mock.amcpPort, oscPort),
    {},
    { auditLogPath: file, fixedSlots: FIXED_SLOTS, fixedBank: BANK },
  );
  runtime = r;
  r.start();
  r.templateImport(TEMPLATE, HTML);
  await r.whenServerHealthy(HEALTH_MS);
  return { r, file };
}

describe('B-209 — the audit record names the refused command', () => {
  it(
    'a take whose CG ADD is refused records `command` = the ADD line, beside `amcp-404`',
    { timeout: 60_000 },
    async () => {
      const { r, file } = await bootUnserved();
      // LOAD is list-only: accepted, nothing on the wire (Section 1 of the diagnosis).
      expect(await r.loadFixed(SLOT, 'item1', TEMPLATE.templateId, { title: 'سلام' })).toEqual({
        accepted: true,
      });
      // The take's B-039 re-ADD is the first CG verb, and the server refuses it.
      const result = await r.take('item1');
      expect(result).toMatchObject({ accepted: false, errorCode: 'amcp-404' });

      // import → load → take, on disk.
      const rows = await entriesOnDisk(file, 3);
      const take = rows.find((e) => e.action === 'take');
      expect(take).toMatchObject({ outcome: 'failed', errorCode: 'amcp-404', itemId: 'item1' });
      // THE POINT: which line was refused, on which layer.
      expect(take?.command).toBeDefined();
      expect(take?.command).toMatch(/^CG 1-72 ADD 0 "tpl-refused" 0 /);
      // …with the payload elided, not reproduced.
      expect(take?.command).not.toContain('سلام');
    },
  );

  it('a refusal that never reached the wire records NO command', { timeout: 60_000 }, async () => {
    const { r, file } = await bootUnserved();
    // `unknown-item` — refused by the bridge before any AMCP line exists.
    expect(await r.take('nobody')).toMatchObject({ accepted: false, errorCode: 'unknown-item' });
    const rows = await entriesOnDisk(file, 2);
    const take = rows.find((e) => e.action === 'take');
    expect(take).toMatchObject({ outcome: 'failed', errorCode: 'unknown-item' });
    // Honest absence: no command was refused, so none is claimed.
    expect(take?.command).toBeUndefined();
  });

  it(
    'an ACCEPTED action records no command either — the field is about refusals',
    {
      timeout: 60_000,
    },
    async () => {
      const { r, file } = await bootUnserved();
      expect(await r.loadFixed(SLOT, 'item1', TEMPLATE.templateId, {})).toEqual({ accepted: true });
      const rows = await entriesOnDisk(file, 2);
      const load = rows.find((e) => e.action === 'load');
      expect(load).toMatchObject({ outcome: 'ok' });
      expect(load?.command).toBeUndefined();
    },
  );
});
