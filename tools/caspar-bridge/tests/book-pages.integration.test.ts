import * as dgram from 'node:dgram';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { createMock, type MockHandle } from '@cg/amcp-mock';
import type { ConnectionConfig, TemplateInfo } from '@cg/shared-ipc';
import { retainedFromStackItem } from '@cg/shared-schema';
import { CasparRuntime } from '../src/caspar-runtime.js';
import { HEALTH_MS, TEST_LAYER_POLICY } from './support/harness.js';
import { recvLines as readWireLines } from './support/wire-trace.js';
import { pngBytes } from './support/pictures.js';

/**
 * `R-100` — **A BOOK ON A ROW**, end to end through the bridge and the AMCP mock: the pictures are
 * stored by hash, the page number is the bridge's, a page turn on a page that is on its layer is ONE
 * `CG UPDATE` carrying exactly the page asked for, a row with nothing on its layer changes state
 * only, a take carries the page, and the book survives a restart and leaves with its row.
 */

let mock: MockHandle | null = null;
let runtime: CasparRuntime | null = null;
let tracePath: string | null = null;
let pagesDir: string | null = null;

afterEach(async () => {
  await runtime?.stop();
  runtime = null;
  await mock?.stop();
  mock = null;
  if (tracePath !== null && fs.existsSync(tracePath)) fs.rmSync(tracePath);
  tracePath = null;
  if (pagesDir !== null) fs.rmSync(pagesDir, { recursive: true, force: true });
  pagesDir = null;
  if (auditFile !== null && fs.existsSync(auditFile)) fs.rmSync(auditFile);
  auditFile = null;
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

const BOOK: TemplateInfo = {
  templateId: 'book',
  templateType: 'custom',
  fields: [
    { id: 'pages', label: 'Pages', required: false, type: 'list', default: [], pages: true },
  ],
  pageLists: [{ fieldId: 'pages', wrap: false }],
};
const HTML = '<!doctype html><html><head><meta charset="utf-8"></head><body>کتاب</body></html>';

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
async function waitFor(cond: () => boolean, timeoutMs: number, what: string): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!cond()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await delay(25);
  }
}

