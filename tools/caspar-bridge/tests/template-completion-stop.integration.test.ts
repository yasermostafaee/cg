import * as dgram from 'node:dgram';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import { readCgControl, TEMPLATE_COMPLETE_PATH, type AuditEntry } from '@cg/shared-schema';
import { TEMPLATE_ACTOR, type ConnectionConfig, type TemplateInfo } from '@cg/shared-ipc';
import { CasparRuntime } from '../src/caspar-runtime.js';
import { HEALTH_MS, TEST_LAYER_POLICY } from './support/harness.js';

/**
 * 🔴 `SELF-STOP-24` §2.3 — **A FINISHED TEMPLATE TAKES ITS OWN ROW OFF AIR, AT THE WIRE.**
 *
 * `C-013`'s complaint, recorded from the owner: after a while the stack shows several rows as ON
 * AIR while only one thing is on output. This file is the end of that — a report arrives on the
 * template server's completion route and the row comes off air through the SAME graceful stop
 * the operator's button runs, leaving the producer resident so a later PLAY is instant
 * (`C-012`'s residency contract).
 *
 * ⭐ **MEASURED ON THE AMCP TRACE, not on a status.** A status is what the bridge BELIEVES; the
 * trace is what CasparCG was told. `B-161` and `B-155` were both cases where the belief and the
 * wire disagreed, so every count here is of real command lines.
 *
 * The four ways this could stop the WRONG run all have a case:
 *
 *  - a STALE token (nothing happens);
 *  - the same token reported TWICE — the mirrored plant, where the backup's copy of the page
 *    reports the run the primary already did (one stop, not two);
 *  - a report racing an operator STOP (one stop, no error);
 *  - a report arriving after the row has been taken OUT (nothing happens).
 */

let mock: MockHandle | null = null;
let runtime: CasparRuntime | null = null;
let tracePath: string | null = null;
let auditDir: string | null = null;

afterEach(async () => {
  await runtime?.stop();
  runtime = null;
  await mock?.stop();
  mock = null;
  if (tracePath !== null && fs.existsSync(tracePath)) fs.rmSync(tracePath);
  tracePath = null;
  if (auditDir !== null && fs.existsSync(auditDir))
    fs.rmSync(auditDir, { recursive: true, force: true });
  auditDir = null;
});

const TEMPLATE: TemplateInfo = {
  templateId: 'lower-third',
  templateType: 'lower-third',
  fields: [],
};
const HTML = '<!doctype html><html><body>x</body></html>';
const SLOT = { channel: 1, layer: 10 };
const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

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

/** Every AMCP line the mock RECEIVED, in order. The wire, not a belief about it. */
async function wire(): Promise<string[]> {
  if (mock === null || tracePath === null) throw new Error('no trace');
  await mock.traceFlush();
  return fs
    .readFileSync(tracePath, 'utf-8')
    .split('\n')
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as { dir: string; line: string })
    .filter((e) => e.dir === 'recv')
    .map((e) => e.line);
}

const linesMatching = (lines: readonly string[], re: RegExp): string[] =>
  lines.filter((l) => re.test(l));

/** POST a completion report to the running bridge's own template server. */
function report(url: string, take: string): Promise<number> {
  const body = JSON.stringify({ take });
  const target = new URL(url);
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: target.hostname,
        port: Number(target.port),
        method: 'POST',
        path: TEMPLATE_COMPLETE_PATH,
        headers: { 'content-type': 'application/json', 'content-length': String(body.length) },
      },
      (res) => {
        res.resume();
        res.on('end', () => resolve(res.statusCode ?? 0));
      },
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/** The whole JSON payload a single AMCP line carried, or undefined if it carried none. */
function payloadOf(line: string): Record<string, unknown> | undefined {
  const quoted = /"((?:[^"\\]|\\.)*)"\s*$/.exec(line);
  if (quoted?.[1] === undefined) return undefined;
  const json = quoted[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  return JSON.parse(json) as Record<string, unknown>;
}

/** The `__cg` control object a single AMCP line carried, or undefined if it carried none. */
function controlOf(line: string): ReturnType<typeof readCgControl> {
  const quoted = /"((?:[^"\\]|\\.)*)"\s*$/.exec(line);
  if (quoted?.[1] === undefined) return undefined;
  const json = quoted[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  return readCgControl(JSON.parse(json) as unknown);
}

