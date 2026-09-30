import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  PlayoutInputsStateSchema,
  inputSourceId,
  mediaSourceId,
  parsePlayoutMediaPage,
} from '@cg/shared-ipc';
import {
  HttpPlayoutSources,
  PICKER_FRESH_MS,
  PlayoutSources,
  SOURCES_POLL_MS,
} from '../src/playout-sources.js';
import { track } from './support/harness.js';
import {
  FAKE_MEDIA_COUNT,
  FAKE_MEDIA_IDS,
  startFakePlayout,
  type FakePlayout,
} from './support/fake-playout.js';
import { openClient, startAuthedBridge, waitFor } from './support/auth-harness.js';

/**
 * 🔴 `PLAYOUT-SOURCES-01` §4 — **D10 AND D11 OVER HTTP, against the fake Playout.**
 *
 * What only a real socket can show: the `ETag` round trip, the `404` of a Playout whose CG Control
 * is switched off, the cadence, the search normalisation and the keyset paging — the fake answers
 * as their answer describes (`fake-playout.ts`), and the bridge's own HTTP reader asks.
 */

const dirs: string[] = [];
const readers: PlayoutSources[] = [];

afterEach(() => {
  for (const r of readers.splice(0)) r.dispose();
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir !== undefined) fs.rmSync(dir, { recursive: true, force: true });
  }
});

function tmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-playout-http-'));
  dirs.push(dir);
  return dir;
}

async function fakePlayout(): Promise<FakePlayout> {
  return track(await startFakePlayout(), (p) => p.stop());
}

function httpProvider(playout: FakePlayout): HttpPlayoutSources {
  // D10 and D11 check only that a bearer is present; the bridge's is the signed-in operator's.
  return new HttpPlayoutSources(
    { inputsUrl: playout.inputsUrl, mediaUrl: playout.mediaUrl },
    () => 'test-bearer',
  );
}

function reader(
  playout: FakePlayout,
  options: { inputsPath?: string; boundMediaPath?: string; clock?: { now: number } } = {},
): PlayoutSources {
  const clock = options.clock;
  const r = new PlayoutSources({
    provider: httpProvider(playout),
    signedIn: () => true,
    hostIsOurs: () => true,
    channelFor: (_h, c) => c,
    inputsPath: options.inputsPath,
    boundMediaPath: options.boundMediaPath,
    ...(clock !== undefined ? { now: () => clock.now } : {}),
    log: () => undefined,
  });
  readers.push(r);
  return r;
}

