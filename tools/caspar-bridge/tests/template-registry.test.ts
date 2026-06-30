import { describe, expect, it } from 'vitest';
import type { TemplateInfo } from '@cg/shared-ipc';
import { TemplateRegistry } from '../src/template-registry.js';

/**
 * B-038 Phase 2 — the bridge retains the browser-produced self-contained HTML
 * keyed by template id (held, not served yet). These tests pin the retention +
 * re-import-replaces contract the Phase 3 HTTP serve will read from.
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
});
