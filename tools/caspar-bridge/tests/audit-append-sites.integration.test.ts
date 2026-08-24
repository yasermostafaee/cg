import * as dgram from 'node:dgram';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import { AuditEntrySchema, type AuditEntry } from '@cg/shared-schema';
import { UNATTRIBUTED_ACTOR, type ConnectionConfig, type TemplateInfo } from '@cg/shared-ipc';
import { CasparRuntime } from '../src/caspar-runtime.js';
import { HEALTH_MS } from './support/harness.js';

/**
 * ⭐ **B-141 §5a — THE SEVEN PLAYOUT VERBS, AND THE REFUSALS ARE THE POINT.**
 *
 * The reason these append sites were not wired in one sweep is written into this
 * file's shape. Every one of the seven has more exits than it has happy paths, and
 * a single append at the end of each would have recorded `ok` for every refusal —
 * a forensic record that misreports an on-air action, which is worse than none.
 *
 * So the assertions are organised the other way round from the usual: the SUCCESS
 * case gets one test per verb, and every distinct REFUSAL gets its own, with the
 * `errorCode` it must carry. A suite that covered only the happy paths would go
 * green over exactly the defect this item exists to prevent.
 *
 * Three properties are pinned throughout, and none of them is incidental:
 *
 *   1. **EXACTLY ONE entry per action.** Not zero (the gap), not two (a wrapper
 *      that fires alongside a hand-written append — which is how the second
 *      spelling of a rule appears).
 *   2. **The entry is on DISK**, read back through the same NDJSON tail the panel
 *      reads. An in-memory-only assertion would pass on a build whose writer never
 *      opened the file, which is the state B-141 found the product in.
 *   3. **A write failure never fails the action.** The station stays on air and
 *      the fault surfaces through `auditHealth`.
 */

/** The seven, driven one by one in the suite below. */
const PLAYOUT_VERBS = ['load', 'take', 'update', 'stop', 'next', 'out', 'remove'] as const;

/**
 * Every OTHER audit action, BY NAME: lifecycle and control events that are not per-item
 * playout verbs, each recorded by its own suite (`audit-actor`, failover, the template
 * registry). The partition test below refuses an action in neither list, so adding an
 * action to `AuditEntrySchema` forces a decision HERE — drive it above, or name it here —
 * instead of silently escaping the "every playout verb" claim.
 */
const NON_VERB_ACTIONS = [
  'failover',
  'reconnect',
  'import',
  'export',
  'lock-engage',
  'lock-release',
  'update-deferred',
  'update-installed',
] as const;

it('the "every playout verb" list is COMPLETE — each schema action is driven or named non-verb', () => {
  expect([...PLAYOUT_VERBS, ...NON_VERB_ACTIONS].sort()).toEqual(
    [...AuditEntrySchema.shape.action.options].sort(),
  );
});

let mock: MockHandle | null = null;
let runtime: CasparRuntime | null = null;
let auditDir: string | null = null;

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

const TEMPLATE: TemplateInfo = {
  templateId: 'lower-third',
  templateType: 'lower-third',
  fields: [],
};
const HTML = '<!doctype html><html><head><meta charset="utf-8"></head><body>سلام</body></html>';
const SLOT = { channel: 1, layer: 10 };

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** A fresh audit path under a per-test temp dir the afterEach removes. */
function auditPath(): string {
  auditDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-audit-'));
  return path.join(auditDir, 'bridge-audit.ndjson');
}

/**
 * The entries ON DISK, oldest-first, read the way `readRecentEntries` reads them.
 *
 * Deliberately NOT `auditRecent()`: that method falls back to the in-memory tail
 * when the file cannot be read, so asserting through it would let a build whose
 * writes never land look identical to one whose writes do. The file IS the claim.
 *
 * Appends are fire-and-forget by contract (they must never be awaited by an on-air
 * path), so a short settle is required before the bytes are there. Polling, not a
 * fixed sleep: a slow box must fail on the ASSERTION, never on the wait.
 */
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

/** Every entry for one action. */
const forAction = (rows: readonly AuditEntry[], action: AuditEntry['action']): AuditEntry[] =>
  rows.filter((r) => r.action === action);

/**
 * A runtime with a real mock CasparCG behind it and an audit file configured.
 * `reachable: false` skips the mock entirely — the link-down refusals need a
 * bridge whose server was never there.
 */
