import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { TemplateInfo } from '@cg/shared-ipc';
import { TemplateRegistry } from '../src/template-registry.js';

/**
 * B-038 Phase 2 — the bridge retains the browser-produced self-contained HTML
 * keyed by template id (held, not served yet). These tests pin the retention +
 * re-import-replaces contract the Phase 3 HTTP serve will read from.
 *
 * R-028 (3.2) — the registry PERSISTS: a fresh registry pointed at the same
 * directory serves the same catalogue, so a bridge restart does not empty the
 * library. The restart path is tested explicitly, not just the happy path —
 * persistence is where the demo breaks.
 */

function info(templateId: string): TemplateInfo {
  return {
    templateId,
    templateType: 'lower-third',
    fields: [{ id: 'anchor', label: 'Anchor name', required: true, type: 'text', default: '' }],
  };
}

describe('TemplateRegistry', () => {
  it('retains the HTML keyed by template id alongside the TemplateInfo', () => {
    const reg = new TemplateRegistry();
    const html = '<!doctype html><html><body>v1</body></html>';

    const result = reg.import(info('tpl-1'), html);

    expect(result).toEqual({ registered: true, templateId: 'tpl-1' });
    expect(reg.html('tpl-1')).toBe(html);
    expect(reg.get('tpl-1')?.templateType).toBe('lower-third');
    expect(reg.list().map((t) => t.templateId)).toEqual(['tpl-1']);
    expect(reg.has('tpl-1')).toBe(true);
  });

  it('replaces the stored HTML (not duplicates) when the same id is re-imported', () => {
    const reg = new TemplateRegistry();
    reg.import(info('tpl-1'), '<html><body>v1</body></html>');
    reg.import(info('tpl-1'), '<html><body>v2</body></html>');

    expect(reg.html('tpl-1')).toBe('<html><body>v2</body></html>');
    // Still a single registered template, not two.
    expect(reg.list()).toHaveLength(1);
  });

  it('returns null for the HTML / info of an unknown id', () => {
    const reg = new TemplateRegistry();
    expect(reg.html('missing')).toBeNull();
    expect(reg.get('missing')).toBeNull();
    expect(reg.has('missing')).toBe(false);
  });

  // R-005 — the registry drops info AND html. `TemplateHttpServer` keeps no map of its
  // own (it reads through `html(id)` per request), so a null here is what makes
  // `GET /template/<id>` 404 with no serve-side change at all.
  it('remove drops the info AND the retained HTML, so the served URL stops resolving', () => {
    const reg = new TemplateRegistry();
    reg.import(info('tpl-1'), '<html><body>v1</body></html>');
    reg.import(info('tpl-2'), '<html><body>v2</body></html>');

    expect(reg.remove('tpl-1')).toBe(true);

    expect(reg.has('tpl-1')).toBe(false);
    expect(reg.get('tpl-1')).toBeNull();
    expect(reg.html('tpl-1')).toBeNull();
    // The other template is untouched.
    expect(reg.list().map((t) => t.templateId)).toEqual(['tpl-2']);
    expect(reg.html('tpl-2')).toBe('<html><body>v2</body></html>');
  });

  it('remove reports false for an id that was never registered', () => {
    const reg = new TemplateRegistry();
    expect(reg.remove('missing')).toBe(false);
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

  it('a FRESH registry on the same dir re-hydrates every import — info AND servable HTML', () => {
    const d = tmpDir();
    const first = new TemplateRegistry(d);
    first.loadPersisted();
    first.import(info('tpl-1'), '<html><body>پایین‌ثلث</body></html>');
    first.import(info('tpl-2'), '<html><body>v2</body></html>');

    // The "restart": a brand-new instance, same directory, nothing shared.
    const second = new TemplateRegistry(d);
    const { loaded, skipped } = second.loadPersisted();
    expect({ loaded, skipped }).toEqual({ loaded: 2, skipped: 0 });
    expect(
      second
        .list()
        .map((t) => t.templateId)
        .sort(),
    ).toEqual(['tpl-1', 'tpl-2']);
    // The HTML survives byte-exact — it is what /template/<id> serves to CasparCG.
    expect(second.html('tpl-1')).toBe('<html><body>پایین‌ثلث</body></html>');
  });

  it('re-import REPLACES the persisted record; remove DELETES it — both visible after restart', () => {
    const d = tmpDir();
    const first = new TemplateRegistry(d);
    first.loadPersisted();
    first.import(info('tpl-1'), '<html>v1</html>');
    first.import(info('tpl-1'), '<html>v2</html>');
    first.import(info('tpl-2'), '<html>x</html>');
    first.remove('tpl-2');

    const second = new TemplateRegistry(d);
    second.loadPersisted();
    expect(second.list().map((t) => t.templateId)).toEqual(['tpl-1']);
    expect(second.html('tpl-1')).toBe('<html>v2</html>');
    expect(second.has('tpl-2')).toBe(false);
  });

  it('filename-hostile template ids persist and re-hydrate (id lives in the record, not the name)', () => {
    const d = tmpDir();
    const hostile = 'a/b\\c:d*e?"<>|… خیلی طولانی '.repeat(10);
    const first = new TemplateRegistry(d);
    first.loadPersisted();
    first.import(info(hostile), '<html>hostile</html>');

    const second = new TemplateRegistry(d);
    expect(second.loadPersisted().loaded).toBe(1);
    expect(second.html(hostile)).toBe('<html>hostile</html>');
    // And removal deletes the right file.
    expect(second.remove(hostile)).toBe(true);
    const third = new TemplateRegistry(d);
    expect(third.loadPersisted().loaded).toBe(0);
  });

  it('a corrupt persisted file is SKIPPED with the rest loaded — never fatal, never half-parsed', () => {
    const d = tmpDir();
    const first = new TemplateRegistry(d);
    first.loadPersisted();
    first.import(info('tpl-good'), '<html>good</html>');
    fs.writeFileSync(path.join(d, 'zz-corrupt-000000000000.json'), 'not json {', 'utf8');

    const second = new TemplateRegistry(d);
    const { loaded, skipped } = second.loadPersisted();
    expect({ loaded, skipped }).toEqual({ loaded: 1, skipped: 1 });
    expect(second.list().map((t) => t.templateId)).toEqual(['tpl-good']);
  });

  it('without a persist dir the registry stays purely in-memory (unit-test compatibility)', () => {
    const reg = new TemplateRegistry();
    expect(reg.loadPersisted()).toEqual({ loaded: 0, skipped: 0 });
    reg.import(info('tpl-1'), '<html>v1</html>');
    expect(reg.list()).toHaveLength(1);
  });
});
