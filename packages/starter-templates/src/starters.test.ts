import { describe, expect, it } from 'vitest';
import { type Element, SceneSchema } from '@cg/shared-schema';
import {
  iranPremierLeagueScene,
  countdownStepsScene,
  getStarter,
  imageFolderSequenceScene,
  iranWeatherForecastScene,
  iranWeatherPagesScene,
  logoBugScene,
  multiboxScene,
  STARTER_TEMPLATES,
  tickerScene,
} from './index.js';

/** D-119's five audited starters followed by D-179's six production examples. */
const EXPECTED_IDS = [
  'irib-news',
  'ticker',
  'logo-bug',
  'title',
  'sequence',
  'iran-premier-league',
  'iran-weather-pages',
  'iran-weather-forecast',
  'image-folder-sequence',
  'countdown-steps',
  'multibox',
];

describe('starter templates', () => {
  it('every starter has a Zod-valid Scene', () => {
    for (const s of STARTER_TEMPLATES) {
      expect(() => SceneSchema.parse(s.scene), `${s.id} parses`).not.toThrow();
    }
  });

  it('the catalog is exactly the audited D-119 + D-179 set, in order', () => {
    expect(STARTER_TEMPLATES.map((s) => s.id)).toEqual(EXPECTED_IDS);
  });

  it('getStarter returns the matching starter by id', () => {
    expect(getStarter('ticker')?.id).toBe('ticker');
    expect(getStarter('nope')).toBeNull();
  });

  it('no starter carries the "New" badge (owner decision, D-119)', () => {
    for (const s of STARTER_TEMPLATES) {
      expect(s.isNew, `${s.id} must not set isNew`).toBeUndefined();
    }
  });

  it('every starter has at least one bound field', () => {
    for (const s of STARTER_TEMPLATES) {
      expect(s.scene.bindings.length, `${s.id} has bindings`).toBeGreaterThan(0);
    }
  });

  it('every starter seeds the Vazirmatn asset font and references it', () => {
    for (const s of STARTER_TEMPLATES) {
      const fontAsset = (s.assets ?? []).find((a) => a.kind === 'font');
      expect(fontAsset, `${s.id} seeds a font`).toBeDefined();
      const family = `asset-${fontAsset?.key ?? ''}`;
      expect(
        s.scene.fonts.some((f) => f.family === family),
        `${s.id} fonts[] references ${family}`,
      ).toBe(true);
    }
  });

  it('full-screen starters use one direct main comp; compact overlays keep an on-air comp', () => {
    for (const s of STARTER_TEMPLATES) {
      // Entry (exported-for-now) comp: full-frame, out-point + mode.
      const entry = s.scene.compositions?.find((c) => c.id === s.scene.entryCompositionId);
      expect(entry, `${s.id} has an entry composition`).toBeDefined();
      expect(entry?.resolution, `${s.id} entry comp is full-frame`).toEqual({
        width: 1920,
        height: 1080,
      });
      expect(entry?.lifecycle?.outPoint, `${s.id} has an out-point`).toBeGreaterThan(0);
      expect(entry?.playout?.mode, `${s.id} has a playout mode`).toBeDefined();

      const direct = s.scene.metadata.tags?.includes('fullscreen:direct') === true;
      const onairTag = s.scene.metadata.tags?.find((t) => t.startsWith('onair:'));
      if (direct) {
        expect(onairTag, `${s.id} does not wrap a full-screen graphic`).toBeUndefined();
        continue;
      }

      // Compact overlays keep their reusable on-air footprint composition.
      expect(onairTag, `${s.id} records its on-air footprint comp`).toBeDefined();
      const onair = s.scene.compositions?.find((c) => c.id === onairTag?.slice('onair:'.length));
      expect(onair, `${s.id} on-air comp exists`).toBeDefined();
      expect(
        (onair?.resolution.width ?? 0) * (onair?.resolution.height ?? 0),
        `${s.id} on-air comp is smaller than the frame`,
      ).toBeLessThan(1920 * 1080);
      expect(onair?.lifecycle?.outPoint, `${s.id} on-air comp has an out-point`).toBeGreaterThan(0);
      expect(onair?.playout?.mode, `${s.id} on-air comp has a playout mode`).toBeDefined();
      // The entry comp's outro must outlast the on-air comp's stop-exit so the
      // root never settles (hides the stage) before the graphic's exit ends.
      const entryOutro = (entry?.frameRange.out ?? 0) - (entry?.lifecycle?.outPoint ?? 0);
      const onairOutro = (onair?.frameRange.out ?? 0) - (onair?.lifecycle?.outPoint ?? 0);
      expect(entryOutro, `${s.id} entry outro outlasts the on-air exit`).toBeGreaterThan(
        onairOutro,
      );
    }
  });

  it('ticker: content-driven crawl bound to a list data key, manual hold', () => {
    const main = tickerScene.compositions?.find((c) =>
      c.layers.some((l) => l.children.some((el) => el.type === 'ticker')),
    );
    const crawl = main?.layers[0]?.children.find((el) => el.type === 'ticker');
    expect(crawl).toBeDefined();
    if (crawl?.type !== 'ticker') return;
    expect(crawl.direction).toBe('rtl');
    expect(crawl.repeat).toBe('infinite');
    expect(crawl.items.length).toBeGreaterThan(0);

    const listBinding = tickerScene.bindings.find((b) => b.target.kind === 'ticker-items');
    expect(listBinding?.target.kind === 'ticker-items' && listBinding.target.elementId).toBe(
      crawl.id,
    );
    const listField = tickerScene.fields.find((f) => f.id === listBinding?.fieldId);
    expect(listField?.type).toBe('list');

    expect(main?.playout?.mode).toBe('manual');
    // The authored exit lives AFTER the out-point.
    expect(main?.lifecycle?.outPoint).toBeLessThan(main?.frameRange.out ?? 0);
  });

  it('logo-bug: loop-cycle sting keeps its animation on a replaceable image asset', () => {
    // The sting loop lives on the nested on-air comp (a parent loop-cycle
    // would NOT replay nested keyframes — child controllers loop themselves).
    const main = logoBugScene.compositions?.find((c) => c.id === 'comp-logo-mark');
    expect(main?.playout).toMatchObject({
      mode: 'loop-cycle',
      holdSource: 'timed',
      repeat: 'infinite',
    });
    expect(main?.playout?.holdMs).toBeGreaterThanOrEqual(5000);

    const mark = main?.layers[0]?.children.find((el) => el.id === 'lb-mark');
    expect(mark).toBeDefined();
    if (mark?.type !== 'image') return;
    expect(mark.assetId).toBe('apasai-logo');
    expect(mark.animation?.tracks.opacity?.keyframes.length).toBeGreaterThanOrEqual(4);
    expect(mark.animation?.tracks['scale.x']?.keyframes.length).toBeGreaterThanOrEqual(2);
  });

  it('D-179: data-rich examples use real repeaters and sequence pages', () => {
    const elements = (scene: typeof iranPremierLeagueScene): Element[] =>
      [...scene.layers, ...(scene.compositions ?? []).flatMap((composition) => composition.layers)]
        .flatMap((entry) => entry.children)
        .flatMap(function walk(element): Element[] {
          return element.type === 'container'
            ? [element, ...element.children.flatMap(walk)]
            : [element];
        });

    expect(elements(iranPremierLeagueScene).some((element) => element.type === 'repeater')).toBe(
      true,
    );
    const leagueRepeater = elements(iranPremierLeagueScene).find(
      (element) => element.type === 'repeater',
    );
    expect(leagueRepeater).toMatchObject({
      itemEntrance: 'fade-right',
      itemTransitionMs: 400,
      itemStaggerMs: 70,
    });
    expect(elements(iranWeatherForecastScene).some((element) => element.type === 'repeater')).toBe(
      true,
    );

    const weatherPages = elements(iranWeatherPagesScene).find(
      (element) => element.type === 'sequence',
    );
    expect(weatherPages?.type).toBe('sequence');
    if (weatherPages?.type === 'sequence') {
      expect(weatherPages.pageDataFile).toBe('starter-data/iran-weather-pages.json');
      expect(weatherPages.items).toHaveLength(4);
      expect(weatherPages.items.every((item) => item.kind === 'composition')).toBe(true);
      const cityNames = weatherPages.items.flatMap((item) => {
        if (item.kind !== 'composition') return [];
        const rows = item.fieldValues?.cities;
        if (!Array.isArray(rows)) return [];
        return rows.flatMap((row) => {
          if (typeof row !== 'object' || row === null || Array.isArray(row)) return [];
          const city = (row as Record<string, unknown>).city;
          return typeof city === 'string' ? [city] : [];
        });
      });
      expect(cityNames).toHaveLength(31);
      expect([...cityNames].sort((left, right) => left.localeCompare(right, 'fa'))).toEqual(
        cityNames,
      );
      expect(
        weatherPages.items.map((item) =>
          item.kind === 'composition' ? item.fieldValues?.pageTitle : undefined,
        ),
      ).toEqual(['شهرها ـ صفحه ۱', 'شهرها ـ صفحه ۲', 'شهرها ـ صفحه ۳', 'شهرها ـ صفحه ۴']);
    }

    const weatherTemperature = elements(iranWeatherPagesScene).find(
      (element) => element.id === 'weather-temp',
    );
    expect(weatherTemperature?.valueRules?.input).toEqual({ kind: 'field', fieldId: 'temp' });
    expect(weatherTemperature?.valueRules?.rules.map((rule) => rule.effect.property)).toEqual([
      'fill',
      'textColor',
      'fill',
      'textColor',
    ]);
  });

  it('D-179: folder sequence ships picture pages and image assets', () => {
    const pictureSequence = imageFolderSequenceScene.compositions
      ?.flatMap((composition) => composition.layers)
      .flatMap((entry) => entry.children)
      .find((element) => element.type === 'sequence');
    expect(pictureSequence?.type).toBe('sequence');
    if (pictureSequence?.type === 'sequence') {
      expect(pictureSequence.items).toHaveLength(5);
      expect(pictureSequence.items.every((item) => item.kind === 'image')).toBe(true);
      expect(pictureSequence.advance).toBe('manual');
    }
    expect(
      getStarter('image-folder-sequence')?.assets?.filter((asset) => asset.kind === 'image'),
    ).toHaveLength(5);
  });

  it('D-179: countdown steps are ordered and drive visual state', () => {
    const clock = countdownStepsScene.compositions
      ?.flatMap((composition) => composition.layers)
      .flatMap((entry) => entry.children)
      .find((element) => element.type === 'clock');
    expect(clock?.type).toBe('clock');
    if (clock?.type === 'clock') {
      expect(clock.target?.kind).toBe('timeofday');
      expect(clock.steps?.steps.map((step) => step.atMs)).toEqual([
        3_600_000, 1_800_000, 600_000, 0,
      ]);
      expect(
        clock.steps?.steps.some((step) =>
          step.changes.some((change) => change.property === 'blink'),
        ),
      ).toBe(true);
    }
  });

  it('D-179: multibox carries switchable 1–4 plate looks with equal boxes per look', () => {
    const entry = multiboxScene.compositions?.find(
      (composition) => composition.id === multiboxScene.entryCompositionId,
    );
    expect(entry?.lookGroups?.[0]?.looks).toHaveLength(4);
    expect(entry?.lookGroups?.[0]?.defaultLookId).toBe('multibox-look-4');

    for (const [index, count] of [1, 2, 3, 4].entries()) {
      const composition = multiboxScene.compositions?.find(
        (candidate) => candidate.id === `comp-multibox-look-${String(count)}`,
      );
      const liveSources = composition?.layers
        .flatMap((layer) => layer.children)
        .filter((element) => element.type === 'video-placeholder');
      expect(liveSources, `look ${String(index + 1)} plate count`).toHaveLength(count);
      expect(new Set(liveSources?.map((element) => element.routeKey)).size).toBe(count);
      expect(new Set(liveSources?.map((element) => element.transform.size.w)).size).toBe(1);
      expect(new Set(liveSources?.map((element) => element.transform.size.h)).size).toBe(1);
    }
  });

  it('Persian defaults are non-empty RTL copy', () => {
    for (const s of STARTER_TEMPLATES) {
      const textFields = s.scene.fields.filter((f) => f.type === 'text');
      expect(textFields.length, `${s.id} has text fields`).toBeGreaterThan(0);
      for (const f of textFields) {
        if (f.type === 'text') expect(f.default, `${s.id}.${f.id} default`).not.toBe('');
      }
    }
  });

  // D-119 polish — a bound text field carries a REAL default as its base text,
  // with the data key layered on top (the hand-authored shape the Designer's own
  // bind action produces). A raw `{{token}}` as the base text would show
  // literally in the Designer and on air whenever the operator sends no value.
  it('bound text fields hold a real Persian default, never a raw {{token}}', () => {
    for (const s of STARTER_TEMPLATES) {
      // Every element in the scene: each layer's children, in the root AND in
      // every composition, descending through containers (which nest).
      const elements = [...s.scene.layers, ...(s.scene.compositions ?? []).flatMap((c) => c.layers)]
        .flatMap((l) => l.children)
        .flatMap(function walk(el): Element[] {
          return el.type === 'container' ? [el, ...el.children.flatMap(walk)] : [el];
        });

      // No element anywhere ships a mustache token as its authored copy.
      for (const el of elements) {
        if (el.type === 'text') {
          expect(el.text, `${s.id}.${el.id} base text is real copy`).not.toContain('{{');
        }
      }

      const textBindings = s.scene.bindings.filter((b) => b.target.kind === 'text');
      expect(textBindings.length, `${s.id} has text bindings`).toBeGreaterThan(0);

      for (const b of textBindings) {
        if (b.target.kind !== 'text') continue;
        // No placeholder => the value REPLACES the full text (bindings.ts), and
        // the Designer inspector recognises it as the element's Data key binding
        // (DynamicDataSection only treats `placeholder === undefined` as such).
        expect(
          b.target.placeholder,
          `${s.id}.${b.fieldId} binding must not carry a placeholder`,
        ).toBeUndefined();

        const el = elements.find((e) => e.id === b.target.elementId);
        expect(el?.type, `${s.id}.${b.fieldId} targets a text element`).toBe('text');

        const field = s.scene.fields.find((f) => f.id === b.fieldId);
        expect(field?.type, `${s.id}.${b.fieldId} is a text field`).toBe('text');

        // Base text and default agree: what the Designer shows is exactly what
        // goes to air when the operator sends no value.
        if (el?.type === 'text' && field?.type === 'text') {
          expect(el.text, `${s.id}.${b.fieldId} base text is non-empty`).not.toBe('');
          expect(
            el.text,
            `${s.id}.${b.fieldId} base text === field default (Designer == on-air fallback)`,
          ).toBe(field.default);
        }
      }
    }
  });
});
