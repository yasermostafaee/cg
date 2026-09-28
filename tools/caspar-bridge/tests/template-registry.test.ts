import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { TemplateInfo } from '@cg/shared-ipc';
import {
  TemplateRegistry,
  isRegistryRecordName,
  registryRecordFileName,
  templateVersionId,
} from '../src/template-registry.js';

/**
 * B-038 Phase 2 — the bridge retains the browser-produced self-contained HTML (held, then
 * served). R-028 (3.2) — the registry PERSISTS: a fresh registry pointed at the same directory
 * serves the same catalogue, so a bridge restart does not empty the library.
 *
 * 🔴 `CHANNEL-TEMPLATES-01` (the owner, 2026-09-28) — **EACH CHANNEL HAS ITS OWN LIST, OVER ONE
 * SHARED STORE OF VERSIONS.** An import lists a template on the channels it names and no other;
 * a re-import moves only those channels to the new version; one version is stored once however
 * many channels list it, and it is removed only when no channel lists it and no row holds it.
 * The restart path is tested explicitly, not just the happy path — persistence is where the
 * demo breaks.
 */

function info(templateId: string, extra: Partial<TemplateInfo> = {}): TemplateInfo {
  return {
    templateId,
    templateType: 'lower-third',
    fields: [{ id: 'anchor', label: 'Anchor name', required: true, type: 'text', default: '' }],
    ...extra,
  };
}

