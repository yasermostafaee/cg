import type { FontReference } from '@cg/shared-schema';

/**
 * FontService — bundled-vs-system font resolution.
 *
 * For M6 this is a minimal in-memory registry of bundled fonts (Vazirmatn,
 * Inter, Noto Sans Arabic — the v1 Persian-first chain). System fonts are
 * accepted by reference but not validated until export's preflight step.
 *
 * The full font management surface (uploads, license storage, fallback
 * chain configuration) lands in M8 alongside the broader RTL polish.
 */
export class FontService {
  private readonly bundled = new Map<string, FontReference>();

  constructor() {
    this.registerBundled({
      family: 'Vazirmatn',
      weights: [400, 500, 700],
      styles: ['normal'],
      source: 'bundled',
      bundledPath: 'resources/fonts/Vazirmatn.woff2',
      licenseRef: 'OFL-1.1',
    });
    this.registerBundled({
      family: 'Inter',
      weights: [400, 500, 700],
      styles: ['normal'],
      source: 'bundled',
      bundledPath: 'resources/fonts/Inter.woff2',
      licenseRef: 'OFL-1.1',
    });
    this.registerBundled({
      family: 'Noto Sans Arabic',
      weights: [400, 500, 700],
      styles: ['normal'],
      source: 'bundled',
      bundledPath: 'resources/fonts/NotoSansArabic.woff2',
      licenseRef: 'OFL-1.1',
    });
  }

  /** All bundled fonts known to the Designer. */
  bundledFamilies(): readonly FontReference[] {
    return [...this.bundled.values()];
  }

  /** Resolve a scene's `fonts[]` reference. Returns null when unknown. */
  resolve(family: string): FontReference | null {
    return this.bundled.get(family) ?? null;
  }

  /**
   * Register an additional bundled family. Exposed for tests + future
   * deployment customization.
   */
  registerBundled(ref: FontReference): void {
    this.bundled.set(ref.family, ref);
  }
}