async function boot(opts: { reachable: boolean }): Promise<{ r: CasparRuntime; file: string }> {
  const file = auditPath();
  const oscPort = await freeUdpPort();
  let config: ConnectionConfig;
  if (opts.reachable) {
    mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 40 });
    config = singleServer(mock.amcpPort, oscPort);
  } else {
    // A port nothing is listening on: every verb refuses `disconnected` without
    // any of them reaching a wire.
    config = singleServer(await freeUdpPort(), oscPort);
  }
  const r = new CasparRuntime(config, {}, { auditLogPath: file });
  runtime = r;
  r.start();
  await r.startServing();
  if (opts.reachable) await r.whenServerHealthy(HEALTH_MS);
  return { r, file };
}

/** Boot, register the template, load and take `item1` to a real ON AIR. */
async function onAir(): Promise<{ r: CasparRuntime; file: string }> {
  const { r, file } = await boot({ reachable: true });
  r.templateImport(TEMPLATE, HTML);
  expect((await r.load('item1', 'lower-third', { headline: 'سلام' })).accepted).toBe(true);
  await expect(mock?.waitForCgAddResolution(SLOT)).resolves.toBe('resolved');
  expect((await r.take('item1')).accepted).toBe(true);
  return { r, file };
}

describe('B-141 — every playout verb records exactly one entry, at its real outcome', () => {
  it(
    'the ACCEPTED runs: load / take / update / stop / next / out / remove each write ONE ok row naming the item, template and layer',
    { timeout: 60_000 },
    async () => {
      const { r, file } = await onAir();
      expect((await r.update('item1', { headline: 'دو' }, 'merge')).accepted).toBe(true);
      expect((await r.stopItem('item1')).accepted).toBe(true);
      expect((await r.nextItem('item1')).accepted).toBe(true);
      expect((await r.out('item1')).accepted).toBe(true);
      expect((await r.remove('item1')).accepted).toBe(true);

      // 7 verbs + the `import` that registered the template.
      const rows = await entriesOnDisk(file, 8);
      for (const action of PLAYOUT_VERBS) {
        const mine = forAction(rows, action);
        // EXACTLY one. Zero is the gap this closes; two would mean the structural
        // wrapper is firing beside a hand-written append.
        expect(mine, `one ${action} row`).toHaveLength(1);
        expect(mine[0]).toMatchObject({
          /*
            These verbs are driven DIRECTLY against the runtime, with no control
            request around them, so there is no console to name and the honest
            answer is `unattributed`. It was the constant `'operator'` until the
            per-console name landed; see `actor-context.ts`, and
            `audit-actor.integration.test.ts` for the value arriving over the wire.
          */
          actor: UNATTRIBUTED_ACTOR,
          outcome: 'ok',
          itemId: 'item1',
          templateId: 'lower-third',
        });
        // The layer the operator acted on — read from the PRE-STATE, which is why
        // `remove` (which deletes the slot) can still name it.
        expect(mine[0]?.slot, `${action} names its layer`).toMatchObject({ channel: 1, layer: 10 });
        // No refusal code on an accepted run.
        expect(mine[0]?.errorCode).toBeUndefined();
      }
      // The operator's import is the 15th action and it is recorded too.
      expect(forAction(rows, 'import')).toHaveLength(1);
      expect(forAction(rows, 'import')[0]).toMatchObject({
        outcome: 'ok',
        templateId: 'lower-third',
      });
    },
  );

  it(
    'file order is OUTCOME order, and `ts` is stamped at the outcome',
    { timeout: 60_000 },
    async () => {
      const { r, file } = await onAir();
      expect((await r.out('item1')).accepted).toBe(true);
      /*
        FOUR, not three — the count this test ASSERTS. `entriesOnDisk` polls to `atLeast` and then
        returns whatever is on disk, so a wait that stops short of the assertion turns a loaded box
        into a red on the race rather than on the behaviour. Its own header says the rule: "a slow
        box must fail on the ASSERTION, never on the wait." Every other call site in this file
        already passes the number its assertion needs; this one did not, and only enough load to
        delay `out`'s fire-and-forget append made it show.
      */
      const rows = await entriesOnDisk(file, 4);
      const seq = rows.map((e) => e.action);
      /*
        import → load → take → out, in the order they FINISHED. Two things make
        this true and BOTH are needed: the wrapper writes where the outcome is
        known (so a slow verb cannot be recorded before a fast one that started
        after it), and `AuditWriter` CHAINS its appends (so two fire-and-forget
        writes cannot complete out of order). This assertion passed on Windows
        while the second half was missing — CI is what caught it.
      */
      expect(seq).toEqual(['import', 'load', 'take', 'out']);
      const stamps = rows.map((e) => Date.parse(e.ts));
      expect(stamps.every((t) => Number.isFinite(t))).toBe(true);
      for (let i = 1; i < stamps.length; i += 1) {
        expect(stamps[i] ?? 0).toBeGreaterThanOrEqual(stamps[i - 1] ?? 0);
      }
    },
  );
});

