import * as fs from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  authzChannelRefusal,
  type SourceAssignments,
  type SourceCatalog,
  type TemplateInfo,
} from '@cg/shared-ipc';
import type { BridgeHandle } from '../src/index.js';
import { createBridge } from '../src/index.js';
import { isRegistryRecordName, registryRecordFileName } from '../src/template-registry.js';
import {
  deadConnection,
  expectRefusedWith,
  openClient,
  type Client,
} from './support/auth-harness.js';
import {
  startFakePlayout,
  type FakePlayout,
  type IssueTokenOptions,
} from './support/fake-playout.js';
import { track } from './support/harness.js';
import {
  standardBank,
  twoChannelRig,
  waitUntil,
  type TwoChannelRig,
} from './support/two-channel-rig.js';

/**
 * 🔴 `CHANNEL-TEMPLATES-01` (the owner, 2026-09-28) — **EACH CHANNEL HAS ITS OWN TEMPLATE LIST.**
 *
 * Each channel is its own programme with its own operator, who holds only that channel. So an
 * import, a re-import and a removal act on the current channel's list only, over one shared store
 * of versions: a version is stored once however many channels list it, and it is removed only when
 * no channel lists it and no row holds it. Every action needs the current channel in the grant and
 * nothing else; a page on air is never touched by any of it.
 *
 * The station declares channels 1 and 2 on a loopback AMCP fake. The operator is the fake
 * Playout's `cg-op-ch2` — the OPERATOR role, granted channel 2 only. Every property sits beside
 * its control on the same socket.
 */

const CATALOG: SourceCatalog = {
  sources: [
    { id: 'src-a', name: 'Studio A', format: '1080i5000', producer: { kind: 'route', channel: 3 } },
  ],
  layerRange: { start: 60, end: 79 },
};

/** The package both channels import: one template, one plate default per channel. */
const NEWS: TemplateInfo = { templateId: 'news', templateType: 'lower-third', fields: [] };
const NEWS_V1 = '<!doctype html><html><head><meta charset="utf-8"></head><body>خبر ۱</body></html>';
const NEWS_V2 = '<!doctype html><html><head><meta charset="utf-8"></head><body>خبر ۲</body></html>';

const DEFAULTS: SourceAssignments = {
  assignments: [
    { channel: 1, templateId: 'news', plateId: 'guest-1', sourceId: 'src-a' },
    { channel: 2, templateId: 'news', plateId: 'guest-1', sourceId: 'src-a' },
  ],
};

const CH2_OPERATOR: IssueTokenOptions = { user: 'channelTwo' };

function get(url: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        let body = '';
        res.setEncoding('utf-8');
        res.on('data', (c: string) => (body += c));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
      })
      .on('error', reject);
  });
}

function tmpTemplatesDir(): string {
  const root = track(fs.mkdtempSync(path.join(os.tmpdir(), 'cg-channel-templates-')), (d) =>
    fs.rmSync(d, { recursive: true, force: true }),
  );
  return path.join(root, 'templates');
}

const records = (dir: string): string[] =>
  fs.existsSync(dir) ? fs.readdirSync(dir).filter(isRegistryRecordName).sort() : [];

interface Station {
  readonly rig: TwoChannelRig;
  readonly handle: BridgeHandle;
  readonly playout: FakePlayout;
  readonly templatesDir: string;
  signedIn(options: IssueTokenOptions): Promise<Client>;
}