/** The wire lines since `from`, with AMCP's escaping undone so a payload reads as JSON. */
async function linesSince(from: number): Promise<string[]> {
  await mock!.traceFlush();
  return readWireLines(tracePath!)
    .slice(from)
    .map((l) => l.replace(/\\"/g, '"'));
}
async function lineCount(): Promise<number> {
  await mock!.traceFlush();
  return readWireLines(tracePath!).length;
}

let auditFile: string | null = null;

async function boot(): Promise<CasparRuntime> {
  tracePath = path.join(os.tmpdir(), `cg-book-${String(process.pid)}-${String(Date.now())}.ndjson`);
  pagesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-book-pages-'));
  const oscPort = await freeUdpPort();
  mock = await createMock({ amcpPort: 0, oscPort, oscHost: '127.0.0.1', oscHz: 40, tracePath });
  const config: ConnectionConfig = {
    servers: { A: { host: '127.0.0.1', amcpPort: mock.amcpPort, oscPort } },
    strategy: 'mirror-sync',
    autoFailoverEnabled: true,
  };
  auditFile = path.join(
    pagesDir,
    '..',
    `cg-book-audit-${String(process.pid)}-${String(Date.now())}.ndjson`,
  );
  const r = new CasparRuntime(
    config,
    {},
    { layerPolicy: TEST_LAYER_POLICY, pagesDir, auditLogPath: auditFile },
  );
  runtime = r;
  r.start();
  await r.startServing();
  r.templateImport(BOOK, HTML);
  await r.whenServerHealthy(HEALTH_MS);
  return r;
}

/** Store `count` distinct pictures and answer the page list naming them. */
async function storeBook(
  r: CasparRuntime,
  count: number,
): Promise<{ id: string; kind: 'image'; media: string; name: string }[]> {
  const list = [];
  for (let i = 1; i <= count; i += 1) {
    const put = await r.putPage(`page${String(i)}.png`, pngBytes(1920, 1080, i).toString('base64'));
    if (!put.accepted || put.sha256 === undefined) throw new Error(put.message);
    list.push({
      id: `${String(i)}-${put.sha256.slice(0, 12)}`,
      kind: 'image' as const,
      media: put.sha256,
      name: `page${String(i)}.png`,
    });
  }
  return list;
}

/** The row's own layer — never assumed (the template type decides it). */
const slotOf = (r: CasparRuntime, itemId: string): { channel: number; layer: number } => {
  const slot = r.stackSnapshot().find((i) => i.itemId === itemId)?.slot;
  if (slot === undefined) throw new Error(`no slot for ${itemId}`);
  return slot;
};
const cg = (r: CasparRuntime, itemId: string): string => {
  const s = slotOf(r, itemId);
  return `CG ${String(s.channel)}-${String(s.layer)}`;
};

const pagesOf = (r: CasparRuntime, itemId: string): Record<string, number> | undefined =>
  r.stackSnapshot().find((i) => i.itemId === itemId)?.pages;

it('🔴 a page turn on air is ONE CG UPDATE carrying exactly the page asked for', async () => {
  const r = await boot();
  const book = await storeBook(r, 5);
  expect((await r.load('item1', 'book', { pages: book })).accepted).toBe(true);
  await expect(mock!.waitForCgAddResolution(slotOf(r, 'item1'))).resolves.toBe('resolved');
  expect((await r.take('item1')).accepted).toBe(true);
  const before = await lineCount();

  expect(await r.pageItem('item1', 'pages', 'next')).toEqual({ accepted: true, page: 2, count: 5 });

  const sent = await linesSince(before);
  expect(sent).toHaveLength(1);
  expect(sent[0]?.startsWith(`${cg(r, 'item1')} UPDATE 0 `)).toBe(true);
  expect(sent[0]).toContain('"page":{"field":"pages","index":1');
  // Exactly page 2's picture travels — no other page, and no PLAY / ADD / CLEAR.
  expect(sent[0]).toContain(`"${book[1]!.media}":"data:image/png;base64,`);
  for (const other of [book[0]!, book[2]!, book[3]!, book[4]!])
    expect(sent[0]).not.toContain(other.media);
  expect(pagesOf(r, 'item1')).toEqual({ pages: 1 });

  // The audit record: ONE `page-turn` row, `ok`, naming the item (the audit census names it).
  const deadline = Date.now() + 4000;
  let turns: { action: string; outcome?: string; itemId?: string }[] = [];
  while (Date.now() < deadline) {
    turns = fs
      .readFileSync(auditFile!, 'utf-8')
      .split('\n')
      .filter((l) => l.length > 0)
      .map((l) => JSON.parse(l) as { action: string; outcome?: string; itemId?: string })
      .filter((e) => e.action === 'page-turn');
    if (turns.length > 0) break;
    await delay(20);
  }
  expect(turns).toHaveLength(1);
  expect(turns[0]).toMatchObject({ outcome: 'ok', itemId: 'item1' });
}, 40_000);

it('🔴 a book stops at its ends, and Go to takes the operator’s page number', async () => {
  const r = await boot();
  const book = await storeBook(r, 3);
  expect((await r.load('item1', 'book', { pages: book })).accepted).toBe(true);
  expect(await r.pageItem('item1', 'pages', 'previous')).toMatchObject({ page: 1 });
  expect(await r.pageItem('item1', 'pages', 3)).toMatchObject({ page: 3 });
  expect(await r.pageItem('item1', 'pages', 'next')).toMatchObject({ page: 3 });
  expect(await r.pageItem('item1', 'pages', 99)).toMatchObject({ page: 3 });
}, 40_000);

/** The page index each `CG UPDATE` since `from` told the page, in wire order. */
async function toldIndexes(from: number): Promise<number[]> {
  return (await linesSince(from)).flatMap((l) => {
    const m = /"page":\{"field":"pages","index":(\d+)/.exec(l);
    return m === null ? [] : [Number(m[1])];
  });
}

it('🔴 ten Next presses at once turn ten pages, in order — not one is lost', async () => {
  // Measured on CasparCG 2.5.0 (IMAGE-PAGES-01): unqueued, all ten read page 1 and answered page 2.
  const r = await boot();
  const book = await storeBook(r, 12);
  expect((await r.load('item1', 'book', { pages: book })).accepted).toBe(true);
  await expect(mock!.waitForCgAddResolution(slotOf(r, 'item1'))).resolves.toBe('resolved');
  expect((await r.take('item1')).accepted).toBe(true);
  const before = await lineCount();

  const answers = await Promise.all(
    Array.from({ length: 10 }, () => r.pageItem('item1', 'pages', 'next')),
  );

  expect(answers.map((a) => a.page)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  expect(pagesOf(r, 'item1')).toEqual({ pages: 10 });
  expect(await toldIndexes(before)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
}, 40_000);

it('🔴 a new book applied during a page turn waits for it: the page and the book agree', async () => {
  const r = await boot();
  const book = await storeBook(r, 6);
  expect((await r.load('item1', 'book', { pages: book })).accepted).toBe(true);
  await expect(mock!.waitForCgAddResolution(slotOf(r, 'item1'))).resolves.toBe('resolved');
  expect((await r.take('item1')).accepted).toBe(true);
  await r.pageItem('item1', 'pages', 5);
  const before = await lineCount();

  const [turn, update] = await Promise.all([
    r.pageItem('item1', 'pages', 'next'),
    r.update('item1', { pages: book.slice(0, 3) }, 'merge'),
  ]);

  expect(turn).toMatchObject({ accepted: true, page: 6 });
  expect(update.accepted).toBe(true);
  // The new book has three pages, so the row is on page 1 — and the LAST thing the page was told
  // says so too.
  expect(pagesOf(r, 'item1')).toEqual({ pages: 0 });
  expect((await toldIndexes(before)).at(-1)).toBe(0);
}, 40_000);

it('🔴 golden rule 10 — a row with nothing on its layer changes state only: nothing is sent', async () => {
  const r = await boot();
  const book = await storeBook(r, 4);
  expect((await r.load('item1', 'book', { pages: book })).accepted).toBe(true);
  expect((await r.take('item1')).accepted).toBe(true);
  expect((await r.out('item1')).accepted).toBe(true); // the producer is destroyed
  const before = await lineCount();

  expect(await r.pageItem('item1', 'pages', 3)).toEqual({ accepted: true, page: 3, count: 4 });

  expect(await linesSince(before)).toEqual([]);
  expect(pagesOf(r, 'item1')).toEqual({ pages: 2 });

  // …and the NEXT TAKE carries it: the rebuilt page opens on page 3, with page 3's picture.
  const beforeTake = await lineCount();
  expect((await r.take('item1')).accepted).toBe(true);
  const add = (await linesSince(beforeTake)).find((l) => l.startsWith(`${cg(r, 'item1')} ADD`));
  expect(add).toContain('"page":{"field":"pages","index":2');
  expect(add).toContain(book[2]!.media);
}, 40_000);

it('🔴 a page list naming a picture the bridge does not hold is refused, in the operator’s words', async () => {
  const r = await boot();
  const book = await storeBook(r, 2);
  expect((await r.load('item1', 'book', { pages: book })).accepted).toBe(true);
  const ghost = { id: 'x', kind: 'image', media: 'e'.repeat(64), name: 'lost-page.png' };
  expect(await r.update('item1', { pages: [...book, ghost] }, 'merge')).toEqual({
    accepted: false,
    errorCode: 'page-missing',
    message: 'lost-page.png is not on CG Bridge any more. Load the pages again.',
  });
  expect(
    await r.update('item1', { pages: Array.from({ length: 501 }, () => book[0]!) }, 'merge'),
  ).toMatchObject({
    accepted: false,
    errorCode: 'page-too-many',
  });
}, 40_000);

it('🔴 a new, shorter book on air goes to page 1, told in the same command as the book', async () => {
  const r = await boot();
  const book = await storeBook(r, 6);
  expect((await r.load('item1', 'book', { pages: book })).accepted).toBe(true);
  expect((await r.take('item1')).accepted).toBe(true);
  await r.pageItem('item1', 'pages', 5);
  const before = await lineCount();

  expect((await r.update('item1', { pages: book.slice(0, 3) }, 'merge')).accepted).toBe(true);

  const sent = await linesSince(before);
  expect(sent).toHaveLength(1);
  expect(sent[0]).toContain('"page":{"field":"pages","index":0');
  expect(pagesOf(r, 'item1')).toEqual({ pages: 0 });
}, 40_000);

it('🔴 the page number survives a restart, and the book leaves with its row', async () => {
  const r = await boot();
  const book = await storeBook(r, 3);
  expect((await r.load('item1', 'book', { pages: book })).accepted).toBe(true);
  await r.pageItem('item1', 'pages', 2);
  const retained = r.stackSnapshot().map(retainedFromStackItem);
  expect(retained[0]?.pages).toEqual({ pages: 1 });

  // A restarted bridge over the same store: the row comes back on page 2, its pictures on disk.
  await r.stop();
  runtime = null;
  const again = new CasparRuntime(
    {
      servers: { A: { host: '127.0.0.1', amcpPort: mock!.amcpPort, oscPort: await freeUdpPort() } },
      strategy: 'mirror-sync',
      autoFailoverEnabled: true,
    },
    {},
    { layerPolicy: TEST_LAYER_POLICY, pagesDir: pagesDir! },
  );
  runtime = again;
  again.templateImport(BOOK, HTML);
  await again.restore(retained);
  expect(pagesOf(again, 'item1')).toEqual({ pages: 1 });
  expect(fs.readdirSync(pagesDir!)).toHaveLength(3);

  // Removed: the row's pictures go with it (no other row names them).
  expect((await again.remove('item1')).accepted).toBe(true);
  await waitFor(() => fs.readdirSync(pagesDir!).length === 0, 5000, 'the book is swept');
}, 40_000);