describe('B-141 — the REFUSALS, each with the code that refused it', () => {
  it(
    'unknown-item — take / update / stop / next / out on an item that was never loaded',
    { timeout: 60_000 },
    async () => {
      const { r, file } = await boot({ reachable: true });
      expect(await r.take('ghost')).toMatchObject({ accepted: false, errorCode: 'unknown-item' });
      expect(await r.update('ghost', {}, 'merge')).toMatchObject({ errorCode: 'unknown-item' });
      expect(await r.stopItem('ghost')).toMatchObject({ errorCode: 'unknown-item' });
      expect(await r.nextItem('ghost')).toMatchObject({ errorCode: 'unknown-item' });
      // B-141 — `out` alone used to answer a bare `{ accepted: false }`; the code is
      // the whole value of the row.
      expect(await r.out('ghost')).toMatchObject({ accepted: false, errorCode: 'unknown-item' });

      const rows = await entriesOnDisk(file, 5);
      expect(rows).toHaveLength(5);
      for (const e of rows) {
        expect(e).toMatchObject({ outcome: 'failed', errorCode: 'unknown-item', itemId: 'ghost' });
      }
      expect(rows.map((e) => e.action).sort()).toEqual(
        ['next', 'out', 'stop', 'take', 'update'].sort(),
      );
    },
  );

  it(
    'unknown-template — a load for a template the bridge does not hold',
    { timeout: 60_000 },
    async () => {
      const { r, file } = await boot({ reachable: true });
      expect(await r.load('item1', 'never-imported', {})).toMatchObject({
        accepted: false,
        errorCode: 'unknown-template',
      });
      const rows = await entriesOnDisk(file, 1);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        action: 'load',
        outcome: 'failed',
        errorCode: 'unknown-template',
        itemId: 'item1',
        templateId: 'never-imported',
      });
      // No layer was ever allocated, so none is named. An invented one would be a
      // worse record than the gap.
      expect(rows[0]?.slot).toBeUndefined();
    },
  );

  it(
    'disconnected — every on-air verb refuses with the link down, and each says so',
    { timeout: 60_000 },
    async () => {
      const { r, file } = await boot({ reachable: false });
      r.templateImport(TEMPLATE, HTML);
      // A LOAD is not an on-air action, so it is ACCEPTED with no server (B-082) —
      // pinned here because it is the one verb whose row must NOT read `failed`.
      expect((await r.load('item1', 'lower-third', {})).accepted).toBe(true);
      expect(await r.take('item1')).toMatchObject({ errorCode: 'disconnected' });
      expect(await r.update('item1', {}, 'merge')).toMatchObject({ errorCode: 'disconnected' });
      expect(await r.stopItem('item1')).toMatchObject({ errorCode: 'disconnected' });
      expect(await r.nextItem('item1')).toMatchObject({ errorCode: 'disconnected' });
      expect(await r.out('item1')).toMatchObject({ errorCode: 'disconnected' });

      const rows = await entriesOnDisk(file, 7);
      expect(forAction(rows, 'load')[0]).toMatchObject({ outcome: 'ok' });
      for (const action of ['take', 'update', 'stop', 'next', 'out'] as const) {
        const mine = forAction(rows, action);
        expect(mine, `one ${action} row`).toHaveLength(1);
        expect(mine[0]).toMatchObject({
          outcome: 'failed',
          errorCode: 'disconnected',
          itemId: 'item1',
        });
      }
    },
  );

  it(
    'rehearsing — the R-022 interlock refuses a take, and the refusal is the row worth having',
    { timeout: 60_000 },
    async () => {
      const { r, file } = await onAir();
      // Take it off air first: rehearse refuses a live graphic (muting air).
      expect((await r.out('item1')).accepted).toBe(true);
      expect((await r.enterRehearse('item1')).ok).toBe(true);

      expect(await r.take('item1')).toMatchObject({ accepted: false, errorCode: 'rehearsing' });

      const rows = await entriesOnDisk(file, 5);
      const takes = forAction(rows, 'take');
      // Two takes happened: the accepted one from `onAir`, and this refusal.
      expect(takes).toHaveLength(2);
      expect(takes[0]).toMatchObject({ outcome: 'ok' });
      expect(takes[1]).toMatchObject({ outcome: 'failed', errorCode: 'rehearsing' });
    },
  );

  it(
    'slot-bound / not-fixed — the exact-slot load path records its own refusals',
    { timeout: 60_000 },
    async () => {
      const file = auditPath();
      const oscPort = await freeUdpPort();
      mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 40 });
      const r = new CasparRuntime(
        singleServer(mock.amcpPort, oscPort),
        {},
        {
          auditLogPath: file,
          fixedSlots: [{ channel: 1, layer: 71 }],
        },
      );
      runtime = r;
      r.start();
      await r.startServing();
      await r.whenServerHealthy(HEALTH_MS);
      r.templateImport(TEMPLATE, HTML);

      // A coordinate outside the declared bank is not a door onto an arbitrary layer.
      expect(await r.loadFixed({ channel: 1, layer: 91 }, 'a', 'lower-third', {})).toMatchObject({
        accepted: false,
        errorCode: 'not-fixed',
      });
      // Bind the row, then try to rebind it to a DIFFERENT item.
      expect((await r.loadFixed({ channel: 1, layer: 71 }, 'a', 'lower-third', {})).accepted).toBe(
        true,
      );
      expect(await r.loadFixed({ channel: 1, layer: 71 }, 'b', 'lower-third', {})).toMatchObject({
        accepted: false,
        errorCode: 'slot-bound',
      });

      const rows = await entriesOnDisk(file, 4);
      const loads = forAction(rows, 'load');
      expect(loads).toHaveLength(3);
      /*
        Matched BY CONTENT, not by index. The first cut of this asserted
        `loads[1]` was the accepted one and CI reddened on it: appends were
        fire-and-forget, so two concurrent writes completed in either order and
        Linux put the refusal first. The writer now CHAINS its appends and the
        order is guaranteed again — but a positional assertion on a forensic log
        is a brittle way to say "these three rows exist", and the property under
        test here is the SET of refusals the fixed path owns, not their sequence.
        Ordering has its own test below, and the writer's own suite.
      */
      const byItem = (itemId: string, errorCode?: string): unknown =>
        loads.find((l) => l.itemId === itemId && l.errorCode === errorCode);
      // The refusals that return BEFORE `#loadOnto` — the reason the fixed path is
      // audited at its own entry point rather than in the shared tail.
      expect(byItem('a', 'not-fixed')).toMatchObject({
        outcome: 'failed',
        slot: { channel: 1, layer: 91 },
      });
      expect(byItem('a', undefined)).toMatchObject({ outcome: 'ok', itemId: 'a' });
      expect(byItem('b', 'slot-bound')).toMatchObject({
        outcome: 'failed',
        slot: { channel: 1, layer: 71 },
      });
    },
  );

  it(
    'TIMEOUT — a command CasparCG accepts and never answers records `timeout`, not `failed`',
    { timeout: 60_000 },
    async () => {
      /*
        The schema's third outcome, and it was unreachable until `#send` learned to
        tell `AmcpTimeoutError` from every other throw. Both readings matter to
        whoever reads the log: "it was refused" means CasparCG saw it and said no,
        "nothing came back" means it may well have executed. Flattening them sends
        the operator to check a link that is demonstrably up.
      */
      const { r, file } = await onAir();
      // From here the mock swallows every CG command: accepted, never answered.
      mock?.setHandler('CG', () => new Promise<never>(() => undefined));

      const stopped = await r.stopItem('item1');
      expect(stopped.accepted).toBe(false);
      expect(stopped.errorCode).toBe('amcp-timeout');

      const rows = await entriesOnDisk(file, 4);
      const stops = forAction(rows, 'stop');
      expect(stops).toHaveLength(1);
      expect(stops[0]).toMatchObject({ outcome: 'timeout', errorCode: 'amcp-timeout' });
    },
  );

  it(
    'remove — a FAILED clear is recorded as failed even though the response says accepted',
    { timeout: 60_000 },
    async () => {
      /*
        The one verb whose response cannot carry its own outcome. `remove` answers
        `{ accepted: true }` unconditionally and that is right for the caller — the
        row is off the stack either way. But a CLEAR that did not land leaves a
        graphic ON AIR with its row gone from every browser, which is exactly the
        state someone asks about the next day and exactly what an `ok` row denies.
      */
      const { r, file } = await onAir();
      mock?.setHandler('CLEAR', () => ({ kind: 'err' as const, code: 502, verb: 'CLEAR' }));

      // The CALLER still sees success: the contract the SPA depends on is untouched.
      expect(await r.remove('item1')).toEqual({ accepted: true });

      const rows = await entriesOnDisk(file, 4);
      const removes = forAction(rows, 'remove');
      expect(removes).toHaveLength(1);
      expect(removes[0]).toMatchObject({
        outcome: 'failed',
        errorCode: 'amcp-502',
        itemId: 'item1',
        slot: { channel: 1, layer: 10 },
      });
    },
  );
});

