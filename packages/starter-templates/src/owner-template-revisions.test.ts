import type { Composition, Element, Scene } from '@cg/shared-schema';
import { describe, expect, it } from 'vitest';
import { iranPremierLeagueScene, iranWeatherForecastScene, iribNewsScene } from './index.js';

function entry(scene: Scene): Composition {
  const composition = scene.compositions?.find((candidate) => candidate.id === scene.entryCompositionId);
  if (composition === undefined) throw new Error(`Missing entry composition for ${scene.id}`);
  return composition;
}

function element(scene: Scene, id: string): Element {
  const result = scene.compositions
    ?.flatMap((composition) => composition.layers)
    .flatMap((layer) => layer.children)
    .find((item) => item.id === id);
  if (result === undefined) throw new Error(`Missing ${id} in ${scene.id}`);
  return result;
}

describe('D-179 — owner-saved starter revisions from 2026-11-08', () => {
  it('adopts the saved lower-third headline source, logo separator and title motion', () => {
    const crawl = element(iribNewsScene, 'ir-crawl');
    const program = element(iribNewsScene, 'ir-program');
    const logo = element(iribNewsScene, 'ir-star');
    const rotator = element(iribNewsScene, 'ir-rotator');
    const headlines = iribNewsScene.fields?.find((field) => field.id === 'headlines');

    expect(crawl).toMatchObject({
      type: 'ticker',
      separator: {
        kind: 'image',
        assetId: 'apasai-logo',
        source: 'project',
        size: { w: 50, h: 50 },
      },
    });
    expect(program).toMatchObject({
      type: 'text',
      text: 'خبر فوری',
      transform: { size: { w: 791, h: 42 } },
    });
    expect(program.animation?.tracks['position.x']?.keyframes).toMatchObject([
      { frame: 36, value: 44 },
      { frame: 60, value: 656, easing: 'linear' },
      { frame: 112, value: 662, easing: 'linear' },
    ]);
    expect(logo.transform).toMatchObject({ position: { x: 1474, y: 8 }, size: { w: 66, h: 42 } });
    expect(rotator).toMatchObject({ type: 'sequence', operatorSteps: false });
    expect(headlines).toMatchObject({
      type: 'list',
      digits: 'persian',
      allowFileSource: true,
      fileSource: {
        inputMode: 'file-only',
        bridgePath: 'اخبار.txt',
        lockFile: true,
        delimiter: '\n',
      },
    });
  });

  it('adopts the saved forecast exit timing and horizontal card motion', () => {
    const weatherEntry = entry(iranWeatherForecastScene);
    const ribbon = element(iranWeatherForecastScene, 'forecast-title-ribbon');
    const title = element(iranWeatherForecastScene, 'forecast-title');
    const photo = element(iranWeatherForecastScene, 'forecast-photo-bg');
    const panel = element(iranWeatherForecastScene, 'forecast-bg');
    const repeater = element(iranWeatherForecastScene, 'forecast-repeater');
    const footerPanel = element(iranWeatherForecastScene, 'forecast-footer-bg');
    const footer = element(iranWeatherForecastScene, 'forecast-footer');

    expect(weatherEntry.playout).toEqual({
      mode: 'auto-out',
      holdSource: 'timed',
      holdBehavior: 'freeze',
      holdMs: 10_000,
    });
    expect(ribbon.animation?.tracks['position.y']?.keyframes).toMatchObject([
      { frame: 0, value: 152 },
      { frame: 20, value: 132 },
      { frame: 100, value: 132 },
      { frame: 130, value: 148 },
    ]);
    expect(title.animation?.tracks['position.y']?.keyframes).toMatchObject([
      { frame: 4, value: 162 },
      { frame: 20, value: 142 },
      { frame: 100, value: 142 },
      { frame: 130, value: 158 },
    ]);
    expect(photo.animation?.tracks.opacity?.keyframes).toMatchObject([
      { frame: 130, value: 1, easing: 'linear' },
      { frame: 160, value: 0, easing: 'linear' },
    ]);
    expect(panel.animation?.tracks.opacity?.keyframes).toMatchObject([
      { frame: 130, value: 0.8, easing: 'linear' },
      { frame: 160, value: 0, easing: 'linear' },
    ]);
    expect(repeater).toMatchObject({
      type: 'repeater',
      itemEntrance: 'fade-left',
      itemExit: 'fade-right',
      itemTransitionMs: 1000,
      itemStaggerMs: 200,
    });
    for (const item of [footerPanel, footer]) {
      expect(item.animation?.tracks.opacity?.keyframes).toMatchObject([
        { frame: 105, value: 1, easing: 'linear' },
        { frame: 130, value: 0, easing: 'linear' },
      ]);
    }
  });

  it('exposes all saved league logos and preserves the owner file source', () => {
    const row = iranPremierLeagueScene.compositions?.find(
      (composition) => composition.id === 'comp-iran-premier-league-row',
    );
    const logo = row?.fields?.find((field) => field.id === 'logo');
    const teams = entry(iranPremierLeagueScene).fields?.find((field) => field.id === 'teams');

    expect(logo).toMatchObject({
      type: 'image',
      defaultAssetId: 'league-zwlji1u1',
    });
    expect(logo).not.toHaveProperty('operatorEditable');
    expect(logo?.type === 'image' ? logo.assetOptions : undefined).toHaveLength(18);
    expect(logo?.type === 'image' ? logo.assetOptions : undefined).toEqual(
      expect.arrayContaining([
        { assetId: 'league-zwlji1u1', label: 'پرسپولیس.png', source: 'project' },
        { assetId: 'league-gzueny5i', label: 'مس شهر بابک.png', source: 'project' },
      ]),
    );
    expect(teams).toMatchObject({
      type: 'list',
      label: 'ردیف‌های جدول',
      fileSource: {
        inputMode: 'operator-choice',
        format: 'csv',
        bridgePath: 'ردیف-های-جدول-rows.sample.xlsx',
        lockFile: true,
      },
    });
    expect(teams).not.toHaveProperty('maxItems');
  });
});