describe('D10 over HTTP', () => {
  it('reads the list, keeps the Playout’s order, and marks unusable what cannot be bound', async () => {
    const playout = await fakePlayout();
    const r = reader(playout);
    await r.refresh(0);
    const names = r.catalog().sources.map((s) => s.name);
    expect(names).toEqual([
      'Studio 1',
      'دوربین خبر',
      'Multicast',
      'ورودی ۳',
      'ورودی ۴',
      'RIST feed',
      // `PLAYOUT-FEATURES-01` C — `2.9.2`'s playlist outputs, after the live inputs, as the Playout lists them.
      'خروجیِ پخش: آپاسای',
      'خروجیِ پخش: کانال دوم (تست CG)',
    ]);
    expect(r.catalog().sources.find((s) => s.name === 'RIST feed')?.status).toBe('unusable');
    expect(playout.requestCounts.inputs).toBe(1);
  });

  it('🔴 a `304` changes no entry, and the `ETag` is sent back', async () => {
    const playout = await fakePlayout();
    const clock = { now: 1_000_000 };
    const r = reader(playout, { clock });
    await r.refresh(0);
    const before = JSON.stringify(r.catalog().sources);
    clock.now += SOURCES_POLL_MS;
    await r.refresh(SOURCES_POLL_MS);
    // Positive control: the second read DID happen, and carried the ETag.
    expect(playout.requestCounts.inputs).toBe(2);
    const last = playout.requestLog.filter((q) => q.path === '/api/cg/inputs').at(-1);
    expect(last?.headers['if-none-match']).toBe('"inputs-0"');
    expect(JSON.stringify(r.catalog().sources)).toBe(before);
  });

  it('🔴 `404` — CG Control switched off on the Playout — is a failed read and changes nothing', async () => {
    const dir = tmpDir();
    const inputsPath = path.join(dir, 'inputs.json');
    const playout = await fakePlayout();
    const clock = { now: 1_000_000 };
    const r = reader(playout, { inputsPath, clock });
    await r.refresh(0);
    const catalogBefore = JSON.stringify(r.catalog());
    const fileBefore = fs.readFileSync(inputsPath, 'utf8');

    playout.setCgEnabled(false);
    playout.removeInput('li-studio1');
    clock.now += SOURCES_POLL_MS;
    await r.refresh(SOURCES_POLL_MS);
    expect(playout.requestCounts.inputs).toBe(2); // the read was made …
    expect(JSON.stringify(r.catalog())).toBe(catalogBefore); // … and changed nothing
    expect(fs.readFileSync(inputsPath, 'utf8')).toBe(fileBefore);

    // Control: a `200` without the input marks it unavailable.
    playout.setCgEnabled(true);
    clock.now += SOURCES_POLL_MS;
    await r.refresh(SOURCES_POLL_MS);
    expect(r.catalog().sources.find((s) => s.id === inputSourceId('li-studio1'))).toMatchObject({
      status: 'unavailable',
      departed: true,
    });
  });

  it('v1.3 — a D10 without `epoch` keeps all its inputs; with one, it is stored', async () => {
    const dir = tmpDir();
    const inputsPath = path.join(dir, 'inputs.json');
    const playout = await fakePlayout();
    playout.setEpoch(null);
    const r = reader(playout, { inputsPath });
    await r.refresh(0);
    // Six live inputs and, since `PLAYOUT-FEATURES-01` C, the two playlist outputs.
    expect(r.catalog().sources).toHaveLength(8);
    expect(
      PlayoutInputsStateSchema.parse(JSON.parse(fs.readFileSync(inputsPath, 'utf8'))).epoch,
    ).toBeUndefined();
    // Control: an `epoch` is stored — `ROUTE-PLATES-01`: as its decimal STRING. It is a 64-bit
    // integer (V13-STATE §3.3), and a JSON number past 2^53 would be rounded on the way in, so two
    // different epochs could compare equal.
    playout.setEpoch(42);
    await r.refresh(0);
    expect(
      PlayoutInputsStateSchema.parse(JSON.parse(fs.readFileSync(inputsPath, 'utf8'))).epoch,
    ).toBe('42');
  });

  it('🔴 `ROUTE-PLATES-01` — a 64-bit epoch arrives digit for digit over HTTP, and the next one is different', async () => {
    const dir = tmpDir();
    const inputsPath = path.join(dir, 'inputs.json');
    const playout = await fakePlayout();
    // A real core's epoch: past 2^53, where `JSON.parse` rounds to …9000.
    playout.setEpochLiteral('638954123456789013');
    const r = reader(playout, { inputsPath });
    await r.refresh(0);
    expect(r.catalog().inputsEpoch).toBe('638954123456789013');
    expect(
      PlayoutInputsStateSchema.parse(JSON.parse(fs.readFileSync(inputsPath, 'utf8'))).epoch,
    ).toBe('638954123456789013');
    // The core restarts: the next epoch differs in the last digit only — and is seen to.
    expect(playout.simulateCoreRestart()).toBe('638954123456789014');
    await r.refresh(0);
    expect(r.catalog().inputsEpoch).toBe('638954123456789014');
  });

  it('🔴 a restart while the Playout is down keeps the persisted list in force', async () => {
    const dir = tmpDir();
    const inputsPath = path.join(dir, 'inputs.json');
    const playout = await fakePlayout();
    const first = reader(playout, { inputsPath });
    await first.refresh(0);
    first.dispose();

    await playout.goOffline();
    const second = reader(playout, { inputsPath });
    await second.refresh(0);
    const studio = second.catalog().sources.find((s) => s.id === inputSourceId('li-studio1'));
    expect(studio?.status).toBeUndefined();
    expect(studio?.producer).toEqual({ kind: 'ndi', source: 'STUDIO-PC (Cam 1)' });
    expect(second.catalog().inputsReadAt).toBeDefined();
  });

  it('the cadence: a picker opening reads again only after 5 s; the tick only after 30 s', async () => {
    const playout = await fakePlayout();
    const clock = { now: 1_000_000 };
    const r = reader(playout, { clock });
    await r.refresh(0);
    expect(playout.requestCounts.inputs).toBe(1); // positive control
    clock.now += PICKER_FRESH_MS - 1;
    await r.refresh(PICKER_FRESH_MS);
    expect(playout.requestCounts.inputs).toBe(1);
    clock.now += 1;
    await r.refresh(PICKER_FRESH_MS);
    expect(playout.requestCounts.inputs).toBe(2);
    clock.now += SOURCES_POLL_MS - 1;
    await r.refresh(SOURCES_POLL_MS);
    expect(playout.requestCounts.inputs).toBe(2);
  });
});

