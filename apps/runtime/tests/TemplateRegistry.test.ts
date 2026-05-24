import { describe, expect, it } from 'vitest';
import { TemplateRegistry } from '../src/main/services/TemplateRegistry.js';

describe('TemplateRegistry', () => {
  it('register + get round-trips', () => {
    const r = new TemplateRegistry();
    r.register({
      templateId: 'lt-1',
      url: 'file:///C:/x.html',
      templateType: 'lower-third',
      fields: [],
    });
    expect(r.get('lt-1')).toMatchObject({ url: 'file:///C:/x.html' });
  });

  it('returns null for unknown template', () => {
    expect(new TemplateRegistry().get('ghost')).toBeNull();
  });

  it('resolveUrl returns just the URL', () => {
    const r = new TemplateRegistry();
    r.register({
      templateId: 'lt-1',
      url: 'file:///x',
      templateType: 'lower-third',
      fields: [],
    });
    expect(r.resolveUrl('lt-1')).toBe('file:///x');
    expect(r.resolveUrl('ghost')).toBeNull();
  });

  it('unregister removes an entry', () => {
    const r = new TemplateRegistry();
    r.register({
      templateId: 'lt-1',
      url: 'file:///x',
      templateType: 'lower-third',
      fields: [],
    });
    expect(r.unregister('lt-1')).toBe(true);
    expect(r.unregister('lt-1')).toBe(false);
    expect(r.get('lt-1')).toBeNull();
  });

  it('list returns every registered entry', () => {
    const r = new TemplateRegistry();
    r.register({ templateId: 'a', url: 'u-a', templateType: 'lower-third', fields: [] });
    r.register({ templateId: 'b', url: 'u-b', templateType: 'ticker', fields: [] });
    expect(r.list()).toHaveLength(2);
  });

  it('clear drops all entries', () => {
    const r = new TemplateRegistry();
    r.register({ templateId: 'a', url: 'u', templateType: 'lower-third', fields: [] });
    r.clear();
    expect(r.list()).toHaveLength(0);
  });

  it('preserves the field schema and exposes it via list()', () => {
    const r = new TemplateRegistry();
    r.register({
      templateId: 'with-fields',
      url: 'u',
      templateType: 'lower-third',
      fields: [{ id: 'title', label: 'Title', type: 'text', default: '', required: true }],
    });
    const entry = r.get('with-fields');
    expect(entry?.fields).toHaveLength(1);
    expect(entry?.fields[0]).toMatchObject({ id: 'title', type: 'text' });
  });
});