describe('TemplateRegistry — a channel lists a version', () => {
  it('an import lists the template on the channels it names, and on no other', () => {
    const reg = new TemplateRegistry();
    const html = '<!doctype html><html><body>v1</body></html>';

    const { versionId, changed } = reg.importOn([2], info('tpl-1'), html);

    expect(changed).toEqual([2]);
    expect(versionId).toBe(templateVersionId(info('tpl-1'), html));
    expect(reg.listOn(2).map((t) => t.templateId)).toEqual(['tpl-1']);
    expect(reg.getOn(2, 'tpl-1')?.templateType).toBe('lower-third');
    expect(reg.htmlOf(versionId)).toBe(html);
    // Control: channel 1 was not named, so it lists nothing.
    expect(reg.listOn(1)).toEqual([]);
    expect(reg.hasOn(1, 'tpl-1')).toBe(false);
    expect(reg.channelsListing('tpl-1')).toEqual([2]);
  });

  it('the same content on a second channel is ONE stored version', () => {
    const reg = new TemplateRegistry();
    const a = reg.importOn([1], info('tpl-1'), '<html>same</html>');
    const b = reg.importOn([2], info('tpl-1'), '<html>same</html>');

    expect(b.versionId).toBe(a.versionId);
    expect(reg.storedVersions()).toEqual([a.versionId]);
    expect(reg.channelsListing('tpl-1')).toEqual([1, 2]);
  });

  it('a version is its CONTENT: key order does not make a second one', () => {
    const one: TemplateInfo = { templateId: 't', templateType: 'x', fields: [] };
    const other = { fields: [], templateType: 'x', templateId: 't' } as TemplateInfo;
    expect(templateVersionId(one, '<p/>')).toBe(templateVersionId(other, '<p/>'));
    expect(templateVersionId(one, '<p/>')).not.toBe(templateVersionId(one, '<p>2</p>'));
  });

  it('a re-import on one channel moves THAT channel only; the other keeps its version', () => {
    const reg = new TemplateRegistry();
    const v1 = reg.importOn([1, 2], info('tpl-1'), '<html>v1</html>').versionId;
    const v2 = reg.importOn([2], info('tpl-1'), '<html>v2</html>').versionId;

    expect(reg.versionOn(1, 'tpl-1')).toBe(v1);
    expect(reg.versionOn(2, 'tpl-1')).toBe(v2);
    expect(reg.storedVersions().sort()).toEqual([v1, v2].sort());
    // Both are served, each at its own path: v1 keeps the bare id.
    expect(reg.htmlForServeKey('tpl-1')).toBe('<html>v1</html>');
    expect(reg.htmlForServeKey(reg.serveKeyOf(v2) ?? '')).toBe('<html>v2</html>');
  });

  it('a re-import nothing else keeps RELEASES the old version, and the new one takes the bare path', () => {
    const reg = new TemplateRegistry();
    const v1 = reg.importOn([1], info('tpl-1'), '<html>v1</html>').versionId;
    const v2 = reg.importOn([1], info('tpl-1'), '<html>v2</html>').versionId;

    expect(reg.storedVersions()).toEqual([v2]);
    expect(reg.serveKeyOf(v1)).toBeNull();
    expect(reg.serveKeyOf(v2)).toBe('tpl-1');
    expect(reg.htmlForServeKey('tpl-1')).toBe('<html>v2</html>');
  });

  it('removing from one channel keeps the version while another lists it; the last one deletes it', () => {
    const reg = new TemplateRegistry();
    const v1 = reg.importOn([1, 2], info('tpl-1'), '<html>v1</html>').versionId;

    expect(reg.removeFrom([2], 'tpl-1')).toEqual([2]);
    expect(reg.hasOn(2, 'tpl-1')).toBe(false);
    expect(reg.storedVersions()).toEqual([v1]); // channel 1 still lists it

    expect(reg.removeFrom([1], 'tpl-1')).toEqual([1]);
    expect(reg.storedVersions()).toEqual([]);
    expect(reg.htmlForServeKey('tpl-1')).toBeNull();
    // A removal of what a channel does not list changes nothing.
    expect(reg.removeFrom([1], 'tpl-1')).toEqual([]);
  });

  it('🔴 a version a row HOLDS is kept and served after no channel lists it; releasing the row collects it', () => {
    const reg = new TemplateRegistry();
    const v1 = reg.importOn([1], info('tpl-1'), '<html>v1</html>').versionId;
    reg.hold('row-1', v1);

    // The channel moves on (a re-import) — the page on air still has its record and its path.
    const v2 = reg.importOn([1], info('tpl-1'), '<html>v2</html>').versionId;
    expect(reg.storedVersions().sort()).toEqual([v1, v2].sort());
    expect(reg.htmlForServeKey('tpl-1')).toBe('<html>v1</html>');
    expect(reg.serveKeyOf(v2)).toBe(`tpl-1~${v2}`);

    // The row takes v2: v1 is held by nothing and listed nowhere, so it goes.
    reg.hold('row-1', v2);
    expect(reg.storedVersions()).toEqual([v2]);
    // The row leaves the stack while its channel still lists v2: v2 stays.
    reg.release('row-1');
    expect(reg.storedVersions()).toEqual([v2]);
  });

  it('a version PINNED by an ADD in flight survives a re-import until the pin is dropped', () => {
    const reg = new TemplateRegistry();
    const v1 = reg.importOn([1], info('tpl-1'), '<html>v1</html>').versionId;
    reg.pin(v1);
    reg.importOn([1], info('tpl-1'), '<html>v2</html>');
    expect(reg.storedVersions()).toContain(v1);
    reg.unpin(v1);
    expect(reg.storedVersions()).not.toContain(v1);
  });

  it('the station-wide reading answers each template once, from the lowest channel listing it', () => {
    const reg = new TemplateRegistry();
    reg.importOn([2], info('tpl-a', { name: 'a on 2' }), '<a2/>');
    reg.importOn([1], info('tpl-b'), '<b/>');
    reg.importOn([3], info('tpl-a', { name: 'a on 3' }), '<a3/>');

    expect(
      reg
        .listAll()
        .map((t) => [t.templateId, t.name])
        .sort(),
    ).toEqual([
      ['tpl-a', 'a on 2'],
      ['tpl-b', undefined],
    ]);
    expect(reg.getAny('tpl-a')?.name).toBe('a on 2');
    expect(reg.hasAny('missing')).toBe(false);
    expect(reg.getAny('missing')).toBeNull();
  });

  it('returns null for the info of an id a channel does not list', () => {
    const reg = new TemplateRegistry();
    expect(reg.getOn(1, 'missing')).toBeNull();
    expect(reg.versionOn(1, 'missing')).toBeNull();
    expect(reg.hasOn(1, 'missing')).toBe(false);
  });
});