describe('D11 over HTTP', () => {
  it('asks `type=video,still`, 50 a page, and never receives audio', async () => {
    const playout = await fakePlayout();
    const r = reader(playout);
    const answer = await r.searchMedia({ q: '' });
    if (!answer.ok) throw new Error(answer.message);
    expect(answer.items).toHaveLength(50);
    const asked = new URLSearchParams(playout.mediaQueries.at(-1));
    expect(asked.get('type')).toBe('video,still');
    expect(asked.get('limit')).toBe('50');
    // The answer the console gets carries no path: the bridge keeps the clip.
    expect(JSON.stringify(answer)).not.toContain('C:/');
    expect(answer.items.every((i) => i.id.startsWith('md-'))).toBe(true);
  });

  it('🔴 normalisation end to end: `كليپ` finds `کلیپ`, and `خبر 1405` finds `خبر ۱۴۰۵`', async () => {
    const playout = await fakePlayout();
    const r = reader(playout);
    const kelip = await r.searchMedia({ q: 'كليپ' });
    const khabar = await r.searchMedia({ q: 'خبر 1405' });
    if (!kelip.ok || !khabar.ok) throw new Error('search failed');
    expect(kelip.items.map((i) => i.name)).toEqual(
      expect.arrayContaining(['کلیپ معرفی', 'كليپ خبري']),
    );
    expect(khabar.items.map((i) => i.id)).toContain(mediaSourceId(FAKE_MEDIA_IDS.khabar1405));
    // Control: a term that matches nothing returns no items.
    const none = await r.searchMedia({ q: 'zzzz-nothing-matches' });
    expect(none).toMatchObject({ ok: true, items: [], total: 0, nextCursor: null });
  });

  it('🔴 paging to the end loads every video once, with no repeated id — and a stale cursor gets the fake’s 400', async () => {
    const playout = await fakePlayout();
    const r = reader(playout);
    const seen = new Set<string>();
    let cursor: string | undefined;
    let total = -1;
    let pages = 0;
    for (;;) {
      const page = await r.searchMedia({ q: '', ...(cursor !== undefined ? { cursor } : {}) });
      if (!page.ok) throw new Error(page.message);
      total = page.total;
      for (const item of page.items) {
        expect(seen.has(item.id), item.id).toBe(false);
        seen.add(item.id);
      }
      pages += 1;
      if (page.nextCursor === null) break;
      cursor = page.nextCursor;
    }
    expect(seen.size).toBe(total);
    expect(total).toBeLessThan(FAKE_MEDIA_COUNT); // the audio items were never offered
    expect(pages).toBe(Math.ceil(total / 50));

    // Control: a cursor from one query sent with another is the fake's `400`.
    const first = await r.searchMedia({ q: 'News' });
    if (!first.ok || first.nextCursor === null) throw new Error('expected a second page');
    const stale = await r.searchMedia({ q: 'Promo', cursor: first.nextCursor });
    expect(stale).toMatchObject({ ok: false, reason: 'playout-refused' });
  });

  it('`ids=` answers in request order, and the parse drops what a plate cannot show', async () => {
    const playout = await fakePlayout();
    const res = await fetch(
      `${playout.mediaUrl}?ids=${FAKE_MEDIA_IDS.titraj20},${FAKE_MEDIA_IDS.studio1},m-00000003`,
      { headers: { Authorization: 'Bearer x' } },
    );
    const body: unknown = await res.json();
    const raw = (body as { items: { id: string; type: string }[] }).items;
    expect(raw.map((i) => i.id)).toEqual([
      FAKE_MEDIA_IDS.titraj20,
      FAKE_MEDIA_IDS.studio1,
      'm-00000003',
    ]);
    // `m-00000003` is audio (every seventh item from the fourth), and the bridge's parse drops it.
    expect(raw[2]?.type).toBe('audio');
    expect(parsePlayoutMediaPage(body)?.items.map((i) => i.id)).toEqual([
      FAKE_MEDIA_IDS.titraj20,
      FAKE_MEDIA_IDS.studio1,
    ]);
  });
});

