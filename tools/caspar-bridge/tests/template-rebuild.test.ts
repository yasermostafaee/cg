import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { TEMPLATE_SOURCE_MAX_BYTES, type PageBuild, type TemplateInfo } from '@cg/shared-ipc';
import {
  TemplateRegistry,
  registryRecordFileName,
  templateVersionId,
} from '../src/template-registry.js';

/**
 * 🔴 `PAGE-REBUILD-01` (`C-034`) — **THE STORE KEEPS WHAT A PAGE WAS BUILT FROM, AND SWAPS A REBUILT
 * PAGE IN ONLY WHEN THE OLD ONE IS ON NO LAYER.**
 *
 * The console bakes every page at import from its own template runtime. From this change the store
 * keeps the verified `.vcg` beside the page and the runtime that built it, so a console with another
 * runtime can build the page again: a rebuilt page is a NEW version at a NEW serve path (CasparCG's
 * page cache can never serve the old one under it), and while any row may have the old page on a
 * layer it is held back, untouched.
 */

const OLD: PageBuild = { consoleVersion: '0.11.6', runtimeBuild: 'aaaaaaaaaaaaaaaa' };
const NEW: PageBuild = { consoleVersion: '0.12.0', runtimeBuild: 'bbbbbbbbbbbbbbbb' };

const PACKAGE = Buffer.from('PK\u0003\u0004 a verified package, as bytes');
const PACKAGE_SHA = createHash('sha256').update(PACKAGE).digest('hex');

function info(templateId: string, extra: Partial<TemplateInfo> = {}): TemplateInfo {
  return {
    templateId,
    name: `خبر ${templateId}`,
    templateType: 'lower-third',
    fields: [],
    ...extra,
  };
}

const dirs: string[] = [];
function tmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-page-rebuild-'));
  dirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

const free = (): boolean => false;
const busy = (): boolean => true;

/** A station with `news` imported on channels 1 and 2 by the OLD runtime, its package kept. */
function stationWithKeptNews(dir?: string): { reg: TemplateRegistry; v1: string } {
  const reg = new TemplateRegistry(dir);
  reg.loadPersisted();
  const put = reg.putSource(PACKAGE);
  if (!put.ok) throw new Error(put.message);
  const { versionId } = reg.importOn([1, 2], info('news'), '<html>v1</html>', {
    build: OLD,
    sourceSha256: put.sha256,
  });
  return { reg, v1: versionId };
}

describe('PAGE-REBUILD-01 — the import keeps its inputs', () => {
  it('the verified package is kept by its own SHA-256, and the record names it and the runtime — across a restart', () => {
    const dir = tmpDir();
    const { v1 } = stationWithKeptNews(dir);

    const sourceFile = path.join(dir, 'template-sources', `${PACKAGE_SHA}.vcg`);
    expect(fs.readFileSync(sourceFile)).toEqual(PACKAGE);
    const record = JSON.parse(
      fs.readFileSync(path.join(dir, registryRecordFileName(`news~${v1}`)), 'utf8'),
    ) as { build?: PageBuild; sourceSha256?: string };
    expect(record.build).toEqual(OLD);
    expect(record.sourceSha256).toBe(PACKAGE_SHA);

    const again = new TemplateRegistry(dir);
    again.loadPersisted();
    expect(again.versionRecord(v1)).toMatchObject({ build: OLD, sourceSha256: PACKAGE_SHA });
    expect(again.readSource(PACKAGE_SHA)).toEqual(PACKAGE);
  });

  it('a package reference this store does not hold is not kept — control: the held one is', () => {
    const reg = new TemplateRegistry();
    const { versionId } = reg.importOn([1], info('news'), '<html>v1</html>', {
      build: OLD,
      sourceSha256: 'f'.repeat(64),
    });
    expect(reg.versionRecord(versionId)?.sourceSha256).toBeUndefined();
    expect(reg.versionRecord(versionId)?.build).toEqual(OLD);

    const put = reg.putSource(PACKAGE);
    expect(put).toEqual({ ok: true, sha256: PACKAGE_SHA });
    reg.importOn([1], info('news'), '<html>v1</html>', { sourceSha256: PACKAGE_SHA });
    expect(reg.versionRecord(versionId)?.sourceSha256).toBe(PACKAGE_SHA);
  });

  it('a package over the size the socket can carry is refused and nothing is kept', () => {
    const reg = new TemplateRegistry();
    const put = reg.putSource(Buffer.alloc(TEMPLATE_SOURCE_MAX_BYTES + 1));
    expect(put.ok).toBe(false);
    expect(reg.keptSources()).toEqual([]);
  });

  it('a kept package no stored page names is deleted once its grace is over — never one a page names', () => {
    const dir = tmpDir();
    const { reg } = stationWithKeptNews(dir);
    const stray = reg.putSource(Buffer.from('a package whose import never came'));
    if (!stray.ok) throw new Error('put');
    // A later boot: nothing is "recent", so the unnamed one goes at the first collection.
    const again = new TemplateRegistry(dir);
    again.loadPersisted();
    again.removeFrom([1, 2], 'unrelated'); // no-op on lists — collects only if something changed
    again.importOn([1], info('other'), '<html>other</html>'); // a real change: collects
    expect(again.keptSources().sort()).toEqual([PACKAGE_SHA]);
    expect(fs.existsSync(path.join(dir, 'template-sources', `${stray.sha256}.vcg`))).toBe(false);
  });
});