/** A two-channel station with auth ON, a templates dir, and each channel's Source default. */
async function station(): Promise<Station> {
  const playout = track(await startFakePlayout(), (p) => p.stop());
  const templatesDir = tmpTemplatesDir();
  const rig = await twoChannelRig({
    bridge: {
      templatesDir,
      sourceCatalog: CATALOG,
      sourceAssignments: DEFAULTS,
      playout: {
        auth: 'playout',
        issuer: playout.issuer,
        jwksUrl: playout.jwksUrl,
        tokenUrl: playout.tokenUrl,
        refreshUrl: playout.refreshUrl,
        revokedUrl: playout.revokedUrl,
      },
    },
  });
  const handle = rig.handle;
  return {
    rig,
    handle,
    playout,
    templatesDir,
    async signedIn(options) {
      const client = await openClient(handle);
      const issued = await playout.issueToken(options);
      const res = await client.authenticate(`auth-${String(Math.random())}`, issued.token);
      if (res.error !== undefined) throw new Error(`fixture token rejected: ${res.error}`);
      return client;
    },
  };
}

/** Put `news` on air on CH 1's layer 99 (channel 1's own version), and answer its served URL. */
async function newsOnAirOnChannelOne(s: Station): Promise<string> {
  const rt = s.handle.runtime;
  expect(rt.templateImport(NEWS, NEWS_V1, 1).registered).toBe(true);
  expect(await rt.loadFixed({ channel: 1, layer: 99 }, 'row-ch1', 'news', {})).toEqual({
    accepted: true,
  });
  expect((await rt.take('row-ch1')).accepted).toBe(true);
  await waitUntil(async () => (await s.rig.lines()).includes('CG 1-99 PLAY 0'), 'the take');
  const add = s.rig.mock.lastCgAdd({ channel: 1, layer: 99 });
  if (add === undefined) throw new Error('no CG ADD reached 1-99');
  return add.template.split('?')[0] ?? '';
}

const listOn = async (client: Client, channel: number): Promise<string[]> =>
  (
    (await client.ask(`l-${String(Math.random())}`, 'templates.list', { channel }))
      .payload as TemplateInfo[]
  ).map((t) => t.templateId);

describe('CHANNEL-TEMPLATES-01 — an operator holding CH 2 only acts on CH 2 and needs nothing else', () => {
  it('🔴 imports, re-imports and removes on CH 2, never refused — CH 1’s list, row, defaults and on-air page are unchanged; control: the same acts on CH 1 are refused by the fence', async () => {
    const s = await station();
    const rt = s.handle.runtime;
    const onAirUrl = await newsOnAirOnChannelOne(s);
    const pageBefore = await get(onAirUrl);
    expect(pageBefore).toEqual({ status: 200, body: NEWS_V1 });
    const rowOf = (): unknown => {
      const row = rt.stackSnapshot().find((i) => i.itemId === 'row-ch1');
      return row === undefined
        ? undefined
        : { templateId: row.templateId, status: row.status, slot: row.slot, fields: row.fields };
    };
    const rowBefore = rowOf();
    expect(rowBefore).toMatchObject({ templateId: 'news', status: 'on-air' });
    const defaultsBefore = rt.sourceAssignments();
    const op = await s.signedIn(CH2_OPERATOR);

    // Import on CH 2.
    const imported = await op.ask('i', 'templates.import', {
      template: NEWS,
      html: NEWS_V1,
      channel: 2,
    });
    expect(imported.error, 'the CH 2 operator was refused an import on CH 2').toBeUndefined();
    expect(await listOn(op, 2)).toContain('news');
    // Re-import on CH 2: a new version for CH 2 alone.
    const reimported = await op.ask('r', 'templates.import', {
      template: NEWS,
      html: NEWS_V2,
      channel: 2,
    });
    expect(reimported.error, 'the CH 2 operator was refused a re-import on CH 2').toBeUndefined();
    expect(rt.templateHtml('news', 2)).toBe(NEWS_V2);
    expect(rt.templateHtml('news', 1), 'CH 1 moved with CH 2').toBe(NEWS_V1);
    // Remove from CH 2.
    const removed = await op.ask('d', 'templates.remove', { templateId: 'news', channel: 2 });
    expect(removed.error, 'the CH 2 operator was refused a removal on CH 2').toBeUndefined();
    expect(removed.payload).toEqual({ ok: true });
    expect(await listOn(op, 2)).not.toContain('news');

    // CH 1 is exactly as it was: its list, its row, its defaults and its page on air.
    expect(await listOn(op, 1), 'a read of CH 1 is not refused — it names CH 1’s rows').toContain(
      'news',
    );
    expect(rt.templateHtml('news', 1)).toBe(NEWS_V1);
    expect(rowOf(), 'CH 1’s row changed').toEqual(rowBefore);
    expect(rt.sourceAssignments(), 'Source defaults moved').toEqual(defaultsBefore);
    expect(await get(onAirUrl), 'the page on air on CH 1 changed').toEqual(pageBefore);

    // CONTROL — the same three acts on CH 1, by the same principal, refused by the grant, and
    // nothing changes there.
    for (const [id, channel, req] of [
      ['i1', 'templates.import', { template: NEWS, html: NEWS_V2, channel: 1 }],
      ['r1', 'templates.import', { template: NEWS, html: NEWS_V1, channel: 1 }],
      ['d1', 'templates.remove', { templateId: 'news', channel: 1 }],
    ] as const) {
      expectRefusedWith((await op.ask(id, channel, req)).error, authzChannelRefusal(1), id);
    }
    // …and a request naming NO channel is judged on every channel it would change — CH 1 too.
    expectRefusedWith(
      (await op.ask('dx', 'templates.remove', { templateId: 'news' })).error,
      authzChannelRefusal(1),
      'a channel-less removal',
    );
    expect(rt.templateHtml('news', 1)).toBe(NEWS_V1);
    expect(await get(onAirUrl)).toEqual(pageBefore);
  }, 30_000);
});

