import { statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  imageFolderSequenceScene,
  iranPremierLeagueScene,
  iranWeatherForecastScene,
  iribNewsScene,
  STARTER_TEMPLATES,
} from '@cg/starter-templates';
import { rewriteStarterAssetRefs } from '../src/platform/starter-asset-refs.js';

describe('starter asset reference rewrite', () => {
  it.each(['project', 'shared'] as const)(
    'B-417: resolves the bundled ticker separator without rewriting a %s reference incorrectly',
    (source) => {
      const scene = structuredClone(iribNewsScene);
      const ticker = scene.compositions
        ?.flatMap((comp) => comp.layers)
        .flatMap((layer) => layer.children)
        .find((element) => element.id === 'ir-crawl');
      if (ticker?.type !== 'ticker' || typeof ticker.separator !== 'object')
        throw new Error('Missing clock ticker separator');
      const bundledId = ticker.separator.assetId;
      ticker.separator.source = source;
      rewriteStarterAssetRefs(scene, new Map([[bundledId, 'local-separator']]), new Map());
      expect(ticker.separator.assetId).toBe(source === 'project' ? 'local-separator' : bundledId);
    },
  );

  it('remaps image rules and repeated image values as well as authored defaults', () => {
    const weather = structuredClone(iranWeatherForecastScene);
    rewriteStarterAssetRefs(weather, new Map([['weather-rain', 'imported-rain']]), new Map());
    const rule = weather.compositions
      ?.flatMap((comp) => comp.layers)
      .flatMap((layer) => layer.children)
      .flatMap((element) => element.valueRules?.rules ?? [])
      .find(
        (candidate) =>
          candidate.condition.comparator === '=' && candidate.condition.value === 'بارانی',
      );
    expect(rule?.effect).toMatchObject({ property: 'image', value: { assetId: 'imported-rain' } });
    const league = structuredClone(iranPremierLeagueScene);
    rewriteStarterAssetRefs(
      league,
      new Map([['league-zwlji1u1', 'imported-team-logo']]),
      new Map(),
    );
    const repeater = league.compositions
      ?.flatMap((comp) => comp.layers)
      .flatMap((layer) => layer.children)
      .find((element) => element.type === 'repeater');
    expect(repeater?.type === 'repeater' ? repeater.items[0] : undefined).toMatchObject({
      logo: { assetId: 'imported-team-logo' },
    });
    expect(league.fields.find((field) => field.id === 'teams')).toMatchObject({
      default: expect.arrayContaining([
        expect.objectContaining({ logo: { assetId: 'imported-team-logo' } }),
      ]),
    });
  });
  it('ships one compact smooth WebM excerpt for every gallery card', () => {
    for (const starter of STARTER_TEMPLATES) {
      expect(starter.motionPreview, `${starter.id} declares a motion preview`).toMatch(
        /^\/starters\/motion\/.+\.webm$/,
      );
      const relative = starter.motionPreview?.slice(1);
      if (relative === undefined) continue;
      const size = statSync(join(process.cwd(), 'public', relative)).size;
      expect(size, `${starter.id} motion preview is not empty`).toBeGreaterThan(5_000);
      expect(size, `${starter.id} smooth motion preview stays lightweight`).toBeLessThan(180_000);
    }
  });

  it('rewrites a starter sequence picture list and its bundled font', () => {
    const scene = structuredClone(imageFolderSequenceScene);
    rewriteStarterAssetRefs(
      scene,
      new Map([
        ['gallery-slide-1', 'project-image-1'],
        ['gallery-slide-2', 'project-image-2'],
        ['gallery-slide-3', 'project-image-3'],
        ['gallery-slide-4', 'project-image-4'],
        ['gallery-slide-5', 'project-image-5'],
      ]),
      new Map([['asset-image-folder-sequence-vazir', 'asset-project-font']]),
    );

    const sequence = scene.compositions
      ?.flatMap((composition) => composition.layers)
      .flatMap((layer) => layer.children)
      .find((element) => element.type === 'sequence');
    expect(sequence?.type).toBe('sequence');
    if (sequence?.type !== 'sequence') return;
    expect(
      sequence.items.map((item) => (item.kind === 'image' ? item.assetId : undefined)),
    ).toEqual([
      'project-image-1',
      'project-image-2',
      'project-image-3',
      'project-image-4',
      'project-image-5',
    ]);
    expect(sequence.font.family).toBe('asset-project-font');
    expect(scene.fonts[0]?.family).toBe('asset-project-font');
  });
});
