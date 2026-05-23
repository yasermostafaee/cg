import { describe, expect, it } from 'vitest';
import { TemplateRegistry } from '../src/main/services/TemplateRegistry.js';

describe('TemplateRegistry', () => {
  it('register + get round-trips', () => {
    const r = new TemplateRegistry();
    r.register({
      templateId: 'lt-1',
      url: 'file:///C:/x.html',
      templateType: 'lower-third',
    });
    expect(r.get('lt-1')).toMatchObject({ url: 'file:///C:/x.html' });
  });

  it('returns null for unknown template', () => {
    expect(new TemplateRegistry().get('ghost')).toBeNull();
  });

  it('resolveUrl returns just the URL', () => {
    const r = new TemplateRegistry();
    r.register({ templateId: 'lt-1', url: 'file:///x', templateType: 'lower-third' });
    expect(r.resolveUrl('lt-1')).toBe('file:///x');
    expect(r.resolveUrl('ghost')).toBeNull();
  });

  it('unregister removes an entry', () => {
    const r = new TemplateRegistry();
    r.register({ templateId: 'lt-1', url: 'file:///x', templateType: 'lower-third' });
    expect(r.unregister('lt-1')).toBe(true);
    expect(r.unregister('lt-1')).toBe(false);
    expect(r.get('lt-1')).toBeNull();
  });

  it('list returns every registered entry', () => {
    const r = new TemplateRegistry();
    r.register({ templateId: 'a', url: 'u-a', templateType: 'lower-third' });
    r.register({ templateId: 'b', url: 'u-b', templateType: 'ticker' });
    expect(r.list()).toHaveLength(2);
  });

  it('clear drops all entries', () => {
    const r = new TemplateRegistry();
    r.register({ templateId: 'a', url: 'u', templateType: 'lower-third' });
    r.clear();
    expect(r.list()).toHaveLength(0);
  });
});