describe('CHANNEL-TEMPLATES-01 — one stored version, per-channel lists', () => {
  it('the same package on CH 1 and CH 2 is ONE stored file; a re-import on CH 2 gives CH 2 the new version, CH 1 keeps the old, and both are served', async () => {
    const s = await station();
    const rt = s.handle.runtime;
    rt.templateImport(NEWS, NEWS_V1, 1);
    rt.templateImport(NEWS, NEWS_V1, 2);
    const newsRecords = (): string[] => records(s.templatesDir).filter((f) => f.startsWith('news'));
    expect(newsRecords()).toEqual([registryRecordFileName('news')]);

    rt.templateImport(NEWS, NEWS_V2, 2);
    expect(newsRecords()).toHaveLength(2);
    expect(rt.templateHtml('news', 1)).toBe(NEWS_V1);
    expect(rt.templateHtml('news', 2)).toBe(NEWS_V2);
    // Both are served, each at its own path: CH 1's at the path it always had.
    const url1 = rt.templateServeUrl('news', 1) ?? '';
    const url2 = rt.templateServeUrl('news', 2) ?? '';
    expect(url1.endsWith('/template/news')).toBe(true);
    expect(url2).not.toBe(url1);
    expect(await get(url1)).toEqual({ status: 200, body: NEWS_V1 });
    expect(await get(url2)).toEqual({ status: 200, body: NEWS_V2 });
  }, 30_000);

  it('removing from CH 2 while CH 1 lists it leaves the file; removing it from the last channel, with no row holding it, deletes it — control: a row on CH 2 holding it refuses the removal on CH 2', async () => {
    const s = await station();
    const rt = s.handle.runtime;
    rt.templateImport(NEWS, NEWS_V1, 1);
    rt.templateImport(NEWS, NEWS_V1, 2);
    const file = path.join(s.templatesDir, registryRecordFileName('news'));

    // CONTROL first: a row on CH 2 holds it, so CH 2 refuses — and CH 1's row-less list is irrelevant.
    expect(await rt.loadFixed({ channel: 2, layer: 99 }, 'row-ch2', 'news', {})).toEqual({
      accepted: true,
    });
    const refused = rt.templateRemove('news', 2);
    expect(refused).toMatchObject({ ok: false, reason: 'in-use' });
    expect(refused.references).toEqual([{ itemId: 'row-ch2', slot: { channel: 2, layer: 99 } }]);
    expect(rt.templateHtml('news', 2)).toBe(NEWS_V1);
    await rt.remove('row-ch2');

    // CH 2 lets go while CH 1 lists it: the file stays.
    expect(rt.templateRemove('news', 2)).toEqual({ ok: true });
    expect(rt.templateList(2).map((t) => t.templateId)).not.toContain('news');
    expect(fs.existsSync(file)).toBe(true);

    // The last channel lets go, and no row holds it: the file goes.
    expect(rt.templateRemove('news', 1)).toEqual({ ok: true });
    expect(fs.existsSync(file)).toBe(false);
    expect(rt.templateServeUrl('news')).toBeNull();
  }, 30_000);

  it('a CH 1 row on air with v1 keeps v1 stored and served after CH 1 itself re-imports and every list lets it go', async () => {
    const s = await station();
    const rt = s.handle.runtime;
    const onAirUrl = await newsOnAirOnChannelOne(s);
    rt.templateImport(NEWS, NEWS_V2, 1);
    // CH 1 lists v2 now; its row still holds the page it took, at the path it was served from.
    expect(rt.templateHtml('news', 1)).toBe(NEWS_V2);
    expect(await get(onAirUrl)).toEqual({ status: 200, body: NEWS_V1 });
    expect(rt.templateServeUrl('news', 1)).not.toBe(onAirUrl);
  }, 30_000);
});