describe('the bridge’s routes, as a console reaches them', () => {
  it('🔴 `sources.media-search` answers a VIEWER, and its answer carries no clip', async () => {
    const { handle, playout } = await startAuthedBridge();
    track(handle, (h) => h.close());
    const viewer = await playout.issueToken({ user: 'viewer' });
    const client = await openClient(handle);
    expect((await client.authenticate('a1', viewer.token)).error).toBeUndefined();
    const answer = await client.ask('s1', 'sources.media-search', { q: 'Studio' });
    expect(answer.error).toBeUndefined();
    const payload = answer.payload as { ok: boolean; items: { id: string; name: string }[] };
    expect(payload.ok).toBe(true);
    expect(payload.items).toContainEqual(
      expect.objectContaining({ id: mediaSourceId(FAKE_MEDIA_IDS.studio1), name: 'Studio 1' }),
    );
    expect(JSON.stringify(payload)).not.toContain('clip');
    expect(JSON.stringify(payload)).not.toContain('C:/');
  });

  it('🔴 the bridge’s data wins: a bind that carries its own `clip` is ignored; the bridge’s read decides', async () => {
    const { handle, playout } = await startAuthedBridge();
    track(handle, (h) => h.close());
    const admin = await playout.issueToken({ user: 'admin' });
    const client = await openClient(handle);
    expect((await client.authenticate('a1', admin.token)).error).toBeUndefined();
    const ps = handle.playoutSources;
    if (ps === null) throw new Error('no reader');
    await ps.refresh(0);
    await waitFor(() => ps.catalog().sources.length > 0);

    const bound = await client.ask('b1', 'sources.set-assignments', {
      assignments: [
        {
          templateId: 'tpl-1',
          plateId: 'guest-1',
          sourceId: mediaSourceId(FAKE_MEDIA_IDS.studio1),
          // A hand-crafted field the console never sends — stripped, and never believed.
          clip: 'C:/elsewhere/not-this.mov',
        },
      ],
    });
    expect(bound.payload).toMatchObject({ ok: true });
    const entry = ps.catalog().sources.find((s) => s.id === mediaSourceId(FAKE_MEDIA_IDS.studio1));
    // Control: the path is the one the fake Playout gave for that id.
    expect(entry?.producer).toEqual({
      kind: 'media',
      file: playout.mediaItem(FAKE_MEDIA_IDS.studio1)?.clip,
    });
    expect(JSON.stringify(ps.catalog())).not.toContain('not-this.mov');
  });

  it('`sources.refresh` answers at once, and the read it asked for arrives by itself — never sooner than 5 s after the last', async () => {
    const clock = { now: 1_000_000 };
    const { handle, playout } = await startAuthedBridge({
      playoutSourcesOptions: { now: () => clock.now },
    });
    track(handle, (h) => h.close());
    const viewer = await playout.issueToken({ user: 'viewer' });
    const client = await openClient(handle);
    expect((await client.authenticate('a1', viewer.token)).error).toBeUndefined();
    // The sign-in's own read (positive control: the instrument counts).
    await waitFor(() => playout.requestCounts.inputs === 1);

    // Inside 5 s of it, a picker opening asks and nothing is read.
    expect((await client.ask('r1', 'sources.refresh')).payload).toEqual({ ok: true });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(playout.requestCounts.inputs).toBe(1);

    // After 5 s, the same request reads — and it answered before the read did.
    clock.now += 5_000;
    expect((await client.ask('r2', 'sources.refresh')).payload).toEqual({ ok: true });
    await waitFor(() => playout.requestCounts.inputs === 2);
  });
});