describe('TemplateRegistry persistence (R-028 3.2 — a bridge restart does not empty the library)', () => {
  let dir: string | null = null;

  afterEach(() => {
    if (dir !== null) fs.rmSync(dir, { recursive: true, force: true });
    dir = null;
  });

  function tmpDir(): string {
    dir ??= fs.mkdtempSync(path.join(os.tmpdir(), 'cg-templates-'));
    return dir;
  }

  const records = (d: string): string[] => fs.readdirSync(d).filter(isRegistryRecordName).sort();

  it('a FRESH registry on the same dir re-hydrates every list — info AND servable HTML', () => {
    const d = tmpDir();
    const first = new TemplateRegistry(d);
    first.loadPersisted();
    first.importOn([1], info('tpl-1'), '<html><body>پایین‌ثلث</body></html>');
    first.importOn([1, 2], info('tpl-2'), '<html><body>v2</body></html>');

    // The "restart": a brand-new instance, same directory, nothing shared.
    const second = new TemplateRegistry(d);
    const { loaded, skipped } = second.loadPersisted();
    expect({ loaded, skipped }).toEqual({ loaded: 2, skipped: 0 });
    expect(second.listOn(1).map((t) => t.templateId)).toEqual(['tpl-1', 'tpl-2']);
    expect(second.listOn(2).map((t) => t.templateId)).toEqual(['tpl-2']);
    // The HTML survives byte-exact — it is what /template/<id> serves to CasparCG.
    expect(second.htmlForServeKey('tpl-1')).toBe('<html><body>پایین‌ثلث</body></html>');
  });

  it('one stored FILE per version, however many channels list it', () => {
    const d = tmpDir();
    const reg = new TemplateRegistry(d);
    reg.loadPersisted();
    reg.importOn([1], info('tpl-1'), '<html>same</html>');
    reg.importOn([2], info('tpl-1'), '<html>same</html>');
    expect(records(d)).toEqual([registryRecordFileName('tpl-1')]);
  });

  it('a re-import on one channel and a removal from another — both visible after restart', () => {
    const d = tmpDir();
    const first = new TemplateRegistry(d);
    first.loadPersisted();
    const v1 = first.importOn([1, 2], info('tpl-1'), '<html>v1</html>').versionId;
    const v2 = first.importOn([2], info('tpl-1'), '<html>v2</html>').versionId;
    first.importOn([1], info('tpl-2'), '<html>x</html>');
    first.removeFrom([1], 'tpl-2');
    // Two versions of tpl-1 are listed, so two files; tpl-2 is listed nowhere, so none.
    expect(records(d)).toHaveLength(2);

    const second = new TemplateRegistry(d);
    second.loadPersisted();
    expect(second.versionOn(1, 'tpl-1')).toBe(v1);
    expect(second.versionOn(2, 'tpl-1')).toBe(v2);
    expect(second.hasAny('tpl-2')).toBe(false);
    // The serve keys survive the restart — a page on air keeps its path.
    expect(second.htmlForServeKey('tpl-1')).toBe('<html>v1</html>');
    expect(second.htmlForServeKey(`tpl-1~${v2}`)).toBe('<html>v2</html>');
  });

  it('a HOLD survives a restart: a page on air keeps its record though no channel lists it', () => {
    const d = tmpDir();
    const first = new TemplateRegistry(d);
    first.loadPersisted();
    const v1 = first.importOn([1], info('tpl-1'), '<html>v1</html>').versionId;
    first.hold('row-1', v1);
    first.removeFrom([1], 'tpl-1');
    expect(first.storedVersions()).toEqual([v1]);

    const second = new TemplateRegistry(d);
    second.loadPersisted();
    expect(second.heldVersion('row-1')).toBe(v1);
    expect(second.htmlForServeKey('tpl-1')).toBe('<html>v1</html>');
    second.release('row-1');
    expect(second.storedVersions()).toEqual([]);
    expect(records(d)).toEqual([]);
  });

  it('filename-hostile template ids persist and re-hydrate (id lives in the record, not the name)', () => {
    const d = tmpDir();
    const hostile = 'a/b\\c:d*e?"<>|… خیلی طولانی '.repeat(10);
    const first = new TemplateRegistry(d);
    first.loadPersisted();
    first.importOn([1], info(hostile), '<html>hostile</html>');

    const second = new TemplateRegistry(d);
    expect(second.loadPersisted().loaded).toBe(1);
    expect(second.getOn(1, hostile)?.templateId).toBe(hostile);
    // And removal deletes the right file.
    expect(second.removeFrom([1], hostile)).toEqual([1]);
    const third = new TemplateRegistry(d);
    expect(third.loadPersisted().loaded).toBe(0);
  });

  it('a corrupt persisted file is SKIPPED with the rest loaded — never fatal, never half-parsed', () => {
    const d = tmpDir();
    const first = new TemplateRegistry(d);
    first.loadPersisted();
    first.importOn([1], info('tpl-good'), '<html>good</html>');
    fs.writeFileSync(path.join(d, 'zz-corrupt-000000000000.json'), 'not json {', 'utf8');

    const second = new TemplateRegistry(d);
    const { loaded, skipped } = second.loadPersisted();
    expect({ loaded, skipped }).toEqual({ loaded: 1, skipped: 1 });
    expect(second.listOn(1).map((t) => t.templateId)).toEqual(['tpl-good']);
  });

  it('without a persist dir the registry stays purely in-memory (unit-test compatibility)', () => {
    const reg = new TemplateRegistry();
    expect(reg.loadPersisted()).toEqual({ loaded: 0, skipped: 0 });
    reg.importOn([1], info('tpl-1'), '<html>v1</html>');
    expect(reg.listOn(1)).toHaveLength(1);
  });
});