describe('PAGE-REBUILD-01 — what a console should rebuild, and what it cannot', () => {
  it('a page by another runtime with its package kept is to be rebuilt — once, however many channels list it', () => {
    const { reg, v1 } = stationWithKeptNews();
    expect(reg.rebuildPlan(NEW)).toEqual({
      rebuild: [{ versionId: v1, template: info('news'), sourceSha256: PACKAGE_SHA }],
      reimport: [],
    });
    expect(reg.rebuildPlan(NEW, 2).rebuild).toHaveLength(1);
    // Control: the same runtime has nothing to do.
    expect(reg.rebuildPlan(OLD)).toEqual({ rebuild: [], reimport: [] });
  });

  it('a page imported before the package was kept is listed ONCE for re-import, by template, never rebuilt', () => {
    const reg = new TemplateRegistry();
    reg.importOn([1], info('legacy'), '<html>legacy ch1</html>');
    reg.importOn([2], info('legacy'), '<html>legacy ch2</html>'); // another version on channel 2
    expect(reg.rebuildPlan(NEW)).toEqual({
      rebuild: [],
      reimport: [{ template: info('legacy'), reason: 'no-source' }],
    });
  });

  it('a page a NEWER CG Control built is not this console’s to touch', () => {
    const { reg } = stationWithKeptNews();
    const older: PageBuild = { consoleVersion: '0.11.5', runtimeBuild: 'cccccccccccccccc' };
    expect(reg.rebuildPlan(older)).toEqual({ rebuild: [], reimport: [] });
  });
});