describe('B-141 — an audit write can never take the station off air', () => {
  it(
    'a writer that cannot write leaves every verb working, and reports through auditHealth',
    { timeout: 60_000 },
    async () => {
      /*
        The contrast with the config stores, stated as a test rather than only as a
        comment: there an unusable file IS a hard boot failure, because the file is a
        PRECONDITION for correct playout. An audit entry is a RECORD OF what
        happened; nothing downstream reads it to decide what to send, so its failure
        must degrade to "reported and retried" and never to a refused take.
      */
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-audit-bad-'));
      auditDir = dir;
      // The audit path's PARENT is a regular file, so `mkdir` — and therefore every
      // append — fails, for the whole life of the runtime.
      const blocker = path.join(dir, 'blocker');
      fs.writeFileSync(blocker, 'not a directory');
      const file = path.join(blocker, 'audit.ndjson');

      const oscPort = await freeUdpPort();
      mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 40 });
      const r = new CasparRuntime(singleServer(mock.amcpPort, oscPort), {}, { auditLogPath: file });
      runtime = r;
      r.start();
      await r.startServing();
      await r.whenServerHealthy(HEALTH_MS);
      r.templateImport(TEMPLATE, HTML);

      // The station works. Every one of these would be a black layer if a failed
      // append could refuse it.
      expect((await r.load('item1', 'lower-third', { headline: 'سلام' })).accepted).toBe(true);
      await expect(mock.waitForCgAddResolution(SLOT)).resolves.toBe('resolved');
      expect((await r.take('item1')).accepted).toBe(true);
      expect((await r.update('item1', { headline: 'دو' }, 'merge')).accepted).toBe(true);
      expect((await r.out('item1')).accepted).toBe(true);

      // …and the failure is REPORTED rather than swallowed. This is the positive
      // control the panel reads: without it, "no entries" is indistinguishable from
      // "every entry was lost".
      await delay(200);
      const health = r.auditHealth();
      expect(health.configured).toBe(true);
      expect(health.path).toBe(file);
      expect(health.errorCount).toBeGreaterThan(0);
      expect(health.lastError).not.toBeNull();

      /*
        🔴 AND THIS IS WHY THE HEALTH READ IS LOAD-BEARING RATHER THAN A NICETY.

        Nothing reached disk. What `auditRecent` then answers is PLATFORM-DEPENDENT
        and this test deliberately does not pin it: opening `<file>/audit.ndjson`
        raises `ENOENT` on Windows — which `readRecentEntries` maps to `[]` — and
        `ENOTDIR` on Linux, which it rethrows, so `auditRecent` falls through to the
        in-memory tail. The first cut asserted `[]` and reddened on CI for exactly
        that reason: it had pinned a Windows errno rather than a guarantee.

        Both readings are honest about the RECORD and neither is safe on its own —
        one looks like a quiet station, the other like a healthy log. What makes
        either safe to render is `auditHealth` above, read beside it. That is this
        repo's own rule applied to its own product: a negative observation is not a
        result until a positive control proves the instrument was live.

        So what is asserted here is the guarantee: the record on disk is EMPTY, and
        the health read says loudly why.
      */
      expect(fs.existsSync(file)).toBe(false);
      expect(health.errorCount).toBeGreaterThanOrEqual(5);
    },
  );

  it(
    'with NO writer configured, auditHealth says so — the panel can tell "no record" from "no entries"',
    { timeout: 60_000 },
    async () => {
      const oscPort = await freeUdpPort();
      const r = new CasparRuntime(singleServer(await freeUdpPort(), oscPort));
      runtime = r;
      const health = r.auditHealth();
      expect(health).toEqual({ configured: false, path: null, errorCount: 0, lastError: null });
    },
  );
});

describe('B-141 — a REDELIVERY is not an operator import', () => {
  it(
    'the SPA replaying its library after a reconnect writes no rows',
    { timeout: 60_000 },
    async () => {
      const { r, file } = await boot({ reachable: true });
      // The operator's import: one row.
      r.templateImport(TEMPLATE, HTML);
      // Three redeliveries — what a resync does on every reconnect. A log that has to
      // be scrolled past is a log that stops being read.
      r.templateImport(TEMPLATE, HTML, true);
      r.templateImport(TEMPLATE, HTML, true);
      r.templateImport(TEMPLATE, HTML, true);

      const rows = await entriesOnDisk(file, 1);
      expect(forAction(rows, 'import')).toHaveLength(1);
    },
  );
});