describe('🔴 CHANNEL-TEMPLATES-01 decision 5 — the one-time copy of a pre-channel library', () => {
  let dir: string | null = null;

  afterEach(() => {
    if (dir !== null) fs.rmSync(dir, { recursive: true, force: true });
    dir = null;
  });

  /** A record exactly as the station-wide registry wrote it: no version, no serve key, no index. */
  function plantLegacy(d: string, templateId: string, html: string, importedAt: string): void {
    fs.writeFileSync(
      path.join(d, registryRecordFileName(templateId)),
      `${JSON.stringify({ info: info(templateId), html, importedAt })}\n`,
      'utf8',
    );
  }

  it('every declared channel lists every template, in import order, at the bytes it had — and a second load copies nothing', () => {
    const d = (dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-templates-legacy-')));
    plantLegacy(d, 'tpl-b', '<html>b</html>', '2026-09-01T00:00:00.000Z');
    plantLegacy(d, 'tpl-a', '<html>a</html>', '2026-08-01T00:00:00.000Z');
    const before = fs.readdirSync(d).sort();

    const reg = new TemplateRegistry(d);
    expect(reg.loadPersisted()).toEqual({ loaded: 2, skipped: 0 });
    expect(reg.migrated).toBe(false);
    // Nothing has a channel yet, and nothing is collected meanwhile.
    expect(reg.listAll().map((t) => t.templateId)).toEqual(['tpl-a', 'tpl-b']);

    expect(reg.migrate([1, 2])).toBe(4);
    for (const channel of [1, 2]) {
      expect(reg.listOn(channel).map((t) => t.templateId)).toEqual(['tpl-a', 'tpl-b']);
    }
    // The pages are served where they always were — the bare id — byte for byte.
    expect(reg.htmlForServeKey('tpl-a')).toBe('<html>a</html>');
    expect(reg.htmlForServeKey('tpl-b')).toBe('<html>b</html>');
    // No record moved: the only new file is the index.
    expect(fs.readdirSync(d).sort()).toEqual([...before, 'template-channels.json'].sort());

    // A second load copies nothing: the index is there now.
    const again = new TemplateRegistry(d);
    again.loadPersisted();
    expect(again.migrated).toBe(true);
    expect(again.migrate([1, 2, 3])).toBe(0);
    // A channel declared after the copy starts with an EMPTY list.
    expect(again.listOn(3)).toEqual([]);
    expect(again.listOn(1).map((t) => t.templateId)).toEqual(['tpl-a', 'tpl-b']);
  });

  it('with no channel declared yet (first-run), nothing is copied and nothing is collected', () => {
    const d = (dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-templates-legacy-')));
    plantLegacy(d, 'tpl-a', '<html>a</html>', '2026-08-01T00:00:00.000Z');
    const reg = new TemplateRegistry(d);
    reg.loadPersisted();
    expect(reg.migrate([])).toBe(0);
    expect(reg.migrated).toBe(false);
    expect(reg.storedVersions()).toHaveLength(1);
    // The first declaration copies it.
    expect(reg.migrate([2])).toBe(1);
    expect(reg.listOn(2).map((t) => t.templateId)).toEqual(['tpl-a']);
  });
});