describe('CHANNEL-TEMPLATES-01 decision 5 — nothing disappears at the upgrade', () => {
  it('every declared channel lists the station’s library once, served where it always was; a second load copies nothing, and a channel added later starts empty', async () => {
    const templatesDir = tmpTemplatesDir();
    fs.mkdirSync(templatesDir, { recursive: true });
    // Two records exactly as the station-wide registry wrote them: no version, no index.
    for (const [id, html, at] of [
      ['logo', '<html>logo</html>', '2026-08-01T00:00:00.000Z'],
      ['news', NEWS_V1, '2026-09-01T00:00:00.000Z'],
    ] as const) {
      fs.writeFileSync(
        path.join(templatesDir, registryRecordFileName(id)),
        `${JSON.stringify({ info: { ...NEWS, templateId: id }, html, importedAt: at })}\n`,
        'utf8',
      );
    }

    const boot = (channels: readonly number[]): Promise<BridgeHandle> =>
      createBridge({
        port: 0,
        connection: deadConnection(),
        fixedLayers: channels.map((c) => standardBank(c)),
        templatesDir,
      });

    const first = await boot([1, 2]);
    try {
      for (const channel of [1, 2]) {
        expect(first.runtime.templateList(channel).map((t) => t.templateId)).toEqual([
          'logo',
          'news',
        ]);
      }
      expect(first.runtime.templateHtml('news', 2)).toBe(NEWS_V1);
      // Served where it always was — the bare id, on both channels — byte for byte.
      const url = first.runtime.templateServeUrl('news', 2) ?? '';
      expect(url.endsWith('/template/news')).toBe(true);
      expect(first.runtime.templateServeUrl('news', 1)).toBe(url);
      expect(await get(url)).toEqual({ status: 200, body: NEWS_V1 });
    } finally {
      await first.close();
    }

    // A second load, with a third channel declared since: nothing is copied again, and the new
    // channel's list is empty.
    const second = track(await boot([1, 2, 3]), (h) => h.close());
    expect(second.runtime.templateList(1).map((t) => t.templateId)).toEqual(['logo', 'news']);
    expect(second.runtime.templateList(2).map((t) => t.templateId)).toEqual(['logo', 'news']);
    expect(second.runtime.templateList(3)).toEqual([]);
    expect(records(templatesDir)).toEqual(
      [registryRecordFileName('logo'), registryRecordFileName('news')].sort(),
    );
  }, 30_000);
});