/**
 * 🔴 **THE TOKEN THE PAGE IS HOLDING NOW, READ OFF THE WIRE — never from an accessor the test
 * asked the bridge for.**
 *
 * A helper that handed the test the bridge's own map would pass just as well if the token never
 * reached the payload at all, which is the defect class (`0f54e00d`) this whole feature is
 * downstream of. So the test reads what the page reads.
 *
 * ⚠ **WHICHEVER COMMAND CARRIED IT LAST, and that is not a convenience.** Two commands can
 * carry a token — the `CG ADD` that builds a page, and the pre-PLAY `CG UPDATE` that refreshes
 * a RESIDENT one — and the page takes the last writer, because that is the run it is about to
 * play. Reading only the ADD is how the first draft of this file went red: `load()` ADDs, then
 * `take()` finds the producer already resident and refreshes, so the ADD's token is superseded
 * before the graphic is ever on air.
 */
function currentToken(lines: readonly string[]): string | undefined {
  const carriers = linesMatching(lines, /^CG 1-10 (ADD|UPDATE) /);
  for (let i = carriers.length - 1; i >= 0; i--) {
    const take = controlOf(carriers[i] as string)?.take;
    if (take !== undefined) return take;
  }
  return undefined;
}

/** The token on the last `CG ADD` specifically — for the cases about the LOAD payload. */
function tokenFromAdd(lines: readonly string[]): string | undefined {
  const add = linesMatching(lines, /^CG 1-10 ADD /).at(-1);
  return add === undefined ? undefined : controlOf(add)?.take;
}

async function onAir(): Promise<{ r: CasparRuntime; url: string; auditFile: string }> {
  auditDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-selfstop-'));
  const auditFile = path.join(auditDir, 'bridge-audit.ndjson');
  tracePath = path.join(auditDir, 'amcp-trace.ndjson');
  const oscPort = await freeUdpPort();
  mock = await createMock({
    amcpPort: 0,
    oscPort,
    oscHost: '127.0.0.1',
    oscHz: 40,
    tracePath,
  });
  const r = new CasparRuntime(
    singleServer(mock.amcpPort, oscPort),
    {},
    { layerPolicy: TEST_LAYER_POLICY, auditLogPath: auditFile },
  );
  runtime = r;
  r.start();
  await r.startServing();
  await r.whenServerHealthy(HEALTH_MS);
  r.templateImport(TEMPLATE, HTML);
  expect((await r.load('item1', 'lower-third', {})).accepted).toBe(true);
  await expect(mock.waitForCgAddResolution(SLOT)).resolves.toBe('resolved');
  expect((await r.take('item1')).accepted).toBe(true);
  return { r, url: r.templateServeUrl('lower-third') ?? '', auditFile };
}

/** Wait until the wire carries `n` lines matching `re`, or give up and let the count assert. */
async function settleWire(re: RegExp, n: number): Promise<string[]> {
  const deadline = Date.now() + 3000;
  for (;;) {
    const found = linesMatching(await wire(), re);
    if (found.length >= n || Date.now() > deadline) return found;
    await delay(25);
  }
}

