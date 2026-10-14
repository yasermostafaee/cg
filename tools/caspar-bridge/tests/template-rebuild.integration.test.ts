import * as fs from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PageBuild, TemplateInfo } from '@cg/shared-ipc';
import { templateVersionId } from '../src/template-registry.js';
import { track } from './support/harness.js';
import { twoChannelRig, waitUntil, type TwoChannelRig } from './support/two-channel-rig.js';

/**
 * 🔴 `PAGE-REBUILD-01` (`C-034`) — **A REBUILT PAGE NEVER LANDS UNDER A PAGE ON A LAYER.**
 *
 * The whole bridge on a loopback AMCP fake: a template imported by the old runtime with its package
 * kept is put on air on CH 1, and a console sends the page rebuilt by a new runtime. While the row is
 * on air — and while it is stopped with its page still loaded on the layer — the channel's list,
 * the served path and the page on air are untouched. The row is cleared, and only then does the
 * list move to the rebuilt page, at a new path; one audit row says so; the next take loads it.
 */

const OLD: PageBuild = { consoleVersion: '0.11.6', runtimeBuild: 'aaaaaaaaaaaaaaaa' };
const NEW: PageBuild = { consoleVersion: '0.12.0', runtimeBuild: 'bbbbbbbbbbbbbbbb' };
const NEWS: TemplateInfo = {
  templateId: 'news',
  name: 'خبر فوری',
  templateType: 'lower-third',
  fields: [],
};
const V1 = '<!doctype html><html><head><meta charset="utf-8"></head><body>خبر ۱</body></html>';
const V2 =
  '<!doctype html><html><head><meta charset="utf-8"></head><body>خبر ۱ — rebuilt</body></html>';
const PACKAGE = Buffer.from('a verified .vcg, as the console read it');

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

async function station(): Promise<TwoChannelRig> {
  const root = track(fs.mkdtempSync(path.join(os.tmpdir(), 'cg-page-rebuild-int-')), (d) =>
    fs.rmSync(d, { recursive: true, force: true }),
  );
  return twoChannelRig({ bridge: { templatesDir: path.join(root, 'templates') } });
}

/** Import `news` on CH 1 as the OLD runtime built it, its package kept; answer its version. */
function importKept(rig: TwoChannelRig): string {
  const rt = rig.handle.runtime;
  const put = rt.templateSourcePut(PACKAGE.toString('base64'));
  if (!put.stored || put.sha256 === undefined) throw new Error('package not kept');
  rt.templateImport(NEWS, V1, 1, { build: OLD, sourceSha256: put.sha256 });
  return templateVersionId(NEWS, V1);
}

const lastAddPath = (rig: TwoChannelRig): string =>
  (rig.mock.lastCgAdd({ channel: 1, layer: 99 })?.template ?? '').split('?')[0] ?? '';

