import { describe, expect, it } from 'vitest';
import { FontService } from '../src/main/services/FontService.js';

describe('FontService', () => {
  it('ships the three v1 bundled families', () => {
    const families = new FontService().bundledFamilies().map((f) => f.family);
    expect(families).toContain('Vazirmatn');
    expect(families).toContain('Inter');
    expect(families).toContain('Noto Sans Arabic');
  });

  it('resolve() returns the FontReference for a bundled family', () => {
    const svc = new FontService();
    expect(svc.resolve('Vazirmatn')?.source).toBe('bundled');
  });

  it('resolve() returns null for unknown families', () => {
    expect(new FontService().resolve('Comic Sans')).toBeNull();
  });

  it('registerBundled() can add additional families at runtime', () => {
    const svc = new FontService();
    svc.registerBundled({
      family: 'Lalezar',
      weights: [400],
      styles: ['normal'],
      source: 'bundled',
      bundledPath: 'resources/fonts/Lalezar.woff2',
    });
    expect(svc.resolve('Lalezar')?.family).toBe('Lalezar');
  });
});