describe('PAGE-REBUILD-01 — one page, built again', () => {
  it('🔴 with the old page on no layer, every list names the new page at a NEW serve path; the old page is collected', () => {
    const { reg, v1 } = stationWithKeptNews();
    const oldKey = reg.serveKeyOf(v1);
    const html = '<html>v1, rebuilt</html>';

    const answer = reg.rebuild(v1, NEW, { ok: true, info: info('news'), html }, free, null);

    const v2 = templateVersionId(info('news'), html);
    expect(answer.outcome).toBe('rebuilt');
    expect(reg.versionOn(1, 'news')).toBe(v2);
    expect(reg.versionOn(2, 'news')).toBe(v2);
    expect(reg.serveKeyOf(v2)).toBe(`news~${v2}`);
    expect(reg.serveKeyOf(v2)).not.toBe(oldKey);
    expect(reg.versionRecord(v2)).toMatchObject({ build: NEW, sourceSha256: PACKAGE_SHA });
    expect(reg.storedVersions()).toEqual([v2]);
    // The rebuilt page is current: nothing more to do, and its package is still kept.
    expect(reg.rebuildPlan(NEW)).toEqual({ rebuild: [], reimport: [] });
    expect(reg.keptSources()).toEqual([PACKAGE_SHA]);
  });

  it('🔴 while a row may have the old page on a layer, nothing a list names changes; the swap waits and lands when it is free', () => {
    const { reg, v1 } = stationWithKeptNews();
    reg.hold('row-on-air', v1);
    const html = '<html>v1, rebuilt</html>';
    const v2 = templateVersionId(info('news'), html);

    expect(reg.rebuild(v1, NEW, { ok: true, info: info('news'), html }, busy, null).outcome).toBe(
      'deferred',
    );
    expect(reg.versionOn(1, 'news')).toBe(v1);
    expect(reg.versionOn(2, 'news')).toBe(v1);
    expect(reg.htmlForServeKey(reg.serveKeyOf(v1) ?? '')).toBe('<html>v1</html>');
    expect(reg.isRebuildPending(v1)).toBe(true);
    expect(reg.storedVersions().sort()).toEqual([v1, v2].sort()); // the new page is kept, unlisted
    // In hand: no console is told to build it again meanwhile.
    expect(reg.rebuildPlan(NEW)).toEqual({ rebuild: [], reimport: [] });
    // Still busy: nothing moves.
    expect(reg.settleRebuilds(busy)).toEqual([]);
    expect(reg.versionOn(1, 'news')).toBe(v1);

    const applied = reg.settleRebuilds(free);
    expect(applied).toHaveLength(1);
    expect(applied[0]?.from.build).toEqual(OLD);
    expect(applied[0]?.to.build).toEqual(NEW);
    expect(reg.versionOn(1, 'news')).toBe(v2);
    expect(reg.versionOn(2, 'news')).toBe(v2);
    // The row still holds the old page, so it stays stored and served at its own path.
    expect(reg.htmlForServeKey(reg.serveKeyOf(v1) ?? '')).toBe('<html>v1</html>');
  });

  it('a failed rebuild keeps the old page listed, is not offered to the same runtime again, and is listed for re-import — another runtime may try', () => {
    const dir = tmpDir();
    const { reg, v1 } = stationWithKeptNews(dir);

    const answer = reg.rebuild(
      v1,
      NEW,
      { ok: false, reason: 'failed verification: x' },
      free,
      null,
    );

    expect(answer.outcome).toBe('recorded');
    expect(reg.versionOn(1, 'news')).toBe(v1);
    expect(reg.rebuildPlan(NEW)).toEqual({
      rebuild: [],
      reimport: [{ template: info('news'), reason: 'failed' }],
    });
    // Survives a restart: the operator is not told twice.
    const again = new TemplateRegistry(dir);
    again.loadPersisted();
    expect(again.rebuildPlan(NEW).reimport).toEqual([{ template: info('news'), reason: 'failed' }]);
    // A newer runtime is offered it again.
    const newer: PageBuild = { consoleVersion: '0.12.1', runtimeBuild: 'dddddddddddddddd' };
    expect(again.rebuildPlan(newer).rebuild).toHaveLength(1);
  });

  it('stale answers change nothing: another template, a current page, a newer builder, a page no list names', () => {
    const { reg, v1 } = stationWithKeptNews();
    const ok = { ok: true as const, info: info('other'), html: '<html>x</html>' };
    expect(reg.rebuild(v1, NEW, ok, free, null).outcome).toBe('stale');
    expect(
      reg.rebuild(v1, OLD, { ok: true, info: info('news'), html: '<html>y</html>' }, free, null)
        .outcome,
    ).toBe('stale');
    const older: PageBuild = { consoleVersion: '0.11.0', runtimeBuild: 'eeeeeeeeeeeeeeee' };
    expect(
      reg.rebuild(v1, older, { ok: true, info: info('news'), html: '<html>z</html>' }, free, null)
        .outcome,
    ).toBe('stale');
    expect(reg.rebuild('0000000000000000', NEW, ok, free, null).outcome).toBe('stale');
    expect(reg.versionOn(1, 'news')).toBe(v1);
    expect(reg.storedVersions()).toEqual([v1]);
  });

  it('a held-back rebuild whose old page left every list meanwhile is dropped, and its page collected', () => {
    const { reg, v1 } = stationWithKeptNews();
    reg.hold('row', v1);
    const html = '<html>rebuilt</html>';
    reg.rebuild(v1, NEW, { ok: true, info: info('news'), html }, busy, null);
    // The operator re-imports meanwhile: the channels move to their own new version.
    reg.importOn([1, 2], info('news'), '<html>operator re-import</html>');
    reg.release('row');

    expect(reg.settleRebuilds(free)).toEqual([]);
    expect(reg.isRebuildPending(v1)).toBe(false);
    expect(reg.storedVersions()).toEqual([
      templateVersionId(info('news'), '<html>operator re-import</html>'),
    ]);
  });
});
