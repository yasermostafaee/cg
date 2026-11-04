import { describe, expect, it } from 'vitest';
import { type Element, type Scene, SceneSchema } from '@cg/shared-schema';
import {
  getStarter,
  iranWeatherCardsScene,
  iranWeatherForecastScene,
  iranWeatherPagesScene,
  STARTER_TEMPLATES,
} from './index.js';
import { WEATHER_CHOICES } from './weather-icons.js';

type Composition = NonNullable<Scene['compositions']>[number];

function composition(scene: Scene, id = scene.entryCompositionId): Composition {
  const result = scene.compositions?.find((candidate) => candidate.id === id);
  if (result === undefined) throw new Error(`Missing composition ${id}`);
  return result;
}

function elements(comp: Composition): Element[] {
  return comp.layers.flatMap((layer) => layer.children);
}

function element(comp: Composition, id: string): Element {
  const result = elements(comp).find((candidate) => candidate.id === id);
  if (result === undefined) throw new Error(`Missing element ${id}`);
  return result;
}

const variants = [
  {
    id: 'iran-weather-cards',
    scene: iranWeatherCardsScene,
    cardId: 'comp-iran-weather-city-card',
    cardWidth: 384,
    iconId: 'weather-icon',
    iconSize: 230,
    conditionId: 'weather-condition',
    photoId: 'weather-pages-photo-bg',
  },
] as const;

