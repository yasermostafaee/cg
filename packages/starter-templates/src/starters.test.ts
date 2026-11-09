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

/** The audited core and production examples, with both original weather styles retained. */
const EXPECTED_IDS = [
  'logo-bug',
  'title',
  'ticker',
  'irib-news',
  'sequence',
  'image-folder-sequence',
  'multibox',
  'countdown-steps',
  'iran-weather-pages',
  'iran-weather-forecast',
  'iran-weather-cards',
  'iran-premier-league',
];

describe('starter templates', () => {
  it('D-179: weather and league headers keep their reviewed entrance/hold choreography', () => {
    const expectedHeaders = new Map([
      [iranPremierLeagueScene.id, ['az-title-glow', 'az-title']],
      [iranWeatherPagesScene.id, ['weather-pages-ribbon', 'weather-pages-title']],
      [iranWeatherForecastScene.id, ['forecast-title-ribbon', 'forecast-title']],
    ]);
    for (const scene of [iranPremierLeagueScene, iranWeatherPagesScene, iranWeatherForecastScene]) {
      const entry = scene.compositions?.find(
        (composition) => composition.id === scene.entryCompositionId,
      );
      const animated =
        entry?.layers
          .flatMap((layer) => layer.children)
          .filter((element) => element.animation?.tracks['position.y'] !== undefined) ?? [];
      expect(
        animated.map((element) => element.id),
        scene.id,
      ).toEqual(expectedHeaders.get(scene.id));
    }
    const pagesEntry = iranWeatherPagesScene.compositions?.find(
      (composition) => composition.id === iranWeatherPagesScene.entryCompositionId,
    );
    const pageHeaders = pagesEntry?.layers.flatMap((layer) => layer.children) ?? [];
    expect(
      pageHeaders
        .find((element) => element.id === 'weather-pages-ribbon')
        ?.animation?.tracks['position.y']?.keyframes.map(({ frame, value }) => ({ frame, value })),
    ).toEqual([
      { frame: 0, value: 114 },
      { frame: 16, value: 94 },
      { frame: 116, value: 94 },
      { frame: 138, value: 110 },
    ]);
  });

  it('every starter has a Zod-valid Scene', () => {
    for (const s of STARTER_TEMPLATES) {
      expect(() => SceneSchema.parse(s.scene), `${s.id} parses`).not.toThrow();
    }
  });

  it('the catalog is exactly the audited D-119 + D-179 set, in order', () => {
    expect(STARTER_TEMPLATES.map((s) => s.id)).toEqual(EXPECTED_IDS);
  });

  it('all gallery display titles and root composition names stay Persian-only', () => {
    for (const starter of STARTER_TEMPLATES) {
      const root = starter.scene.compositions?.find(
        (composition) => composition.id === starter.scene.entryCompositionId,
      );
      expect(starter.label).not.toMatch(/[A-Za-z]/);
      expect(starter.scene.name).not.toMatch(/[A-Za-z]/);
      expect(root?.name).not.toMatch(/[A-Za-z]/);
    }
  });

  it('on-air starter text contains content, not authoring or training instructions', () => {
    const visit = (elements: Element[]): string[] =>
      elements.flatMap((element) => {
        if (element.type === 'text') return [element.text];
        if (element.type === 'group') return visit(element.children);
        return [];
      });
    for (const starter of STARTER_TEMPLATES) {
      const layers = [
        ...starter.scene.layers,
        ...(starter.scene.compositions?.flatMap((composition) => composition.layers) ?? []),
      ];
      const texts = visit(layers.flatMap((layer) => layer.children));
      expect(texts).not.toContain(
        'شهرها به‌ترتیب الفبای فارسی در صفحه‌های بعدی ادامه پیدا می‌کنند',
      );
      for (const text of texts) {
        expect(text, starter.id).not.toMatch(
          /Add folder|Inspector|Repeater|اپراتور|راهنمای استفاده/,
        );
      }
    }
  });

  it('getStarter returns the matching starter by id', () => {
    expect(getStarter('ticker')?.id).toBe('ticker');
    expect(getStarter('nope')).toBeNull();
  });

  it('guest title extends its existing animated name plate beneath the replaceable logo', () => {
    const card = getStarter('title')?.scene.compositions?.find((c) => c.id === 'comp-title-card');
    const children = card?.layers.flatMap((layer) => layer.children) ?? [];
    const plate = children.find((element) => element.id === 'tt-name-plate');
    const logo = children.find((element) => element.id === 'tt-star');
    expect(plate?.transform).toMatchObject({ position: { x: 0, y: 20 }, size: { w: 1000, h: 76 } });
    expect(logo).toMatchObject({ type: 'image', assetId: 'apasai-logo' });
    expect(plate?.animation?.tracks['scale.x']).toBeDefined();
    expect(logo?.animation?.tracks.rotation).toBeDefined();
    if (!plate || !logo) return;
    const { position: p, size: ps } = plate.transform;
    const { position: l, size: ls } = logo.transform;
    expect(l.x - p.x).toBeGreaterThanOrEqual(8);
    expect(p.x + ps.w - l.x - ls.w).toBe(12);
    expect(l.y - p.y).toBeGreaterThanOrEqual(8);
    expect(p.y + ps.h - l.y - ls.h).toBeGreaterThanOrEqual(8);
    expect(
      children.filter((element) => element.type === 'shape').map((element) => element.id),
    ).toEqual(['tt-name-plate', 'tt-role-plate']);
  });

  it('no starter carries the "New" badge (owner decision, D-119)', () => {
    for (const s of STARTER_TEMPLATES) {
      expect(s.isNew, `${s.id} must not set isNew`).toBeUndefined();
    }
  });

  it('editable-copy starters bind fields; pure picture/live-plate examples need no dummy fields', () => {
    for (const s of STARTER_TEMPLATES) {
      if (s.id === 'multibox' || s.id === 'image-folder-sequence') {
        expect(s.scene.fields).toEqual([]);
        expect(s.scene.bindings).toEqual([]);
        continue;
      }
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
      // Every entry comp is full-frame and has an explicit playback mode.
      const entry = s.scene.compositions?.find((c) => c.id === s.scene.entryCompositionId);
      expect(entry, `${s.id} has an entry composition`).toBeDefined();
      expect(entry?.resolution, `${s.id} entry comp is full-frame`).toEqual({
        width: 1920,
        height: 1080,
      });
      if (s.id !== 'multibox') {
        expect(entry?.lifecycle?.outPoint, `${s.id} has an out-point`).toBeGreaterThan(0);
      }
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
      itemEntrance: 'fade-top',
      itemExit: 'fade-top',
      itemExitOrder: 'reverse',
      itemTransitionMs: 200,
      itemExitTransitionMs: 50,
      itemStaggerMs: 30,
    });
    expect(elements(iranWeatherForecastScene).some((element) => element.type === 'repeater')).toBe(
      true,
    );

    const weatherPages = elements(iranWeatherPagesScene).find(
      (element) => element.type === 'sequence',
    );
    expect(weatherPages?.type).toBe('sequence');
    if (weatherPages?.type === 'sequence') {
      expect(weatherPages.pageDataFile).toBeUndefined();
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
      expect(weatherPages).toMatchObject({ repeat: 1, drivesHold: true, advance: 'auto' });
      expect(weatherPages.items.every((item) => item.dwellMs === 6500)).toBe(true);
      expect(
        weatherPages.items.every(
          (item) => item.kind === 'composition' && item.fieldValues?.pageTitle === undefined,
        ),
      ).toBe(true);
      expect(elements(iranWeatherPagesScene).some((item) => item.id === 'weather-page-title')).toBe(
        false,
      );
    }

    const weatherTemperature = elements(iranWeatherPagesScene).find(
      (element) => element.id === 'weather-temp',
    );
    const weatherTemperaturePill = elements(iranWeatherPagesScene).find(
      (element) => element.id === 'weather-temp-pill',
    );
    expect(weatherTemperature?.valueRules?.input).toEqual({ kind: 'field', fieldId: 'temp' });
    expect(weatherTemperaturePill?.valueRules?.input).toEqual({
      kind: 'field',
      fieldId: 'temp',
    });
    expect(weatherTemperature?.valueRules?.rules.map((rule) => rule.effect.property)).toEqual([
      'textColor',
      'textColor',
    ]);
    expect(weatherTemperaturePill?.valueRules?.rules.map((rule) => rule.effect.property)).toEqual([
      'fill',
      'fill',
    ]);
    expect(
      weatherTemperaturePill?.valueRules?.rules.every(
        (rule) => rule.effect.elementId === 'weather-temp-pill',
      ),
    ).toBe(true);
  });

  it('D-179: folder sequence ships single full-HD wide slides and manual page control', () => {
    const pictureSequence = imageFolderSequenceScene.compositions
      ?.flatMap((composition) => composition.layers)
      .flatMap((entry) => entry.children)
      .find((element) => element.type === 'sequence');
    expect(pictureSequence?.type).toBe('sequence');
    if (pictureSequence?.type === 'sequence') {
      expect(pictureSequence.items).toHaveLength(5);
      expect(pictureSequence.items.every((item) => item.kind === 'image')).toBe(true);
      expect(pictureSequence.advance).toBe('manual');
      expect(pictureSequence.transform.size).toEqual({ w: 1920, h: 1080 });
      expect(pictureSequence.name).toBe('تصاویر عریض قرآن با ترجمه');
      expect(pictureSequence.animation?.tracks.opacity?.keyframes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ frame: 100, value: 1 }),
          expect.objectContaining({ frame: 160, value: 0 }),
        ]),
      );
    }
    const images = getStarter('image-folder-sequence')?.assets?.filter(
      (asset) => asset.kind === 'image',
    );
    expect(images).toHaveLength(5);
    expect(images?.map((asset) => asset.filename)).toEqual(
      [1, 2, 3, 4, 5].map((page) => `quran-wide-${String(page).padStart(3, '0')}.png`),
    );
  });

  it('D-179: Azan countdown steps replace the timer with a persistent announcement at zero', () => {
    const clock = countdownStepsScene.compositions
      ?.flatMap((composition) => composition.layers)
      .flatMap((entry) => entry.children)
      .find((element) => element.type === 'clock');
    expect(clock?.type).toBe('clock');
    if (clock?.type === 'clock') {
      expect(clock.target?.kind).toBe('datetime');
      expect(clock.afterZero).toBe('hide-digits');
      expect(clock.drivesHold).toBe(false);
      expect(clock.steps?.steps.map((step) => step.atMs)).toEqual([
        3_600_000, 1_800_000, 600_000, 300_000, 60_000, 0,
      ]);
      expect(clock.steps?.steps.at(-1)?.changes).toEqual(
        expect.arrayContaining([
          { elementId: 'countdown-clock', property: 'visible', value: false },
          { elementId: 'countdown-zero', property: 'visible', value: true },
        ]),
      );
    }
    const onair = countdownStepsScene.compositions?.find(
      (composition) => composition.id === 'comp-countdown-steps-onair',
    );
    const entry = countdownStepsScene.compositions?.find(
      (composition) => composition.id === countdownStepsScene.entryCompositionId,
    );
    expect(countdownStepsScene.templateType).toBe('lower-third');
    expect(entry?.playout?.mode).toBe('manual');
    expect(onair?.playout?.mode).toBe('manual');
    expect(onair?.resolution).toEqual({ width: 1400, height: 164 });
    expect(entry?.layers[0]?.children[0]?.transform).toMatchObject({
      position: { x: 260, y: 820 },
      size: { w: 1400, h: 164 },
    });
    const elements = onair?.layers.flatMap((layer) => layer.children) ?? [];
    expect(elements.find((element) => element.id === 'countdown-azan-icon')).toMatchObject({
      type: 'image',
      assetId: 'countdown-azan-icon',
      fit: 'contain',
    });
    expect(elements.some((element) => element.type === 'text' && element.text === 'مغرب')).toBe(
      false,
    );
    expect(getStarter('countdown-steps')?.assets).toContainEqual({
      key: 'countdown-azan-icon',
      kind: 'image',
      filename: 'azan-mosque.svg',
      url: '/starters/assets/azan-mosque.svg',
    });
    expect(countdownStepsScene.fields.find((field) => field.id === 'eventTime')).toMatchObject({
      type: 'text',
      label: 'زمان اذان',
    });
    expect(countdownStepsScene.fields.find((field) => field.id === 'announcement')).toMatchObject({
      type: 'text',
      default: 'اذان مغرب به افق تهران',
    });
  });

  it('D-179: all five Azan warning colors are distinct, readable and ordinary editable Steps', () => {
    const onair = countdownStepsScene.compositions?.find(
      (composition) => composition.id === 'comp-countdown-steps-onair',
    );
    const elements = onair?.layers.flatMap((layer) => layer.children) ?? [];
    const clock = elements.find((element) => element.type === 'clock');
    if (clock?.type !== 'clock') throw new Error('Missing Azan countdown');
    const thresholds = clock.steps?.steps.filter((step) => step.atMs > 0) ?? [];
    const colors = thresholds.map((step) => {
      const change = step.changes?.find(
        (entry) => entry.elementId === 'countdown-clock-bg' && entry.property === 'fill',
      );
      if (change?.property !== 'fill' || typeof change.value !== 'string')
        throw new Error(`Missing editable plate color for ${step.name}`);
      expect(step.changes).toContainEqual({
        elementId: 'countdown-clock',
        property: 'textColor',
        value: '#FFFFFF',
      });
      // White digits stay readable at every threshold, not only in the initial screenshot.
      const linear = (channel: number): number => {
        const value = channel / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      };
      const luminance = (
        [
          [1, 0.2126],
          [3, 0.7152],
          [5, 0.0722],
        ] as const
      ).reduce(
        (sum, [start, weight]) =>
          sum + weight * linear(Number.parseInt(change.value.slice(start, start + 2), 16)),
        0,
      );
      expect(1.05 / (luminance + 0.05), step.name).toBeGreaterThan(4.5);
      return change.value;
    });
    expect(new Set(colors).size).toBe(5);
    const plate = elements.find((element) => element.id === 'countdown-bg');
    expect(plate).toMatchObject({
      type: 'shape',
      fill: {
        kind: 'linear',
        stops: [
          { at: 0, color: '#111326F7' },
          { at: 1, color: '#2C2C51EC' },
        ],
      },
      stroke: { color: '#C4CBFF40', width: 1 },
      shadow: { offsetX: 0, offsetY: 10, blur: 24, color: '#07081A7A' },
    });
    expect(elements.find((element) => element.id === 'countdown-glass-highlight')).toMatchObject({
      type: 'shape',
      fill: {
        kind: 'linear',
        stops: [
          { at: 0, color: '#AFB5FF0A' },
          { at: 1, color: '#A59DFF2B' },
        ],
      },
    });
  });

  it('D-179: multibox carries switchable 1–4 plate looks with equal boxes per look', () => {
    const entry = multiboxScene.compositions?.find(
      (composition) => composition.id === multiboxScene.entryCompositionId,
    );
    expect(entry?.lookGroups?.[0]?.looks).toHaveLength(4);
    expect(entry?.lookGroups?.[0]?.defaultLookId).toBe('multibox-look-4');
    expect(entry?.playout?.mode).toBe('static');
    expect(entry?.lifecycle).toBeUndefined();

    for (const [index, count] of [1, 2, 3, 4].entries()) {
      const composition = multiboxScene.compositions?.find(
        (candidate) => candidate.id === `comp-multibox-look-${String(count)}`,
      );
      expect(composition?.playout?.mode).toBe('static');
      expect(composition?.lifecycle).toBeUndefined();
      const liveSources = composition?.layers
        .flatMap((layer) => layer.children)
        .filter((element) => element.type === 'video-placeholder');
      expect(liveSources, `look ${String(index + 1)} plate count`).toHaveLength(count);
      expect(new Set(liveSources?.map((element) => element.routeKey)).size).toBe(count);
      expect(new Set(liveSources?.map((element) => element.transform.size.w)).size).toBe(1);
      expect(new Set(liveSources?.map((element) => element.transform.size.h)).size).toBe(1);
      expect(
        composition?.layers
          .flatMap((layer) => layer.children)
          .every((element) => element.type === 'video-placeholder'),
      ).toBe(true);
      if (count === 1)
        expect(liveSources?.[0]?.transform).toMatchObject({
          position: { x: 0, y: 0 },
          size: { w: 1920, h: 1080 },
        });
      if (count === 3) {
        expect(liveSources?.[0]?.transform.position.y).toBe(liveSources?.[1]?.transform.position.y);
        expect(liveSources?.[2]?.transform.position.y).toBeGreaterThan(
          liveSources?.[0]?.transform.position.y ?? 0,
        );
      }
    }
  });

  it('D-179: weather choices are bound to visible text and ordinary image rules', () => {
    for (const scene of [iranWeatherPagesScene, iranWeatherForecastScene]) {
      const composition = scene.compositions?.find((comp) =>
        comp.fields?.some((field) => field.id === 'weatherType'),
      );
      const field = composition?.fields?.find((candidate) => candidate.id === 'weatherType');
      expect(field?.type).toBe('select');
      if (field?.type !== 'select') continue;
      expect(field.options.map((option) => option.value)).toEqual([
        'آفتابی',
        'ابری',
        'بارانی',
        'برفی',
        'نیمه‌ابری',
      ]);
      const binding = composition?.bindings?.find((candidate) => candidate.fieldId === field.id);
      expect(binding?.target.kind).toBe('text');
      const elements = composition?.layers.flatMap((layer) => layer.children) ?? [];
      const icon = elements.find((element) => element.type === 'image');
      expect(icon?.valueRules?.input).toEqual({ kind: 'field', fieldId: 'weatherType' });
      expect(icon?.valueRules?.rules.map((rule) => rule.condition)).toEqual(
        field.options.map((option) => ({ comparator: '=', value: option.value })),
      );
      expect(elements.some((element) => element.id.includes('rain-unit'))).toBe(false);
      expect(composition?.fields?.some((candidate) => candidate.id === 'rain')).toBe(false);
    }
  });

  it('D-179: forecast daily maximum/minimum have equal typography and separate Persian labels', () => {
    const card = iranWeatherForecastScene.compositions?.find(
      (comp) => comp.id === 'comp-weather-forecast-card',
    );
    const elements = card?.layers.flatMap((layer) => layer.children) ?? [];
    const high = elements.find((element) => element.id === 'forecast-high');
    const low = elements.find((element) => element.id === 'forecast-low');
    expect(high?.type).toBe('text');
    expect(low?.type).toBe('text');
    if (high?.type !== 'text' || low?.type !== 'text') return;
    expect(high.font.size).toBe(52);
    expect(low.font.size).toBe(high.font.size);
    expect(low.font.weight).toBe(high.font.weight);
    expect(low.transform.position.y).toBe(high.transform.position.y);
    expect(low.transform.size).toEqual(high.transform.size);
    expect(high.align).toBe('end');
    expect(low.align).toBe('end');
    expect(high.backgroundColor).toBeUndefined();
    expect(low.backgroundColor).toBeUndefined();
    expect(high.color).toBe('#F43358');
    expect(low.color).toBe('#3C8DEA');
    for (const [kind, label] of [
      ['high', 'بیشینه'],
      ['low', 'کمینه'],
    ] as const) {
      expect(elements.find((element) => element.id === `forecast-${kind}-degree`)).toMatchObject({
        type: 'text',
        text: '°',
      });
      const value = kind === 'high' ? high : low;
      expect(elements.find((element) => element.id === `forecast-${kind}-label`)).toMatchObject({
        type: 'text',
        text: label,
        align: 'center',
        transform: {
          position: { x: value.transform.position.x + 24 },
          size: { w: value.transform.size.w },
        },
      });
    }
    expect(elements.some((element) => element.id === 'forecast-labels')).toBe(false);
    for (const element of elements) {
      expect(
        element.transform.position.y + element.transform.size.h,
        element.id,
      ).toBeLessThanOrEqual(card?.resolution.height ?? 0);
    }
  });

  it('D-179: league ranks derive from row order and its points column has no special plate', () => {
    const row = iranPremierLeagueScene.compositions?.find(
      (comp) => comp.id === 'comp-iran-premier-league-row',
    );
    const rank = row?.layers
      .flatMap((layer) => layer.children)
      .find((element) => element.id === 'az-rank');
    const points = row?.layers
      .flatMap((layer) => layer.children)
      .find((element) => element.id === 'az-points');
    expect(rank).toMatchObject({ type: 'text', rowNumber: true, digits: 'persian' });
    expect(row?.fields?.some((field) => field.id === 'rank')).toBe(false);
    expect(row?.bindings?.some((binding) => binding.fieldId === 'rank')).toBe(false);
    expect(row?.fields?.find((field) => field.id === 'team')).toMatchObject({
      operatorEditable: false,
    });
    expect(row?.fields?.find((field) => field.id === 'logo')).not.toHaveProperty(
      'operatorEditable',
    );
    expect(row?.fields?.find((field) => field.id === 'wins')).not.toHaveProperty(
      'operatorEditable',
    );
    expect(points?.type === 'text' ? points.backgroundColor : undefined).toBeUndefined();
    expect(
      getStarter('iran-premier-league')?.assets?.filter((asset) => asset.key.startsWith('league-')),
    ).toHaveLength(18);
    expect(
      getStarter('iran-premier-league')?.assets?.find((asset) => asset.key === 'league-zwlji1u1'),
    ).toMatchObject({
      filename: 'پرسپولیس.png',
      url: '/starters/assets/league-zwlji1u1.png',
    });
    expect(
      getStarter('iran-premier-league')?.assets?.find((asset) => asset.key === 'league-gzueny5i'),
    ).toMatchObject({
      filename: 'مس شهر بابک.png',
      url: '/starters/assets/league-gzueny5i.png',
    });
  });

  it('D-179: league fits all rows, has enough stagger time and fades its entire navy/slate backdrop', () => {
    const entry = iranPremierLeagueScene.compositions?.find(
      (composition) => composition.id === iranPremierLeagueScene.entryCompositionId,
    );
    const elements = entry?.layers.flatMap((layer) => layer.children) ?? [];
    const panel = elements.find((element) => element.id === 'az-bg');
    const repeater = elements.find((element) => element.id === 'az-table-repeater');
    expect(panel).toBeDefined();
    expect(repeater?.type).toBe('repeater');
    if (panel === undefined || repeater?.type !== 'repeater' || entry === undefined) return;
    expect(repeater.items).toHaveLength(18);
    const row = iranPremierLeagueScene.compositions?.find(
      (composition) => composition.id === repeater.compositionId,
    );
    const rowHeight = row?.resolution.height ?? 0;
    expect(rowHeight).toBeGreaterThan(0);
    const rowsHeight =
      repeater.items.length * rowHeight + (repeater.items.length - 1) * repeater.gap;
    const bottom = repeater.transform.position.y + rowsHeight;
    expect(bottom).toBeLessThan(panel.transform.position.y + panel.transform.size.h - 20);
    expect(bottom).toBeLessThan(entry.resolution.height);
    expect(rowsHeight).toBeLessThanOrEqual(repeater.transform.size.h);
    const cascadeFrames =
      (((repeater.items.length - 1) * (repeater.itemStaggerMs ?? 0) +
        (repeater.itemTransitionMs ?? 0)) *
        iranPremierLeagueScene.frameRate) /
      1000;
    const outPoint = entry.lifecycle?.outPoint ?? 0;
    expect(outPoint - (entry.lifecycle?.contentStart ?? 0)).toBeGreaterThanOrEqual(cascadeFrames);
    expect(entry.frameRange.out - outPoint).toBeGreaterThanOrEqual(cascadeFrames);
    expect(panel).toMatchObject({
      fill: { kind: 'linear', stops: [{ color: '#111B2C37' }, { color: '#172337E3' }] },
    });
    // The owner's newer scrim intentionally reaches zero at Hold, so only the
    // backgrounds still visible on Hold participate in the subsequent fade-out.
    for (const id of ['az-stadium-bg', 'az-bg', 'az-head-bg']) {
      const element = elements.find((candidate) => candidate.id === id);
      const frames = element?.animation?.tracks.opacity?.keyframes ?? [];
      expect(
        frames.find((frame) => frame.frame === outPoint)?.value,
        `${id} holds before exit`,
      ).toBe(element?.opacity);
      expect(frames.at(-1), `${id} visible authored fade`).toMatchObject({
        frame: entry.frameRange.out,
        value: 0,
      });
    }
  });

  it('D-179: league preserves the owner-saved heading and newer scrim keyframes', () => {
    const entry = iranPremierLeagueScene.compositions?.find(
      (composition) => composition.id === iranPremierLeagueScene.entryCompositionId,
    );
    const elements = entry?.layers.flatMap((layer) => layer.children) ?? [];
    expect(
      elements.some((element) => element.id === 'az-kicker' || element.id === 'az-kicker-label'),
    ).toBe(false);
    const title = elements.find((element) => element.id === 'az-title');
    expect(title).toMatchObject({
      type: 'text',
      align: 'center',
      font: { size: 27 },
      transform: { position: { x: 664.75, y: 104 }, size: { w: 550.5, h: 56 } },
    });
    const bar = elements.find((element) => element.id === 'az-title-glow');
    expect(bar?.transform).toMatchObject({
      position: { x: 130, y: 102 },
      size: { w: 1660, h: 56 },
    });
    for (const element of [title, bar]) {
      expect(
        element?.animation?.tracks['position.y']?.keyframes.find((frame) => frame.frame === 84),
      ).toMatchObject({
        value: 104,
        easing: 'linear',
      });
    }
    expect(
      elements
        .find((element) => element.id === 'az-bg-scrim')
        ?.animation?.tracks.opacity?.keyframes.map(({ frame, value, easing }) => ({
          frame,
          value,
          easing,
        })),
    ).toEqual([
      { frame: 0, value: 0, easing: 'ease-out' },
      { frame: 20, value: 0.64, easing: 'ease-out' },
      { frame: 110, value: 0, easing: 'linear' },
      { frame: 200, value: 0, easing: 'ease-out' },
    ]);
    expect(entry?.bindings).toHaveLength(2);
  });

  it('D-179: city weather waits for one complete page pass then fades every non-content element', () => {
    const entry = iranWeatherPagesScene.compositions?.find(
      (composition) => composition.id === iranWeatherPagesScene.entryCompositionId,
    );
    expect(entry?.playout).toMatchObject({ mode: 'auto-out', holdSource: 'content-driven' });
    const elements = entry?.layers.flatMap((layer) => layer.children) ?? [];
    for (const element of elements.filter((candidate) => candidate.type !== 'sequence')) {
      const frames = element.animation?.tracks.opacity?.keyframes ?? [];
      expect(frames.length, `${element.id} has an authored opacity exit`).toBeGreaterThanOrEqual(4);
      expect(frames.at(-1)?.value, `${element.id} fades fully`).toBe(0);
      expect(frames.at(-1)?.frame, `${element.id} fits outro`).toBeLessThanOrEqual(
        entry?.frameRange.out ?? 0,
      );
    }
    expect(
      iranWeatherPagesScene.compositions?.some((composition) =>
        composition.fields?.some((field) => field.id === 'pageTitle'),
      ),
    ).toBe(false);
  });

  it('Persian defaults are non-empty RTL copy', () => {
    for (const s of STARTER_TEMPLATES) {
      if (s.id === 'multibox' || s.id === 'image-folder-sequence') continue;
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
      if (s.id !== 'multibox' && s.id !== 'image-folder-sequence') {
        expect(textBindings.length, `${s.id} has text bindings`).toBeGreaterThan(0);
      }

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