describe('PAGE-REBUILD-01 — nothing on air or loaded is touched by a rebuild', () => {
  it('🔴 on air, then stopped with its page on the layer: held back; cleared: swapped in at a new path, audited once, and the next take loads it', async () => {
    const rig = await station();
    const rt = rig.handle.runtime;
    const v1 = importKept(rig);
    const v2 = templateVersionId(NEWS, V2);

    expect(await rt.loadFixed({ channel: 1, layer: 99 }, 'row-ch1', 'news', {})).toEqual({
      accepted: true,
    });
    expect((await rt.take('row-ch1')).accepted).toBe(true);
    await waitUntil(async () => (await rig.lines()).includes('CG 1-99 PLAY 0'), 'the take');
    const onAirPath = lastAddPath(rig);
    expect(onAirPath.endsWith(`/template/news~${v1}`)).toBe(true);

    // A console with the new runtime is told to rebuild it, and sends the page.
    expect(rt.templateRebuildPlan(NEW).rebuild.map((r) => r.versionId)).toEqual([v1]);
    expect(rt.templateRebuild(v1, NEW, { ok: true, template: NEWS, html: V2 })).toEqual({
      outcome: 'deferred',
    });

    // ON AIR: the list, the path and the page are what they were; no rebuild is recorded yet.
    expect(rt.templateServeUrl('news', 1)?.endsWith(`/template/news~${v1}`)).toBe(true);
    expect(await get(onAirPath)).toEqual({ status: 200, body: V1 });
    expect(rt.templateHtml('news', 1)).toBe(V1);
    expect(await rt.auditRecent(50, 'template-rebuild')).toEqual([]);

    // STOPPED: the page is still loaded on the layer, so it still waits.
    await rt.stopItem('row-ch1');
    await waitUntil(
      async () => (await rig.lines()).some((l) => l.startsWith('CG 1-99 STOP')),
      'the stop',
    );
    await waitUntil(
      () => rt.stackSnapshot().find((i) => i.itemId === 'row-ch1')?.status === 'loaded',
      'the stopped row to settle as loaded',
    );
    expect(rt.templateServeUrl('news', 1)?.endsWith(`/template/news~${v1}`)).toBe(true);

    // CLEARED: the layer is empty, so the rebuilt page is swapped in — at a new path.
    expect((await rt.out('row-ch1')).accepted).toBe(true);
    await waitUntil(
      () => rt.templateServeUrl('news', 1)?.endsWith(`/template/news~${v2}`) === true,
      'the rebuilt page to be listed once the row is cleared',
    );
    expect(rt.templateHtml('news', 1)).toBe(V2);
    const rows = await rt.auditRecent(50, 'template-rebuild');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action: 'template-rebuild',
      templateId: 'news',
      outcome: 'ok',
      rebuild: { name: 'خبر فوری', from: OLD, to: NEW },
    });

    // The next take loads the rebuilt page, from its new path.
    expect((await rt.take('row-ch1')).accepted).toBe(true);
    await waitUntil(
      () => lastAddPath(rig).endsWith(`/template/news~${v2}`),
      'the next take to load the rebuilt page',
    );
    expect(await get(lastAddPath(rig))).toEqual({ status: 200, body: V2 });
  }, 40_000);

  it('a page on no layer is rebuilt at once; a failed rebuild keeps the old page, writes one failed row, and is listed for re-import', async () => {
    const rig = await station();
    const rt = rig.handle.runtime;
    const v1 = importKept(rig);

    expect(
      rt.templateRebuild(v1, NEW, { ok: false, reason: 'failed verification: hash mismatch' }),
    ).toEqual({ outcome: 'recorded' });
    expect(rt.templateHtml('news', 1)).toBe(V1);
    const plan = rt.templateRebuildPlan(NEW);
    expect(plan.rebuild).toEqual([]);
    // The rig's furniture template was imported with nothing kept: it is listed too, as it should be.
    expect(plan.reimport).toEqual([
      { template: { templateId: 'logo', templateType: 'logo', fields: [] }, reason: 'no-source' },
      { template: NEWS, reason: 'failed' },
    ]);
    const failed = await rt.auditRecent(50, 'template-rebuild');
    expect(failed).toHaveLength(1);
    expect(failed[0]).toMatchObject({
      outcome: 'failed',
      errorCode: 'rebuild-failed',
      rebuild: {
        name: 'خبر فوری',
        from: OLD,
        to: NEW,
        reason: 'failed verification: hash mismatch',
      },
    });

    // A newer runtime tries again, and with no row holding the page it lands at once.
    const newer: PageBuild = { consoleVersion: '0.12.1', runtimeBuild: 'cccccccccccccccc' };
    expect(rt.templateRebuild(v1, newer, { ok: true, template: NEWS, html: V2 })).toEqual({
      outcome: 'rebuilt',
    });
    expect(rt.templateHtml('news', 1)).toBe(V2);
    expect(
      rt.templateServeUrl('news', 1)?.endsWith(`/template/news~${templateVersionId(NEWS, V2)}`),
    ).toBe(true);
  }, 40_000);
});