describe('D-179 — additional broadcast weather styles', () => {
  it('keeps degree signs next to end-aligned numeric fields using ordinary editable text', () => {
    for (const [scene, cardId, numberId, degreeId] of [
      [iranWeatherPagesScene, 'comp-iran-weather-city-row', 'weather-temp', 'weather-degree'],
      [iranWeatherCardsScene, 'comp-iran-weather-city-card', 'weather-temp', 'weather-degree'],
      [
        iranWeatherForecastScene,
        'comp-weather-forecast-card',
        'forecast-high',
        'forecast-high-degree',
      ],
      [
        iranWeatherForecastScene,
        'comp-weather-forecast-card',
        'forecast-low',
        'forecast-low-degree',
      ],
    ] as const) {
      const card = composition(scene, cardId);
      const value = element(card, numberId);
      const degree = element(card, degreeId);
      expect(value).toMatchObject({ type: 'text', align: 'end', direction: 'ltr' });
      expect(degree).toMatchObject({ type: 'text', text: '°', align: 'start', direction: 'ltr' });
      const gap = degree.transform.position.x - value.transform.position.x - value.transform.size.w;
      expect(gap).toBeGreaterThanOrEqual(2);
      expect(gap).toBeLessThanOrEqual(3);
      const binding = card.bindings?.find(
        (candidate) => candidate.target.kind === 'text' && candidate.target.elementId === numberId,
      );
      expect(binding?.target).toEqual({ kind: 'text', elementId: numberId });
      expect(card.fields?.find((field) => field.id === binding?.fieldId)).toMatchObject({
        type: 'number',
        digits: 'persian',
      });
    }
  });

  it('keeps the city-card addition and both originals, without the declined forecast variant', () => {
    expect(STARTER_TEMPLATES).toHaveLength(12);
    expect(new Set(STARTER_TEMPLATES.map((starter) => starter.id)).size).toBe(12);
    expect(getStarter('iran-weather-outlook')).toBeNull();
    expect(getStarter('iran-weather-pages')?.scene).toBe(iranWeatherPagesScene);
    expect(getStarter('iran-weather-forecast')?.scene).toBe(iranWeatherForecastScene);
    const oldSequence = element(composition(iranWeatherPagesScene), 'weather-pages-sequence');
    if (oldSequence.type !== 'sequence') throw new Error('Original city Sequence was replaced');
    expect(oldSequence.items).toHaveLength(4);
    expect(composition(iranWeatherForecastScene, 'comp-weather-forecast-card').resolution).toEqual({
      width: 296,
      height: 460,
    });
    for (const originalId of ['iran-weather-pages', 'iran-weather-forecast']) {
      expect(
        getStarter(originalId)?.assets?.some((asset) => asset.key === 'weather-atmosphere'),
      ).toBe(true);
      expect(
        getStarter(originalId)?.assets?.some((asset) => asset.key === 'weather-broadcast-sky'),
      ).toBe(false);
    }
  });

  it('registers unique scene and font identities with the new sky and coherent icon assets', () => {
    for (const variant of variants) {
      const starter = getStarter(variant.id);
      expect(starter?.scene).toBe(variant.scene);
      expect(variant.scene.id).toBe(`starter-${variant.id}`);
      expect(variant.scene.entryCompositionId).toBe(`comp-${variant.id}`);
      expect(() => SceneSchema.parse(variant.scene)).not.toThrow();
      expect(variant.scene.fonts?.[0]?.family).toBe(`asset-${variant.id}-vazir`);
      expect(starter?.assets).toContainEqual({
        key: `${variant.id}-vazir`,
        kind: 'font',
        filename: 'Vazirmatn.woff2',
        url: '/fonts/vazirmatn/vazirmatn-arabic-500-normal.woff2',
      });
      expect(starter?.assets).toContainEqual({
        key: 'weather-broadcast-sky',
        kind: 'image',
        filename: 'weather-sky-broadcast.png',
        url: '/starters/assets/weather-sky-broadcast.png',
      });
      expect(element(composition(variant.scene), variant.photoId)).toMatchObject({
        type: 'image',
        assetId: 'weather-broadcast-sky',
      });
      for (const { icon } of WEATHER_CHOICES) {
        expect(starter?.assets).toContainEqual({
          key: `weather-${icon}`,
          kind: 'image',
          filename: `weather-${icon}.svg`,
          url: `/starters/assets/weather-${icon}.svg`,
        });
      }
    }
  });

  it('authors large portrait cards with every child inside its composition bounds', () => {
    for (const variant of variants) {
      const card = composition(variant.scene, variant.cardId);
      expect(card.resolution).toEqual({ width: variant.cardWidth, height: 600 });
      expect(element(card, variant.iconId).transform.size).toEqual({
        w: variant.iconSize,
        h: variant.iconSize,
      });
      // These are authored-coordinate invariants, not a claim about browser layout.
      for (const comp of variant.scene.compositions ?? []) {
        for (const child of elements(comp)) {
          const { position, size, scale, anchor, rotation } = child.transform;
          expect(scale, child.id).toEqual({ x: 1, y: 1 });
          expect(anchor, child.id).toEqual({ x: 0, y: 0 });
          expect(rotation, child.id).toBe(0);
          expect(position.x, child.id).toBeGreaterThanOrEqual(0);
          expect(position.y, child.id).toBeGreaterThanOrEqual(0);
          expect(position.x + size.w, child.id).toBeLessThanOrEqual(comp.resolution.width);
          expect(position.y + size.h, child.id).toBeLessThanOrEqual(comp.resolution.height);
        }
      }
    }
  });

  it('fits four RTL city cards per page and preserves all 31 capitals over eight finite pages', () => {
    const root = composition(iranWeatherCardsScene);
    const sequence = element(root, 'weather-pages-sequence');
    if (sequence.type !== 'sequence') throw new Error('Missing city Sequence');
    expect(root.playout).toMatchObject({ mode: 'auto-out', holdSource: 'content-driven' });
    expect(sequence).toMatchObject({
      advance: 'auto',
      repeat: 1,
      drivesHold: true,
      defaultDwellMs: 6500,
    });
    expect(sequence.items).toHaveLength(8);
    const rows = sequence.items.map((item) => {
      if (item.kind !== 'composition') throw new Error('A city page is not a composition');
      expect(item.compositionId).toBe('comp-iran-weather-cards-page');
      expect(item.dwellMs).toBe(6500);
      return item.fieldValues?.cities;
    });
    expect(rows.map((page) => (Array.isArray(page) ? page.length : -1))).toEqual([
      4, 4, 4, 4, 4, 4, 4, 3,
    ]);
    const names = rows.flatMap((page) =>
      Array.isArray(page)
        ? page.map((row: unknown) => {
            if (
              row === null ||
              typeof row !== 'object' ||
              !('city' in row) ||
              typeof row.city !== 'string'
            ) {
              throw new Error('A city row has no readable city name');
            }
            return row.city;
          })
        : [],
    );
    expect(names).toEqual([
      'اراک',
      'اردبیل',
      'ارومیه',
      'اصفهان',
      'اهواز',
      'ایلام',
      'بجنورد',
      'بندرعباس',
      'بوشهر',
      'بیرجند',
      'تبریز',
      'تهران',
      'خرم‌آباد',
      'رشت',
      'زاهدان',
      'زنجان',
      'ساری',
      'سمنان',
      'سنندج',
      'شهرکرد',
      'شیراز',
      'قزوین',
      'قم',
      'کرج',
      'کرمان',
      'کرمانشاه',
      'گرگان',
      'مشهد',
      'همدان',
      'یاسوج',
      'یزد',
    ]);
    expect(new Set(names).size).toBe(31);
    const page = composition(iranWeatherCardsScene, 'comp-iran-weather-cards-page');
    const repeater = element(page, 'weather-page-repeater');
    if (repeater.type !== 'repeater') throw new Error('Missing city Repeater');
    expect(repeater).toMatchObject({
      compositionId: 'comp-iran-weather-city-card',
      direction: 'row',
      flow: 'rtl',
      gap: 24,
      maxItems: 4,
      itemEntrance: 'fade-right',
      itemExit: 'fade-left',
    });
    expect(384 * 4 + repeater.gap * 3).toBe(repeater.transform.size.w);
    expect(repeater.transform.size.h).toBe(600);
    expect(page.fields?.find((field) => field.id === 'cities')).toMatchObject({
      type: 'list',
      maxItems: 4,
      allowFileSource: true,
    });
  });

  it('keeps weather choices visibly bound and uses ordinary image rules in the city cards', () => {
    for (const variant of variants) {
      const card = composition(variant.scene, variant.cardId);
      const field = card.fields?.find((candidate) => candidate.id === 'weatherType');
      if (field?.type !== 'select') throw new Error('Missing visible weather Choice list');
      expect(field.options).toEqual(WEATHER_CHOICES.map(({ value, label }) => ({ value, label })));
      expect(card.bindings).toContainEqual({
        fieldId: field.id,
        target: { kind: 'text', elementId: variant.conditionId },
      });
      const icon = element(card, variant.iconId);
      expect(icon).toMatchObject({ type: 'image', assetId: 'weather-clear-day' });
      expect(icon.valueRules?.input).toEqual({ kind: 'field', fieldId: field.id });
      expect(icon.valueRules?.rules).toEqual(
        WEATHER_CHOICES.map(({ value, icon: asset }) => ({
          condition: { comparator: '=', value },
          effect: {
            elementId: variant.iconId,
            property: 'image',
            value: { assetId: `weather-${asset}`, source: 'project' },
          },
        })),
      );
    }
  });

  it('uses ordinary visible closing keys for every non-content root element', () => {
    for (const variant of variants) {
      const root = composition(variant.scene);
      for (const child of elements(root)) {
        if (child.type === 'repeater' || child.type === 'sequence') continue;
        const keys = child.animation?.tracks.opacity?.keyframes;
        expect(keys?.[0]?.value, child.id).toBe(0);
        expect(keys?.[0]?.frame, child.id).toBeGreaterThanOrEqual(0);
        expect(keys?.[0]?.frame, child.id).toBeLessThan(root.lifecycle?.contentStart ?? 20);
        expect(keys?.at(-1)?.value, child.id).toBe(0);
        expect(keys?.at(-1)?.frame, child.id).toBeGreaterThan(root.lifecycle?.outPoint ?? 0);
        expect(keys?.at(-1)?.frame, child.id).toBeLessThanOrEqual(root.frameRange.out);
      }
      expect(
        element(root, variant.photoId).animation?.tracks.opacity?.keyframes.map(
          ({ frame, value }) => [frame, value],
        ),
      ).toEqual([
        [0, 0],
        [16, 1],
        [100, 1],
        [160, 0],
      ]);
    }
  });

  it('keeps the new city cards free of page counters and unexplained percentages', () => {
    for (const variant of variants) {
      const all = variant.scene.compositions?.flatMap(elements) ?? [];
      const visibleText = all.filter((child) => child.type === 'text').map((child) => child.text);
      expect(visibleText.join('\n')).not.toMatch(/به‌روزرسانی|صفحه|٪|%|درصد/);
      expect(
        variant.scene.compositions
          ?.flatMap((comp) => comp.fields ?? [])
          .some((field) => field.id === 'rain' || field.id === 'pageTitle'),
      ).toBe(false);
    }
  });
});