async function auditRows(file: string, atLeast: number): Promise<AuditEntry[]> {
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

describe('SELF-STOP-24 §2.3 — a completion report stops the row it names', () => {
  it('the load payload carries a take token', { timeout: 60_000 }, async () => {
    await onAir();
    // Deliberately `tokenFromAdd`, not `currentToken`: this case is about the LOAD payload
    // specifically. The take that follows supersedes it, which is a different claim and has
    // its own case below.
    expect(tokenFromAdd(await wire()), 'the ADD carried no take token').toMatch(/^[0-9a-f]{32}$/);
  });

  it(
    'a valid report sends exactly one CG STOP and leaves the producer resident',
    { timeout: 60_000 },
    async () => {
      const { r, url } = await onAir();
      const take = currentToken(await wire());
      expect(take, 'no token — the rest of this case proves nothing').toBeDefined();

      expect(await report(url, take as string)).toBe(204);
      expect(await settleWire(/^CG 1-10 STOP/, 1)).toHaveLength(1);

      // C-012's residency contract: STOP leaves the producer, so a later take is a bare PLAY.
      const addsBefore = linesMatching(await wire(), /^CG 1-10 ADD /).length;
      expect((await r.take('item1')).accepted).toBe(true);
      const after = await wire();
      expect(
        linesMatching(after, /^CG 1-10 ADD /),
        'the resume re-ADDed — the producer was not left resident',
      ).toHaveLength(addsBefore);
      expect(linesMatching(after, /^CG 1-10 PLAY/).length).toBeGreaterThanOrEqual(2);
    },
  );

  it('a STALE token does nothing at all', { timeout: 60_000 }, async () => {
    const { url } = await onAir();
    const before = linesMatching(await wire(), /^CG 1-10 STOP/).length;

    expect(await report(url, 'deadbeefdeadbeefdeadbeefdeadbeef')).toBe(404);
    await delay(150);

    expect(linesMatching(await wire(), /^CG 1-10 STOP/)).toHaveLength(before);
  });

  it(
    'TWO reports of one take produce ONE stop — the mirrored plant',
    { timeout: 60_000 },
    async () => {
      // The primary's page and the backup's page are the SAME page, fetched from the same URL,
      // so both report the same run. The token is spent on first use.
      const { url } = await onAir();
      const take = currentToken(await wire()) as string;

      const first = await report(url, take);
      const second = await report(url, take);

      expect(first).toBe(204);
      expect(second, 'the second report was accepted — the token was not spent').toBe(404);
      await delay(200);
      expect(linesMatching(await wire(), /^CG 1-10 STOP/)).toHaveLength(1);
    },
  );

  it(
    'a report arriving AFTER the operator stopped the row is ignored, with no error',
    { timeout: 60_000 },
    async () => {
      const { r, url } = await onAir();
      const take = currentToken(await wire()) as string;

      expect((await r.stopItem('item1')).accepted).toBe(true);
      await settleWire(/^CG 1-10 STOP/, 1);

      expect(await report(url, take), 'the late report was acted on').toBe(404);
      await delay(200);
      expect(
        linesMatching(await wire(), /^CG 1-10 STOP/),
        'a second STOP was sent for one departure',
      ).toHaveLength(1);
    },
  );

  it('a report arriving after the row was taken OUT is ignored', { timeout: 60_000 }, async () => {
    const { r, url } = await onAir();
    const take = currentToken(await wire()) as string;

    expect((await r.out('item1')).accepted).toBe(true);
    await delay(150);

    expect(await report(url, take)).toBe(404);
    await delay(150);
    expect(linesMatching(await wire(), /^CG 1-10 STOP/)).toHaveLength(0);
  });

  it(
    'a RE-TAKE of a resident producer is told a NEW token before the play',
    { timeout: 60_000 },
    async () => {
      /*
        🔴 **THE CASE THE WHOLE REFRESH EXISTS FOR.** A take of a still-resident producer sends
        NO `CG ADD` — the page is the same page, which is exactly what makes `C-012`'s resume
        instant. So without a refresh the second run would inherit the first run's token, and a
        report from the run that FINISHED would stop the run that had just started.
      */
      const { r } = await onAir();
      const first = currentToken(await wire());
      expect(first, 'no token on the load — this case proves nothing').toBeDefined();

      expect((await r.stopItem('item1')).accepted).toBe(true);
      await settleWire(/^CG 1-10 STOP/, 1);
      const addsBefore = linesMatching(await wire(), /^CG 1-10 ADD /).length;

      expect((await r.take('item1')).accepted).toBe(true);
      const after = await wire();

      expect(
        linesMatching(after, /^CG 1-10 ADD /),
        'the re-take re-ADDed — this is not the resident path',
      ).toHaveLength(addsBefore);
      const second = currentToken(after);
      expect(
        linesMatching(after, /^CG 1-10 UPDATE /).length,
        'no pre-PLAY UPDATE was sent at all',
      ).toBeGreaterThan(0);
      expect(second, 'the resident take told the page no token').toMatch(/^[0-9a-f]{32}$/);
      expect(second, 'the re-take reused the finished run token').not.toBe(first);
    },
  );

  it(
    'the pre-PLAY tell carries ONLY __cg — no field data, and so no unsent draft',
    { timeout: 60_000 },
    async () => {
      /*
        🔴 `REPLY 1` §R1.1 — **WHAT THAT `CG UPDATE` ACTUALLY CARRIES, measured on the wire.**

        `750b28ea` made this tell reach EVERY template, not just look-bearing ones, so the
        question "does it also carry field data, and if so is it the last-SENT values or the
        Inspector's unsent DRAFT?" has to be answered rather than reasoned about. It carries
        NEITHER: `updateTake`'s `fields` defaults to `{}` and `#tellPageTake` passes none, so the
        payload's only key is the reserved one.

        Pinned here rather than on the builder because a builder unit test would still pass if a
        caller started handing it fields. This asserts what left the bridge.
      */
      const { r } = await onAir();
      expect((await r.stopItem('item1')).accepted).toBe(true);
      await settleWire(/^CG 1-10 STOP/, 1);

      const before = linesMatching(await wire(), /^CG 1-10 UPDATE /).length;
      expect((await r.take('item1')).accepted).toBe(true);

      const tells = linesMatching(await wire(), /^CG 1-10 UPDATE /).slice(before);
      expect(tells, 'the resident take sent no tell — nothing below is measured').toHaveLength(1);

      const payload = payloadOf(tells[0] as string);
      expect(payload, 'the tell carried no payload at all').toBeDefined();
      expect(
        Object.keys(payload ?? {}),
        'the tell carried field data — a draft or a stale value could ride a take',
      ).toEqual(['__cg']);
    },
  );

  it(
    'a report carrying the PREVIOUS take token after a re-take is IGNORED',
    { timeout: 60_000 },
    async () => {
      const { r, url } = await onAir();
      const stale = currentToken(await wire()) as string;

      expect((await r.stopItem('item1')).accepted).toBe(true);
      await settleWire(/^CG 1-10 STOP/, 1);
      expect((await r.take('item1')).accepted).toBe(true);
      const stopsBefore = linesMatching(await wire(), /^CG 1-10 STOP/).length;

      expect(await report(url, stale), 'a finished run stopped a newer one').toBe(404);
      await delay(200);

      expect(linesMatching(await wire(), /^CG 1-10 STOP/)).toHaveLength(stopsBefore);
    },
  );

  it('and the NEW token stops the second run', { timeout: 60_000 }, async () => {
    // The positive control for the case above: the refresh must not merely invalidate the old
    // token, it must arm the new run. Without this, "nothing happened" would be satisfied by a
    // completion channel that had quietly stopped working.
    const { r, url } = await onAir();
    expect((await r.stopItem('item1')).accepted).toBe(true);
    await settleWire(/^CG 1-10 STOP/, 1);
    expect((await r.take('item1')).accepted).toBe(true);
    const fresh = currentToken(await wire()) as string;
    const stopsBefore = linesMatching(await wire(), /^CG 1-10 STOP/).length;

    expect(await report(url, fresh)).toBe(204);
    await settleWire(/^CG 1-10 STOP/, stopsBefore + 1);

    expect(linesMatching(await wire(), /^CG 1-10 STOP/)).toHaveLength(stopsBefore + 1);
  });

  it('a look-less template is told its token too', { timeout: 60_000 }, async () => {
    // The tell used to be the LOOK tell, which only fires for a template that has looks. The
    // fixture here declares none, so if the refresh were still gated on a look this row would
    // come back from a re-take with no way to report its own completion.
    const { r } = await onAir();
    expect(TEMPLATE.liveSources, 'the fixture grew looks — this case proves nothing').toBe(
      undefined,
    );

    expect((await r.stopItem('item1')).accepted).toBe(true);
    await settleWire(/^CG 1-10 STOP/, 1);
    expect((await r.take('item1')).accepted).toBe(true);

    expect(currentToken(await wire())).toMatch(/^[0-9a-f]{32}$/);
  });

  it(
    'the audit names the TEMPLATE as the actor, on the existing stop action',
    { timeout: 60_000 },
    async () => {
      const { url, auditFile } = await onAir();
      const take = currentToken(await wire()) as string;

      expect(await report(url, take)).toBe(204);

      const rows = await auditRows(auditFile, 4); // import + load + take + stop
      const stops = rows.filter((row) => row.action === 'stop');
      expect(stops, 'no stop row was appended for a completion').toHaveLength(1);
      expect(stops[0]?.actor, 'a template stop was filed under a console name').toBe(
        TEMPLATE_ACTOR,
      );
      expect(stops[0]?.itemId).toBe('item1');
      expect(stops[0]?.outcome).toBe('ok');
      // The verb is unchanged — only who asked differs.
      expect(rows.some((row) => row.action === 'take' && row.actor === TEMPLATE_ACTOR)).toBe(false);
    },
  );
});
